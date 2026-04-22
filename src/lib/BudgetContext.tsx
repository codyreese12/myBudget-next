'use client';

import {
  createContext, useContext, useState, useEffect, useCallback,
  useRef, type ReactNode,
} from 'react';
import type { Transaction, Category, Budget, CarryOver, MerchantRules, Goal, DateRange, ChangeHistoryEntry, SplitRule, SplitRules } from './types';
import {
  loadTransactions, saveTransactions,
  loadCategories, saveCategories,
  loadFlatBudget, saveFlatBudget,
  loadCarryOver, saveCarryOver,
  loadDarkMode, saveDarkMode,
  loadMerchantRules, addMerchantRule, deleteMerchantRule, updateMerchantRule,
  loadSplitRules, addSplitRule, removeSplitRule,
} from './storage';
import { DEFAULT_CATEGORIES, DEFAULT_BUDGETS } from './constants';
import { autoCategorizeAll, aiCategorizeUnknown, applyLearnedRules, isTransfer } from './autoCategory';

// ── Recurring transaction detection ───────────────────────────────────────────
function normalizeDesc(d: string): string {
  return (d || '').toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
}

const VARIABLE_MERCHANT_KEYWORDS = [
  'coffee', 'starbucks', 'dunkin',
  'gas', 'fuel',
  'grocery', 'safeway', 'kroger', 'walmart', 'target',
  'mcdonald', 'chipotle', 'restaurant', 'cafe', 'diner',
];

function isVariableMerchant(desc: string): boolean {
  const normalized = normalizeDesc(desc);
  return VARIABLE_MERCHANT_KEYWORDS.some((kw) => normalized.includes(kw));
}

function hasEvenSpacing(dates: string[]): boolean {
  const sorted = [...dates].sort();
  const ms = sorted.map((d) => new Date(d).getTime());
  const gaps: number[] = [];
  for (let i = 1; i < ms.length; i++) {
    gaps.push((ms[i] - ms[i - 1]) / (1000 * 60 * 60 * 24));
  }
  return gaps.every((g) => g >= 25 && g <= 40);
}

export function tagRecurring(txs: Transaction[]): Transaction[] {
  // Group eligible (non-excluded, expense) transactions by normalized description
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (t.excluded || t.amount <= 0) continue;
    const key = normalizeDesc(t.description);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  // Find which transaction ids qualify as recurring
  const recurringIds = new Map<string, string>(); // id → frequency label
  for (const group of groups.values()) {
    const months = new Set(group.map((t) => t.date.slice(0, 7)));
    // Require at least 3 distinct months
    if (months.size < 3) continue;
    const amounts = group.map((t) => Math.abs(t.amount));
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    if (!amounts.every((a) => Math.abs(a - avg) / avg < 0.05)) continue;
    if (isTransfer(group[0].description)) continue;
    if (isVariableMerchant(group[0].description)) continue;
    // For monthly cadence, verify gaps between occurrences are evenly spaced
    if (!hasEvenSpacing(group.map((t) => t.date))) continue;
    const freq = months.size >= 10 ? 'Monthly' : months.size >= 4 ? 'Recurring' : 'Occasional';
    for (const t of group) recurringIds.set(t.id, freq);
  }

  return txs.map((t) => {
    const freq = recurringIds.get(t.id);
    if (freq) {
      if (t.isRecurring && t.recurringFrequency === freq) return t;
      return { ...t, isRecurring: true, recurringFrequency: freq };
    }
    if (!t.isRecurring && t.recurringFrequency === undefined) return t;
    return { ...t, isRecurring: false, recurringFrequency: undefined };
  });
}

// ── Transfer pair detection ────────────────────────────────────────────────────
const TRANSFER_PAIR_KW = /\btransfer\b|xfer|\bzelle\b|\bvenmo\b|cashapp|cash\s?app|\bpaypal\b/i;

function detectTransferPairs(txs: Transaction[]): Transaction[] {
  const DAY_MS = 24 * 60 * 60 * 1000;
  // Only consider transactions with transfer-like keywords that haven't been
  // explicitly un-marked by the user (isTransfer === false)
  const candidates = txs.filter((t) => TRANSFER_PAIR_KW.test(t.description) && t.isTransfer !== false);

  const matchedIds = new Set<string>();
  for (let i = 0; i < candidates.length; i++) {
    if (matchedIds.has(candidates[i].id)) continue;
    const a = candidates[i];
    const aAmt  = Math.round(Math.abs(a.amount) * 100);
    const aTime = new Date(a.date + 'T00:00:00').getTime();
    for (let j = i + 1; j < candidates.length; j++) {
      if (matchedIds.has(candidates[j].id)) continue;
      const b = candidates[j];
      if (Math.round(Math.abs(b.amount) * 100) !== aAmt) continue;
      if (Math.abs(new Date(b.date + 'T00:00:00').getTime() - aTime) > 2 * DAY_MS) continue;
      matchedIds.add(a.id);
      matchedIds.add(b.id);
      break;
    }
  }

  if (matchedIds.size === 0) return txs;
  return txs.map((t) => {
    if (!matchedIds.has(t.id)) return t;
    if (t.isTransfer) return t; // already flagged — respect existing excluded state
    return { ...t, isTransfer: true, excluded: true };
  });
}

// ── Date range helpers ─────────────────────────────────────────────────────────
function startOfDay(d: Date): Date { const r = new Date(d); r.setHours(0,0,0,0); return r; }
function endOfDay(d: Date):   Date { const r = new Date(d); r.setHours(23,59,59,999); return r; }

export function buildPreset(preset: string): { start: Date; end: Date } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  switch (preset) {
    case 'this-month': return { start: startOfDay(new Date(y, m, 1)),   end: endOfDay(new Date(y, m+1, 0)) };
    case 'last-month': return { start: startOfDay(new Date(y, m-1, 1)), end: endOfDay(new Date(y, m, 0)) };
    case 'last-3':     return { start: startOfDay(new Date(y, m-2, 1)), end: endOfDay(new Date(y, m+1, 0)) };
    case 'last-6':     return { start: startOfDay(new Date(y, m-5, 1)), end: endOfDay(new Date(y, m+1, 0)) };
    case 'ytd':        return { start: startOfDay(new Date(y, 0, 1)),   end: endOfDay(now) };
    case 'last-year':  return { start: startOfDay(new Date(y-1, 0, 1)), end: endOfDay(new Date(y-1, 11, 31)) };
    case 'all':        return { start: new Date(0),                     end: endOfDay(now) };
    default:           return { start: startOfDay(new Date(y, m, 1)),   end: endOfDay(new Date(y, m+1, 0)) };
  }
}

// ── Context shape ──────────────────────────────────────────────────────────────
interface BudgetContextValue {
  // State
  txs: Transaction[];
  categories: Category[];
  budget: Budget;
  carryOver: CarryOver;
  dark: boolean;
  dateRange: DateRange;
  goals: Goal[];
  merchantRules: MerchantRules;

  // Derived
  filteredTxs: Transaction[];

  // Transaction handlers
  addTx: (t: Omit<Transaction, 'id'>) => void;
  deleteTx: (id: string) => void;
  editTx: (id: string, updates: Partial<Transaction>) => void;
  importTxs: (incoming: Transaction[]) => Promise<{ imported: number; exactDups: number; fuzzyDups: number }>;
  excludeTx: (id: string, excluded: boolean) => void;
  batchEditTxs: (changes: Array<{ id: string; updates: Partial<Transaction> }>) => void;
  splitTx: (parentId: string, splits: Array<{ description: string; amount: number; category: string }>) => void;
  createMerchantRule: (description: string, category: string) => void;
  deleteMerchantRule: (description: string) => void;
  updateMerchantRule: (oldDesc: string, newDesc: string, category: string) => void;

  // Split rules
  splitRules: SplitRules;
  createSplitRule: (rule: SplitRule) => void;
  deleteSplitRule: (merchantKey: string) => void;

  // Goals
  addGoal: (g: Omit<Goal, 'id'>) => void;
  updateGoal: (id: string, updates: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;

  // Budget
  updateBudget: (cat: string, amount: number) => void;
  toggleCarryOver: (cat: string, enabled: boolean) => void;

  // Categories
  addCategory: (cat: Omit<Category, 'id' | 'builtIn'>) => void;
  deleteCategory: (id: string) => void;
  editCategory: (id: string, updates: Partial<Category>) => void;

  // Dark mode
  setDark: (d: boolean | ((prev: boolean) => boolean)) => void;

  // Date range
  setDateRange: (dr: DateRange) => void;
}

const BudgetContext = createContext<BudgetContextValue | null>(null);

export function useBudget(): BudgetContextValue {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error('useBudget must be used within BudgetProvider');
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function BudgetProvider({ children }: { children: ReactNode }) {
  const [initialized,  setInitialized]  = useState(false);
  const [txs,          setTxs]          = useState<Transaction[]>([]);
  const [categories,   setCategories]   = useState<Category[]>(() => DEFAULT_CATEGORIES.map((c) => ({ ...c })));
  const [budget,       setBudget]       = useState<Budget>(() => ({ ...DEFAULT_BUDGETS }));
  const [carryOver,    setCarryOver]    = useState<CarryOver>({});
  const [dark,         setDark]         = useState(false);
  const [dateRange,    setDateRange]    = useState<DateRange>(() => ({
    preset: 'this-month', ...buildPreset('this-month'),
  }));
  const [goals,        setGoals]        = useState<Goal[]>([]);
  const [merchantRules, setMerchantRules] = useState<MerchantRules>({});
  const [splitRules,    setSplitRules]    = useState<SplitRules>({});

  // Hydrate from localStorage on mount (client only)
  useEffect(() => {
    setTxs(tagRecurring(loadTransactions()));
    setCategories(loadCategories());
    setBudget(loadFlatBudget());
    setCarryOver(loadCarryOver());
    setMerchantRules(loadMerchantRules());
    setSplitRules(loadSplitRules());
    const dm = loadDarkMode();
    setDark(dm);
    document.documentElement.classList.toggle('dark', dm);
    try {
      const g = JSON.parse(localStorage.getItem('budget_goals') ?? 'null');
      setGoals(Array.isArray(g) ? g : []);
    } catch { /* empty */ }
    setInitialized(true);
  }, []);

  // Persist on change — gated on initialized to prevent writing empty initial
  // state to localStorage before hydration has loaded the real saved data.
  useEffect(() => { if (initialized) saveTransactions(txs); }, [initialized, txs]);
  useEffect(() => { if (initialized) saveCategories(categories); }, [initialized, categories]);
  useEffect(() => { if (initialized) saveFlatBudget(budget); }, [initialized, budget]);
  useEffect(() => { if (initialized) saveCarryOver(carryOver); }, [initialized, carryOver]);
  useEffect(() => {
    if (!initialized) return;
    saveDarkMode(dark);
    document.documentElement.classList.toggle('dark', dark);
  }, [initialized, dark]);
  useEffect(() => {
    if (initialized) localStorage.setItem('budget_goals', JSON.stringify(goals));
  }, [initialized, goals]);

  // Date-filtered transactions
  const filteredTxs = txs.filter((t) => {
    const d = new Date(t.date + 'T00:00:00');
    return d >= dateRange.start && d <= dateRange.end;
  });

  // ── Transaction handlers ──
  const addTx = useCallback((t: Omit<Transaction, 'id'>) => {
    setTxs((p) => [{ ...t, id: Date.now().toString() }, ...p]);
  }, []);

  const deleteTx = useCallback((id: string) => {
    setTxs((p) => p.filter((t) => t.id !== id));
  }, []);

  const txsRef = useRef(txs);
  txsRef.current = txs;

  const editTx = useCallback((id: string, updates: Partial<Transaction>) => {
    setTxs((p) => p.map((t) => {
      if (t.id !== id) return t;
      const { changeHistory: newEntries, ...rest } = updates;
      const merged: Transaction = { ...t, ...rest };
      if (newEntries?.length) {
        merged.changeHistory = [...(t.changeHistory ?? []), ...newEntries];
      }
      return merged;
    }));
  }, []);

  const createMerchantRule = useCallback((description: string, category: string) => {
    addMerchantRule(description, category);
    setMerchantRules(loadMerchantRules());
  }, []);

  const deleteMerchantRuleFn = useCallback((description: string) => {
    deleteMerchantRule(description);
    setMerchantRules(loadMerchantRules());
  }, []);

  const updateMerchantRuleFn = useCallback((oldDesc: string, newDesc: string, category: string) => {
    updateMerchantRule(oldDesc, newDesc, category);
    setMerchantRules(loadMerchantRules());
  }, []);

  const createSplitRule = useCallback((rule: SplitRule) => {
    addSplitRule(rule);
    setSplitRules(loadSplitRules());
  }, []);

  const deleteSplitRuleFn = useCallback((merchantKey: string) => {
    removeSplitRule(merchantKey);
    setSplitRules(loadSplitRules());
  }, []);

  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;

  const importTxs = useCallback(async (incoming: Transaction[]): Promise<{ imported: number; exactDups: number; fuzzyDups: number }> => {
    const snap = await new Promise<Transaction[]>((resolve) =>
      setTxs((prev) => { resolve(prev); return prev; })
    );
    const seen = new Set(
      snap.map((t) => `${t.date}|${Math.round(Math.abs(t.amount)*100)}|${(t.description??'').toLowerCase().trim()}`)
    );
    const unique = incoming.filter(
      (t) => !seen.has(`${t.date}|${Math.round(Math.abs(t.amount)*100)}|${(t.description??'').toLowerCase().trim()}`)
    );
    const exactDups = incoming.length - unique.length;
    if (unique.length === 0) return { imported: 0, exactDups, fuzzyDups: 0 };

    // Fuzzy duplicate detection: same description + amount, date within ±2 days
    const DAY_MS = 24 * 60 * 60 * 1000;
    const fuzzyTagged = unique.map((t): Transaction => {
      const tDate = new Date(t.date + 'T00:00:00').getTime();
      const tAmt  = Math.round(Math.abs(t.amount) * 100);
      const tDesc = (t.description ?? '').toLowerCase().trim();
      const isFuzzy = snap.some((e) => {
        if (Math.round(Math.abs(e.amount) * 100) !== tAmt) return false;
        if ((e.description ?? '').toLowerCase().trim() !== tDesc) return false;
        return Math.abs(new Date(e.date + 'T00:00:00').getTime() - tDate) <= 2 * DAY_MS;
      });
      return isFuzzy ? { ...t, isDuplicate: true, needsReview: true } : t;
    });
    const fuzzyDups = fuzzyTagged.filter((t) => t.isDuplicate).length;

    const rules = loadMerchantRules();
    const cats  = categoriesRef.current;
    const fallbackNames = new Set(['Other', 'Other Income']);

    const processed = fuzzyTagged.map((t): Transaction => {
      if (t.isDuplicate) return t; // keep isDuplicate/needsReview flags, skip re-categorization override
      if (t.categorizedBy === 'bank') return { ...t, needsReview: false };
      if (t.excluded) return t;
      const learnedCat = applyLearnedRules(t.description, rules);
      if (learnedCat) return { ...t, category: learnedCat, categorizedBy: 'learned', needsReview: false };
      const [change] = autoCategorizeAll([t], cats, {});
      if (change?.updates?.category) return { ...t, ...change.updates, categorizedBy: 'keyword', needsReview: false };
      if (change?.updates?.excluded) return { ...t, excluded: true, needsReview: false };
      return { ...t, needsReview: true };
    });

    const needsAI = processed.filter((t) => !t.excluded && !t.isDuplicate && fallbackNames.has(t.category));
    if (needsAI.length > 0) {
      const descs = [...new Set(needsAI.map((t) => t.description))];
      const aiMap = await aiCategorizeUnknown(descs, cats);
      const withAI = processed.map((t): Transaction => {
        if (t.excluded || t.isDuplicate || !fallbackNames.has(t.category)) return t;
        const aiCat = aiMap[t.description];
        if (aiCat) return { ...t, category: aiCat, categorizedBy: 'ai', needsReview: true };
        return t;
      });
      setTxs((prev) => tagRecurring(detectTransferPairs([...withAI, ...prev])));
    } else {
      setTxs((prev) => tagRecurring(detectTransferPairs([...processed, ...prev])));
    }
    return { imported: unique.length, exactDups, fuzzyDups };
  }, []);

  const excludeTx = useCallback((id: string, excluded: boolean) => {
    setTxs((p) => p.map((t) => {
      if (t.id !== id) return t;
      const entry: ChangeHistoryEntry = {
        field: 'Excluded',
        oldValue: t.excluded ? 'true' : 'false',
        newValue: excluded ? 'true' : 'false',
        timestamp: new Date().toISOString(),
      };
      return { ...t, excluded, changeHistory: [...(t.changeHistory ?? []), entry] };
    }));
  }, []);

  const batchEditTxs = useCallback(
    (changes: Array<{ id: string; updates: Partial<Transaction> }>) => {
      setTxs((prev) => {
        const map = Object.fromEntries(changes.map((c) => [c.id, c.updates]));
        return prev.map((t) => (map[t.id] ? { ...t, ...map[t.id] } : t));
      });
    }, []
  );

  const splitTx = useCallback(
    (parentId: string, splits: Array<{ description: string; amount: number; category: string }>) => {
      setTxs((prev) => {
        const parent = prev.find((t) => t.id === parentId);
        if (!parent) return prev;
        const children = splits.map((s, i) => ({
          ...parent,
          id: `${parentId}_split_${i + 1}`,
          amount: s.amount,
          category: s.category,
          description: s.description || parent.description,
          isSplit: true,
          splitParentId: parentId,
        }));
        return prev
          .map((t) => (t.id === parentId ? { ...t, isSplit: true, splitChildren: children.map(c => ({ description: c.description, amount: c.amount, category: c.category })) } : t))
          .concat(children);
      });
    }, []
  );

  // ── Goals ──
  const addGoal = useCallback((g: Omit<Goal, 'id'>) => {
    setGoals((p) => [...p, { ...g, id: `goal_${Date.now()}` }]);
  }, []);
  const updateGoal = useCallback((id: string, updates: Partial<Goal>) => {
    setGoals((p) => p.map((g) => (g.id === id ? { ...g, ...updates } : g)));
  }, []);
  const deleteGoal = useCallback((id: string) => {
    setGoals((p) => p.filter((g) => g.id !== id));
  }, []);

  // ── Budget ──
  const updateBudget = useCallback((cat: string, amount: number) => {
    setBudget((p) => ({ ...p, [cat]: amount }));
  }, []);
  const toggleCarryOver = useCallback((cat: string, enabled: boolean) => {
    setCarryOver((p) => ({ ...p, [cat]: enabled }));
  }, []);

  // ── Categories ──
  const addCategory = useCallback((cat: Omit<Category, 'id' | 'builtIn'>) => {
    setCategories((p) => [...p, { ...cat, id: `custom_${Date.now()}`, builtIn: false }]);
  }, []);
  const deleteCategory = useCallback((id: string) => {
    setCategories((p) => p.filter((c) => c.id !== id));
  }, []);
  const editCategory = useCallback((id: string, updates: Partial<Category>) => {
    setCategories((prev) => {
      const old = prev.find((c) => c.id === id);
      if (old && updates.name && updates.name !== old.name) {
        setTxs((txs) => txs.map((t) => (t.category === old.name ? { ...t, category: updates.name! } : t)));
      }
      return prev.map((c) => (c.id === id ? { ...c, ...updates } : c));
    });
  }, []);

  return (
    <BudgetContext.Provider value={{
      txs, categories, budget, carryOver, dark, dateRange, goals, merchantRules, splitRules,
      filteredTxs,
      addTx, deleteTx, editTx, importTxs, excludeTx, batchEditTxs, splitTx, createMerchantRule,
      deleteMerchantRule: deleteMerchantRuleFn, updateMerchantRule: updateMerchantRuleFn,
      createSplitRule, deleteSplitRule: deleteSplitRuleFn,
      addGoal, updateGoal, deleteGoal,
      updateBudget, toggleCarryOver,
      addCategory, deleteCategory, editCategory,
      setDark, setDateRange,
    }}>
      {children}
    </BudgetContext.Provider>
  );
}

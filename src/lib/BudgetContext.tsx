'use client';

import {
  createContext, useContext, useState, useEffect, useCallback,
  useRef, type ReactNode,
} from 'react';
import type { Transaction, Category, Budget, CarryOver, MerchantRules, Goal, DateRange } from './types';
import {
  loadTransactions, saveTransactions,
  loadCategories, saveCategories,
  loadFlatBudget, saveFlatBudget,
  loadCarryOver, saveCarryOver,
  loadDarkMode, saveDarkMode,
  loadMerchantRules, addMerchantRule,
} from './storage';
import { autoCategorizeAll, aiCategorizeUnknown, applyLearnedRules } from './autoCategory';

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
  importTxs: (incoming: Transaction[]) => Promise<void>;
  excludeTx: (id: string, excluded: boolean) => void;
  batchEditTxs: (changes: Array<{ id: string; updates: Partial<Transaction> }>) => void;
  splitTx: (parentId: string, splits: Array<{ description: string; amount: number; category: string }>) => void;

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
  const [txs,          setTxs]          = useState<Transaction[]>([]);
  const [categories,   setCategories]   = useState<Category[]>([]);
  const [budget,       setBudget]       = useState<Budget>({});
  const [carryOver,    setCarryOver]    = useState<CarryOver>({});
  const [dark,         setDark]         = useState(false);
  const [dateRange,    setDateRange]    = useState<DateRange>(() => ({
    preset: 'this-month', ...buildPreset('this-month'),
  }));
  const [goals,        setGoals]        = useState<Goal[]>([]);
  const [merchantRules, setMerchantRules] = useState<MerchantRules>({});

  // Hydrate from localStorage on mount (client only)
  useEffect(() => {
    setTxs(loadTransactions());
    setCategories(loadCategories());
    setBudget(loadFlatBudget());
    setCarryOver(loadCarryOver());
    setMerchantRules(loadMerchantRules());
    const dm = loadDarkMode();
    setDark(dm);
    document.documentElement.classList.toggle('dark', dm);
    try {
      const g = JSON.parse(localStorage.getItem('budget_goals') ?? 'null');
      setGoals(Array.isArray(g) ? g : []);
    } catch { /* empty */ }
  }, []);

  // Persist on change
  useEffect(() => { saveTransactions(txs); }, [txs]);
  useEffect(() => { saveCategories(categories); }, [categories]);
  useEffect(() => { saveFlatBudget(budget); }, [budget]);
  useEffect(() => { saveCarryOver(carryOver); }, [carryOver]);
  useEffect(() => {
    saveDarkMode(dark);
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  useEffect(() => {
    localStorage.setItem('budget_goals', JSON.stringify(goals));
  }, [goals]);

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
    if (updates.category) {
      const tx = txsRef.current.find((t) => t.id === id);
      if (tx) {
        addMerchantRule(tx.description, updates.category);
        setMerchantRules(loadMerchantRules());
      }
    }
    setTxs((p) => p.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }, []);

  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;

  const importTxs = useCallback(async (incoming: Transaction[]) => {
    const snap = await new Promise<Transaction[]>((resolve) =>
      setTxs((prev) => { resolve(prev); return prev; })
    );
    const seen = new Set(
      snap.map((t) => `${t.date}|${Math.round(Math.abs(t.amount)*100)}|${(t.description??'').toLowerCase().trim()}`)
    );
    const unique = incoming.filter(
      (t) => !seen.has(`${t.date}|${Math.round(Math.abs(t.amount)*100)}|${(t.description??'').toLowerCase().trim()}`)
    );
    if (unique.length === 0) return;

    const rules = loadMerchantRules();
    const cats  = categoriesRef.current;
    const fallbackNames = new Set(['Other', 'Other Income']);

    const processed = unique.map((t): Transaction => {
      if (t.categorizedBy === 'bank') return { ...t, needsReview: false };
      if (t.excluded) return t;
      const learnedCat = applyLearnedRules(t.description, rules);
      if (learnedCat) return { ...t, category: learnedCat, categorizedBy: 'learned', needsReview: false };
      const [change] = autoCategorizeAll([t], cats, {});
      if (change?.updates?.category) return { ...t, ...change.updates, categorizedBy: 'keyword', needsReview: false };
      if (change?.updates?.excluded) return { ...t, excluded: true, needsReview: false };
      return { ...t, needsReview: true };
    });

    const needsAI = processed.filter((t) => !t.excluded && fallbackNames.has(t.category));
    if (needsAI.length > 0) {
      const descs = [...new Set(needsAI.map((t) => t.description))];
      const aiMap = await aiCategorizeUnknown(descs, cats);
      const withAI = processed.map((t): Transaction => {
        if (t.excluded || !fallbackNames.has(t.category)) return t;
        const aiCat = aiMap[t.description];
        if (aiCat) return { ...t, category: aiCat, categorizedBy: 'ai', needsReview: true };
        return t;
      });
      setTxs((prev) => [...withAI, ...prev]);
    } else {
      setTxs((prev) => [...processed, ...prev]);
    }
  }, []);

  const excludeTx = useCallback((id: string, excluded: boolean) => {
    setTxs((p) => p.map((t) => (t.id === id ? { ...t, excluded } : t)));
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
      txs, categories, budget, carryOver, dark, dateRange, goals, merchantRules,
      filteredTxs,
      addTx, deleteTx, editTx, importTxs, excludeTx, batchEditTxs, splitTx,
      addGoal, updateGoal, deleteGoal,
      updateBudget, toggleCarryOver,
      addCategory, deleteCategory, editCategory,
      setDark, setDateRange,
    }}>
      {children}
    </BudgetContext.Provider>
  );
}

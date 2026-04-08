import { DEFAULT_CATEGORIES, DEFAULT_BUDGETS } from './constants';
import type { Transaction, Category, Budget, CarryOver, MerchantRules } from './types';

const KEY = {
  TRANSACTIONS: 'budget_transactions',
  ALL_BUDGETS:  'budget_all_budgets',
  CARRY_OVER:   'budget_carry_over',
  CATEGORIES:   'budget_categories',
  DARK_MODE:    'budget_dark_mode',
} as const;

function safe<T>(key: string, fallback: T): T {
  try {
    const r = localStorage.getItem(key);
    return r ? (JSON.parse(r) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// ── Transactions ──────────────────────────────────────────────────────────────
export const loadTransactions = (): Transaction[] => safe<Transaction[]>(KEY.TRANSACTIONS, []);
export const saveTransactions = (v: Transaction[]): void =>
  localStorage.setItem(KEY.TRANSACTIONS, JSON.stringify(v));

// ── Categories ────────────────────────────────────────────────────────────────
export function loadCategories(): Category[] {
  const stored = safe<Category[] | null>(KEY.CATEGORIES, null);
  if (!stored) return DEFAULT_CATEGORIES.map((c) => ({ ...c }));
  return stored;
}
export const saveCategories = (v: Category[]): void =>
  localStorage.setItem(KEY.CATEGORIES, JSON.stringify(v));

// ── Per-month budgets ─────────────────────────────────────────────────────────
export function loadAllBudgets(): Record<string, Budget> {
  const raw = safe<Record<string, Budget> | null>(KEY.ALL_BUDGETS, null);
  if (raw && typeof raw === 'object') {
    const keys = Object.keys(raw);
    if (keys.length === 0 || /^\d{4}-\d{2}$/.test(keys[0])) return raw;
  }
  const old = safe<Budget | null>('budget_budgets', null);
  const seed = old ?? DEFAULT_BUDGETS;
  const now = monthKey(new Date());
  return { [now]: { ...seed } };
}
export const saveAllBudgets = (v: Record<string, Budget>): void =>
  localStorage.setItem(KEY.ALL_BUDGETS, JSON.stringify(v));

export function getBudgetForMonth(
  allBudgets: Record<string, Budget>,
  carryOver: CarryOver,
  date: Date
): Budget {
  const mk = monthKey(date);
  if (allBudgets[mk]) return { ...allBudgets[mk] };

  const pastMonths = Object.keys(allBudgets)
    .filter((k) => k < mk)
    .sort()
    .reverse();

  const budget: Budget = {};
  if (pastMonths.length > 0) {
    Object.entries(carryOver).forEach(([cat, enabled]) => {
      if (!enabled) return;
      for (const m of pastMonths) {
        if (allBudgets[m][cat] !== undefined) {
          budget[cat] = allBudgets[m][cat];
          break;
        }
      }
    });
  }
  return budget;
}

// ── Flat budget ───────────────────────────────────────────────────────────────
const FLAT_BUDGET_KEY = 'budget_flat';

export function loadFlatBudget(): Budget {
  const flat = safe<Budget | null>(FLAT_BUDGET_KEY, null);
  if (flat) return flat;
  const perMonth = safe<Record<string, Budget> | null>(KEY.ALL_BUDGETS, null);
  if (perMonth && typeof perMonth === 'object') {
    const months = Object.keys(perMonth)
      .filter((k) => /^\d{4}-\d{2}$/.test(k))
      .sort()
      .reverse();
    if (months.length > 0) return { ...perMonth[months[0]] };
  }
  return { ...DEFAULT_BUDGETS };
}
export const saveFlatBudget = (v: Budget): void =>
  localStorage.setItem(FLAT_BUDGET_KEY, JSON.stringify(v));

// ── Carry-over ────────────────────────────────────────────────────────────────
export const loadCarryOver = (): CarryOver => safe<CarryOver>(KEY.CARRY_OVER, {});
export const saveCarryOver = (v: CarryOver): void =>
  localStorage.setItem(KEY.CARRY_OVER, JSON.stringify(v));

// ── Dark mode ─────────────────────────────────────────────────────────────────
export function loadDarkMode(): boolean {
  const raw = localStorage.getItem(KEY.DARK_MODE);
  if (raw !== null) return JSON.parse(raw) as boolean;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
export const saveDarkMode = (v: boolean): void =>
  localStorage.setItem(KEY.DARK_MODE, JSON.stringify(v));

// ── Merchant rules ────────────────────────────────────────────────────────────
const MERCHANT_RULES_KEY = 'budget_merchant_rules';
export const loadMerchantRules = (): MerchantRules => safe<MerchantRules>(MERCHANT_RULES_KEY, {});
export const saveMerchantRules = (v: MerchantRules): void =>
  localStorage.setItem(MERCHANT_RULES_KEY, JSON.stringify(v));

export function addMerchantRule(description: string, category: string): void {
  const rules = loadMerchantRules();
  rules[description.toLowerCase().trim()] = category;
  saveMerchantRules(rules);
}

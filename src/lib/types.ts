// ── Core data types ────────────────────────────────────────────────────────────

export type CategoryType = 'income' | 'expense';
export type CategoryGroup = 'income' | 'bills' | 'spending' | 'savings';
export type CategorizedBy = 'bank' | 'learned' | 'keyword' | 'ai';

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  group: CategoryGroup;
  color: string;
  builtIn: boolean;
}

export interface Transaction {
  id: string;
  date: string;           // ISO YYYY-MM-DD
  description: string;
  amount: number;         // positive = expense, negative = income
  category: string;
  account?: string;
  notes?: string;
  tags?: string[];
  excluded?: boolean;
  isSplit?: boolean;
  splitParentId?: string;
  splitChildren?: SplitChild[];
  categorizedBy?: CategorizedBy;
  needsReview?: boolean;
  reviewed?: boolean;
  isDuplicate?: boolean;
}

export interface SplitChild {
  description: string;
  amount: number;
  category: string;
}

export type Budget = Record<string, number>;          // categoryName → amount
export type CarryOver = Record<string, boolean>;      // categoryName → enabled
export type MerchantRules = Record<string, string>;   // description.lower() → categoryName

export interface Goal {
  id: string;
  name: string;
  target: number;
  current: number;
}

export interface DateRange {
  preset: string;
  start: Date;
  end: Date;
}

export interface NetWorthEntry {
  id: number;
  name: string;
  amount: number;
}

export interface NetWorth {
  assets: NetWorthEntry[];
  liabilities: NetWorthEntry[];
}

// ── Import helpers ─────────────────────────────────────────────────────────────

export interface BankCategoryResult {
  exclude?: boolean;
  name?: string;
  type?: CategoryType;
}

// ── Props shapes shared between App and tabs ───────────────────────────────────

export interface SharedProps {
  transactions: Transaction[];
  allTransactions: Transaction[];
  categories: Category[];
  budget: Budget;
  carryOver: CarryOver;
  dateRange: DateRange;
}

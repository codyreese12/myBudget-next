import type { Category } from './types';

// ── Default categories ─────────────────────────────────────────────────────────
export const DEFAULT_CATEGORIES: Category[] = [
  // ── Income ──────────────────────────────────────────────────
  { id: 'wages',         name: 'Wages & Salary',          type: 'income',  group: 'income',   color: '#34d399', builtIn: false },
  { id: 'freelance',     name: 'Freelance & Side Income',  type: 'income',  group: 'income',   color: '#6ee7b7', builtIn: false },
  { id: 'other-income',  name: 'Other Income',             type: 'income',  group: 'income',   color: '#a7f3d0', builtIn: false },

  // ── Bills ────────────────────────────────────────────────────
  { id: 'rent',          name: 'Rent / Mortgage',          type: 'expense', group: 'bills',    color: '#60a5fa', builtIn: false },
  { id: 'utilities',     name: 'Utilities',                type: 'expense', group: 'bills',    color: '#93c5fd', builtIn: false },
  { id: 'phone',         name: 'Phone',                    type: 'expense', group: 'bills',    color: '#7dd3fc', builtIn: false },
  { id: 'internet',      name: 'Internet',                 type: 'expense', group: 'bills',    color: '#bfdbfe', builtIn: false },
  { id: 'insurance',     name: 'Insurance',                type: 'expense', group: 'bills',    color: '#38bdf8', builtIn: false },
  { id: 'subscriptions', name: 'Subscriptions',            type: 'expense', group: 'bills',    color: '#818cf8', builtIn: false },
  { id: 'loan-payment',  name: 'Loan Payment',             type: 'expense', group: 'bills',    color: '#a5b4fc', builtIn: false },

  // ── Spending ─────────────────────────────────────────────────
  { id: 'groceries',     name: 'Groceries',                type: 'expense', group: 'spending', color: '#4ade80', builtIn: false },
  { id: 'dining',        name: 'Dining & Restaurants',     type: 'expense', group: 'spending', color: '#f97316', builtIn: false },
  { id: 'coffee',        name: 'Coffee & Drinks',          type: 'expense', group: 'spending', color: '#a78bfa', builtIn: false },
  { id: 'transport',     name: 'Transportation & Gas',     type: 'expense', group: 'spending', color: '#38bdf8', builtIn: false },
  { id: 'shopping',      name: 'Shopping',                 type: 'expense', group: 'spending', color: '#fb923c', builtIn: false },
  { id: 'clothing',      name: 'Clothing & Apparel',       type: 'expense', group: 'spending', color: '#fbbf24', builtIn: false },
  { id: 'entertainment', name: 'Entertainment',            type: 'expense', group: 'spending', color: '#fb7185', builtIn: false },
  { id: 'health',        name: 'Health & Fitness',         type: 'expense', group: 'spending', color: '#f43f5e', builtIn: false },
  { id: 'medical',       name: 'Medical',                  type: 'expense', group: 'spending', color: '#fda4af', builtIn: false },
  { id: 'personal-care', name: 'Personal Care',            type: 'expense', group: 'spending', color: '#2dd4bf', builtIn: false },
  { id: 'education',     name: 'Education',                type: 'expense', group: 'spending', color: '#c4b5fd', builtIn: false },
  { id: 'gifts',         name: 'Gifts & Donations',        type: 'expense', group: 'spending', color: '#f9a8d4', builtIn: false },
  { id: 'travel',        name: 'Travel',                   type: 'expense', group: 'spending', color: '#67e8f9', builtIn: false },
  { id: 'home',          name: 'Home & Garden',            type: 'expense', group: 'spending', color: '#86efac', builtIn: false },
  { id: 'other',         name: 'Other',                    type: 'expense', group: 'spending', color: '#94a3b8', builtIn: false },

  // ── Savings ──────────────────────────────────────────────────
  { id: 'emergency-fund', name: 'Emergency Fund',          type: 'expense', group: 'savings',  color: '#34d399', builtIn: false },
  { id: 'investments',    name: 'Investments',             type: 'expense', group: 'savings',  color: '#6ee7b7', builtIn: false },
  { id: 'savings-goal',   name: 'Savings Goal',            type: 'expense', group: 'savings',  color: '#a7f3d0', builtIn: false },
];

export const OPTIONAL_CATEGORIES: Omit<Category, 'builtIn'>[] = [
  { id: 'wedding',      name: 'Wedding',          type: 'expense', group: 'spending', color: '#e879f9' },
  { id: 'childcare',    name: 'Childcare',         type: 'expense', group: 'bills',    color: '#f0abfc' },
  { id: 'auto-payment', name: 'Auto Payment',      type: 'expense', group: 'bills',    color: '#93c5fd' },
  { id: 'pets',         name: 'Pets',              type: 'expense', group: 'spending', color: '#86efac' },
  { id: 'business',     name: 'Business Expenses', type: 'expense', group: 'spending', color: '#fcd34d' },
  { id: 'vacation',     name: 'Vacation Fund',     type: 'expense', group: 'savings',  color: '#67e8f9' },
  { id: 'gig-income',   name: 'Gig Income',        type: 'income',  group: 'income',   color: '#bbf7d0' },
  { id: 'charity',      name: 'Charity',           type: 'expense', group: 'spending', color: '#f87171' },
  { id: 'alcohol',      name: 'Alcohol & Bars',    type: 'expense', group: 'spending', color: '#fb923c' },
  { id: 'hobbies',      name: 'Hobbies',           type: 'expense', group: 'spending', color: '#c4b5fd' },
  { id: 'investing',    name: 'Investing',         type: 'expense', group: 'savings',  color: '#4ade80' },
];

export const DEFAULT_BUDGETS: Record<string, number> = Object.fromEntries(
  DEFAULT_CATEGORIES.map((c) => [c.name, 0])
);

export function getCategoryColor(name: string, categories: Category[]): string {
  return categories.find((c) => c.name === name)?.color ?? '#94a3b8';
}

export function getCategoriesByType(categories: Category[], type: 'income' | 'expense'): Category[] {
  return categories.filter((c) => c.type === type);
}

export const CATEGORY_COLORS: Record<string, string> = Object.fromEntries(
  DEFAULT_CATEGORIES.map((c) => [c.name, c.color])
);

export const CATEGORIES: string[] = DEFAULT_CATEGORIES.map((c) => c.name);

export const PRESET_COLORS = [
  '#f43f5e', '#f97316', '#fbbf24', '#84cc16', '#22c55e', '#34d399',
  '#14b8a6', '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa', '#e879f9',
  '#f472b6', '#94a3b8', '#fb923c', '#2dd4bf',
];

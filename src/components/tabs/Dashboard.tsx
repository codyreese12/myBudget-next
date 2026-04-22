'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useBudget } from '@/lib/BudgetContext';
import { getCategoryColor } from '@/lib/constants';
import type { Transaction, Category } from '@/lib/types';

// ── Chart.js — dynamic import to avoid SSR issues ─────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DoughnutChart = dynamic(() => import('react-chartjs-2').then(m => m.Doughnut), { ssr: false }) as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BarChart      = dynamic(() => import('react-chartjs-2').then(m => m.Bar),      { ssr: false }) as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LineChart     = dynamic(() => import('react-chartjs-2').then(m => m.Line),     { ssr: false }) as any;

// ── GridLayout — dynamic import to avoid SSR issues ───────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GridLayout    = dynamic(() => import('react-grid-layout'),                     { ssr: false }) as any;

// ── Persistence keys ──────────────────────────────────────────────────────────
const LAYOUT_KEY     = 'budget_dashboard_layout';
const NETWORTH_KEY   = 'budget_net_worth';
const VISIBILITY_KEY = 'budget_widget_visibility';

// ── Types ─────────────────────────────────────────────────────────────────────
interface LayoutItem { i: string; x: number; y: number; w: number; h: number; }
interface NwItem    { id: number; name: string; amount: number; }
interface NetWorthData { assets: NwItem[]; liabilities: NwItem[]; }
interface RecurringItem { description: string; avgAmount: number; category: string; frequency: string; }

// ── localStorage helpers ──────────────────────────────────────────────────────
function loadLayout(): LayoutItem[] | null {
  try { const r = localStorage.getItem(LAYOUT_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function saveLayout(v: LayoutItem[]) { localStorage.setItem(LAYOUT_KEY, JSON.stringify(v)); }

function loadNetWorth(): NetWorthData {
  try {
    const r = localStorage.getItem(NETWORTH_KEY);
    return r ? JSON.parse(r) : {
      assets:      [{ id: 1, name: 'Checking', amount: 0 }, { id: 2, name: 'Savings', amount: 0 }, { id: 3, name: 'Brokerage', amount: 0 }, { id: 4, name: 'Roth IRA', amount: 0 }],
      liabilities: [{ id: 5, name: 'Student Loans', amount: 0 }, { id: 6, name: 'Credit Cards', amount: 0 }],
    };
  } catch { return { assets: [], liabilities: [] }; }
}
function saveNetWorth(v: NetWorthData) { localStorage.setItem(NETWORTH_KEY, JSON.stringify(v)); }

const ALL_WIDGETS = [
  { id: 'stats',     label: 'Stat Cards' },
  { id: 'donut',     label: 'Spending by Category' },
  { id: 'budget',    label: 'Budget Progress' },
  { id: 'recent',    label: 'Recent Transactions' },
  { id: 'trends',    label: 'Spending Trends' },
  { id: 'networth',  label: 'Net Worth' },
  { id: 'recurring', label: 'Recurring Bills' },
];

function loadVisibility(): Record<string, boolean> {
  try {
    const r = localStorage.getItem(VISIBILITY_KEY);
    if (r) {
      const v = JSON.parse(r);
      return Object.fromEntries(ALL_WIDGETS.map(w => [w.id, v[w.id] !== false]));
    }
  } catch {}
  return Object.fromEntries(ALL_WIDGETS.map(w => [w.id, true]));
}
function saveVisibility(v: Record<string, boolean>) { localStorage.setItem(VISIBILITY_KEY, JSON.stringify(v)); }

// ── Default layout ────────────────────────────────────────────────────────────
const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: 'stats',     x: 0, y: 0,  w: 12, h: 2 },
  { i: 'donut',     x: 0, y: 2,  w: 4,  h: 7 },
  { i: 'budget',    x: 4, y: 2,  w: 4,  h: 7 },
  { i: 'recent',    x: 8, y: 2,  w: 4,  h: 7 },
  { i: 'trends',    x: 0, y: 9,  w: 6,  h: 8 },
  { i: 'networth',  x: 6, y: 9,  w: 6,  h: 7 },
  { i: 'recurring', x: 0, y: 17, w: 6,  h: 6 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function usd(n: number, d = 0) {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function catType(name: string, categories: Category[]) {
  return categories.find(c => c.name === name)?.type ?? 'expense';
}

// ── Chart.js registration (client-side only) ──────────────────────────────────
if (typeof window !== 'undefined') {
  import('chart.js').then(({ Chart, ArcElement, Tooltip, LineElement, CategoryScale, LinearScale, PointElement, BarElement, Legend }) => {
    Chart.register(ArcElement, Tooltip, LineElement, CategoryScale, LinearScale, PointElement, BarElement, Legend);

    const centerPlugin = {
      id: 'centerText',
      beforeDraw(chart: import('chart.js').Chart, _a: unknown, opts: { text?: string; color?: string; subColor?: string }) {
        if (!opts.text) return;
        const { ctx, chartArea: a } = chart;
        const cx = a.left + a.width / 2, cy = a.top + a.height / 2;
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `700 ${Math.round(a.height * 0.14)}px Inter, sans-serif`;
        ctx.fillStyle = opts.color || '#111';
        ctx.fillText(opts.text, cx, cy - a.height * 0.05);
        ctx.font = `400 ${Math.round(a.height * 0.08)}px Inter, sans-serif`;
        ctx.fillStyle = opts.subColor || '#aaa';
        ctx.fillText('spent', cx, cy + a.height * 0.1);
        ctx.restore();
      },
    };
    Chart.register(centerPlugin);
  });
}

// ── Drag handle ───────────────────────────────────────────────────────────────
function DragHandle() {
  return (
    <div className="drag-handle" style={{ position: 'absolute', top: 10, right: 10, cursor: 'grab', color: 'var(--text-3)', fontSize: 14, lineHeight: 1, userSelect: 'none' }}>
      ⠿
    </div>
  );
}

// ── Widget shell ──────────────────────────────────────────────────────────────
function Widget({ title, children, style = {} }: { title?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      height: '100%', background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 20, overflow: 'hidden', position: 'relative',
      display: 'flex', flexDirection: 'column', ...style,
    }}>
      <DragHandle />
      {title && <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 14, flexShrink: 0 }}>{title}</p>}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

// ── Inline-editable number ────────────────────────────────────────────────────
function EditableAmount({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const { privacyMode } = useBudget();
  const usd = (n: number, d = 0) => privacyMode ? '••••' : '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const [on, setOn]   = useState(false);
  const [val, setVal] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (on && ref.current) ref.current.select(); }, [on]);
  const open  = () => { setVal(String(value || 0)); setOn(true); };
  const close = () => {
    const v = parseFloat(val);
    if (!isNaN(v)) onSave(v);
    setOn(false);
  };
  if (on) return (
    <input ref={ref} type="number" value={val} onChange={e => setVal(e.target.value)}
      onBlur={close} onKeyDown={e => { if (e.key === 'Enter') close(); if (e.key === 'Escape') setOn(false); }}
      style={{ width: 90, textAlign: 'right', fontSize: 13, fontWeight: 500, borderColor: 'var(--accent)', padding: '2px 6px' }} />
  );
  return (
    <button onClick={open}
      style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--text-1)', padding: '2px 4px', borderRadius: 4 }}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'rgba(91,87,245,0.08)'; }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-1)'; e.currentTarget.style.background = 'none'; }}>
      {usd(value || 0)}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Widget A — Stat Cards
// ══════════════════════════════════════════════════════════════════════════════
function WidgetStats({ transactions, categories }: { transactions: Transaction[]; categories: Category[] }) {
  const { privacyMode } = useBudget();
  const usd = (n: number, d = 0) => privacyMode ? '••••' : '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const { income, spent } = useMemo(() => {
    const income = transactions.filter(t => !t.excluded && catType(t.category, categories) === 'income').reduce((s, t) => s + Math.abs(t.amount), 0);
    const spent  = transactions.filter(t => !t.excluded && catType(t.category, categories) === 'expense').reduce((s, t) => s + Math.abs(t.amount), 0);
    return { income, spent };
  }, [transactions, categories]);

  const net         = income - spent;
  const savingsRate = income > 0 ? ((income - spent) / income * 100).toFixed(1) + '%' : '—';
  const savingsColor = income > 0 && (income - spent) / income >= 0.2 ? 'var(--green)' : 'var(--amber)';

  const cards = [
    { label: 'Income',        value: usd(income, 2), color: 'var(--green)' },
    { label: 'Spent',         value: usd(spent, 2),  color: 'var(--text-1)' },
    { label: 'Net Cash Flow', value: usd(net, 2),    color: net >= 0 ? 'var(--green)' : 'var(--red)' },
    { label: 'Savings Rate',  value: savingsRate,    color: savingsColor },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
      {cards.map(({ label, value, color }) => (
        <div key={label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', display: 'flex', flexDirection: 'column' }}>
          <p style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</p>
          <p style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Widget B — Spending by Category (Donut)
// ══════════════════════════════════════════════════════════════════════════════
function WidgetDonut({ transactions, categories }: { transactions: Transaction[]; categories: Category[] }) {
  const { privacyMode } = useBudget();
  const usd = (n: number, d = 0) => privacyMode ? '••••' : '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const [isDark, setIsDark] = useState(false);
  useEffect(() => { setIsDark(document.documentElement.classList.contains('dark')); }, []);

  const { byCategory, spent } = useMemo(() => {
    const m: Record<string, number> = {};
    transactions.filter(t => !t.excluded && catType(t.category, categories) === 'expense')
      .forEach(t => { m[t.category] = (m[t.category] || 0) + Math.abs(t.amount); });
    return { byCategory: m, spent: Object.values(m).reduce((s, v) => s + v, 0) };
  }, [transactions, categories]);

  const cats = Object.keys(byCategory).filter(c => byCategory[c] > 0);

  if (!cats.length) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-3)', gap: 8 }}>
      <svg width={36} height={36} viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth={1.2}><circle cx="18" cy="18" r="14"/><circle cx="18" cy="18" r="6"/></svg>
      <span style={{ fontSize: 12 }}>No spending data</span>
    </div>
  );

  const donutData = {
    labels: cats,
    datasets: [{ data: cats.map(c => byCategory[c]), backgroundColor: cats.map(c => getCategoryColor(c, categories)), borderWidth: 2, borderColor: isDark ? '#17171a' : '#fff', hoverOffset: 4 }],
  };
  const donutOpts = {
    responsive: true, cutout: '74%',
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: isDark ? '#2a2a2e' : '#fff', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', borderWidth: 1, titleColor: isDark ? '#f0f0f3' : '#111114', bodyColor: isDark ? '#7a7a85' : '#6b6b76', padding: 10, cornerRadius: 8, callbacks: { label: (ctx: { label: string; parsed: number }) => ` ${ctx.label}  ${usd(ctx.parsed, 2)}` } },
      centerText: { text: usd(spent), color: isDark ? '#f0f0f3' : '#111114', subColor: isDark ? '#7a7a85' : '#afafba' },
    },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 160 }}>
          <DoughnutChart data={donutData} options={donutOpts} />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {cats.slice(0, 8).map(c => (
          <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: getCategoryColor(c, categories), flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-1)' }}>{usd(byCategory[c])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Widget C — Budget Progress
// ══════════════════════════════════════════════════════════════════════════════
function WidgetBudget({ transactions, categories, budget }: { transactions: Transaction[]; categories: Category[]; budget: Record<string, number> }) {
  const { privacyMode } = useBudget();
  const usd = (n: number, d = 0) => privacyMode ? '••••' : '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const byCategory = useMemo(() => {
    const m: Record<string, number> = {};
    transactions.filter(t => !t.excluded && catType(t.category, categories) === 'expense')
      .forEach(t => { m[t.category] = (m[t.category] || 0) + Math.abs(t.amount); });
    return m;
  }, [transactions, categories]);

  const topCats = Object.keys(byCategory)
    .map(c => ({ c, spent: byCategory[c], bud: budget[c] || 0 }))
    .sort((a, b) => b.spent - a.spent).slice(0, 7);

  if (!topCats.length) return <p style={{ fontSize: 12, color: 'var(--text-3)', paddingTop: 20 }}>No spending data yet.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', overflowY: 'auto' }}>
      {topCats.map(({ c, spent, bud }) => {
        const pct = bud > 0 ? Math.min((spent / bud) * 100, 100) : 0;
        const clr = pct >= 90 ? 'var(--red)' : pct >= 70 ? 'var(--amber)' : 'var(--accent)';
        return (
          <div key={c}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: getCategoryColor(c, categories) }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-1)' }}>{c}</span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{usd(spent)} {bud > 0 ? `/ ${usd(bud)}` : ''}</span>
            </div>
            <div className="bar-track"><div className="bar-fill" style={{ '--to': `${pct}%`, width: `${pct}%`, background: clr } as React.CSSProperties} /></div>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Widget D — Recent Transactions
// ══════════════════════════════════════════════════════════════════════════════
function WidgetRecent({ transactions, categories }: { transactions: Transaction[]; categories: Category[] }) {
  const { privacyMode } = useBudget();
  const recent = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8);
  if (!recent.length) return <p style={{ fontSize: 12, color: 'var(--text-3)', paddingTop: 20 }}>No transactions.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', margin: '0 -20px', padding: '0 20px' }}>
      {recent.map((tx, i) => {
        const isIncome = catType(tx.category, categories) === 'income';
        return (
          <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i > 0 ? '1px solid var(--border-2)' : 'none', opacity: tx.excluded ? 0.4 : 1 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: tx.excluded ? 'var(--text-3)' : getCategoryColor(tx.category, categories), flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</p>
              <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{tx.category}</p>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: isIncome ? 'var(--green)' : 'var(--text-1)', flexShrink: 0 }}>
              {privacyMode ? '••••' : `${isIncome ? '+' : '-'}$${Math.abs(tx.amount).toFixed(2)}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Widget E — Spending Trends
// ══════════════════════════════════════════════════════════════════════════════
function WidgetTrends({ allTransactions, categories, budget }: { allTransactions: Transaction[]; categories: Category[]; budget: Record<string, number> }) {
  const { privacyMode } = useBudget();
  const [view, setView] = useState<'spending' | 'cashflow'>('spending');
  const [isDark, setIsDark] = useState(false);
  useEffect(() => { setIsDark(document.documentElement.classList.contains('dark')); }, []);

  const cashFlow = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
      });
    }
    const spendTotals: Record<string, number> = {};
    const incomeTotals: Record<string, number> = {};
    allTransactions.filter(t => !t.excluded).forEach(t => {
      const mk = t.date.slice(0, 7);
      if (catType(t.category, categories) === 'expense') {
        spendTotals[mk]  = (spendTotals[mk]  || 0) + Math.abs(t.amount);
      } else {
        incomeTotals[mk] = (incomeTotals[mk] || 0) + Math.abs(t.amount);
      }
    });
    return {
      labels:     months.map(m => m.label),
      spendAmts:  months.map(m => spendTotals[m.key]  || 0),
      incomeAmts: months.map(m => incomeTotals[m.key] || 0),
    };
  }, [allTransactions, categories]);

  const daily = useMemo(() => {
    const now   = new Date();
    const year  = now.getFullYear(), month = now.getMonth();
    const today = now.getDate();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthKey    = `${year}-${String(month + 1).padStart(2, '0')}`;

    const dailyArr = Array(daysInMonth).fill(0);
    allTransactions
      .filter(t => !t.excluded && catType(t.category, categories) === 'expense' && t.date.startsWith(monthKey))
      .forEach(t => {
        const d = parseInt(t.date.slice(8, 10), 10) - 1;
        if (d >= 0 && d < daysInMonth) dailyArr[d] += Math.abs(t.amount);
      });
    let cum = 0;
    const currentCum: (number | null)[] = dailyArr.map((v, i) => {
      if (i >= today) return null;
      cum += v;
      return Math.round(cum * 100) / 100;
    });
    const totalSpent = (currentCum[today - 1] as number) || 0;

    const past6: number[][] = [];
    for (let mi = 1; mi <= 6; mi++) {
      const d  = new Date(year, month - mi, 1);
      const py = d.getFullYear(), pm = d.getMonth();
      const pmKey  = `${py}-${String(pm + 1).padStart(2, '0')}`;
      const pmDays = new Date(py, pm + 1, 0).getDate();
      const pmArr  = Array(pmDays).fill(0);
      allTransactions
        .filter(t => !t.excluded && catType(t.category, categories) === 'expense' && t.date.startsWith(pmKey))
        .forEach(t => {
          const dd = parseInt(t.date.slice(8, 10), 10) - 1;
          if (dd >= 0 && dd < pmDays) pmArr[dd] += Math.abs(t.amount);
        });
      let c = 0;
      const pmCum = pmArr.map((v: number) => { c += v; return c; });
      const extended = Array.from({ length: daysInMonth }, (_, i) =>
        pmCum[Math.min(i, pmCum.length - 1)] || 0
      );
      past6.push(extended);
    }
    const avgCum = past6.length
      ? Array.from({ length: daysInMonth }, (_, i) =>
          Math.round(past6.reduce((s, m) => s + m[i], 0) / past6.length * 100) / 100
        )
      : Array(daysInMonth).fill(0);

    const budgetTarget = categories
      .filter(c => c.type === 'expense')
      .reduce((s, c) => s + (budget[c.name] || 0), 0);

    const dayLabels  = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
    const pointRadii = currentCum.map((v, i) => (v !== null && i === today - 1) ? 4 : 0);

    return { dayLabels, currentCum, avgCum, budgetTarget, totalSpent, pointRadii };
  }, [allTransactions, categories, budget]);

  const tickColor   = isDark ? '#7a7a85' : '#6b6b76';
  const gridColor   = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const tooltipBase = {
    backgroundColor: isDark ? '#2a2a2e' : '#fff',
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    borderWidth: 1, titleColor: isDark ? '#f0f0f3' : '#111114',
    bodyColor: isDark ? '#7a7a85' : '#6b6b76',
    padding: 8, cornerRadius: 8,
    callbacks: { label: (ctx: { parsed: { y: number } }) => privacyMode ? ' ••••' : ` $${(ctx.parsed.y || 0).toLocaleString()}` },
  };
  const commonScales = {
    x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 } }, border: { display: false } },
    y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 }, callback: (v: number | string) => privacyMode ? '••••' : '$' + Number(v).toLocaleString() }, border: { display: false } },
  };

  const dailyChartData = {
    labels: daily.dayLabels,
    datasets: [
      { label: 'This Month', data: daily.currentCum, borderColor: '#5b57f5', borderWidth: 2, tension: 0.4, pointRadius: daily.pointRadii, pointBackgroundColor: '#5b57f5', fill: false, spanGaps: false },
      { label: 'Monthly Avg', data: daily.avgCum, borderColor: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)', borderDash: [4, 4], borderWidth: 1.5, tension: 0.4, pointRadius: 0, fill: false },
      ...(daily.budgetTarget > 0 ? [{
        label: 'Budget Target', data: Array(daily.dayLabels.length).fill(daily.budgetTarget),
        borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)', borderDash: [6, 4], borderWidth: 1, pointRadius: 0, fill: false,
      }] : []),
    ],
  };
  const dailyOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: true, position: 'top' as const, labels: { color: tickColor, font: { size: 10 }, boxWidth: 10, padding: 10 } }, tooltip: tooltipBase },
    scales: commonScales,
  };

  const cashFlowData = {
    labels: cashFlow.labels,
    datasets: [
      { label: 'Income',   data: cashFlow.incomeAmts, backgroundColor: '#34d399', borderRadius: 4, borderSkipped: false as const },
      { label: 'Spending', data: cashFlow.spendAmts,  backgroundColor: '#5b57f5', borderRadius: 4, borderSkipped: false as const },
    ],
  };
  const cashFlowOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: true, position: 'top' as const, labels: { color: tickColor, font: { size: 10 }, boxWidth: 10, padding: 10 } }, tooltip: tooltipBase },
    scales: commonScales,
  };

  const left = daily.budgetTarget - daily.totalSpent;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexShrink: 0 }}>
        {([['spending', 'Monthly Spending'], ['cashflow', 'Cash Flow']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setView(v)}
            style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: `1px solid ${view === v ? 'var(--accent)' : 'var(--border)'}`, background: view === v ? 'var(--accent)' : 'transparent', color: view === v ? '#fff' : 'var(--text-2)', transition: 'all 0.12s' }}>
            {l}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {view === 'spending'
          ? <LineChart data={dailyChartData} options={dailyOpts} />
          : <BarChart  data={cashFlowData}   options={cashFlowOpts} />
        }
      </div>
      {view === 'spending' && (
        <div style={{ display: 'flex', gap: 16, marginTop: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#5b57f5', fontWeight: 600 }}>{privacyMode ? '••••' : `$${daily.totalSpent.toFixed(2)}`} spent</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: left >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {privacyMode ? '••••' : `$${Math.abs(left).toFixed(2)}`} {left >= 0 ? 'left' : 'over budget'}
          </span>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Widget F — Net Worth
// ══════════════════════════════════════════════════════════════════════════════
function WidgetNetWorth() {
  const { privacyMode } = useBudget();
  const usd = (n: number, d = 0) => privacyMode ? '••••' : '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const [nw, setNw] = useState<NetWorthData>({ assets: [], liabilities: [] });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setNw(loadNetWorth());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveNetWorth(nw);
  }, [nw, loaded]);

  const totalAssets      = nw.assets.reduce((s, i) => s + (i.amount || 0), 0);
  const totalLiabilities = nw.liabilities.reduce((s, i) => s + (i.amount || 0), 0);
  const netWorth         = totalAssets - totalLiabilities;

  const updateItem = (section: 'assets' | 'liabilities', id: number, amount: number) =>
    setNw(prev => ({ ...prev, [section]: prev[section].map(item => item.id === id ? { ...item, amount } : item) }));

  const addItem = (section: 'assets' | 'liabilities') => {
    const name = window.prompt(`New ${section === 'assets' ? 'asset' : 'liability'} name:`);
    if (!name?.trim()) return;
    setNw(prev => ({ ...prev, [section]: [...prev[section], { id: Date.now(), name: name.trim(), amount: 0 }] }));
  };

  const removeItem = (section: 'assets' | 'liabilities', id: number) =>
    setNw(prev => ({ ...prev, [section]: prev[section].filter(i => i.id !== id) }));

  const NwSection = ({ label, section, items }: { label: string; section: 'assets' | 'liabilities'; items: NwItem[] }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)' }}>{label}</span>
        <button onClick={() => addItem(section)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--accent)', padding: 0 }}>+ Add</button>
      </div>
      {items.map(item => (
        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}
          onMouseEnter={e => { const del = e.currentTarget.querySelector<HTMLElement>('.nw-del'); if (del) del.style.opacity = '1'; }}
          onMouseLeave={e => { const del = e.currentTarget.querySelector<HTMLElement>('.nw-del'); if (del) del.style.opacity = '0'; }}>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
          <EditableAmount value={item.amount} onSave={v => updateItem(section, item.id, v)} />
          <button className="nw-del" onClick={() => removeItem(section, item.id)}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 12, padding: '0 2px', opacity: 0, transition: 'opacity 0.1s' }}>×</button>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ marginBottom: 14, flexShrink: 0 }}>
        <p style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Net Worth</p>
        <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: netWorth >= 0 ? 'var(--green)' : 'var(--red)', lineHeight: 1.2, marginTop: 2 }}>
          {netWorth < 0 ? '-' : ''}{usd(netWorth)}
        </p>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <NwSection label="Assets"      section="assets"      items={nw.assets} />
        <NwSection label="Liabilities" section="liabilities" items={nw.liabilities} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Widget G — Recurring Bills
// ══════════════════════════════════════════════════════════════════════════════
function WidgetRecurring({ allTransactions, categories }: { allTransactions: Transaction[]; categories: Category[] }) {
  const { privacyMode } = useBudget();
  const recurring = useMemo((): RecurringItem[] => {
    const groups = new Map<string, Transaction[]>();
    allTransactions
      .filter((t) => t.isRecurring && !t.excluded && t.amount > 0)
      .forEach((t) => {
        const key = (t.description || '').toLowerCase().trim();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(t);
      });
    return Array.from(groups.values())
      .map((txs) => {
        const amounts = txs.map((t) => Math.abs(t.amount));
        const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        return {
          description: txs[0].description,
          avgAmount:   avg,
          category:    txs[0].category,
          frequency:   txs[0].recurringFrequency ?? 'Recurring',
        };
      })
      .sort((a, b) => b.avgAmount - a.avgAmount);
  }, [allTransactions]);

  if (!recurring.length) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, color: 'var(--text-3)' }}>
      <p style={{ fontSize: 12 }}>No recurring transactions detected yet</p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      {recurring.slice(0, 10).map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i > 0 ? '1px solid var(--border-2)' : 'none' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: getCategoryColor(r.category, categories), flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</p>
            <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{r.frequency} · {r.category}</p>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', flexShrink: 0 }}>{privacyMode ? '••••' : `$${r.avgAmount.toFixed(2)}`}/mo</span>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Dashboard root
// ══════════════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const { txs: allTransactions, filteredTxs: transactions, categories, budget } = useBudget();

  const [layout, setLayout]       = useState<LayoutItem[]>(DEFAULT_LAYOUT);
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() => Object.fromEntries(ALL_WIDGETS.map(w => [w.id, true])));
  const [showCustom, setShowCustom] = useState(false);
  const [mounted, setMounted]     = useState(false);
  const customizeRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth]         = useState(1200);

  // Hydrate from localStorage on client
  useEffect(() => {
    const saved = loadLayout();
    if (saved) {
      const savedIds = new Set(saved.map((l: LayoutItem) => l.i));
      const missing  = DEFAULT_LAYOUT.filter(dl => !savedIds.has(dl.i));
      setLayout([...saved, ...missing]);
    }
    setVisibility(loadVisibility());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!showCustom) return;
    const handler = (e: MouseEvent) => {
      if (customizeRef.current && !customizeRef.current.contains(e.target as Node)) setShowCustom(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCustom]);

  const onLayoutChange = (newLayout: readonly LayoutItem[]) => { const ml = [...newLayout]; setLayout(ml); saveLayout(ml); };
  const resetLayout = () => {
    const defaultVis = Object.fromEntries(ALL_WIDGETS.map(w => [w.id, true]));
    setLayout(DEFAULT_LAYOUT);    saveLayout(DEFAULT_LAYOUT);
    setVisibility(defaultVis);    saveVisibility(defaultVis);
  };
  const toggleWidget = (id: string) => {
    setVisibility(prev => {
      const next = { ...prev, [id]: !prev[id] };
      saveVisibility(next);
      return next;
    });
  };

  const ROW_HEIGHT   = 60;
  const activeLayout = layout.filter(item => visibility[item.i] !== false);

  const widgets: Record<string, React.ReactNode> = {
    stats:     <WidgetStats     transactions={transactions} categories={categories} />,
    donut:     <Widget title="Spending by Category"><WidgetDonut     transactions={transactions} categories={categories} /></Widget>,
    budget:    <Widget title="Budget Progress">    <WidgetBudget    transactions={transactions} categories={categories} budget={budget} /></Widget>,
    recent:    <Widget title="Recent Transactions"><WidgetRecent    transactions={transactions} categories={categories} /></Widget>,
    trends:    <Widget title="Spending Trends">    <WidgetTrends    allTransactions={allTransactions} categories={categories} budget={budget} /></Widget>,
    networth:  <Widget title="Net Worth">          <WidgetNetWorth /></Widget>,
    recurring: <Widget title="Recurring Bills">    <WidgetRecurring allTransactions={allTransactions} categories={categories} /></Widget>,
  };

  // Show placeholder until mounted (avoids SSR/hydration mismatch for GridLayout)
  if (!mounted) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--text-3)', fontSize: 13 }}>
        Loading dashboard...
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
        <div ref={customizeRef} style={{ position: 'relative' }}>
          <button onClick={() => setShowCustom(v => !v)} className="btn" style={{ fontSize: 11, padding: '4px 10px' }}>
            Customize
          </button>
          {showCustom && (
            <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 100, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', padding: 16, minWidth: 220 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>Widgets</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ALL_WIDGETS.map(w => {
                  const enabled = visibility[w.id] !== false;
                  return (
                    <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleWidget(w.id)}>
                      <div style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, background: enabled ? 'var(--accent)' : 'transparent', border: `2px solid ${enabled ? 'var(--accent)' : 'var(--border)'}`, transition: 'all 0.12s' }} />
                      <span style={{ fontSize: 13, color: enabled ? 'var(--text-2)' : 'var(--text-3)' }}>{w.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <button onClick={resetLayout} className="btn" style={{ fontSize: 11, padding: '4px 10px' }}>Reset Layout</button>
      </div>

      <GridLayout
        layout={activeLayout}
        cols={12}
        rowHeight={ROW_HEIGHT}
        width={width}
        onLayoutChange={onLayoutChange}
        draggableHandle=".drag-handle"
        margin={[12, 12]}
        containerPadding={[0, 0]}
      >
        {activeLayout.map(item => (
          <div key={item.i}>{widgets[item.i]}</div>
        ))}
      </GridLayout>

      <style>{`
        .react-grid-item.react-grid-placeholder { background: var(--accent) !important; opacity: 0.12 !important; border-radius: 12px; }
        .react-resizable-handle { opacity: 0; transition: opacity 0.15s; }
        .react-grid-item:hover .react-resizable-handle { opacity: 0.4; }
      `}</style>
    </div>
  );
}

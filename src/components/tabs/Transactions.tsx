'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useBudget } from '@/lib/BudgetContext';
import { getCategoryColor, getCategoriesByType } from '@/lib/constants';
import { importCSV } from '@/lib/csvImport';
import type { Transaction, Category } from '@/lib/types';

// ── Helpers ────────────────────────────────────────────────────────────────────
function usd(n: number, d = 2) {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtDate(s: string) {
  const d = new Date(s + 'T00:00:00');
  const t = new Date(); t.setHours(0,0,0,0);
  const y = new Date(t); y.setDate(y.getDate() - 1);
  if (+d === +t) return 'Today';
  if (+d === +y) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function catType(name: string, categories: Category[]) {
  return categories.find((c) => c.name === name)?.type ?? 'expense';
}
function hexToRgba(hex: string, a: number) {
  if (!hex || !hex.startsWith('#')) return `rgba(120,120,120,${a})`;
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
function loadUserTags(): string[] {
  try { return JSON.parse(localStorage.getItem('userTags') ?? 'null') || []; } catch { return []; }
}

// ── Icons ──────────────────────────────────────────────────────────────────────
function Icon({ d, size = 12 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
const IC = {
  trash:  'M1.5 3.5h11M5 3.5V2a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1.5M5.5 6v5M8.5 6v5M2.5 3.5l.7 8.5A.5.5 0 003.7 12.5h6.6a.5.5 0 00.5-.5l.7-8.5',
  import: 'M7 9V1m0 8L4 6m3 3l3-3M1 12h12',
  export: 'M7 5V13m0-8l-3 3m3-3l3 3M1 2h12',
  plus:   'M6 1v10M1 6h10',
  close:  'M1 1l12 12M13 1L1 13',
  chevD:  'M2 5l5 5 5-5',
  tag:    'M1.5 1.5h5l6 6-5 5-6-6v-5zM4 4h.01',
  check:  'M2 7l4 4 6-6',
};

// ── Modal ──────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, maxWidth = 400 }: { title: string; onClose: () => void; children: React.ReactNode; maxWidth?: number }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}>
      <div className="card" style={{ width: '100%', maxWidth, padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>{title}</span>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}><Icon d={IC.close} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Transaction form ───────────────────────────────────────────────────────────
function TxForm({ initial, categories, onSave, onClose }: { initial?: Transaction; categories: Category[]; onSave: (d: Partial<Transaction>) => void; onClose: () => void }) {
  const today = new Date().toISOString().split('T')[0];
  const [f, setF] = useState({
    date:     initial?.date     ?? today,
    desc:     initial?.description ?? '',
    amount:   initial ? String(Math.abs(initial.amount)) : '',
    category: initial?.category ?? 'Other',
    type:     initial ? (catType(initial.category, categories) === 'income' ? 'income' : 'expense') : 'expense',
  });
  const upd = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const incomeCats  = getCategoriesByType(categories, 'income');
  const expenseCats = getCategoriesByType(categories, 'expense');
  const visibleCats = f.type === 'income' ? incomeCats : expenseCats;
  const switchType  = (t: string) => {
    const cats = t === 'income' ? incomeCats : expenseCats;
    const keep = cats.find((c) => c.name === f.category);
    upd('type', t);
    if (!keep && cats.length) upd('category', cats[0].name);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(f.amount);
    if (isNaN(amt) || amt <= 0) return;
    onSave({ date: f.date, description: f.desc.trim() || 'Transaction', amount: f.type === 'income' ? -amt : amt, category: f.category });
  };
  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 8, padding: 3, gap: 3, border: '1px solid var(--border)' }}>
        {[['expense','Expense'],['income','Income']].map(([v, l]) => (
          <button key={v} type="button" onClick={() => switchType(v)}
            style={{ flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 500, borderRadius: 6, border: 'none', cursor: 'pointer', background: f.type === v ? (v === 'expense' ? 'var(--red)' : 'var(--green)') : 'transparent', color: f.type === v ? '#fff' : 'var(--text-2)' }}>
            {l}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label className="label" style={{ display: 'block', marginBottom: 5 }}>Date</label>
          <input type="date" value={f.date} onChange={(e) => upd('date', e.target.value)} style={{ width: '100%' }} required />
        </div>
        <div>
          <label className="label" style={{ display: 'block', marginBottom: 5 }}>Amount</label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', fontSize: 13, pointerEvents: 'none' }}>$</span>
            <input type="number" placeholder="0.00" min="0.01" step="0.01" value={f.amount} onChange={(e) => upd('amount', e.target.value)} style={{ width: '100%', paddingLeft: 22 }} required />
          </div>
        </div>
      </div>
      <div>
        <label className="label" style={{ display: 'block', marginBottom: 5 }}>Description</label>
        <input type="text" placeholder="e.g. Trader Joe's" value={f.desc} onChange={(e) => upd('desc', e.target.value)} style={{ width: '100%' }} />
      </div>
      <div>
        <label className="label" style={{ display: 'block', marginBottom: 5 }}>Category</label>
        <select value={f.category} onChange={(e) => upd('category', e.target.value)} style={{ width: '100%' }}>
          {visibleCats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button type="button" onClick={onClose} className="btn" style={{ flex: 1, justifyContent: 'center' }}>Cancel</button>
        <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Save</button>
      </div>
    </form>
  );
}

// ── Split modal ────────────────────────────────────────────────────────────────
function SplitModal({ tx, categories, onSplit, onClose }: { tx: Transaction; categories: Category[]; onSplit: (id: string, splits: Array<{description: string; amount: number; category: string}>) => void; onClose: () => void }) {
  const expenseCats = getCategoriesByType(categories, 'expense');
  const incomeCats  = getCategoriesByType(categories, 'income');
  const isIncome    = catType(tx.category, categories) === 'income';
  const visibleCats = isIncome ? incomeCats : expenseCats;
  const total       = Math.abs(tx.amount);
  type SplitRow = { description: string; amount: string; category: string };
  const [splits, setSplits] = useState<SplitRow[]>(
    tx.splitChildren?.length
      ? tx.splitChildren.map((c) => ({ description: c.description, amount: String(Math.abs(c.amount)), category: c.category }))
      : [
          { description: tx.description, amount: String(total), category: tx.category },
          { description: '',             amount: '',             category: tx.category },
        ]
  );
  const updateSplit = (i: number, key: string, val: string) => setSplits((p) => p.map((s, j) => j === i ? { ...s, [key]: val } : s));
  const addRow      = () => setSplits((p) => [...p, { description: '', amount: '', category: tx.category }]);
  const removeRow   = (i: number) => setSplits((p) => p.filter((_, j) => j !== i));
  const splitSum = splits.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const diff     = Math.round((total - splitSum) * 100) / 100;
  const valid    = diff === 0 && splits.length >= 2 && splits.every((s) => parseFloat(s.amount) > 0);
  const submit   = () => {
    if (!valid) return;
    onSplit(tx.id, splits.map((s) => ({ description: s.description || tx.description, amount: isIncome ? -parseFloat(s.amount) : parseFloat(s.amount), category: s.category })));
    onClose();
  };
  return (
    <Modal title="Split transaction" onClose={onClose} maxWidth={480}>
      <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>
        Total: <strong style={{ color: 'var(--text-1)' }}>${total.toFixed(2)}</strong>
        {diff !== 0 && <span style={{ color: 'var(--red)', marginLeft: 8 }}>remaining: ${Math.abs(diff).toFixed(2)}</span>}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
        {splits.map((s, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 120px 28px', gap: 6, alignItems: 'center' }}>
            <input type="text" placeholder="Description" value={s.description} onChange={(e) => updateSplit(i, 'description', e.target.value)} style={{ fontSize: 12 }} />
            <input type="number" placeholder="0.00" min="0.01" step="0.01" value={s.amount} onChange={(e) => updateSplit(i, 'amount', e.target.value)} style={{ fontSize: 12, textAlign: 'right' }} />
            <select value={s.category} onChange={(e) => updateSplit(i, 'category', e.target.value)} style={{ fontSize: 12 }}>
              {visibleCats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            <button onClick={() => removeRow(i)} disabled={splits.length <= 2}
              style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 5, background: 'none', cursor: splits.length <= 2 ? 'default' : 'pointer', color: 'var(--text-3)', opacity: splits.length <= 2 ? 0.3 : 1 }}>
              <Icon d={IC.close} />
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={addRow} className="btn" style={{ fontSize: 12, padding: '6px 12px' }}>+ Row</button>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} className="btn" style={{ fontSize: 12 }}>Cancel</button>
        <button onClick={submit} disabled={!valid} className="btn btn-primary" style={{ fontSize: 12, opacity: valid ? 1 : 0.4, cursor: valid ? 'pointer' : 'default' }}>Split</button>
      </div>
    </Modal>
  );
}

// ── Filter popover ─────────────────────────────────────────────────────────────
interface FilterItem { id: string; label: string; color?: string }
function FilterPopover({ pos, items, selected, onToggle, onClear, onClose, title, deletableIds, onDeleteItem }: {
  pos: DOMRect; items: FilterItem[]; selected: Set<string>;
  onToggle: (id: string) => void; onClear: () => void; onClose: () => void; title: string;
  deletableIds?: Set<string>; onDeleteItem?: (id: string) => void;
}) {
  const ref  = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const shown = q ? items.filter((it) => it.label.toLowerCase().includes(q.toLowerCase())) : items;
  const allSelected = items.length > 0 && items.every((it) => selected.has(it.id));

  return (
    <div ref={ref} style={{ position: 'fixed', top: pos.bottom + 6, left: pos.left, zIndex: 300, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, width: 240, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-2)' }}>
        <input autoFocus placeholder={`Search ${title.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)}
          style={{ width: '100%', height: 28, fontSize: 12, padding: '0 8px', borderRadius: 6, boxSizing: 'border-box', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
      </div>
      <div style={{ padding: '5px 10px', borderBottom: '1px solid var(--border-2)', display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={() => items.forEach((it) => !selected.has(it.id) && onToggle(it.id))}
          style={{ fontSize: 11, color: allSelected ? 'var(--text-3)' : 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>Select all</button>
        <button onClick={onClear} style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>Clear</button>
      </div>
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        {shown.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-3)', padding: '12px 12px', textAlign: 'center' }}>No results</p>}
        {shown.map((it) => (
          <label key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', fontSize: 13, color: 'var(--text-1)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--card-alt)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
            <input type="checkbox" checked={selected.has(it.id)} onChange={() => onToggle(it.id)} style={{ width: 13, height: 13, flexShrink: 0, accentColor: 'var(--accent)' }} />
            {it.color && <span style={{ width: 7, height: 7, borderRadius: '50%', background: it.color, flexShrink: 0 }} />}
            <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
            {deletableIds?.has(it.id) && onDeleteItem && (
              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDeleteItem(it.id); }}
                title="Delete tag"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '0 2px', lineHeight: 1, fontSize: 14, flexShrink: 0, opacity: 0.6 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.opacity = '1'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.opacity = '0.6'; }}>
                ×
              </button>
            )}
          </label>
        ))}
      </div>
      <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border-2)' }}>
        <button onClick={onClose} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: 12, height: 30 }}>Apply</button>
      </div>
    </div>
  );
}

// ── Inline category popover ────────────────────────────────────────────────────
function InlineCatPopover({ pos, tx, categories, onSelect, onClose }: { pos: DOMRect; tx: Transaction; categories: Category[]; onSelect: (cat: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  const shown = q ? categories.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())) : categories;
  return (
    <div ref={ref} style={{ position: 'fixed', top: pos.bottom + 4, left: pos.left, zIndex: 300, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, width: 210, boxShadow: '0 6px 24px rgba(0,0,0,0.28)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '7px 8px', borderBottom: '1px solid var(--border-2)' }}>
        <input autoFocus placeholder="Find category…" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ width: '100%', height: 26, fontSize: 12, padding: '0 8px', borderRadius: 5, boxSizing: 'border-box', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {shown.map((c) => (
          <button key={c.id} onClick={() => onSelect(c.name)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', color: c.name === tx.category ? 'var(--accent)' : 'var(--text-1)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--card-alt)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: getCategoryColor(c.name, categories), flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
            {c.name === tx.category && <Icon d={IC.check} size={11} />}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Detail slide-in panel ──────────────────────────────────────────────────────
function DetailPanel({ tx, categories, onEdit, onDelete, onExclude, onSplit, onClose, userTags, onUpdateUserTags }: {
  tx: Transaction; categories: Category[];
  onEdit: (id: string, u: Partial<Transaction>) => void;
  onDelete: (id: string) => void;
  onExclude: (id: string, excluded: boolean) => void;
  onSplit: ((id: string, splits: Array<{description: string; amount: number; category: string}>) => void) | null;
  onClose: () => void;
  userTags: string[];
  onUpdateUserTags: (tags: string[]) => void;
}) {
  const [visible,   setVisible]   = useState(false);
  const [cat,       setCat]       = useState(tx.category);
  const [notes,     setNotes]     = useState(tx.notes ?? '');
  const [tags,      setTags]      = useState(tx.tags ?? []);
  const [tagInput,  setTagInput]  = useState('');
  const [splitting, setSplitting] = useState(false);

  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);
  useEffect(() => { setCat(tx.category); setNotes(tx.notes ?? ''); setTags(tx.tags ?? []); }, [tx.id]); // eslint-disable-line
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const isIncome    = catType(cat, categories) === 'income';
  const catColor    = getCategoryColor(cat, categories);
  const needsReview = tx.needsReview && !tx.reviewed;

  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/\s+/g, '-');
    if (!t || tags.includes(t)) return;
    const next = [...tags, t];
    setTags(next);
    onUpdateUserTags([...new Set([...userTags, t])]);
  };

  const removeTag = (t: string) => {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    onEdit(tx.id, { tags: next });
  };

  const save = () => { onEdit(tx.id, { category: cat, notes, tags, needsReview: false }); onClose(); };
  const markReviewed = () => { onEdit(tx.id, { reviewed: true, needsReview: false }); onClose(); };
  const del  = () => { onDelete(tx.id); onClose(); };

  const tagSuggestions = tagInput.trim()
    ? userTags.filter((t) => t.includes(tagInput.toLowerCase().trim()) && !tags.includes(t)).slice(0, 4)
    : [];

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 39 }} />
      <div onClick={(e) => e.stopPropagation()} style={{
        position: 'fixed', right: 0, top: 52, width: 360, height: 'calc(100vh - 52px)',
        background: 'var(--panel)', borderLeft: '1px solid var(--border)',
        zIndex: 40, display: 'flex', flexDirection: 'column',
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.2s ease',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
              {new Date(tx.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, flexShrink: 0, marginTop: 2 }}>
            <Icon d={IC.close} size={13} />
          </button>
        </div>

        <div style={{ padding: '20px 20px 16px', textAlign: 'center', borderBottom: '1px solid var(--border-2)', flexShrink: 0 }}>
          <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: isIncome ? 'var(--green)' : 'var(--text-1)' }}>
            {isIncome ? '+' : '-'}{usd(tx.amount, 2)}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {tx.excluded  && <span style={{ fontSize: 11, color: 'var(--amber)' }}>Excluded from totals</span>}
            {needsReview  && <span style={{ fontSize: 11, color: 'var(--amber)' }}>● AI-categorized — needs review</span>}
            {tx.reviewed  && <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ Reviewed</span>}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {needsReview && (
            <button onClick={markReviewed} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', height: 34, fontSize: 12, fontWeight: 500, color: 'var(--green)', background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 7, cursor: 'pointer' }}>
              <Icon d={IC.check} size={11} /> Mark as reviewed
            </button>
          )}

          <div>
            <label className="label" style={{ display: 'block', marginBottom: 6 }}>Category</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: catColor, flexShrink: 0, transition: 'background 0.15s' }} />
              <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ flex: 1 }}>
                {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {tx.account && (
            <div>
              <label className="label" style={{ display: 'block', marginBottom: 6 }}>Account</label>
              <p style={{ fontSize: 13, color: 'var(--text-2)', padding: '8px 12px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>{tx.account}</p>
            </div>
          )}

          <div>
            <label className="label" style={{ display: 'block', marginBottom: 6 }}>Notes</label>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add a note…"
              style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 13, padding: '8px 12px', lineHeight: 1.5, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-1)', boxSizing: 'border-box' }} />
          </div>

          <div>
            <label className="label" style={{ display: 'block', marginBottom: 6 }}>Tags</label>
            {tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                {tags.map((t) => (
                  <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 500, padding: '2px 8px 2px 7px', borderRadius: 99, background: 'rgba(91,87,245,0.12)', color: 'var(--accent)', border: '1px solid rgba(91,87,245,0.2)' }}>
                    #{t}
                    <button onClick={() => removeTag(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: '0 0 0 2px', lineHeight: 1, fontSize: 14, opacity: 0.6, flexShrink: 0 }}>×</button>
                  </span>
                ))}
              </div>
            )}
            <input type="text" placeholder="Add tag and press Enter" value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); setTagInput(''); } }}
              style={{ width: '100%', height: 30, fontSize: 12, padding: '0 8px', borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
            {tagSuggestions.length > 0 && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
                {tagSuggestions.map((t) => (
                  <button key={t} onClick={() => { addTag(t); setTagInput(''); }}
                    style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-2)', cursor: 'pointer' }}>
                    #{t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {tx.isSplit && tx.splitChildren && (
            <div>
              <label className="label" style={{ display: 'block', marginBottom: 6 }}>Split breakdown</label>
              <div style={{ background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
                {tx.splitChildren.map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: i < tx.splitChildren!.length - 1 ? '1px solid var(--border-2)' : 'none' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: getCategoryColor(c.category, categories), flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>{c.category}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-1)', flexShrink: 0, marginLeft: 4 }}>{usd(c.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {onSplit && !tx.splitParentId && !tx.excluded && (
              <button onClick={() => setSplitting(true)}
                style={{ fontSize: 12, color: 'var(--accent)', background: 'rgba(91,87,245,0.08)', border: '1px solid rgba(91,87,245,0.2)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>
                Split transaction
              </button>
            )}
            <button onClick={() => { onExclude(tx.id, !tx.excluded); onClose(); }}
              style={{ fontSize: 12, color: tx.excluded ? 'var(--green)' : 'var(--amber)', background: tx.excluded ? 'rgba(52,211,153,0.08)' : 'rgba(245,162,0,0.08)', border: `1px solid ${tx.excluded ? 'rgba(52,211,153,0.25)' : 'rgba(245,162,0,0.25)'}`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>
              {tx.excluded ? 'Include in totals' : 'Exclude from totals'}
            </button>
          </div>
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <button onClick={save} className="btn btn-primary" style={{ justifyContent: 'center', fontSize: 13, height: 38 }}>Save changes</button>
          <button onClick={del}
            style={{ width: '100%', height: 36, fontSize: 13, fontWeight: 500, color: 'var(--red)', background: 'none', border: '1px solid rgba(242,70,58,0.25)', borderRadius: 8, cursor: 'pointer' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(242,70,58,0.07)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
            Delete transaction
          </button>
        </div>
      </div>

      {splitting && onSplit && (
        <SplitModal tx={tx} categories={categories} onSplit={(id, splits) => { onSplit(id, splits); onClose(); }} onClose={() => setSplitting(false)} />
      )}
    </>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function Transactions() {
  const { filteredTxs, txs: allTxs, categories, addTx, deleteTx, editTx, importTxs, excludeTx, splitTx } = useBudget();

  const [showAdd,         setShowAdd]         = useState(false);
  const [selectedId,      setSelectedId]      = useState<string | null>(null);
  const [catFilters,      setCatFilters]      = useState(new Set<string>());
  const [tagFilters,      setTagFilters]      = useState(new Set<string>());
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);
  const [search,          setSearch]          = useState('');
  const [sort,            setSort]            = useState('date-desc');
  const [minAmt,          setMinAmt]          = useState('');
  const [maxAmt,          setMaxAmt]          = useState('');
  const [notice,          setNotice]          = useState<{ok: boolean; msg: string} | null>(null);
  const [catFilterOpen,   setCatFilterOpen]   = useState(false);
  const [catFilterRect,   setCatFilterRect]   = useState<DOMRect | null>(null);
  const [tagFilterOpen,   setTagFilterOpen]   = useState(false);
  const [tagFilterRect,   setTagFilterRect]   = useState<DOMRect | null>(null);
  const [inlineCat,       setInlineCat]       = useState<{txId: string; pos: DOMRect} | null>(null);
  const [userTags,        setUserTags]        = useState<string[]>([]);

  useEffect(() => { setUserTags(loadUserTags()); }, []);

  const fileRef = useRef<HTMLInputElement>(null);
  const selectedTx = selectedId ? (allTxs.find((t) => t.id === selectedId) ?? null) : null;

  const handleUpdateUserTags = useCallback((tags: string[]) => {
    setUserTags(tags);
    localStorage.setItem('userTags', JSON.stringify(tags));
  }, []);

  const allTagsList = useMemo(() => {
    const txTags = allTxs.flatMap((t) => t.tags ?? []);
    return [...new Set([...userTags, ...txTags])].sort();
  }, [allTxs, userTags]);

  const usedTagIds = useMemo(() => new Set(allTxs.flatMap((t) => t.tags ?? [])), [allTxs]);
  const unusedTagIds = useMemo(() => new Set(allTagsList.filter((t) => !usedTagIds.has(t))), [allTagsList, usedTagIds]);
  const handleDeleteTag = useCallback((tagId: string) => {
    handleUpdateUserTags(userTags.filter((t) => t !== tagId));
  }, [userTags, handleUpdateUserTags]);

  const filtered = filteredTxs
    .filter((t) => {
      if (needsReviewOnly) return t.needsReview && !t.reviewed;
      if (catFilters.size > 0) return catFilters.has(t.category);
      return true;
    })
    .filter((t) => tagFilters.size === 0 || (t.tags ?? []).some((tag) => tagFilters.has(tag)))
    .filter((t) => !search || (t.description ?? '').toLowerCase().includes(search.toLowerCase()))
    .filter((t) => {
      const abs = Math.abs(t.amount);
      if (minAmt !== '' && abs < parseFloat(minAmt)) return false;
      if (maxAmt !== '' && abs > parseFloat(maxAmt)) return false;
      return true;
    });

  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case 'date-asc':    return new Date(a.date).getTime() - new Date(b.date).getTime();
      case 'amount-high': return Math.abs(b.amount) - Math.abs(a.amount);
      case 'amount-low':  return Math.abs(a.amount) - Math.abs(b.amount);
      case 'merchant-az': return (a.description ?? '').localeCompare(b.description ?? '');
      default:            return new Date(b.date).getTime() - new Date(a.date).getTime();
    }
  });

  const seenDates: string[] = [];
  const groups: Record<string, Transaction[]> = {};
  for (const tx of sorted) {
    if (!groups[tx.date]) { seenDates.push(tx.date); groups[tx.date] = []; }
    groups[tx.date].push(tx);
  }

  const income = sorted.filter((t) => !t.excluded && catType(t.category, categories) === 'income').reduce((s, t) => s + Math.abs(t.amount), 0);
  const spent  = sorted.filter((t) => !t.excluded && catType(t.category, categories) === 'expense').reduce((s, t) => s + Math.abs(t.amount), 0);
  const daySpent = (dateKey: string) => (groups[dateKey] ?? []).reduce((sum, t) => sum + (!t.excluded && catType(t.category, categories) === 'expense' ? Math.abs(t.amount) : 0), 0);
  const needsReviewCount = filteredTxs.filter((t) => t.needsReview && !t.reviewed).length;

  const handleExport = () => {
    const header = 'Date,Description,Amount,Category,Account,Tags';
    const rows = sorted.map((t) => [t.date, `"${(t.description ?? '').replace(/"/g, '""')}"`, t.amount, t.category, t.account ?? '', (t.tags ?? []).join(';')].join(','));
    const csv  = [header, ...rows].join('\n');
    const url  = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a    = document.createElement('a');
    a.href = url; a.download = 'transactions.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNotice(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = importCSV(ev.target!.result as string, categories);
        if (!parsed.length) { setNotice({ ok: false, msg: 'No valid transactions found.' }); return; }
        void importTxs(parsed);
        setNotice({ ok: true, msg: `Imported ${parsed.length} transaction${parsed.length !== 1 ? 's' : ''}.` });
        setTimeout(() => setNotice(null), 4000);
      } catch (err) {
        setNotice({ ok: false, msg: (err as Error).message || 'Failed to parse CSV.' });
      }
    };
    reader.onerror = () => setNotice({ ok: false, msg: 'Could not read file.' });
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCatPillClick = (e: React.MouseEvent, tx: Transaction) => {
    e.stopPropagation();
    if (inlineCat?.txId === tx.id) { setInlineCat(null); return; }
    setInlineCat({ txId: tx.id, pos: (e.currentTarget as HTMLElement).getBoundingClientRect() });
  };

  const openCatFilter = (e: React.MouseEvent) => { setCatFilterRect((e.currentTarget as HTMLElement).getBoundingClientRect()); setCatFilterOpen((v) => !v); setTagFilterOpen(false); };
  const openTagFilter = (e: React.MouseEvent) => { setTagFilterRect((e.currentTarget as HTMLElement).getBoundingClientRect()); setTagFilterOpen((v) => !v); setCatFilterOpen(false); };

  const catItems = categories.map((c) => ({ id: c.name, label: c.name, color: getCategoryColor(c.name, categories) }));
  const tagItems = allTagsList.map((t) => ({ id: t, label: `#${t}` }));
  const filterActive = catFilters.size > 0 || tagFilters.size > 0 || needsReviewOnly;

  const ctrl = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    height: 36, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5,
    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
    color: 'var(--text-1)', cursor: 'pointer', padding: '0 10px', whiteSpace: 'nowrap', flexShrink: 0, ...extra,
  });

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', width: '100%' }}>
      {/* Row 1: Stats + Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 24 }}>
          {([['Income', income, 'var(--green)'], ['Spent', spent, 'var(--text-1)']] as const).map(([lbl, val, clr]) => (
            <div key={lbl}>
              <p className="label">{lbl}</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: clr, letterSpacing: '-0.01em' }}>{usd(val, 2)}</p>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          <button className="btn" onClick={handleExport} disabled={sorted.length === 0} style={{ opacity: sorted.length === 0 ? 0.4 : 1, fontSize: 12, padding: '6px 12px' }}>
            <Icon d={IC.export} /> Export
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()} style={{ fontSize: 12, padding: '6px 12px' }}>
            <Icon d={IC.import} /> Import
          </button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImport} />
          <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ fontSize: 12, padding: '6px 12px' }}>
            <Icon d={IC.plus} /> Add
          </button>
        </div>
      </div>

      {/* Row 2: Toolbar */}
      <div style={{ display: 'flex', gap: 7, marginBottom: 14, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 140 }}>
          <svg width={13} height={13} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }}>
            <circle cx="6" cy="6" r="4"/><path d="M10 10l2.5 2.5"/>
          </svg>
          <input type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', height: 36, paddingLeft: 30, paddingRight: 10, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-1)', boxSizing: 'border-box' }} />
        </div>
        <button onClick={openCatFilter} style={{ ...ctrl(), border: `1px solid ${catFilters.size > 0 ? 'var(--accent)' : 'var(--border)'}`, color: catFilters.size > 0 ? 'var(--accent)' : 'var(--text-1)' }}>
          {catFilters.size > 0 ? `Category · ${catFilters.size}` : 'Category'} <Icon d={IC.chevD} size={10} />
        </button>
        <button onClick={openTagFilter} style={{ ...ctrl(), border: `1px solid ${tagFilters.size > 0 ? 'var(--accent)' : 'var(--border)'}`, color: tagFilters.size > 0 ? 'var(--accent)' : 'var(--text-1)' }}>
          <Icon d={IC.tag} size={11} /> {tagFilters.size > 0 ? `Tags · ${tagFilters.size}` : 'Tags'} <Icon d={IC.chevD} size={10} />
        </button>
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={ctrl({ paddingRight: 6 })}>
          <option value="date-desc">Newest</option>
          <option value="date-asc">Oldest</option>
          <option value="amount-high">Highest $</option>
          <option value="amount-low">Lowest $</option>
          <option value="merchant-az">A–Z</option>
        </select>
        <input type="number" placeholder="Min $" value={minAmt} onChange={(e) => setMinAmt(e.target.value)} style={{ width: 72, height: 36, fontSize: 12, padding: '0 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-1)', flexShrink: 0 }} />
        <input type="number" placeholder="Max $" value={maxAmt} onChange={(e) => setMaxAmt(e.target.value)} style={{ width: 72, height: 36, fontSize: 12, padding: '0 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-1)', flexShrink: 0 }} />
        {filterActive && (
          <button onClick={() => { setCatFilters(new Set()); setTagFilters(new Set()); setNeedsReviewOnly(false); }}
            style={{ height: 36, fontSize: 11, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-3)', cursor: 'pointer', flexShrink: 0 }}>Clear</button>
        )}
      </div>

      {/* Needs-review badge */}
      {needsReviewCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <button onClick={() => setNeedsReviewOnly((v) => !v)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 99, cursor: 'pointer', background: needsReviewOnly ? 'rgba(245,162,0,0.15)' : 'rgba(245,162,0,0.08)', color: 'var(--amber)', border: `1px solid ${needsReviewOnly ? 'rgba(245,162,0,0.4)' : 'rgba(245,162,0,0.2)'}` }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', display: 'inline-block' }} />
            {needsReviewCount} to review
            {needsReviewOnly && <span style={{ opacity: 0.6, marginLeft: 2 }}>× clear</span>}
          </button>
        </div>
      )}

      {/* Notice */}
      {notice && (
        <div style={{ marginBottom: 12, padding: '9px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: notice.ok ? 'rgba(52,211,153,0.1)' : 'rgba(242,70,58,0.1)', color: notice.ok ? 'var(--green)' : 'var(--red)', border: `1px solid ${notice.ok ? 'rgba(52,211,153,0.25)' : 'rgba(242,70,58,0.25)'}` }}>
          {notice.msg}
          {!notice.ok && <p style={{ marginTop: 4, fontWeight: 400, opacity: 0.8, fontSize: 11 }}>Tip: Make sure your CSV has Date, Description, and Amount columns.</p>}
        </div>
      )}

      {/* Transaction list */}
      {sorted.length === 0 ? (
        <div className="card" style={{ padding: '60px 24px', textAlign: 'center' }}>
          <svg width={40} height={40} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth={1.2} style={{ color: 'var(--text-3)', margin: '0 auto 10px' }}>
            <rect x="5" y="7" width="30" height="26" rx="3"/><path d="M12 16h16M12 22h10"/>
          </svg>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>No transactions{catFilters.size > 0 ? ' for selected categories' : ''} this period</p>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {seenDates.map((date) => {
            const total = daySpent(date);
            return (
              <div key={date}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 5px', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  <span>{fmtDate(date)}</span>
                  {total > 0 && <span style={{ fontSize: 12, fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}>{usd(total)}</span>}
                </div>
                {groups[date].map((tx) => {
                  const txIsIncome = catType(tx.category, categories) === 'income';
                  const isExcluded = !!tx.excluded;
                  const catColor   = isExcluded ? '#94a3b8' : getCategoryColor(tx.category, categories);
                  const initial    = (tx.description ?? '?')[0].toUpperCase();
                  const isSelected = selectedId === tx.id;
                  const showDot    = tx.needsReview && !tx.reviewed && !isExcluded;

                  return (
                    <div key={tx.id} onClick={() => setSelectedId(isSelected ? null : tx.id)}
                      style={{ display: 'flex', alignItems: 'center', minHeight: 58, padding: '10px 20px', gap: 12, borderBottom: '1px solid var(--border-2)', cursor: 'pointer', transition: 'background 0.1s', opacity: isExcluded ? 0.5 : 1, background: isSelected ? 'var(--card-alt)' : 'transparent' }}
                      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
                      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>

                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: hexToRgba(catColor, 0.15), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: catColor }}>
                          {initial}
                        </div>
                        {showDot && <div style={{ position: 'absolute', bottom: 1, right: 1, width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)', border: '2px solid var(--card)' }} />}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isExcluded ? 'line-through' : 'none' }}>{tx.description}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3, overflow: 'hidden' }}>
                          {isExcluded ? (
                            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Excluded</span>
                          ) : (
                            <button onClick={(e) => handleCatPillClick(e, tx)}
                              style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: hexToRgba(catColor, 0.13), color: catColor, border: 'none', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
                              title="Click to change category">
                              {tx.category}
                            </button>
                          )}
                          {tx.account && !isExcluded && (
                            <span style={{ fontSize: 10, color: 'var(--text-3)', opacity: 0.55, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>{tx.account}</span>
                          )}
                          {(tx.tags ?? []).map((t) => (
                            <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, fontWeight: 500, padding: '1px 4px 1px 6px', borderRadius: 99, background: 'rgba(91,87,245,0.1)', color: 'var(--accent)', border: '1px solid rgba(91,87,245,0.18)', flexShrink: 0 }}>
                              #{t}
                              <button onClick={(e) => { e.stopPropagation(); editTx(tx.id, { tags: (tx.tags ?? []).filter((x) => x !== t) }); }}
                                title={`Remove #${t}`}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: '0 1px', lineHeight: 1, fontSize: 13, opacity: 0.5, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                                onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                                onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.5')}>×</button>
                            </span>
                          ))}
                        </div>
                        {tx.isSplit && tx.splitChildren && (
                          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tx.splitChildren.map((c, i) => <span key={i}>{i > 0 && ' · '}{c.category} {usd(c.amount)}</span>)}
                          </p>
                        )}
                      </div>

                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: isExcluded ? 'var(--text-3)' : txIsIncome ? 'var(--green)' : 'var(--text-1)' }}>
                          {!isExcluded && (txIsIncome ? '+' : '-')}{usd(tx.amount, 2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <Modal title="Add transaction" onClose={() => setShowAdd(false)}>
          <TxForm categories={categories} onClose={() => setShowAdd(false)} onSave={(data) => { addTx(data as Omit<Transaction, 'id'>); setShowAdd(false); }} />
        </Modal>
      )}

      {catFilterOpen && catFilterRect && (
        <FilterPopover pos={catFilterRect} items={catItems} selected={catFilters}
          onToggle={(id) => setCatFilters((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; })}
          onClear={() => setCatFilters(new Set())} onClose={() => setCatFilterOpen(false)} title="Categories" />
      )}

      {tagFilterOpen && tagFilterRect && (
        <FilterPopover pos={tagFilterRect} items={tagItems} selected={tagFilters}
          onToggle={(id) => setTagFilters((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; })}
          onClear={() => setTagFilters(new Set())} onClose={() => setTagFilterOpen(false)} title="Tags"
          deletableIds={unusedTagIds} onDeleteItem={handleDeleteTag} />
      )}

      {inlineCat && (() => {
        const tx = allTxs.find((t) => t.id === inlineCat.txId);
        if (!tx) return null;
        return (
          <InlineCatPopover pos={inlineCat.pos} tx={tx} categories={categories}
            onSelect={(cat) => { editTx(tx.id, { category: cat, needsReview: false }); setInlineCat(null); }}
            onClose={() => setInlineCat(null)} />
        );
      })()}

      {selectedTx && (
        <DetailPanel tx={selectedTx} categories={categories}
          onEdit={editTx} onDelete={deleteTx} onExclude={excludeTx} onSplit={splitTx}
          onClose={() => setSelectedId(null)} userTags={userTags} onUpdateUserTags={handleUpdateUserTags} />
      )}
    </div>
  );
}

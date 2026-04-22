'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useBudget } from '@/lib/BudgetContext';
import { getCategoryColor, getCategoriesByType } from '@/lib/constants';
import { importCSV } from '@/lib/csvImport';
import { cleanDescription } from '@/lib/autoCategory';
import type { Transaction, Category, MerchantRules, ChangeHistoryEntry, SplitRule, SplitRules } from '@/lib/types';
import { useKeyboardShortcuts } from '@/lib/useKeyboardShortcuts';

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
function fmtHistoryDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function loadUserTags(): string[] {
  try { return JSON.parse(localStorage.getItem('userTags') ?? 'null') || []; } catch { return []; }
}

function splitMerchantKey(description: string): string {
  const clean = cleanDescription(description) || description;
  return clean.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
}

// ── Auto-suggest rule helpers ──────────────────────────────────────────────────
// Tracks how many times each (descLower|||catName) pair has been manually set.
function loadCatCounts(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem('budget_cat_counts') ?? 'null') || {}; } catch { return {}; }
}
function saveCatCounts(v: Record<string, number>): void {
  localStorage.setItem('budget_cat_counts', JSON.stringify(v));
}
// Stores "descLower|||catName" keys the user has already dismissed.
function loadDismissed(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem('budget_rule_dismissed') ?? 'null') || []); } catch { return new Set(); }
}
function saveDismissed(s: Set<string>): void {
  localStorage.setItem('budget_rule_dismissed', JSON.stringify([...s]));
}

// ── Recurring popover ─────────────────────────────────────────────────────────
function normalizeKey(d: string): string {
  return (d || '').toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
}

function RecurringPopover({
  tx, allTxs, anchor, onClose,
}: {
  tx: Transaction;
  allTxs: Transaction[];
  anchor: DOMRect;
  onClose: () => void;
}) {
  const { privacyMode } = useBudget();
  const usd = (n: number, d = 2) => privacyMode ? '••••' : '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const ref = useRef<HTMLDivElement>(null);
  const key = normalizeKey(tx.description);
  const occurrences = allTxs
    .filter((t) => normalizeKey(t.description) === key)
    .sort((a, b) => b.date.localeCompare(a.date));
  const avg = occurrences.length
    ? occurrences.reduce((s, t) => s + Math.abs(t.amount), 0) / occurrences.length
    : 0;
  const displayName = cleanDescription(tx.description) || tx.description;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const left = Math.max(8, anchor.left - 8);

  return (
    <div ref={ref} onMouseDown={(e) => e.stopPropagation()} style={{
      position: 'fixed',
      top: anchor.bottom + 6,
      left,
      zIndex: 9999,
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
      minWidth: 260,
      maxWidth: 340,
      overflow: 'hidden',
      fontSize: 12,
    }}>
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border-2)', background: 'rgba(91,87,245,0.06)' }}>
        <p style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 12, marginBottom: 2 }}>↻ {displayName}</p>
        <p style={{ color: 'var(--text-2)', fontSize: 11 }}>
          {occurrences.length} occurrence{occurrences.length !== 1 ? 's' : ''} · avg {usd(avg)}/mo
        </p>
      </div>
      <div style={{ maxHeight: 240, overflowY: 'auto' }}>
        {occurrences.map((t) => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '7px 14px', borderBottom: '1px solid var(--border-2)',
            opacity: t.excluded ? 0.45 : 1,
          }}>
            <span style={{ color: 'var(--text-2)', fontSize: 11 }}>
              {new Date(t.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              {t.excluded && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-3)' }}>(excluded)</span>}
            </span>
            <span style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: 12 }}>{usd(t.amount, 2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
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
  edit:   'M9.5 2.5l2 2L5 11H3V9l6.5-6.5zM10 4l-2-2',
  rules:  'M2 3.5h10M2 7h7M2 10.5h8',
  save:      'M2 12V2.5A.5.5 0 012.5 2h7l2.5 2.5V12a.5.5 0 01-.5.5H2.5A.5.5 0 012 12zM5 12V8h4v4M5 2v3h5V2',
  paperclip: 'M11.5 4.5v6a4 4 0 01-8 0V3a2.5 2.5 0 015 0v7a1 1 0 01-2 0V4.5',
};

// ── Attachment storage ─────────────────────────────────────────────────────────
const ATTACHMENTS_KEY = 'budget_attachments';

interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;  // bytes
  data: string;  // base64 data URL
}

function loadAllAttachments(): Record<string, Attachment[]> {
  try { return JSON.parse(localStorage.getItem(ATTACHMENTS_KEY) ?? 'null') || {}; } catch { return {}; }
}
function loadAttachmentsForTx(txId: string): Attachment[] {
  return loadAllAttachments()[txId] ?? [];
}
function saveAttachmentsForTx(txId: string, attachments: Attachment[]): void {
  const all = loadAllAttachments();
  if (attachments.length === 0) delete all[txId]; else all[txId] = attachments;
  localStorage.setItem(ATTACHMENTS_KEY, JSON.stringify(all));
}
function txsWithAttachmentsSet(): Set<string> {
  const all = loadAllAttachments();
  return new Set(Object.entries(all).filter(([, v]) => v.length > 0).map(([k]) => k));
}

// ── Filter Presets ─────────────────────────────────────────────────────────────
interface FilterPreset {
  id: string;
  name: string;
  categories: string[];
  tags: string[];
  search: string;
  sort: string;
  minAmt: string;
  maxAmt: string;
}

const PRESETS_KEY = 'filterPresets';

function loadPresets(): FilterPreset[] {
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? 'null') || []; } catch { return []; }
}

function savePresets(presets: FilterPreset[]) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

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
function SplitModal({ tx, categories, onSplit, onClose, splitRules, onCreateSplitRule }: {
  tx: Transaction; categories: Category[];
  onSplit: (id: string, splits: Array<{description: string; amount: number; category: string}>) => void;
  onClose: () => void;
  splitRules?: SplitRules;
  onCreateSplitRule?: (rule: SplitRule) => void;
}) {
  const { privacyMode } = useBudget();
  const usd = (n: number, d = 2) => privacyMode ? '••••' : '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
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
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [pendingSplits, setPendingSplits] = useState<Array<{description: string; amount: number; category: string}> | null>(null);

  const updateSplit = (i: number, key: string, val: string) => setSplits((p) => p.map((s, j) => j === i ? { ...s, [key]: val } : s));
  const addRow      = () => setSplits((p) => [...p, { description: '', amount: '', category: tx.category }]);
  const removeRow   = (i: number) => setSplits((p) => p.filter((_, j) => j !== i));
  const splitSum = splits.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const diff     = Math.round((total - splitSum) * 100) / 100;
  const valid    = diff === 0 && splits.length >= 2 && splits.every((s) => parseFloat(s.amount) > 0);

  const submit = () => {
    if (!valid) return;
    const splitData = splits.map((s) => ({
      description: s.description || tx.description,
      amount: isIncome ? -parseFloat(s.amount) : parseFloat(s.amount),
      category: s.category,
    }));
    onSplit(tx.id, splitData);

    const key = splitMerchantKey(tx.description);
    if (onCreateSplitRule && !(splitRules?.[key])) {
      setPendingSplits(splitData);
      setShowSavePrompt(true);
    } else {
      onClose();
    }
  };

  const displayName = cleanDescription(tx.description) || tx.description;

  if (showSavePrompt) {
    return (
      <Modal title="Save as split rule?" onClose={onClose} maxWidth={420}>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14 }}>
          Save this split as a rule for <strong style={{ color: 'var(--text-1)' }}>"{displayName}"</strong>?
          It will be offered automatically for future transactions from this merchant.
        </p>
        <div style={{ background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 16 }}>
          {(pendingSplits ?? []).map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: i < (pendingSplits?.length ?? 0) - 1 ? '1px solid var(--border-2)' : 'none', fontSize: 12 }}>
              <span style={{ color: 'var(--text-2)' }}>{s.description} <span style={{ color: 'var(--text-3)' }}>· {s.category}</span></span>
              <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{usd(Math.abs(s.amount), 2)} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({Math.round(Math.abs(s.amount) / total * 100)}%)</span></span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn" style={{ fontSize: 13 }}>No thanks</button>
          <button onClick={() => {
            if (!onCreateSplitRule || !pendingSplits) { onClose(); return; }
            onCreateSplitRule({
              merchantKey: splitMerchantKey(tx.description),
              displayName,
              splits: pendingSplits.map((s) => ({
                description: s.description || tx.description,
                percentage: Math.round(Math.abs(s.amount) / total * 10000) / 100,
                category: s.category,
              })),
            });
            onClose();
          }} className="btn btn-primary" style={{ fontSize: 13 }}>Save rule</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Split transaction" onClose={onClose} maxWidth={480}>
      <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>
        Total: <strong style={{ color: 'var(--text-1)' }}>{privacyMode ? '••••' : `$${total.toFixed(2)}`}</strong>
        {diff !== 0 && <span style={{ color: 'var(--red)', marginLeft: 8 }}>remaining: {privacyMode ? '••••' : `$${Math.abs(diff).toFixed(2)}`}</span>}
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
function DetailPanel({ tx, categories, allTxs, onEdit, onDelete, onExclude, onSplit, onClose, userTags, onUpdateUserTags, onCategoryChanged, splitRules, onCreateSplitRule, onAttachmentsChanged }: {
  tx: Transaction; categories: Category[]; allTxs: Transaction[];
  onEdit: (id: string, u: Partial<Transaction>) => void;
  onDelete: (id: string) => void;
  onExclude: (id: string, excluded: boolean) => void;
  onSplit: ((id: string, splits: Array<{description: string; amount: number; category: string}>) => void) | null;
  onClose: () => void;
  userTags: string[];
  onUpdateUserTags: (tags: string[]) => void;
  onCategoryChanged?: (desc: string, cat: string) => void;
  splitRules?: SplitRules;
  onCreateSplitRule?: (rule: SplitRule) => void;
  onAttachmentsChanged?: () => void;
}) {
  const { privacyMode } = useBudget();
  const usd = (n: number, d = 2) => privacyMode ? '••••' : '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const [visible,          setVisible]          = useState(false);
  const [cat,              setCat]              = useState(tx.category);
  const [displayName,      setDisplayName]      = useState(tx.displayName ?? '');
  const [notes,            setNotes]            = useState(tx.notes ?? '');
  const [tags,             setTags]             = useState(tx.tags ?? []);
  const [tagInput,         setTagInput]         = useState('');
  const [splitting,        setSplitting]        = useState(false);
  const [applyRuleConfirm, setApplyRuleConfirm] = useState(false);
  const [attachments,      setAttachments]      = useState<Attachment[]>(() => loadAttachmentsForTx(tx.id));
  const [sizeWarning,      setSizeWarning]      = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);
  useEffect(() => { setCat(tx.category); setDisplayName(tx.displayName ?? ''); setNotes(tx.notes ?? ''); setTags(tx.tags ?? []); setAttachments(loadAttachmentsForTx(tx.id)); setSizeWarning(null); }, [tx.id]); // eslint-disable-line
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    for (const file of files) {
      if (file.size > 2 * 1024 * 1024) {
        setSizeWarning(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — exceeds the 2 MB limit and may cause localStorage issues.`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const att: Attachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: file.name, type: file.type, size: file.size,
          data: ev.target?.result as string,
        };
        setAttachments((prev) => {
          const next = [...prev, att];
          saveAttachmentsForTx(tx.id, next);
          onAttachmentsChanged?.();
          return next;
        });
        setSizeWarning(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeAttachment = (attId: string) => {
    setAttachments((prev) => {
      const next = prev.filter((a) => a.id !== attId);
      saveAttachmentsForTx(tx.id, next);
      onAttachmentsChanged?.();
      return next;
    });
  };

  const isIncome    = catType(cat, categories) === 'income';
  const catColor    = getCategoryColor(cat, categories);
  const needsReview = tx.needsReview && !tx.reviewed;

  const fuzzyMatch = tx.isDuplicate ? allTxs.find((e) => {
    if (e.id === tx.id || e.isDuplicate) return false;
    const sameDesc = (e.description ?? '').toLowerCase().trim() === (tx.description ?? '').toLowerCase().trim();
    const sameAmt  = Math.round(Math.abs(e.amount) * 100) === Math.round(Math.abs(tx.amount) * 100);
    if (!sameDesc || !sameAmt) return false;
    return Math.abs(new Date(e.date + 'T00:00:00').getTime() - new Date(tx.date + 'T00:00:00').getTime()) <= 2 * 24 * 60 * 60 * 1000;
  }) : null;

  const applicableSplitRule = splitRules?.[splitMerchantKey(tx.description)];

  const applyRule = () => {
    if (!applicableSplitRule || !onSplit) return;
    const total = Math.abs(tx.amount);
    const isIncomeTx = catType(cat, categories) === 'income';
    let remaining = total;
    const scaledSplits = applicableSplitRule.splits.map((s, i, arr) => {
      const amt = i === arr.length - 1
        ? Math.round(remaining * 100) / 100
        : Math.round(total * s.percentage / 100 * 100) / 100;
      remaining = Math.round((remaining - amt) * 100) / 100;
      return { description: s.description, amount: isIncomeTx ? -amt : amt, category: s.category };
    });
    onSplit(tx.id, scaledSplits);
    setApplyRuleConfirm(false);
    onClose();
  };

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
    const entry: ChangeHistoryEntry = {
      field: 'Tags',
      oldValue: tags.join(', ') || 'none',
      newValue: next.join(', ') || 'none',
      timestamp: new Date().toISOString(),
    };
    onEdit(tx.id, { tags: next, changeHistory: [entry] });
  };

  const save = () => {
    const catChanged = cat !== tx.category;
    const dn = displayName.trim() || undefined;
    const now = new Date().toISOString();
    const newEntries: ChangeHistoryEntry[] = [];
    if (catChanged) {
      newEntries.push({ field: 'Category', oldValue: tx.category, newValue: cat, timestamp: now });
    }
    if (notes !== (tx.notes ?? '')) {
      newEntries.push({ field: 'Notes', oldValue: tx.notes ?? '', newValue: notes, timestamp: now });
    }
    const oldTagsKey = [...(tx.tags ?? [])].sort().join(',');
    const newTagsKey = [...tags].sort().join(',');
    if (oldTagsKey !== newTagsKey) {
      newEntries.push({ field: 'Tags', oldValue: (tx.tags ?? []).join(', ') || 'none', newValue: tags.join(', ') || 'none', timestamp: now });
    }
    if (dn !== tx.displayName) {
      newEntries.push({ field: 'Description', oldValue: tx.displayName ?? '', newValue: dn ?? '', timestamp: now });
    }
    onEdit(tx.id, { category: cat, notes, tags, needsReview: false, displayName: dn, ...(newEntries.length > 0 && { changeHistory: newEntries }) });
    if (catChanged) onCategoryChanged?.(tx.description, cat);
    onClose();
  };
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
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.displayName || cleanDescription(tx.description) || tx.description}</p>
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
          {tx.isDuplicate && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(245,162,0,0.08)', border: '1px solid rgba(245,162,0,0.25)', fontSize: 12, color: 'var(--amber)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <span>⚠ Possible duplicate</span>
              {fuzzyMatch && <span style={{ color: 'var(--text-2)' }}>of {new Date(fuzzyMatch.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
              <button onClick={() => onEdit(tx.id, { isDuplicate: false, needsReview: false })}
                style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)', background: 'none', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 7px', cursor: 'pointer' }}>
                Keep anyway
              </button>
            </div>
          )}
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

          <div>
            <label className="label" style={{ display: 'block', marginBottom: 6 }}>Display name</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              placeholder={tx.description}
              style={{ width: '100%', height: 34, fontSize: 13, padding: '0 10px', borderRadius: 7, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)', boxSizing: 'border-box' }} />
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tx.description}>
              Raw: {tx.description}
            </p>
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
            {applicableSplitRule && onSplit && !tx.isSplit && !tx.splitParentId && !tx.excluded && (
              <button onClick={() => setApplyRuleConfirm(true)}
                style={{ fontSize: 12, color: 'var(--accent)', background: 'rgba(91,87,245,0.08)', border: '1px solid rgba(91,87,245,0.2)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>
                Apply split rule
              </button>
            )}
            <button onClick={() => { onExclude(tx.id, !tx.excluded); onClose(); }}
              style={{ fontSize: 12, color: tx.excluded ? 'var(--green)' : 'var(--amber)', background: tx.excluded ? 'rgba(52,211,153,0.08)' : 'rgba(245,162,0,0.08)', border: `1px solid ${tx.excluded ? 'rgba(52,211,153,0.25)' : 'rgba(245,162,0,0.25)'}`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>
              {tx.excluded ? 'Include in totals' : 'Exclude from totals'}
            </button>
          </div>

          {applyRuleConfirm && applicableSplitRule && (
            <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(91,87,245,0.06)', border: '1px solid rgba(91,87,245,0.2)', fontSize: 12 }}>
              <p style={{ fontWeight: 600, color: 'var(--text-1)', marginBottom: 8 }}>Apply split rule "{applicableSplitRule.displayName}"?</p>
              {applicableSplitRule.splits.map((s, i) => {
                const amt = Math.round(Math.abs(tx.amount) * s.percentage / 100 * 100) / 100;
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--text-2)' }}>
                    <span>{s.description} <span style={{ color: 'var(--text-3)' }}>· {s.category}</span></span>
                    <span style={{ fontWeight: 500, color: 'var(--text-1)' }}>{usd(amt, 2)}</span>
                  </div>
                );
              })}
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <button onClick={applyRule} className="btn btn-primary" style={{ fontSize: 12, flex: 1, justifyContent: 'center' }}>Apply</button>
                <button onClick={() => setApplyRuleConfirm(false)} className="btn" style={{ fontSize: 12 }}>Cancel</button>
              </div>
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
            <div
              onClick={() => onEdit(tx.id, { taxDeductible: !tx.taxDeductible })}
              style={{ position: 'relative', width: 36, height: 20, borderRadius: 99, background: tx.taxDeductible ? 'var(--green)' : 'var(--border)', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s' }}>
              <div style={{ position: 'absolute', top: 2, left: tx.taxDeductible ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
            </div>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Tax Deductible</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
            <div
              onClick={() => {
                const nowTransfer = !tx.isTransfer;
                onEdit(tx.id, { isTransfer: nowTransfer, ...(nowTransfer && !tx.excluded ? { excluded: true } : {}) });
              }}
              style={{ position: 'relative', width: 36, height: 20, borderRadius: 99, background: tx.isTransfer ? '#3b82f6' : 'var(--border)', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s' }}>
              <div style={{ position: 'absolute', top: 2, left: tx.isTransfer ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
            </div>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Transfer (auto-excluded)</span>
          </label>

          {/* Attachments */}
          <div style={{ borderTop: '1px solid var(--border-2)', paddingTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Icon d={IC.paperclip} size={11} />
                Attachments{attachments.length > 0 && <span style={{ color: 'var(--text-3)', fontWeight: 400 }}> · {attachments.length}</span>}
              </label>
              <button onClick={() => fileInputRef.current?.click()}
                style={{ fontSize: 11, color: 'var(--accent)', background: 'rgba(91,87,245,0.07)', border: '1px solid rgba(91,87,245,0.2)', borderRadius: 5, padding: '3px 9px', cursor: 'pointer' }}>
                + Add
              </button>
              <input ref={fileInputRef} type="file" accept="image/*,.pdf" multiple style={{ display: 'none' }} onChange={handleFileSelect} />
            </div>
            {sizeWarning && (
              <p style={{ fontSize: 11, color: 'var(--red)', marginBottom: 8, lineHeight: 1.4 }}>⚠ {sizeWarning}</p>
            )}
            {attachments.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>No attachments — click Add to upload an image or PDF.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {attachments.map((att) => (
                  <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 7, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    {att.type.startsWith('image/') ? (
                      <img src={att.data} alt={att.name} onClick={() => window.open(att.data, '_blank')}
                        style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 5, flexShrink: 0, cursor: 'pointer' }} />
                    ) : (
                      <div onClick={() => window.open(att.data, '_blank')}
                        style={{ width: 44, height: 44, borderRadius: 5, background: 'rgba(242,70,58,0.09)', border: '1px solid rgba(242,70,58,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}>
                        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                        </svg>
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</p>
                      <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{(att.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <button onClick={() => removeAttachment(att.id)} title="Remove attachment"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '2px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--red)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}>
                      <Icon d={IC.close} size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(tx.changeHistory?.length ?? 0) > 0 && (
            <details style={{ borderTop: '1px solid var(--border-2)', paddingTop: 14 }}>
              <summary style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}>
                <svg width={10} height={10} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M2 4l3 3 3-3" />
                </svg>
                History
              </summary>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[...tx.changeHistory!].reverse().map((entry, i) => (
                  <p key={i} style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5, margin: 0 }}>
                    {entry.field} changed from <span style={{ color: 'var(--text-2)' }}>{entry.oldValue || 'empty'}</span> to <span style={{ color: 'var(--text-2)' }}>{entry.newValue || 'empty'}</span>
                    <span style={{ marginLeft: 4, opacity: 0.7 }}>· {fmtHistoryDate(entry.timestamp)}</span>
                  </p>
                ))}
              </div>
            </details>
          )}
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
        <SplitModal
          tx={tx}
          categories={categories}
          onSplit={onSplit}
          onClose={() => { setSplitting(false); onClose(); }}
          splitRules={splitRules}
          onCreateSplitRule={onCreateSplitRule}
        />
      )}
    </>
  );
}

// ── Rules manager modal ────────────────────────────────────────────────────────
function RulesModal({ merchantRules, categories, onCreate, onDelete, onUpdate, onClose, splitRules, onDeleteSplitRule }: {
  merchantRules: MerchantRules;
  categories: Category[];
  onCreate: (desc: string, cat: string) => void;
  onDelete: (desc: string) => void;
  onUpdate: (oldDesc: string, newDesc: string, cat: string) => void;
  onClose: () => void;
  splitRules?: SplitRules;
  onDeleteSplitRule?: (key: string) => void;
}) {
  const [tab,     setTab]     = useState<'cat' | 'split'>('cat');
  const [newDesc, setNewDesc] = useState('');
  const [newCat,  setNewCat]  = useState(categories[0]?.name ?? '');
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editCat,  setEditCat]  = useState('');
  const [q, setQ] = useState('');

  const ruleCount = Object.keys(merchantRules).length;
  const entries = Object.entries(merchantRules)
    .filter(([k]) => !q || k.includes(q.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b));

  const startEdit = (key: string, cat: string) => { setEditKey(key); setEditDesc(key); setEditCat(cat); };
  const commitEdit = () => {
    if (!editDesc.trim() || !editKey) return;
    onUpdate(editKey, editDesc.trim(), editCat);
    setEditKey(null);
  };
  const handleAdd = () => {
    if (!newDesc.trim()) return;
    onCreate(newDesc.trim(), newCat);
    setNewDesc('');
  };

  const splitRuleEntries = Object.entries(splitRules ?? {});

  return (
    <Modal title="Rules" onClose={onClose} maxWidth={500}>
      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--bg)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
        {([['cat', `Merchant Rules${ruleCount > 0 ? ` · ${ruleCount}` : ''}`], ['split', `Split Rules${splitRuleEntries.length > 0 ? ` · ${splitRuleEntries.length}` : ''}`]] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ flex: 1, padding: '5px 0', fontSize: 12, fontWeight: 500, borderRadius: 6, border: 'none', cursor: 'pointer', background: tab === t ? 'var(--card)' : 'transparent', color: tab === t ? 'var(--text-1)' : 'var(--text-3)', transition: 'all 0.15s' }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'cat' && (
        <>
          {/* Add new rule */}
          <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
            <input type="text" placeholder="Merchant keyword (e.g. starbucks)" value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              style={{ flex: 1, height: 32, fontSize: 12, padding: '0 10px', borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
            <select value={newCat} onChange={(e) => setNewCat(e.target.value)}
              style={{ height: 32, fontSize: 12, borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)', padding: '0 6px' }}>
              {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            <button onClick={handleAdd} disabled={!newDesc.trim()} className="btn btn-primary"
              style={{ fontSize: 12, height: 32, padding: '0 12px', opacity: newDesc.trim() ? 1 : 0.4, cursor: newDesc.trim() ? 'pointer' : 'default' }}>
              Add
            </button>
          </div>

          {/* Search */}
          {ruleCount > 6 && (
            <input type="text" placeholder="Search rules…" value={q} onChange={(e) => setQ(e.target.value)}
              style={{ width: '100%', height: 28, fontSize: 12, padding: '0 8px', borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--border-2)', color: 'var(--text-1)', marginBottom: 8, boxSizing: 'border-box' }} />
          )}

          {/* Rule list */}
          {entries.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '28px 0' }}>
              {ruleCount === 0 ? 'No rules yet. Add one above.' : 'No rules match.'}
            </p>
          ) : (
            <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
              {entries.map(([key, cat]) =>
                editKey === key ? (
                  <div key={key} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 8px', borderRadius: 7, background: 'var(--card-alt)', border: '1px solid rgba(91,87,245,0.2)' }}>
                    <input autoFocus value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditKey(null); }}
                      style={{ flex: 1, height: 28, fontSize: 12, padding: '0 8px', borderRadius: 5, background: 'var(--bg)', border: '1px solid var(--accent)', color: 'var(--text-1)' }} />
                    <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>→</span>
                    <select value={editCat} onChange={(e) => setEditCat(e.target.value)}
                      style={{ height: 28, fontSize: 11, borderRadius: 5, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)', padding: '0 4px' }}>
                      {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    <button onClick={commitEdit} className="btn btn-primary" style={{ fontSize: 11, height: 28, padding: '0 10px' }}>Save</button>
                    <button onClick={() => setEditKey(null)} className="btn" style={{ fontSize: 11, height: 28, padding: '0 8px' }}>×</button>
                  </div>
                ) : (
                  <div key={key}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 7, transition: 'background 0.1s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--card-alt)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{key}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>→</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: getCategoryColor(cat, categories) }} />
                      <span style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{cat}</span>
                    </div>
                    <button onClick={() => startEdit(key, cat)} title="Edit"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '2px 4px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-1)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}>
                      <Icon d={IC.edit} size={11} />
                    </button>
                    <button onClick={() => onDelete(key)} title="Delete"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '2px 4px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--red)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}>
                      <Icon d={IC.trash} size={11} />
                    </button>
                  </div>
                )
              )}
            </div>
          )}
        </>
      )}

      {tab === 'split' && (
        <>
          {splitRuleEntries.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '28px 0' }}>
              No split rules yet. Split a transaction and choose "Save rule" to create one.
            </p>
          ) : (
            <div style={{ maxHeight: 400, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {splitRuleEntries.map(([key, rule]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 10px', borderRadius: 8, border: '1px solid var(--border-2)', background: 'var(--bg)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rule.displayName}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {rule.splits.map((s, i) => (
                        <span key={i} style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--card-alt)', borderRadius: 4, padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: getCategoryColor(s.category, categories), flexShrink: 0, display: 'inline-block' }} />
                          {s.description} · {s.category} · {s.percentage}%
                        </span>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => onDeleteSplitRule?.(key)} title="Delete split rule"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '2px 4px', display: 'flex', alignItems: 'center', flexShrink: 0, marginTop: 1 }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--red)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}>
                    <Icon d={IC.trash} size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function Transactions() {
  const { filteredTxs, txs: allTxs, categories, addTx, deleteTx, editTx, importTxs, excludeTx, splitTx, batchEditTxs, createMerchantRule, deleteMerchantRule, updateMerchantRule, merchantRules, splitRules, createSplitRule, deleteSplitRule, privacyMode } = useBudget();
  const usd = (n: number, d = 2) => privacyMode ? '••••' : '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

  const [showAdd,         setShowAdd]         = useState(false);
  const [selectedId,      setSelectedId]      = useState<string | null>(null);
  const [catFilters,      setCatFilters]      = useState(new Set<string>());
  const [tagFilters,      setTagFilters]      = useState(new Set<string>());
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);
  const [taxDeductOnly,   setTaxDeductOnly]   = useState(false);
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
  const [selectedIds,     setSelectedIds]     = useState(new Set<string>());
  const [hoveredRowId,    setHoveredRowId]    = useState<string | null>(null);
  const [bulkCatOpen,     setBulkCatOpen]     = useState(false);
  const [bulkTagOpen,     setBulkTagOpen]     = useState(false);
  const [bulkTagValue,    setBulkTagValue]    = useState('');
  const [deleteConfirm,   setDeleteConfirm]   = useState(false);
  const [groupFilters,    setGroupFilters]    = useState(new Set<string>());
  const [groupFilterOpen, setGroupFilterOpen] = useState(false);
  const [groupFilterRect, setGroupFilterRect] = useState<DOMRect | null>(null);
  const [bulkGroupOpen,   setBulkGroupOpen]   = useState(false);
  const [bulkGroupValue,  setBulkGroupValue]  = useState('');
  const [merchantPrompt,  setMerchantPrompt]  = useState<{ descs: string[]; cat: string } | null>(null);
  const [showRules,       setShowRules]       = useState(false);
  const [ruleSuggestion,  setRuleSuggestion]  = useState<{ desc: string; cat: string } | null>(null);
  const [presets,            setPresets]            = useState<FilterPreset[]>([]);
  const [savePresetOpen,     setSavePresetOpen]     = useState(false);
  const [presetName,         setPresetName]         = useState('');
  const [showRunningBalance,  setShowRunningBalance]  = useState(false);
  const [recurringPopover,    setRecurringPopover]    = useState<{ tx: Transaction; anchor: DOMRect } | null>(null);
  const [attachedTxIds,       setAttachedTxIds]       = useState<Set<string>>(() => { try { return txsWithAttachmentsSet(); } catch { return new Set(); } });
  const [showShortcuts,       setShowShortcuts]       = useState(false);
  const refreshAttachmentSet = useCallback(() => { try { setAttachedTxIds(txsWithAttachmentsSet()); } catch { /* */ } }, []);

  useEffect(() => { setUserTags(loadUserTags()); }, []);
  useEffect(() => { setPresets(loadPresets()); }, []);
  useEffect(() => {
    try { setShowRunningBalance(localStorage.getItem('showRunningBalance') === 'true'); } catch { /* */ }
  }, []);

  const toggleRunningBalance = useCallback(() => {
    setShowRunningBalance((v) => {
      const next = !v;
      try { localStorage.setItem('showRunningBalance', String(next)); } catch { /* */ }
      return next;
    });
  }, []);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useKeyboardShortcuts([
    {
      key: 'n',
      handler: () => { setShowAdd(true); },
    },
    {
      key: 'f',
      handler: () => { searchRef.current?.focus(); searchRef.current?.select(); },
    },
    {
      key: '/',
      handler: () => { searchRef.current?.focus(); searchRef.current?.select(); },
    },
    {
      key: 'r',
      handler: () => {
        setCatFilters(new Set()); setTagFilters(new Set()); setGroupFilters(new Set());
        setNeedsReviewOnly(false); setTaxDeductOnly(false);
        setSearch(''); setSort('date-desc'); setMinAmt(''); setMaxAmt('');
        setSelectedIds(new Set());
      },
    },
    {
      key: '?',
      handler: () => { setShowShortcuts((v) => !v); },
    },
    {
      key: 'a',
      meta: true,
      handler: () => {
        setSelectedIds((prev) =>
          prev.size === sorted.length && sorted.every((t) => prev.has(t.id))
            ? new Set()
            : new Set(sorted.map((t) => t.id))
        );
      },
    },
    {
      key: 'Escape',
      handler: () => {
        if (showShortcuts)       { setShowShortcuts(false); return; }
        if (showAdd)             { setShowAdd(false); return; }
        if (deleteConfirm)       { setDeleteConfirm(false); return; }
        if (bulkCatOpen)         { setBulkCatOpen(false); return; }
        if (bulkTagOpen)         { setBulkTagOpen(false); return; }
        if (bulkGroupOpen)       { setBulkGroupOpen(false); return; }
        if (showRules)           { setShowRules(false); return; }
        if (savePresetOpen)      { setSavePresetOpen(false); setPresetName(''); return; }
        if (merchantPrompt)      { setMerchantPrompt(null); return; }
        if (recurringPopover)    { setRecurringPopover(null); return; }
        if (catFilterOpen)       { setCatFilterOpen(false); return; }
        if (tagFilterOpen)       { setTagFilterOpen(false); return; }
        if (groupFilterOpen)     { setGroupFilterOpen(false); return; }
        if (inlineCat)           { setInlineCat(null); return; }
        if (selectedId)          { setSelectedId(null); return; }
        if (selectedIds.size > 0){ setSelectedIds(new Set()); return; }
      },
    },
  ]);

  // ── Auto-suggest rules ─────────────────────────────────────────────────────
  // Keep a synchronous ref so callbacks always see the latest rules without
  // needing to be re-created when merchantRules changes.
  const merchantRulesRef = useRef(merchantRules);
  merchantRulesRef.current = merchantRules;

  // Scan stored categorization counts for any pending suggestion to show.
  const checkSuggestion = useCallback(() => {
    const counts   = loadCatCounts();
    const dismissed = loadDismissed();
    const rules    = merchantRulesRef.current;
    for (const [key, count] of Object.entries(counts)) {
      if (count < 2) continue;
      const sep = key.indexOf('|||');
      if (sep === -1) continue;
      const descLower = key.slice(0, sep);
      const cat       = key.slice(sep + 3);
      if (!cat) continue;
      if (rules[descLower]) continue;   // rule already saved
      if (dismissed.has(key)) continue; // user already dismissed this
      setRuleSuggestion({ desc: descLower, cat });
      return;
    }
    setRuleSuggestion(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-check whenever saved rules change (e.g. after a rule is created or deleted).
  useEffect(() => { checkSuggestion(); }, [merchantRules, checkSuggestion]);

  // Record a manual categorization and surface a suggestion once threshold is reached.
  const recordCategorization = useCallback((rawDesc: string, cat: string) => {
    const descLower = rawDesc.toLowerCase().trim();
    const key = `${descLower}|||${cat}`;
    const counts = loadCatCounts();
    counts[key] = (counts[key] ?? 0) + 1;
    saveCatCounts(counts);
    if (counts[key] >= 2 && !merchantRulesRef.current[descLower] && !loadDismissed().has(key)) {
      setRuleSuggestion({ desc: descLower, cat });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fileRef   = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
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
  const allGroupsList = useMemo(() => [...new Set(allTxs.map((t) => t.groupName).filter(Boolean) as string[])].sort(), [allTxs]);
  const handleDeleteTag = useCallback((tagId: string) => {
    handleUpdateUserTags(userTags.filter((t) => t !== tagId));
  }, [userTags, handleUpdateUserTags]);

  const filtered = filteredTxs
    .filter((t) => {
      if (needsReviewOnly) return t.needsReview && !t.reviewed;
      if (catFilters.size > 0) return catFilters.has(t.category);
      return true;
    })
    .filter((t) => !taxDeductOnly || !!t.taxDeductible)
    .filter((t) => tagFilters.size === 0 || (t.tags ?? []).some((tag) => tagFilters.has(tag)))
    .filter((t) => groupFilters.size === 0 || (t.groupName ? groupFilters.has(t.groupName) : false))
    .filter((t) => !search || (t.displayName || cleanDescription(t.description) || t.description || '').toLowerCase().includes(search.toLowerCase()) || (t.description || '').toLowerCase().includes(search.toLowerCase()))
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
      case 'merchant-az': return (a.displayName || cleanDescription(a.description) || a.description || '').localeCompare(b.displayName || cleanDescription(b.description) || b.description || '');
      default:            return new Date(b.date).getTime() - new Date(a.date).getTime();
    }
  });

  const seenDates: string[] = [];
  const groups: Record<string, Transaction[]> = {};
  for (const tx of sorted) {
    if (!groups[tx.date]) { seenDates.push(tx.date); groups[tx.date] = []; }
    groups[tx.date].push(tx);
  }

  // Running balance — computed chronologically over the filtered set regardless of sort order
  const runningBalanceMap = useMemo((): Map<string, number> => {
    if (!showRunningBalance) return new Map();
    const chrono = [...filtered].sort((a, b) =>
      new Date(a.date + 'T00:00:00').getTime() - new Date(b.date + 'T00:00:00').getTime()
    );
    const map = new Map<string, number>();
    let balance = 0;
    for (const tx of chrono) {
      balance -= tx.amount; // positive amount = expense (decreases), negative = income (increases)
      map.set(tx.id, balance);
    }
    return map;
  }, [showRunningBalance, filtered]); // eslint-disable-line react-hooks/exhaustive-deps

  const multipleAccounts = useMemo(() => {
    if (!showRunningBalance) return false;
    return new Set(filtered.map((t) => t.account).filter(Boolean)).size > 1;
  }, [showRunningBalance, filtered]); // eslint-disable-line react-hooks/exhaustive-deps

  const anySelected = selectedIds.size > 0;
  const allVisibleSelected = sorted.length > 0 && sorted.every((t) => selectedIds.has(t.id));

  const income = sorted.filter((t) => !t.excluded && catType(t.category, categories) === 'income').reduce((s, t) => s + Math.abs(t.amount), 0);
  const spent  = sorted.filter((t) => !t.excluded && catType(t.category, categories) === 'expense').reduce((s, t) => s + Math.abs(t.amount), 0);
  const daySpent = (dateKey: string) => (groups[dateKey] ?? []).reduce((sum, t) => sum + (!t.excluded && catType(t.category, categories) === 'expense' ? Math.abs(t.amount) : 0), 0);
  const needsReviewCount = filteredTxs.filter((t) => t.needsReview && !t.reviewed).length;

  const handleExport = () => {
    const exportRows = taxDeductOnly ? sorted.filter((t) => !!t.taxDeductible) : sorted;
    const header = 'Date,Description,Amount,Category,Account,Tags,TaxDeductible';
    const rows = exportRows.map((t) => [
      t.date,
      `"${(t.description ?? '').replace(/"/g, '""')}"`,
      t.amount,
      t.category,
      t.account ?? '',
      (t.tags ?? []).join(';'),
      t.taxDeductible ? 'true' : 'false',
    ].join(','));
    const csv  = [header, ...rows].join('\n');
    const url  = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a    = document.createElement('a');
    a.href = url; a.download = taxDeductOnly ? 'transactions-tax-deductible.csv' : 'transactions.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNotice(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = importCSV(ev.target!.result as string, categories);
        if (!parsed.length) { setNotice({ ok: false, msg: 'No valid transactions found.' }); return; }
        const stats = await importTxs(parsed);
        let msg = `Imported ${stats.imported} transaction${stats.imported !== 1 ? 's' : ''}.`;
        if (stats.exactDups > 0) msg += ` ${stats.exactDups} duplicate${stats.exactDups !== 1 ? 's' : ''} skipped.`;
        if (stats.fuzzyDups > 0) msg += ` ${stats.fuzzyDups} possible duplicate${stats.fuzzyDups !== 1 ? 's' : ''} flagged for review.`;
        setNotice({ ok: true, msg });
        setTimeout(() => setNotice(null), 5000);
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

  const handleBulkToggleExclude = useCallback(() => {
    const sel = [...selectedIds];
    const txMap = Object.fromEntries(allTxs.map((t) => [t.id, t]));
    const anyIncluded = sel.some((id) => !txMap[id]?.excluded);
    batchEditTxs(sel.map((id) => ({ id, updates: { excluded: anyIncluded } })));
    setSelectedIds(new Set());
  }, [selectedIds, allTxs, batchEditTxs]);

  const handleBulkDelete = useCallback(() => {
    [...selectedIds].forEach((id) => deleteTx(id));
    setSelectedIds(new Set());
    setDeleteConfirm(false);
  }, [selectedIds, deleteTx]);

  const handleBulkRecategorize = useCallback((cat: string) => {
    const sel = [...selectedIds];
    batchEditTxs(sel.map((id) => ({ id, updates: { category: cat, needsReview: false } })));
    const uniqueDescs = [...new Set(
      sel.map((id) => allTxs.find((t) => t.id === id)?.description ?? '').filter(Boolean)
    )];
    setMerchantPrompt({ descs: uniqueDescs, cat });
    setBulkCatOpen(false);
    setSelectedIds(new Set());
  }, [selectedIds, allTxs, batchEditTxs]);

  const handleBulkAddTag = useCallback((tag: string) => {
    const t = tag.trim().toLowerCase().replace(/\s+/g, '-');
    if (!t) return;
    batchEditTxs([...selectedIds].map((id) => {
      const tx = allTxs.find((x) => x.id === id);
      const existing = tx?.tags ?? [];
      return { id, updates: { tags: existing.includes(t) ? existing : [...existing, t] } };
    }));
    handleUpdateUserTags([...new Set([...userTags, t])]);
    setBulkTagOpen(false);
    setBulkTagValue('');
    setSelectedIds(new Set());
  }, [selectedIds, allTxs, batchEditTxs, userTags, handleUpdateUserTags]);

  const handleBulkGroup = useCallback((groupName: string) => {
    const g = groupName.trim();
    if (!g) return;
    const groupId = g.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    batchEditTxs([...selectedIds].map((id) => ({ id, updates: { groupId, groupName: g } })));
    setBulkGroupOpen(false);
    setBulkGroupValue('');
    setSelectedIds(new Set());
  }, [selectedIds, batchEditTxs]);

  const openCatFilter = (e: React.MouseEvent) => { setCatFilterRect((e.currentTarget as HTMLElement).getBoundingClientRect()); setCatFilterOpen((v) => !v); setTagFilterOpen(false); setGroupFilterOpen(false); };
  const openTagFilter = (e: React.MouseEvent) => { setTagFilterRect((e.currentTarget as HTMLElement).getBoundingClientRect()); setTagFilterOpen((v) => !v); setCatFilterOpen(false); setGroupFilterOpen(false); };
  const openGroupFilter = (e: React.MouseEvent) => { setGroupFilterRect((e.currentTarget as HTMLElement).getBoundingClientRect()); setGroupFilterOpen((v) => !v); setCatFilterOpen(false); setTagFilterOpen(false); };

  const handleSavePreset = useCallback(() => {
    const name = presetName.trim();
    if (!name) return;
    const preset: FilterPreset = {
      id: Date.now().toString(),
      name,
      categories: [...catFilters],
      tags: [...tagFilters],
      search,
      sort,
      minAmt,
      maxAmt,
    };
    const updated = [...presets, preset];
    setPresets(updated);
    savePresets(updated);
    setPresetName('');
    setSavePresetOpen(false);
  }, [presetName, catFilters, tagFilters, search, sort, minAmt, maxAmt, presets]);

  const handleApplyPreset = useCallback((preset: FilterPreset) => {
    setCatFilters(new Set(preset.categories));
    setTagFilters(new Set(preset.tags));
    setSearch(preset.search);
    setSort(preset.sort);
    setMinAmt(preset.minAmt);
    setMaxAmt(preset.maxAmt);
  }, []);

  const handleDeletePreset = useCallback((id: string) => {
    const updated = presets.filter((p) => p.id !== id);
    setPresets(updated);
    savePresets(updated);
  }, [presets]);

  const catItems = categories.map((c) => ({ id: c.name, label: c.name, color: getCategoryColor(c.name, categories) }));
  const tagItems = allTagsList.map((t) => ({ id: t, label: `#${t}` }));
  const filterActive = catFilters.size > 0 || tagFilters.size > 0 || groupFilters.size > 0 || needsReviewOnly || taxDeductOnly;

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
          <button className="btn" onClick={() => setShowRules(true)} style={{ fontSize: 12, padding: '6px 12px' }}>
            <Icon d={IC.rules} /> Rules
          </button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ fontSize: 12, padding: '6px 12px' }}>
            <Icon d={IC.plus} /> Add
          </button>
        </div>
      </div>

      {/* Saved Presets Row */}
      {(presets.length > 0 || savePresetOpen) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, alignItems: 'center' }}>
          {presets.map((preset) => (
            <div key={preset.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 26, paddingLeft: 10, paddingRight: 6, borderRadius: 99, fontSize: 11, fontWeight: 500, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-1)', cursor: 'pointer', userSelect: 'none' }}>
              <span onClick={() => handleApplyPreset(preset)} style={{ cursor: 'pointer' }}>{preset.name}</span>
              <button onClick={() => handleDeletePreset(preset.id)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', border: 'none', background: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 0, flexShrink: 0 }}
                title="Delete preset">
                <Icon d={IC.close} size={8} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Save Preset Dialog */}
      {savePresetOpen && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
          <input
            autoFocus
            type="text"
            placeholder="Preset name…"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset(); if (e.key === 'Escape') { setSavePresetOpen(false); setPresetName(''); } }}
            style={{ height: 30, fontSize: 12, padding: '0 10px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--card)', color: 'var(--text-1)', width: 180, outline: 'none' }}
          />
          <button onClick={handleSavePreset} disabled={!presetName.trim()}
            style={{ height: 30, fontSize: 11, padding: '0 12px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: presetName.trim() ? 'pointer' : 'not-allowed', opacity: presetName.trim() ? 1 : 0.5 }}>
            Save
          </button>
          <button onClick={() => { setSavePresetOpen(false); setPresetName(''); }}
            style={{ height: 30, fontSize: 11, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-3)', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      )}

      {/* Row 2: Toolbar */}
      <div style={{ display: 'flex', gap: 7, marginBottom: 14, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 140 }}>
          <svg width={13} height={13} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }}>
            <circle cx="6" cy="6" r="4"/><path d="M10 10l2.5 2.5"/>
          </svg>
          <input ref={searchRef} type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', height: 36, paddingLeft: 30, paddingRight: 10, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-1)', boxSizing: 'border-box' }} />
        </div>
        <button onClick={openCatFilter} style={{ ...ctrl(), border: `1px solid ${catFilters.size > 0 ? 'var(--accent)' : 'var(--border)'}`, color: catFilters.size > 0 ? 'var(--accent)' : 'var(--text-1)' }}>
          {catFilters.size > 0 ? `Category · ${catFilters.size}` : 'Category'} <Icon d={IC.chevD} size={10} />
        </button>
        <button onClick={openTagFilter} style={{ ...ctrl(), border: `1px solid ${tagFilters.size > 0 ? 'var(--accent)' : 'var(--border)'}`, color: tagFilters.size > 0 ? 'var(--accent)' : 'var(--text-1)' }}>
          <Icon d={IC.tag} size={11} /> {tagFilters.size > 0 ? `Tags · ${tagFilters.size}` : 'Tags'} <Icon d={IC.chevD} size={10} />
        </button>
        <button onClick={openGroupFilter} style={{ ...ctrl(), border: `1px solid ${groupFilters.size > 0 ? 'rgba(168,85,247,0.6)' : 'var(--border)'}`, color: groupFilters.size > 0 ? '#a855f7' : 'var(--text-1)' }}>
          {groupFilters.size > 0 ? `Group · ${groupFilters.size}` : 'Group'} <Icon d={IC.chevD} size={10} />
        </button>
        <button onClick={() => setTaxDeductOnly((v) => !v)} style={{ ...ctrl(), border: `1px solid ${taxDeductOnly ? 'rgba(52,211,153,0.5)' : 'var(--border)'}`, color: taxDeductOnly ? 'var(--green)' : 'var(--text-1)', background: taxDeductOnly ? 'rgba(52,211,153,0.08)' : 'var(--card)' }}>
          Tax
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
          <button onClick={() => { setCatFilters(new Set()); setTagFilters(new Set()); setGroupFilters(new Set()); setNeedsReviewOnly(false); setTaxDeductOnly(false); }}
            style={{ height: 36, fontSize: 11, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-3)', cursor: 'pointer', flexShrink: 0 }}>Clear</button>
        )}
        <button onClick={() => { setSavePresetOpen((v) => !v); setPresetName(''); }}
          style={{ ...ctrl(), gap: 5, flexShrink: 0 }} title="Save current filters as a preset">
          <Icon d={IC.save} size={11} /> Save filters
        </button>
      </div>

      {/* Filter pills row */}
      {(needsReviewCount > 0 || taxDeductOnly || groupFilters.size > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {[...groupFilters].map((g) => (
            <button key={g} onClick={() => setGroupFilters((p) => { const n = new Set(p); n.delete(g); return n; })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 99, cursor: 'pointer', background: 'rgba(168,85,247,0.1)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }}>
              ⊞ {g}
              <span style={{ opacity: 0.6 }}>× clear</span>
            </button>
          ))}
          {needsReviewCount > 0 && (
            <button onClick={() => setNeedsReviewOnly((v) => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 99, cursor: 'pointer', background: needsReviewOnly ? 'rgba(245,162,0,0.15)' : 'rgba(245,162,0,0.08)', color: 'var(--amber)', border: `1px solid ${needsReviewOnly ? 'rgba(245,162,0,0.4)' : 'rgba(245,162,0,0.2)'}` }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', display: 'inline-block' }} />
              {needsReviewCount} to review
              {needsReviewOnly && <span style={{ opacity: 0.6, marginLeft: 2 }}>× clear</span>}
            </button>
          )}
          {taxDeductOnly && (
            <button onClick={() => setTaxDeductOnly(false)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 99, cursor: 'pointer', background: 'rgba(52,211,153,0.12)', color: 'var(--green)', border: '1px solid rgba(52,211,153,0.3)' }}>
              Tax deductible only
              <span style={{ opacity: 0.6 }}>× clear</span>
            </button>
          )}
        </div>
      )}

      {/* Notice */}
      {notice && (
        <div style={{ marginBottom: 12, padding: '9px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: notice.ok ? 'rgba(52,211,153,0.1)' : 'rgba(242,70,58,0.1)', color: notice.ok ? 'var(--green)' : 'var(--red)', border: `1px solid ${notice.ok ? 'rgba(52,211,153,0.25)' : 'rgba(242,70,58,0.25)'}` }}>
          {notice.msg}
          {!notice.ok && <p style={{ marginTop: 4, fontWeight: 400, opacity: 0.8, fontSize: 11 }}>Tip: Make sure your CSV has Date, Description, and Amount columns.</p>}
        </div>
      )}

      {/* Auto-suggest rule banner */}
      {ruleSuggestion && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, fontSize: 12, background: 'rgba(91,87,245,0.07)', border: '1px solid rgba(91,87,245,0.22)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, color: 'var(--text-1)', minWidth: 160 }}>
            Always categorize <strong>"{ruleSuggestion.desc}"</strong> as <strong>{ruleSuggestion.cat}</strong>?
          </span>
          <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
            <button onClick={() => {
              createMerchantRule(ruleSuggestion.desc, ruleSuggestion.cat);
              setRuleSuggestion(null);
            }} className="btn btn-primary" style={{ fontSize: 11, height: 28, padding: '0 12px' }}>Save rule</button>
            <button onClick={() => {
              const key = `${ruleSuggestion.desc}|||${ruleSuggestion.cat}`;
              const d = loadDismissed();
              d.add(key);
              saveDismissed(d);
              checkSuggestion();
            }} className="btn" style={{ fontSize: 11, height: 28, padding: '0 10px' }}>Dismiss</button>
          </div>
        </div>
      )}

      {/* Transaction list header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8, gap: 8 }}>
        {showRunningBalance && multipleAccounts && (
          <span style={{ fontSize: 11, color: 'var(--amber)', flex: 1 }}>
            ⚠ Multiple accounts detected — balance shown across all accounts combined
          </span>
        )}
        <button
          onClick={toggleRunningBalance}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 99, cursor: 'pointer', background: showRunningBalance ? 'rgba(91,87,245,0.1)' : 'transparent', color: showRunningBalance ? 'var(--accent)' : 'var(--text-3)', border: `1px solid ${showRunningBalance ? 'rgba(91,87,245,0.3)' : 'var(--border)'}`, transition: 'all 0.15s' }}>
          <svg width={10} height={10} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 9V5M3.5 9V1M6 9V3M8.5 9V7" />
          </svg>
          Running Balance
        </button>
      </div>

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
                  const displayStr = tx.displayName || cleanDescription(tx.description) || tx.description;
                  const initial    = (displayStr ?? '?')[0].toUpperCase();
                  const isSelected = selectedId === tx.id;
                  const showDot    = tx.needsReview && !tx.reviewed && !isExcluded;

                  const isChecked = selectedIds.has(tx.id);
                  const showCb   = anySelected || hoveredRowId === tx.id;

                  return (
                    <div key={tx.id}
                      onClick={() => {
                        if (anySelected) {
                          setSelectedIds((p) => { const n = new Set(p); n.has(tx.id) ? n.delete(tx.id) : n.add(tx.id); return n; });
                        } else {
                          setSelectedId(isSelected ? null : tx.id);
                        }
                      }}
                      style={{ display: 'flex', alignItems: 'center', minHeight: 58, padding: '10px 20px', gap: 12, borderBottom: '1px solid var(--border-2)', cursor: 'pointer', transition: 'background 0.1s', opacity: isExcluded ? 0.5 : 1, background: isSelected ? 'var(--card-alt)' : 'transparent' }}
                      onMouseEnter={(e) => { setHoveredRowId(tx.id); if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
                      onMouseLeave={(e) => { setHoveredRowId(null); if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>

                      <div style={{ width: 18, flexShrink: 0, display: 'flex', alignItems: 'center', opacity: showCb ? 1 : 0, transition: 'opacity 0.1s' }}>
                        <input type="checkbox" checked={isChecked}
                          onChange={() => setSelectedIds((p) => { const n = new Set(p); n.has(tx.id) ? n.delete(tx.id) : n.add(tx.id); return n; })}
                          onClick={(e) => e.stopPropagation()}
                          style={{ width: 13, height: 13, accentColor: 'var(--accent)', cursor: 'pointer' }} />
                      </div>

                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: hexToRgba(catColor, 0.15), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: catColor }}>
                          {initial}
                        </div>
                        {showDot && <div style={{ position: 'absolute', bottom: 1, right: 1, width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)', border: '2px solid var(--card)' }} />}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isExcluded ? 'line-through' : 'none' }}>{displayStr}</p>
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
                          {tx.isDuplicate && (
                            <span title="Possible duplicate" style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: 'rgba(245,162,0,0.12)', color: 'var(--amber)', border: '1px solid rgba(245,162,0,0.25)', flexShrink: 0 }}>~dup</span>
                          )}
                          {tx.isTransfer && (
                            <span title="Transfer — excluded from totals" style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.25)', flexShrink: 0 }}>⇄ Transfer</span>
                          )}
                          {attachedTxIds.has(tx.id) && (
                            <span title="Has attachments" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-3)', flexShrink: 0 }}>
                              <Icon d={IC.paperclip} size={10} />
                            </span>
                          )}
                          {tx.isRecurring && !isExcluded && (
                            <button
                              title={`Recurring · ${tx.recurringFrequency} — click to see all occurrences`}
                              onClick={(e) => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                setRecurringPopover((prev) =>
                                  prev?.tx.id === tx.id ? null : { tx, anchor: rect }
                                );
                              }}
                              style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: 'rgba(91,87,245,0.09)', color: 'var(--accent)', border: '1px solid rgba(91,87,245,0.2)', flexShrink: 0, cursor: 'pointer' }}>
                              ↻ {tx.recurringFrequency}
                            </button>
                          )}
                          {tx.taxDeductible && !isExcluded && (
                            <span title="Tax deductible" style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: 'rgba(52,211,153,0.1)', color: 'var(--green)', border: '1px solid rgba(52,211,153,0.25)', flexShrink: 0 }}>Tax</span>
                          )}
                          {tx.groupName && !isExcluded && (
                            <span title={`Group: ${tx.groupName}`} style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: 'rgba(168,85,247,0.1)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.25)', flexShrink: 0 }}>⊞ {tx.groupName}</span>
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

                      <div style={{ flexShrink: 0, textAlign: 'right', minWidth: showRunningBalance ? 88 : undefined }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: isExcluded ? 'var(--text-3)' : txIsIncome ? 'var(--green)' : 'var(--text-1)' }}>
                          {!isExcluded && (txIsIncome ? '+' : '-')}{usd(tx.amount, 2)}
                        </span>
                        {showRunningBalance && runningBalanceMap.has(tx.id) && (
                          <p style={{ fontSize: 10, fontWeight: 500, marginTop: 2, color: (runningBalanceMap.get(tx.id)! >= 0) ? 'var(--green)' : 'var(--red)', opacity: isExcluded ? 0.4 : 0.75 }}>
                            {(runningBalanceMap.get(tx.id)! >= 0 ? '' : '–')}{usd(Math.abs(runningBalanceMap.get(tx.id)!))}
                          </p>
                        )}
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

      {groupFilterOpen && groupFilterRect && (
        <FilterPopover pos={groupFilterRect} items={allGroupsList.map((g) => ({ id: g, label: `⊞ ${g}` }))} selected={groupFilters}
          onToggle={(id) => setGroupFilters((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; })}
          onClear={() => setGroupFilters(new Set())} onClose={() => setGroupFilterOpen(false)} title="Groups" />
      )}

      {inlineCat && (() => {
        const tx = allTxs.find((t) => t.id === inlineCat.txId);
        if (!tx) return null;
        return (
          <InlineCatPopover pos={inlineCat.pos} tx={tx} categories={categories}
            onSelect={(cat) => {
              if (cat !== tx.category) {
                const entry: ChangeHistoryEntry = { field: 'Category', oldValue: tx.category, newValue: cat, timestamp: new Date().toISOString() };
                editTx(tx.id, { category: cat, needsReview: false, changeHistory: [entry] });
                setMerchantPrompt({ descs: [tx.description], cat });
                recordCategorization(tx.description, cat);
              }
              setInlineCat(null);
            }}
            onClose={() => setInlineCat(null)} />
        );
      })()}

      {selectedTx && (
        <DetailPanel tx={selectedTx} categories={categories} allTxs={allTxs}
          onEdit={editTx} onDelete={deleteTx} onExclude={excludeTx} onSplit={splitTx}
          onClose={() => setSelectedId(null)} userTags={userTags} onUpdateUserTags={handleUpdateUserTags}
          onCategoryChanged={(desc, cat) => { setMerchantPrompt({ descs: [desc], cat }); recordCategorization(desc, cat); }}
          splitRules={splitRules} onCreateSplitRule={createSplitRule}
          onAttachmentsChanged={refreshAttachmentSet} />
      )}

      {recurringPopover && (
        <RecurringPopover
          tx={recurringPopover.tx}
          allTxs={allTxs}
          anchor={recurringPopover.anchor}
          onClose={() => setRecurringPopover(null)}
        />
      )}

      {/* Bulk action toolbar */}
      {anySelected && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 45, background: 'var(--panel)', borderTop: '1px solid var(--border)', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 -4px 20px rgba(0,0,0,0.15)', animation: 'slideUp 0.15s ease' }}>
          <span style={{ fontSize: 12, color: 'var(--text-2)', marginRight: 4 }}>{selectedIds.size} selected</span>
          <button onClick={() => setSelectedIds(allVisibleSelected ? new Set() : new Set(sorted.map((t) => t.id)))}
            style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}>
            {allVisibleSelected ? 'Deselect all' : 'Select all visible'}
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={() => setBulkCatOpen(true)} className="btn" style={{ fontSize: 12 }}>Recategorize</button>
          <button onClick={() => setBulkTagOpen(true)} className="btn" style={{ fontSize: 12 }}>Add tag</button>
          <button onClick={() => setBulkGroupOpen(true)} className="btn" style={{ fontSize: 12 }}>Group</button>
          <button onClick={handleBulkToggleExclude} className="btn" style={{ fontSize: 12 }}>Exclude/Include</button>
          <button onClick={() => setDeleteConfirm(true)} className="btn" style={{ fontSize: 12, color: 'var(--red)', borderColor: 'rgba(242,70,58,0.3)' }}>Delete</button>
          <button onClick={() => setSelectedIds(new Set())} style={{ fontSize: 13, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', lineHeight: 1 }}>✕</button>
        </div>
      )}

      {/* Bulk recategorize modal */}
      {bulkCatOpen && (
        <Modal title={`Recategorize ${selectedIds.size} transaction${selectedIds.size !== 1 ? 's' : ''}`} onClose={() => setBulkCatOpen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 320, overflowY: 'auto' }}>
            {categories.map((c) => (
              <button key={c.id} onClick={() => handleBulkRecategorize(c.name)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 6, textAlign: 'left', color: 'var(--text-1)', width: '100%' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--card-alt)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: getCategoryColor(c.name, categories), flexShrink: 0 }} />
                <span style={{ fontSize: 13 }}>{c.name}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* Bulk add tag modal */}
      {bulkTagOpen && (
        <Modal title={`Add tag to ${selectedIds.size} transaction${selectedIds.size !== 1 ? 's' : ''}`} onClose={() => setBulkTagOpen(false)}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input autoFocus type="text" placeholder="Tag name" value={bulkTagValue}
              onChange={(e) => setBulkTagValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleBulkAddTag(bulkTagValue); }}
              style={{ flex: 1, height: 34, fontSize: 13, padding: '0 10px', borderRadius: 7, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
            <button onClick={() => handleBulkAddTag(bulkTagValue)} className="btn btn-primary" style={{ fontSize: 12 }}>Add</button>
          </div>
        </Modal>
      )}

      {/* Bulk group modal */}
      {bulkGroupOpen && (
        <Modal title={`Group ${selectedIds.size} transaction${selectedIds.size !== 1 ? 's' : ''}`} onClose={() => setBulkGroupOpen(false)}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input autoFocus type="text" placeholder="Group name" value={bulkGroupValue}
              onChange={(e) => setBulkGroupValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleBulkGroup(bulkGroupValue); }}
              style={{ flex: 1, height: 34, fontSize: 13, padding: '0 10px', borderRadius: 7, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
            <button onClick={() => handleBulkGroup(bulkGroupValue)} className="btn btn-primary" style={{ fontSize: 12 }}>Group</button>
          </div>
          {allGroupsList.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {allGroupsList.map((g) => (
                <button key={g} onClick={() => handleBulkGroup(g)}
                  style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.08)', color: '#a855f7', cursor: 'pointer' }}>
                  ⊞ {g}
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <Modal title="Delete transactions" onClose={() => setDeleteConfirm(false)}>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>
            Delete {selectedIds.size} transaction{selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setDeleteConfirm(false)} className="btn" style={{ fontSize: 12 }}>Cancel</button>
            <button onClick={handleBulkDelete} className="btn" style={{ fontSize: 12, color: 'var(--red)', borderColor: 'rgba(242,70,58,0.3)' }}>Delete</button>
          </div>
        </Modal>
      )}

      {/* Rules manager modal */}
      {showRules && (
        <RulesModal merchantRules={merchantRules} categories={categories}
          onCreate={createMerchantRule} onDelete={deleteMerchantRule} onUpdate={updateMerchantRule}
          onClose={() => setShowRules(false)}
          splitRules={splitRules} onDeleteSplitRule={deleteSplitRule} />
      )}

      {/* Merchant rule prompt toast */}
      {merchantPrompt && (
        <div style={{ position: 'fixed', bottom: anySelected ? 66 : 20, left: '50%', transform: 'translateX(-50%)', zIndex: 46, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', boxShadow: '0 8px 28px rgba(0,0,0,0.2)', maxWidth: 420, width: 'calc(100vw - 40px)' }}>
          <p style={{ fontSize: 12, color: 'var(--text-1)', marginBottom: 10 }}>
            {merchantPrompt.descs.length === 1
              ? <>Always categorize <strong>"{merchantPrompt.descs[0]}"</strong> as <strong>{merchantPrompt.cat}</strong>?</>
              : <>Create rules for <strong>{merchantPrompt.descs.length} merchants</strong> → <strong>{merchantPrompt.cat}</strong>?</>}
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setMerchantPrompt(null)} className="btn" style={{ fontSize: 11 }}>No</button>
            <button onClick={() => {
              merchantPrompt.descs.forEach((d) => createMerchantRule(d, merchantPrompt.cat));
              setMerchantPrompt(null);
              setNotice({ ok: true, msg: `Rule${merchantPrompt.descs.length > 1 ? 's' : ''} created for ${merchantPrompt.descs.length > 1 ? merchantPrompt.descs.length + ' merchants' : `"${merchantPrompt.descs[0]}"`}.` });
              setTimeout(() => setNotice(null), 2500);
            }} className="btn btn-primary" style={{ fontSize: 11 }}>Yes</button>
          </div>
        </div>
      )}

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <Modal title="Keyboard shortcuts" onClose={() => setShowShortcuts(false)} maxWidth={420}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {([
              ['N',       undefined, 'Add a new transaction'],
              ['F',       undefined, 'Focus the search bar'],
              ['/',       undefined, 'Focus the search bar'],
              ['R',       undefined, 'Reset all filters'],
              ['?',       undefined, 'Toggle this shortcuts panel'],
              ['Esc',     undefined, 'Close open panel / modal'],
              ['⌘ / Ctrl', 'A',     'Select all visible transactions'],
            ] as [string, string | undefined, string][]).map(([key, key2, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px', borderBottom: '1px solid var(--border-2)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{label}</span>
                <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <kbd style={{ fontSize: 11, fontFamily: 'monospace', padding: '2px 7px', borderRadius: 5, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }}>{key}</kbd>
                  {key2 && <kbd style={{ fontSize: 11, fontFamily: 'monospace', padding: '2px 7px', borderRadius: 5, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }}>{key2}</kbd>}
                </span>
              </div>
            ))}
          </div>
        </Modal>
      )}

      <style>{`@keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  );
}

'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { useBudget } from '@/lib/BudgetContext';
import { PRESET_COLORS } from '@/lib/constants';
import type { Category } from '@/lib/types';

function usd(n: number, d = 2) {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function EditableAmount({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const { privacyMode } = useBudget();
  const usd = (n: number, d = 2) => privacyMode ? '••••' : '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const [on,  setOn]  = useState(false);
  const [val, setVal] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (on && ref.current) ref.current.select(); }, [on]);

  const open  = () => { setVal(String(Math.round(value || 0))); setOn(true); };
  const close = () => {
    const v = parseFloat(val);
    if (!isNaN(v) && v >= 0) onSave(Math.round(v * 100) / 100);
    setOn(false);
  };

  if (on) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>$</span>
      <input ref={ref} type="number" min="0" step="1" value={val}
        onChange={(e) => setVal(e.target.value)} onBlur={close}
        onKeyDown={(e) => { if (e.key === 'Enter') close(); if (e.key === 'Escape') setOn(false); }}
        style={{ width: 68, textAlign: 'right', padding: '3px 6px', fontSize: 13, fontWeight: 500, borderColor: 'var(--accent)' }}
      />
    </div>
  );

  return (
    <button onClick={open} title="Click to edit" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--text-1)', padding: '2px 4px', borderRadius: 4, transition: 'color 0.1s, background 0.1s' }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'rgba(91,87,245,0.08)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-1)'; e.currentTarget.style.background = 'none'; }}>
      {usd(value || 0, 0)}
    </button>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {PRESET_COLORS.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)}
          style={{ width: 24, height: 24, borderRadius: '50%', border: value === c ? '3px solid var(--text-1)' : '3px solid transparent', background: c, cursor: 'pointer', outline: 'none', padding: 0, transition: 'border-color 0.1s' }} />
      ))}
    </div>
  );
}

function CategoryModal({ title, initialName = '', initialColor = PRESET_COLORS[0], onSave, onClose }: {
  title: string; initialName?: string; initialColor?: string;
  onSave: (d: { name: string; color: string }) => void; onClose: () => void;
}) {
  const [name,  setName]  = useState(initialName);
  const [color, setColor] = useState(initialColor);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), color });
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 360, padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>{title}</span>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
            <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M1 1l12 12M13 1L1 13"/></svg>
          </button>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="label" style={{ display: 'block', marginBottom: 5 }}>Name</label>
            <input autoFocus type="text" placeholder="e.g. Car Insurance" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} required />
          </div>
          <div>
            <label className="label" style={{ display: 'block', marginBottom: 8 }}>Color</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} className="btn" style={{ flex: 1, justifyContent: 'center' }}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  type: 'income' | 'expense';
  categories: Category[];
  budget: Record<string, number>;
  spending: Record<string, number>;
  carryOver: Record<string, boolean>;
  onUpdateBudget: (cat: string, v: number) => void;
  onToggleCarryOver: (cat: string, e: boolean) => void;
  onAddCategory: (c: Omit<Category, 'id' | 'builtIn'>) => void;
  onDeleteCategory: (id: string) => void;
  onEditCategory: (id: string, u: Partial<Category>) => void;
}

function Section({ title, type, categories, budget, spending, carryOver, onUpdateBudget, onToggleCarryOver, onAddCategory, onDeleteCategory, onEditCategory }: SectionProps) {
  const { privacyMode } = useBudget();
  const usd = (n: number, d = 2) => privacyMode ? '••••' : '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const isIncome = type === 'income';

  const rows = categories.map((cat) => {
    const b      = budget[cat.name] || 0;
    const actual = spending[cat.name] || 0;
    const remaining = isIncome ? actual - b : b - actual;
    const pct    = b > 0 ? Math.min((actual / b) * 100, 100) : 0;
    return { cat, b, actual, remaining, pct };
  });

  const totBudget = rows.reduce((s, r) => s + r.b, 0);
  const totActual = rows.reduce((s, r) => s + r.actual, 0);
  const totRemain = isIncome ? totActual - totBudget : totBudget - totActual;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{title}</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{usd(totActual, 0)} / {usd(totBudget, 0)}</span>
        </div>
        <button onClick={() => setAddOpen(true)} className="btn" style={{ padding: '4px 10px', fontSize: 11 }}>+ Category</button>
      </div>

      <div className="card" style={{ overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 90px 90px 90px 110px 56px', padding: '8px 16px', borderBottom: '1px solid var(--border-2)', background: 'var(--card-alt)' }}>
          {['Category', isIncome ? 'Expected' : 'Budget', 'Actual', 'Remaining', 'Progress', ''].map((h, i) => (
            <span key={i} className="label" style={{ textAlign: i >= 1 && i <= 3 ? 'right' : 'left' }}>{h}</span>
          ))}
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: 'var(--text-3)' }}>No categories yet — add one above.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {rows.map(({ cat, b, actual, remaining, pct }, i) => {
              const barClr = isIncome
                ? (pct >= 100 ? 'var(--green)' : pct >= 50 ? 'var(--accent)' : 'var(--text-3)')
                : (pct >= 90 ? 'var(--red)' : pct >= 70 ? 'var(--amber)' : 'var(--accent)');
              const remClr = remaining >= 0 ? 'var(--green)' : 'var(--red)';
              const hasCarryOver = carryOver[cat.name];

              return (
                <div key={cat.id} className="budget-row"
                  style={{ display: 'grid', gridTemplateColumns: '3fr 90px 90px 90px 110px 56px', padding: '8px 16px', minHeight: 44, borderTop: i > 0 ? '1px solid var(--border-2)' : 'none', alignItems: 'center', transition: 'background 0.1s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--card-alt)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span>
                    <button onClick={() => onToggleCarryOver(cat.name, !hasCarryOver)}
                      title={hasCarryOver ? 'Carry-over on — click to disable' : 'Enable budget carry-over to next month'}
                      style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '1px 6px', borderRadius: 99, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 500, background: hasCarryOver ? 'rgba(91,87,245,0.1)' : 'var(--bg)', color: hasCarryOver ? 'var(--accent)' : 'var(--text-3)', transition: 'all 0.15s' }}>
                      <svg width={9} height={9} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"><path d="M1.5 5A3.5 3.5 0 108.5 5M8.5 5V2.5M8.5 2.5H6"/></svg>
                      {hasCarryOver ? 'Carry-over on' : 'Carry-over'}
                    </button>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <EditableAmount value={b} onSave={(v) => onUpdateBudget(cat.name, v)} />
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 13, color: actual > 0 ? 'var(--text-1)' : 'var(--text-3)', fontWeight: actual > 0 ? 500 : 400 }}>
                    {actual > 0 ? usd(actual, 2) : '—'}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 500, color: b > 0 ? remClr : 'var(--text-3)' }}>
                    {b > 0 ? usd(remaining, 2) : '—'}
                  </div>
                  <div style={{ paddingRight: 8 }}>
                    {b > 0 ? (
                      <>
                        <div className="bar-track" style={{ height: 4 }}>
                          <div className="bar-fill" style={{ '--to': `${pct}%`, width: `${pct}%`, background: barClr, height: '100%' } as React.CSSProperties} />
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'right', marginTop: 2 }}>{pct.toFixed(0)}%</div>
                      </>
                    ) : <span style={{ fontSize: 12, color: 'var(--text-3)' }}>—</span>}
                  </div>

                  <div className="row-actions" style={{ display: 'flex', justifyContent: 'center', gap: 2, opacity: 0, transition: 'opacity 0.1s' }}>
                    <button onClick={() => setEditing(cat)} title="Edit"
                      style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'rgba(91,87,245,0.08)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'none'; }}>
                      <svg width={11} height={11} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"><path d="M9.5 1.5l3 3L4 13H1v-3L9.5 1.5z"/></svg>
                    </button>
                    <button onClick={() => onDeleteCategory(cat.id)} title="Delete"
                      style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'rgba(242,70,58,0.08)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'none'; }}>
                      <svg width={11} height={11} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"><path d="M1.5 3.5h11M5 3.5V2a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1.5M5.5 6v5M8.5 6v5M2.5 3.5l.7 8.5a.5.5 0 00.5.5h6.6a.5.5 0 00.5-.5l.7-8.5"/></svg>
                    </button>
                  </div>
                </div>
              );
            })}

            <div style={{ display: 'grid', gridTemplateColumns: '3fr 90px 90px 90px 110px 56px', padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--card-alt)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total</span>
              <span style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{usd(totBudget, 0)}</span>
              <span style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{usd(totActual, 2)}</span>
              <span style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: totRemain >= 0 ? 'var(--green)' : 'var(--red)' }}>{usd(totRemain, 2)}</span>
              <span /><span />
            </div>
          </div>
        )}
      </div>

      <style>{`.budget-row:hover .row-actions { opacity: 1 !important; }`}</style>

      {addOpen && <CategoryModal title={`New ${isIncome ? 'Income' : 'Expense'} Category`} onSave={(d) => onAddCategory({ ...d, type, group: isIncome ? 'income' : 'spending' })} onClose={() => setAddOpen(false)} />}
      {editing && <CategoryModal title="Edit Category" initialName={editing.name} initialColor={editing.color} onSave={(d) => onEditCategory(editing.id, d)} onClose={() => setEditing(null)} />}
    </>
  );
}

export default function Budget() {
  const { filteredTxs, categories, budget, carryOver, updateBudget, toggleCarryOver, addCategory, deleteCategory, editCategory, privacyMode } = useBudget();

  const spending = useMemo(() => {
    const m: Record<string, number> = {};
    filteredTxs.filter((t) => !t.excluded).forEach((t) => {
      m[t.category] = (m[t.category] || 0) + Math.abs(t.amount);
    });
    return m;
  }, [filteredTxs]);

  const normGroup = (c: Category) => c.group || (c.type === 'income' ? 'income' : 'spending');
  const incomeCats   = categories.filter((c) => normGroup(c) === 'income');
  const billsCats    = categories.filter((c) => normGroup(c) === 'bills');
  const spendingCats = categories.filter((c) => normGroup(c) === 'spending');
  const savingsCats  = categories.filter((c) => normGroup(c) === 'savings');
  const expenseCats  = categories.filter((c) => c.type === 'expense');

  const totalIncome = incomeCats.reduce((s, c) => s + (spending[c.name] || 0), 0);
  const totalSpent  = expenseCats.reduce((s, c) => s + (spending[c.name] || 0), 0);
  const netCashFlow = totalIncome - totalSpent;

  const usdFmt = (n: number) => privacyMode ? '••••' : '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const sharedProps = { budget, spending, carryOver, onUpdateBudget: updateBudget, onToggleCarryOver: toggleCarryOver, onAddCategory: addCategory, onDeleteCategory: deleteCategory, onEditCategory: editCategory };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {([['Income', totalIncome, 'var(--green)'], ['Spending', totalSpent, totalSpent > 0 ? 'var(--text-1)' : 'var(--text-3)'], ['Net Cash Flow', netCashFlow, netCashFlow >= 0 ? 'var(--green)' : 'var(--red)']] as const).map(([lbl, val, clr]) => (
          <div key={lbl} className="card" style={{ padding: '16px 18px' }}>
            <p className="label" style={{ marginBottom: 6 }}>{lbl}</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: clr, letterSpacing: '-0.02em' }}>{usdFmt(val)}</p>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 16, paddingLeft: 2 }}>Click any budget amount to edit it. Hover a row to edit or delete the category.</p>
      <Section title="Income"   type="income"  categories={incomeCats}   {...sharedProps} />
      <div style={{ marginTop: 24 }}><Section title="Bills"    type="expense" categories={billsCats}    {...sharedProps} /></div>
      <div style={{ marginTop: 24 }}><Section title="Spending" type="expense" categories={spendingCats} {...sharedProps} /></div>
      <div style={{ marginTop: 24 }}><Section title="Savings"  type="expense" categories={savingsCats}  {...sharedProps} /></div>
    </div>
  );
}

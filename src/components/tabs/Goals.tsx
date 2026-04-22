'use client';

import { useState } from 'react';
import { useBudget } from '@/lib/BudgetContext';
import type { Goal } from '@/lib/types';

function money(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', display: 'flex', flexDirection: 'column' }}>
      <p className="label" style={{ marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</p>
    </div>
  );
}

function EditableValue({ value, onSave, color = 'var(--text-1)' }: { value: number; onSave: (v: number) => void; color?: string }) {
  const { privacyMode } = useBudget();
  const money = (n: number) => privacyMode ? '••••' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const [editing, setEditing] = useState(false);
  const [val,     setVal]     = useState('');

  const open   = () => { setVal(String(value)); setEditing(true); };
  const commit = () => {
    const v = parseFloat(val);
    if (!isNaN(v) && v >= 0) onSave(v);
    setEditing(false);
  };

  if (editing) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <span style={{ fontSize: 13, color: 'var(--text-3)' }}>$</span>
      <input autoFocus type="number" min="0" step="1" value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        style={{ width: 100, padding: '3px 8px', fontSize: 18, fontWeight: 700, borderColor: 'var(--accent)' }}
      />
    </div>
  );

  return (
    <button onClick={open} style={{ fontSize: 18, fontWeight: 700, color, border: 'none', background: 'none', cursor: 'pointer', padding: '2px 0', transition: 'color 0.1s' }}
      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
      onMouseLeave={(e) => (e.currentTarget.style.color = color)}>
      {money(value)}
    </button>
  );
}

function GoalCard({ goal, onUpdate, onDelete }: { goal: Goal; onUpdate: (id: string, u: Partial<Goal>) => void; onDelete: (id: string) => void }) {
  const pct  = goal.target > 0 ? Math.min((goal.current / goal.target) * 100, 100) : 0;
  const done = pct >= 100;

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.2 }}>{goal.name}</p>
          {done && (
            <span style={{ display: 'inline-block', marginTop: 6, fontSize: 11, fontWeight: 500, color: 'var(--green)', background: 'rgba(52,211,153,0.12)', borderRadius: 6, padding: '2px 8px' }}>
              Goal reached ✓
            </span>
          )}
        </div>
        <button onClick={() => onDelete(goal.id)}
          style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 6, background: 'none', cursor: 'pointer', color: 'var(--text-3)', flexShrink: 0, transition: 'color 0.1s, background 0.1s' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'rgba(242,70,58,0.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'none'; }}>
          <svg width={13} height={13} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
            <path d="M1.5 3.5h11M5 3.5V2a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1.5M5.5 6v5M8.5 6v5M2.5 3.5l.7 8.5a.5.5 0 00.5.5h6.6a.5.5 0 00.5-.5l.7-8.5"/>
          </svg>
        </button>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>{pct.toFixed(0)}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 3, width: `${pct}%`, background: done ? 'var(--green)' : 'var(--accent)', transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)' }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <p className="label" style={{ marginBottom: 4 }}>Saved</p>
          <EditableValue value={goal.current} onSave={(v) => onUpdate(goal.id, { current: v })} />
        </div>
        <div>
          <p className="label" style={{ marginBottom: 4 }}>Target</p>
          <EditableValue value={goal.target} onSave={(v) => onUpdate(goal.id, { target: v })} color="var(--text-2)" />
        </div>
      </div>
    </div>
  );
}

function AddGoalModal({ onAdd, onClose }: { onAdd: (g: Omit<Goal, 'id'>) => void; onClose: () => void }) {
  const [name,   setName]   = useState('');
  const [target, setTarget] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = parseFloat(target);
    if (!name.trim() || isNaN(t) || t <= 0) return;
    onAdd({ name: name.trim(), target: t, current: 0 });
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 360, padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>New Goal</span>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
            <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M1 1l12 12M13 1L1 13"/></svg>
          </button>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="label" style={{ display: 'block', marginBottom: 5 }}>Goal name</label>
            <input autoFocus type="text" placeholder="e.g. Vacation fund" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} required />
          </div>
          <div>
            <label className="label" style={{ display: 'block', marginBottom: 5 }}>Target amount</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', fontSize: 13, pointerEvents: 'none' }}>$</span>
              <input type="number" placeholder="0" min="1" step="1" value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: '100%', paddingLeft: 22 }} required />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} className="btn" style={{ flex: 1, justifyContent: 'center' }}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Create</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Goals() {
  const { goals, addGoal, updateGoal, deleteGoal, privacyMode } = useBudget();
  const money = (n: number) => privacyMode ? '••••' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const [showAdd, setShowAdd] = useState(false);

  const totalSaved  = goals.reduce((s, g) => s + g.current, 0);
  const totalTarget = goals.reduce((s, g) => s + g.target,  0);
  const overallPct  = totalTarget > 0 ? Math.min((totalSaved / totalTarget) * 100, 100) : 0;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <StatCard label="Total Saved"  value={money(totalSaved)}  color="var(--green)" />
        <StatCard label="Total Target" value={money(totalTarget)} color="var(--text-1)" />
        <StatCard label="Overall"      value={totalTarget > 0 ? `${overallPct.toFixed(0)}%` : '—'} color="var(--accent)" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={() => setShowAdd(true)} className="btn btn-primary" style={{ gap: 6 }}>
          <svg width={12} height={12} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 1v10M1 6h10"/></svg>
          New Goal
        </button>
      </div>

      {goals.length === 0 ? (
        <div className="card" style={{ padding: '60px 24px', textAlign: 'center' }}>
          <svg width={40} height={40} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth={1.2} style={{ color: 'var(--text-3)', margin: '0 auto 12px', display: 'block' }}>
            <circle cx="20" cy="20" r="16"/><circle cx="20" cy="20" r="7"/>
            <line x1="20" y1="4" x2="20" y2="1" strokeLinecap="round"/>
          </svg>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>No goals yet — add your first one</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {goals.map((g) => <GoalCard key={g.id} goal={g} onUpdate={updateGoal} onDelete={deleteGoal} />)}
        </div>
      )}

      {showAdd && <AddGoalModal onAdd={addGoal} onClose={() => setShowAdd(false)} />}
    </div>
  );
}

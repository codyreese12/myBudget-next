'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useBudget, buildPreset } from '@/lib/BudgetContext';
import type { DateRange } from '@/lib/types';

// ── Icons ──────────────────────────────────────────────────────────────────────
function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const IC = {
  dashboard:    'M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z',
  transactions: 'M1 4h14M1 8h9M1 12h6',
  budget:       'M2 14V8m3 6V4m3 6V6m3 8V2',
  target:       'M8 8m-3 0a3 3 0 106 0 3 3 0 10-6 0M8 8m-7 0a7 7 0 1014 0 7 7 0 10-14 0',
  moon:         'M13 7a5 5 0 11-8.9-3.1A6 6 0 1013 7z',
  sun:          'M8 1v1m0 12v1M1 8h1m12 0h1M3 3l.7.7m8.6 8.6.7.7M3 13l.7-.7m8.6-8.6.7-.7M8 5a3 3 0 100 6 3 3 0 000-6z',
  menu:         'M1 4h14M1 8h14M1 12h14',
  eye:          'M1 8s3-5.5 7-5.5S15 8 15 8s-3 5.5-7 5.5S1 8 1 8zm7-2a2 2 0 100 4 2 2 0 000-4z',
  eyeOff:       'M1 1l14 14M6.7 6.7A2 2 0 0010.3 10.3M3.4 3.4C2.1 4.5 1 6 1 8s3 5.5 7 5.5c1.5 0 2.9-.4 4.1-1.1M6 2.6C6.6 2.5 7.3 2.5 8 2.5c4 0 7 5.5 7 5.5s-.8 1.4-2.1 2.7',
};

const NAV = [
  { id: 'dashboard',    label: 'Dashboard',    icon: IC.dashboard,    href: '/dashboard' },
  { id: 'transactions', label: 'Transactions', icon: IC.transactions, href: '/transactions' },
  { id: 'budget',       label: 'Budget',       icon: IC.budget,       href: '/budget' },
  { id: 'goals',        label: 'Goals',        icon: IC.target,       href: '/goals' },
];

const PRESETS = [
  { id: 'this-month', label: 'This Month' },
  { id: 'last-month', label: 'Last Month' },
  { id: 'last-3',     label: 'Last 3 Months' },
  { id: 'last-6',     label: 'Last 6 Months' },
  { id: 'ytd',        label: 'YTD' },
  { id: 'last-year',  label: 'Last Year' },
  { id: 'all',        label: 'All Time' },
  { id: 'custom',     label: 'Custom' },
];

function toISO(d: Date) { return d.toISOString().split('T')[0]; }

// ── Date range picker ──────────────────────────────────────────────────────────
function DateRangePicker() {
  const { dateRange, setDateRange } = useBudget();
  const [showCustom,   setShowCustom]   = useState(false);
  const [customStart,  setCustomStart]  = useState(toISO(dateRange.start));
  const [customEnd,    setCustomEnd]    = useState(toISO(dateRange.end));
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showCustom) return;
    const h = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setShowCustom(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showCustom]);

  const selectPreset = (id: string) => {
    if (id === 'custom') { setShowCustom((v) => !v); return; }
    setShowCustom(false);
    setDateRange({ preset: id, ...buildPreset(id) });
  };

  const applyCustom = () => {
    if (!customStart || !customEnd) return;
    const s = new Date(customStart + 'T00:00:00');
    const e = new Date(customEnd   + 'T00:00:00');
    e.setHours(23, 59, 59, 999);
    if (s > e) return;
    setDateRange({ preset: 'custom', start: s, end: e });
    setShowCustom(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {PRESETS.map((p) => {
          const active = dateRange.preset === p.id;
          return (
            <button key={p.id} onClick={() => selectPreset(p.id)} style={{
              padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: active ? 600 : 400,
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              background: active ? 'var(--accent)' : 'var(--panel)',
              color: active ? '#fff' : 'var(--text-2)',
              cursor: 'pointer', transition: 'all 0.12s', whiteSpace: 'nowrap',
            }}>
              {p.label}
            </button>
          );
        })}
      </div>
      {showCustom && (
        <div ref={popRef} style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 100,
          background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10,
          padding: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          display: 'flex', flexDirection: 'column', gap: 12, minWidth: 240,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Start</label>
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} style={{ width: '100%', fontSize: 12 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>End</label>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} style={{ width: '100%', fontSize: 12 }} />
            </div>
          </div>
          <button onClick={applyCustom} className="btn btn-primary" style={{ justifyContent: 'center', fontSize: 12 }}>
            Apply
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────────
function Sidebar({ onNav }: { onNav?: () => void }) {
  const pathname = usePathname();
  const { dark, setDark } = useBudget();

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--panel)', borderRight: '1px solid var(--border)' }}>
      {/* Logo */}
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--border-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 18 }}>
            {[6, 10, 8, 14].map((h, i) => (
              <div key={i} style={{ width: 3, height: h, borderRadius: 2, background: 'var(--accent)' }} />
            ))}
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>myBudget</span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {NAV.map((n) => {
          const active = pathname === n.href || (pathname === '/' && n.href === '/dashboard');
          return (
            <Link key={n.id} href={n.href} onClick={onNav}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 14px', borderRadius: 6, cursor: 'pointer',
                fontSize: 13, fontWeight: active ? 600 : 400, textDecoration: 'none',
                background: active ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-2)',
                border: 'none',
                borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'background 0.1s, color 0.1s',
              }}>
              <Icon d={n.icon} />
              {n.label}
            </Link>
          );
        })}
      </nav>

      {/* Dark mode toggle */}
      <div style={{ padding: '10px 8px', borderTop: '1px solid var(--border-2)' }}>
        <button onClick={() => setDark((d) => !d)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 14px', borderRadius: 6, cursor: 'pointer',
            fontSize: 13, fontWeight: 400, background: 'transparent',
            color: 'var(--text-2)', border: '2px solid transparent',
          }}>
          <Icon d={dark ? IC.sun : IC.moon} />
          {dark ? 'Light mode' : 'Dark mode'}
        </button>
      </div>
    </div>
  );
}

// ── AppShell ───────────────────────────────────────────────────────────────────
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileNav, setMobileNav] = useState(false);
  const { privacyMode, togglePrivacyMode } = useBudget();

  const currentLabel = NAV.find((n) => n.href === pathname)?.label ?? 'Dashboard';

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Desktop sidebar */}
      <aside style={{ width: 200, flexShrink: 0, display: 'none' }} className="md-sidebar">
        <Sidebar />
      </aside>
      <style>{`@media(min-width:768px){.md-sidebar{display:block!important}}`}</style>

      {/* Mobile overlay */}
      {mobileNav && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)' }} onClick={() => setMobileNav(false)} />
          <aside style={{ position: 'relative', zIndex: 10, width: 200, height: '100%' }}>
            <Sidebar onNav={() => setMobileNav(false)} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <header style={{
          height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px', background: 'var(--panel)', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setMobileNav(true)} className="md-hide"
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 4 }}>
              <Icon d={IC.menu} size={18} />
            </button>
            <style>{`@media(min-width:768px){.md-hide{display:none!important}}`}</style>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{currentLabel}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={togglePrivacyMode}
              title={privacyMode ? 'Disable privacy mode' : 'Enable privacy mode (hide amounts)'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 8, border: `1px solid ${privacyMode ? 'var(--accent)' : 'var(--border)'}`,
                background: privacyMode ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                color: privacyMode ? 'var(--accent)' : 'var(--text-3)',
                cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
              }}>
              <Icon d={privacyMode ? IC.eyeOff : IC.eye} size={15} />
            </button>
            <DateRangePicker />
          </div>
        </header>

        <main style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav className="md-hide-flex" style={{ flexShrink: 0, display: 'flex', background: 'var(--panel)', borderTop: '1px solid var(--border)' }}>
          <style>{`@media(min-width:768px){.md-hide-flex{display:none!important}}`}</style>
          {NAV.map((n) => {
            const active = pathname === n.href;
            return (
              <Link key={n.id} href={n.href} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 3, padding: '10px 4px 8px', textDecoration: 'none',
                fontSize: 10, fontWeight: 500, color: active ? 'var(--accent)' : 'var(--text-3)',
              }}>
                <Icon d={n.icon} size={18} />
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

'use client';

import { useState, useRef, useEffect } from 'react';
import { cleanDescription } from '@/lib/autoCategory';
import type { Transaction } from '@/lib/types';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  label?: string;
  matchedIds?: string[];
  answer?: string;
}

interface TxSummary {
  id: string;
  date: string;
  amt: number;
  desc: string;
  cat: string;
  tags?: string[];
  acct?: string;
  recurring?: boolean;
  transfer?: boolean;
  excluded?: boolean;
}

function usd(n: number) {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const SUGGESTIONS = [
  'How much did I spend on dining last month?',
  'What were my top 5 merchants this month?',
  'Show me all subscriptions over $10',
  "What's my average grocery spend?",
  'How many transactions do I have this month?',
];

export default function TransactionChat({
  allTxs,
  onClose,
}: {
  allTxs: Transaction[];
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const txMap = useRef(new Map(allTxs.map((t) => [t.id, t])));

  useEffect(() => {
    txMap.current = new Map(allTxs.map((t) => [t.id, t]));
  }, [allTxs]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const buildHistory = () =>
    messages.map((m) => ({
      role: m.role,
      content: m.role === 'assistant' ? `${m.label}: ${m.answer}` : m.text,
    }));

  const buildTxSummaries = (): TxSummary[] =>
    allTxs.map((t) => ({
      id: t.id,
      date: t.date,
      amt: t.amount,
      desc: t.displayName || cleanDescription(t.description) || t.description,
      cat: t.category,
      ...(t.tags?.length ? { tags: t.tags } : {}),
      ...(t.account ? { acct: t.account } : {}),
      ...(t.isRecurring ? { recurring: true } : {}),
      ...(t.isTransfer ? { transfer: true } : {}),
      ...(t.excluded ? { excluded: true } : {}),
    }));

  const submit = async (q: string) => {
    const question = q.trim();
    if (!question || loading) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          transactions: buildTxSummaries(),
          history: buildHistory(),
        }),
      });

      const data = (await res.json()) as {
        matchedIds?: string[];
        answer?: string;
        label?: string;
        error?: string;
      };

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: '',
        label: data.label ?? question,
        answer: data.error ? `Error: ${data.error}` : (data.answer ?? 'No results found.'),
        matchedIds: data.matchedIds ?? [],
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', text: '', label: question, answer: 'Something went wrong. Please try again.', matchedIds: [] },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (msgId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(msgId) ? next.delete(msgId) : next.add(msgId);
      return next;
    });
  };

  const empty = messages.length === 0;

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Ask about your transactions</span>
          <span style={{ fontSize: 11, background: 'rgba(91,87,245,0.1)', color: 'var(--accent)', padding: '2px 7px', borderRadius: 99, fontWeight: 500 }}>AI</span>
        </div>
        <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3)', borderRadius: 6, fontSize: 16, lineHeight: 1 }}>×</button>
      </div>

      {/* Messages */}
      <div style={{ minHeight: empty ? 0 : 240, maxHeight: 400, overflowY: 'auto', padding: empty ? 0 : '12px 16px', display: 'flex', flexDirection: 'column', gap: 12, transition: 'min-height 0.2s' }}>
        {messages.map((msg) => {
          if (msg.role === 'user') {
            return (
              <div key={msg.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ maxWidth: '80%', background: 'var(--accent)', color: '#fff', borderRadius: '10px 10px 2px 10px', padding: '8px 12px', fontSize: 13 }}>
                  {msg.text}
                </div>
              </div>
            );
          }

          const matched = (msg.matchedIds ?? []).map((id) => txMap.current.get(id)).filter((t): t is Transaction => !!t);
          const expanded = expandedIds.has(msg.id);
          const PREVIEW = 5;

          return (
            <div key={msg.id} style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ maxWidth: '90%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Answer bubble */}
                <div style={{ background: 'var(--panel)', border: '1px solid var(--border-2)', borderRadius: '10px 10px 10px 2px', padding: '10px 14px' }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{msg.label}</p>
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{msg.answer}</p>
                </div>

                {/* Transaction list */}
                {matched.length > 0 && (
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border-2)', borderRadius: 8, overflow: 'hidden' }}>
                    {(expanded ? matched : matched.slice(0, PREVIEW)).map((tx, i) => {
                      const isIncome = tx.amount < 0;
                      const name = tx.displayName || cleanDescription(tx.description) || tx.description;
                      return (
                        <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderBottom: i < (expanded ? matched.length : Math.min(PREVIEW, matched.length)) - 1 ? '1px solid var(--border-2)' : 'none', fontSize: 12 }}>
                          <span style={{ flex: 1, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                          <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{fmtDate(tx.date)}</span>
                          <span style={{ fontWeight: 600, flexShrink: 0, color: isIncome ? 'var(--green)' : 'var(--text-1)', minWidth: 70, textAlign: 'right' }}>
                            {isIncome ? '+' : ''}{usd(tx.amount)}
                          </span>
                        </div>
                      );
                    })}
                    {matched.length > PREVIEW && (
                      <button onClick={() => toggleExpand(msg.id)} style={{ width: '100%', padding: '7px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--accent)', fontWeight: 500, textAlign: 'center' }}>
                        {expanded ? 'Show less' : `Show ${matched.length - PREVIEW} more`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border-2)', borderRadius: '10px 10px 10px 2px', padding: '10px 16px', display: 'flex', gap: 4, alignItems: 'center' }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-3)', display: 'inline-block', animation: `chatDot 1.2s ${i * 0.2}s ease-in-out infinite` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions (shown only when chat is empty) */}
      {empty && (
        <div style={{ padding: '12px 16px 4px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => submit(s)} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 99, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-2)', cursor: 'pointer', transition: 'all 0.1s' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)'; }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: empty ? 'none' : '1px solid var(--border-2)' }}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(input); } }}
          placeholder="Ask anything about your transactions…"
          disabled={loading}
          style={{ flex: 1, height: 36, fontSize: 13, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', outline: 'none', opacity: loading ? 0.6 : 1 }}
        />
        <button
          onClick={() => submit(input)}
          disabled={!input.trim() || loading}
          style={{ height: 36, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: input.trim() && !loading ? 'pointer' : 'not-allowed', opacity: input.trim() && !loading ? 1 : 0.4, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width={12} height={12} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 11L11 1M11 1H4M11 1V8" />
          </svg>
          Ask
        </button>
      </div>

      <style>{`
        @keyframes chatDot {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-3px); }
        }
      `}</style>
    </div>
  );
}

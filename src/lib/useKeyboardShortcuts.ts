import { useEffect, useRef } from 'react';

export interface Shortcut {
  key: string;
  meta?: boolean;   // Cmd (Mac) or Ctrl (Win)
  shift?: boolean;
  handler: () => void;
}

function isTypingContext(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || (el as HTMLElement).isContentEditable;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  // Always keep the latest shortcuts in a ref so the effect never needs to re-run
  const ref = useRef(shortcuts);
  ref.current = shortcuts;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      for (const s of ref.current) {
        if (e.key.toLowerCase() !== s.key.toLowerCase()) continue;
        if (s.meta && !(e.metaKey || e.ctrlKey)) continue;
        if (!s.meta && (e.metaKey || e.ctrlKey)) continue;
        if (s.shift && !e.shiftKey) continue;
        if (!s.shift && e.shiftKey && !s.meta) continue;

        // Allow Escape through even when typing; block everything else
        if (isTypingContext() && s.key.toLowerCase() !== 'escape') continue;

        e.preventDefault();
        s.handler();
        return;
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

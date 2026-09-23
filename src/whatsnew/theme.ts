import { useEffect, useState } from 'react';
import type { ReleaseKind } from './types';

/**
 * Fallback palettes. The package ships no stylesheet: every color is a CSS
 * custom property (`--mumma-wn-*`) whose fallback comes from here, picked by
 * the OS color scheme. An app that sets the properties (e.g. Arcade's
 * parchment/dusk tokens) wins in both schemes.
 */
export interface WhatsNewPalette {
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  accentFg: string;
  border: string;
  kinds: Record<ReleaseKind, string>;
}

export const LIGHT_PALETTE: WhatsNewPalette = {
  bg: '#ffffff',
  fg: '#111827',
  muted: '#6b7280',
  accent: '#2563eb',
  accentFg: '#ffffff',
  border: '#e5e7eb',
  kinds: { new: '#2563eb', improved: '#7c3aed', fixed: '#047857', balance: '#b45309' },
};

export const DARK_PALETTE: WhatsNewPalette = {
  bg: '#111827',
  fg: '#f9fafb',
  muted: '#9ca3af',
  accent: '#60a5fa',
  accentFg: '#0b1220',
  border: '#374151',
  kinds: { new: '#60a5fa', improved: '#c4b5fd', fixed: '#6ee7b7', balance: '#fcd34d' },
};

const QUERY = '(prefers-color-scheme: dark)';

function matches(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
  } catch {
    return false;
  }
}

/** The fallback palette for the current OS color scheme, live. */
export function useWhatsNewPalette(): WhatsNewPalette {
  const [dark, setDark] = useState(matches);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    let mql: MediaQueryList;
    try { mql = window.matchMedia(QUERY); } catch { return; }
    const onChange = () => setDark(mql.matches);
    onChange();
    if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onChange);
    else if (typeof mql.addListener === 'function') mql.addListener(onChange);
    return () => {
      if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', onChange);
      else if (typeof mql.removeListener === 'function') mql.removeListener(onChange);
    };
  }, []);
  return dark ? DARK_PALETTE : LIGHT_PALETTE;
}

/** `var(--mumma-wn-<name>, <fallback>)` */
export const wnVar = (name: string, fallback: string) => `var(--mumma-wn-${name}, ${fallback})`;

export const WN_FONT = 'var(--mumma-wn-font, var(--mumma-font, system-ui, sans-serif))';
export const WN_RADIUS = 'var(--mumma-wn-radius, 0.75rem)';

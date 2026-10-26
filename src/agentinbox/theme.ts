import type { CSSProperties } from 'react';
import { useWhatsNewPalette, type WhatsNewPalette } from '../whatsnew/theme';

/**
 * Colors are CSS custom properties: `--mumma-ai-<name>` first, then the app's
 * What's New skin (`--mumma-wn-<name>`), then the OS-scheme fallback. So an
 * app that already skinned What's New gets a matching inbox with no work, and
 * can still tell the two apart.
 */
export const aiVar = (name: string, fallback: string) => `var(--mumma-ai-${name}, var(--mumma-wn-${name}, ${fallback}))`;

export const AI_FONT = 'var(--mumma-ai-font, var(--mumma-wn-font, var(--mumma-font, system-ui, sans-serif)))';
export const AI_RADIUS = 'var(--mumma-ai-radius, var(--mumma-wn-radius, 0.75rem))';

export interface InboxColors {
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  accentFg: string;
  border: string;
  /** Card and question surfaces, a step off the panel background. */
  surface: string;
  /** "Needs you": the open-question highlight. */
  attention: string;
  done: string;
  failed: string;
}

export function colorsFrom(p: WhatsNewPalette, dark: boolean): InboxColors {
  return {
    bg: aiVar('bg', p.bg),
    fg: aiVar('fg', p.fg),
    muted: aiVar('muted', p.muted),
    accent: aiVar('accent', p.accent),
    accentFg: aiVar('accent-fg', p.accentFg),
    border: aiVar('border', p.border),
    surface: `var(--mumma-ai-surface, ${dark ? '#1f2937' : '#f9fafb'})`,
    attention: `var(--mumma-ai-attention, ${dark ? '#fbbf24' : '#b45309'})`,
    done: `var(--mumma-ai-done, ${p.kinds.fixed})`,
    failed: `var(--mumma-ai-failed, ${dark ? '#fca5a5' : '#b91c1c'})`,
  };
}

/** The inbox's colors for the current OS scheme, live. */
export function useInboxColors(): InboxColors {
  const palette = useWhatsNewPalette();
  return colorsFrom(palette, palette.bg !== '#ffffff');
}

/** A comfortable touch target: 44 px tall, never shrunk for density. */
export const TOUCH: CSSProperties = { minHeight: '2.75rem', boxSizing: 'border-box' };

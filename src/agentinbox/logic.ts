import type { InboxBlock, InboxItem, InboxSummary } from './types';

/**
 * Pure helpers behind the panel and the button. Kept out of the components so
 * they are tested without rendering.
 */

/** What the header badge counts for one inbox: open questions, or everything unseen. */
export function badgeCount(s: Pick<InboxSummary, 'open_asks' | 'unseen' | 'profile'>): number {
  const mode = s.profile?.notify?.badge ?? 'asks';
  return Math.max(0, mode === 'unread' ? s.unseen : s.open_asks);
}

export function totalBadge(list: InboxSummary[] | null | undefined): number {
  return (list ?? []).reduce((n, s) => n + badgeCount(s), 0);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * A short, human time relative to now: "in 2 min", "at 9 PM tonight",
 * "tomorrow at 7 AM", "Thu at 6 PM", "Nov 3". Local time.
 */
export function whenLabel(iso: string | null | undefined, now: Date = new Date(), locale?: string): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const diff = t.getTime() - now.getTime();
  const time = t.toLocaleTimeString(locale, { hour: 'numeric', minute: t.getMinutes() ? '2-digit' : undefined });
  if (diff > 0 && diff < 60 * 60 * 1000) {
    const min = Math.max(1, Math.round(diff / 60000));
    return `in ${min} min`;
  }
  if (sameDay(t, now)) return t.getHours() >= 17 ? `at ${time} tonight` : `at ${time} today`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameDay(t, tomorrow)) return `tomorrow at ${time}`;
  if (diff > 0 && diff < 6 * 24 * 60 * 60 * 1000) {
    return `${t.toLocaleDateString(locale, { weekday: 'short' })} at ${time}`;
  }
  return t.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

/** Milliseconds left in an answer's undo window (0 when closed or absent). */
export function undoRemainingMs(item: Pick<InboxItem, 'undo_until'>, now: number = Date.now()): number {
  if (!item.undo_until) return 0;
  const t = Date.parse(item.undo_until);
  return Number.isFinite(t) ? Math.max(0, t - now) : 0;
}

/** "You chose Sunday" / "No answer by the deadline: Sunday applied" / "You passed". */
export function answerLine(item: InboxItem): string {
  const a = item.answer;
  const chose = a ? [a.labels?.join(', '), a.text ? `"${a.text}"` : null].filter(Boolean).join(' — ') : '';
  if (item.status === 'defaulted') return `No answer by the deadline, so ${chose || 'the default'} applied`;
  if (item.status === 'dismissed') return 'You passed on this';
  if (item.status === 'expired') return 'Expired without an answer';
  if (item.status === 'withdrawn') return 'Withdrawn';
  return chose ? `You chose ${chose}` : 'Answered';
}

/**
 * Where the agent is with an answered question, in one line, or null when
 * there is nothing to say.
 */
export function followThroughLine(item: InboxItem, agentName: string, now: Date = new Date(), locale?: string): string | null {
  switch (item.follow_through) {
    case 'pending': {
      if (undoRemainingMs(item, now.getTime()) > 0) return null;
      const when = whenLabel(item.acts_at, now, locale);
      return when ? `${agentName} will act on this ${when}` : `${agentName} will act on this shortly`;
    }
    case 'acknowledged':
      return `${agentName} is on it`;
    case 'done':
      return item.outcome_summary || 'Done';
    case 'failed':
      return item.outcome_summary ? `Couldn't do it: ${item.outcome_summary}` : "Couldn't do it";
    default:
      return null;
  }
}

/** The text a block renders as when the panel has no picture for it. */
export function blockText(b: InboxBlock): string {
  if (typeof b.fallback === 'string' && b.fallback) return b.fallback;
  const label = typeof b.label === 'string' ? b.label : '';
  if (b.type === 'stat') return `${label}: ${String(b.value ?? '')}${b.unit ? ` ${String(b.unit)}` : ''}`.trim();
  if (b.type === 'progress') return `${label}: ${String(b.value ?? 0)} of ${String(b.max ?? '?')}`;
  return label;
}

/** A progress block's fraction, clamped 0..1, or null when it is not one. */
export function progressFraction(b: InboxBlock): number | null {
  if (b.type !== 'progress') return null;
  const v = Number(b.value);
  const m = Number(b.max);
  if (!Number.isFinite(v) || !Number.isFinite(m) || m <= 0) return null;
  return Math.min(1, Math.max(0, v / m));
}

/** `internal` for an in-app path, `external` for https, null for anything else (never rendered). */
export function classifyInboxLink(url: string | null | undefined): 'internal' | 'external' | null {
  if (typeof url !== 'string') return null;
  if (/^\/(?!\/)/.test(url)) return 'internal';
  if (/^https:\/\//i.test(url)) return 'external';
  return null;
}

/** Snooze presets offered on an item: later today, tonight, tomorrow morning. */
export function snoozeOptions(now: Date = new Date()): { label: string; until: string }[] {
  const out: { label: string; until: string }[] = [];
  const inThree = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  out.push({ label: 'For 3 hours', until: inThree.toISOString() });
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(8, 0, 0, 0);
  out.push({ label: 'Until tomorrow morning', until: tomorrow.toISOString() });
  return out;
}

import type { InboxBlock, InboxItem, InboxPage, InboxSummary } from './types';

/**
 * Pure helpers behind the panel and the button. Kept out of the components so
 * they are tested without rendering.
 */

/** What the header badge counts for one inbox: open questions, or everything unseen. */
export function badgeCount(s: Pick<InboxSummary, 'open_asks' | 'unseen' | 'profile'> & { new_replies?: number }): number {
  const mode = s.profile?.notify?.badge ?? 'asks';
  // A reply the member has not read counts in either mode: they asked, it came.
  return Math.max(0, mode === 'unread' ? s.unseen : s.open_asks) + Math.max(0, s.new_replies ?? 0);
}

export function totalBadge(list: InboxSummary[] | null | undefined): number {
  return (list ?? []).reduce((n, s) => n + badgeCount(s), 0);
}

/**
 * Anything new at all, counted or not: a fresh card or update the badge
 * leaves out in 'asks' mode. Apps show a dot for it when the count is 0.
 */
export function hasNew(list: InboxSummary[] | null | undefined): boolean {
  return (list ?? []).some(s => badgeCount(s) > 0 || s.unseen > 0);
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

/**
 * The line at the top of the panel: what, if anything, the member has to do,
 * and when the agent next checks in.
 */
export function statusSummary(
  page: Pick<InboxPage, 'asks' | 'name' | 'next_run_at' | 'behavior'>,
  now: Date = new Date(),
  locale?: string,
): { tone: 'attention' | 'calm'; headline: string; detail: string | null } {
  const n = page.asks.length;
  const next = whenLabel(page.next_run_at ?? null, now, locale);
  // With a behaviour line above the banner, the next run is already said there.
  const checkIn = next && !page.behavior ? `${page.name} next checks in ${next}.` : null;
  if (n === 0) return { tone: 'calm', headline: 'Nothing needs you', detail: checkIn };
  const due = page.asks.map(a => a.due_at).filter((d): d is string => Boolean(d)).sort()[0];
  const dueLabel = whenLabel(due ?? null, now, locale);
  return {
    tone: 'attention',
    headline: n === 1 ? '1 question needs you' : `${n} questions need you`,
    detail: dueLabel ? `The first is due ${dueLabel}.` : checkIn,
  };
}

/** "just now", "5 min ago", "3 h ago", "yesterday", or a short date. */
export function agoLabel(iso: string | null | undefined, now: Date = new Date(), locale?: string): string {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const diff = now.getTime() - t.getTime();
  if (diff < 60 * 1000) return 'just now';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} min ago`;
  if (sameDay(t, now)) return `${Math.floor(diff / 3600000)} h ago`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(t, yesterday)) return 'yesterday';
  return t.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

/** Items grouped under day headings — "Today", "Yesterday", "Mon, Oct 20" — newest first. */
export function historyDays(items: InboxItem[], now: Date = new Date(), locale?: string): { label: string; items: InboxItem[] }[] {
  const out: { label: string; key: string; items: InboxItem[] }[] = [];
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  for (const it of items) {
    const t = new Date(it.created_at);
    if (Number.isNaN(t.getTime())) continue;
    const key = `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}`;
    let group = out[out.length - 1];
    if (!group || group.key !== key) {
      const label = sameDay(t, now) ? 'Today'
        : sameDay(t, yesterday) ? 'Yesterday'
          : t.toLocaleDateString(locale, {
            weekday: 'short', month: 'short', day: 'numeric',
            ...(t.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
          });
      group = { label, key, items: [] };
      out.push(group);
    }
    group.items.push(it);
  }
  return out.map(({ label, items: list }) => ({ label, items: list }));
}

/** What kind of entry this is, for the History list. */
export function kindLabel(item: Pick<InboxItem, 'kind'>): string {
  return item.kind === 'ask' ? 'Question' : item.kind === 'card' ? 'Card' : 'Update';
}

/** A short state tag for a past item, or null when it needs none. */
export function historyStatus(item: Pick<InboxItem, 'kind' | 'status' | 'expires_at'>, now: Date = new Date()): string | null {
  switch (item.status) {
    case 'open': return 'Waiting for you';
    case 'answered': return 'Answered';
    case 'defaulted': return 'Default applied';
    case 'dismissed': return item.kind === 'ask' ? 'Passed' : 'Cleared';
    case 'expired': return item.kind === 'ask' ? 'Expired' : null;
    case 'withdrawn': return 'Withdrawn';
    case 'retired': return 'Retired';
    case 'live':
      if (item.kind === 'card') return 'Current';
      if (item.expires_at && Date.parse(item.expires_at) <= now.getTime()) return null;
      return null;
    default: return null;
  }
}

/**
 * The one line at the top of an inbox: when this agent runs and when it reads
 * what you send, in plain words, from the server's `behavior`. Null on a
 * server that does not report it.
 */
export function behaviorLine(
  page: Pick<InboxPage, 'name' | 'next_run_at' | 'behavior'>,
  now: Date = new Date(),
  locale?: string,
): string | null {
  const b = page.behavior;
  if (!b) return null;
  const name = page.name;
  const next = b.schedule === 'scheduled' ? whenLabel(page.next_run_at ?? null, now, locale) : null;
  if (b.paused) return `${name} is paused, so it won't run or read anything until it's switched back on.`;
  if (!b.can_wake) {
    return `${name} runs on its own schedule and reads your answers and messages then.`
      + (next ? ` Next run ${next}.` : '');
  }
  if (b.answers === 'next_run') {
    return `${name} acts on your answers at its next run and replies to messages within a few minutes.`
      + (next ? ` Next run ${next}.` : '');
  }
  if (b.schedule === 'scheduled') {
    return `${name} acts on your answers and messages within a few minutes.`
      + (next ? ` Next scheduled run ${next}.` : '');
  }
  return `${name} runs when you answer or write, and acts within a few minutes.`;
}

/** How long after your message the inbox keeps saying the agent is on it. */
export const AWAIT_REPLY_MS = 15 * 60 * 1000;

/**
 * Is a reply on its way? Your message is the last word in the conversation,
 * it is recent, and the agent is one that wakes for messages. The panel then
 * says the agent is working on it and checks back until the reply lands.
 */
export function awaitingReply(
  page: Pick<InboxPage, 'messages' | 'behavior'>,
  now: Date = new Date(),
): boolean {
  const b = page.behavior;
  if (!b || b.paused || b.messages !== 'soon') return false;
  const last = page.messages[page.messages.length - 1];
  if (!last || last.author_type !== 'member') return false;
  const age = now.getTime() - Date.parse(last.created_at);
  return age >= -60 * 1000 && age < AWAIT_REPLY_MS;
}

/** Under the message box: when this agent will read what you write. */
export function composerHint(
  page: Pick<InboxPage, 'name' | 'next_run_at' | 'behavior'> & Partial<Pick<InboxPage, 'messages'>>,
  now: Date = new Date(),
  locale?: string,
): string | null {
  const b = page.behavior;
  if (!b) return null;
  if (b.paused) return `${page.name} is paused and won't read this until it's switched back on.`;
  if (page.messages && awaitingReply({ messages: page.messages, behavior: b }, now)) {
    return `${page.name} has your message and is working on it.`;
  }
  if (b.messages === 'soon') return `${page.name} usually replies within a few minutes.`;
  const next = whenLabel(page.next_run_at ?? null, now, locale);
  return next ? `${page.name} reads this on its next run, ${next}.` : `${page.name} reads this on its next run.`;
}

/** Can the person ask a waiting agent to act on its answers now? */
export function canActNow(page: Pick<InboxPage, 'answered' | 'behavior'>): boolean {
  const b = page.behavior;
  return Boolean(b && b.can_wake && b.answers === 'next_run'
    && page.answered.some(a => a.follow_through === 'pending'));
}

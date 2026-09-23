import type { ReleaseEntry } from './types';

export const SEEN_KEY_PREFIX = 'mumma:whatsnew:v1:';

/**
 * On a first visit (nothing seen yet) at most this many of the newest notes
 * count as unread. Someone opening an app for the first time should see a
 * small "5" rather than a wall of every change ever shipped; the panel still
 * lists everything when they open it.
 */
export const FIRST_VISIT_UNREAD_CAP = 5;

export function seenStorageKey(app: string): string {
  return `${SEEN_KEY_PREFIX}${app}`;
}

function getStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

const toTime = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : Number.NaN);

/** The last `published_at` this browser has seen for `app`, or null (never seen / storage unavailable). */
export function readLastSeen(app: string): string | null {
  try {
    const value = getStorage()?.getItem(seenStorageKey(app)) ?? null;
    return value && !Number.isNaN(toTime(value)) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Records `isoTimestamp` as seen for `app`. Never moves backwards: an older
 * timestamp than the one stored is ignored. Returns false when the timestamp is
 * invalid or storage is missing/throws (private mode, quota) — never throws.
 */
export function markSeen(app: string, isoTimestamp: string): boolean {
  if (Number.isNaN(toTime(isoTimestamp))) return false;
  try {
    const storage = getStorage();
    if (!storage) return false;
    const prev = readLastSeen(app);
    if (prev && toTime(prev) >= toTime(isoTimestamp)) return true;
    storage.setItem(seenStorageKey(app), isoTimestamp);
    return true;
  } catch {
    return false;
  }
}

/** The newest `published_at` among `entries`, or null when there are none. */
export function newestPublishedAt(entries: readonly ReleaseEntry[]): string | null {
  let best: string | null = null;
  for (const e of entries) {
    const t = toTime(e.published_at);
    if (!Number.isNaN(t) && (best === null || t > toTime(best))) best = e.published_at;
  }
  return best;
}

/**
 * How many of `entries` are newer than `lastSeen`. With nothing seen yet (null
 * or unparseable), every entry is new but the count is capped at
 * `FIRST_VISIT_UNREAD_CAP` — see that constant.
 */
export function unreadCount(entries: readonly ReleaseEntry[], lastSeen: string | null): number {
  const seenAt = toTime(lastSeen);
  if (Number.isNaN(seenAt)) return Math.min(entries.length, FIRST_VISIT_UNREAD_CAP);
  return entries.filter(e => toTime(e.published_at) > seenAt).length;
}

/** Later of two ISO timestamps (either may be null). */
export function laterOf(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return toTime(b) > toTime(a) ? b : a;
}

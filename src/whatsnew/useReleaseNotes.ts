import { useCallback, useEffect, useState } from 'react';
import { fetchReleaseNotes, DEFAULT_RELEASE_LIMIT } from './api';
import { laterOf, markSeen, newestPublishedAt, readLastSeen, seenStorageKey, unreadCount } from './seen';
import type { ReleaseEntry } from './types';

/** How long a loaded feed is reused across mounts before it is fetched again. */
export const RELEASE_NOTES_CACHE_TTL_MS = 5 * 60 * 1000;

export interface UseReleaseNotesOptions {
  baseUrl: string;
  app: string;
  limit?: number;
  includeSuite?: boolean;
  /** Defaults to the global `fetch`; tests inject one. */
  fetchImpl?: typeof fetch;
}

export interface UseReleaseNotesResult {
  entries: ReleaseEntry[];
  /** True while the first page is loading and nothing is cached. */
  loading: boolean;
  /** True while `loadMore` is in flight. */
  loadingMore: boolean;
  /** The last fetch failed (entries already loaded are kept). */
  error: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  /** Refetches the first page, ignoring the cache. */
  refresh: () => Promise<void>;
  unread: number;
  /** Marks everything loaded as seen (up to the newest `published_at`). */
  markAllSeen: () => void;
  lastSeen: string | null;
}

interface Snapshot {
  entries: ReleaseEntry[];
  nextBefore: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
  fetchedAt: number;
}

interface Store {
  snap: Snapshot;
  listeners: Set<() => void>;
  inflight: Promise<void> | null;
  moreInflight: Promise<void> | null;
}

// One store per feed, shared by every mount in the page: a header button and a
// panel for the same app share one fetch and one list.
const stores = new Map<string, Store>();

function storeKey(baseUrl: string, app: string, includeSuite: boolean): string {
  return `${String(baseUrl ?? '').replace(/\/+$/, '')}|${app}${includeSuite ? '' : '|nosuite'}`;
}

function getStore(key: string): Store {
  let s = stores.get(key);
  if (!s) {
    s = {
      snap: { entries: [], nextBefore: null, loading: false, loadingMore: false, error: false, fetchedAt: 0 },
      listeners: new Set(),
      inflight: null,
      moreInflight: null,
    };
    stores.set(key, s);
  }
  return s;
}

function update(store: Store, patch: Partial<Snapshot>) {
  store.snap = { ...store.snap, ...patch };
  store.listeners.forEach(l => l());
}

function isFresh(store: Store): boolean {
  return store.snap.fetchedAt > 0 && Date.now() - store.snap.fetchedAt < RELEASE_NOTES_CACHE_TTL_MS;
}

function loadFirstPage(store: Store, opts: Required<Omit<UseReleaseNotesOptions, 'fetchImpl'>> & { fetchImpl?: typeof fetch }, force = false): Promise<void> {
  if (store.inflight) return store.inflight;
  if (!force && isFresh(store)) return Promise.resolve();
  update(store, { loading: true });
  store.inflight = fetchReleaseNotes({ ...opts }).then(page => {
    store.inflight = null;
    if (page) {
      update(store, { entries: page.entries, nextBefore: page.nextBefore, loading: false, error: false, fetchedAt: Date.now() });
    } else {
      update(store, { loading: false, error: true });
    }
  });
  return store.inflight;
}

// Seen changes made by one mount (or another tab) reach every other mount.
const seenListeners = new Set<(app: string) => void>();
// In-memory fallback so the dot clears for this page even when storage throws.
const sessionSeen = new Map<string, string>();

/**
 * Drops every cached feed and the in-memory seen fallback (localStorage is
 * untouched). For tests, and for apps that want a hard refresh.
 */
export function clearReleaseNotesCache(): void {
  stores.clear();
  sessionSeen.clear();
}

function currentLastSeen(app: string): string | null {
  return laterOf(readLastSeen(app), sessionSeen.get(app) ?? null);
}

/**
 * Loads an app's release notes (with suite-wide notes by default) and tracks
 * what this browser has seen. Fetches once per mount, reusing a module-level
 * cache for five minutes, so several consumers on one page do not double-fetch.
 */
export function useReleaseNotes({
  baseUrl, app, limit = DEFAULT_RELEASE_LIMIT, includeSuite = true, fetchImpl,
}: UseReleaseNotesOptions): UseReleaseNotesResult {
  const key = storeKey(baseUrl, app, includeSuite);
  const store = getStore(key);
  const [snap, setSnap] = useState<Snapshot>(store.snap);
  const [lastSeen, setLastSeen] = useState<string | null>(() => currentLastSeen(app));

  useEffect(() => {
    const s = getStore(key);
    const onChange = () => setSnap(s.snap);
    s.listeners.add(onChange);
    setSnap(s.snap);
    loadFirstPage(s, { baseUrl, app, limit, includeSuite, fetchImpl }).catch(() => {});
    return () => { s.listeners.delete(onChange); };
    // Fetch once per mount (and when the feed itself changes); the options
    // are read at that moment on purpose.
  }, [key]);

  useEffect(() => {
    setLastSeen(currentLastSeen(app));
    const onSeen = (changed: string) => { if (changed === app) setLastSeen(currentLastSeen(app)); };
    const onStorage = (e: StorageEvent) => { if (e.key === seenStorageKey(app)) setLastSeen(currentLastSeen(app)); };
    seenListeners.add(onSeen);
    if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
    return () => {
      seenListeners.delete(onSeen);
      if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
    };
  }, [app]);

  const loadMore = useCallback((): Promise<void> => {
    const s = getStore(key);
    if (!s.snap.nextBefore) return Promise.resolve();
    if (s.moreInflight) return s.moreInflight;
    update(s, { loadingMore: true });
    s.moreInflight = fetchReleaseNotes({ baseUrl, app, limit, includeSuite, fetchImpl, before: s.snap.nextBefore }).then(page => {
      s.moreInflight = null;
      if (!page) { update(s, { loadingMore: false, error: true }); return; }
      const have = new Set(s.snap.entries.map(e => e.id));
      update(s, {
        entries: [...s.snap.entries, ...page.entries.filter(e => !have.has(e.id))],
        nextBefore: page.nextBefore,
        loadingMore: false,
        error: false,
      });
    });
    return s.moreInflight;
  }, [key, baseUrl, app, limit, includeSuite, fetchImpl]);

  const refresh = useCallback(
    () => loadFirstPage(getStore(key), { baseUrl, app, limit, includeSuite, fetchImpl }, true),
    [key, baseUrl, app, limit, includeSuite, fetchImpl],
  );

  const markAllSeen = useCallback(() => {
    const newest = newestPublishedAt(getStore(key).snap.entries);
    if (!newest) return;
    const prev = currentLastSeen(app);
    if (prev && Date.parse(prev) >= Date.parse(newest)) return;
    markSeen(app, newest);
    sessionSeen.set(app, newest);
    seenListeners.forEach(l => l(app));
  }, [key, app]);

  return {
    entries: snap.entries,
    // Not yet loaded counts as loading, so the first paint is never a false
    // "Nothing new yet".
    loading: snap.entries.length === 0 && (snap.loading || (snap.fetchedAt === 0 && !snap.error)),
    loadingMore: snap.loadingMore,
    error: snap.error,
    hasMore: !!snap.nextBefore,
    loadMore,
    refresh,
    unread: unreadCount(snap.entries, lastSeen),
    markAllSeen,
    lastSeen,
  };
}

import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { clearReleaseNotesCache, useReleaseNotes, RELEASE_NOTES_CACHE_TTL_MS } from '../../src/whatsnew';
import { entry, okFetch } from './fixtures';

beforeEach(() => { clearReleaseNotesCache(); localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const page1 = [
  entry({ id: 'a', published_at: '2026-09-20T12:00:00.000Z' }),
  entry({ id: 'b', published_at: '2026-09-18T12:00:00.000Z' }),
];
const page2 = [
  entry({ id: 'b', published_at: '2026-09-18T12:00:00.000Z' }), // overlap is de-duplicated
  entry({ id: 'c', published_at: '2026-09-10T12:00:00.000Z' }),
];

test('loads the first page; loading until it lands', async () => {
  const fetchImpl = okFetch(page1);
  const { result } = renderHook(() => useReleaseNotes({ baseUrl: 'https://a.test/', app: 'arcade', fetchImpl }));
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.entries).toHaveLength(2));
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toBe(false);
  expect(result.current.hasMore).toBe(false);
  expect(result.current.unread).toBe(2); // first visit, under the cap
});

test('two consumers of one feed share one fetch, and a remount inside the TTL reuses the cache', async () => {
  const fetchImpl = okFetch(page1);
  const opts = { baseUrl: 'https://a.test', app: 'arcade', fetchImpl };
  const a = renderHook(() => useReleaseNotes(opts));
  const b = renderHook(() => useReleaseNotes({ ...opts, baseUrl: 'https://a.test/' }));
  await waitFor(() => expect(b.result.current.entries).toHaveLength(2));
  expect(a.result.current.entries).toHaveLength(2);
  a.unmount(); b.unmount();
  const c = renderHook(() => useReleaseNotes(opts));
  expect(c.result.current.entries).toHaveLength(2);
  expect(c.result.current.loading).toBe(false);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('a stale cache is refetched on the next mount', async () => {
  const fetchImpl = okFetch(page1);
  const opts = { baseUrl: 'https://a.test', app: 'arcade', fetchImpl };
  const first = renderHook(() => useReleaseNotes(opts));
  await waitFor(() => expect(first.result.current.entries).toHaveLength(2));
  first.unmount();
  const realNow = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(realNow + RELEASE_NOTES_CACHE_TTL_MS + 1);
  renderHook(() => useReleaseNotes(opts));
  await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
});

test('loadMore pages with the cursor and appends without duplicates', async () => {
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data: { entries: page1, next_before: '2026-09-18T12:00:00.000Z' } }) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data: { entries: page2, next_before: null } }) });
  const { result } = renderHook(() => useReleaseNotes({ baseUrl: 'https://a.test', app: 'arcade', limit: 2, fetchImpl }));
  await waitFor(() => expect(result.current.hasMore).toBe(true));
  await act(async () => { await result.current.loadMore(); });
  expect(new URL(fetchImpl.mock.calls[1][0]).searchParams.get('before')).toBe('2026-09-18T12:00:00.000Z');
  expect(result.current.entries.map(e => e.id)).toEqual(['a', 'b', 'c']);
  expect(result.current.hasMore).toBe(false);
  await act(async () => { await result.current.loadMore(); }); // no cursor → no fetch
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test('a failed load reports error and is not cached', async () => {
  const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
  const { result, unmount } = renderHook(() => useReleaseNotes({ baseUrl: 'https://a.test', app: 'arcade', fetchImpl }));
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.loading).toBe(false);
  expect(result.current.entries).toEqual([]);
  unmount();
  renderHook(() => useReleaseNotes({ baseUrl: 'https://a.test', app: 'arcade', fetchImpl }));
  await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
});

test('markAllSeen stores the newest published_at and clears unread in every consumer', async () => {
  const fetchImpl = okFetch(page1);
  const opts = { baseUrl: 'https://a.test', app: 'arcade', fetchImpl };
  const a = renderHook(() => useReleaseNotes(opts));
  const b = renderHook(() => useReleaseNotes(opts));
  await waitFor(() => expect(a.result.current.unread).toBe(2));
  act(() => a.result.current.markAllSeen());
  expect(localStorage.getItem('mumma:whatsnew:v1:arcade')).toBe('2026-09-20T12:00:00.000Z');
  expect(a.result.current.unread).toBe(0);
  expect(a.result.current.lastSeen).toBe('2026-09-20T12:00:00.000Z');
  expect(b.result.current.unread).toBe(0);
});

test('markAllSeen still clears unread for this page when storage throws', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
  const { result } = renderHook(() => useReleaseNotes({ baseUrl: 'https://a.test', app: 'mealmate', fetchImpl: okFetch(page1) }));
  await waitFor(() => expect(result.current.unread).toBe(2));
  act(() => result.current.markAllSeen());
  expect(result.current.unread).toBe(0);
});

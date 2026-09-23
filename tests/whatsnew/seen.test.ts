import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { FIRST_VISIT_UNREAD_CAP, markSeen, newestPublishedAt, readLastSeen, seenStorageKey, unreadCount } from '../../src/whatsnew';
import { entry } from './fixtures';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

const days = (n: number) => Array.from({ length: n }, (_, i) => entry({ id: `e${i}`, published_at: new Date(Date.UTC(2026, 8, 20 - i)).toISOString() }));

test('storage key is versioned per app', () => {
  expect(seenStorageKey('arcade')).toBe('mumma:whatsnew:v1:arcade');
});

test('markSeen / readLastSeen round-trip, never moving backwards', () => {
  expect(readLastSeen('arcade')).toBeNull();
  expect(markSeen('arcade', '2026-09-20T00:00:00.000Z')).toBe(true);
  expect(localStorage.getItem('mumma:whatsnew:v1:arcade')).toBe('2026-09-20T00:00:00.000Z');
  expect(markSeen('arcade', '2026-09-01T00:00:00.000Z')).toBe(true);
  expect(readLastSeen('arcade')).toBe('2026-09-20T00:00:00.000Z');
  expect(readLastSeen('forward')).toBeNull();
  expect(markSeen('arcade', 'not a date')).toBe(false);
});

test('garbage in storage reads as never seen', () => {
  localStorage.setItem(seenStorageKey('arcade'), 'yesterday-ish');
  expect(readLastSeen('arcade')).toBeNull();
});

test('storage that throws never throws out', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
  expect(readLastSeen('arcade')).toBeNull();
  expect(markSeen('arcade', '2026-09-20T00:00:00.000Z')).toBe(false);
});

test('unreadCount counts entries newer than lastSeen', () => {
  const list = days(8); // Sep 20 .. Sep 13
  expect(unreadCount(list, '2026-09-17T12:00:00.000Z')).toBe(3);
  expect(unreadCount(list, '2026-09-20T00:00:00.000Z')).toBe(0); // equal is seen
  expect(unreadCount(list, '2026-01-01T00:00:00.000Z')).toBe(8); // uncapped once something was seen
  expect(unreadCount([], null)).toBe(0);
});

test('first visit caps the unread count at the newest five', () => {
  expect(FIRST_VISIT_UNREAD_CAP).toBe(5);
  expect(unreadCount(days(12), null)).toBe(5);
  expect(unreadCount(days(3), null)).toBe(3);
  expect(unreadCount(days(12), 'garbage')).toBe(5);
});

test('newestPublishedAt ignores order', () => {
  const list = days(3).reverse();
  expect(newestPublishedAt(list)).toBe('2026-09-20T00:00:00.000Z');
  expect(newestPublishedAt([])).toBeNull();
});

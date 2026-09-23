import { test, expect, vi } from 'vitest';
import { fetchReleaseNotes, releaseNotesUrl } from '../../src/whatsnew';
import { okFetch } from './fixtures';

const raw = { id: 'r1', app: 'arcade', title: 'Overland', summary: 'Wagons roll', body: null, kind: 'new', link: '/overland', published_at: '2026-09-20T12:00:00Z' };

test('builds the URL with app, limit, before and suite, trimming a trailing slash', async () => {
  const fetchImpl = okFetch([raw], '2026-09-01T00:00:00Z');
  await fetchReleaseNotes({ baseUrl: 'https://admin.mumma.co/', app: 'arcade', limit: 5, before: '2026-09-10T00:00:00Z', fetchImpl });
  const url = new URL(fetchImpl.mock.calls[0][0]);
  expect(url.origin + url.pathname).toBe('https://admin.mumma.co/api/v1/releases');
  expect(url.searchParams.get('app')).toBe('arcade');
  expect(url.searchParams.get('limit')).toBe('5');
  expect(url.searchParams.get('before')).toBe('2026-09-10T00:00:00Z');
  expect(url.searchParams.get('suite')).toBe('1');
  expect(fetchImpl.mock.calls[0][1]).toMatchObject({ credentials: 'omit' });
});

test('URL defaults: limit 20, no before, suite=0 when excluded; limit is clamped to 1..50', () => {
  expect(releaseNotesUrl({ baseUrl: 'https://a.test', app: 'forward' })).toBe('https://a.test/api/v1/releases?app=forward&limit=20&suite=1');
  expect(releaseNotesUrl({ baseUrl: 'https://a.test//', app: 'forward', includeSuite: false })).toBe('https://a.test/api/v1/releases?app=forward&limit=20&suite=0');
  expect(releaseNotesUrl({ baseUrl: 'https://a.test', app: 'x', limit: 500 })).toContain('limit=50');
  expect(releaseNotesUrl({ baseUrl: 'https://a.test', app: 'x', limit: 0 })).toContain('limit=1');
});

test('returns entries and nextBefore on success, dropping malformed rows', async () => {
  const fetchImpl = okFetch([raw, { id: 'bad' }, { ...raw, id: 7, kind: 'mystery', title: 'Numeric id' }], '2026-09-01T00:00:00Z');
  const page = await fetchReleaseNotes({ baseUrl: 'https://a.test', app: 'arcade', fetchImpl });
  expect(page?.nextBefore).toBe('2026-09-01T00:00:00Z');
  expect(page?.entries.map(e => e.id)).toEqual(['r1', '7']);
  expect(page?.entries[1].kind).toBe('new');
  expect(page?.entries[0]).toMatchObject({ title: 'Overland', summary: 'Wagons roll', body: null, link: '/overland' });
});

test('uses the global fetch when none is injected', async () => {
  const g = okFetch([]);
  vi.stubGlobal('fetch', g);
  expect(await fetchReleaseNotes({ baseUrl: 'https://a.test', app: 'arcade' })).toEqual({ entries: [], nextBefore: null });
  expect(g).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});

test('never throws: network, HTTP, JSON and shape failures all resolve to null', async () => {
  const base = { baseUrl: 'https://a.test', app: 'arcade' };
  expect(await fetchReleaseNotes({ ...base, fetchImpl: vi.fn().mockRejectedValue(new TypeError('offline')) })).toBeNull();
  expect(await fetchReleaseNotes({ ...base, fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ success: false, error: 'MIGRATION_REQUIRED' }) }) })).toBeNull();
  expect(await fetchReleaseNotes({ ...base, fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ success: false, error: 'UNKNOWN_APP' }) }) })).toBeNull();
  expect(await fetchReleaseNotes({ ...base, fetchImpl: vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } }) })).toBeNull();
  expect(await fetchReleaseNotes({ ...base, fetchImpl: vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: {} }) }) })).toBeNull();
  expect(await fetchReleaseNotes({ ...base, fetchImpl: vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: false }) }) })).toBeNull();
  expect(await fetchReleaseNotes({ ...base, fetchImpl: vi.fn(() => { throw new Error('sync boom'); }) as any })).toBeNull();
  expect(await fetchReleaseNotes({ baseUrl: '', app: 'arcade', fetchImpl: okFetch([]) })).toBeNull();
});

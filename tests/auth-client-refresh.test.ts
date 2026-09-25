import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AuthClient,
  recheckDelayMs,
  RECHECK_LEAD_SECONDS,
  RECHECK_MIN_MS,
  STALE_BACKOFF_MAX_MS,
} from '../src/auth/AuthClient';

// Invariant 1 (Mumapps-Auth CONTRACT.md): auth.mumma.co is the ONLY refresher.
// @supabase/auth-js's getSession() refreshes locally whenever the stored token
// is within 90s of expiry, so the web client must never call it.

const answer = (access_token: string, expires_at: number) => ({
  ok: true,
  status: 200,
  json: async () => ({
    authenticated: true,
    user: { id: 'u1', email: null, user_metadata: {} },
    session: { access_token, refresh_token: 'rt', expires_at },
    appAccess: {},
  }),
});

function makeSupabase() {
  return {
    auth: {
      setSession: vi.fn().mockResolvedValue({}),
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'LOCAL' } } }),
    },
  };
}

const bearerOf = (fetchMock: ReturnType<typeof vi.fn>, call: number) =>
  (fetchMock.mock.calls[call][1] as RequestInit & { headers: Record<string, string> }).headers.Authorization;

const nowSec = () => Math.floor(Date.now() / 1000);

beforeEach(() => { vi.useFakeTimers(); document.cookie = 'mumapps_sid=; expires=Thu, 01 Jan 1970 00:00:00 GMT'; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); window.location.hash = ''; });

describe('bearer source — never getSession()', () => {
  test('the first check sends no bearer, later checks send the last answer\'s token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(answer('A1', nowSec() + 3600))
      .mockResolvedValueOnce(answer('A2', nowSec() + 3600));
    vi.stubGlobal('fetch', fetchMock);
    const supabase = makeSupabase();
    const client = new AuthClient({ supabase: supabase as any, authBaseUrl: 'https://auth.test' });
    await client.checkAuthStatus();
    await client.checkAuthStatus();
    expect(bearerOf(fetchMock, 0)).toBeUndefined();
    expect(bearerOf(fetchMock, 1)).toBe('Bearer A1');
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
    client.stop();
  });

  test('the expiry re-check does not call getSession()', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer('A1', nowSec() + 300));
    vi.stubGlobal('fetch', fetchMock);
    const supabase = makeSupabase();
    const client = new AuthClient({ supabase: supabase as any, authBaseUrl: 'https://auth.test' });
    await client.checkAuthStatus();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
    client.stop();
  });

  test('a standalone bridge hand-off is the bearer until auth-status answers', async () => {
    window.location.hash = '#access_token=BRIDGED&refresh_token=rt&expires_at=9999999999';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(answer('A1', nowSec() + 3600))
      .mockResolvedValueOnce(answer('A2', nowSec() + 3600));
    vi.stubGlobal('fetch', fetchMock);
    const supabase = makeSupabase();
    const client = new AuthClient({ supabase: supabase as any, authBaseUrl: 'https://auth.test' });
    await client.start();
    await client.checkAuthStatus();
    expect(bearerOf(fetchMock, 0)).toBe('Bearer BRIDGED');
    expect(bearerOf(fetchMock, 1)).toBe('Bearer A1');
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
    client.stop();
  });

  test('a stale state keeps sending its (possibly expired) token so the service can heal it', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(answer('A1', nowSec() + 3600))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(answer('A2', nowSec() + 3600));
    vi.stubGlobal('fetch', fetchMock);
    const client = new AuthClient({ supabase: makeSupabase() as any, authBaseUrl: 'https://auth.test' });
    await client.checkAuthStatus();
    await client.checkAuthStatus();
    await client.checkAuthStatus();
    expect(bearerOf(fetchMock, 2)).toBe('Bearer A1');
    client.stop();
  });
});

describe('recheckDelayMs', () => {
  const now = 1_000_000_000_000; // ms

  test('lands RECHECK_LEAD_SECONDS before expiry — inside the service\'s 120s skew, outside auth-js\'s 90s margin', () => {
    expect(RECHECK_LEAD_SECONDS).toBeGreaterThan(90);
    expect(RECHECK_LEAD_SECONDS).toBeLessThan(120);
    const exp = now / 1000 + 3600;
    expect(recheckDelayMs(exp, now)).toBe((3600 - RECHECK_LEAD_SECONDS) * 1000);
  });

  test('floors at RECHECK_MIN_MS for a token already inside the lead', () => {
    expect(recheckDelayMs(now / 1000 + 30, now)).toBe(RECHECK_MIN_MS);
    expect(recheckDelayMs(now / 1000 - 600, now)).toBe(RECHECK_MIN_MS);
  });

  test('clamps to setTimeout\'s 32-bit max', () => {
    expect(recheckDelayMs(now / 1000 + 10 * 365 * 86400, now)).toBe(0x7fffffff);
  });

  test('while stale, backs off 5s → 10s → 20s … up to 5 minutes', () => {
    const exp = now / 1000 + 10; // expiring: the old code re-checked every 5s
    expect(recheckDelayMs(exp, now, 1)).toBe(5_000);
    expect(recheckDelayMs(exp, now, 2)).toBe(10_000);
    expect(recheckDelayMs(exp, now, 3)).toBe(20_000);
    expect(recheckDelayMs(exp, now, 7)).toBe(STALE_BACKOFF_MAX_MS);
    expect(recheckDelayMs(exp, now, 500)).toBe(STALE_BACKOFF_MAX_MS);
  });

  test('backoff never pulls a re-check earlier than the expiry lead', () => {
    const exp = now / 1000 + 3600;
    expect(recheckDelayMs(exp, now, 3)).toBe((3600 - RECHECK_LEAD_SECONDS) * 1000);
  });
});

describe('while auth-status is unreachable', () => {
  test('an expiring session backs off instead of re-checking every 5s', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(answer('A1', nowSec() + 20));
    vi.stubGlobal('fetch', fetchMock);
    const client = new AuthClient({ supabase: makeSupabase() as any, authBaseUrl: 'https://auth.test' });
    await client.checkAuthStatus();
    fetchMock.mockRejectedValue(new Error('offline'));
    // Old behaviour: 5s floor → ~12 checks a minute, forever.
    await vi.advanceTimersByTimeAsync(60_000);
    // 5s, then 5s, 10s, 20s → 4 re-checks in the first minute.
    expect(fetchMock.mock.calls.length - 1).toBeLessThanOrEqual(4);
    const atMinute = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    // Capped at 5 min: a handful more over ten minutes, not a hundred.
    expect(fetchMock.mock.calls.length - atMinute).toBeLessThanOrEqual(5);
    client.stop();
  });

  test('repeated failures notify subscribers once, not on every retry', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(answer('A1', nowSec() + 3600));
    vi.stubGlobal('fetch', fetchMock);
    const client = new AuthClient({ supabase: makeSupabase() as any, authBaseUrl: 'https://auth.test' });
    await client.checkAuthStatus();
    const seen: boolean[] = [];
    client.subscribe((s) => seen.push(s.stale));
    fetchMock.mockRejectedValue(new Error('offline'));
    await client.checkAuthStatus();
    await client.checkAuthStatus();
    await client.checkAuthStatus();
    expect(seen).toEqual([true]);
    expect(client.getState().stale).toBe(true);
    expect(client.getState().authenticated).toBe(true);
    client.stop();
  });

  test('recovery resets the backoff and notifies', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(answer('A1', nowSec() + 3600));
    vi.stubGlobal('fetch', fetchMock);
    const client = new AuthClient({ supabase: makeSupabase() as any, authBaseUrl: 'https://auth.test' });
    await client.checkAuthStatus();
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'));
    await client.checkAuthStatus();
    await client.checkAuthStatus();
    const seen: boolean[] = [];
    client.subscribe((s) => seen.push(s.stale));
    fetchMock.mockResolvedValueOnce(answer('A2', nowSec() + 20));
    await client.checkAuthStatus();
    expect(seen).toEqual([false]);
    // Fresh (non-stale) state: the next re-check is back on the 5s floor.
    fetchMock.mockResolvedValue(answer('A3', nowSec() + 3600));
    const before = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock.mock.calls.length).toBe(before + 1);
    client.stop();
  });
});

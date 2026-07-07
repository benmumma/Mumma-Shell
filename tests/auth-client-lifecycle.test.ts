import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthClient } from '../src/auth/AuthClient';

const status = (expires_at: number) => ({
  ok: true, status: 200,
  json: async () => ({
    authenticated: true,
    user: { id: 'u1', email: null, user_metadata: {} },
    session: { access_token: 'at', refresh_token: 'rt', expires_at },
    appAccess: {},
  }),
});

const supabase = () => ({
  auth: {
    setSession: vi.fn().mockResolvedValue({}),
    signOut: vi.fn().mockResolvedValue({}),
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
  },
});

beforeEach(() => { vi.useFakeTimers(); document.cookie = 'mumapps_sid=; expires=Thu, 01 Jan 1970 00:00:00 GMT'; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('lifecycle', () => {
  test('schedules a re-check at expires_at - 60s', async () => {
    const exp = Math.floor(Date.now() / 1000) + 300; // 5 min out
    const fetchMock = vi.fn().mockResolvedValue(status(exp));
    vi.stubGlobal('fetch', fetchMock);
    const client = new AuthClient({ supabase: supabase() as any, authBaseUrl: 'https://auth.test' });
    await client.checkAuthStatus();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(241_000); // past exp-60
    expect(fetchMock).toHaveBeenCalledTimes(2);
    client.stop();
  });

  test('wake handler re-checks only when the marker changed', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const fetchMock = vi.fn().mockResolvedValue(status(exp));
    vi.stubGlobal('fetch', fetchMock);
    document.cookie = 'mumapps_sid=u1.111';
    const client = new AuthClient({ supabase: supabase() as any, authBaseUrl: 'https://auth.test' });
    await client.start();
    const calls = fetchMock.mock.calls.length;
    window.dispatchEvent(new Event('focus'));            // marker unchanged
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    document.cookie = 'mumapps_sid=u1.222';               // rotated elsewhere
    window.dispatchEvent(new Event('focus'));
    await vi.runOnlyPendingTimersAsync();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
    client.stop();
  });
});

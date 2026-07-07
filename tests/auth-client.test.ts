import { describe, test, expect, vi, beforeEach } from 'vitest';
import { AuthClient } from '../src/auth/AuthClient';

const okStatus = (over: Record<string, unknown> = {}) => ({
  ok: true,
  status: 200,
  json: async () => ({
    authenticated: true,
    user: { id: 'u1', email: 'u@x.co', user_metadata: {} },
    session: { access_token: 'at', refresh_token: 'rt', expires_at: 9999999999 },
    appAccess: { forward: true },
    household: { default_household_id: 'h1', memberships: [], pending_invites: [], circles: [] },
    ...over,
  }),
});

function makeClient() {
  const supabase = {
    auth: {
      setSession: vi.fn().mockResolvedValue({}),
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  };
  const client = new AuthClient({ supabase: supabase as any, authBaseUrl: 'https://auth.test' });
  return { client, supabase };
}

beforeEach(() => vi.unstubAllGlobals());

describe('AuthClient.checkAuthStatus', () => {
  test('authenticated: hydrates supabase, exposes household and appAccess', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okStatus()));
    const { client, supabase } = makeClient();
    const state = await client.checkAuthStatus();
    expect(state.authenticated).toBe(true);
    expect(state.household?.default_household_id).toBe('h1');
    expect(state.appAccess.forward).toBe(true);
    expect(state.stale).toBe(false);
    expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'at', refresh_token: 'rt' });
  });

  test('single-flight: concurrent calls share one fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okStatus());
    vi.stubGlobal('fetch', fetchMock);
    const { client } = makeClient();
    await Promise.all([client.checkAuthStatus(), client.checkAuthStatus()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('retryable response carries current state forward as stale', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okStatus()));
    const { client } = makeClient();
    await client.checkAuthStatus();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ authenticated: false, retryable: true, session: {} }) }));
    const state = await client.checkAuthStatus();
    expect(state.authenticated).toBe(true); // kept
    expect(state.stale).toBe(true);
  });

  test('network error and non-2xx also carry state forward', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okStatus()));
    const { client } = makeClient();
    await client.checkAuthStatus();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect((await client.checkAuthStatus()).authenticated).toBe(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));
    expect((await client.checkAuthStatus()).authenticated).toBe(true);
  });

  test('clear_cookies: signs out and clears state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okStatus()));
    const { client, supabase } = makeClient();
    await client.checkAuthStatus();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ authenticated: false, action: 'clear_cookies', session: {} }) }));
    const state = await client.checkAuthStatus();
    expect(state.authenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  test('subscribers are notified with each definitive state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okStatus()));
    const { client } = makeClient();
    const seen: boolean[] = [];
    client.subscribe((s) => seen.push(s.authenticated));
    await client.checkAuthStatus();
    expect(seen).toContain(true);
  });
});

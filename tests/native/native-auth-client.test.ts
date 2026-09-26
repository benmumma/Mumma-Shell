import { describe, test, expect, vi, beforeEach } from 'vitest';

const createClient = vi.fn();
vi.mock('@supabase/supabase-js', () => ({ createClient: (...args: unknown[]) => createClient(...args) }));

// The REAL auth-js error classes, so each case is exactly what refreshSession()
// / getSession() hand back (only supabase-js's createClient is mocked above).
import {
  AuthApiError, AuthRefreshDiscardedError, AuthRetryableFetchError, AuthSessionMissingError, AuthUnknownError,
} from '@supabase/auth-js';

import {
  NativeAuthClient, isNativeAuthClient, isAppleNotLinkedError, isTransientRefreshError,
} from '../../src/native/NativeAuthClient';

/**
 * Routes the two calls Apple sign-in makes: the precheck, then auth-status.
 * `precheck` is whatever Response-ish the case wants back from the endpoint.
 */
function applePrecheckFetch(precheck: any) {
  return vi.fn((url: string) => {
    if (String(url).includes('/api/auth/apple-precheck')) {
      return typeof precheck === 'function' ? precheck() : Promise.resolve(precheck);
    }
    return Promise.resolve(bearerOk());
  });
}

const known = (value: boolean) => ({ ok: true, status: 200, json: async () => ({ known: value }) });

const LOCAL = { access_token: 'device-at', refresh_token: 'device-rt', expires_at: 9999999999 };

/** auth-status as Mumapps-Auth answers a bearer-only caller (NATIVE-AUTH-PLAN WP2). */
const bearerOk = (over: Record<string, unknown> = {}) => ({
  ok: true, status: 200,
  json: async () => ({
    authenticated: true,
    tokenSource: 'bearer',
    session: null,
    hasTokens: false,
    canHydrate: false,
    user: { id: 'u1', email: 'u@x.co', user_metadata: {} },
    appAccess: { arcade: true },
    subscription: null,
    household: { default_household_id: 'h1', memberships: [], pending_invites: [], circles: [] },
    ...over,
  }),
});

const expired = () => ({
  ok: true, status: 200,
  json: async () => ({ authenticated: false, warning: 'bearer_expired' }),
});

function makeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: vi.fn(async (k: string) => map.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => { map.set(k, v); }),
    removeItem: vi.fn(async (k: string) => { map.delete(k); }),
  };
}

function makeClient(opts: { session?: typeof LOCAL | null; appleCredential?: () => Promise<any> } = {}) {
  const session = opts.session === undefined ? LOCAL : opts.session;
  const supabase = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session } }),
      refreshSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
      signOut: vi.fn().mockResolvedValue({}),
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      verifyOtp: vi.fn().mockResolvedValue({ error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signInWithIdToken: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  };
  createClient.mockReturnValue(supabase);
  const storage = makeStorage();
  const client = new NativeAuthClient({
    supabaseUrl: 'https://proj.supabase.co',
    supabaseKey: 'anon',
    storage,
    authBaseUrl: 'https://auth.test',
    appleCredential: opts.appleCredential,
  });
  return { client, supabase, storage };
}

beforeEach(() => { vi.unstubAllGlobals(); createClient.mockReset(); });

describe('construction', () => {
  test('creates its own Supabase client with the injected secure storage', () => {
    const { storage } = makeClient();
    const [url, key, options] = createClient.mock.calls[0] as any[];
    expect(url).toBe('https://proj.supabase.co');
    expect(key).toBe('anon');
    expect(options.auth.persistSession).toBe(true);
    expect(options.auth.autoRefreshToken).toBe(true);
    expect(options.auth.detectSessionInUrl).toBe(false);
    // the adapter is wrapped (key tracking for the signOut wipe) but delegates
    void options.auth.storage.setItem('sb-proj-auth-token', 'x');
    expect(storage.setItem).toHaveBeenCalledWith('sb-proj-auth-token', 'x');
  });

  test('defaults authBaseUrl to the auth service', () => {
    createClient.mockReturnValue({ auth: {} });
    const client = new NativeAuthClient({
      supabaseUrl: 'u', supabaseKey: 'k', storage: makeStorage(),
    });
    expect(client.authBaseUrl).toBe('https://auth.mumma.co');
  });

  test('starts in loading and reports Apple availability from the injected function', () => {
    const { client } = makeClient();
    expect(client.getState().status).toBe('loading');
    expect(client.canUseApple).toBe(false);
    expect(makeClient({ appleCredential: async () => ({ identityToken: 't' }) }).client.canUseApple).toBe(true);
  });
});

describe('checkAuthStatus', () => {
  test('bearer-only success merges appAccess/household and keeps the LOCAL session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(bearerOk());
    vi.stubGlobal('fetch', fetchMock);
    const { client } = makeClient();
    const state = await client.checkAuthStatus();
    expect(state.status).toBe('ready');
    expect(state.authenticated).toBe(true);
    expect(state.stale).toBe(false);
    expect(state.appAccess.arcade).toBe(true);
    expect(state.household?.default_household_id).toBe('h1');
    expect(state.session?.access_token).toBe('device-at');   // auth-status answered session: null
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://auth.test/api/auth-status');
    expect(init.credentials).toBe('omit');                   // no cookies, ever
    expect((init.headers as any).Authorization).toBe('Bearer device-at');
  });

  test('no device session: signed out without calling auth-status', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { client } = makeClient({ session: null });
    const state = await client.checkAuthStatus();
    expect(state.authenticated).toBe(false);
    expect(state.status).toBe('ready');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('single-flight: concurrent callers share one request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(bearerOk());
    vi.stubGlobal('fetch', fetchMock);
    const { client } = makeClient();
    await Promise.all([client.checkAuthStatus(), client.checkAuthStatus()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('network error, 5xx and retryable all carry state forward as stale', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bearerOk()));
    const { client } = makeClient();
    await client.checkAuthStatus();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('airplane mode')));
    let state = await client.checkAuthStatus();
    expect(state.authenticated).toBe(true);
    expect(state.stale).toBe(true);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));
    state = await client.checkAuthStatus();
    expect(state.authenticated).toBe(true);
    expect(state.stale).toBe(true);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ authenticated: false, retryable: true }),
    }));
    state = await client.checkAuthStatus();
    expect(state.authenticated).toBe(true);
    expect(state.stale).toBe(true);
  });

  test("Mumapps-Auth's bearer-only outage answer carries state forward: no refresh, no sign-out", async () => {
    // Exactly what auth-status sends a bearer-only caller when Supabase cannot
    // validate the token (network/5xx) — distinct from `bearer_expired`.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bearerOk()));
    const { client, supabase, storage } = makeClient();
    await client.checkAuthStatus();
    storage.setItem('sb-proj-auth-token', 'x');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ authenticated: false, warning: 'retryable', retryable: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const state = await client.checkAuthStatus();

    expect(state.status).toBe('ready');
    expect(state.authenticated).toBe(true);
    expect(state.stale).toBe(true);
    expect(state.user?.id).toBe('u1');
    expect(state.appAccess.arcade).toBe(true);
    expect(state.session?.access_token).toBe('device-at');
    expect(fetchMock).toHaveBeenCalledTimes(1);                  // no second, post-refresh check
    expect(supabase.auth.refreshSession).not.toHaveBeenCalled(); // not treated as a rejected bearer
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();            // device session kept
  });

  test('bearer_expired: refreshes locally once, then succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(bearerOk());
    vi.stubGlobal('fetch', fetchMock);
    const { client, supabase } = makeClient();
    const state = await client.checkAuthStatus();
    expect(supabase.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(state.authenticated).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('bearer_expired twice: signed out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(expired()));
    const { client } = makeClient();
    const state = await client.checkAuthStatus();
    expect(state.authenticated).toBe(false);
    expect(state.user).toBeNull();
  });

  test('bearer_expired with a failed local refresh: signed out, no retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(expired());
    vi.stubGlobal('fetch', fetchMock);
    const { client, supabase } = makeClient();
    supabase.auth.refreshSession.mockResolvedValue({ data: { session: null }, error: { message: 'bad' } });
    const state = await client.checkAuthStatus();
    expect(state.authenticated).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('401 from auth-status takes the expired path', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce(bearerOk());
    vi.stubGlobal('fetch', fetchMock);
    const { client, supabase } = makeClient();
    expect((await client.checkAuthStatus()).authenticated).toBe(true);
    expect(supabase.auth.refreshSession).toHaveBeenCalled();
  });

  test('subscribers see each definitive state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bearerOk()));
    const { client } = makeClient();
    const seen: boolean[] = [];
    const off = client.subscribe((s) => seen.push(s.authenticated));
    await client.checkAuthStatus();
    off();
    expect(seen).toContain(true);
  });
});

/** What auth-js 2.x returns from refreshSession()/getSession() for each refresh failure. */
const offline = () => new AuthRetryableFetchError('Failed to fetch', 0);           // fetch threw
const gateway = () => new AuthRetryableFetchError('Service Unavailable', 503);     // 500–504, 520–530
const notFound = () => new AuthApiError('Invalid Refresh Token: Refresh Token Not Found', 400, 'refresh_token_not_found');
const invalidGrant = () => new AuthApiError('invalid_grant', 400, 'invalid_grant');
const rateLimited = () => new AuthApiError('Request rate limit reached', 429, 'over_request_rate_limit');

const refreshFails = (error: unknown) => ({ data: { user: null, session: null }, error });
/** getSession() when the stored token had expired and its refresh failed. */
const loadFails = (error: unknown) => ({ data: { session: null }, error });

describe('isTransientRefreshError (mirrors Mumapps-Auth isTransientValidationError)', () => {
  test.each([
    ['AuthRetryableFetchError, fetch threw (0)', offline()],
    ['AuthRetryableFetchError, 503', gateway()],
    ['AuthRetryableFetchError, 522', new AuthRetryableFetchError('cf', 522)],
    ['AuthUnknownError (non-JSON error body)', new AuthUnknownError('Unexpected token <', new SyntaxError('x'))],
    ['AuthApiError 500', new AuthApiError('boom', 500, 'unexpected_failure')],
    ['AuthApiError 505 (not in auth-js retry list)', new AuthApiError('http', 505, undefined)],
    ['AuthApiError 408', new AuthApiError('timeout', 408, 'request_timeout')],
    ['AuthApiError 429', rateLimited()],
    ['duck-typed across a bundle boundary', { name: 'AuthRetryableFetchError', status: 0 }],
  ])('transient: %s', (_label, error) => {
    expect(isTransientRefreshError(error)).toBe(true);
  });

  test.each([
    ['refresh_token_not_found (400)', notFound()],
    ['invalid_grant (400)', invalidGrant()],
    ['refresh_token_already_used (400)', new AuthApiError('Already Used', 400, 'refresh_token_already_used')],
    ['AuthApiError 401', new AuthApiError('bad jwt', 401, 'bad_jwt')],
    ['AuthApiError 403', new AuthApiError('forbidden', 403, undefined)],
    ['AuthSessionMissingError', new AuthSessionMissingError()],
    ['AuthRefreshDiscardedError (409, a concurrent sign-out)', new AuthRefreshDiscardedError()],
    ['a plain Error', new Error('bad')],
    ['an error-shaped object with no status', { message: 'bad' }],
    ['null', null],
    ['undefined', undefined],
    ['a string', 'Failed to fetch'],
  ])('definitive: %s', (_label, error) => {
    expect(isTransientRefreshError(error)).toBe(false);
  });
});

describe('expired device token while Supabase is down', () => {
  /** A signed-in client whose next auth-status call refuses the bearer. */
  async function signedInThenRefused(refused: () => unknown = expired) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bearerOk()));
    const made = makeClient();
    await made.client.start();
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => refused())
      .mockResolvedValue(bearerOk());
    vi.stubGlobal('fetch', fetchMock);
    return { ...made, fetchMock };
  }

  function expectKeptStale(state: ReturnType<NativeAuthClient['getState']>) {
    expect(state.status).toBe('ready');
    expect(state.authenticated).toBe(true);
    expect(state.stale).toBe(true);
    expect(state.user?.id).toBe('u1');
    expect(state.appAccess.arcade).toBe(true);
    expect(state.household?.default_household_id).toBe('h1');
    expect(state.session?.access_token).toBe('device-at');
  }

  function expectSignedOut(state: ReturnType<NativeAuthClient['getState']>) {
    expect(state.status).toBe('ready');
    expect(state.authenticated).toBe(false);
    expect(state.stale).toBe(false);
    expect(state.user).toBeNull();
    expect(state.session).toBeNull();
  }

  describe('resume: auth-status refuses the bearer, the local refresh fails', () => {
    test.each([
      ['offline (AuthRetryableFetchError 0)', offline],
      ['Supabase 503 (AuthRetryableFetchError 503)', gateway],
    ])('%s keeps state as stale, no second auth-status call, nothing wiped', async (_l, err) => {
      const { client, supabase, storage, fetchMock } = await signedInThenRefused();
      supabase.auth.refreshSession.mockResolvedValue(refreshFails(err()));
      const seen: boolean[] = [];
      client.subscribe((s) => seen.push(s.authenticated));

      const state = await client.checkAuthStatus();

      expectKeptStale(state);
      expect(supabase.auth.refreshSession).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);                 // no post-refresh re-check
      expect(supabase.auth.signOut).not.toHaveBeenCalled();
      expect(storage.removeItem).not.toHaveBeenCalled();
      expect(seen).not.toContain(false);                          // the sign-in screen never flashes
    });

    test('a 401 from auth-status takes the same path', async () => {
      const { client, supabase } = await signedInThenRefused(() => ({ ok: false, status: 401, json: async () => ({}) }));
      supabase.auth.refreshSession.mockResolvedValue(refreshFails(gateway()));
      expectKeptStale(await client.checkAuthStatus());
    });

    test('408 / 429 / a non-JSON error body keep state too (Mumapps-Auth parity)', async () => {
      for (const err of [
        new AuthApiError('timeout', 408, 'request_timeout'),
        rateLimited(),
        new AuthUnknownError('Unexpected token <', new SyntaxError('x')),
      ]) {
        const { client, supabase } = await signedInThenRefused();
        supabase.auth.refreshSession.mockResolvedValue(refreshFails(err));
        expectKeptStale(await client.checkAuthStatus());
      }
    });

    test.each([
      ['refresh_token_not_found', notFound],
      ['invalid_grant', invalidGrant],
      ['a concurrent sign-out discarded the refresh', () => new AuthRefreshDiscardedError()],
      ['no session to refresh', () => new AuthSessionMissingError()],
    ])('a definitive rejection (%s) still signs out', async (_l, err) => {
      const { client, supabase, fetchMock } = await signedInThenRefused();
      supabase.auth.refreshSession.mockResolvedValue(refreshFails(err()));
      expectSignedOut(await client.checkAuthStatus());
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test('a transient-looking status that auth-js itself signed out on (SIGNED_OUT during the refresh) signs out', async () => {
      // auth-js 2.x retries only AuthRetryableFetchError; on a 429 with an
      // expired access token it deletes the stored session and emits
      // SIGNED_OUT before refreshSession() returns. That sign-out must win.
      const { client, supabase } = await signedInThenRefused();
      const handler = supabase.auth.onAuthStateChange.mock.calls[0][0] as (e: string) => void;
      supabase.auth.refreshSession.mockImplementation(async () => {
        handler('SIGNED_OUT');
        return refreshFails(rateLimited());
      });
      expectSignedOut(await client.checkAuthStatus());
    });

    test('a throw from refreshSession is not a network verdict and signs out as before', async () => {
      const { client, supabase } = await signedInThenRefused();
      supabase.auth.refreshSession.mockRejectedValue(new TypeError('storage adapter broke'));
      expectSignedOut(await client.checkAuthStatus());
    });

    test('recovers on the next check once Supabase is back', async () => {
      const { client, supabase } = await signedInThenRefused();
      supabase.auth.refreshSession.mockResolvedValueOnce(refreshFails(gateway()));
      expectKeptStale(await client.checkAuthStatus());

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bearerOk()));
      const state = await client.checkAuthStatus();
      expect(state.authenticated).toBe(true);
      expect(state.stale).toBe(false);
    });
  });

  describe("cold start / resume: getSession()'s own refresh of the expired token fails", () => {
    test('cold start, Supabase down: stale and unauthenticated (the carry-forward), never a plain sign-out', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const { client, supabase, storage } = makeClient();
      supabase.auth.getSession.mockResolvedValue(loadFails(offline()));

      const state = await client.start();

      // Nothing in memory to carry: exactly what a network failure on a cold
      // start already answered, which apps render as "can't reach Mumma" and
      // not as the sign-in screen.
      expect(state.status).toBe('ready');
      expect(state.authenticated).toBe(false);
      expect(state.stale).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();                   // no point sending an expired bearer
      expect(supabase.auth.refreshSession).not.toHaveBeenCalled();
      expect(supabase.auth.signOut).not.toHaveBeenCalled();
      expect(storage.removeItem).not.toHaveBeenCalled();
    });

    test('resume after an hour, Supabase 503: the signed-in state is kept as stale', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bearerOk()));
      const { client, supabase } = makeClient();
      await client.start();
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      supabase.auth.getSession.mockResolvedValue(loadFails(gateway()));

      expectKeptStale(await client.checkAuthStatus());
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test('then recovers once the stored session refreshes', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bearerOk()));
      const { client, supabase } = makeClient();
      supabase.auth.getSession.mockResolvedValueOnce(loadFails(offline()));
      expect((await client.start()).stale).toBe(true);

      const state = await client.checkAuthStatus();                // getSession back to LOCAL
      expect(state.authenticated).toBe(true);
      expect(state.stale).toBe(false);
    });

    test.each([
      ['refresh_token_not_found', notFound],
      ['invalid_grant', invalidGrant],
    ])('a definitive rejection (%s) still signs out', async (_l, err) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bearerOk()));
      const { client, supabase } = makeClient();
      await client.start();
      supabase.auth.getSession.mockResolvedValue(loadFails(err()));
      expectSignedOut(await client.checkAuthStatus());
    });

    test('auth-js signing out during the load (429 with an expired token) wins', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bearerOk()));
      const { client, supabase } = makeClient();
      await client.start();
      const handler = supabase.auth.onAuthStateChange.mock.calls[0][0] as (e: string) => void;
      supabase.auth.getSession.mockImplementation(async () => {
        handler('SIGNED_OUT');
        return loadFails(rateLimited());
      });
      expectSignedOut(await client.checkAuthStatus());
    });

    test('a throwing getSession (e.g. a storage adapter) stays "no session", as before', async () => {
      const { client, supabase } = makeClient();
      supabase.auth.getSession.mockRejectedValue(new Error('item not found'));
      const state = await client.start();
      expect(state.authenticated).toBe(false);
      expect(state.stale).toBe(false);
    });
  });
});

describe('start / stop', () => {
  test('start checks status and watches the device session; stop unsubscribes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bearerOk()));
    const { client, supabase } = makeClient();
    const state = await client.start();
    expect(state.authenticated).toBe(true);
    expect(supabase.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
    const unsubscribe = supabase.auth.onAuthStateChange.mock.results[0].value.data.subscription.unsubscribe;
    client.stop();
    expect(unsubscribe).toHaveBeenCalled();
  });

  test('TOKEN_REFRESHED updates the session without another auth-status call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(bearerOk());
    vi.stubGlobal('fetch', fetchMock);
    const { client, supabase } = makeClient();
    await client.start();
    const handler = supabase.auth.onAuthStateChange.mock.calls[0][0] as (e: string) => void;
    supabase.auth.getSession.mockResolvedValue({ data: { session: { ...LOCAL, access_token: 'rotated' } } });
    handler('TOKEN_REFRESHED');
    await vi.waitFor(() => expect(client.getState().session?.access_token).toBe('rotated'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(client.getAuthHeaders().Authorization).toBe('Bearer rotated');
  });

  test('SIGNED_OUT clears state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bearerOk()));
    const { client, supabase } = makeClient();
    await client.start();
    (supabase.auth.onAuthStateChange.mock.calls[0][0] as (e: string) => void)('SIGNED_OUT');
    expect(client.getState().authenticated).toBe(false);
  });
});

describe('signIn / signOut / getAuthHeaders', () => {
  test('signIn does not navigate — it flips status to signing-in', () => {
    const { client } = makeClient();
    const seen: string[] = [];
    client.subscribe((s) => seen.push(s.status));
    client.signIn('/wherever');
    expect(client.getState().status).toBe('signing-in');
    expect(seen).toEqual(['signing-in']);
  });

  test('signOut is local, wipes the storage keys and never hits /api/logout', async () => {
    const fetchMock = vi.fn().mockResolvedValue(bearerOk());
    vi.stubGlobal('fetch', fetchMock);
    const { client, supabase, storage } = makeClient();
    const options = createClient.mock.calls[0][2] as any;
    await options.auth.storage.setItem('sb-proj-auth-token', 'session-json');
    await client.checkAuthStatus();

    await client.signOut();
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(storage.removeItem).toHaveBeenCalledWith('sb-proj-auth-token');
    expect(storage.map.size).toBe(0);
    expect(client.getState().authenticated).toBe(false);
    expect(fetchMock.mock.calls.every(([u]) => !String(u).includes('/api/logout'))).toBe(true);
  });

  test('getAuthHeaders carries the device bearer once authenticated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bearerOk()));
    const { client } = makeClient();
    expect(client.getAuthHeaders().Authorization).toBeUndefined();
    await client.checkAuthStatus();
    expect(client.getAuthHeaders()).toEqual({
      'Content-Type': 'application/json', Authorization: 'Bearer device-at',
    });
  });
});

describe('email one-time code', () => {
  test('requestEmailCode never creates a user', async () => {
    const { client, supabase } = makeClient();
    await client.requestEmailCode('u@x.co');
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'u@x.co', options: { shouldCreateUser: false },
    });
  });

  test('no account: the signups-disabled error becomes readable copy', async () => {
    const { client, supabase } = makeClient();
    supabase.auth.signInWithOtp.mockResolvedValue({ error: { message: 'Signups not allowed for otp' } });
    await expect(client.requestEmailCode('nobody@x.co')).rejects.toThrow(/No Mumma account with that email/);
  });

  test('verifyEmailCode verifies type email and then loads entitlements', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bearerOk()));
    const { client, supabase } = makeClient();
    const state = await client.verifyEmailCode('u@x.co', '123456');
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ email: 'u@x.co', token: '123456', type: 'email' });
    expect(state.authenticated).toBe(true);
  });

  test('wrong and expired codes surface distinct messages', async () => {
    const { client, supabase } = makeClient();
    supabase.auth.verifyOtp.mockResolvedValue({ error: { message: 'Token has expired' } });
    await expect(client.verifyEmailCode('u@x.co', '123456')).rejects.toThrow(/expired/i);
    supabase.auth.verifyOtp.mockResolvedValue({ error: { message: 'Invalid token' } });
    await expect(client.verifyEmailCode('u@x.co', '000000')).rejects.toThrow(/isn't right/);
  });
});

describe('email + password', () => {
  test('lands the session exactly like a verified code: Supabase, then entitlements', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bearerOk()));
    const { client, supabase } = makeClient();
    const state = await client.signInWithPassword({ email: 'u@x.co', password: 'pw' });
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'u@x.co', password: 'pw' });
    expect(state.authenticated).toBe(true);
    expect(state.appAccess).toEqual({ arcade: true });
    // The session in state is the DEVICE token — same one the code path lands.
    expect(state.session?.access_token).toBe('device-at');
  });

  test('a wrong password is one sentence that never echoes it, and says no more than Supabase does', async () => {
    const { client, supabase } = makeClient();
    supabase.auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    await expect(client.signInWithPassword({ email: 'u@x.co', password: 'hunter2' }))
      .rejects.toThrow("That email and password don't match.");
    // An unknown email gets the SAME sentence — the app reveals no more than the API.
    await expect(client.signInWithPassword({ email: 'nobody@x.co', password: 'x' }))
      .rejects.toThrow("That email and password don't match.");
  });

  test('a network failure reads as one, whether Supabase returns it or throws', async () => {
    const { client, supabase } = makeClient();
    supabase.auth.signInWithPassword.mockResolvedValue({ error: { message: 'Failed to fetch' } });
    await expect(client.signInWithPassword({ email: 'u@x.co', password: 'pw' }))
      .rejects.toThrow(/Check your connection/);

    supabase.auth.signInWithPassword.mockRejectedValue(new TypeError('Load failed'));
    await expect(client.signInWithPassword({ email: 'u@x.co', password: 'pw' }))
      .rejects.toThrow(/Check your connection/);
  });

  test('an unconfirmed email and a rate limit each get their own sentence', async () => {
    const { client, supabase } = makeClient();
    supabase.auth.signInWithPassword.mockResolvedValue({ error: { message: 'Email not confirmed' } });
    await expect(client.signInWithPassword({ email: 'u@x.co', password: 'pw' }))
      .rejects.toThrow(/Confirm your email/);
    supabase.auth.signInWithPassword.mockResolvedValue({ error: { message: 'Request rate limit reached' } });
    await expect(client.signInWithPassword({ email: 'u@x.co', password: 'pw' }))
      .rejects.toThrow(/Too many tries/);
  });
});

describe('sign in with Apple', () => {
  test('passes the injected credential to signInWithIdToken', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bearerOk()));
    const appleCredential = vi.fn().mockResolvedValue({ identityToken: 'id-tok', nonce: 'n1' });
    const { client, supabase } = makeClient({ appleCredential });
    const state = await client.signInWithApple();
    expect(supabase.auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple', token: 'id-tok', nonce: 'n1',
    });
    expect(state.authenticated).toBe(true);
  });

  test('throws clearly when no appleCredential was injected', async () => {
    const { client } = makeClient();
    await expect(client.signInWithApple()).rejects.toThrow(/no appleCredential function/);
  });

  test('surfaces a Supabase rejection', async () => {
    const { client, supabase } = makeClient({ appleCredential: async () => ({ identityToken: 'id-tok' }) });
    supabase.auth.signInWithIdToken.mockResolvedValue({ error: { message: 'Unacceptable audience' } });
    await expect(client.signInWithApple()).rejects.toThrow('Unacceptable audience');
  });

  test('prechecks the identity token before completing the sign-in', async () => {
    const fetchMock = applePrecheckFetch(known(true));
    vi.stubGlobal('fetch', fetchMock);
    const { client, supabase } = makeClient({ appleCredential: async () => ({ identityToken: 'id-tok' }) });
    const state = await client.signInWithApple();

    const [url, init] = fetchMock.mock.calls[0] as any[];
    expect(url).toBe('https://auth.test/api/auth/apple-precheck');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('omit');
    expect(JSON.parse(init.body)).toEqual({ identity_token: 'id-tok' });
    expect(supabase.auth.signInWithIdToken).toHaveBeenCalled();
    expect(state.authenticated).toBe(true);
  });

  test('known: false stops before signInWithIdToken — no stray account is minted', async () => {
    vi.stubGlobal('fetch', applePrecheckFetch(known(false)));
    const { client, supabase } = makeClient({ appleCredential: async () => ({ identityToken: 'id-tok' }) });

    const err = await client.signInWithApple().catch((e) => e);
    expect(isAppleNotLinkedError(err)).toBe(true);
    expect(err.message).toMatch(/No Mumma account is linked to this Apple ID/);
    expect(err.linkUrl).toBe('https://auth.test/manage-account#sign-in-methods');
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  test('a precheck outage fails OPEN: 503, 429 and a dead network all sign in', async () => {
    const cases = [
      { ok: false, status: 503, json: async () => ({}) },
      { ok: false, status: 429, json: async () => ({}) },
      () => Promise.reject(new TypeError('Failed to fetch')),
    ];
    for (const c of cases) {
      vi.stubGlobal('fetch', applePrecheckFetch(c));
      const { client, supabase } = makeClient({ appleCredential: async () => ({ identityToken: 'id-tok' }) });
      const state = await client.signInWithApple();
      expect(supabase.auth.signInWithIdToken).toHaveBeenCalled();
      expect(state.authenticated).toBe(true);
    }
  });

  test('a 400 (bad token) is the generic Apple failure, not the linking message', async () => {
    vi.stubGlobal('fetch', applePrecheckFetch({
      ok: false, status: 400, json: async () => ({ error: 'bad_token', message: 'malformed' }),
    }));
    const { client, supabase } = makeClient({ appleCredential: async () => ({ identityToken: 'nope' }) });
    const err = await client.signInWithApple().catch((e) => e);
    expect(isAppleNotLinkedError(err)).toBe(false);
    expect(err.message).toMatch(/Sign in with Apple did not work/);
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled();
  });
});

test('isNativeAuthClient distinguishes the device client', () => {
  const { client } = makeClient();
  expect(isNativeAuthClient(client)).toBe(true);
  expect(isNativeAuthClient({ checkAuthStatus() {} })).toBe(false);
  expect(isNativeAuthClient(null)).toBe(false);
});

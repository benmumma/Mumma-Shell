import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AppAccessMap, AuthClientLike, AuthSession, AuthState, AuthStatusResponse,
} from '../auth/types';

/**
 * Async key/value storage injected by the app — Keychain/Keystore backed on
 * device (a secure-storage Capacitor plugin). The shell never imports
 * `@capacitor/*` itself (C-006 rule 2) and never uses `localStorage` on the
 * native path (rule 3).
 */
export interface NativeSecureStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Result of the app's native Sign-in-with-Apple call (ASAuthorizationController). */
export interface AppleCredential {
  identityToken: string;
  nonce?: string;
}

export interface NativeAuthClientConfig {
  supabaseUrl: string;
  supabaseKey: string;
  /** Secure, Keychain-backed storage for the device session. */
  storage: NativeSecureStorage;
  /**
   * Auth service origin. Defaults to `https://auth.mumma.co` — the WebView's
   * hostname is `localhost`, so hostname sniffing cannot resolve it.
   */
  authBaseUrl?: string;
  /** Supplied by the app when Sign in with Apple is wired up. */
  appleCredential?: () => Promise<AppleCredential>;
}

const CLEARED: Omit<AuthState, 'status'> = {
  authenticated: false, user: null, session: null, appAccess: {}, subscription: null, household: null, stale: false,
};

export const DEFAULT_NATIVE_AUTH_BASE_URL = 'https://auth.mumma.co';

const NO_ACCOUNT = 'No Mumma account with that email. Sign up on the web first, then sign in here.';

/** Supabase's "signups disabled" family of messages — shouldCreateUser: false. */
function friendlyOtpError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('signup') || m.includes('sign up') || m.includes('not found') || m.includes('user not found')) {
    return NO_ACCOUNT;
  }
  return message;
}

function friendlyVerifyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('expired')) return 'That code has expired. Send a new one.';
  if (m.includes('invalid') || m.includes('token')) return "That code isn't right. Check it and try again.";
  return message;
}

/**
 * Password sign-in failures, in the same one-terse-sentence shape as the code
 * path. The password itself is never echoed, and nothing here says more about
 * whether the email exists than Supabase already does — a wrong password and
 * an unknown email both come back as "Invalid login credentials".
 */
function friendlyPasswordError(message: string): string {
  const m = (message || '').toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials') || m.includes('bad_credential')) {
    return "That email and password don't match.";
  }
  if (m.includes('email not confirmed')) return 'Confirm your email first, then sign in.';
  if (m.includes('too many') || m.includes('rate limit')) return 'Too many tries. Wait a minute, then try again.';
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed') || m.includes('timeout')) {
    return "Couldn't reach Mumma. Check your connection and try again.";
  }
  return message || 'Something went wrong. Try again.';
}

const APPLE_GENERIC = 'Sign in with Apple did not work. Try again, or sign in with a code.';

const APPLE_NOT_LINKED =
  'No Mumma account is linked to this Apple ID. Sign in with a code or password, then link '
  + 'your Apple ID at mumma.co.';

/**
 * A definite `known: false` from the precheck: this Apple ID matches no
 * account, and completing the sign-in would mint a stray empty one. Carries
 * the web page where the member links it to the account they already have.
 */
export class AppleNotLinkedError extends Error {
  readonly code = 'apple_not_linked';
  readonly linkUrl: string;
  constructor(linkUrl: string) {
    super(APPLE_NOT_LINKED);
    this.name = 'AppleNotLinkedError';
    this.linkUrl = linkUrl;
  }
}

/** Duck-typed so it survives a bundle boundary. */
export function isAppleNotLinkedError(e: unknown): e is AppleNotLinkedError {
  return !!e && (e as AppleNotLinkedError).code === 'apple_not_linked'
    && typeof (e as AppleNotLinkedError).linkUrl === 'string';
}

/**
 * Native/device counterpart of {@link AuthClient}: a SECOND session family that
 * lives only on this device (C-006 rule 3, `_suite/mobile/NATIVE-AUTH-PLAN.md` §1).
 *
 * INVARIANTS — do not "fix" these away:
 *  1. Device-local session with its OWN refresh-token family, so
 *     `autoRefreshToken: true` is safe: nothing else holds this token, and the
 *     web's single rotating cookie token is untouched (Auth v4 Invariant 1).
 *  2. Entitlements still come from auth.mumma.co — bearer only, `credentials:
 *     'omit'`. Never a cookie read or write, never `/api/logout`.
 *  3. Transient failures carry state forward with `stale: true`, exactly as the
 *     web client does. Only a definitive answer signs the device out.
 *  4. Three ways in, all landing on the same device-local session: email
 *     one-time code (the default), Sign in with Apple, and email + password.
 *     Sign-UP stays on the web — `shouldCreateUser: false`, and no password is
 *     ever persisted or logged here.
 */
export class NativeAuthClient implements AuthClientLike {
  /** The device's own Supabase client — apps read the access token from here. */
  readonly supabase: SupabaseClient;
  readonly authBaseUrl: string;
  /** True when the app injected an `appleCredential` function. */
  readonly canUseApple: boolean;

  private storage: NativeSecureStorage;
  private appleCredential?: () => Promise<AppleCredential>;
  private state: AuthState = { status: 'loading', ...CLEARED };
  private listeners = new Set<(s: AuthState) => void>();
  private inflight: Promise<AuthState> | null = null;
  /** Keys the wrapped storage has seen, so signOut can wipe them all. */
  private touchedKeys = new Set<string>();
  private unsubscribeAuth: (() => void) | null = null;

  constructor(config: NativeAuthClientConfig) {
    this.storage = config.storage;
    this.authBaseUrl = config.authBaseUrl ?? DEFAULT_NATIVE_AUTH_BASE_URL;
    this.appleCredential = config.appleCredential;
    this.canUseApple = typeof config.appleCredential === 'function';

    const tracking: NativeSecureStorage = {
      getItem: (k) => { this.touchedKeys.add(k); return this.storage.getItem(k); },
      setItem: (k, v) => { this.touchedKeys.add(k); return this.storage.setItem(k, v); },
      removeItem: (k) => { this.touchedKeys.delete(k); return this.storage.removeItem(k); },
    };

    this.supabase = createClient(config.supabaseUrl, config.supabaseKey, {
      auth: {
        persistSession: true,      // the device session IS the source of truth here
        autoRefreshToken: true,    // safe: own refresh-token family (Invariant 1 above)
        detectSessionInUrl: false, // no redirect flow inside the WebView
        storage: tracking as any,
      },
    });
  }

  getState(): AuthState { return this.state; }

  subscribe(fn: (s: AuthState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private setState(next: AuthState): void {
    this.state = next;
    this.listeners.forEach((fn) => { try { fn(next); } catch {} });
  }

  private carryForward(): AuthState {
    const kept: AuthState = { ...this.state, status: 'ready', stale: true };
    this.setState(kept);
    return kept;
  }

  private clear(): AuthState {
    const cleared: AuthState = { status: 'ready', ...CLEARED };
    this.setState(cleared);
    return cleared;
  }

  private async localSession(): Promise<AuthSession | null> {
    try {
      const { data } = await this.supabase.auth.getSession();
      const s = data?.session;
      if (!s?.access_token) return null;
      return {
        access_token: s.access_token,
        refresh_token: s.refresh_token ?? null,
        expires_at: s.expires_at ?? null,
      };
    } catch { return null; }
  }

  /** Single-flight: concurrent callers share one request. */
  checkAuthStatus(): Promise<AuthState> {
    if (this.inflight) return this.inflight;
    this.inflight = this.doCheck().finally(() => { this.inflight = null; });
    return this.inflight;
  }

  private async doCheck(refreshed = false): Promise<AuthState> {
    const session = await this.localSession();
    if (!session?.access_token) return this.clear();   // no device session: definitively out

    let data: AuthStatusResponse;
    try {
      const res = await fetch(`${this.authBaseUrl}/api/auth-status`, {
        method: 'GET',
        credentials: 'omit',                            // never a cookie on this path
        cache: 'no-store',
        headers: { Accept: 'application/json', Authorization: `Bearer ${session.access_token}` },
      });
      if (res.status === 401 || res.status === 403) return this.afterRejectedBearer(refreshed);
      if (!res.ok) return this.carryForward();          // outage ≠ logout
      data = await res.json();
    } catch {
      return this.carryForward();                       // network error ≠ logout
    }

    if (data.retryable) return this.carryForward();

    if (!data.authenticated) return this.afterRejectedBearer(refreshed);

    const next: AuthState = {
      status: 'ready', authenticated: true, stale: false,
      user: data.user,
      session,                                          // the LOCAL token; auth-status answers session: null
      appAccess: (data.appAccess ?? {}) as AppAccessMap,
      subscription: data.subscription ?? null,
      household: data.household ?? null,
    };
    this.setState(next);
    return next;
  }

  /**
   * The bearer was refused (`authenticated: false`, typically
   * `warning: 'bearer_expired'`). Try ONE local refresh, then treat a second
   * refusal as signed out.
   */
  private async afterRejectedBearer(alreadyRefreshed: boolean): Promise<AuthState> {
    if (alreadyRefreshed) return this.clear();
    try {
      const { data, error } = await this.supabase.auth.refreshSession();
      if (error || !data?.session?.access_token) return this.clear();
    } catch { return this.clear(); }
    return this.doCheck(true);
  }

  /** Initial check plus a subscription that keeps `state.session` on the live token. */
  async start(): Promise<AuthState> {
    if (!this.unsubscribeAuth) {
      try {
        const { data } = this.supabase.auth.onAuthStateChange((event) => {
          if (event === 'SIGNED_OUT') { this.clear(); return; }
          if (event === 'TOKEN_REFRESHED') void this.syncSessionOnly();
        });
        this.unsubscribeAuth = () => { try { data?.subscription?.unsubscribe(); } catch {} };
      } catch {}
    }
    return this.checkAuthStatus();
  }

  /** Refresh only the token fields — no network call to auth-status. */
  private async syncSessionOnly(): Promise<void> {
    const session = await this.localSession();
    if (!session || !this.state.authenticated) return;
    this.setState({ ...this.state, session });
  }

  stop(): void {
    if (this.unsubscribeAuth) { this.unsubscribeAuth(); this.unsubscribeAuth = null; }
  }

  /**
   * Does NOT navigate: the app routes to its own sign-in screen when it sees
   * `status === 'signing-in'` (there is no web redirect inside the WebView).
   */
  signIn(_returnTo?: string): void {
    this.setState({ ...this.state, status: 'signing-in' });
  }

  /** Local sign-out only: this device's session, plus a storage wipe. Never `/api/logout`. */
  async signOut(): Promise<void> {
    try { await this.supabase.auth.signOut({ scope: 'local' }); } catch {}
    const keys = Array.from(this.touchedKeys);
    this.touchedKeys.clear();
    for (const key of keys) {
      try { await this.storage.removeItem(key); } catch {}
    }
    this.clear();
  }

  getAuthHeaders(): Record<string, string> {
    const token = this.state.session?.access_token;
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  }

  /** Email one-time code, step 1. `shouldCreateUser: false` — sign-up stays on the web. */
  async requestEmailCode(email: string): Promise<void> {
    const { error } = await this.supabase.auth.signInWithOtp({
      email, options: { shouldCreateUser: false },
    });
    if (error) throw new Error(friendlyOtpError(error.message));
  }

  /** Email one-time code, step 2: verify the 6 digits and load entitlements. */
  async verifyEmailCode(email: string, code: string): Promise<AuthState> {
    const { error } = await this.supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) throw new Error(friendlyVerifyError(error.message));
    return this.checkAuthStatus();
  }

  /**
   * Email + password, for an account that has one. Lands the session exactly
   * the way {@link verifyEmailCode} does — same Keychain persistence, same
   * refresh-token family, same entitlements load — so nothing downstream can
   * tell the two paths apart.
   */
  async signInWithPassword({ email, password }: { email: string; password: string }): Promise<AuthState> {
    let failure: string | null = null;
    try {
      const { error } = await this.supabase.auth.signInWithPassword({ email, password });
      if (error) failure = error.message;
    } catch (e) {
      failure = e instanceof Error ? e.message : '';
    }
    if (failure !== null) throw new Error(friendlyPasswordError(failure));
    return this.checkAuthStatus();
  }

  /** Where a member links an Apple ID to the account they already have. */
  get appleLinkUrl(): string {
    return `${this.authBaseUrl.replace(/\/+$/, '')}/manage-account#sign-in-methods`;
  }

  /**
   * Asks auth.mumma.co whether this Apple identity matches an account BEFORE
   * the sign-in completes — Supabase would otherwise create a new, empty user
   * for an unmatched Apple ID and strand the member's household on the old one.
   *
   * FAILS OPEN on purpose: a rate limit, an outage or a dead network answers
   * 'unavailable' and the sign-in proceeds exactly as it did before the
   * endpoint existed. Only a definite `known: false` blocks. The token is
   * posted and never logged.
   */
  private async applePrecheck(identityToken: string): Promise<'known' | 'unknown' | 'bad-token' | 'unavailable'> {
    try {
      const res = await fetch(`${this.authBaseUrl}/api/auth/apple-precheck`, {
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ identity_token: identityToken }),
      });
      if (res.status === 400) return 'bad-token';
      if (!res.ok) return 'unavailable';              // 429, 502, 503 → fail open
      const data = await res.json();
      return data?.known === false ? 'unknown' : 'known';
    } catch {
      return 'unavailable';                           // network error → fail open
    }
  }

  /**
   * Native Sign in with Apple: the app's credential function → a precheck
   * against auth.mumma.co → `signInWithIdToken`.
   */
  async signInWithApple(): Promise<AuthState> {
    if (!this.appleCredential) {
      throw new Error('Sign in with Apple is unavailable: no appleCredential function was passed to NativeAuthClient.');
    }
    const credential = await this.appleCredential();
    if (!credential?.identityToken) throw new Error('Sign in with Apple returned no identity token.');

    const verdict = await this.applePrecheck(credential.identityToken);
    if (verdict === 'unknown') throw new AppleNotLinkedError(this.appleLinkUrl);
    if (verdict === 'bad-token') throw new Error(APPLE_GENERIC);

    const { error } = await this.supabase.auth.signInWithIdToken({
      provider: 'apple', token: credential.identityToken, nonce: credential.nonce,
    });
    if (error) throw new Error(error.message);
    return this.checkAuthStatus();
  }
}

/** True for a device-local client — lets shared UI reach the native-only methods. */
export function isNativeAuthClient(client: unknown): client is NativeAuthClient {
  return !!client && typeof (client as NativeAuthClient).requestEmailCode === 'function'
    && typeof (client as NativeAuthClient).verifyEmailCode === 'function';
}

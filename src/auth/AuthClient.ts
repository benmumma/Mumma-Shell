import type { AuthClientConfig, AuthClientLike, AuthState, AuthStatusResponse, SupabaseAuthLike } from './types';
import { readSessionMarker } from './marker';
import { resolveAuthBaseUrl, buildSignInUrl, buildLogoutUrl, buildBridgeUrl } from './urls';
import { consumeBridgeHash } from './bridge';

const CLEARED: Omit<AuthState, 'status'> = {
  authenticated: false, user: null, session: null, appAccess: {}, subscription: null, household: null, stale: false,
};

/**
 * How long before `expires_at` the client asks auth-status again. The service
 * refreshes proactively once a session is within its 120s skew window
 * (Mumapps-Auth pages/api/auth-status.js REFRESH_SKEW_SECONDS), so the re-check
 * must land inside that window — and it stays clear of the 90s margin inside
 * which @supabase/auth-js's getSession() would refresh the token itself.
 */
export const RECHECK_LEAD_SECONDS = 105;
/** Shortest re-check delay, and the backoff bounds while auth-status is unreachable. */
export const RECHECK_MIN_MS = 5_000;
export const STALE_BACKOFF_MAX_MS = 5 * 60_000;

/**
 * Delay before the next auth-status re-check. Pure, for tests.
 * - Normally: `expires_at - RECHECK_LEAD_SECONDS`, floored at RECHECK_MIN_MS
 *   and clamped to setTimeout's 32-bit max (an overflowing delay fires at once,
 *   which would turn this into a polling loop).
 * - While `stale` (the last check could not reach the service): no sooner than
 *   an exponential backoff, 5s → 10s → … → 5 min. Without it an offline tab
 *   with an expiring token re-checked — and re-rendered every consumer — every
 *   five seconds until the network came back.
 */
export function recheckDelayMs(expiresAt: number, nowMs: number, staleAttempts = 0): number {
  const untilLead = (expiresAt - RECHECK_LEAD_SECONDS) * 1000 - nowMs;
  let delay = Math.max(untilLead, RECHECK_MIN_MS);
  if (staleAttempts > 0) {
    const backoff = Math.min(RECHECK_MIN_MS * 2 ** Math.min(staleAttempts - 1, 16), STALE_BACKOFF_MAX_MS);
    delay = Math.max(delay, backoff);
  }
  return Math.min(delay, 0x7fffffff);
}

function defaultIsStandalone(): boolean {
  try {
    return (
      (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) ||
      (typeof navigator !== 'undefined' && (navigator as any).standalone === true)
    );
  } catch { return false; }
}

/**
 * Client side of the Mumapps Auth v4 contract (Mumapps-Auth docs/CONTRACT.md).
 * INVARIANTS this class enforces — do not "fix" these away:
 *  1. Never refreshes Supabase tokens itself; renewal = re-calling auth-status.
 *     That includes NEVER calling supabase.auth.getSession(): auth-js
 *     refreshes inside it whenever the stored token is within 90s of expiry,
 *     autoRefreshToken:false or not. The bearer this client sends comes from
 *     the last auth-status answer (or the bridge hash), never from Supabase.
 *  2. Never writes mumapps_* cookies.
 *  3. Transient failures (retryable/non-2xx/network) carry state forward, never log out.
 *  4. Cross-app sync via the mumapps_sid marker on focus/visibilitychange.
 */
export class AuthClient implements AuthClientLike {
  private supabase: SupabaseAuthLike;
  readonly authBaseUrl: string;
  private isStandalone: () => boolean;
  private state: AuthState = { status: 'loading', ...CLEARED };
  private listeners = new Set<(s: AuthState) => void>();
  private inflight: Promise<AuthState> | null = null;
  private lastMarker: string | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeHandler: (() => void) | null = null;
  /** Consecutive re-checks scheduled while stale — drives the backoff. */
  private staleAttempts = 0;
  /** A token handed over by the standalone auth bridge, until auth-status answers. */
  private bridgedAccessToken: string | null = null;

  constructor(config: AuthClientConfig) {
    this.supabase = config.supabase;
    this.authBaseUrl = config.authBaseUrl ?? resolveAuthBaseUrl();
    this.isStandalone = config.isStandalone ?? defaultIsStandalone;
  }

  getState(): AuthState { return this.state; }

  subscribe(fn: (s: AuthState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private setState(next: AuthState, notify = true): void {
    this.state = next;
    if (notify) this.listeners.forEach((fn) => { try { fn(next); } catch {} });
    this.scheduleExpiryRecheck();
  }

  /** Single-flight: concurrent callers share one request. */
  checkAuthStatus(): Promise<AuthState> {
    if (this.inflight) return this.inflight;
    this.inflight = this.doCheck().finally(() => { this.inflight = null; });
    return this.inflight;
  }

  private carryForward(): AuthState {
    // Already carried forward: nothing a consumer can see has changed, so
    // don't wake every subscriber again — just re-arm the (backed-off) timer.
    if (this.state.status === 'ready' && this.state.stale) {
      this.setState(this.state, false);
      return this.state;
    }
    const kept: AuthState = { ...this.state, status: 'ready', stale: true };
    this.setState(kept);
    return kept;
  }

  /** The bearer for auth-status: the last answer's token, else a bridged one. */
  private bearerToken(): string | null {
    return this.state.session?.access_token || this.bridgedAccessToken || null;
  }

  private async doCheck(): Promise<AuthState> {
    let data: AuthStatusResponse;
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      // Invariant 1: not supabase.auth.getSession() — see the class comment.
      const bearer = this.bearerToken();
      if (bearer) headers.Authorization = `Bearer ${bearer}`;
      const res = await fetch(`${this.authBaseUrl}/api/auth-status`, {
        credentials: 'include', cache: 'no-store', headers,
      });
      if (!res.ok) return this.carryForward();     // outage ≠ logout (Invariant 3)
      data = await res.json();
    } catch {
      return this.carryForward();                  // network error ≠ logout
    }

    if (data.retryable) return this.carryForward();

    if (data.action === 'clear_cookies') {         // definitive: session is dead
      try { await this.supabase.auth.signOut(); } catch {}
      this.bridgedAccessToken = null;
      const cleared: AuthState = { status: 'ready', ...CLEARED };
      this.lastMarker = readSessionMarker();
      this.setState(cleared);
      return cleared;
    }

    if (data.authenticated && data.session?.access_token && data.session?.refresh_token) {
      try {
        await this.supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      } catch {} // best-effort; server truth wins for routing (see CONTRACT.md)
      this.bridgedAccessToken = null; // the answer's own token supersedes it
      const next: AuthState = {
        status: 'ready', authenticated: true, stale: false,
        user: data.user, session: data.session,
        appAccess: data.appAccess ?? {}, subscription: data.subscription ?? null,
        household: data.household ?? null,
      };
      this.lastMarker = readSessionMarker();
      this.setState(next);
      return next;
    }

    this.bridgedAccessToken = null;
    const cleared: AuthState = { status: 'ready', ...CLEARED };
    this.lastMarker = readSessionMarker();
    this.setState(cleared);
    return cleared;
  }

  /** Wire bridge-hash consumption, initial check, wake watcher. Idempotent. */
  async start(): Promise<AuthState> {
    if (!this.wakeHandler && typeof window !== 'undefined') {
      this.wakeHandler = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        const marker = readSessionMarker();
        if (marker !== this.lastMarker) {
          this.lastMarker = marker;
          void this.checkAuthStatus();
        }
      };
      window.addEventListener('focus', this.wakeHandler);
      document.addEventListener('visibilitychange', this.wakeHandler);
    }
    const bridged = await consumeBridgeHash(this.supabase);
    if (bridged?.access_token) this.bridgedAccessToken = bridged.access_token;
    return this.checkAuthStatus();
  }

  stop(): void {
    if (this.wakeHandler && typeof window !== 'undefined') {
      window.removeEventListener('focus', this.wakeHandler);
      document.removeEventListener('visibilitychange', this.wakeHandler);
      this.wakeHandler = null;
    }
    if (this.expiryTimer) { clearTimeout(this.expiryTimer); this.expiryTimer = null; }
  }

  /** Re-check RECHECK_LEAD_SECONDS before expiry, backing off while stale. */
  private scheduleExpiryRecheck(): void {
    if (this.expiryTimer) { clearTimeout(this.expiryTimer); this.expiryTimer = null; }
    this.staleAttempts = this.state.stale ? this.staleAttempts + 1 : 0;
    const exp = this.state.session?.expires_at;
    if (!exp || !this.state.authenticated) return;
    const delay = recheckDelayMs(exp, Date.now(), this.staleAttempts);
    this.expiryTimer = setTimeout(() => { void this.checkAuthStatus(); }, delay);
  }

  signIn(returnTo?: string, mode?: 'signup'): void {
    const target = returnTo ?? window.location.href;
    if (this.isStandalone()) {
      try { localStorage.setItem('ma_bridge_inflight', String(Date.now())); } catch {}
      window.location.href = buildBridgeUrl(this.authBaseUrl, target);
      return;
    }
    window.location.href = buildSignInUrl(this.authBaseUrl, target, mode);
  }

  signOut(returnUrl?: string): void {
    window.location.href = buildLogoutUrl(this.authBaseUrl, returnUrl ?? window.location.origin);
  }

  getAuthHeaders(): Record<string, string> {
    const token = this.state.session?.access_token;
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  }
}

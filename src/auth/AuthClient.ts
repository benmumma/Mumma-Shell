import type { AuthClientConfig, AuthState, AuthStatusResponse, SupabaseAuthLike } from './types';
import { readSessionMarker } from './marker';
import { resolveAuthBaseUrl, buildSignInUrl, buildLogoutUrl, buildBridgeUrl } from './urls';
import { consumeBridgeHash } from './bridge';

const CLEARED: Omit<AuthState, 'status'> = {
  authenticated: false, user: null, session: null, appAccess: {}, household: null, stale: false,
};

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
 *  2. Never writes mumapps_* cookies.
 *  3. Transient failures (retryable/non-2xx/network) carry state forward, never log out.
 *  4. Cross-app sync via the mumapps_sid marker on focus/visibilitychange.
 */
export class AuthClient {
  private supabase: SupabaseAuthLike;
  readonly authBaseUrl: string;
  private isStandalone: () => boolean;
  private state: AuthState = { status: 'loading', ...CLEARED };
  private listeners = new Set<(s: AuthState) => void>();
  private inflight: Promise<AuthState> | null = null;
  private lastMarker: string | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeHandler: (() => void) | null = null;

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

  private setState(next: AuthState): void {
    this.state = next;
    this.listeners.forEach((fn) => { try { fn(next); } catch {} });
    this.scheduleExpiryRecheck();
  }

  /** Single-flight: concurrent callers share one request. */
  checkAuthStatus(): Promise<AuthState> {
    if (this.inflight) return this.inflight;
    this.inflight = this.doCheck().finally(() => { this.inflight = null; });
    return this.inflight;
  }

  private carryForward(): AuthState {
    const kept: AuthState = { ...this.state, status: 'ready', stale: true };
    this.setState(kept);
    return kept;
  }

  private async doCheck(): Promise<AuthState> {
    let data: AuthStatusResponse;
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      try {
        const { data: s } = await this.supabase.auth.getSession();
        if (s?.session?.access_token) headers.Authorization = `Bearer ${s.session.access_token}`;
      } catch {}
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
      const next: AuthState = {
        status: 'ready', authenticated: true, stale: false,
        user: data.user, session: data.session,
        appAccess: data.appAccess ?? {}, household: data.household ?? null,
      };
      this.lastMarker = readSessionMarker();
      this.setState(next);
      return next;
    }

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
    await consumeBridgeHash(this.supabase);
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

  /** Re-check ~60s before expiry; the service refreshes inside its skew window. */
  private scheduleExpiryRecheck(): void {
    if (this.expiryTimer) { clearTimeout(this.expiryTimer); this.expiryTimer = null; }
    const exp = this.state.session?.expires_at;
    if (!exp || !this.state.authenticated) return;
    // Clamp to setTimeout's 32-bit max — an overflowing delay fires immediately,
    // which would turn this into a 5s polling loop.
    const delay = Math.min(Math.max((exp - 60 - Math.floor(Date.now() / 1000)) * 1000, 5000), 0x7fffffff);
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

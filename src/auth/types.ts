export interface AuthUser {
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown>;
}

export interface AuthSession {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null; // unix seconds
}

export interface HouseholdMembership {
  household_id: string;
  member_id: string;
  role: string;
  household_name: string | null;
}

export interface CircleMembership {
  circle_id: string;
  circle_member_id: string;
  role: string;
}

export interface HouseholdBlock {
  default_household_id: string | null;
  memberships: HouseholdMembership[];
  pending_invites: unknown[];
  circles: CircleMembership[];
}

export type AppAccessMap = Record<string, boolean>;

/** Household-level plan as reported by the auth service. */
export interface HouseholdPlan {
  plan: 'free' | 'household';
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | null;
  agent_slot_quantity: number;
  byok_enabled: boolean;
  current_period_end: string | null;
}

/** Per-app plan/subscription row. */
export interface AppPlan {
  app_identifier: string;
  status: string;
  current_period_end: string | null;
}

/**
 * The `subscription` block from `GET /api/auth-status`, carried into client
 * state verbatim. Legacy boolean flags (`hasForwardAccess`, etc.) are still
 * present on the wire and reachable via the index signature.
 */
export interface SubscriptionBlock {
  household: HouseholdPlan | null;
  app_plans: AppPlan[];
  [legacyFlag: string]: unknown;
}

/** @deprecated Use {@link SubscriptionBlock} — legacy flags moved behind an index signature. */
export type SubscriptionInfo = SubscriptionBlock;

export interface AuthStatusResponse {
  authenticated: boolean;
  hasTokens?: boolean;
  user: AuthUser | null;
  session: AuthSession;
  appAccess?: AppAccessMap;
  subscription?: SubscriptionBlock | null;
  household?: HouseholdBlock;
  tokenSource?: 'cookie' | 'bearer' | 'refreshed' | 'expired' | null;
  issuer?: { expected: string | null; actual: string | null };
  warning?: string;
  retryable?: boolean;
  action?: 'clear_cookies';
  canHydrate?: boolean;
  sessionHealed?: boolean;
}

export interface AuthState {
  /**
   * `signing-in` is set only by the native client (`@mumma/shell/native`),
   * which cannot redirect: the app routes to its own sign-in screen when it
   * sees it. Web callers see only `loading` and `ready`.
   */
  status: 'loading' | 'ready' | 'signing-in';
  authenticated: boolean;
  user: AuthUser | null;
  session: AuthSession | null;
  appAccess: AppAccessMap;
  subscription: SubscriptionBlock | null;
  household: HouseholdBlock | null;
  /** true when the last check was inconclusive (network/5xx/retryable) and state was carried over */
  stale: boolean;
}

/**
 * The surface `MummaAuthProvider` consumes. `AuthClient` (web) and
 * `NativeAuthClient` (`@mumma/shell/native`) both satisfy it, so an app swaps
 * one for the other without touching the provider or any hook.
 */
export interface AuthClientLike {
  readonly authBaseUrl: string;
  getState(): AuthState;
  subscribe(fn: (s: AuthState) => void): () => void;
  start(): Promise<AuthState>;
  stop(): void;
  checkAuthStatus(): Promise<AuthState>;
  signIn(returnTo?: string, mode?: 'signup'): void | Promise<void>;
  signOut(returnUrl?: string): void | Promise<void>;
  getAuthHeaders(): Record<string, string>;
}

/** Minimal Supabase surface the core needs — keeps the package testable without a real client. */
export interface SupabaseAuthLike {
  auth: {
    setSession(s: { access_token: string; refresh_token: string }): Promise<unknown>;
    signOut(opts?: unknown): Promise<unknown>;
    getSession(): Promise<{ data: { session: { access_token?: string } | null } }>;
  };
}

export interface AuthClientConfig {
  supabase: SupabaseAuthLike;
  /** Override auth service origin; default derives from hostname (see urls.ts) */
  authBaseUrl?: string;
  /** Override standalone-PWA detection (default: display-mode media query) */
  isStandalone?: () => boolean;
}

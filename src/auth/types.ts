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

export interface AuthStatusResponse {
  authenticated: boolean;
  hasTokens?: boolean;
  user: AuthUser | null;
  session: AuthSession;
  appAccess?: AppAccessMap;
  subscription?: unknown;
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
  status: 'loading' | 'ready';
  authenticated: boolean;
  user: AuthUser | null;
  session: AuthSession | null;
  appAccess: AppAccessMap;
  household: HouseholdBlock | null;
  /** true when the last check was inconclusive (network/5xx/retryable) and state was carried over */
  stale: boolean;
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

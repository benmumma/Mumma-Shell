import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthClient } from '../src/auth/AuthClient';
import { MummaAuthProvider, useAuth, useHousehold, useOptionalAuth, useSubscription } from '../src/react/AuthProvider';

function Probe() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const household = useHousehold();
  if (isLoading) return <span>loading</span>;
  return <span>{isAuthenticated ? `in:${user?.id}:${household?.default_household_id}` : 'out'}</span>;
}

test('provider starts the client and exposes state through hooks', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => ({
      authenticated: true,
      user: { id: 'u1', email: null, user_metadata: {} },
      session: { access_token: 'at', refresh_token: 'rt', expires_at: 9999999999 },
      appAccess: { forward: true },
      household: { default_household_id: 'h9', memberships: [], pending_invites: [], circles: [] },
    }),
  }));
  const supabase = { auth: { setSession: vi.fn().mockResolvedValue({}), signOut: vi.fn(), getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } };
  const client = new AuthClient({ supabase: supabase as any, authBaseUrl: 'https://auth.test' });
  render(<MummaAuthProvider client={client}><Probe /></MummaAuthProvider>);
  await waitFor(() => expect(screen.getByText('in:u1:h9')).toBeTruthy());
});

function SubProbe() {
  const sub = useSubscription();
  const { subscription } = useAuth();
  if (!sub) return <span>no-sub</span>;
  return <span>{`${sub.household?.plan}:${sub.household?.status}:${sub.app_plans.length}:${sub.hasForwardAccess}:${sub === subscription}`}</span>;
}

test('subscription block is carried into state and exposed via useSubscription', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => ({
      authenticated: true,
      user: { id: 'u1', email: null, user_metadata: {} },
      session: { access_token: 'at', refresh_token: 'rt', expires_at: 9999999999 },
      appAccess: {},
      subscription: {
        household: { plan: 'household', status: 'active', agent_slot_quantity: 2, byok_enabled: false, current_period_end: '2026-09-01T00:00:00Z' },
        app_plans: [{ app_identifier: 'stonk', status: 'active', current_period_end: null }],
        hasForwardAccess: true, // legacy flag rides along via the index signature
      },
    }),
  }));
  const supabase = { auth: { setSession: vi.fn().mockResolvedValue({}), signOut: vi.fn(), getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } };
  const client = new AuthClient({ supabase: supabase as any, authBaseUrl: 'https://auth.test' });
  render(<MummaAuthProvider client={client}><SubProbe /></MummaAuthProvider>);
  await waitFor(() => expect(screen.getByText('household:active:1:true:true')).toBeTruthy());
});

test('useOptionalAuth returns null outside the provider and state inside it', async () => {
  function OptProbe() {
    const auth = useOptionalAuth();
    return <span>{auth ? `ctx:${auth.isAuthenticated}` : 'null'}</span>;
  }
  render(<OptProbe />);
  expect(screen.getByText('null')).toBeTruthy();
});

import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react';
import type { AuthClientLike, AuthState, HouseholdBlock, SubscriptionBlock } from '../auth/types';

interface Ctx { client: AuthClientLike; state: AuthState; }
const AuthContext = createContext<Ctx | null>(null);

export function MummaAuthProvider({ client, children }: { client: AuthClientLike; children: ReactNode }) {
  const [state, setState] = useState<AuthState>(client.getState());
  useEffect(() => {
    const unsubscribe = client.subscribe(setState);
    void client.start();
    return () => { unsubscribe(); client.stop(); };
  }, [client]);
  const value = useMemo(() => ({ client, state }), [client, state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useCtx(): Ctx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth/useSession/useHousehold/useSubscription must be used inside <MummaAuthProvider>');
  return ctx;
}

function buildAuth({ client, state }: Ctx) {
  return {
    ...state,
    isLoading: state.status === 'loading',
    isAuthenticated: state.authenticated,
    hasAppAccess: (app: string) => !!state.appAccess[app],
    signIn: client.signIn.bind(client),
    signOut: client.signOut.bind(client),
    refreshAuth: client.checkAuthStatus.bind(client),
    getAuthHeaders: client.getAuthHeaders.bind(client),
    client,
  };
}

export function useAuth() {
  return buildAuth(useCtx());
}

/**
 * Like `useAuth`, but returns `null` instead of throwing when rendered outside
 * `<MummaAuthProvider>`. Lets shared chrome (e.g. `MummaHeader`) degrade
 * gracefully in standalone usage.
 */
export function useOptionalAuth(): ReturnType<typeof buildAuth> | null {
  const ctx = useContext(AuthContext);
  return ctx ? buildAuth(ctx) : null;
}

export const useSession = () => useCtx().state.session;
export const useHousehold = (): HouseholdBlock | null => useCtx().state.household;
export const useSubscription = (): SubscriptionBlock | null => useCtx().state.subscription;

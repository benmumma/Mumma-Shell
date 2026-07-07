import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react';
import type { AuthClient } from '../auth/AuthClient';
import type { AuthState, HouseholdBlock } from '../auth/types';

interface Ctx { client: AuthClient; state: AuthState; }
const AuthContext = createContext<Ctx | null>(null);

export function MummaAuthProvider({ client, children }: { client: AuthClient; children: ReactNode }) {
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
  if (!ctx) throw new Error('useAuth/useSession/useHousehold must be used inside <MummaAuthProvider>');
  return ctx;
}

export function useAuth() {
  const { client, state } = useCtx();
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

export const useSession = () => useCtx().state.session;
export const useHousehold = (): HouseholdBlock | null => useCtx().state.household;

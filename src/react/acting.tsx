import { createContext, useContext, useState, useMemo, type ReactNode } from 'react';

export interface ActingMember {
  member_id: string;
  household_id: string;
  display_name: string;
}

interface ActingCtx {
  acting: ActingMember | null;
  setActing: (m: ActingMember) => void;
  clearActing: () => void;
  /** Attach attribution to a write payload. Not authorization — the server enforces policy. */
  decorate: <T extends object>(payload: T) => T & { completed_by: string | null };
}

const Ctx = createContext<ActingCtx | null>(null);
const STORAGE_KEY = 'mumapps_acting';

function load(storageKey: string): ActingMember | null {
  try { const raw = localStorage.getItem(storageKey); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function ActingMemberProvider({ storageKey = STORAGE_KEY, children }: { storageKey?: string; children: ReactNode }) {
  const [acting, setActingState] = useState<ActingMember | null>(() => load(storageKey));
  const value = useMemo<ActingCtx>(() => ({
    acting,
    setActing: (m) => { setActingState(m); try { localStorage.setItem(storageKey, JSON.stringify(m)); } catch {} },
    clearActing: () => { setActingState(null); try { localStorage.removeItem(storageKey); } catch {} },
    decorate: (payload) => ({ ...payload, completed_by: acting?.member_id ?? null }),
  }), [acting, storageKey]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActingMember(): ActingCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useActingMember must be used inside <ActingMemberProvider>');
  return ctx;
}

import { useMemo } from 'react';
import { deriveBilling, type Billing } from '../auth/billing';
import { useSubscription } from './AuthProvider';

/**
 * The derived billing view of the current auth state — plan, grace, slots, and
 * live standalone app plans. Recomputed only when the provider hands down a new
 * `subscription` object.
 *
 *     const { coveredByFamilyPlan, hasStandalone, inGrace } = useBilling();
 *     if (!coveredByFamilyPlan && !hasStandalone('intellect')) return <Upsell />;
 *
 * The clock is read at derivation time, so a session left open across a grace
 * expiry keeps its old answer until the next auth-status poll re-renders it —
 * fine for chrome and upsells, which is all this is for. Enforcement is the
 * server's job (`entitlements/tierLimits.js`).
 */
export function useBilling(): Billing {
  const subscription = useSubscription();
  return useMemo(() => deriveBilling(subscription), [subscription]);
}

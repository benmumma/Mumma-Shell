/**
 * auth/billing.ts — the read side of "what is this household paying for?",
 * shared by every suite client so nobody hand-rolls it again.
 *
 *     const billing = deriveBilling(subscription);
 *     if (billing.coveredByFamilyPlan || billing.hasStandalone('intellect')) { ... }
 *
 * This mirrors the server's `entitlements/tierLimits.js` exactly — the same
 * `isLiveStatus` rule and the same `GRACE_DAYS` constant. Stripe flips a sub to
 * `past_due` on the FIRST failed payment while its own dunning retries run for
 * days; cutting a family off at that instant punishes a card expiry as if it
 * were a cancellation. So `past_due` keeps its premium reading until
 * `current_period_end + GRACE_DAYS`, and a `past_due` row with no period end
 * stays premium (we cannot tell when it lapsed).
 *
 * If the server constant moves, this one moves with it.
 *
 * Pure and React-free by design: `./react`'s `useBilling()` is a one-line
 * memoised wrapper, and non-React consumers can call `deriveBilling` directly.
 * Nothing here decides checkout — that stays in each app's billing UI.
 */
import type { AppPlan, HouseholdPlan, SubscriptionBlock } from './types';

/** Days past `current_period_end` that a `past_due` row keeps its premium reading. */
export const GRACE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const PREMIUM_STATUSES = new Set(['active', 'trialing']);

/** The minimum a row needs for {@link isLiveStatus} — household plans and app plans both qualify. */
export interface LiveStatusRow {
  status?: string | null;
  current_period_end?: string | Date | null;
}

/**
 * Is this entitlement / app-plan row currently paying for premium?
 *
 *   active | trialing               -> true
 *   past_due, no period end         -> true  (unknown lapse time: do not cut off)
 *   past_due, period end + 7d > now -> true  (inside grace)
 *   past_due otherwise              -> false (grace exhausted)
 *   anything else                   -> false (canceled, unknown, no row)
 */
export function isLiveStatus(row: LiveStatusRow | null | undefined, now: Date = new Date()): boolean {
  if (!row) return false;
  if (row.status != null && PREMIUM_STATUSES.has(row.status)) return true;
  if (row.status !== 'past_due') return false;
  if (row.current_period_end == null) return true;
  const end = new Date(row.current_period_end).getTime();
  if (Number.isNaN(end)) return true; // unparseable: same as unknown
  return end + GRACE_DAYS * DAY_MS > now.getTime();
}

/** The derived, display-ready billing facts for one household. */
export interface Billing {
  /** `'household'` only when the household row says `household` AND is live. */
  plan: 'free' | 'household';
  /** The household row's raw status, live or not — `null` when there is no row. */
  status: HouseholdPlan['status'] | null;
  /** `status === 'past_due'`, regardless of grace. */
  isPastDue: boolean;
  /** Past due, but still inside the grace window — premium now, at risk soon. */
  inGrace: boolean;
  byokEnabled: boolean;
  /** `agent_slot_quantity`; `null` when there is no household row. */
  slots: number | null;
  /** `current_period_end` (ISO), passed through verbatim. */
  renewsAt: string | null;
  /** The family plan covers every app; equivalent to `plan === 'household'`. */
  coveredByFamilyPlan: boolean;
  /** LIVE per-app plans only, keyed by `app_identifier`. */
  standalone: Record<string, AppPlan>;
  hasStandalone(app: string): boolean;
  /** Every app-plan row as received, live or not. */
  appPlans: AppPlan[];
}

/**
 * Fold a `subscription` block into {@link Billing}. Null/undefined — a signed-out
 * user, or an auth-status response that carried no block — reads as free, which
 * is also what a junk or unrecognised block degrades to.
 */
export function deriveBilling(
  subscription: SubscriptionBlock | null | undefined,
  now: Date = new Date(),
): Billing {
  const household = subscription?.household ?? null;
  const appPlans = Array.isArray(subscription?.app_plans) ? subscription.app_plans : [];

  const householdLive = isLiveStatus(household, now);
  const plan: 'free' | 'household' = household?.plan === 'household' && householdLive ? 'household' : 'free';
  const status = household?.status ?? null;
  const isPastDue = status === 'past_due';

  const standalone: Record<string, AppPlan> = {};
  for (const row of appPlans) {
    if (row && isLiveStatus(row, now)) standalone[row.app_identifier] = row;
  }

  return {
    plan,
    status,
    isPastDue,
    inGrace: isPastDue && householdLive,
    byokEnabled: Boolean(household?.byok_enabled),
    slots: household?.agent_slot_quantity ?? null,
    renewsAt: household?.current_period_end ?? null,
    coveredByFamilyPlan: plan === 'household',
    standalone,
    hasStandalone: (app: string) => Object.prototype.hasOwnProperty.call(standalone, app),
    appPlans,
  };
}

import { describe, test, expect } from 'vitest';
import { deriveBilling, isLiveStatus, GRACE_DAYS } from '../src/auth/billing';
import type { SubscriptionBlock, HouseholdPlan, AppPlan } from '../src/auth/types';

const NOW = new Date('2026-08-23T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (n: number) => new Date(NOW.getTime() + n * DAY).toISOString();

function household(over: Partial<HouseholdPlan> = {}): HouseholdPlan {
  return {
    plan: 'household',
    status: 'active',
    agent_slot_quantity: 7,
    byok_enabled: false,
    current_period_end: daysFromNow(10),
    ...over,
  };
}

function block(over: Partial<SubscriptionBlock> = {}): SubscriptionBlock {
  return { household: household(), app_plans: [], ...over };
}

describe('GRACE_DAYS', () => {
  test('matches the server entitlements constant', () => {
    expect(GRACE_DAYS).toBe(7);
  });
});

describe('isLiveStatus', () => {
  test('active and trialing are live', () => {
    expect(isLiveStatus({ status: 'active', current_period_end: null }, NOW)).toBe(true);
    expect(isLiveStatus({ status: 'trialing', current_period_end: daysFromNow(-90) }, NOW)).toBe(true);
  });

  test('past_due with no period end stays live (unknown lapse time)', () => {
    expect(isLiveStatus({ status: 'past_due', current_period_end: null }, NOW)).toBe(true);
  });

  test('past_due inside the grace window is live, outside it is not', () => {
    expect(isLiveStatus({ status: 'past_due', current_period_end: daysFromNow(-2) }, NOW)).toBe(true);
    expect(isLiveStatus({ status: 'past_due', current_period_end: daysFromNow(-10) }, NOW)).toBe(false);
  });

  test('unparseable period end on past_due is treated as unknown (live)', () => {
    expect(isLiveStatus({ status: 'past_due', current_period_end: 'not-a-date' }, NOW)).toBe(true);
  });

  test('canceled, unknown statuses, and missing rows are not live', () => {
    expect(isLiveStatus({ status: 'canceled', current_period_end: daysFromNow(30) }, NOW)).toBe(false);
    expect(isLiveStatus({ status: 'incomplete_expired', current_period_end: null }, NOW)).toBe(false);
    expect(isLiveStatus(null, NOW)).toBe(false);
    expect(isLiveStatus(undefined, NOW)).toBe(false);
  });

  test('defaults now to the current clock', () => {
    expect(isLiveStatus({ status: 'active', current_period_end: null })).toBe(true);
  });
});

describe('deriveBilling: household plan', () => {
  test('null subscription yields free defaults', () => {
    const b = deriveBilling(null, NOW);
    expect(b.plan).toBe('free');
    expect(b.status).toBeNull();
    expect(b.isPastDue).toBe(false);
    expect(b.inGrace).toBe(false);
    expect(b.byokEnabled).toBe(false);
    expect(b.slots).toBeNull();
    expect(b.renewsAt).toBeNull();
    expect(b.coveredByFamilyPlan).toBe(false);
    expect(b.standalone).toEqual({});
    expect(b.appPlans).toEqual([]);
    expect(b.hasStandalone('intellect')).toBe(false);
  });

  test('undefined subscription yields free defaults', () => {
    expect(deriveBilling(undefined, NOW).plan).toBe('free');
  });

  test('a subscription block with no household row is free', () => {
    const b = deriveBilling(block({ household: null }), NOW);
    expect(b.plan).toBe('free');
    expect(b.status).toBeNull();
    expect(b.coveredByFamilyPlan).toBe(false);
  });

  test('a live household plan is household and covered', () => {
    const b = deriveBilling(block(), NOW);
    expect(b.plan).toBe('household');
    expect(b.status).toBe('active');
    expect(b.coveredByFamilyPlan).toBe(true);
    expect(b.isPastDue).toBe(false);
    expect(b.inGrace).toBe(false);
  });

  test('a trialing household plan is household', () => {
    const b = deriveBilling(block({ household: household({ status: 'trialing' }) }), NOW);
    expect(b.plan).toBe('household');
    expect(b.coveredByFamilyPlan).toBe(true);
  });

  test('past_due two days after period end stays household, in grace', () => {
    const b = deriveBilling(
      block({ household: household({ status: 'past_due', current_period_end: daysFromNow(-2) }) }),
      NOW,
    );
    expect(b.plan).toBe('household');
    expect(b.coveredByFamilyPlan).toBe(true);
    expect(b.status).toBe('past_due');
    expect(b.isPastDue).toBe(true);
    expect(b.inGrace).toBe(true);
  });

  test('past_due ten days after period end falls back to free, out of grace', () => {
    const b = deriveBilling(
      block({ household: household({ status: 'past_due', current_period_end: daysFromNow(-10) }) }),
      NOW,
    );
    expect(b.plan).toBe('free');
    expect(b.coveredByFamilyPlan).toBe(false);
    expect(b.status).toBe('past_due');
    expect(b.isPastDue).toBe(true);
    expect(b.inGrace).toBe(false);
  });

  test('canceled is free but keeps its raw status', () => {
    const b = deriveBilling(block({ household: household({ status: 'canceled' }) }), NOW);
    expect(b.plan).toBe('free');
    expect(b.coveredByFamilyPlan).toBe(false);
    expect(b.status).toBe('canceled');
    expect(b.isPastDue).toBe(false);
    expect(b.inGrace).toBe(false);
  });

  test('a live row whose plan is free is still free', () => {
    const b = deriveBilling(block({ household: household({ plan: 'free', status: 'active' }) }), NOW);
    expect(b.plan).toBe('free');
    expect(b.coveredByFamilyPlan).toBe(false);
    expect(b.status).toBe('active');
  });

  test('byok, slots and renewsAt pass through from the household row', () => {
    const end = daysFromNow(21);
    const b = deriveBilling(
      block({ household: household({ byok_enabled: true, agent_slot_quantity: 12, current_period_end: end }) }),
      NOW,
    );
    expect(b.byokEnabled).toBe(true);
    expect(b.slots).toBe(12);
    expect(b.renewsAt).toBe(end);
  });

  test('byok, slots and renewsAt pass through even when the row is not live', () => {
    const b = deriveBilling(
      block({
        household: household({
          status: 'canceled',
          byok_enabled: true,
          agent_slot_quantity: 3,
          current_period_end: null,
        }),
      }),
      NOW,
    );
    expect(b.plan).toBe('free');
    expect(b.byokEnabled).toBe(true);
    expect(b.slots).toBe(3);
    expect(b.renewsAt).toBeNull();
  });
});

describe('deriveBilling: standalone app plans', () => {
  const active: AppPlan = { app_identifier: 'intellect', status: 'active', current_period_end: daysFromNow(30) };
  const canceled: AppPlan = { app_identifier: 'stonk', status: 'canceled', current_period_end: daysFromNow(-1) };
  const lapsed: AppPlan = { app_identifier: 'library', status: 'past_due', current_period_end: daysFromNow(-10) };
  const graced: AppPlan = { app_identifier: 'rem', status: 'past_due', current_period_end: daysFromNow(-1) };

  test('an active app plan grants standalone access', () => {
    const b = deriveBilling(block({ household: null, app_plans: [active] }), NOW);
    expect(b.hasStandalone('intellect')).toBe(true);
    expect(b.standalone.intellect).toEqual(active);
  });

  test('a canceled app plan does not', () => {
    const b = deriveBilling(block({ household: null, app_plans: [canceled] }), NOW);
    expect(b.hasStandalone('stonk')).toBe(false);
    expect(b.standalone).toEqual({});
  });

  test('app plans honour the same grace window as the household row', () => {
    const b = deriveBilling(block({ household: null, app_plans: [graced, lapsed] }), NOW);
    expect(b.hasStandalone('rem')).toBe(true);
    expect(b.hasStandalone('library')).toBe(false);
  });

  test('appPlans carries every row; standalone carries only the live ones', () => {
    const b = deriveBilling(block({ household: null, app_plans: [active, canceled, lapsed] }), NOW);
    expect(b.appPlans).toEqual([active, canceled, lapsed]);
    expect(Object.keys(b.standalone)).toEqual(['intellect']);
  });

  test('an unknown app is never standalone', () => {
    expect(deriveBilling(block(), NOW).hasStandalone('nope')).toBe(false);
  });

  test('a missing app_plans array degrades to empty rather than throwing', () => {
    const b = deriveBilling({ household: null } as unknown as SubscriptionBlock, NOW);
    expect(b.appPlans).toEqual([]);
    expect(b.hasStandalone('intellect')).toBe(false);
  });
});

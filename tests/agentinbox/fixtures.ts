import { vi } from 'vitest';
import type { InboxItem, InboxPage, InboxSummary } from '../../src/agentinbox';

export const HH = 'hh-1';
export const COACH = 'coach-1';

export const profile = {
  home_apps: ['fitter', 'dekko'],
  cards: [{ key: 'week_plan', label: 'This week' }],
  composer: { enabled: true, quick_prompts: ['How am I doing?'] },
  notify: { push: 'asks' as const, badge: 'asks' as const },
  answers: { wake: 'immediate' as const },
  updates: { retention_days: 7 },
};

export function item(over: Partial<InboxItem> = {}): InboxItem {
  return {
    id: 'i1', kind: 'ask', status: 'open', title: 'Move the long run?', body: '', blocks: [], links: [],
    created_at: '2026-10-26T12:00:00.000Z', updated_at: '2026-10-26T12:00:00.000Z', revision: 0,
    question: 'Move the long run to Sunday?', context: 'Rain all Saturday morning.',
    response_type: 'choice', allow_other: true,
    options: [{ key: 'sun', label: 'Sunday', means: 'Run Sunday' }, { key: 'keep', label: 'Keep Saturday', means: 'Run in the rain' }],
    recommended_key: 'sun', recommendation_reason: 'Dry and cooler', default_key: 'sun',
    due_at: '2026-10-27T12:00:00.000Z', follow_through: 'none',
    ...over,
  };
}

export function summary(over: Partial<InboxSummary> = {}): InboxSummary {
  return {
    household_id: HH, instance_id: COACH, name: 'Coach', avatar_path: null, recipient_member_id: 'ben',
    profile, open_asks: 1, unseen: 2, top_ask: item(), ...over,
  };
}

export function page(over: Partial<InboxPage> = {}): InboxPage {
  return {
    household_id: HH, instance_id: COACH, name: 'Coach', avatar_path: null, recipient_member_id: 'ben', profile,
    cards: [item({ id: 'c1', kind: 'card', status: 'live', card_key: 'week_plan', title: 'This week', body: 'Mon easy 5k',
      blocks: [{ type: 'progress', label: 'Weekly km', value: 12, max: 40 }] })],
    asks: [item()],
    answered: [],
    updates: [item({ id: 'u1', kind: 'update', status: 'live', title: null, body: 'Logged 8 km.' })],
    snoozed: [],
    messages: [],
    seen_at: null,
    ...over,
  };
}

type Handler = (url: URL, init: RequestInit) => { status?: number; body: unknown };

/** A fetch that routes by "METHOD /path" and records calls. */
export function routeFetch(routes: Record<string, Handler>) {
  return vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const key = `${init.method ?? 'GET'} ${url.pathname}`;
    const h = routes[key];
    const out = h ? h(url, init) : { status: 404, body: { success: false, code: 'not_found' } };
    return {
      ok: (out.status ?? 200) < 400,
      status: out.status ?? 200,
      json: async () => out.body,
    } as Response;
  });
}

export const ok = (data: unknown) => ({ body: { success: true, data } });

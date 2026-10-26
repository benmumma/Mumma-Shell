import { test, expect } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import {
  AgentInboxButton, inboxPath, statusSummary, historyDays, historyStatus, agoLabel, behaviorLine, composerHint, canActNow,
  type InboxBehavior,
} from '../../src/agentinbox';
import { COACH, HH, item, ok, page, routeFetch, summary } from './fixtures';

const ref = { householdId: HH, instanceId: COACH };
const NOW = new Date('2026-10-26T15:00:00');

function server(over: Record<string, Parameters<typeof routeFetch>[0][string]> = {}) {
  return routeFetch({
    'GET /api/v1/me/agent-inboxes': () => ok({ inboxes: [summary()] }),
    [`GET ${inboxPath(ref)}`]: () => ok(page({ next_run_at: '2026-10-27T02:30:00.000Z' })),
    [`POST ${inboxPath(ref, '/seen')}`]: () => ok({ seen_at: 'x' }),
    ...over,
  });
}

test('the status line says what needs you and when the agent checks in', () => {
  const ask = item({ due_at: new Date(NOW.getTime() + 2 * 3600e3).toISOString() });
  expect(statusSummary({ name: 'Coach', asks: [ask], next_run_at: null }, NOW)).toMatchObject({
    tone: 'attention', headline: '1 question needs you',
  });
  expect(statusSummary({ name: 'Coach', asks: [ask, ask], next_run_at: null }, NOW).headline).toBe('2 questions need you');
  const calm = statusSummary({ name: 'Coach', asks: [], next_run_at: new Date('2026-10-26T21:30:00').toISOString() }, NOW);
  expect(calm).toMatchObject({ tone: 'calm', headline: 'Nothing needs you' });
  expect(calm.detail).toMatch(/^Coach next checks in at 9:30/);
  expect(statusSummary({ name: 'Coach', asks: [], next_run_at: null }, NOW).detail).toBeNull();
});

test('history groups by day and tags what became of each item', () => {
  const days = historyDays([
    item({ id: 'a', created_at: new Date('2026-10-26T09:00:00').toISOString() }),
    item({ id: 'b', created_at: new Date('2026-10-26T08:00:00').toISOString() }),
    item({ id: 'c', created_at: new Date('2026-10-25T20:00:00').toISOString() }),
    item({ id: 'd', created_at: new Date('2026-10-20T20:00:00').toISOString() }),
  ], NOW, 'en-US');
  expect(days.map(d => [d.label, d.items.map(i => i.id).join('')])).toEqual([
    ['Today', 'ab'], ['Yesterday', 'c'], ['Tue, Oct 20', 'd'],
  ]);
  expect(historyStatus({ kind: 'ask', status: 'defaulted', expires_at: null })).toBe('Default applied');
  expect(historyStatus({ kind: 'update', status: 'dismissed', expires_at: null })).toBe('Cleared');
  expect(historyStatus({ kind: 'card', status: 'retired', expires_at: null })).toBe('Retired');
  expect(historyStatus({ kind: 'update', status: 'live', expires_at: null })).toBeNull();
  expect(agoLabel(new Date(NOW.getTime() - 5 * 60e3).toISOString(), NOW)).toBe('5 min ago');
});

test('the panel opens on Now: the banner, the question with its recommendation first, then cards and updates', async () => {
  render(<AgentInboxButton baseUrl="https://api.test" app="fitter" getToken={() => 't'} fetchImpl={server()} pollMs={0} open />);
  expect(await screen.findByRole('status')).toBeTruthy();
  expect(screen.getByText('1 question needs you')).toBeTruthy();
  const ask = screen.getByRole('article', { name: 'Move the long run to Sunday?' });
  const options = within(ask).getAllByRole('button').filter(b => /Sunday|Keep Saturday/.test(b.textContent ?? ''));
  expect(options[0].textContent).toMatch(/Sunday.*Recommended/);
  expect(within(ask).getByText('Why Sunday: Dry and cooler')).toBeTruthy();
  expect(within(ask).getByText(/Sunday applies/)).toBeTruthy();
  expect(screen.getByRole('tab', { name: /Now/ }).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByText('Mon easy 5k')).toBeTruthy();
  expect(screen.getByText('Logged 8 km.')).toBeTruthy();
});

test('History loads everything the agent wrote, filters by kind, and pages', async () => {
  const older = item({ id: 'old', kind: 'update', status: 'expired', title: 'Last week', body: 'Ran 30 km.', created_at: '2026-10-19T12:00:00.000Z' });
  const answered = item({ id: 'q0', status: 'answered', answer: { keys: ['sun'], labels: ['Sunday'], text: null }, created_at: '2026-10-25T12:00:00.000Z' });
  const fetchImpl = server({
    [`GET ${inboxPath(ref, '/history')}`]: (url) => {
      if (url.searchParams.get('kind') === 'update') return ok({ items: [older], next_before: null });
      if (url.searchParams.get('before')) return ok({ items: [older], next_before: null });
      return ok({ items: [answered], next_before: answered.created_at });
    },
  });
  render(<AgentInboxButton baseUrl="https://api.test" app="fitter" getToken={() => 't'} fetchImpl={fetchImpl} pollMs={0} open />);
  fireEvent.click(await screen.findByRole('tab', { name: 'History' }));
  expect(await screen.findByText('You chose Sunday')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Show older' }));
  expect(await screen.findByText('Ran 30 km.')).toBeTruthy();
  expect(screen.getByText('You chose Sunday')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Updates' }));
  await waitFor(() => expect(screen.queryByText('You chose Sunday')).toBeNull());
  expect(screen.getByText('Ran 30 km.')).toBeTruthy();
  const kinds = fetchImpl.mock.calls.map(([u]) => new URL(String(u))).filter(u => u.pathname.endsWith('/history'))
    .map(u => u.searchParams.get('kind'));
  expect(kinds).toContain('update');
});

test('an empty inbox explains itself instead of showing a blank panel', async () => {
  const fetchImpl = server({
    [`GET ${inboxPath(ref)}`]: () => ok(page({ asks: [], cards: [], updates: [], next_run_at: null })),
  });
  render(<AgentInboxButton baseUrl="https://api.test" app="fitter" getToken={() => 't'} fetchImpl={fetchImpl} pollMs={0} open />);
  expect(await screen.findByText('Nothing needs you')).toBeTruthy();
  expect(screen.getByText('All quiet')).toBeTruthy();
  expect(screen.getByText(/When Coach has a plan, news, or a question for you/)).toBeTruthy();
});

const NEXT = new Date('2026-10-26T21:30:00').toISOString();
const beh = (over: Partial<InboxBehavior> = {}): InboxBehavior => ({
  can_wake: true, answers: 'soon', messages: 'soon', schedule: 'scheduled', paused: false, ...over,
});

test('the behaviour line says in plain words when the agent runs and reads what you send', () => {
  const at = (behavior: InboxBehavior | undefined, next: string | null = NEXT) =>
    behaviorLine({ name: 'Coach', next_run_at: next, behavior }, NOW, 'en-US');
  expect(at(undefined)).toBeNull();
  expect(at(beh({ can_wake: false, answers: 'next_run', messages: 'next_run' })))
    .toMatch(/^Coach runs on its own schedule and reads your answers and messages then\. Next run at 9:30/);
  expect(at(beh({ answers: 'next_run' }))).toMatch(/^Coach acts on your answers at its next run and replies to messages within a minute\. Next run/);
  expect(at(beh())).toMatch(/^Coach acts on your answers and messages within a minute\. Next scheduled run at 9:30/);
  expect(at(beh({ schedule: 'on_demand' }), null)).toBe('Coach runs when you answer or write, and acts within a minute.');
  expect(at(beh({ paused: true, can_wake: false }))).toMatch(/^Coach is paused/);
  // The banner no longer repeats the next run once the behaviour line says it.
  expect(statusSummary({ name: 'Coach', asks: [], next_run_at: NEXT, behavior: beh() }, NOW).detail).toBeNull();
});

test('the composer hint and Act now follow the behaviour', () => {
  const p = (behavior: InboxBehavior) => ({ name: 'Coach', next_run_at: NEXT, behavior });
  expect(composerHint(p(beh()), NOW, 'en-US')).toBe('Coach usually replies within a minute.');
  expect(composerHint(p(beh({ can_wake: false, messages: 'next_run' })), NOW, 'en-US')).toMatch(/^Coach reads this on its next run, at 9:30/);
  const pending = [item({ id: 'a1', status: 'answered', follow_through: 'pending' })];
  expect(canActNow({ answered: pending, behavior: beh({ answers: 'next_run' }) })).toBe(true);
  expect(canActNow({ answered: pending, behavior: beh() })).toBe(false);
  expect(canActNow({ answered: pending, behavior: beh({ can_wake: false, answers: 'next_run' }) })).toBe(false);
  expect(canActNow({ answered: [], behavior: beh({ answers: 'next_run' }) })).toBe(false);
});

test('the panel opens with how the agent works, and Act now wakes it', async () => {
  const answered = item({ id: 'a1', status: 'answered', follow_through: 'pending', answer: { keys: ['sun'], labels: ['Sunday'], text: null } });
  const fetchImpl = server({
    [`GET ${inboxPath(ref)}`]: () => ok(page({ next_run_at: NEXT, answered: [answered], behavior: beh({ answers: 'next_run' }) })),
    [`POST ${inboxPath(ref, '/wake')}`]: () => ok({ acts_at: NOW.toISOString() }),
  });
  const { container } = render(<AgentInboxButton baseUrl="https://api.test" app="fitter" getToken={() => 't'} fetchImpl={fetchImpl} pollMs={0} open />);
  expect(await screen.findByText(/Coach acts on your answers at its next run/)).toBeTruthy();
  expect(container.ownerDocument.querySelector('[data-mumma-ai-behavior]')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Have Coach act on these now' }));
  await waitFor(() => expect(fetchImpl.mock.calls.some(([u, init]) =>
    String(u).endsWith(inboxPath(ref, '/wake')) && (init as RequestInit)?.method === 'POST')).toBe(true));
  fireEvent.click(screen.getByRole('tab', { name: /Chat/ }));
  expect(await screen.findByText(/Coach usually replies within a minute/)).toBeTruthy();
});

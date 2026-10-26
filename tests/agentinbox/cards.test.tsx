import { test, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { AgentInboxButton, CARD_TYPES, CardTypePreview, cardTypeInfo, inboxPath, scheduleRows } from '../../src/agentinbox';
import { COACH, HH, item, ok, page, profile, routeFetch, summary } from './fixtures';

const ref = { householdId: HH, instanceId: COACH };

test('scheduleRows reads the server shape, in local time, and flags today', () => {
  const rows = scheduleRows({ type: 'schedule', rows: [
    { date: '2026-10-27', label: 'Easy 5 mi', status: 'done' },
    { date: '2026-10-29', label: 'Intervals' },
    { label: 'No date' },
  ] }, new Date(2026, 9, 29, 9), 'en-US');
  expect(rows.map(r => [r.weekday, r.day, r.label, r.status, r.today])).toEqual([
    ['Tue', 27, 'Easy 5 mi', 'done', false],
    ['Thu', 29, 'Intervals', null, true],
    ['', null, 'No date', null, false],
  ]);
  expect(scheduleRows({ type: 'schedule' })).toEqual([]);
});

test('a Week card leads with its days and a chip per status; its body is a caption', async () => {
  const week = item({
    id: 'c1', kind: 'card', status: 'live', card_key: 'week_plan', title: 'This week', body: 'Long run moved for the rain.',
    blocks: [{ type: 'schedule', rows: [
      { date: '2026-10-27', label: 'Easy 5 mi', status: 'done' },
      { date: '2026-11-01', label: 'Long run 14 mi', status: 'moved' },
    ] }],
  });
  const fetchImpl = routeFetch({
    'GET /api/v1/me/agent-inboxes': () => ok({ inboxes: [summary()] }),
    [`GET ${inboxPath(ref)}`]: () => ok(page({
      profile: { ...profile, cards: [{ key: 'week_plan', label: 'This week', type: 'week' }] },
      cards: [week], asks: [],
    })),
    [`POST ${inboxPath(ref, '/seen')}`]: () => ok({ seen_at: 'x' }),
  });
  render(<AgentInboxButton baseUrl="https://api.test" app="fitter" getToken={() => 't'} fetchImpl={fetchImpl} pollMs={0} open />);
  const day = await screen.findByText('Long run 14 mi');
  const list = day.closest('ol')!;
  expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  expect(within(list).getByText('Done')).toBeTruthy();
  expect(within(list).getByText('Moved')).toBeTruthy();
  const caption = screen.getByText('Long run moved for the rain.');
  // The caption follows the schedule.
  expect(list.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('a checklist counts what is done', async () => {
  const card = item({
    id: 'c2', kind: 'card', status: 'live', card_key: 'week_plan', title: 'Prep', body: '',
    blocks: [{ type: 'checklist', items: [{ label: 'Lay out kit', done: true }, { label: 'Pick up bib', done: false }] }],
  });
  const fetchImpl = routeFetch({
    'GET /api/v1/me/agent-inboxes': () => ok({ inboxes: [summary()] }),
    [`GET ${inboxPath(ref)}`]: () => ok(page({ cards: [card], asks: [] })),
    [`POST ${inboxPath(ref, '/seen')}`]: () => ok({ seen_at: 'x' }),
  });
  render(<AgentInboxButton baseUrl="https://api.test" app="fitter" getToken={() => 't'} fetchImpl={fetchImpl} pollMs={0} open />);
  expect(await screen.findByText('1 of 2 done')).toBeTruthy();
  expect(screen.getByText('Pick up bib')).toBeTruthy();
});

test('the catalog has six layouts, each with a preview', () => {
  expect(CARD_TYPES.map(t => t.type)).toEqual(['week', 'next_up', 'progress', 'numbers', 'checklist', 'note']);
  expect(cardTypeInfo('chart')).toBeNull();
  for (const t of CARD_TYPES) {
    const { container, unmount } = render(<CardTypePreview type={t.type} />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).toContain(t.sample.title);
    unmount();
  }
});

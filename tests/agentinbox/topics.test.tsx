import { test, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentInboxButton, inboxPath } from '../../src/agentinbox';
import { COACH, HH, ok, page, routeFetch, summary } from './fixtures';

const ref = { householdId: HH, instanceId: COACH };
const msg = (id: string, body: string, author: 'member' | 'agent' = 'member') =>
  ({ id, item_id: null, author_type: author, author_member_id: author === 'member' ? 'ben' : null, body, created_at: '2026-10-26T15:00:00.000Z' });
const earlier = { id: 't1', title: 'Sore knee', summary: 'Rest day added; easy Thursday.', opened_at: '2026-10-20T12:00:00.000Z', last_message_at: '2026-10-21T12:00:00.000Z', closed_at: '2026-10-21T12:00:00.000Z' };
const current = { id: 't2', title: 'Race week', summary: null, opened_at: '2026-10-26T12:00:00.000Z', last_message_at: '2026-10-26T15:00:00.000Z', closed_at: null };

function server(calls: string[], over: { topic?: unknown } = {}) {
  return routeFetch({
    'GET /api/v1/me/agent-inboxes': () => ok({ inboxes: [summary()] }),
    [`GET ${inboxPath(ref)}`]: () => ok(page({ asks: [], messages: [msg('m1', 'Weather for Sunday?')],
      topic: { id: 't2', title: 'Race week', opened_at: current.opened_at, stale: false }, ...over })),
    [`POST ${inboxPath(ref, '/seen')}`]: () => ok({ seen_at: 'x' }),
    [`POST ${inboxPath(ref, '/topics')}`]: () => { calls.push('new'); return ok({ topic: { ...current, id: 't3', title: null } }); },
    [`GET ${inboxPath(ref, '/topics')}`]: () => ok({ available: true, topics: [current, earlier], next_before: null }),
    [`GET ${inboxPath(ref, '/topics/t1')}`]: () => ok({ topic: earlier, messages: [msg('o1', 'Knee is sore.'), msg('o2', 'Rest tomorrow.', 'agent')] }),
    [`POST ${inboxPath(ref, '/topics/t1/reopen')}`]: () => { calls.push('reopen t1'); return ok({ topic: { ...earlier, closed_at: null } }); },
  });
}

test('the conversation names its topic and starts a new one', async () => {
  const calls: string[] = [];
  render(<AgentInboxButton baseUrl="https://api.test" app="fitter" getToken={() => 't'} fetchImpl={server(calls)} pollMs={0} open />);
  fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }));
  expect(screen.getByText('Race week')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'New topic' }));
  await waitFor(() => expect(calls).toEqual(['new']));
});

test('Topics lists summaries; an earlier topic reads back and can be continued', async () => {
  const calls: string[] = [];
  render(<AgentInboxButton baseUrl="https://api.test" app="fitter" getToken={() => 't'} fetchImpl={server(calls)} pollMs={0} open />);
  fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Topics' }));
  expect(await screen.findByText('Rest day added; easy Thursday.')).toBeTruthy();
  expect(screen.getByText('Current')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Sore knee/ }));
  expect(await screen.findByText('Knee is sore.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Continue this topic' }));
  await waitFor(() => expect(calls).toEqual(['reopen t1']));
});

test('a quiet topic says the next message starts a new one; a server without topics shows no topic bar', async () => {
  const { unmount } = render(<AgentInboxButton baseUrl="https://api.test" app="fitter" getToken={() => 't'}
    fetchImpl={server([], { topic: { id: 't2', title: 'Race week', opened_at: current.opened_at, stale: true } })} pollMs={0} open />);
  fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }));
  expect(screen.getByText(/Your next message starts a new topic/)).toBeTruthy();
  unmount();
  render(<AgentInboxButton baseUrl="https://api.test" app="fitter" getToken={() => 't'} fetchImpl={server([], { topic: undefined })} pollMs={0} open />);
  fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }));
  expect(screen.queryByRole('button', { name: 'New topic' })).toBeNull();
});

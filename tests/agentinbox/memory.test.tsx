import { test, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentInboxButton, inboxPath } from '../../src/agentinbox';
import { COACH, HH, item, ok, page, routeFetch, summary } from './fixtures';

const ref = { householdId: HH, instanceId: COACH };
const profileUpdate = item({ id: 'u9', kind: 'update', status: 'live', title: 'Added to your training profile', body: 'Long runs: Sunday mornings.', about_key: 'profile.training.1761490000000' });

function server(calls: string[], profile: unknown) {
  return routeFetch({
    'GET /api/v1/me/agent-inboxes': () => ok({ inboxes: [summary()] }),
    [`GET ${inboxPath(ref)}`]: () => ok(page({ asks: [], updates: [profileUpdate] })),
    [`POST ${inboxPath(ref, '/seen')}`]: () => ok({ seen_at: 'x' }),
    [`POST ${inboxPath(ref, '/items/u9/undo-profile')}`]: () => {
      calls.push('undo u9');
      return ok({ item: { ...profileUpdate, title: 'Undone: Added to your training profile', about_key: null }, reverted: ['long_run_day'] });
    },
    [`GET ${inboxPath(ref, '/notes')}`]: () => ok({ notes: [], used_chars: 0, max_chars: 4000, profile }),
  });
}

test('a profile update offers Undo, which reverts it on the server', async () => {
  const calls: string[] = [];
  render(<AgentInboxButton baseUrl="https://api.test" app="fitter" getToken={() => 't'} fetchImpl={server(calls, null)} pollMs={0} open />);
  fireEvent.click(await screen.findByRole('button', { name: 'Undo this profile change' }));
  await waitFor(() => expect(calls).toEqual(['undo u9']));
});

test('Memory shows the profile the agent writes to, read-only', async () => {
  const profile = { domain: 'training', label: 'training', exists: true, updated_at: null,
    fields: { long_run_day: 'Sunday', avoid: ['treadmill', 'track'] } };
  render(<AgentInboxButton baseUrl="https://api.test" app="fitter" getToken={() => 't'} fetchImpl={server([], profile)} pollMs={0} open />);
  fireEvent.click(await screen.findByRole('tab', { name: /Memory/ }));
  expect(await screen.findByText('From your training profile')).toBeTruthy();
  expect(screen.getByText('long run day')).toBeTruthy();
  expect(screen.getByText('treadmill, track')).toBeTruthy();
});

test('an empty profile says so; no profile domain shows no section', async () => {
  const empty = { domain: 'meals', label: 'meals', exists: false, updated_at: null, fields: {} };
  const { unmount } = render(<AgentInboxButton baseUrl="https://api.test" app="fitter" getToken={() => 't'} fetchImpl={server([], empty)} pollMs={0} open />);
  fireEvent.click(await screen.findByRole('tab', { name: /Memory/ }));
  expect(await screen.findByText('Nothing saved yet.')).toBeTruthy();
  unmount();
  render(<AgentInboxButton baseUrl="https://api.test" app="fitter" getToken={() => 't'} fetchImpl={server([], null)} pollMs={0} open />);
  fireEvent.click(await screen.findByRole('tab', { name: /Memory/ }));
  await screen.findByText(/no notes yet/);
  expect(screen.queryByText(/From your/)).toBeNull();
});

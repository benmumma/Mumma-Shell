import { test, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AgentInboxButton, inboxPath } from '../../src/agentinbox';
import { COACH, HH, item, ok, page, routeFetch, summary } from './fixtures';

const ref = { householdId: HH, instanceId: COACH };

beforeEach(() => { document.body.style.overflow = ''; });

function server(over: Record<string, Parameters<typeof routeFetch>[0][string]> = {}) {
  return routeFetch({
    'GET /api/v1/me/agent-inboxes': () => ok({ inboxes: [summary()] }),
    [`GET ${inboxPath(ref)}`]: () => ok(page()),
    [`POST ${inboxPath(ref, '/seen')}`]: () => ok({ seen_at: 'x' }),
    ...over,
  });
}

test('renders nothing while the member has no inbox in this app', async () => {
  const fetchImpl = server({ 'GET /api/v1/me/agent-inboxes': () => ok({ inboxes: [] }) });
  const { container } = render(<AgentInboxButton baseUrl="https://api.test" app="mealmate" getToken={() => 't'} fetchImpl={fetchImpl} pollMs={0} />);
  await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
  expect(container.innerHTML).toBe('');
});

test('shows the count of what needs you and opens the inbox in a drawer', async () => {
  const fetchImpl = server();
  render(<AgentInboxButton baseUrl="https://api.test" app="fitter" getToken={() => 't'} fetchImpl={fetchImpl} pollMs={0} />);
  const btn = await screen.findByRole('button', { name: 'Coach (1 needs you)' });
  expect(screen.getByTestId('agentinbox-badge').textContent).toBe('1');
  fireEvent.click(btn);
  expect(screen.getByRole('dialog', { name: 'Coach' })).toBeTruthy();
  expect(await screen.findByText('Move the long run to Sunday?')).toBeTruthy();
  expect(screen.getByText('Mon easy 5k')).toBeTruthy();
  expect(screen.getByRole('progressbar', { name: 'Weekly km' })).toBeTruthy();
  await waitFor(() => expect(fetchImpl.mock.calls.some(([u, i]) => String(u).endsWith('/seen') && i?.method === 'POST')).toBe(true));
});

test('answering moves the question to Answered with an undo, then reports when the agent acts', async () => {
  const answered = item({ status: 'answered', undo_until: new Date(Date.now() + 30000).toISOString(), follow_through: 'pending',
    answer: { keys: ['sun'], labels: ['Sunday'], text: null } });
  const fetchImpl = server({
    [`POST ${inboxPath(ref, '/items/i1/answer')}`]: () => ok({ item: answered, wake: 'now', acts_at: null }),
  });
  render(<AgentInboxButton baseUrl="https://api.test" app="fitter" getToken={() => 't'} fetchImpl={fetchImpl} pollMs={0} open />);
  const sunday = await screen.findByRole('button', { name: /Sunday.*Recommended/ });
  await act(async () => { fireEvent.click(sunday); });
  expect(await screen.findByText('You chose Sunday')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Undo \(\d+s\)/ })).toBeTruthy();
  const call = fetchImpl.mock.calls.find(([u]) => String(u).endsWith('/answer'));
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({ keys: ['sun'] });
});

test("a refused answer puts the question back and says why", async () => {
  const fetchImpl = server({
    [`POST ${inboxPath(ref, '/items/i1/answer')}`]: () => ({ status: 409, body: { success: false, code: 'ALREADY_CLOSED', message: 'ALREADY_CLOSED' } }),
  });
  render(<AgentInboxButton baseUrl="https://api.test" app="fitter" getToken={() => 't'} fetchImpl={fetchImpl} pollMs={0} open />);
  const keep = await screen.findByRole('button', { name: /Keep Saturday/ });
  await act(async () => { fireEvent.click(keep); });
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(await screen.findByText('Move the long run to Sunday?')).toBeTruthy();
});

import { test, expect, vi } from 'vitest';
import { createAgentInboxApi, inboxPath } from '../../src/agentinbox';
import { COACH, HH, ok, routeFetch, summary } from './fixtures';

const ref = { householdId: HH, instanceId: COACH };

test('lists inboxes for an app with the bearer token', async () => {
  const fetchImpl = routeFetch({ 'GET /api/v1/me/agent-inboxes': () => ok({ inboxes: [summary()] }) });
  const api = createAgentInboxApi({ baseUrl: 'https://api.test/', getToken: () => 'tok', fetchImpl });
  const list = await api.listInboxes('fitter');
  expect(list).toHaveLength(1);
  const [url, init] = fetchImpl.mock.calls[0];
  expect(url).toBe('https://api.test/api/v1/me/agent-inboxes?app=fitter');
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
});

test('reads never throw: signed out, 503 and a network error are all null', async () => {
  expect(await createAgentInboxApi({ baseUrl: 'https://api.test', getToken: () => null }).listInboxes('fitter')).toBeNull();
  const off = routeFetch({ 'GET /api/v1/me/agent-inboxes': () => ({ status: 503, body: { success: false, code: 'INBOX_DISABLED' } }) });
  expect(await createAgentInboxApi({ baseUrl: 'https://api.test', getToken: () => 't', fetchImpl: off }).listInboxes(null)).toBeNull();
  const boom = vi.fn(async () => { throw new TypeError('offline'); });
  expect(await createAgentInboxApi({ baseUrl: 'https://api.test', getToken: () => 't', fetchImpl: boom as unknown as typeof fetch }).getInbox(HH, COACH)).toBeNull();
});

test("writes return the server's code instead of throwing", async () => {
  const fetchImpl = routeFetch({
    [`POST ${inboxPath(ref, '/items/i1/undo')}`]: () => ({ status: 409, body: { success: false, code: 'UNDO_WINDOW_CLOSED', message: 'UNDO_WINDOW_CLOSED' } }),
  });
  const api = createAgentInboxApi({ baseUrl: 'https://api.test', getToken: () => 't', fetchImpl });
  expect(await api.undo(ref, 'i1')).toEqual({ ok: false, status: 409, code: 'UNDO_WINDOW_CLOSED', message: 'UNDO_WINDOW_CLOSED' });
});

test('the active member rides the query and the write body', async () => {
  const fetchImpl = routeFetch({ [`POST ${inboxPath(ref, '/items/i1/answer')}`]: () => ok({ item: {}, wake: 'now', acts_at: null }) });
  const api = createAgentInboxApi({ baseUrl: 'https://api.test', getToken: () => 't', memberId: 'kid-1', fetchImpl });
  await api.answer(ref, 'i1', { keys: ['sun'] });
  const [url, init] = fetchImpl.mock.calls[0];
  expect(url).toContain('member_id=kid-1');
  expect(JSON.parse(init.body as string)).toEqual({ keys: ['sun'], member_id: 'kid-1' });
});

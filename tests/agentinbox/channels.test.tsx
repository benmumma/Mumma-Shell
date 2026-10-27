import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentInboxDock, inboxPath, sidebarItems, channelLabel, postAuthor, postText, pickerGroups, badgeCount } from '../../src/agentinbox';
import type { SidebarChannel, SidebarHousehold } from '../../src/agentinbox';
import { COACH, HH, ok, page, routeFetch, summary } from './fixtures';

const ME = 'm-ben';
const general: SidebarChannel = {
  id: 'ch-general', household_id: HH, household_name: 'Mummas', kind: 'general', name: 'General', can_post: true, in_sidebar: true,
};
const highlights: SidebarChannel = { ...general, id: 'ch-hl', kind: 'highlights', name: 'Highlights', can_post: false, in_sidebar: false };
const household: SidebarHousehold = {
  id: HH, name: 'Mummas', member_id: ME,
  members: [{ member_id: ME, display_name: 'Ben' }, { member_id: 'm-anh', display_name: 'Anh' }],
};

function viewport(width: number) {
  vi.stubGlobal('matchMedia', (q: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(q)?.[1] ?? 0);
    return { matches: width >= min, media: q, addEventListener: () => {}, removeEventListener: () => {} } as unknown as MediaQueryList;
  });
  window.matchMedia = globalThis.matchMedia;
}

beforeEach(() => { window.localStorage.clear(); document.body.style.paddingRight = ''; });
afterEach(() => vi.unstubAllGlobals());

test('the sidebar lists agents, then the picked channels, named by household when there are two', () => {
  const items = sidebarItems([summary()], [general], badgeCount);
  expect(items.map(i => [i.key, i.type, i.label])).toEqual([
    [`inbox:${COACH}`, 'inbox', 'Coach'],
    ['channel:ch-general', 'channel', 'General'],
  ]);
  expect(channelLabel(general, 2)).toBe('General · Mummas');
  expect(channelLabel({ ...general, household_name: null }, 2)).toBe('General');
});

test('a post is signed by its member, the agent, or the module', () => {
  expect(postAuthor({ id: 'p', publisher_type: 'member', publisher_member_id: 'm-anh', created_at: '' }, household)).toBe('Anh');
  expect(postAuthor({ id: 'p', publisher_type: 'member', publisher_member_id: ME, created_at: '' }, household)).toBe('You');
  expect(postAuthor({ id: 'p', publisher_type: 'member', publisher_member_id: 'gone', created_at: '' }, household)).toBe('Someone');
  expect(postAuthor({ id: 'p', publisher_type: 'agent', persona_name: 'Sous', created_at: '' }, household)).toBe('Sous');
  expect(postAuthor({ id: 'p', publisher_type: 'module', publisher_key: 'library', created_at: '' }, null)).toBe('Library');
  expect(postText({ id: 'p', title: 'Dinner', body: null, created_at: '' })).toBe('Dinner');
  expect(pickerGroups([general, highlights, { ...general, id: 'x', household_id: 'h2', household_name: 'Cabin' }]).map(g => [g.name, g.channels.length]))
    .toEqual([['Mummas', 2], ['Cabin', 1]]);
});

function server({ inboxes = [summary()], picked = [general], all = [general, highlights] } = {}) {
  const posted: unknown[] = [];
  const prefs: unknown[] = [];
  const fetchImpl = routeFetch({
    'GET /api/v1/me/agent-inboxes': () => ok({ inboxes }),
    [`GET ${inboxPath({ householdId: HH, instanceId: COACH })}`]: () => ok(page()),
    [`POST ${inboxPath({ householdId: HH, instanceId: COACH }, '/seen')}`]: () => ok({ seen_at: 'x' }),
    'GET /api/v1/me/channels': (url) => ok({ channels: url.searchParams.get('picked') ? picked : all, households: [household] }),
    [`GET /api/v1/households/${HH}/feed`]: () => ok({
      posts: [{ id: 'p1', publisher_type: 'member', publisher_member_id: 'm-anh', body: 'Pizza Friday?', created_at: new Date().toISOString() }],
    }),
    [`POST /api/v1/households/${HH}/feed`]: (_u, init) => { posted.push(JSON.parse(String(init.body))); return { status: 201, body: { success: true, data: {} } }; },
    [`PUT /api/v1/households/${HH}/channels/ch-hl/prefs`]: (_u, init) => { prefs.push(JSON.parse(String(init.body))); return ok({}); },
  });
  return { fetchImpl, posted, prefs };
}

const props = (fetchImpl: typeof fetch) => ({
  baseUrl: 'https://api.test', app: 'fitter', getToken: () => 't', fetchImpl, pollMs: 0,
});

test('a picked channel is a tab beside the agent; it reads and posts', async () => {
  viewport(1400);
  const { fetchImpl, posted } = server();
  render(<AgentInboxDock {...props(fetchImpl)} />);
  fireEvent.click(await screen.findByRole('tab', { name: '# General' }));
  expect(await screen.findByText('Pizza Friday?')).toBeTruthy();
  expect(screen.getByText('Anh')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Post in General'), { target: { value: 'Yes please' } });
  fireEvent.click(screen.getByRole('button', { name: 'Post' }));
  await waitFor(() => expect(posted).toEqual([{ body: 'Yes please', channel_id: 'ch-general' }]));
});

test('Choose feeds puts a channel in the sidebar', async () => {
  viewport(1400);
  const { fetchImpl, prefs } = server();
  render(<AgentInboxDock {...props(fetchImpl)} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Choose feeds' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Highlights' }));
  await waitFor(() => expect(prefs).toEqual([{ in_sidebar: true }]));
});

test('with no agent and nothing picked, a bubble opens straight onto Choose feeds', async () => {
  viewport(1400);
  const { fetchImpl } = server({ inboxes: [], picked: [] });
  render(<AgentInboxDock {...props(fetchImpl)} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Agents and feeds' }));
  expect(await screen.findByRole('checkbox', { name: 'General' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Choose feeds' })).toBeTruthy();
});

test('channels={false} (Dekko) and a pinned agent never ask for channels', async () => {
  viewport(1400);
  const { fetchImpl } = server();
  render(<AgentInboxDock {...props(fetchImpl)} channels={false} />);
  await screen.findByRole('complementary', { name: 'Coach' });
  expect(fetchImpl.mock.calls.some(([u]) => String(u).includes('/me/channels'))).toBe(false);
  expect(screen.queryByRole('button', { name: 'Choose feeds' })).toBeNull();
});

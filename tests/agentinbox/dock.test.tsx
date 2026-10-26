import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentInboxDock, inboxPath } from '../../src/agentinbox';
import { COACH, HH, ok, page, routeFetch, summary } from './fixtures';

const ref = { householdId: HH, instanceId: COACH };

function viewport(width: number) {
  vi.stubGlobal('matchMedia', (q: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(q)?.[1] ?? 0);
    return { matches: width >= min, media: q, addEventListener: () => {}, removeEventListener: () => {} } as unknown as MediaQueryList;
  });
  window.matchMedia = globalThis.matchMedia;
}

function server(inboxes = [summary()]) {
  return routeFetch({
    'GET /api/v1/me/agent-inboxes': () => ok({ inboxes }),
    [`GET ${inboxPath(ref)}`]: () => ok(page()),
    [`POST ${inboxPath(ref, '/seen')}`]: () => ok({ seen_at: 'x' }),
  });
}

const props = (fetchImpl: typeof fetch) => ({
  baseUrl: 'https://api.test', app: 'fitter', getToken: () => 't', fetchImpl, pollMs: 0,
});

beforeEach(() => { window.localStorage.clear(); document.body.style.paddingRight = ''; document.body.style.overflow = ''; });
afterEach(() => vi.unstubAllGlobals());

test('renders nothing without an inbox in this app', async () => {
  viewport(1400);
  const fetchImpl = server([]);
  const { container } = render(<AgentInboxDock {...props(fetchImpl)} />);
  await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
  expect(container.innerHTML).toBe('');
  expect(document.body.style.paddingRight).toBe('');
});

test('a wide screen opens the sidebar by itself and makes room for it', async () => {
  viewport(1400);
  render(<AgentInboxDock {...props(server())} />);
  const aside = await screen.findByRole('complementary', { name: 'Coach' });
  expect(aside).toBeTruthy();
  expect(await screen.findByText('Move the long run to Sunday?')).toBeTruthy();
  expect(document.body.style.paddingRight).toBe('var(--mumma-ai-dock-width, 22rem)');
  expect(document.documentElement.style.getPropertyValue('--mumma-ai-dock-reserved')).toBe('var(--mumma-ai-dock-width, 22rem)');
});

test('shrinking leaves a bubble, gives the room back, and is remembered', async () => {
  viewport(1400);
  const fetchImpl = server();
  const { unmount } = render(<AgentInboxDock {...props(fetchImpl)} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Shrink' }));
  expect(screen.queryByRole('complementary')).toBeNull();
  expect(document.body.style.paddingRight).toBe('');
  expect(screen.getByRole('button', { name: /Coach/ })).toBeTruthy();
  unmount();
  render(<AgentInboxDock {...props(fetchImpl)} />);
  const bubble = await screen.findByRole('button', { name: /Coach/ });
  expect(screen.queryByRole('complementary')).toBeNull();
  fireEvent.click(bubble);
  expect(await screen.findByRole('complementary', { name: 'Coach' })).toBeTruthy();
  expect(window.localStorage.getItem('mumma-ai-dock:fitter')).toBeNull();
});

test('a narrow screen shows the bubble, which opens the drawer', async () => {
  viewport(800);
  render(<AgentInboxDock {...props(server())} />);
  const bubble = await screen.findByRole('button', { name: 'Coach (1 needs you)' });
  expect(screen.getByTestId('agentinbox-badge').textContent).toBe('1');
  expect(document.body.style.paddingRight).toBe('');
  fireEvent.click(bubble);
  expect(screen.getByRole('dialog', { name: 'Coach' })).toBeTruthy();
  expect(await screen.findByText('Move the long run to Sunday?')).toBeTruthy();
});

test('reserveSpace false leaves the page alone but still says how wide it is', async () => {
  viewport(1400);
  render(<AgentInboxDock {...props(server())} reserveSpace={false} />);
  await screen.findByRole('complementary');
  expect(document.body.style.paddingRight).toBe('');
  expect(document.documentElement.style.getPropertyValue('--mumma-ai-dock-reserved')).toBe('var(--mumma-ai-dock-width, 22rem)');
});

test('the sidebar edge resizes by keys and drag, within limits, and remembers the width', async () => {
  viewport(1400);
  const prevWidth = window.innerWidth;
  window.innerWidth = 1400;
  const fetchImpl = server();
  const { unmount } = render(<AgentInboxDock {...props(fetchImpl)} />);
  const edge = await screen.findByRole('separator', { name: 'Resize the sidebar' });
  fireEvent.keyDown(edge, { key: 'Home' });
  expect(document.body.style.paddingRight).toBe('288px');
  fireEvent.keyDown(edge, { key: 'ArrowLeft' });
  expect(document.body.style.paddingRight).toBe('304px');
  fireEvent.pointerDown(edge, { button: 0, pointerId: 1, clientX: 1100 });
  fireEvent.pointerMove(edge, { pointerId: 1, clientX: 900 });
  fireEvent.pointerUp(edge, { pointerId: 1, clientX: 900 });
  expect(document.body.style.paddingRight).toBe('500px');
  fireEvent.pointerDown(edge, { button: 0, pointerId: 1, clientX: 900 });
  fireEvent.pointerMove(edge, { pointerId: 1, clientX: 10 });
  fireEvent.pointerUp(edge, { pointerId: 1, clientX: 10 });
  expect(document.body.style.paddingRight).toBe('720px');
  expect(window.localStorage.getItem('mumma-ai-dock:fitter:width')).toBe('720');
  unmount();
  render(<AgentInboxDock {...props(fetchImpl)} />);
  const again = await screen.findByRole('separator', { name: 'Resize the sidebar' });
  expect(document.body.style.paddingRight).toBe('720px');
  fireEvent.doubleClick(again);
  expect(document.body.style.paddingRight).toBe('var(--mumma-ai-dock-width, 22rem)');
  expect(window.localStorage.getItem('mumma-ai-dock:fitter:width')).toBeNull();
  window.innerWidth = prevWidth;
});

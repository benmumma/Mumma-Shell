import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WhatsNewButton, clearReleaseNotesCache } from '../../src/whatsnew';
import { entry, okFetch } from './fixtures';

const feed = [
  entry({ id: 'a', title: 'Overland third edition', link: '/games/westward', published_at: '2026-09-20T12:00:00.000Z' }),
  entry({ id: 'b', title: 'Scores stick', published_at: '2026-09-18T12:00:00.000Z' }),
];

beforeEach(() => {
  clearReleaseNotesCache();
  localStorage.clear();
  document.body.style.overflow = '';
  vi.stubGlobal('fetch', okFetch(feed));
});
afterEach(() => vi.unstubAllGlobals());

async function renderLoaded(props: Partial<Parameters<typeof WhatsNewButton>[0]> = {}) {
  const utils = render(<WhatsNewButton baseUrl="https://admin.test/" app="arcade" {...props} />);
  await waitFor(() => expect(screen.getByRole('button', { name: /what's new \(2 new\)/i })).toBeTruthy());
  return utils;
}

test('shows an unread dot with an accessible count, and hides it once seen', async () => {
  await renderLoaded();
  expect(screen.getByTestId('whatsnew-unread-dot')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /what's new/i }));
  expect(screen.getByRole('dialog', { name: "What's new" })).toBeTruthy();
  await waitFor(() => expect(screen.queryByTestId('whatsnew-unread-dot')).toBeNull());
  expect(localStorage.getItem('mumma:whatsnew:v1:arcade')).toBe('2026-09-20T12:00:00.000Z');
});

test('no dot when everything is already seen', async () => {
  localStorage.setItem('mumma:whatsnew:v1:arcade', '2026-09-20T12:00:00.000Z');
  render(<WhatsNewButton baseUrl="https://admin.test" app="arcade" />);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByRole('button', { name: "What's new" })).toBeTruthy());
  expect(screen.queryByTestId('whatsnew-unread-dot')).toBeNull();
});

test('dialog is labelled and modal, locks scroll, Esc closes and returns focus', async () => {
  await renderLoaded();
  const trigger = screen.getByRole('button', { name: /what's new/i });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole('dialog');
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe("What's new");
  expect(document.body.style.overflow).toBe('hidden');
  expect(dialog.contains(document.activeElement)).toBe(true);
  expect(screen.getByText('Overland third edition')).toBeTruthy();

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.body.style.overflow).toBe('');
  expect(document.activeElement).toBe(trigger);
});

test('focus is trapped inside the dialog', async () => {
  await renderLoaded();
  fireEvent.click(screen.getByRole('button', { name: /what's new/i }));
  const dialog = screen.getByRole('dialog');
  const close = screen.getByRole('button', { name: 'Close' });
  const links = dialog.querySelectorAll('a[href]');
  const last = links[links.length - 1] as HTMLElement;
  expect(document.activeElement).toBe(close);
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(last);
  fireEvent.keyDown(document, { key: 'Tab' });
  expect(document.activeElement).toBe(close);
});

test('the close button and the backdrop close the dialog', async () => {
  await renderLoaded();
  fireEvent.click(screen.getByRole('button', { name: /what's new/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /what's new/i }));
  fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('onNavigate routes a relative link and closes the dialog', async () => {
  const onNavigate = vi.fn();
  await renderLoaded({ onNavigate });
  fireEvent.click(screen.getByRole('button', { name: /what's new/i }));
  fireEvent.click(screen.getByRole('link', { name: 'Open: Overland third edition' }));
  expect(onNavigate).toHaveBeenCalledWith('/games/westward');
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('text variant shows the label with a count', async () => {
  render(<WhatsNewButton baseUrl="https://admin.test" app="arcade" variant="text" label="Updates" />);
  const btn = await screen.findByRole('button', { name: 'Updates (2 new)' });
  expect(btn.textContent).toBe('Updates2');
});

test('renderTrigger supplies a custom trigger and keeps the standard dialog', async () => {
  render(<WhatsNewButton baseUrl="https://admin.test" app="arcade"
    renderTrigger={({ open, unread, label }) => <button type="button" onClick={open}>{`${label} · ${unread}`}</button>} />);
  const custom = await screen.findByRole('button', { name: "What's new · 2" });
  fireEvent.click(custom);
  expect(screen.getByRole('dialog', { name: "What's new" })).toBeTruthy();
  await waitFor(() => expect(screen.getByRole('button', { name: "What's new · 0" })).toBeTruthy());
});

test('a failing feed shows the error state and never throws', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ success: false }) }));
  render(<WhatsNewButton baseUrl="https://admin.test" app="arcade" />);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: "What's new" }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/couldn't load what's new/i);
});

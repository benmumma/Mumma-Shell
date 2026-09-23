import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MummaHeader } from '../../src/header/MummaHeader';
import { clearReleaseNotesCache } from '../../src/whatsnew';
import { entry, okFetch } from './fixtures';

beforeEach(() => {
  clearReleaseNotesCache();
  localStorage.clear();
  vi.stubGlobal('fetch', okFetch([entry({ id: 'a', app: 'forward', title: 'Quick add is quicker' })]));
});
afterEach(() => vi.unstubAllGlobals());

test('without whatsNew: no button, no menu item, no releases fetch', () => {
  render(<MummaHeader appName="Forward" appKey="forward" />);
  expect(screen.queryByRole('button', { name: /what's new/i })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /settings/i }));
  expect(screen.queryByRole('button', { name: /what's new/i })).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

test('with whatsNew: renders the button for appKey and fetches that feed', async () => {
  render(<MummaHeader appName="Forward" appKey="forward" whatsNew={{ baseUrl: 'https://admin.mumma.co' }} />);
  await screen.findByRole('button', { name: "What's new (1 new)" });
  const url = new URL((fetch as any).mock.calls[0][0]);
  expect(url.searchParams.get('app')).toBe('forward');
});

test('whatsNew.app overrides appKey; with neither, nothing renders', async () => {
  const { unmount } = render(<MummaHeader appName="Forward" appKey="forward" whatsNew={{ baseUrl: 'https://a.test', app: 'suite', label: 'Updates' }} />);
  await screen.findByRole('button', { name: /^updates/i });
  expect(new URL((fetch as any).mock.calls[0][0]).searchParams.get('app')).toBe('suite');
  unmount();
  render(<MummaHeader appName="Custom" whatsNew={{ baseUrl: 'https://a.test' }} />);
  expect(screen.queryByRole('button', { name: /what's new/i })).toBeNull();
});

test('app actions still render alongside the button', async () => {
  render(<MummaHeader appName="Forward" appKey="forward" actions={<button type="button">Quick Add</button>}
    whatsNew={{ baseUrl: 'https://a.test' }} />);
  expect(screen.getByRole('button', { name: 'Quick Add' })).toBeTruthy();
  await screen.findByRole('button', { name: /what's new/i });
});

test('the gear menu item opens the same dialog; closing returns focus to the header button', async () => {
  const onNavigate = vi.fn();
  render(<MummaHeader appName="Forward" appKey="forward" whatsNew={{ baseUrl: 'https://a.test', onNavigate }} />);
  const headerBtn = await screen.findByRole('button', { name: "What's new (1 new)" });
  fireEvent.click(screen.getByRole('button', { name: /settings/i }));
  const item = screen.getByRole('button', { name: "What's new" });
  item.focus();
  fireEvent.click(item);
  expect(screen.queryByRole('navigation', { name: /settings menu/i })).toBeNull();
  expect(screen.getByRole('dialog', { name: "What's new" })).toBeTruthy();
  expect(screen.getByText('Quick add is quicker')).toBeTruthy();
  await waitFor(() => expect(screen.getByRole('button', { name: "What's new" })).toBe(headerBtn));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(headerBtn);
});

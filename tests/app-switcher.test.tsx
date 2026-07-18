import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthClient } from '../src/auth/AuthClient';
import { MummaAuthProvider } from '../src/react/AuthProvider';
import { MummaHeader } from '../src/header/MummaHeader';
import { MUMMA_APPS, MUMMA_LABS_ICON } from '../src/header/apps';

function renderWithAuth(ui: ReactNode) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => ({
      authenticated: true,
      user: { id: 'u1', email: 'ben@x.co', user_metadata: {} },
      session: { access_token: 'at', refresh_token: 'rt', expires_at: 9999999999 },
      appAccess: {},
    }),
  }));
  const supabase = { auth: { setSession: vi.fn().mockResolvedValue({}), signOut: vi.fn(), getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } };
  const client = new AuthClient({ supabase: supabase as any, authBaseUrl: 'https://auth.test' });
  return render(<MummaAuthProvider client={client}>{ui}</MummaAuthProvider>);
}

test('registry lists the nine mumma apps in order with hosted icons', () => {
  expect(MUMMA_APPS.map(a => a.key)).toEqual([
    'dekko', 'forward', 'intellect', 'mealmate', 'library', 'arcade', 'rem', 'scholarquest', 'fitter',
  ]);
  expect(MUMMA_APPS.find(a => a.key === 'forward')).toEqual({
    key: 'forward', name: 'Forward', url: 'https://forward.mumma.co',
    iconSrc: 'https://www.mumma.co/new_logos/forward_live.png',
  });
  // future icons are listed now so they light up without a package release
  expect(MUMMA_APPS.find(a => a.key === 'library')?.iconSrc).toBe('https://www.mumma.co/new_logos/library_live.png');
  for (const app of MUMMA_APPS) expect(app.iconSrc).toMatch(/^https:\/\/www\.mumma\.co\/new_logos\/\w+_live\.png$/);
  expect(MUMMA_LABS_ICON).toBe('https://www.mumma.co/new_logos/mumma_labs_live.png');
});

test('app name opens a switcher listing every app with its icon', () => {
  renderWithAuth(<MummaHeader appName="Forward" appKey="forward" />);
  const trigger = screen.getByRole('button', { name: /forward/i });
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  const library = screen.getByRole('link', { name: /library/i }) as HTMLAnchorElement;
  expect(library.href).toBe('https://gallery.mumma.co/');
  expect((screen.getByAltText('Library') as HTMLImageElement).src)
    .toBe('https://www.mumma.co/new_logos/library_live.png');
  for (const app of MUMMA_APPS) expect(screen.getByRole('link', { name: new RegExp(app.name, 'i') })).toBeTruthy();
});

test('current app is highlighted via appKey', () => {
  renderWithAuth(<MummaHeader appName="Forward" appKey="forward" />);
  fireEvent.click(screen.getByRole('button', { name: /forward/i }));
  const current = screen.getByRole('link', { name: /forward/i });
  expect(current.getAttribute('aria-current')).toBe('true');
  expect(screen.getByRole('link', { name: /fitter/i }).getAttribute('aria-current')).toBeNull();
});

test('apps prop overrides the built-in registry', () => {
  renderWithAuth(
    <MummaHeader appName="Custom" apps={[{ key: 'x', name: 'AppX', url: 'https://x.test', iconSrc: 'https://x.test/i.png' }]} />
  );
  fireEvent.click(screen.getByRole('button', { name: /custom/i }));
  expect((screen.getByRole('link', { name: /appx/i }) as HTMLAnchorElement).href).toBe('https://x.test/');
  expect(screen.queryByRole('link', { name: /fitter/i })).toBeNull();
});

test('appSwitcher={false} renders a plain title', () => {
  renderWithAuth(<MummaHeader appName="Forward" appSwitcher={false} />);
  expect(screen.getByText('Forward')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /forward/i })).toBeNull();
});

test('header falls back to the registry icon, then mumma labs on load error', () => {
  renderWithAuth(<MummaHeader appName="Library" appKey="library" />);
  const logo = screen.getByAltText('Library logo') as HTMLImageElement;
  expect(logo.src).toBe('https://www.mumma.co/new_logos/library_live.png');
  fireEvent.error(logo);
  expect(logo.src).toBe(MUMMA_LABS_ICON);
});

test('unknown app without logoSrc shows the mumma labs icon', () => {
  renderWithAuth(<MummaHeader appName="Mystery" />);
  expect((screen.getByAltText('Mystery logo') as HTMLImageElement).src).toBe(MUMMA_LABS_ICON);
});

test('explicit logoSrc wins and still falls back on error', () => {
  renderWithAuth(<MummaHeader appName="Forward" appKey="forward" logoSrc="/custom.png" />);
  const logo = screen.getByAltText('Forward logo') as HTMLImageElement;
  expect(logo.src).toContain('/custom.png');
  fireEvent.error(logo);
  expect(logo.src).toBe(MUMMA_LABS_ICON);
});

test('switcher closes on Escape and outside click', () => {
  renderWithAuth(<MummaHeader appName="Forward" appKey="forward" />);
  const trigger = screen.getByRole('button', { name: /forward/i });
  fireEvent.click(trigger);
  expect(screen.getByRole('link', { name: /fitter/i })).toBeTruthy();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('link', { name: /fitter/i })).toBeNull();
  fireEvent.click(trigger);
  expect(screen.getByRole('link', { name: /fitter/i })).toBeTruthy();
  fireEvent.mouseDown(document.body);
  expect(screen.queryByRole('link', { name: /fitter/i })).toBeNull();
});

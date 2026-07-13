import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthClient } from '../src/auth/AuthClient';
import { MummaAuthProvider } from '../src/react/AuthProvider';
import { MummaHeader } from '../src/header/MummaHeader';

function renderHeader() {
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
  const signOutSpy = vi.spyOn(client, 'signOut').mockImplementation(() => {});
  render(
    <MummaAuthProvider client={client}>
      <MummaHeader appName="Forward" logoSrc="/logo.png" familyUrl="https://family.mumma.co" />
    </MummaAuthProvider>
  );
  return { signOutSpy };
}

test('renders app name, logo, and family link', async () => {
  renderHeader();
  expect(screen.getByText('Forward')).toBeTruthy();
  expect((screen.getByRole('link', { name: /family/i }) as HTMLAnchorElement).href).toBe('https://family.mumma.co/');
  expect((screen.getByAltText('Forward logo') as HTMLImageElement).src).toContain('/logo.png');
});

test('logo links to the app homepage', async () => {
  renderHeader();
  const home = screen.getByRole('link', { name: /^home$/i }) as HTMLAnchorElement;
  expect(home.getAttribute('href')).toBe('/');
  expect(home.querySelector('img')).toBeTruthy();
});

test('gear menu exposes account link and sign out', async () => {
  const { signOutSpy } = renderHeader();
  fireEvent.click(screen.getByRole('button', { name: /settings/i }));
  const account = screen.getByRole('link', { name: /account/i }) as HTMLAnchorElement;
  expect(account.href).toBe('https://auth.test/manage-account');
  fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
  await waitFor(() => expect(signOutSpy).toHaveBeenCalled());
});

test('actions and menuItems slots render app-specific content', async () => {
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
  const { MummaMenuItem } = await import('../src/header/MummaHeader');
  render(
    <MummaAuthProvider client={client}>
      <MummaHeader
        appName="Forward"
        actions={<button type="button">Quick Add</button>}
        menuItems={<MummaMenuItem href="https://x/prefs">Preferences</MummaMenuItem>}
      />
    </MummaAuthProvider>
  );
  expect(screen.getByRole('button', { name: 'Quick Add' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /settings/i }));
  expect((screen.getByRole('link', { name: 'Preferences' }) as HTMLAnchorElement).href).toBe('https://x/prefs');
});

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
      <MummaHeader appName="Forward" logoSrc="/logo.png" dekkoUrl="https://dekko.mumma.co" />
    </MummaAuthProvider>
  );
  return { signOutSpy };
}

test('renders app name, logo, and Dekko link', async () => {
  renderHeader();
  expect(screen.getByText('Forward')).toBeTruthy();
  expect((screen.getByRole('link', { name: /dekko/i }) as HTMLAnchorElement).href).toBe('https://dekko.mumma.co/');
  expect((screen.getByAltText('Forward logo') as HTMLImageElement).src).toContain('/logo.png');
});

test('deprecated familyUrl prop still renders the Dekko link', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => ({ authenticated: false }),
  }));
  const supabase = { auth: { setSession: vi.fn().mockResolvedValue({}), signOut: vi.fn(), getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } };
  const client = new AuthClient({ supabase: supabase as any, authBaseUrl: 'https://auth.test' });
  render(
    <MummaAuthProvider client={client}>
      <MummaHeader appName="Forward" familyUrl="https://dekko.mumma.co" />
    </MummaAuthProvider>
  );
  expect((screen.getByRole('link', { name: /dekko/i }) as HTMLAnchorElement).href).toBe('https://dekko.mumma.co/');
});

test('logo links to the app homepage', async () => {
  renderHeader();
  const home = screen.getByRole('link', { name: /^home$/i }) as HTMLAnchorElement;
  expect(home.getAttribute('href')).toBe('/');
  expect(home.querySelector('img')).toBeTruthy();
});

test('logo click does a fast SPA navigation to the current-site home', () => {
  renderHeader();
  const pushState = vi.spyOn(window.history, 'pushState');
  const onPop = vi.fn();
  window.addEventListener('popstate', onPop);
  const home = screen.getByRole('link', { name: /^home$/i });
  const notPrevented = fireEvent.click(home);
  expect(notPrevented).toBe(false); // default was prevented — no full reload
  expect(pushState).toHaveBeenCalledWith(null, '', '/');
  expect(onPop).toHaveBeenCalled();
  window.removeEventListener('popstate', onPop);
  pushState.mockRestore();
});

test('modified clicks on the logo fall through to the plain href', () => {
  renderHeader();
  const pushState = vi.spyOn(window.history, 'pushState');
  const home = screen.getByRole('link', { name: /^home$/i });
  // prevent jsdom from attempting a real navigation once our handler declines
  const swallow = (e: Event) => e.preventDefault();
  document.addEventListener('click', swallow);
  fireEvent.click(home, { ctrlKey: true });
  fireEvent.click(home, { metaKey: true });
  fireEvent.click(home, { button: 1 });
  expect(pushState).not.toHaveBeenCalled();
  document.removeEventListener('click', swallow);
  pushState.mockRestore();
});

test('onHomeNavigate replaces the default logo-click behavior', () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200, json: async () => ({ authenticated: false }),
  }));
  const supabase = { auth: { setSession: vi.fn().mockResolvedValue({}), signOut: vi.fn(), getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } };
  const client = new AuthClient({ supabase: supabase as any, authBaseUrl: 'https://auth.test' });
  const onHomeNavigate = vi.fn();
  const pushState = vi.spyOn(window.history, 'pushState');
  render(
    <MummaAuthProvider client={client}>
      <MummaHeader appName="Forward" onHomeNavigate={onHomeNavigate} />
    </MummaAuthProvider>
  );
  const notPrevented = fireEvent.click(screen.getByRole('link', { name: /^home$/i }));
  expect(notPrevented).toBe(false);
  expect(onHomeNavigate).toHaveBeenCalledTimes(1);
  expect(pushState).not.toHaveBeenCalled();
  pushState.mockRestore();
});

test('homeHref overrides the destination; cross-origin falls through to href', () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200, json: async () => ({ authenticated: false }),
  }));
  const supabase = { auth: { setSession: vi.fn().mockResolvedValue({}), signOut: vi.fn(), getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } };
  const client = new AuthClient({ supabase: supabase as any, authBaseUrl: 'https://auth.test' });
  const pushState = vi.spyOn(window.history, 'pushState');
  const { unmount } = render(
    <MummaAuthProvider client={client}>
      <MummaHeader appName="Forward" homeHref="/dashboard" />
    </MummaAuthProvider>
  );
  const home = screen.getByRole('link', { name: /^home$/i });
  expect(home.getAttribute('href')).toBe('/dashboard');
  fireEvent.click(home);
  expect(pushState).toHaveBeenCalledWith(null, '', '/dashboard');
  unmount();

  pushState.mockClear();
  render(
    <MummaAuthProvider client={client}>
      <MummaHeader appName="Forward" homeHref="https://elsewhere.example/home" />
    </MummaAuthProvider>
  );
  const external = screen.getByRole('link', { name: /^home$/i });
  const swallow = (e: Event) => e.preventDefault();
  document.addEventListener('click', swallow);
  fireEvent.click(external);
  expect(pushState).not.toHaveBeenCalled();
  document.removeEventListener('click', swallow);
  pushState.mockRestore();
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

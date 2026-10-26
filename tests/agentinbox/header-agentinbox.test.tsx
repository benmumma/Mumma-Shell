import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthClient } from '../../src/auth/AuthClient';
import { MummaAuthProvider } from '../../src/react/AuthProvider';
import { MummaHeader } from '../../src/header/MummaHeader';
import { summary } from './fixtures';

afterEach(() => vi.unstubAllGlobals());

test('signed out: no inbox button and no inbox request', () => {
  vi.stubGlobal('fetch', vi.fn());
  render(<MummaHeader appName="Fitter" appKey="fitter" agentInbox={{ baseUrl: 'https://api.test' }} />);
  expect(screen.queryByRole('button', { name: /coach/i })).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

test("signed in: lists this app's inboxes with the auth client's bearer", async () => {
  const fetchMock = vi.fn(async (input: string) => {
    if (String(input).startsWith('https://auth.test')) {
      return { ok: true, status: 200, json: async () => ({
        authenticated: true, user: { id: 'u1', email: 'ben@x.co', user_metadata: {} },
        session: { access_token: 'at', refresh_token: 'rt', expires_at: 9999999999 }, appAccess: {},
      }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ success: true, data: { inboxes: [summary()] } }) } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  const supabase = { auth: { setSession: vi.fn().mockResolvedValue({}), signOut: vi.fn(), getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } };
  const client = new AuthClient({ supabase: supabase as any, authBaseUrl: 'https://auth.test' });
  render(
    <MummaAuthProvider client={client}>
      <MummaHeader appName="Fitter" appKey="fitter" agentInbox={{ baseUrl: 'https://api.test' }} />
    </MummaAuthProvider>,
  );
  await screen.findByRole('button', { name: 'Coach (1 needs you)' });
  const call = fetchMock.mock.calls.find(([u]) => String(u).startsWith('https://api.test'));
  expect(String(call?.[0])).toBe('https://api.test/api/v1/me/agent-inboxes?app=fitter');
  await waitFor(() => expect((call?.[1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer at' }));
});

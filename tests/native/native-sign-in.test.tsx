import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { NativeSignIn } from '../../src/native/NativeSignIn';

function fakeClient(over: Record<string, unknown> = {}) {
  return {
    canUseApple: false,
    authBaseUrl: 'https://auth.mumma.co',
    requestEmailCode: vi.fn().mockResolvedValue(undefined),
    verifyEmailCode: vi.fn().mockResolvedValue({ authenticated: true }),
    signInWithPassword: vi.fn().mockResolvedValue({ authenticated: true }),
    signInWithApple: vi.fn().mockResolvedValue({ authenticated: true }),
    ...over,
  } as any;
}

const typeEmail = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value } });

describe('NativeSignIn', () => {
  test('the code form is what the screen opens on — no password field until asked for', async () => {
    const client = fakeClient();
    const onSignedIn = vi.fn();
    render(<NativeSignIn appName="Arcade" client={client} onSignedIn={onSignedIn} />);

    expect(screen.getByText('Sign in to Arcade')).toBeTruthy();
    expect(document.querySelector('input[type="password"]')).toBeNull();

    typeEmail('u@x.co');
    fireEvent.click(screen.getByText('Send code'));
    await waitFor(() => expect(client.requestEmailCode).toHaveBeenCalledWith('u@x.co'));

    const code = await screen.findByPlaceholderText('000000');
    expect(screen.getByText('6-digit code sent to u@x.co')).toBeTruthy();
    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Sign in'));

    await waitFor(() => expect(client.verifyEmailCode).toHaveBeenCalledWith('u@x.co', '123456'));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  test('the password path: one link away, and the email typed so far carries over', async () => {
    const client = fakeClient();
    const onSignedIn = vi.fn();
    render(<NativeSignIn client={client} onSignedIn={onSignedIn} />);

    typeEmail('u@x.co');
    fireEvent.click(screen.getByText('Use a password instead'));

    const field = document.querySelector('input[type="password"]') as HTMLInputElement;
    expect(field).toBeTruthy();
    expect(field.getAttribute('autocomplete')).toBe('current-password');
    // 16px floor — anything smaller and iOS zooms the page on focus.
    expect(parseFloat(field.style.fontSize)).toBeGreaterThanOrEqual(16);
    expect((screen.getByPlaceholderText('you@example.com') as HTMLInputElement).value).toBe('u@x.co');
    expect(screen.queryByPlaceholderText('000000')).toBeNull();

    fireEvent.change(field, { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(client.signInWithPassword)
      .toHaveBeenCalledWith({ email: 'u@x.co', password: 'hunter2' }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
    expect(client.verifyEmailCode).not.toHaveBeenCalled();
  });

  test('a wrong password is one sentence, and the password is not left on screen', async () => {
    const client = fakeClient({
      signInWithPassword: vi.fn().mockRejectedValue(new Error("That email and password don't match.")),
    });
    render(<NativeSignIn client={client} />);
    typeEmail('u@x.co');
    fireEvent.click(screen.getByText('Use a password instead'));
    const field = document.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe("That email and password don't match.");
    expect(alert.textContent).not.toMatch(/wrong/);
    expect(document.querySelector('input[type="password"]')).toBeTruthy();   // stays on the password step
  });

  test('a network failure says so, and Enter submits the form', async () => {
    const client = fakeClient({
      signInWithPassword: vi.fn().mockRejectedValue(
        new Error("Couldn't reach Mumma. Check your connection and try again."),
      ),
    });
    render(<NativeSignIn client={client} />);
    typeEmail('u@x.co');
    fireEvent.click(screen.getByText('Use a password instead'));
    const field = document.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'pw' } });
    fireEvent.submit(field.closest('form')!);      // Enter in the field submits

    await waitFor(() => expect(client.signInWithPassword).toHaveBeenCalled());
    expect((await screen.findByRole('alert')).textContent).toMatch(/Check your connection/);
  });

  test('"Forgot password?" opens the web reset page externally, never inside the WebView', () => {
    const openExternal = vi.fn();
    render(<NativeSignIn client={fakeClient()} openExternal={openExternal} />);
    fireEvent.click(screen.getByText('Use a password instead'));
    fireEvent.click(screen.getByText('Forgot password?'));
    expect(openExternal).toHaveBeenCalledWith('https://auth.mumma.co/login');
  });

  test('"Use a code instead" goes back to the code flow', () => {
    render(<NativeSignIn client={fakeClient()} />);
    fireEvent.click(screen.getByText('Use a password instead'));
    expect(document.querySelector('input[type="password"]')).toBeTruthy();
    fireEvent.click(screen.getByText('Use a code instead'));
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.getByText('Send code')).toBeTruthy();
  });

  test('no account: the client error is shown', async () => {
    const client = fakeClient({
      requestEmailCode: vi.fn().mockRejectedValue(new Error('No Mumma account with that email. Sign up on the web first, then sign in here.')),
    });
    render(<NativeSignIn client={client} />);
    typeEmail('nobody@x.co');
    fireEvent.click(screen.getByText('Send code'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/No Mumma account/);
    expect(screen.getByPlaceholderText('you@example.com')).toBeTruthy();   // stays on step 1
  });

  test('a rejected code keeps the user on the code step with the message', async () => {
    const client = fakeClient({
      verifyEmailCode: vi.fn().mockRejectedValue(new Error("That code isn't right. Check it and try again.")),
    });
    render(<NativeSignIn client={client} />);
    typeEmail('u@x.co');
    fireEvent.click(screen.getByText('Send code'));
    const code = await screen.findByPlaceholderText('000000');
    fireEvent.change(code, { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/isn't right/));
    expect(screen.getByPlaceholderText('000000')).toBeTruthy();
  });

  test('the Apple button appears only when the client has an appleCredential', async () => {
    const { unmount } = render(<NativeSignIn client={fakeClient()} />);
    expect(screen.queryByText(/Sign in with Apple/)).toBeNull();
    unmount();

    const client = fakeClient({ canUseApple: true });
    const onSignedIn = vi.fn();
    render(<NativeSignIn client={client} onSignedIn={onSignedIn} />);
    fireEvent.click(screen.getByText(/Sign in with Apple/));
    await waitFor(() => expect(client.signInWithApple).toHaveBeenCalled());
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
  });

  test('sign-up is pointed at the web, and custom copy overrides the defaults', () => {
    render(<NativeSignIn client={fakeClient()} title="Welcome back" helpText="Codes land in seconds." />);
    expect(screen.getByText('Welcome back')).toBeTruthy();
    expect(screen.getByText('Codes land in seconds.')).toBeTruthy();
    expect(screen.getByText(/email on your Mumma account/)).toBeTruthy();
  });
});

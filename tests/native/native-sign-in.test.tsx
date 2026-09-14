import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { NativeSignIn } from '../../src/native/NativeSignIn';

function fakeClient(over: Record<string, unknown> = {}) {
  return {
    canUseApple: false,
    requestEmailCode: vi.fn().mockResolvedValue(undefined),
    verifyEmailCode: vi.fn().mockResolvedValue({ authenticated: true }),
    signInWithApple: vi.fn().mockResolvedValue({ authenticated: true }),
    ...over,
  } as any;
}

const typeEmail = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value } });

describe('NativeSignIn', () => {
  test('email → code → signed in, with no password field anywhere', async () => {
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

import { useState, type CSSProperties, type FormEvent } from 'react';
import { useOptionalAuth } from '../react/AuthProvider';
import { isAppleNotLinkedError, isNativeAuthClient, type NativeAuthClient } from './NativeAuthClient';

export interface NativeSignInProps {
  /** App name used in the default title/help copy, e.g. "Arcade". */
  appName?: string;
  /** Overrides the heading. */
  title?: string;
  /** Overrides the line under the heading. */
  helpText?: string;
  /** Called after the code (or password, or Apple) sign-in succeeds — route away from here. */
  onSignedIn?: () => void;
  /**
   * Where "Forgot password?" goes. Defaults to the client's auth origin +
   * `/login`, which is where the web keeps the reset button.
   */
  resetPasswordUrl?: string;
  /**
   * Opens an external URL. Natively the app's bootstrap already routes
   * `window.open` to the in-app browser (the shell imports no plugin itself),
   * so the default is enough; pass one to open the sheet directly.
   */
  openExternal?: (url: string) => void | Promise<void>;
  /**
   * The device client. Omit inside a `<MummaAuthProvider>` holding a
   * `NativeAuthClient` — it is read from context.
   */
  client?: NativeAuthClient;
}

/** No stylesheet ships with this package; theme via the CSS custom properties. */
const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex', flexDirection: 'column', gap: '1rem',
    maxWidth: '22rem', margin: '0 auto', padding: '1.5rem',
    boxSizing: 'border-box',
    fontFamily: 'var(--mumma-font, system-ui, sans-serif)',
    color: 'var(--mumma-fg, #111827)',
  },
  title: { margin: 0, fontSize: '1.375rem', fontWeight: 600 },
  help: { margin: 0, fontSize: '0.875rem', lineHeight: 1.45, color: 'var(--mumma-muted-fg, #6b7280)' },
  form: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  label: { display: 'flex', flexDirection: 'column', gap: '0.375rem', fontSize: '0.8125rem', fontWeight: 600 },
  input: {
    font: 'inherit', fontWeight: 400, padding: '0.75rem',
    borderRadius: 'var(--mumma-radius, 0.5rem)',
    border: '1px solid var(--mumma-border, #d1d5db)',
    background: 'var(--mumma-input-bg, #ffffff)',
    color: 'inherit', boxSizing: 'border-box', width: '100%',
  },
  code: { letterSpacing: '0.4em', textAlign: 'center', fontSize: '1.25rem' },
  // 16px floor: iOS zooms the page into any focused input below it.
  password: { fontSize: '16px' },
  primary: {
    font: 'inherit', fontWeight: 600, padding: '0.75rem 1rem', cursor: 'pointer',
    borderRadius: 'var(--mumma-radius, 0.5rem)', border: 'none',
    background: 'var(--mumma-accent, #1f2937)',
    color: 'var(--mumma-accent-fg, #f9fafb)',
  },
  apple: {
    font: 'inherit', fontWeight: 600, padding: '0.75rem 1rem', cursor: 'pointer',
    borderRadius: 'var(--mumma-radius, 0.5rem)',
    border: '1px solid var(--mumma-border, #d1d5db)',
    background: 'var(--mumma-surface, #ffffff)', color: 'inherit',
  },
  link: {
    font: 'inherit', padding: 0, border: 'none', background: 'none', cursor: 'pointer',
    color: 'var(--mumma-link, #2563eb)', textDecoration: 'underline', alignSelf: 'flex-start',
  },
  quiet: {
    font: 'inherit', fontSize: '0.8125rem', padding: 0, border: 'none', background: 'none',
    cursor: 'pointer', color: 'var(--mumma-muted-fg, #6b7280)', textDecoration: 'underline',
    alignSelf: 'flex-start',
  },
  error: { margin: 0, fontSize: '0.8125rem', color: 'var(--mumma-danger, #b91c1c)' },
  note: { margin: 0, fontSize: '0.75rem', lineHeight: 1.45, color: 'var(--mumma-muted-fg, #6b7280)' },
  divider: { display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--mumma-muted-fg, #6b7280)' },
  rule: { flex: 1, height: 1, background: 'var(--mumma-border, #d1d5db)' },
};

const DEFAULT_AUTH_ORIGIN = 'https://auth.mumma.co';

/**
 * The shared native sign-in screen: email one-time code by default, Sign in
 * with Apple when the app wired up a credential function, and — one quiet link
 * away — email + password for people who would rather type the password they
 * already use on the web.
 *
 * Sign in with Apple is prechecked against auth.mumma.co first: an Apple ID
 * that matches no account would otherwise mint a new, empty one, so the screen
 * says so and points at the web page that links it instead.
 *
 * The CODE stays the default on purpose: it is the screen Apple reviewed, it
 * works for every account, and it asks nobody to remember anything. The
 * password path is the secondary door, not the front one. Sign-UP still stays
 * on the web (`shouldCreateUser: false`), where household invitations and
 * billing live, so this screen never creates an account.
 */
export function NativeSignIn({
  appName, title, helpText, onSignedIn, resetPasswordUrl, openExternal, client,
}: NativeSignInProps) {
  const contextClient = useOptionalAuth()?.client;
  const native = client ?? (isNativeAuthClient(contextClient) ? contextClient : null);

  const [stage, setStage] = useState<'email' | 'code' | 'password'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [appleUnlinked, setAppleUnlinked] = useState<{ message: string; url: string } | null>(null);

  if (!native) {
    return (
      <div style={styles.wrap}>
        <p style={styles.error}>
          NativeSignIn needs a NativeAuthClient — pass one as the `client` prop or mount it
          on the surrounding MummaAuthProvider.
        </p>
      </div>
    );
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const sendCode = (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!address) { setError('Enter the email on your Mumma account.'); return; }
    void run(async () => {
      await native.requestEmailCode(address);
      setSentTo(address);
      setCode('');
      setStage('code');
    });
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    const digits = code.trim();
    if (digits.length < 6) { setError('Enter the 6-digit code from your email.'); return; }
    void run(async () => {
      await native.verifyEmailCode(sentTo ?? email.trim(), digits);
      onSignedIn?.();
    });
  };

  const signInWithPassword = (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!address) { setError('Enter the email on your Mumma account.'); return; }
    if (!password) { setError('Enter your password.'); return; }
    void run(async () => {
      await native.signInWithPassword({ email: address, password });
      setPassword('');
      onSignedIn?.();
    });
  };

  const apple = () => {
    setAppleUnlinked(null);
    void run(async () => {
      try {
        await native.signInWithApple();
      } catch (e) {
        // An Apple ID nobody has linked yet is not an error to apologise for:
        // it is a thing to do on the web, so it gets its own line and a link.
        if (isAppleNotLinkedError(e)) { setAppleUnlinked({ message: e.message, url: e.linkUrl }); return; }
        throw e;
      }
      onSignedIn?.();
    });
  };

  const toPassword = () => { setPassword(''); setError(null); setAppleUnlinked(null); setStage('password'); };
  const toCode = () => { setPassword(''); setError(null); setAppleUnlinked(null); setStage('email'); };

  const openUrl = (url: string) => {
    if (openExternal) { void openExternal(url); return; }
    // Native bootstrap hands this to the in-app browser; on the web it is a tab.
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
  };

  const forgot = () => {
    const base = (native.authBaseUrl || DEFAULT_AUTH_ORIGIN).replace(/\/+$/, '');
    openUrl(resetPasswordUrl ?? `${base}/login`);
  };

  const emailField = (
    <label style={styles.label}>
      Email
      <input
        style={styles.input}
        type="email"
        name="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect="off"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={busy}
      />
    </label>
  );

  return (
    <div style={styles.wrap}>
      <h1 style={styles.title}>{title ?? (appName ? `Sign in to ${appName}` : 'Sign in')}</h1>
      <p style={styles.help}>
        {helpText ?? 'We email you a 6-digit code — no password to remember.'}
      </p>

      {stage === 'email' ? (
        <form style={styles.form} onSubmit={sendCode}>
          {emailField}
          <button style={styles.primary} type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send code'}
          </button>
          <button style={styles.quiet} type="button" disabled={busy} onClick={toPassword}>
            Use a password instead
          </button>
        </form>
      ) : null}

      {stage === 'code' ? (
        <form style={styles.form} onSubmit={verify}>
          <label style={styles.label}>
            {`6-digit code sent to ${sentTo}`}
            <input
              style={{ ...styles.input, ...styles.code }}
              type="text"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              disabled={busy}
            />
          </label>
          <button style={styles.primary} type="submit" disabled={busy}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <button
            style={styles.link}
            type="button"
            disabled={busy}
            onClick={() => { setStage('email'); setCode(''); setError(null); }}
          >
            Use a different email
          </button>
          <button style={styles.quiet} type="button" disabled={busy} onClick={toPassword}>
            Use a password instead
          </button>
        </form>
      ) : null}

      {stage === 'password' ? (
        <form style={styles.form} onSubmit={signInWithPassword}>
          {emailField}
          <label style={styles.label}>
            Password
            <input
              style={{ ...styles.input, ...styles.password }}
              type="password"
              name="password"
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          <button style={styles.primary} type="submit" disabled={busy} aria-busy={busy}>
            Sign in
          </button>
          <button style={styles.link} type="button" disabled={busy} onClick={forgot}>
            Forgot password?
          </button>
          <button style={styles.quiet} type="button" disabled={busy} onClick={toCode}>
            Use a code instead
          </button>
        </form>
      ) : null}

      {error ? <p style={styles.error} role="alert">{error}</p> : null}

      {native.canUseApple ? (
        <>
          <div style={styles.divider}><span style={styles.rule} /> or <span style={styles.rule} /></div>
          <button style={styles.apple} type="button" onClick={apple} disabled={busy}>
             Sign in with Apple
          </button>
          {appleUnlinked ? (
            <>
              <p style={styles.error} role="alert">{appleUnlinked.message}</p>
              <button
                style={styles.link}
                type="button"
                disabled={busy}
                onClick={() => openUrl(appleUnlinked.url)}
              >
                Link your Apple ID on the web
              </button>
            </>
          ) : null}
        </>
      ) : null}

      <p style={styles.note}>
        New to Mumma? Accounts are created on the web at mumma.co — then sign in here with the
        email on your Mumma account. If you use Apple&apos;s Hide My Email, sign in with the code
        instead.
      </p>
    </div>
  );
}

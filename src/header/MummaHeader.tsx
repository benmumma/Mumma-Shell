import { useState, type CSSProperties, type ReactNode } from 'react';
import { useAuth } from '../react/AuthProvider';
import { resolveAuthBaseUrl } from '../auth/urls';

export interface MummaHeaderProps {
  appName: string;
  logoSrc?: string;
  /** URL of the family dashboard; omit to hide the back-to-family button */
  familyUrl?: string;
  /** Defaults to `${authBaseUrl}/manage-account` */
  accountUrl?: string;
  /** Extra content rendered right of the name (breadcrumbs, app nav) */
  children?: ReactNode;
}

const styles: Record<string, CSSProperties> = {
  bar: {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    padding: '0.5rem 1rem', minHeight: '3rem', boxSizing: 'border-box',
    background: 'var(--mumma-header-bg, #1f2937)',
    color: 'var(--mumma-header-fg, #f9fafb)',
    fontFamily: 'var(--mumma-font, system-ui, sans-serif)',
  },
  family: {
    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
    color: 'inherit', textDecoration: 'none', fontSize: '0.875rem', opacity: 0.85,
  },
  logo: { height: '1.75rem', width: 'auto', display: 'block' },
  name: { fontSize: '1.05rem', fontWeight: 600, marginRight: 'auto' },
  gear: {
    background: 'none', border: 'none', color: 'inherit', cursor: 'pointer',
    fontSize: '1.15rem', lineHeight: 1, padding: '0.35rem',
  },
  menu: {
    position: 'absolute', right: '0.75rem', top: '3rem', zIndex: 1000,
    display: 'flex', flexDirection: 'column', minWidth: '11rem',
    background: 'var(--mumma-menu-bg, #ffffff)', color: 'var(--mumma-menu-fg, #111827)',
    border: '1px solid var(--mumma-menu-border, #e5e7eb)', borderRadius: '0.5rem',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)', padding: '0.25rem', gap: '0.1rem',
  },
  item: {
    display: 'block', width: '100%', textAlign: 'left', background: 'none',
    border: 'none', color: 'inherit', textDecoration: 'none', cursor: 'pointer',
    padding: '0.5rem 0.75rem', fontSize: '0.9rem', borderRadius: '0.35rem', boxSizing: 'border-box',
  },
};

export function MummaHeader({ appName, logoSrc, familyUrl, accountUrl, children }: MummaHeaderProps) {
  const { signOut, user, client } = useAuth();
  const [open, setOpen] = useState(false);
  const account = accountUrl ?? `${(client as any).authBaseUrl ?? resolveAuthBaseUrl()}/manage-account`;

  return (
    <header style={{ ...styles.bar, position: 'relative' }}>
      {familyUrl && (
        <a href={familyUrl} style={styles.family} aria-label="Back to family">
          <span aria-hidden>←</span> Family
        </a>
      )}
      {logoSrc && <img src={logoSrc} alt={`${appName} logo`} style={styles.logo} />}
      <span style={styles.name}>{appName}</span>
      {children}
      <button type="button" aria-label="Settings" style={styles.gear} onClick={() => setOpen(o => !o)}>⚙</button>
      {open && (
        <nav style={styles.menu} aria-label="Settings menu">
          {user?.email && <span style={{ ...styles.item, opacity: 0.6, cursor: 'default' }}>{user.email}</span>}
          <a href={account} style={styles.item}>Account</a>
          <button type="button" style={styles.item} onClick={() => signOut()}>Sign out</button>
        </nav>
      )}
    </header>
  );
}

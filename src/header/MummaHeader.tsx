import { useState, type CSSProperties, type ReactNode } from 'react';
import { useAuth } from '../react/AuthProvider';
import { resolveAuthBaseUrl } from '../auth/urls';

export interface MummaHeaderProps {
  appName: string;
  logoSrc?: string;
  /** URL of the family dashboard; omit to hide the family icon */
  familyUrl?: string;
  /** Defaults to `${authBaseUrl}/manage-account` */
  accountUrl?: string;
  /** Content rendered after the app name (breadcrumbs, app nav) */
  children?: ReactNode;
  /** App-specific controls rendered on the right, before the family and gear icons */
  actions?: ReactNode;
  /** Extra entries at the top of the gear menu — use MummaMenuItem for consistent styling */
  menuItems?: ReactNode;
}

const styles: Record<string, CSSProperties> = {
  bar: {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    padding: '0.5rem 1rem', minHeight: '3rem', boxSizing: 'border-box',
    background: 'var(--mumma-header-bg, #1f2937)',
    color: 'var(--mumma-header-fg, #f9fafb)',
    fontFamily: 'var(--mumma-font, system-ui, sans-serif)',
  },
  logo: { height: '1.75rem', width: 'auto', display: 'block' },
  name: { fontSize: '1.05rem', fontWeight: 600, marginRight: 'auto' },
  actions: { display: 'inline-flex', alignItems: 'center', gap: '0.5rem' },
  iconBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'none', border: 'none', color: 'inherit', cursor: 'pointer',
    fontSize: '1.15rem', lineHeight: 1, padding: '0.35rem', textDecoration: 'none',
    borderRadius: '0.35rem',
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

/**
 * Gear-menu entry with the header's styling. Renders a link when `href` is
 * given, otherwise a button. Apps use this to add entries via `menuItems`.
 */
export function MummaMenuItem({ href, onClick, children }: {
  href?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  if (href) return <a href={href} style={styles.item}>{children}</a>;
  return <button type="button" style={styles.item} onClick={onClick}>{children}</button>;
}

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}

export function MummaHeader({ appName, logoSrc, familyUrl, accountUrl, children, actions, menuItems }: MummaHeaderProps) {
  const { signOut, user, client } = useAuth();
  const [open, setOpen] = useState(false);
  const account = accountUrl ?? `${client.authBaseUrl ?? resolveAuthBaseUrl()}/manage-account`;

  return (
    <header style={{ ...styles.bar, position: 'relative' }}>
      {logoSrc && <img src={logoSrc} alt={`${appName} logo`} style={styles.logo} />}
      <span style={styles.name}>{appName}</span>
      {children}
      {actions && <span style={styles.actions}>{actions}</span>}
      {familyUrl && (
        <a href={familyUrl} style={styles.iconBtn} aria-label="Back to family" title="Family">
          <HomeIcon />
        </a>
      )}
      <button type="button" aria-label="Settings" style={styles.iconBtn} onClick={() => setOpen(o => !o)}>⚙</button>
      {open && (
        <nav style={styles.menu} aria-label="Settings menu">
          {user?.email && <span style={{ ...styles.item, opacity: 0.6, cursor: 'default' }}>{user.email}</span>}
          {menuItems}
          <MummaMenuItem href={account}>Account</MummaMenuItem>
          <MummaMenuItem onClick={() => signOut()}>Sign out</MummaMenuItem>
        </nav>
      )}
    </header>
  );
}

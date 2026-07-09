import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useAuth } from '../react/AuthProvider';
import { resolveAuthBaseUrl } from '../auth/urls';
import { MUMMA_APPS, MUMMA_LABS_ICON, type MummaApp } from './apps';

export interface MummaHeaderProps {
  appName: string;
  /** Registry key of the current app — highlights it in the switcher and picks its icon */
  appKey?: string;
  logoSrc?: string;
  /** Apps shown in the switcher; defaults to the built-in MUMMA_APPS registry */
  apps?: MummaApp[];
  /** Set false to render the app name as a plain title instead of a switcher */
  appSwitcher?: boolean;
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
    padding: '0.5rem 1rem', minHeight: '3.5rem', boxSizing: 'border-box',
    background: 'var(--mumma-header-bg, #1f2937)',
    color: 'var(--mumma-header-fg, #f9fafb)',
    fontFamily: 'var(--mumma-font, system-ui, sans-serif)',
  },
  logo: { height: '2rem', width: '2rem', objectFit: 'contain', display: 'block', borderRadius: '0.35rem' },
  name: { fontSize: '1.05rem', fontWeight: 600, marginRight: 'auto' },
  switcherTrigger: {
    display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginRight: 'auto',
    background: 'none', border: 'none', color: 'inherit', cursor: 'pointer',
    fontSize: '1.05rem', fontWeight: 600, fontFamily: 'inherit',
    padding: '0.25rem 0.4rem', borderRadius: '0.35rem',
  },
  // Right-side cluster (actions + family + gear): one uniform gap, and every
  // icon button is a fixed 2rem square so distribution stays even regardless
  // of glyph aspect ratio or how consumers size their injected buttons.
  right: { display: 'inline-flex', alignItems: 'center', gap: '0.25rem' },
  actions: { display: 'inline-flex', alignItems: 'center', gap: '0.25rem' },
  iconBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: '2rem', height: '2rem', padding: 0, flex: 'none',
    background: 'none', border: 'none', color: 'inherit', cursor: 'pointer',
    fontSize: '1.15rem', lineHeight: 1, textDecoration: 'none',
    borderRadius: '0.35rem',
  },
  menu: {
    position: 'absolute', top: '3.5rem', zIndex: 1000,
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
  appRow: {
    display: 'flex', alignItems: 'center', gap: '0.6rem',
    padding: '0.45rem 0.75rem', fontSize: '0.9rem', borderRadius: '0.35rem',
    color: 'inherit', textDecoration: 'none', boxSizing: 'border-box',
  },
  appRowCurrent: {
    background: 'var(--mumma-menu-active-bg, #f3f4f6)', fontWeight: 600,
  },
  appIcon: { height: '1.5rem', width: '1.5rem', objectFit: 'contain', borderRadius: '0.3rem', flex: 'none' },
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

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
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

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden
      style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden
      style={{ marginLeft: 'auto', flex: 'none' }}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** Image that swaps to the Mumma Labs mark if its source fails to load. */
function AppIcon({ src, alt, style }: { src: string; alt: string; style: CSSProperties }) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      src={failed ? MUMMA_LABS_ICON : src}
      alt={alt}
      style={style}
      onError={() => { if (!failed) setFailed(true); }}
    />
  );
}

export function MummaHeader({
  appName, appKey, logoSrc, apps = MUMMA_APPS, appSwitcher = true,
  familyUrl, accountUrl, children, actions, menuItems,
}: MummaHeaderProps) {
  const { signOut, user, client } = useAuth();
  const [gearOpen, setGearOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const account = accountUrl ?? `${client.authBaseUrl ?? resolveAuthBaseUrl()}/manage-account`;

  const currentApp = apps.find(a => appKey ? a.key === appKey : a.name.toLowerCase() === appName.toLowerCase());
  const iconSrc = logoSrc ?? currentApp?.iconSrc ?? MUMMA_LABS_ICON;

  const anyOpen = gearOpen || switcherOpen;
  useEffect(() => {
    if (!anyOpen) return;
    const closeAll = () => { setGearOpen(false); setSwitcherOpen(false); };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAll(); };
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) closeAll();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [anyOpen]);

  return (
    <header ref={rootRef} style={{ ...styles.bar, position: 'relative' }}>
      <AppIcon src={iconSrc} alt={`${appName} logo`} style={styles.logo} />
      {appSwitcher ? (
        <button
          type="button"
          style={styles.switcherTrigger}
          aria-haspopup="menu"
          aria-expanded={switcherOpen}
          onClick={() => { setSwitcherOpen(o => !o); setGearOpen(false); }}
        >
          {appName}
          <ChevronIcon open={switcherOpen} />
        </button>
      ) : (
        <span style={styles.name}>{appName}</span>
      )}
      {children}
      <span style={styles.right}>
        {actions && <span style={styles.actions}>{actions}</span>}
        {familyUrl && (
          <a href={familyUrl} style={styles.iconBtn} aria-label="Back to family" title="Family">
            <HomeIcon />
          </a>
        )}
        <button type="button" aria-label="Settings" style={styles.iconBtn}
          onClick={() => { setGearOpen(o => !o); setSwitcherOpen(false); }}><GearIcon /></button>
      </span>
      {switcherOpen && (
        <nav style={{ ...styles.menu, left: '0.75rem' }} aria-label="Switch app">
          {apps.map(app => {
            const isCurrent = app.key === currentApp?.key;
            return (
              <a key={app.key} href={app.url} aria-current={isCurrent ? 'true' : undefined}
                style={{ ...styles.appRow, ...(isCurrent ? styles.appRowCurrent : undefined) }}>
                <AppIcon src={app.iconSrc} alt={app.name} style={styles.appIcon} />
                {app.name}
                {isCurrent && <CheckIcon />}
              </a>
            );
          })}
        </nav>
      )}
      {gearOpen && (
        <nav style={{ ...styles.menu, right: '0.75rem' }} aria-label="Settings menu">
          {user?.email && <span style={{ ...styles.item, opacity: 0.6, cursor: 'default' }}>{user.email}</span>}
          {menuItems}
          <MummaMenuItem href={account}>Account</MummaMenuItem>
          <MummaMenuItem onClick={() => signOut()}>Sign out</MummaMenuItem>
        </nav>
      )}
    </header>
  );
}

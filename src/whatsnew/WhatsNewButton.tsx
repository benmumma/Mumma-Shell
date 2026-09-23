import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { useReleaseNotes } from './useReleaseNotes';
import { WhatsNewPanel } from './WhatsNewPanel';
import { useWhatsNewPalette, wnVar, WN_FONT, WN_RADIUS } from './theme';

export interface WhatsNewTriggerProps {
  /** Opens the dialog. */
  open: () => void;
  isOpen: boolean;
  unread: number;
  label: string;
  loading: boolean;
}

export interface WhatsNewButtonProps {
  /** Origin that serves `/api/v1/releases` (trailing slash fine). */
  baseUrl: string;
  /** `MUMMA_APPS` key of this app. */
  app: string;
  /** Button label and dialog title. Defaults to "What's new". */
  label?: string;
  /** Routes relative links in an SPA; the dialog closes first. */
  onNavigate?: (path: string) => void;
  /** `icon` (default): a header-sized icon with an unread dot. `text`: the label with an unread count. */
  variant?: 'icon' | 'text';
  limit?: number;
  includeSuite?: boolean;
  /** Supply your own trigger; the standard panel and dialog are kept. */
  renderTrigger?: (props: WhatsNewTriggerProps) => ReactNode;
  /** Controlled open state (e.g. opened from a menu item). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** BCP 47 locale for dates. */
  locale?: string;
}

let dialogSeq = 0;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function SparkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

const triggerStyles: Record<string, CSSProperties> = {
  // Same 2rem square as MummaHeader's icon buttons, so it sits in the
  // header's right cluster without shifting anything.
  icon: {
    position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: '2rem', height: '2rem', padding: 0, flex: 'none',
    background: 'none', border: 'none', color: 'inherit', cursor: 'pointer',
    fontSize: '1.15rem', lineHeight: 1, borderRadius: '0.35rem',
  },
  dot: {
    position: 'absolute', top: '0.3rem', right: '0.3rem', width: '0.5rem', height: '0.5rem',
    borderRadius: '50%', background: 'var(--mumma-wn-dot, var(--mumma-wn-accent, #ef4444))', pointerEvents: 'none',
  },
  text: {
    display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flex: 'none',
    padding: '0.3rem 0.6rem', font: 'inherit', fontSize: '0.875rem', fontWeight: 600,
    background: 'none', color: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
    border: '1px solid currentColor', borderRadius: 'var(--mumma-wn-radius, 0.35rem)',
  },
  count: {
    display: 'inline-block', minWidth: '1.1rem', padding: '0.1rem 0.3rem', boxSizing: 'border-box',
    borderRadius: '999px', fontSize: '0.6875rem', lineHeight: 1.2, textAlign: 'center',
    background: 'var(--mumma-wn-dot, var(--mumma-wn-accent, #ef4444))', color: '#ffffff',
  },
};

interface DialogProps {
  title: string;
  onClose: () => void;
  /** Where focus goes on close when the element focused at open time is gone (e.g. a closed menu's item). */
  fallbackFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/**
 * Accessible modal: labelled, focus trapped, Esc and backdrop close, page
 * scroll locked, focus returned on close. Rendered as a fixed overlay (no
 * portal, so no react-dom dependency) — an ancestor with `transform`,
 * `filter` or `backdrop-filter` would become its containing block.
 */
function WhatsNewDialog({ title, onClose, fallbackFocus, children }: DialogProps) {
  const palette = useWhatsNewPalette();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [titleId] = useState(() => `mumma-wn-title-${++dialogSeq}`);
  const [returnTo] = useState<HTMLElement | null>(() =>
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null);

  useEffect(() => {
    closeRef.current?.focus();
    const body = document.body;
    const prevOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) { e.preventDefault(); dialogRef.current.focus(); return; }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && dialogRef.current.contains(active);
      if (e.shiftKey && (!inside || active === first || active === dialogRef.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (!inside || active === last)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      body.style.overflow = prevOverflow;
      const target = returnTo && returnTo.isConnected && returnTo !== body ? returnTo : fallbackFocus?.current;
      target?.focus?.();
    };
    // Mount-only: the dialog lives exactly as long as it is open.
  }, []);

  const border = wnVar('border', palette.border);
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0.5rem', boxSizing: 'border-box', background: 'rgba(0, 0, 0, 0.5)',
      }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCloseRef.current(); }}
      data-mumma-wn-backdrop=""
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '28rem', maxHeight: '85vh',
          boxSizing: 'border-box', overflow: 'hidden', outline: 'none',
          background: wnVar('bg', palette.bg), color: wnVar('fg', palette.fg),
          border: `1px solid ${border}`, borderRadius: WN_RADIUS,
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.3)', fontFamily: WN_FONT,
          fontSize: '1rem', fontWeight: 400, lineHeight: 1.5, textAlign: 'left',
          textTransform: 'none', letterSpacing: 'normal',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 'none',
          padding: '0.75rem 0.75rem 0.75rem 1rem', borderBottom: `1px solid ${border}`,
        }}>
          <h2 id={titleId} style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 600, marginRight: 'auto' }}>{title}</h2>
          <button ref={closeRef} type="button" aria-label="Close" onClick={() => onCloseRef.current()}
            style={{ ...triggerStyles.icon, position: 'static' }}>
            <CloseIcon />
          </button>
        </div>
        <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: '1rem', flex: '1 1 auto', minHeight: 0 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * A compact header-sized "What's new" trigger with an unread indicator that
 * opens the release notes in a modal dialog. Opening marks everything as seen.
 */
export function WhatsNewButton({
  baseUrl, app, label = "What's new", onNavigate, variant = 'icon', limit, includeSuite,
  renderTrigger, open: openProp, onOpenChange, locale,
}: WhatsNewButtonProps) {
  const notes = useReleaseNotes({ baseUrl, app, limit, includeSuite });
  const [openState, setOpenState] = useState(false);
  const controlled = openProp !== undefined;
  const isOpen = controlled ? !!openProp : openState;
  const triggerRef = useRef<HTMLButtonElement>(null);

  const setOpen = (next: boolean) => {
    if (!controlled) setOpenState(next);
    onOpenChange?.(next);
  };

  // Opening marks everything seen — including notes that arrive while open.
  const { markAllSeen, entries } = notes;
  useEffect(() => {
    if (isOpen && entries.length > 0) markAllSeen();
  }, [isOpen, entries, markAllSeen]);

  const navigate = onNavigate
    ? (path: string) => { setOpen(false); onNavigate(path); }
    : undefined;

  const unread = notes.unread;
  const accessibleName = unread > 0 ? `${label} (${unread} new)` : label;

  let trigger: ReactNode;
  if (renderTrigger) {
    trigger = renderTrigger({ open: () => setOpen(true), isOpen, unread, label, loading: notes.loading });
  } else if (variant === 'text') {
    trigger = (
      <button ref={triggerRef} type="button" style={triggerStyles.text} aria-label={accessibleName}
        aria-haspopup="dialog" aria-expanded={isOpen} onClick={() => setOpen(true)}>
        {label}
        {unread > 0 && <span style={triggerStyles.count} aria-hidden>{unread > 9 ? '9+' : unread}</span>}
      </button>
    );
  } else {
    trigger = (
      <button ref={triggerRef} type="button" style={triggerStyles.icon} aria-label={accessibleName} title={label}
        aria-haspopup="dialog" aria-expanded={isOpen} onClick={() => setOpen(true)}>
        <SparkIcon />
        {unread > 0 && <span style={triggerStyles.dot} data-testid="whatsnew-unread-dot" aria-hidden />}
      </button>
    );
  }

  return (
    <>
      {trigger}
      {isOpen && (
        <WhatsNewDialog title={label} onClose={() => setOpen(false)} fallbackFocus={triggerRef}>
          <WhatsNewPanel
            entries={notes.entries}
            loading={notes.loading}
            error={notes.error}
            hasMore={notes.hasMore}
            loadingMore={notes.loadingMore}
            onLoadMore={() => { void notes.loadMore(); }}
            onRetry={() => { void notes.refresh(); }}
            onNavigate={navigate}
            locale={locale}
          />
        </WhatsNewDialog>
      )}
    </>
  );
}

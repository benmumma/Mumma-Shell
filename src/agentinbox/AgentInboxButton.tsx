import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { useAgentInbox, useAgentInboxApi, useAgentInboxes } from './hooks';
import { badgeCount } from './logic';
import { AgentInboxPanel } from './AgentInboxPanel';
import { useInboxColors, AI_FONT, TOUCH } from './theme';
import type { InboxSummary } from './types';

export interface AgentInboxTriggerProps {
  open: () => void;
  isOpen: boolean;
  /** Open questions (or unseen, per inbox) across the inboxes shown. */
  badge: number;
  label: string;
  inboxes: InboxSummary[];
}

export interface AgentInboxButtonProps {
  /** Origin that serves `/api/v1` (Mumapps-Server). */
  baseUrl: string;
  /** The signed-in member's bearer token (the shell's `getAccessToken`), or null. */
  getToken: () => string | null | Promise<string | null>;
  /** This app's key: only inboxes whose profile lists it are shown. Null shows every inbox (Dekko, Forward). */
  app: string | null;
  /** Show only this agent's inbox (Fitter pins Coach). */
  instanceId?: string;
  /** The active member on a shared device. */
  memberId?: string | null;
  /** Button label and drawer title. Defaults to the agent's name with one inbox, else "Agents". */
  label?: string;
  /** Routes in-app links in an SPA; the drawer closes first. */
  onNavigate?: (path: string) => void;
  renderTrigger?: (props: AgentInboxTriggerProps) => ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  locale?: string;
  /** Re-read interval for the badge; 0 turns polling off (focus still refreshes). */
  pollMs?: number;
  /** Tests inject one. */
  fetchImpl?: typeof fetch;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let drawerSeq = 0;

function InboxIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

const iconButton: CSSProperties = {
  position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: '2rem', height: '2rem', padding: 0, flex: 'none', background: 'none', border: 'none',
  color: 'inherit', cursor: 'pointer', fontSize: '1.15rem', lineHeight: 1, borderRadius: '0.35rem',
};

const countStyle: CSSProperties = {
  position: 'absolute', top: '-0.1rem', right: '-0.2rem', minWidth: '1rem', padding: '0 0.25rem',
  boxSizing: 'border-box', borderRadius: '999px', fontSize: '0.625rem', lineHeight: '1rem', fontWeight: 700,
  textAlign: 'center', pointerEvents: 'none',
  background: 'var(--mumma-ai-dot, var(--mumma-wn-dot, #ef4444))', color: '#ffffff',
};

/**
 * A right-side drawer: labelled, focus trapped, Esc and backdrop close, page
 * scroll locked, focus returned on close. Full width on a phone. A fixed
 * overlay without a portal (no react-dom dependency), like What's New.
 */
function InboxDrawer({ title, onClose, fallbackFocus, header, children }: {
  title: string; onClose: () => void; fallbackFocus?: RefObject<HTMLElement | null>; header?: ReactNode; children: ReactNode;
}) {
  const c = useInboxColors();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [titleId] = useState(() => `mumma-ai-title-${++drawerSeq}`);
  const [returnTo] = useState<HTMLElement | null>(() =>
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null);

  useEffect(() => {
    closeRef.current?.focus();
    const body = document.body;
    const prev = body.style.overflow;
    body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const nodes = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!nodes.length) { e.preventDefault(); ref.current.focus(); return; }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && ref.current.contains(active);
      if (e.shiftKey && (!inside || active === first || active === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (!inside || active === last)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      body.style.overflow = prev;
      const target = returnTo && returnTo.isConnected && returnTo !== body ? returnTo : fallbackFocus?.current;
      target?.focus?.();
    };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0, 0, 0, 0.45)', display: 'flex', justifyContent: 'flex-end' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCloseRef.current(); }} data-mumma-ai-backdrop="">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        style={{
          display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '28rem', height: '100%',
          boxSizing: 'border-box', outline: 'none', background: c.bg, color: c.fg, fontFamily: AI_FONT,
          borderLeft: `1px solid ${c.border}`, boxShadow: '-12px 0 32px rgba(0, 0, 0, 0.25)',
          textAlign: 'left', textTransform: 'none', letterSpacing: 'normal', fontWeight: 400,
          paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 0.75rem 0.75rem 1rem', borderBottom: `1px solid ${c.border}`, flex: 'none' }}>
          <h2 id={titleId} style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 600, marginRight: 'auto' }}>{title}</h2>
          <button ref={closeRef} type="button" aria-label="Close" onClick={() => onCloseRef.current()}
            style={{ ...iconButton, ...TOUCH, width: '2.75rem' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {header}
        <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: '1rem', flex: '1 1 auto', minHeight: 0 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** The drawer's body for one inbox; marks it seen once it has loaded. */
function OpenInbox({ api, summary, onChange, onNavigate, locale }: {
  api: ReturnType<typeof useAgentInboxApi>; summary: InboxSummary; onChange: () => void;
  onNavigate?: (p: string) => void; locale?: string;
}) {
  const ref = useMemo(() => ({ householdId: summary.household_id, instanceId: summary.instance_id }),
    [summary.household_id, summary.instance_id]);
  const inbox = useAgentInbox(api, ref, { onChange });
  const loaded = Boolean(inbox.page);
  const { markAllSeen } = inbox;
  useEffect(() => { if (loaded) markAllSeen(); }, [loaded, markAllSeen]);
  return <AgentInboxPanel inbox={inbox} onNavigate={onNavigate} locale={locale} />;
}

/**
 * The header entry to the member's agent inboxes: an icon with a count of what
 * needs them, opening a side drawer. Renders nothing while the member has no
 * inbox in this app, so every app can mount it unconditionally.
 */
export function AgentInboxButton({
  baseUrl, getToken, app, instanceId, memberId = null, label, onNavigate, renderTrigger,
  open: openProp, onOpenChange, locale, pollMs, fetchImpl,
}: AgentInboxButtonProps) {
  const api = useAgentInboxApi({ baseUrl, getToken, memberId, fetchImpl });
  const { inboxes, refresh } = useAgentInboxes(api, app, { pollMs });
  const c = useInboxColors();
  const shown = useMemo(
    () => (inboxes ?? []).filter(i => !instanceId || i.instance_id === instanceId),
    [inboxes, instanceId],
  );
  const [openState, setOpenState] = useState(false);
  const controlled = openProp !== undefined;
  const isOpen = controlled ? !!openProp : openState;
  const setOpen = (next: boolean) => { if (!controlled) setOpenState(next); onOpenChange?.(next); };
  const [selected, setSelected] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const current = shown.find(i => i.instance_id === selected) ?? shown[0] ?? null;
  const badge = shown.reduce((n, s) => n + badgeCount(s), 0);
  const title = label ?? (shown.length === 1 ? shown[0].name : 'Agents');

  if (shown.length === 0) return null;

  const navigate = onNavigate ? (path: string) => { setOpen(false); onNavigate(path); } : undefined;
  const accessibleName = badge > 0 ? `${title} (${badge} need${badge === 1 ? 's' : ''} you)` : title;

  const trigger = renderTrigger
    ? renderTrigger({ open: () => setOpen(true), isOpen, badge, label: title, inboxes: shown })
    : (
      <button ref={triggerRef} type="button" style={iconButton} aria-label={accessibleName} title={title}
        aria-haspopup="dialog" aria-expanded={isOpen} onClick={() => setOpen(true)}>
        <InboxIcon />
        {badge > 0 && <span style={countStyle} data-testid="agentinbox-badge" aria-hidden>{badge > 9 ? '9+' : badge}</span>}
      </button>
    );

  const tabs = shown.length > 1 ? (
    <div role="tablist" aria-label="Agents" style={{ display: 'flex', gap: '0.25rem', overflowX: 'auto', padding: '0.5rem 0.75rem', borderBottom: `1px solid ${c.border}`, flex: 'none' }}>
      {shown.map(s => {
        const on = current?.instance_id === s.instance_id;
        const n = badgeCount(s);
        return (
          <button key={s.instance_id} role="tab" type="button" aria-selected={on}
            onClick={() => setSelected(s.instance_id)}
            style={{
              ...TOUCH, padding: '0.375rem 0.75rem', font: 'inherit', fontWeight: on ? 700 : 500, cursor: 'pointer',
              whiteSpace: 'nowrap', color: c.fg, background: on ? c.surface : 'transparent',
              border: `1px solid ${on ? c.border : 'transparent'}`, borderRadius: '999px',
            }}>
            {s.name}{n > 0 ? ` · ${n}` : ''}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <>
      {trigger}
      {isOpen && current && (
        <InboxDrawer title={shown.length > 1 ? title : current.name} onClose={() => setOpen(false)} fallbackFocus={triggerRef} header={tabs}>
          <OpenInbox key={current.instance_id} api={api} summary={current} onChange={() => { void refresh(); }}
            onNavigate={navigate} locale={locale} />
        </InboxDrawer>
      )}
    </>
  );
}

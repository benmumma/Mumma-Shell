import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useAgentInboxApi, useAgentInboxes } from './hooks';
import { badgeCount } from './logic';
import { InboxDrawer, InboxIcon, InboxTabs, OpenInbox, countStyle } from './AgentInboxButton';
import { useInboxColors, AI_FONT, TOUCH } from './theme';

/** The width at which the dock becomes a sidebar. Below it, a bubble opens the drawer. */
export const DOCK_BREAKPOINT_PX = 1200;
/** The sidebar's width; apps can override with `--mumma-ai-dock-width`. */
export const DOCK_WIDTH = 'var(--mumma-ai-dock-width, 22rem)';
/** How narrow the member can drag the sidebar (px). */
export const DOCK_MIN_PX = 288;
/** How wide (px); it also always leaves the app at least DOCK_APP_MIN_PX. */
export const DOCK_MAX_PX = 720;
const DOCK_APP_MIN_PX = 480;
const DOCK_STEP_PX = 16;

export interface AgentInboxDockProps {
  /** Origin that serves `/api/v1` (Mumapps-Server). */
  baseUrl: string;
  getToken: () => string | null | Promise<string | null>;
  /** This app's key: only inboxes whose profile lists it. Null shows every inbox (Dekko, Forward). */
  app: string | null;
  /** Show only this agent's inbox. */
  instanceId?: string;
  /** The active member on a shared device. */
  memberId?: string | null;
  /** Sidebar title with several agents. Defaults to the agent's name with one, else "Agents". */
  label?: string;
  onNavigate?: (path: string) => void;
  /** Min viewport width (px) for the sidebar. Default 1200. */
  breakpoint?: number;
  /**
   * Make room for the open sidebar by padding the page (`body`) on the right,
   * so it sits beside the app instead of over it. Default true; an app with
   * its own layout reads `--mumma-ai-dock-reserved` (the width, or 0px).
   */
  reserveSpace?: boolean;
  /** Where the collapsed state (and `<key>:width`, the dragged width) is remembered. Defaults per app key. */
  storageKey?: string;
  locale?: string;
  pollMs?: number;
  fetchImpl?: typeof fetch;
}

function readCollapsed(key: string): boolean {
  try { return window.localStorage.getItem(key) === '1'; } catch { return false; }
}

function writeCollapsed(key: string, collapsed: boolean) {
  try {
    if (collapsed) window.localStorage.setItem(key, '1');
    else window.localStorage.removeItem(key);
  } catch { /* private mode: it just forgets */ }
}

function readWidth(key: string): number | null {
  try {
    const n = Number(window.localStorage.getItem(`${key}:width`));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}

function writeWidth(key: string, px: number | null) {
  try {
    if (px) window.localStorage.setItem(`${key}:width`, String(Math.round(px)));
    else window.localStorage.removeItem(`${key}:width`);
  } catch { /* private mode: it just forgets */ }
}

/** The widest the sidebar may be on this screen. */
function maxWidth(): number {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
  return Math.max(DOCK_MIN_PX, Math.min(DOCK_MAX_PX, vw ? vw - DOCK_APP_MIN_PX : DOCK_MAX_PX));
}

export function clampDockWidth(px: number): number {
  return Math.round(Math.min(maxWidth(), Math.max(DOCK_MIN_PX, px)));
}

/**
 * The sidebar's left edge: drag it, or focus it and use the arrow keys (Home
 * and End for narrowest and widest). A double-click puts back the app's
 * default width.
 */
function ResizeHandle({ width, onResize, onCommit, onReset, color }: {
  width: number; onResize: (px: number) => void; onCommit: (px: number) => void; onReset: () => void; color: string;
}) {
  const [active, setActive] = useState(false);
  const last = useRef(width);
  last.current = width;
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    try { el.setPointerCapture(e.pointerId); } catch { /* jsdom */ }
    setActive(true);
    const prevSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    const move = (ev: PointerEvent) => { onResize(clampDockWidth(window.innerWidth - ev.clientX)); };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      document.body.style.userSelect = prevSelect;
      setActive(false);
      onCommit(last.current);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const next = e.key === 'ArrowLeft' ? width + DOCK_STEP_PX
      : e.key === 'ArrowRight' ? width - DOCK_STEP_PX
        : e.key === 'Home' ? DOCK_MIN_PX
          : e.key === 'End' ? maxWidth() : null;
    if (next === null) return;
    e.preventDefault();
    const px = clampDockWidth(next);
    onResize(px);
    onCommit(px);
  };
  return (
    <div role="separator" aria-orientation="vertical" aria-label="Resize the sidebar" tabIndex={0}
      aria-valuemin={DOCK_MIN_PX} aria-valuemax={maxWidth()} aria-valuenow={Math.round(width)}
      title="Drag to resize. Double-click for the default width."
      onPointerDown={onPointerDown} onKeyDown={onKeyDown} onDoubleClick={onReset}
      onFocus={() => setActive(true)} onBlur={() => setActive(false)}
      onMouseEnter={() => setActive(true)} onMouseLeave={e => { if (e.buttons === 0 && document.activeElement !== e.currentTarget) setActive(false); }}
      style={{
        position: 'absolute', top: 0, bottom: 0, left: '-0.375rem', width: '0.75rem', zIndex: 1,
        cursor: 'col-resize', touchAction: 'none', outline: 'none',
        display: 'flex', justifyContent: 'center',
      }}>
      <span aria-hidden style={{ width: '2px', height: '100%', background: active ? color : 'transparent', transition: 'background 120ms' }} />
    </div>
  );
}

function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`;
  const read = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [wide, setWide] = useState(read);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    let mql: MediaQueryList;
    try { mql = window.matchMedia(query); } catch { return; }
    const on = () => setWide(mql.matches);
    on();
    mql.addEventListener?.('change', on);
    return () => mql.removeEventListener?.('change', on);
  }, [query]);
  return wide;
}

function CollapseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m13 17 5-5-5-5" /><path d="m6 17 5-5-5-5" />
    </svg>
  );
}

/**
 * The agent inboxes as a primary surface rather than a header icon. On a wide
 * screen it is a sidebar that opens by itself and makes room for itself; the
 * member can shrink it to a bubble in the bottom-right corner, and that choice
 * is remembered. On a narrow screen it is the bubble, which opens the same
 * drawer as the header button. Renders nothing while the member has no inbox
 * in this app, so every app can mount it unconditionally.
 */
export function AgentInboxDock({
  baseUrl, getToken, app, instanceId, memberId = null, label, onNavigate, breakpoint = DOCK_BREAKPOINT_PX,
  reserveSpace = true, storageKey, locale, pollMs, fetchImpl,
}: AgentInboxDockProps) {
  const api = useAgentInboxApi({ baseUrl, getToken, memberId, fetchImpl });
  const { inboxes, refresh } = useAgentInboxes(api, app, { pollMs });
  const c = useInboxColors();
  const wide = useMinWidth(breakpoint);
  const key = storageKey ?? `mumma-ai-dock:${app ?? 'all'}`;
  const [collapsed, setCollapsedState] = useState(() => readCollapsed(key));
  const [widthPx, setWidthPx] = useState<number | null>(() => readWidth(key));
  const asideRef = useRef<HTMLElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const bubbleRef = useRef<HTMLButtonElement>(null);

  const shown = useMemo(
    () => (inboxes ?? []).filter(i => !instanceId || i.instance_id === instanceId),
    [inboxes, instanceId],
  );
  const current = shown.find(i => i.instance_id === selected) ?? shown[0] ?? null;
  const badge = shown.reduce((n, s) => n + badgeCount(s), 0);
  const title = label ?? (shown.length === 1 ? shown[0].name : 'Agents');
  const docked = wide && !collapsed && shown.length > 0;

  const setCollapsed = (next: boolean) => { setCollapsedState(next); writeCollapsed(key, next); };
  // A dragged width is the member's; without one the app's default stands.
  const dockWidth = widthPx ? `${clampDockWidth(widthPx)}px` : DOCK_WIDTH;

  // The open sidebar takes its width from the page rather than covering it.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.setProperty('--mumma-ai-dock-reserved', docked ? dockWidth : '0px');
    if (!docked || !reserveSpace) return () => { root.style.removeProperty('--mumma-ai-dock-reserved'); };
    const body = document.body;
    const prev = body.style.paddingRight;
    body.style.paddingRight = dockWidth;
    return () => { body.style.paddingRight = prev; root.style.removeProperty('--mumma-ai-dock-reserved'); };
  }, [docked, reserveSpace, dockWidth]);

  // Growing past the breakpoint with the drawer open hands it to the sidebar.
  useEffect(() => { if (docked) setDrawerOpen(false); }, [docked]);

  if (shown.length === 0 || !current) return null;

  const navigate = onNavigate ? (path: string) => { setDrawerOpen(false); onNavigate(path); } : undefined;
  const accessibleName = badge > 0 ? `${title} (${badge} need${badge === 1 ? 's' : ''} you)` : title;
  const tabs = <InboxTabs inboxes={shown} current={current} onSelect={setSelected} />;
  const body = (
    <OpenInbox key={current.instance_id} api={api} summary={current} onChange={() => { void refresh(); }}
      onNavigate={navigate} locale={locale} />
  );

  if (docked) {
    return (
      <aside ref={asideRef} aria-label={title} data-mumma-ai-dock="" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: dockWidth, zIndex: 1500,
        display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
        background: c.bg, color: c.fg, fontFamily: AI_FONT, borderLeft: `1px solid ${c.border}`,
        textAlign: 'left', textTransform: 'none', letterSpacing: 'normal', fontWeight: 400,
        paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        <ResizeHandle color={c.accent}
          width={widthPx ? clampDockWidth(widthPx) : (asideRef.current?.getBoundingClientRect().width || 352)}
          onResize={setWidthPx} onCommit={px => writeWidth(key, px)}
          onReset={() => { setWidthPx(null); writeWidth(key, null); }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.5rem 0.5rem 1rem', borderBottom: `1px solid ${c.border}`, flex: 'none' }}>
          <h2 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 600, marginRight: 'auto' }}>{shown.length > 1 ? title : current.name}</h2>
          <button type="button" aria-label="Shrink" title="Shrink" onClick={() => setCollapsed(true)}
            style={{ ...bubbleReset, ...TOUCH, width: '2.75rem', borderRadius: '0.35rem', color: 'inherit' }}>
            <CollapseIcon />
          </button>
        </div>
        {tabs}
        <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: '1rem', flex: '1 1 auto', minHeight: 0 }}>
          {body}
        </div>
      </aside>
    );
  }

  return (
    <>
      <button ref={bubbleRef} type="button" data-mumma-ai-bubble="" aria-label={accessibleName} title={title}
        aria-haspopup={wide ? undefined : 'dialog'} aria-expanded={wide ? undefined : drawerOpen}
        onClick={() => (wide ? setCollapsed(false) : setDrawerOpen(true))}
        style={{
          ...bubbleReset, position: 'fixed', zIndex: 1500,
          right: 'calc(1rem + env(safe-area-inset-right, 0px))',
          bottom: 'calc(var(--mumma-ai-bubble-bottom, 1rem) + env(safe-area-inset-bottom, 0px))',
          width: '3.5rem', height: '3.5rem', borderRadius: '999px',
          background: c.accent, color: c.accentFg, boxShadow: '0 6px 20px rgba(0, 0, 0, 0.25)',
        }}>
        <InboxIcon />
        {badge > 0 && <span style={{ ...countStyle, top: '0.1rem', right: '0.1rem' }} data-testid="agentinbox-badge" aria-hidden>{badge > 9 ? '9+' : badge}</span>}
      </button>
      {!wide && drawerOpen && (
        <InboxDrawer title={shown.length > 1 ? title : current.name} onClose={() => setDrawerOpen(false)} fallbackFocus={bubbleRef} header={tabs}>
          {body}
        </InboxDrawer>
      )}
    </>
  );
}

const bubbleReset: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, border: 'none',
  background: 'none', cursor: 'pointer', font: 'inherit', lineHeight: 1,
};

import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { parseReleaseBody } from './body';
import { useWhatsNewPalette, wnVar, WN_FONT, WN_RADIUS, type WhatsNewPalette } from './theme';
import { SUITE_APP, type ReleaseEntry, type ReleaseKind } from './types';

export const KIND_LABELS: Record<ReleaseKind, string> = {
  new: 'NEW',
  improved: 'IMPROVED',
  fixed: 'FIXED',
  balance: 'BALANCE',
};

export interface WhatsNewPanelProps {
  entries: ReleaseEntry[];
  loading?: boolean;
  error?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  /** Shown with the error state when given. */
  onRetry?: () => void;
  /**
   * Routes a relative link (`/path`) inside an SPA. Without it a relative link
   * is a plain anchor, so the browser navigates (`window.location`) as usual.
   * https links always open in a new tab.
   */
  onNavigate?: (path: string) => void;
  /** BCP 47 locale for dates; defaults to the browser's. */
  locale?: string;
  /** Replaces the empty-state copy. */
  emptyText?: string;
}

type LinkKind = 'internal' | 'external' | null;

/** `/path` is internal, `https://…` external; anything else (`//host`, `http:`, `javascript:`) is not rendered. */
export function classifyReleaseLink(link: string | null | undefined): LinkKind {
  if (!link) return null;
  if (link.startsWith('/') && !link.startsWith('//') && !link.startsWith('/\\')) return 'internal';
  try {
    return new URL(link).protocol === 'https:' ? 'external' : null;
  } catch {
    return null;
  }
}

function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDay(d: Date, locale?: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  try {
    return new Intl.DateTimeFormat(locale, opts).format(d);
  } catch {
    return new Intl.DateTimeFormat(undefined, opts).format(d);
  }
}

/** Groups entries by local calendar day, keeping the incoming (newest-first) order. */
export function groupReleaseEntriesByDay(entries: readonly ReleaseEntry[]): { day: string; date: Date; entries: ReleaseEntry[] }[] {
  const groups: { day: string; date: Date; entries: ReleaseEntry[] }[] = [];
  for (const entry of entries) {
    const date = new Date(entry.published_at);
    if (Number.isNaN(date.getTime())) continue;
    const day = dayKey(date);
    const existing = groups.find(g => g.day === day);
    if (existing) existing.entries.push(entry);
    else groups.push({ day, date, entries: [entry] });
  }
  return groups;
}

function makeStyles(p: WhatsNewPalette): Record<string, CSSProperties> {
  const muted = wnVar('muted', p.muted);
  const border = wnVar('border', p.border);
  return {
    root: {
      display: 'flex', flexDirection: 'column', gap: '1rem',
      fontFamily: WN_FONT, color: wnVar('fg', p.fg), fontSize: '0.9375rem', lineHeight: 1.5,
      textAlign: 'left', textTransform: 'none', letterSpacing: 'normal',
    },
    state: { margin: 0, padding: '1.5rem 0', textAlign: 'center', color: muted },
    group: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
    day: {
      margin: 0, fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.06em',
      textTransform: 'uppercase', color: muted,
      paddingBottom: '0.25rem', borderBottom: `1px solid ${border}`,
    },
    list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '1rem' },
    entry: { display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: 0 },
    meta: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' },
    chip: {
      display: 'inline-block', fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em',
      lineHeight: 1, padding: '0.25rem 0.45rem', borderRadius: '999px',
      border: '1px solid currentColor', whiteSpace: 'nowrap',
    },
    suite: { fontSize: '0.75rem', color: muted },
    title: { margin: 0, fontSize: '1rem', fontWeight: 600, lineHeight: 1.35, overflowWrap: 'anywhere' },
    summary: { margin: 0, overflowWrap: 'anywhere' },
    para: { margin: 0, color: muted, whiteSpace: 'pre-line', overflowWrap: 'anywhere' },
    bullets: { margin: 0, paddingLeft: '1.25rem', listStyleType: 'disc', color: muted, overflowWrap: 'anywhere' },
    open: {
      alignSelf: 'flex-start', fontSize: '0.875rem', fontWeight: 600,
      color: wnVar('accent', p.accent), textDecoration: 'none',
    },
    more: {
      alignSelf: 'center', font: 'inherit', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
      padding: '0.5rem 1rem', borderRadius: WN_RADIUS,
      border: `1px solid ${border}`, background: 'transparent', color: 'inherit',
    },
    retry: {
      font: 'inherit', fontSize: '0.875rem', cursor: 'pointer', marginLeft: '0.5rem',
      padding: 0, border: 'none', background: 'none', color: wnVar('accent', p.accent), textDecoration: 'underline',
    },
    note: { margin: 0, fontSize: '0.8125rem', textAlign: 'center', color: muted },
  };
}

function EntryLink({ entry, onNavigate, style }: { entry: ReleaseEntry; onNavigate?: (path: string) => void; style: CSSProperties }) {
  const kind = classifyReleaseLink(entry.link);
  if (!kind || !entry.link) return null;
  const label = `Open: ${entry.title}`;
  if (kind === 'external') {
    return <a href={entry.link} target="_blank" rel="noopener noreferrer" style={style} aria-label={label}>Open ↗</a>;
  }
  const path = entry.link;
  const onClick = (e: ReactMouseEvent<HTMLAnchorElement>) => {
    if (!onNavigate || e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onNavigate(path);
  };
  return <a href={path} onClick={onClick} style={style} aria-label={label}>Open →</a>;
}

/**
 * The list of release notes, grouped by day. Presentational: pass it the
 * hook's state. Bodies are rendered as text (paragraphs and bullets), never
 * as HTML.
 */
export function WhatsNewPanel({
  entries, loading, error, hasMore, loadingMore, onLoadMore, onRetry, onNavigate, locale, emptyText,
}: WhatsNewPanelProps) {
  const palette = useWhatsNewPalette();
  const s = makeStyles(palette);
  const groups = groupReleaseEntriesByDay(entries);

  let content;
  if (groups.length === 0) {
    if (loading) content = <p style={s.state} role="status">Loading…</p>;
    else if (error) {
      content = (
        <p style={s.state} role="alert">
          Couldn't load what's new.
          {onRetry && <button type="button" style={s.retry} onClick={onRetry}>Try again</button>}
        </p>
      );
    } else content = <p style={s.state}>{emptyText ?? 'Nothing new yet'}</p>;
  } else {
    content = groups.map(group => (
      <section key={group.day} style={s.group} aria-label={formatDay(group.date, locale)}>
        <h3 style={s.day}><time dateTime={group.day}>{formatDay(group.date, locale)}</time></h3>
        <ul style={s.list}>
          {group.entries.map(entry => (
            <li key={entry.id}>
              <article style={s.entry} data-kind={entry.kind}>
                <div style={s.meta}>
                  <span style={{ ...s.chip, color: wnVar(`kind-${entry.kind}`, palette.kinds[entry.kind] ?? palette.accent) }}>
                    {KIND_LABELS[entry.kind] ?? String(entry.kind).toUpperCase()}
                  </span>
                  {entry.app === SUITE_APP && <span style={s.suite}>Across Mumma apps</span>}
                </div>
                <h4 style={s.title}>{entry.title}</h4>
                {entry.summary && <p style={s.summary}>{entry.summary}</p>}
                {parseReleaseBody(entry.body).map((block, i) => block.type === 'paragraph'
                  ? <p key={i} style={s.para}>{block.text}</p>
                  : <ul key={i} style={s.bullets}>{block.items.map((item, j) => <li key={j}>{item}</li>)}</ul>)}
                <EntryLink entry={entry} onNavigate={onNavigate} style={s.open} />
              </article>
            </li>
          ))}
        </ul>
      </section>
    ));
  }

  return (
    <div style={s.root} aria-busy={loading || loadingMore ? true : undefined}>
      {content}
      {groups.length > 0 && error && !loadingMore && <p style={s.note} role="alert">Couldn't load more.</p>}
      {groups.length > 0 && hasMore && onLoadMore && (
        <button type="button" style={s.more} onClick={onLoadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}

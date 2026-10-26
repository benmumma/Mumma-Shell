import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { UseAgentInboxResult } from './hooks';
import {
  agoLabel, answerLine, behaviorLine, blockText, canActNow, classifyInboxLink, composerHint, followThroughLine,
  historyDays, historyStatus, kindLabel, progressFraction, snoozeOptions, statusSummary, undoRemainingMs, whenLabel,
} from './logic';
import { useInboxColors, AI_RADIUS, TOUCH, type InboxColors } from './theme';
import type { InboxBlock, InboxHistoryKind, InboxItem, InboxLink, InboxMessage } from './types';

export interface AgentInboxPanelProps {
  /** `useAgentInbox`'s result for the inbox to show. */
  inbox: UseAgentInboxResult;
  /** Routes an in-app link (`/fitter/week`) in an SPA. Without it, in-app links are plain anchors. */
  onNavigate?: (path: string) => void;
  /** BCP 47 locale for times. */
  locale?: string;
  /** Hide the conversation (an app that shows it elsewhere). */
  hideConversation?: boolean;
}

type View = 'now' | 'history' | 'chat' | 'memory';
type S = Record<string, CSSProperties>;

function useNow(intervalMs: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, active]);
  return now;
}

function styles(c: InboxColors): S {
  const buttonBase: CSSProperties = { ...TOUCH, font: 'inherit', cursor: 'pointer', borderRadius: AI_RADIUS };
  return {
    section: { margin: '0 0 1.5rem' },
    h: {
      display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 0.625rem', fontSize: '0.75rem',
      fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: c.muted,
    },
    count: {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '1.25rem', height: '1.25rem',
      padding: '0 0.375rem', boxSizing: 'border-box', borderRadius: '999px', fontSize: '0.6875rem', letterSpacing: 0,
      background: c.surface, border: `1px solid ${c.border}`, color: c.fg,
    },
    card: {
      background: c.surface, border: `1px solid ${c.border}`, borderRadius: AI_RADIUS,
      padding: '0.875rem 1rem', margin: '0 0 0.625rem',
    },
    ask: {
      background: c.surface, border: `1px solid ${c.border}`, borderLeft: `0.25rem solid ${c.attention}`,
      borderRadius: AI_RADIUS, padding: '1rem', margin: '0 0 0.875rem',
    },
    eyebrow: { fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: c.muted },
    title: { margin: 0, fontSize: '1rem', fontWeight: 600, lineHeight: 1.35 },
    question: { margin: '0.375rem 0 0', fontSize: '1.0625rem', fontWeight: 650, lineHeight: 1.35 },
    body: { margin: '0.375rem 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
    muted: { color: c.muted, fontSize: '0.875rem' },
    meta: { color: c.muted, fontSize: '0.8125rem' },
    option: {
      ...buttonBase, display: 'block', width: '100%', textAlign: 'left', margin: '0.5rem 0 0',
      padding: '0.625rem 0.875rem', color: c.fg, background: c.bg, border: `1px solid ${c.border}`,
    },
    optionRec: { background: c.accent, color: c.accentFg, border: `1px solid ${c.accent}` },
    primary: { ...buttonBase, padding: '0.5rem 1rem', fontWeight: 600, background: c.accent, color: c.accentFg, border: 'none' },
    quiet: { ...buttonBase, padding: '0.5rem 0.75rem', color: c.fg, background: 'transparent', border: `1px solid ${c.border}` },
    text: { ...buttonBase, padding: '0.5rem 0.5rem', color: c.muted, background: 'transparent', border: 'none', fontSize: '0.875rem' },
    row: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginTop: '0.625rem' },
    input: {
      ...TOUCH, flex: '1 1 10rem', minWidth: 0, padding: '0.5rem 0.75rem', font: 'inherit', color: c.fg,
      background: c.bg, border: `1px solid ${c.border}`, borderRadius: AI_RADIUS,
    },
    pill: {
      display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.125rem 0.5rem', borderRadius: '999px',
      fontSize: '0.75rem', fontWeight: 600, border: `1px solid ${c.border}`, color: c.muted, whiteSpace: 'nowrap',
    },
    error: { color: c.failed, margin: '0 0 0.75rem' },
    clamp: { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
    dot: { display: 'inline-block', width: '0.5rem', height: '0.5rem', borderRadius: '999px', flex: 'none' },
  };
}

// ── Small icons (decorative) ─────────────────────────────────────────────────

const svg = (children: ReactNode, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flex: 'none' }}>{children}</svg>
);
const CheckIcon = ({ size }: { size?: number }) => svg(<><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>, size);
const ClockIcon = () => svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, 14);
const AskIcon = ({ size }: { size?: number }) => svg(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14" /><path d="M12 17h.01" /></>, size);
const UpdateIcon = () => svg(<><path d="M4 6h16M4 12h16M4 18h10" /></>, 14);
const CardIcon = () => svg(<><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 10h8M8 14h5" /></>, 14);

function KindIcon({ kind }: { kind: InboxItem['kind'] }) {
  if (kind === 'ask') return <AskIcon size={14} />;
  if (kind === 'card') return <CardIcon />;
  return <UpdateIcon />;
}

// ── Shared pieces ────────────────────────────────────────────────────────────

function LinkList({ links, onNavigate, s }: { links: InboxLink[]; onNavigate?: (p: string) => void; s: S }) {
  const shown = links.filter(l => classifyInboxLink(l.url));
  if (!shown.length) return null;
  return (
    <div style={s.row}>
      {shown.map(l => {
        const kind = classifyInboxLink(l.url);
        if (kind === 'internal' && onNavigate) {
          return <button key={l.url} type="button" style={s.quiet} onClick={() => onNavigate(l.url)}>{l.label}</button>;
        }
        return (
          <a key={l.url} href={l.url} style={{ ...s.quiet, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
            {...(kind === 'external' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
            {l.label}
          </a>
        );
      })}
    </div>
  );
}

function Blocks({ blocks, c, onNavigate, s }: { blocks: InboxBlock[]; c: InboxColors; onNavigate?: (p: string) => void; s: S }) {
  if (!blocks.length) return null;
  const stats = blocks.filter(b => b.type === 'stat');
  return (
    <div style={{ marginTop: '0.625rem' }}>
      {stats.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(5.5rem, 1fr))', gap: '0.5rem', margin: '0 0 0.625rem' }}>
          {stats.map((b, i) => (
            <div key={`s${i}`} style={{ padding: '0.5rem 0.625rem', borderRadius: AI_RADIUS, background: c.bg, border: `1px solid ${c.border}` }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.2 }}>
                {String(b.value ?? '')}{b.unit ? <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}> {String(b.unit)}</span> : null}
              </div>
              <div style={s.meta}>{String(b.label ?? '')}</div>
            </div>
          ))}
        </div>
      )}
      {blocks.filter(b => b.type !== 'stat').map((b, i) => {
        const frac = progressFraction(b);
        if (frac !== null) {
          return (
            <div key={i} style={{ margin: '0 0 0.625rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', ...s.meta }}>
                <span>{String(b.label ?? 'Progress')}</span>
                <span>{String(b.value ?? 0)} / {String(b.max ?? '')}{b.unit ? ` ${String(b.unit)}` : ''}</span>
              </div>
              <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}
                aria-label={String(b.label ?? 'Progress')}
                style={{ height: '0.5rem', marginTop: '0.25rem', background: c.border, borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ width: `${frac * 100}%`, height: '100%', background: c.accent, borderRadius: '999px' }} />
              </div>
            </div>
          );
        }
        if ((b.type === 'checklist' || b.type === 'schedule') && Array.isArray(b.items)) {
          return (
            <ul key={i} style={{ listStyle: 'none', margin: '0 0 0.625rem', padding: 0 }}>
              {(b.items as { label?: string; when?: string; done?: boolean }[]).map((it, j) => (
                <li key={j} style={{
                  display: 'flex', gap: '0.75rem', padding: '0.375rem 0',
                  borderTop: j ? `1px solid ${c.border}` : 'none',
                  ...(it.done ? { color: c.muted, textDecoration: 'line-through' } : {}),
                }}>
                  {it.when ? <span style={{ flex: '0 0 4.5rem', fontWeight: 600 }}>{it.when}</span> : null}
                  <span style={{ minWidth: 0 }}>{it.label}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (b.type === 'link' && typeof b.url === 'string') {
          return <LinkList key={i} links={[{ label: String(b.label ?? b.url), url: b.url }]} onNavigate={onNavigate} s={s} />;
        }
        const text = blockText(b);
        return text ? <p key={i} style={{ ...s.body, ...s.muted }}>{text}</p> : null;
      })}
    </div>
  );
}

/** Body text that folds to three lines once it is long, with More / Less. */
function Folding({ text, s, threshold = 220 }: { text: string; s: S; threshold?: number }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const long = text.length > threshold;
  return (
    <>
      <p style={{ ...s.body, ...(long && !open ? s.clamp : {}) }}>{text}</p>
      {long && (
        <button type="button" style={{ ...s.text, minHeight: 0, padding: '0.25rem 0' }} aria-expanded={open}
          onClick={() => setOpen(o => !o)}>{open ? 'Less' : 'More'}</button>
      )}
    </>
  );
}

// ── Now: what needs you ──────────────────────────────────────────────────────

function AskCard({ item, inbox, name, s, c, now, locale }: {
  item: InboxItem; inbox: UseAgentInboxResult; name: string; s: S; c: InboxColors; now: number; locale?: string;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [writing, setWriting] = useState(item.response_type === 'text');
  const [snoozing, setSnoozing] = useState(false);
  const busy = inbox.busy.has(item.id);
  const multi = item.response_type === 'multi';
  const textOnly = item.response_type === 'text';
  // The recommendation leads: it is the answer most people will give.
  const options = [...(item.options ?? [])].sort((a, b) =>
    Number(b.key === item.recommended_key) - Number(a.key === item.recommended_key));
  const due = whenLabel(item.due_at, new Date(now), locale);
  const def = (item.options ?? []).find(o => o.key === item.default_key);
  const rec = (item.options ?? []).find(o => o.key === item.recommended_key);

  const choose = (key: string) => {
    if (multi) setPicked(p => (p.includes(key) ? p.filter(k => k !== key) : [...p, key]));
    else void inbox.answer(item, { keys: [key] });
  };

  return (
    <article style={s.ask} aria-label={item.question ?? item.title ?? 'Question'}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ ...s.eyebrow, color: c.attention, marginRight: 'auto' }}>{name} asks</span>
        {due && (
          <span style={{ ...s.pill, color: c.attention, borderColor: c.attention }}><ClockIcon />Due {due}</span>
        )}
      </div>
      <h4 style={s.question}>{item.question ?? item.title}</h4>
      {item.context && <p style={{ ...s.body, ...s.muted }}>{item.context}</p>}
      {item.decides && <p style={{ ...s.body, ...s.meta }}>Decides: {item.decides}</p>}

      {!textOnly && options.map(o => {
        const isRec = o.key === item.recommended_key;
        const on = picked.includes(o.key);
        return (
          <button key={o.key} type="button" disabled={busy} aria-pressed={multi ? on : undefined}
            style={{
              ...s.option, ...(isRec ? s.optionRec : {}),
              ...(on ? { outline: `2px solid ${c.fg}`, outlineOffset: '2px' } : {}),
              ...(busy ? { opacity: 0.6, cursor: 'default' } : {}),
            }}
            onClick={() => choose(o.key)}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: 600, marginRight: 'auto' }}>{o.label}</span>
              {isRec && <span style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.9 }}>Recommended</span>}
            </span>
            {o.means && <span style={{ display: 'block', fontSize: '0.875rem', opacity: isRec ? 0.9 : 1, color: isRec ? undefined : c.muted }}>{o.means}</span>}
          </button>
        );
      })}
      {rec && item.recommendation_reason && (
        <p style={{ ...s.body, ...s.meta }}>Why {rec.label}: {item.recommendation_reason}</p>
      )}
      {multi && (
        <div style={s.row}>
          <button type="button" style={s.primary} disabled={busy || picked.length === 0}
            onClick={() => { void inbox.answer(item, { keys: picked }); }}>
            Send {picked.length > 0 ? `${picked.length} choice${picked.length === 1 ? '' : 's'}` : ''}
          </button>
        </div>
      )}
      {(textOnly || item.allow_other !== false) && (writing ? (
        <form style={s.row} onSubmit={e => { e.preventDefault(); if (text.trim()) void inbox.answer(item, { text: text.trim() }); }}>
          <GrowingInput style={s.input} value={text} onChange={setText} autoFocus={!textOnly}
            placeholder={textOnly ? 'Your answer' : 'Your own answer'} label="Answer in your own words" />
          <button type="submit" style={s.primary} disabled={busy || !text.trim()}>Send</button>
        </form>
      ) : (
        <button type="button" style={{ ...s.text, paddingLeft: 0 }} onClick={() => setWriting(true)}>Answer in your own words</button>
      ))}

      <div style={{ ...s.row, borderTop: `1px solid ${c.border}`, paddingTop: '0.625rem', marginTop: '0.75rem' }}>
        <span style={{ ...s.meta, flex: '1 1 10rem', minWidth: 0 }}>
          {def
            ? `No answer${due ? ` by ${due.replace(/^(at|in) /, '')}` : ''}? ${def.label} applies.`
            : due ? `Needed ${due}.` : 'No deadline.'}
        </span>
        {snoozing ? (
          <>
            {snoozeOptions(new Date(now)).map(opt => (
              <button key={opt.label} type="button" style={s.quiet} disabled={busy}
                onClick={() => { setSnoozing(false); void inbox.snooze(item, opt.until); }}>{opt.label}</button>
            ))}
            <button type="button" style={s.text} onClick={() => setSnoozing(false)}>Cancel</button>
          </>
        ) : (
          <>
            <button type="button" style={s.text} disabled={busy} onClick={() => setSnoozing(true)}>Later</button>
            <button type="button" style={s.text} disabled={busy} onClick={() => { void inbox.dismiss(item); }}>Pass</button>
          </>
        )}
      </div>
    </article>
  );
}

function Answered({ item, inbox, name, s, c, now, locale }: {
  item: InboxItem; inbox: UseAgentInboxResult; name: string; s: S; c: InboxColors; now: number; locale?: string;
}) {
  const undoLeft = item.status === 'answered' ? undoRemainingMs(item, now) : 0;
  const follow = followThroughLine(item, name, new Date(now), locale);
  const color = item.follow_through === 'done' ? c.done : item.follow_through === 'failed' ? c.failed : c.attention;
  return (
    <div style={{ ...s.card, display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
      <span style={{ ...s.dot, background: color, marginTop: '0.5rem' }} aria-hidden />
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{item.question ?? item.title}</div>
        <div style={{ fontSize: '0.9375rem' }}>{answerLine(item)}</div>
        {follow && <div style={{ fontSize: '0.875rem', color: item.follow_through === 'pending' || item.follow_through === 'acknowledged' ? c.muted : color }}>{follow}</div>}
      </div>
      {undoLeft > 0 && (
        <button type="button" style={s.quiet} disabled={inbox.busy.has(item.id)} onClick={() => { void inbox.undo(item); }}>
          Undo ({Math.ceil(undoLeft / 1000)}s)
        </button>
      )}
    </div>
  );
}

/** How this agent works, in one plain line, at the very top of its inbox. */
function BehaviorLine({ page, s, c, now, locale }: {
  page: NonNullable<UseAgentInboxResult['page']>; s: S; c: InboxColors; now: number; locale?: string;
}) {
  const line = behaviorLine(page, new Date(now), locale);
  if (!line) return null;
  return (
    <p data-mumma-ai-behavior="" style={{ ...s.meta, display: 'flex', gap: '0.375rem', alignItems: 'flex-start', margin: '0 0 0.75rem', color: c.muted }}>
      <span style={{ display: 'inline-flex', marginTop: '0.2rem', flex: 'none' }}><ClockIcon /></span>
      <span>{line}</span>
    </p>
  );
}

function StatusBanner({ page, s, c, now, locale }: {
  page: NonNullable<UseAgentInboxResult['page']>; s: S; c: InboxColors; now: number; locale?: string;
}) {
  const st = statusSummary(page, new Date(now), locale);
  const attention = st.tone === 'attention';
  return (
    <div role="status" style={{
      display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.75rem 0.875rem', margin: '0 0 0.875rem',
      borderRadius: AI_RADIUS, background: c.surface, border: `1px solid ${attention ? c.attention : c.border}`,
    }}>
      <span style={{ color: attention ? c.attention : c.done, display: 'inline-flex' }}>
        {attention ? <AskIcon size={22} /> : <CheckIcon size={22} />}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 650, color: attention ? c.attention : c.fg }}>{st.headline}</div>
        {st.detail && <div style={s.meta}>{st.detail}</div>}
      </div>
    </div>
  );
}

function NowView({ inbox, s, c, now, locale, onNavigate, onSeeHistory }: {
  inbox: UseAgentInboxResult; s: S; c: InboxColors; now: number; locale?: string;
  onNavigate?: (p: string) => void; onSeeHistory: (kind: InboxHistoryKind | null) => void;
}) {
  const page = inbox.page!;
  const name = page.name;
  const latest = page.updates.slice(0, 3);
  const nothing = !page.asks.length && !page.answered.length && !page.cards.length && !page.updates.length;
  return (
    <>
      {page.asks.length > 0 && (
        <section style={s.section} aria-label="Needs you">
          <h3 style={{ ...s.h, color: c.attention }}>Needs you <span style={s.count}>{page.asks.length}</span></h3>
          {page.asks.map(a => <AskCard key={a.id} item={a} inbox={inbox} name={name} s={s} c={c} now={now} locale={locale} />)}
        </section>
      )}
      {page.answered.length > 0 && (
        <section style={s.section} aria-label="Your answers">
          <h3 style={s.h}>Your answers</h3>
          {page.answered.slice(0, 4).map(a => <Answered key={a.id} item={a} inbox={inbox} name={name} s={s} c={c} now={now} locale={locale} />)}
          {canActNow(page) && (
            <button type="button" style={{ ...s.quiet, margin: '0 0 0.5rem' }} disabled={inbox.busy.has('__wake')}
              onClick={() => { void inbox.actNow(); }}>
              Have {name} act on these now
            </button>
          )}
          {page.answered.length > 4 && (
            <button type="button" style={s.text} onClick={() => onSeeHistory('ask')}>All questions</button>
          )}
        </section>
      )}
      {page.cards.length > 0 && (
        <section style={s.section} aria-label="Now">
          <h3 style={s.h}>Now</h3>
          {page.cards.map(card => (
            <article key={card.id} style={s.card}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                {card.unseen && <span style={{ ...s.dot, background: c.accent, alignSelf: 'center' }} title="Updated since you last looked" aria-label="Updated" />}
                <h4 style={{ ...s.title, marginRight: 'auto' }}>{card.title}</h4>
                <span style={s.meta}>{agoLabel(card.updated_at, new Date(now), locale)}</span>
              </div>
              {card.body && <Folding text={card.body} s={s} threshold={400} />}
              <Blocks blocks={card.blocks} c={c} onNavigate={onNavigate} s={s} />
              <LinkList links={card.links} onNavigate={onNavigate} s={s} />
            </article>
          ))}
        </section>
      )}
      {latest.length > 0 && (
        <section style={s.section} aria-label="Updates">
          <h3 style={s.h}>Updates</h3>
          <div style={{ border: `1px solid ${c.border}`, borderRadius: AI_RADIUS, background: c.surface }}>
            {latest.map((u, i) => (
              <article key={u.id} style={{ padding: '0.75rem 1rem', borderTop: i ? `1px solid ${c.border}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                  {u.unseen && <span style={{ ...s.dot, background: c.accent, alignSelf: 'center' }} aria-label="New" />}
                  <span style={{ ...s.meta, marginRight: 'auto' }}>{agoLabel(u.created_at, new Date(now), locale)}</span>
                  <button type="button" style={{ ...s.text, minHeight: 0, padding: '0.125rem 0.25rem' }} aria-label="Clear this update"
                    disabled={inbox.busy.has(u.id)} onClick={() => { void inbox.dismiss(u); }}>Clear</button>
                </div>
                {u.title && <h4 style={{ ...s.title, marginTop: '0.125rem' }}>{u.title}</h4>}
                <Folding text={u.body} s={s} />
                <Blocks blocks={u.blocks} c={c} onNavigate={onNavigate} s={s} />
                <LinkList links={u.links} onNavigate={onNavigate} s={s} />
              </article>
            ))}
          </div>
          <button type="button" style={{ ...s.text, paddingLeft: 0 }} onClick={() => onSeeHistory('update')}>
            {page.updates.length > latest.length ? `All ${page.updates.length} current updates, and older ones` : 'Older updates'}
          </button>
        </section>
      )}
      {nothing && (
        <div style={{ textAlign: 'center', padding: '1.5rem 0.5rem', color: c.muted }}>
          <p style={{ margin: 0, fontWeight: 600, color: c.fg }}>All quiet</p>
          <p style={{ margin: '0.375rem 0 0', fontSize: '0.875rem' }}>
            When {name} has a plan, news, or a question for you, it shows up here. Questions come with a recommendation and a deadline.
          </p>
          <button type="button" style={{ ...s.quiet, marginTop: '0.75rem' }} onClick={() => onSeeHistory(null)}>See history</button>
        </div>
      )}
    </>
  );
}

// ── History ──────────────────────────────────────────────────────────────────

const HISTORY_FILTERS: { kind: InboxHistoryKind | null; label: string }[] = [
  { kind: null, label: 'All' },
  { kind: 'ask', label: 'Questions' },
  { kind: 'update', label: 'Updates' },
  { kind: 'card', label: 'Cards' },
];

function HistoryEntry({ item, name, s, c, now, locale }: { item: InboxItem; name: string; s: S; c: InboxColors; now: number; locale?: string }) {
  const tag = historyStatus(item, new Date(now));
  const time = new Date(item.created_at).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  const follow = item.kind === 'ask' && item.status !== 'open' ? followThroughLine(item, name, new Date(now), locale) : null;
  return (
    <li style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem 0', borderTop: `1px solid ${c.border}` }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '1.75rem', height: '1.75rem', flex: 'none',
        borderRadius: '999px', background: c.surface, border: `1px solid ${c.border}`,
        color: item.kind === 'ask' ? c.attention : c.muted,
      }}><KindIcon kind={item.kind} /></span>
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.375rem' }}>
          <span style={{ ...s.eyebrow, marginRight: 'auto' }}>{kindLabel(item)}</span>
          {tag && <span style={s.pill}>{tag}</span>}
          <span style={s.meta}>{time}</span>
        </div>
        {(item.question || item.title) && <div style={{ fontWeight: 600, marginTop: '0.125rem' }}>{item.question ?? item.title}</div>}
        {item.kind === 'ask'
          ? (item.status !== 'open' && <div style={{ fontSize: '0.9375rem' }}>{answerLine(item)}</div>)
          : <Folding text={item.body} s={s} />}
        {follow && <div style={s.meta}>{follow}</div>}
      </div>
    </li>
  );
}

function HistoryView({ inbox, s, c, now, locale, kind, onKind }: {
  inbox: UseAgentInboxResult; s: S; c: InboxColors; now: number; locale?: string;
  kind: InboxHistoryKind | null; onKind: (k: InboxHistoryKind | null) => void;
}) {
  const { history, loadHistory } = inbox;
  const name = inbox.page?.name ?? 'The agent';
  useEffect(() => { void loadHistory(kind); }, [kind, loadHistory]);
  const items = history && history.kind === kind ? history.items : [];
  const days = historyDays(items, new Date(now), locale);
  return (
    <section aria-label="History">
      <div role="group" aria-label="Show" style={{ display: 'flex', gap: '0.375rem', margin: '0 0 0.75rem', overflowX: 'auto' }}>
        {HISTORY_FILTERS.map(f => {
          const on = f.kind === kind;
          return (
            <button key={f.label} type="button" aria-pressed={on} onClick={() => onKind(f.kind)}
              style={{
                ...TOUCH, flex: 'none', padding: '0.375rem 0.75rem', font: 'inherit', fontSize: '0.8125rem', fontWeight: on ? 700 : 500,
                cursor: 'pointer', borderRadius: '999px', color: on ? c.accentFg : c.fg,
                background: on ? c.accent : 'transparent', border: `1px solid ${on ? c.accent : c.border}`,
              }}>{f.label}</button>
          );
        })}
      </div>
      {days.map(d => (
        <div key={d.label} style={{ margin: '0 0 0.75rem' }}>
          <h4 style={{ ...s.h, margin: '0.5rem 0 0.25rem' }}>{d.label}</h4>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {d.items.map(it => <HistoryEntry key={it.id} item={it} name={name} s={s} c={c} now={now} locale={locale} />)}
          </ul>
        </div>
      ))}
      {history?.loading && <p style={s.muted}>Loading…</p>}
      {history && !history.loading && history.error && (
        <div>
          <p style={s.muted}>History isn&apos;t available right now.</p>
          <button type="button" style={s.quiet} onClick={() => { void loadHistory(kind, { more: items.length > 0 }); }}>Try again</button>
        </div>
      )}
      {history && !history.loading && !history.error && items.length === 0 && (
        <p style={s.muted}>Nothing here yet.</p>
      )}
      {history && !history.loading && history.nextBefore && (
        <button type="button" style={{ ...s.quiet, width: '100%' }} onClick={() => { void loadHistory(kind, { more: true }); }}>
          Show older
        </button>
      )}
    </section>
  );
}

// ── Chat and memory ──────────────────────────────────────────────────────────

/**
 * A message box that grows with what you write, like a chat app's: one line
 * empty, up to about eight lines, then it scrolls. Enter sends (it submits
 * the surrounding form); Shift+Enter starts a new line; Enter while an input
 * method is composing (Japanese, Chinese) is left alone.
 */
const GROW_MAX_PX = 192;
function GrowingInput({ value, onChange, style, placeholder, label, autoFocus }: {
  value: string; onChange: (v: string) => void; style: CSSProperties; placeholder: string; label: string; autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const h = Math.min(el.scrollHeight, GROW_MAX_PX);
    if (h > 0) el.style.height = `${h + (el.offsetHeight - el.clientHeight)}px`;
    el.style.overflowY = el.scrollHeight > GROW_MAX_PX ? 'auto' : 'hidden';
  }, [value]);
  return (
    <textarea ref={ref} rows={1} value={value} maxLength={2000} autoFocus={autoFocus}
      placeholder={placeholder} aria-label={label} data-mumma-ai-composer=""
      style={{ ...style, resize: 'none', lineHeight: 1.4, display: 'block', overflowY: 'hidden' }}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
        e.preventDefault();
        e.currentTarget.form?.requestSubmit();
      }} />
  );
}

function Conversation({ messages, inbox, name, s, c, prompts, locale }: {
  messages: InboxMessage[]; inbox: UseAgentInboxResult; name: string; s: S; c: InboxColors; prompts: string[]; locale?: string;
}) {
  const [draft, setDraft] = useState('');
  const busy = inbox.busy.has('__composer');
  const hint = inbox.page ? composerHint(inbox.page, new Date(), locale) : null;
  const send = async (text: string) => {
    if (await inbox.send(text)) setDraft('');
  };
  return (
    <section aria-label={`Talk to ${name}`}>
      {messages.length === 0 && (
        <p style={{ ...s.muted, margin: '0 0 0.75rem' }}>
          Tell {name} something it should know, or ask it a question. It replies here.
        </p>
      )}
      {messages.slice(-30).map(m => {
        const mine = m.author_type === 'member';
        return (
          <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', margin: '0 0 0.625rem' }}>
            <div style={{
              padding: '0.5rem 0.75rem', borderRadius: AI_RADIUS, maxWidth: '85%', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
              ...(mine
                ? { background: c.accent, color: c.accentFg, borderBottomRightRadius: '0.25rem' }
                : { background: c.surface, border: `1px solid ${c.border}`, borderBottomLeftRadius: '0.25rem' }),
            }}>{m.body}</div>
            <div style={{ ...s.meta, fontSize: '0.75rem', marginTop: '0.125rem' }}>
              {mine ? 'You' : name} · {new Date(m.created_at).toLocaleString(locale, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
            </div>
          </div>
        );
      })}
      {prompts.length > 0 && (
        <div style={s.row}>
          {prompts.map(p => <button key={p} type="button" style={s.quiet} disabled={busy} onClick={() => { void send(p); }}>{p}</button>)}
        </div>
      )}
      <form style={{ ...s.row, alignItems: 'flex-end' }} onSubmit={e => { e.preventDefault(); void send(draft); }}>
        <GrowingInput style={s.input} value={draft} onChange={setDraft}
          placeholder={`Message ${name}`} label={`Message ${name}`} />
        <button type="submit" style={s.primary} disabled={busy || !draft.trim()}>Send</button>
      </form>
      {hint && <p style={{ ...s.meta, margin: '0.375rem 0 0' }} data-mumma-ai-composer-hint="">{hint}</p>}
    </section>
  );
}

function Memory({ inbox, name, s, c }: { inbox: UseAgentInboxResult; name: string; s: S; c: InboxColors }) {
  const { notes, loadNotes } = inbox;
  useEffect(() => { void loadNotes(); }, [loadNotes]);
  return (
    <section aria-label={`What ${name} remembers`}>
      <p style={{ ...s.muted, margin: '0 0 0.75rem' }}>
        What {name} keeps between runs. Forget anything that is wrong or no longer true.
      </p>
      {!notes && <p style={s.muted}>Loading…</p>}
      {notes && notes.notes.length === 0 && <p style={s.muted}>{name} has no notes yet.</p>}
      {notes?.notes.map(n => (
        <div key={n.id} style={{ ...s.card, display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <div style={s.eyebrow}>{n.key.replace(/[_-]/g, ' ')}</div>
            <div style={s.body}>{n.body}</div>
            <div style={{ ...s.meta, marginTop: '0.25rem' }}>Updated {agoLabel(n.updated_at)}</div>
          </div>
          <button type="button" style={s.text} disabled={inbox.busy.has(n.id)}
            onClick={() => { void inbox.forgetNote(n.id); }}>Forget</button>
        </div>
      ))}
      {notes && notes.max_chars > 0 && (
        <div style={{ ...s.meta, marginTop: '0.5rem' }}>
          <div role="progressbar" aria-label="Memory used" aria-valuemin={0} aria-valuemax={notes.max_chars} aria-valuenow={notes.used_chars}
            style={{ height: '0.375rem', background: c.border, borderRadius: '999px', overflow: 'hidden', margin: '0 0 0.25rem' }}>
            <div style={{ width: `${Math.min(100, (notes.used_chars / notes.max_chars) * 100)}%`, height: '100%', background: c.muted }} />
          </div>
          {notes.used_chars.toLocaleString()} of {notes.max_chars.toLocaleString()} characters
        </div>
      )}
    </section>
  );
}

// ── The panel ────────────────────────────────────────────────────────────────

/**
 * One agent's inbox. A status line says whether anything needs you and when
 * the agent next checks in; then four views: Now (questions first, with the
 * recommended answer leading, then your recent answers, the agent's Now cards
 * and its latest updates), History (everything it ever wrote, by day,
 * filterable, paged), Chat, and Memory. No stylesheet: colors are
 * `--mumma-ai-*` properties.
 */
export function AgentInboxPanel({ inbox, onNavigate, locale, hideConversation }: AgentInboxPanelProps) {
  const c = useInboxColors();
  const s = styles(c);
  const { page } = inbox;
  const [view, setView] = useState<View>('now');
  const [historyKind, setHistoryKind] = useState<InboxHistoryKind | null>(null);
  const ticking = Boolean(page?.answered.some(a => a.undo_until && undoRemainingMs(a) > 0));
  const now = useNow(ticking ? 1000 : 30000, Boolean(page));

  if (!page) {
    return (
      <div style={{ color: c.fg, fontSize: '0.9375rem', lineHeight: 1.5 }} data-mumma-agent-inbox="">
        {inbox.error ? (
          <div>
            <p style={s.muted}>This inbox isn&apos;t available right now.</p>
            <button type="button" style={s.quiet} onClick={() => { void inbox.refresh(); }}>Try again</button>
          </div>
        ) : <p style={s.muted}>Loading…</p>}
      </div>
    );
  }

  const name = page.name;
  const chat = !hideConversation && page.profile.composer.enabled;
  const views: { id: View; label: string; badge?: number }[] = [
    { id: 'now', label: 'Now', badge: page.asks.length },
    { id: 'history', label: 'History' },
    ...(chat ? [{ id: 'chat' as View, label: 'Chat' }] : []),
    { id: 'memory', label: 'Memory' },
  ];
  const seeHistory = (k: InboxHistoryKind | null) => { setHistoryKind(k); setView('history'); };

  return (
    <div style={{ color: c.fg, fontSize: '0.9375rem', lineHeight: 1.5 }} data-mumma-agent-inbox="">
      <BehaviorLine page={page} s={s} c={c} now={now} locale={locale} />
      <StatusBanner page={page} s={s} c={c} now={now} locale={locale} />
      <div role="tablist" aria-label={`${name} inbox`} style={{
        display: 'flex', gap: '0.25rem', padding: '0.25rem', margin: '0 0 1rem',
        background: c.surface, border: `1px solid ${c.border}`, borderRadius: '999px',
      }}>
        {views.map(v => {
          const on = view === v.id;
          return (
            <button key={v.id} type="button" role="tab" aria-selected={on} onClick={() => setView(v.id)}
              style={{
                ...TOUCH, flex: '1 1 0', minWidth: 0, padding: '0.375rem 0.5rem', font: 'inherit', fontSize: '0.875rem',
                fontWeight: on ? 700 : 500, cursor: 'pointer', borderRadius: '999px', border: 'none',
                background: on ? c.bg : 'transparent', color: on ? c.fg : c.muted,
                boxShadow: on ? '0 1px 3px rgba(0, 0, 0, 0.15)' : 'none',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
              }}>
              {v.label}
              {v.badge ? (
                <span style={{ ...s.count, background: c.attention, borderColor: c.attention, color: c.bg }} aria-label={`${v.badge} need you`}>{v.badge}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {inbox.actionError && <p role="alert" style={s.error}>{inbox.actionError}</p>}
      <div role="tabpanel" aria-label={views.find(v => v.id === view)?.label}>
        {view === 'now' && <NowView inbox={inbox} s={s} c={c} now={now} locale={locale} onNavigate={onNavigate} onSeeHistory={seeHistory} />}
        {view === 'history' && <HistoryView inbox={inbox} s={s} c={c} now={now} locale={locale} kind={historyKind} onKind={setHistoryKind} />}
        {view === 'chat' && chat && (
          <Conversation messages={page.messages} inbox={inbox} name={name} s={s} c={c}
            prompts={page.profile.composer.quick_prompts ?? []} locale={locale} />
        )}
        {view === 'memory' && <Memory inbox={inbox} name={name} s={s} c={c} />}
      </div>
    </div>
  );
}

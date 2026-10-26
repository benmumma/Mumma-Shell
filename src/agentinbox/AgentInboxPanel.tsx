import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { UseAgentInboxResult } from './hooks';
import {
  answerLine, blockText, classifyInboxLink, followThroughLine, progressFraction, snoozeOptions,
  undoRemainingMs, whenLabel,
} from './logic';
import { useInboxColors, AI_RADIUS, TOUCH, type InboxColors } from './theme';
import type { InboxBlock, InboxItem, InboxLink, InboxMessage } from './types';

export interface AgentInboxPanelProps {
  /** `useAgentInbox`'s result for the inbox to show. */
  inbox: UseAgentInboxResult;
  /** Routes an in-app link (`/fitter/week`) in an SPA. Without it, in-app links are plain anchors. */
  onNavigate?: (path: string) => void;
  /** BCP 47 locale for times. */
  locale?: string;
  /** Hide the conversation section (an app that shows it elsewhere). */
  hideConversation?: boolean;
}

function useNow(intervalMs: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, active]);
  return now;
}

function styles(c: InboxColors): Record<string, CSSProperties> {
  return {
    section: { margin: '0 0 1.25rem' },
    h: {
      margin: '0 0 0.5rem', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em',
      textTransform: 'uppercase', color: c.muted,
    },
    card: {
      background: c.surface, border: `1px solid ${c.border}`, borderRadius: AI_RADIUS,
      padding: '0.75rem 0.875rem', margin: '0 0 0.5rem',
    },
    ask: {
      background: c.surface, border: `1px solid ${c.border}`, borderLeft: `0.25rem solid ${c.attention}`,
      borderRadius: AI_RADIUS, padding: '0.75rem 0.875rem', margin: '0 0 0.75rem',
    },
    title: { margin: 0, fontSize: '1rem', fontWeight: 600 },
    body: { margin: '0.25rem 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
    muted: { color: c.muted, fontSize: '0.875rem' },
    option: {
      ...TOUCH, display: 'block', width: '100%', textAlign: 'left', margin: '0.375rem 0 0',
      padding: '0.5rem 0.75rem', font: 'inherit', cursor: 'pointer', color: c.fg,
      background: 'transparent', border: `1px solid ${c.border}`, borderRadius: AI_RADIUS,
    },
    optionRec: { borderColor: c.accent, borderWidth: '2px' },
    primary: {
      ...TOUCH, padding: '0.5rem 1rem', font: 'inherit', fontWeight: 600, cursor: 'pointer',
      background: c.accent, color: c.accentFg, border: 'none', borderRadius: AI_RADIUS,
    },
    quiet: {
      ...TOUCH, padding: '0.5rem 0.75rem', font: 'inherit', cursor: 'pointer', color: c.fg,
      background: 'transparent', border: `1px solid ${c.border}`, borderRadius: AI_RADIUS,
    },
    row: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' },
    input: {
      ...TOUCH, flex: '1 1 12rem', minWidth: 0, padding: '0.5rem 0.75rem', font: 'inherit', color: c.fg,
      background: c.bg, border: `1px solid ${c.border}`, borderRadius: AI_RADIUS,
    },
    chip: {
      display: 'inline-block', padding: '0.125rem 0.5rem', borderRadius: '999px', fontSize: '0.75rem',
      fontWeight: 600, background: c.accent, color: c.accentFg, marginLeft: '0.375rem', verticalAlign: 'middle',
    },
    error: { color: c.failed, margin: '0 0 0.75rem' },
  };
}

function LinkList({ links, onNavigate, s }: { links: InboxLink[]; onNavigate?: (p: string) => void; s: Record<string, CSSProperties> }) {
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

function Blocks({ blocks, c, onNavigate, s }: { blocks: InboxBlock[]; c: InboxColors; onNavigate?: (p: string) => void; s: Record<string, CSSProperties> }) {
  if (!blocks.length) return null;
  const stats = blocks.filter(b => b.type === 'stat');
  return (
    <div style={{ marginTop: '0.5rem' }}>
      {stats.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem 1.25rem', margin: '0 0 0.5rem' }}>
          {stats.map((b, i) => (
            <div key={`s${i}`}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                {String(b.value ?? '')}{b.unit ? <span style={{ fontSize: '0.875rem', fontWeight: 400 }}> {String(b.unit)}</span> : null}
              </div>
              <div style={s.muted}>{String(b.label ?? '')}</div>
            </div>
          ))}
        </div>
      )}
      {blocks.filter(b => b.type !== 'stat').map((b, i) => {
        const frac = progressFraction(b);
        if (frac !== null) {
          return (
            <div key={i} style={{ margin: '0 0 0.5rem' }}>
              <div style={s.muted}>{blockText(b)}</div>
              <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}
                aria-label={String(b.label ?? 'Progress')}
                style={{ height: '0.5rem', background: c.border, borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ width: `${frac * 100}%`, height: '100%', background: c.accent }} />
              </div>
            </div>
          );
        }
        if ((b.type === 'checklist' || b.type === 'schedule') && Array.isArray(b.items)) {
          return (
            <ul key={i} style={{ margin: '0 0 0.5rem', paddingLeft: '1.25rem' }}>
              {(b.items as { label?: string; when?: string; done?: boolean }[]).map((it, j) => (
                <li key={j} style={it.done ? { color: c.muted, textDecoration: 'line-through' } : undefined}>
                  {it.when ? <strong>{it.when} </strong> : null}{it.label}
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

function AskCard({ item, inbox, s, c, now, locale }: {
  item: InboxItem; inbox: UseAgentInboxResult; s: Record<string, CSSProperties>; c: InboxColors; now: number; locale?: string;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [snoozing, setSnoozing] = useState(false);
  const busy = inbox.busy.has(item.id);
  const options = item.options ?? [];
  const multi = item.response_type === 'multi';
  const textOnly = item.response_type === 'text';
  const due = whenLabel(item.due_at, new Date(now), locale);
  const def = options.find(o => o.key === item.default_key);

  const choose = (key: string) => {
    if (multi) setPicked(p => (p.includes(key) ? p.filter(k => k !== key) : [...p, key]));
    else void inbox.answer(item, { keys: [key] });
  };

  return (
    <article style={s.ask} aria-label={item.question ?? item.title ?? 'Question'}>
      <h4 style={s.title}>{item.question ?? item.title}</h4>
      {item.context && <p style={{ ...s.body, ...s.muted }}>{item.context}</p>}
      {options.map(o => {
        const rec = o.key === item.recommended_key;
        const on = picked.includes(o.key);
        return (
          <button key={o.key} type="button" disabled={busy} aria-pressed={multi ? on : undefined}
            style={{ ...s.option, ...(rec ? s.optionRec : {}), ...(on ? { background: c.border } : {}) }}
            onClick={() => choose(o.key)}>
            <span style={{ fontWeight: 600 }}>{o.label}</span>
            {rec && <span style={s.chip}>Recommended</span>}
            {o.means && <span style={{ display: 'block', ...s.muted }}>{o.means}</span>}
          </button>
        );
      })}
      {item.recommendation_reason && <p style={{ ...s.body, ...s.muted }}>Why: {item.recommendation_reason}</p>}
      {multi && (
        <div style={s.row}>
          <button type="button" style={s.primary} disabled={busy || picked.length === 0}
            onClick={() => { void inbox.answer(item, { keys: picked }); }}>Send</button>
        </div>
      )}
      {(textOnly || item.allow_other !== false) && (
        <form style={s.row} onSubmit={e => { e.preventDefault(); if (text.trim()) void inbox.answer(item, { text: text.trim() }); }}>
          <input style={s.input} value={text} onChange={e => setText(e.target.value)} maxLength={2000}
            placeholder={textOnly ? 'Your answer' : 'Or answer in your own words'} aria-label="Answer in your own words" />
          <button type="submit" style={s.quiet} disabled={busy || !text.trim()}>Send</button>
        </form>
      )}
      <div style={s.row}>
        {(due || def) && (
          <span style={{ ...s.muted, marginRight: 'auto' }}>
            {def
              ? `No answer? ${def.label} applies${due ? ` ${due}` : ''}`
              : `Needed ${due}`}
          </span>
        )}
        {snoozing ? (
          snoozeOptions(new Date(now)).map(opt => (
            <button key={opt.label} type="button" style={s.quiet} disabled={busy}
              onClick={() => { setSnoozing(false); void inbox.snooze(item, opt.until); }}>{opt.label}</button>
          ))
        ) : (
          <>
            <button type="button" style={s.quiet} disabled={busy} onClick={() => setSnoozing(true)}>Later</button>
            <button type="button" style={s.quiet} disabled={busy} onClick={() => { void inbox.dismiss(item); }}>Pass</button>
          </>
        )}
      </div>
    </article>
  );
}

function Answered({ item, inbox, name, s, c, now, locale }: {
  item: InboxItem; inbox: UseAgentInboxResult; name: string; s: Record<string, CSSProperties>; c: InboxColors; now: number; locale?: string;
}) {
  const undoLeft = item.status === 'answered' ? undoRemainingMs(item, now) : 0;
  const follow = followThroughLine(item, name, new Date(now), locale);
  const color = item.follow_through === 'done' ? c.done : item.follow_through === 'failed' ? c.failed : c.muted;
  return (
    <div style={s.card}>
      <div style={{ fontWeight: 600 }}>{item.question ?? item.title}</div>
      <div>{answerLine(item)}</div>
      {follow && <div style={{ fontSize: '0.875rem', color }}>{follow}</div>}
      {undoLeft > 0 && (
        <div style={s.row}>
          <button type="button" style={s.quiet} disabled={inbox.busy.has(item.id)} onClick={() => { void inbox.undo(item); }}>
            Undo ({Math.ceil(undoLeft / 1000)}s)
          </button>
        </div>
      )}
    </div>
  );
}

function Conversation({ messages, inbox, name, s, c, prompts, locale }: {
  messages: InboxMessage[]; inbox: UseAgentInboxResult; name: string; s: Record<string, CSSProperties>; c: InboxColors; prompts: string[]; locale?: string;
}) {
  const [draft, setDraft] = useState('');
  const busy = inbox.busy.has('__composer');
  const send = async (text: string) => {
    if (await inbox.send(text)) setDraft('');
  };
  return (
    <section style={s.section} aria-label={`Talk to ${name}`}>
      <h3 style={s.h}>Talk to {name}</h3>
      {messages.slice(-20).map(m => (
        <div key={m.id} style={{
          margin: '0 0 0.375rem', padding: '0.5rem 0.75rem', borderRadius: AI_RADIUS, maxWidth: '85%',
          whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
          ...(m.author_type === 'member'
            ? { marginLeft: 'auto', background: c.accent, color: c.accentFg }
            : { background: c.surface, border: `1px solid ${c.border}` }),
        }}>
          {m.body}
          <div style={{ fontSize: '0.75rem', opacity: 0.75 }}>
            {new Date(m.created_at).toLocaleString(locale, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
          </div>
        </div>
      ))}
      {prompts.length > 0 && (
        <div style={s.row}>
          {prompts.map(p => <button key={p} type="button" style={s.quiet} disabled={busy} onClick={() => { void send(p); }}>{p}</button>)}
        </div>
      )}
      <form style={s.row} onSubmit={e => { e.preventDefault(); void send(draft); }}>
        <input style={s.input} value={draft} onChange={e => setDraft(e.target.value)} maxLength={2000}
          placeholder={`Message ${name}`} aria-label={`Message ${name}`} />
        <button type="submit" style={s.primary} disabled={busy || !draft.trim()}>Send</button>
      </form>
    </section>
  );
}

function Notes({ inbox, name, s }: { inbox: UseAgentInboxResult; name: string; s: Record<string, CSSProperties> }) {
  const [open, setOpen] = useState(false);
  const { notes, loadNotes } = inbox;
  useEffect(() => { if (open) void loadNotes(); }, [open, loadNotes]);
  return (
    <section style={s.section}>
      <button type="button" style={s.quiet} aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {open ? 'Hide' : 'What'} {name} remembers
      </button>
      {open && (
        <div style={{ marginTop: '0.5rem' }}>
          {!notes && <p style={s.muted}>Loading…</p>}
          {notes && notes.notes.length === 0 && <p style={s.muted}>{name} has no notes yet.</p>}
          {notes?.notes.map(n => (
            <div key={n.id} style={{ ...s.card, display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <div style={s.muted}>{n.key.replace(/[_-]/g, ' ')}</div>
                <div style={s.body}>{n.body}</div>
              </div>
              <button type="button" style={s.quiet} disabled={inbox.busy.has(n.id)}
                onClick={() => { void inbox.forgetNote(n.id); }}>Forget</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * One agent's inbox: what needs you, what you answered (with undo and what the
 * agent did about it), its Now cards, recent updates, the conversation, and
 * what it remembers. No stylesheet: colors are `--mumma-ai-*` properties.
 */
export function AgentInboxPanel({ inbox, onNavigate, locale, hideConversation }: AgentInboxPanelProps) {
  const c = useInboxColors();
  const s = styles(c);
  const { page } = inbox;
  const ticking = Boolean(page?.answered.some(a => a.undo_until && undoRemainingMs(a) > 0));
  const now = useNow(ticking ? 1000 : 30000, Boolean(page));

  let content: ReactNode;
  if (!page) {
    content = inbox.error
      ? (
        <div>
          <p style={s.muted}>This inbox isn't available right now.</p>
          <button type="button" style={s.quiet} onClick={() => { void inbox.refresh(); }}>Try again</button>
        </div>
      )
      : <p style={s.muted}>Loading…</p>;
  } else {
    const name = page.name;
    const nothing = !page.asks.length && !page.answered.length && !page.cards.length && !page.updates.length;
    content = (
      <>
        {inbox.actionError && <p role="alert" style={s.error}>{inbox.actionError}</p>}
        {page.asks.length > 0 && (
          <section style={s.section}>
            <h3 style={{ ...s.h, color: c.attention }}>Needs you</h3>
            {page.asks.map(a => <AskCard key={a.id} item={a} inbox={inbox} s={s} c={c} now={now} locale={locale} />)}
          </section>
        )}
        {page.answered.length > 0 && (
          <section style={s.section}>
            <h3 style={s.h}>Answered</h3>
            {page.answered.slice(0, 5).map(a => <Answered key={a.id} item={a} inbox={inbox} name={name} s={s} c={c} now={now} locale={locale} />)}
          </section>
        )}
        {page.cards.length > 0 && (
          <section style={s.section}>
            <h3 style={s.h}>Now</h3>
            {page.cards.map(card => (
              <article key={card.id} style={s.card}>
                <h4 style={s.title}>{card.title}{card.unseen && <span style={s.chip}>Updated</span>}</h4>
                {card.body && <p style={s.body}>{card.body}</p>}
                <Blocks blocks={card.blocks} c={c} onNavigate={onNavigate} s={s} />
                <LinkList links={card.links} onNavigate={onNavigate} s={s} />
              </article>
            ))}
          </section>
        )}
        {page.updates.length > 0 && (
          <section style={s.section}>
            <h3 style={s.h}>Updates</h3>
            {page.updates.map(u => (
              <article key={u.id} style={{ ...s.card, display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  {u.title && <h4 style={s.title}>{u.title}</h4>}
                  <p style={s.body}>{u.body}</p>
                  <Blocks blocks={u.blocks} c={c} onNavigate={onNavigate} s={s} />
                  <LinkList links={u.links} onNavigate={onNavigate} s={s} />
                  <div style={s.muted}>{new Date(u.created_at).toLocaleString(locale, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</div>
                </div>
                <button type="button" style={s.quiet} aria-label="Clear this update" disabled={inbox.busy.has(u.id)}
                  onClick={() => { void inbox.dismiss(u); }}>Clear</button>
              </article>
            ))}
          </section>
        )}
        {nothing && <p style={{ ...s.muted, margin: '0 0 1.25rem' }}>Nothing from {name} right now.</p>}
        {!hideConversation && page.profile.composer.enabled && (
          <Conversation messages={page.messages} inbox={inbox} name={name} s={s} c={c}
            prompts={page.profile.composer.quick_prompts ?? []} locale={locale} />
        )}
        <Notes inbox={inbox} name={name} s={s} />
      </>
    );
  }

  return <div style={{ color: c.fg, fontSize: '1rem', lineHeight: 1.5 }} data-mumma-agent-inbox="">{content}</div>;
}

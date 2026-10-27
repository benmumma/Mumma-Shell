import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AgentInboxApi } from './api';
import { agoLabel } from './logic';
import { INBOX_POLL_MS } from './hooks';
import { useInboxColors, AI_RADIUS, TOUCH } from './theme';
import type { ChannelPost, InboxSummary, SidebarChannel, SidebarChannels, SidebarHousehold } from './types';

// Household feed channels in the sidebar (0.15.0). Dekko's channels round two
// (2026-10-27): each member picks which of their household's feed channels
// (General, Highlights, ones the household made) the other apps' sidebar
// shows, next to their agents. The pick is the member's own, kept on the
// server (`in_sidebar`), so it follows them across Fitter, Mealmate and
// Forward. Like the inbox, nothing here throws: a server without channels
// reads as no channels.

/** One thing the sidebar can open: an agent's inbox or a feed channel. */
export type SidebarItem =
  | { key: string; type: 'inbox'; label: string; badge: number; inbox: InboxSummary }
  | { key: string; type: 'channel'; label: string; badge: number; channel: SidebarChannel };

/** The channel's name, with its household's when you belong to more than one. */
export function channelLabel(channel: SidebarChannel, households: number): string {
  return households > 1 && channel.household_name ? `${channel.name} · ${channel.household_name}` : channel.name;
}

/** The sidebar's tabs: agents first (their badge counts what needs you), then channels. */
export function sidebarItems(inboxes: InboxSummary[], channels: SidebarChannel[], badgeOf: (s: InboxSummary) => number): SidebarItem[] {
  const households = new Set(channels.map(c => c.household_id)).size;
  return [
    ...inboxes.map(i => ({ key: `inbox:${i.instance_id}`, type: 'inbox' as const, label: i.name, badge: badgeOf(i), inbox: i })),
    ...channels.map(c => ({
      key: `channel:${c.id}`, type: 'channel' as const, label: channelLabel(c, households),
      badge: 0, channel: c,
    })),
  ];
}

/** Who posted, by name: a member from the household's roster, else the agent or module. */
export function postAuthor(post: ChannelPost, household: SidebarHousehold | null | undefined): string {
  if (post.publisher_type === 'member') {
    const m = household?.members.find(x => x.member_id === post.publisher_member_id);
    if (household && post.publisher_member_id === household.member_id) return 'You';
    return m?.display_name || 'Someone';
  }
  if (post.persona_name) return post.persona_name;
  if (post.publisher_key) return post.publisher_key.charAt(0).toUpperCase() + post.publisher_key.slice(1);
  return 'Someone';
}

/** The text a post shows: its body, else its title. */
export function postText(post: ChannelPost): string {
  return String(post.body || post.title || '').trim();
}

/** The picker's rows, grouped by household, each in the household's own order. */
export function pickerGroups(all: SidebarChannel[]): { id: string; name: string | null; channels: SidebarChannel[] }[] {
  const out: { id: string; name: string | null; channels: SidebarChannel[] }[] = [];
  for (const c of all) {
    let g = out.find(x => x.id === c.household_id);
    if (!g) { g = { id: c.household_id, name: c.household_name, channels: [] }; out.push(g); }
    g.channels.push(c);
  }
  return out;
}

export interface UseSidebarChannelsResult {
  /** The member's picked channels; null until the first answer. */
  picked: SidebarChannels | null;
  /** Every channel the member could pick; null until `loadAll`. */
  all: SidebarChannels | null;
  refresh: () => Promise<void>;
  loadAll: () => Promise<void>;
  /** Pick or unpick; refreshes both lists. False on a refusal. */
  setPicked: (channel: SidebarChannel, on: boolean) => Promise<boolean>;
}

/** The sidebar's channels: the picked ones polled, every one on demand for the picker. */
export function useSidebarChannels(api: AgentInboxApi, { enabled = true, pollMs = INBOX_POLL_MS } = {}): UseSidebarChannelsResult {
  const [picked, setPickedList] = useState<SidebarChannels | null>(null);
  const [all, setAll] = useState<SidebarChannels | null>(null);
  const supported = enabled && typeof api.listSidebarChannels === 'function';

  const refresh = useCallback(async () => {
    if (!supported) return;
    const res = await api.listSidebarChannels!({ picked: true });
    // A failed read keeps what was there.
    setPickedList(prev => res ?? prev ?? { channels: [], households: [] });
  }, [api, supported]);

  const loadAll = useCallback(async () => {
    if (!supported) return;
    const res = await api.listSidebarChannels!({ picked: false });
    setAll(prev => res ?? prev ?? { channels: [], households: [] });
  }, [api, supported]);

  const setPicked = useCallback(async (channel: SidebarChannel, on: boolean) => {
    if (!api.setChannelInSidebar) return false;
    const r = await api.setChannelInSidebar(channel.household_id, channel.id, on);
    await Promise.all([refresh(), loadAll()]);
    return r.ok;
  }, [api, refresh, loadAll]);

  useEffect(() => {
    if (!supported) return undefined;
    void refresh();
    // The picker's list is read once too, so a member with nothing picked yet
    // still gets a way in.
    void loadAll();
    if (!pollMs) return undefined;
    const t = setInterval(() => { void refresh(); }, pollMs);
    return () => clearInterval(t);
  }, [refresh, loadAll, supported, pollMs]);

  return { picked, all, refresh, loadAll, setPicked };
}

/** One channel's newest posts, polled while it is open, with a composer when you may post. */
export function ChannelFeedPanel({ api, channel, household, locale, pollMs = INBOX_POLL_MS }: {
  api: AgentInboxApi; channel: SidebarChannel; household?: SidebarHousehold | null; locale?: string; pollMs?: number;
}) {
  const c = useInboxColors();
  const [posts, setPosts] = useState<ChannelPost[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!api.getChannelPosts) return;
    const mine = ++seq.current;
    const res = await api.getChannelPosts(channel.household_id, channel.id);
    if (mine !== seq.current) return;
    if (res) { setPosts(res); setFailed(false); } else setFailed(true);
  }, [api, channel.household_id, channel.id]);

  useEffect(() => {
    void load();
    if (!pollMs) return undefined;
    const t = setInterval(() => { void load(); }, pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);

  const canPost = channel.can_post !== false && typeof api.postToChannel === 'function';
  async function send() {
    const body = draft.trim();
    if (!body || busy || !api.postToChannel) return;
    setBusy(true);
    setError(null);
    const r = await api.postToChannel(channel.household_id, channel.id, body);
    setBusy(false);
    if (!r.ok) { setError("Couldn't post that. Try again."); return; }
    setDraft('');
    await load();
  }

  const field: CSSProperties = {
    width: '100%', boxSizing: 'border-box', font: 'inherit', color: c.fg, background: c.surface,
    border: `1px solid ${c.border}`, borderRadius: AI_RADIUS, padding: '0.5rem 0.75rem', resize: 'vertical',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {canPost && (
        <form onSubmit={e => { e.preventDefault(); void send(); }} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <textarea aria-label={`Post in ${channel.name}`} placeholder={`Post in ${channel.name}`} rows={2}
            value={draft} onChange={e => setDraft(e.target.value)} disabled={busy} style={field} />
          <button type="submit" disabled={busy || !draft.trim()}
            style={{
              ...TOUCH, alignSelf: 'flex-end', padding: '0.375rem 1rem', font: 'inherit', fontWeight: 600, cursor: 'pointer',
              border: 'none', borderRadius: '999px', background: c.accent, color: c.accentFg,
              opacity: busy || !draft.trim() ? 0.6 : 1,
            }}>
            Post
          </button>
          {error && <p role="alert" style={{ margin: 0, color: c.failed }}>{error}</p>}
        </form>
      )}
      {posts === null && !failed && <p style={{ margin: 0, color: c.muted }}>Loading…</p>}
      {posts === null && failed && <p style={{ margin: 0, color: c.muted }}>Couldn&apos;t load this channel.</p>}
      {posts && posts.length === 0 && <p style={{ margin: 0, color: c.muted }}>Nothing here yet.</p>}
      {posts && posts.length > 0 && (
        <ul aria-label={channel.name} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {posts.map(p => {
            const text = postText(p);
            return (
              <li key={p.id} style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: AI_RADIUS, padding: '0.625rem 0.75rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <strong>{postAuthor(p, household)}</strong>
                  <span style={{ color: c.muted, fontSize: '0.8125rem' }}>{agoLabel(p.created_at, new Date(), locale)}</span>
                </div>
                {text && <p style={{ margin: '0.25rem 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{text}</p>}
                {(p.reply_count ?? 0) > 0 && (
                  <p style={{ margin: '0.25rem 0 0', color: c.muted, fontSize: '0.8125rem' }}>
                    {p.reply_count === 1 ? '1 reply' : `${p.reply_count} replies`}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** "Choose feeds": every channel you could show here, a checkbox each. */
export function ChannelPicker({ channels, onToggle, onDone }: {
  channels: SidebarChannels | null;
  onToggle: (channel: SidebarChannel, on: boolean) => Promise<boolean>;
  onDone: () => void;
}) {
  const c = useInboxColors();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const groups = pickerGroups(channels?.channels ?? []);
  async function toggle(ch: SidebarChannel, on: boolean) {
    setBusy(ch.id);
    setError(null);
    const ok = await onToggle(ch, on);
    setBusy(null);
    if (!ok) setError("Couldn't change that. Try again.");
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <p style={{ margin: 0, color: c.muted }}>
        Pick which household feeds show here, next to your agents. Your pick follows you to Fitter, Mealmate and Forward.
      </p>
      {channels === null && <p style={{ margin: 0, color: c.muted }}>Loading…</p>}
      {channels && groups.length === 0 && <p style={{ margin: 0, color: c.muted }}>Your household has no feeds to show yet.</p>}
      {groups.map(g => (
        <fieldset key={g.id} style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {groups.length > 1 && <legend style={{ fontWeight: 700, padding: 0, marginBottom: '0.25rem' }}>{g.name ?? 'Household'}</legend>}
          {g.channels.map(ch => (
            <label key={ch.id} style={{ ...TOUCH, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={ch.in_sidebar} disabled={busy === ch.id}
                onChange={e => { void toggle(ch, e.target.checked); }} />
              {ch.name}
            </label>
          ))}
        </fieldset>
      ))}
      {error && <p role="alert" style={{ margin: 0, color: c.failed }}>{error}</p>}
      <button type="button" onClick={onDone}
        style={{ ...TOUCH, alignSelf: 'flex-start', padding: '0.375rem 1rem', font: 'inherit', cursor: 'pointer', color: c.fg, background: 'transparent', border: `1px solid ${c.border}`, borderRadius: '999px' }}>
        Done
      </button>
    </div>
  );
}

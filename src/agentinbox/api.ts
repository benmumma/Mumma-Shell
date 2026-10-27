import type {
  ChannelPost, SidebarChannels,
  InboxHistoryKind, InboxHistoryPage, InboxItem, InboxMessage, InboxNotes, InboxPage, InboxResult, InboxSummary, InboxTopic,
} from './types';

export interface AgentInboxApiOptions {
  /** Origin that serves `/api/v1` (Mumapps-Server). A trailing slash is fine. */
  baseUrl: string;
  /**
   * The signed-in member's bearer token, or null when signed out. Every inbox
   * route is authenticated; on the web this is the shell's `getAccessToken`.
   */
  getToken: () => string | null | Promise<string | null>;
  /** The active member on a shared device (a kid on the kitchen tablet). Narrows, never widens. */
  memberId?: string | null;
  /** Defaults to the global `fetch`; tests inject one. */
  fetchImpl?: typeof fetch;
}

export interface AgentInboxApi {
  listInboxes(app?: string | null, signal?: AbortSignal): Promise<InboxSummary[] | null>;
  getInbox(householdId: string, instanceId: string, signal?: AbortSignal): Promise<InboxPage | null>;
  answer(ref: InboxRef, itemId: string, answer: { keys?: string[]; key?: string; text?: string | null }): Promise<InboxResult<AnswerResult>>;
  undo(ref: InboxRef, itemId: string): Promise<InboxResult<{ item: InboxItem }>>;
  dismiss(ref: InboxRef, itemId: string): Promise<InboxResult<{ item: InboxItem }>>;
  snooze(ref: InboxRef, itemId: string, until: string): Promise<InboxResult<{ item: InboxItem }>>;
  markSeen(ref: InboxRef, body: { item_ids?: string[]; all?: boolean }): Promise<InboxResult<{ seen_at: string | null }>>;
  sendMessage(ref: InboxRef, body: string, itemId?: string | null): Promise<InboxResult<{ message: InboxMessage; acts_at: string }>>;
  getNotes(ref: InboxRef): Promise<InboxNotes | null>;
  /** Null on any failure, including a server older than the history route. */
  getHistory(ref: InboxRef, opts?: { before?: string | null; kind?: InboxHistoryKind | null; limit?: number }): Promise<InboxHistoryPage | null>;
  forgetNote(ref: InboxRef, noteId: string): Promise<InboxResult<{ forgotten: boolean }>>;
  /** "Act on it now": one run with the answers still waiting (Mumapps-Server 2026-10-27+). */
  wake?(ref: InboxRef): Promise<InboxResult<{ acts_at: string }>>;
  /** Conversation topics (Mumapps-Server inbox m2). Null on any failure or an older server. */
  listTopics?(ref: InboxRef, opts?: { before?: string | null }): Promise<{ topics: InboxTopic[]; next_before: string | null } | null>;
  getTopic?(ref: InboxRef, topicId: string): Promise<{ topic: InboxTopic; messages: InboxMessage[] } | null>;
  startTopic?(ref: InboxRef): Promise<InboxResult<{ topic: InboxTopic }>>;
  reopenTopic?(ref: InboxRef, topicId: string): Promise<InboxResult<{ topic: InboxTopic }>>;
  /** Undo what the agent added to your profile, from its update. */
  undoProfileChange?(ref: InboxRef, itemId: string): Promise<InboxResult<{ item: InboxItem; reverted: string[] }>>;
  /**
   * The household feed channels the sidebar can show (Mumapps-Server
   * `GET /me/channels`, 2026-10-27+): `picked` for the ones this member put
   * there. Null on any failure, including a server without channels.
   */
  listSidebarChannels?(opts?: { picked?: boolean }): Promise<SidebarChannels | null>;
  /** A channel's newest top-level posts. Null on any failure. */
  getChannelPosts?(householdId: string, channelId: string, opts?: { limit?: number }): Promise<ChannelPost[] | null>;
  /** Post into a channel as the signed-in member. */
  postToChannel?(householdId: string, channelId: string, body: string): Promise<InboxResult<unknown>>;
  /** Put a channel in this member's sidebar, or take it out. */
  setChannelInSidebar?(householdId: string, channelId: string, inSidebar: boolean): Promise<InboxResult<unknown>>;
}

export interface InboxRef {
  householdId: string;
  instanceId: string;
}

export interface AnswerResult {
  item: InboxItem;
  /** `now`: the agent is woken once the undo window closes. `next_run`: it acts on its next scheduled run. */
  wake: 'now' | 'next_run';
  acts_at: string | null;
}

const enc = encodeURIComponent;

export function inboxPath({ householdId, instanceId }: InboxRef, rest = ''): string {
  return `/api/v1/households/${enc(householdId)}/agents/${enc(instanceId)}/inbox${rest}`;
}

/**
 * The inbox REST client. NOTHING here throws: reads resolve to `null` on any
 * failure (signed out, 503 while the server's inbox is off, a network error),
 * writes resolve to `{ ok: false, ... }` with the server's code, because an
 * inbox must never break the app around it.
 */
export function createAgentInboxApi({ baseUrl, getToken, memberId = null, fetchImpl }: AgentInboxApiOptions): AgentInboxApi {
  const base = String(baseUrl ?? '').replace(/\/+$/, '');

  async function call<T>(method: string, path: string, body?: Record<string, unknown>, signal?: AbortSignal): Promise<InboxResult<T>> {
    try {
      const doFetch = fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
      if (!base || !doFetch) return { ok: false, status: 0, code: 'unavailable', message: 'unavailable' };
      const token = await getToken();
      if (!token) return { ok: false, status: 401, code: 'signed_out', message: 'signed out' };
      let url = `${base}${path}`;
      let payload: string | undefined;
      // The active member rides the query on every call (a DELETE body can be
      // dropped on the way) and the body on writes, where the server reads it.
      if (memberId) url += `${url.includes('?') ? '&' : '?'}member_id=${enc(memberId)}`;
      if (method !== 'GET') {
        payload = JSON.stringify(memberId ? { ...(body ?? {}), member_id: memberId } : (body ?? {}));
      }
      const res = await doFetch(url, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: payload,
        credentials: 'omit',
        signal,
      });
      let json: { success?: unknown; data?: unknown; code?: unknown; message?: unknown } | null = null;
      try { json = await res.json(); } catch { json = null; }
      if (!res.ok || !json || json.success !== true) {
        const code = typeof json?.code === 'string' ? json.code : `http_${res.status}`;
        const message = typeof json?.message === 'string' ? json.message : code;
        return { ok: false, status: res.status, code, message };
      }
      return { ok: true, data: json.data as T };
    } catch (e) {
      const aborted = (e as { name?: string } | null)?.name === 'AbortError';
      return { ok: false, status: 0, code: aborted ? 'aborted' : 'network', message: aborted ? 'aborted' : 'network error' };
    }
  }

  const read = async <T>(path: string, signal?: AbortSignal): Promise<T | null> => {
    const r = await call<T>('GET', path, undefined, signal);
    return r.ok ? r.data : null;
  };

  return {
    async listInboxes(app, signal) {
      const q = app ? `?app=${enc(app)}` : '';
      const data = await read<{ inboxes?: unknown }>(`/api/v1/me/agent-inboxes${q}`, signal);
      return data && Array.isArray(data.inboxes) ? (data.inboxes as InboxSummary[]) : null;
    },
    async getInbox(householdId, instanceId, signal) {
      const data = await read<InboxPage>(inboxPath({ householdId, instanceId }), signal);
      return data && Array.isArray(data.asks) ? data : null;
    },
    answer: (ref, itemId, answer) => call('POST', inboxPath(ref, `/items/${enc(itemId)}/answer`), answer as Record<string, unknown>),
    undo: (ref, itemId) => call('POST', inboxPath(ref, `/items/${enc(itemId)}/undo`)),
    dismiss: (ref, itemId) => call('POST', inboxPath(ref, `/items/${enc(itemId)}/dismiss`)),
    snooze: (ref, itemId, until) => call('POST', inboxPath(ref, `/items/${enc(itemId)}/snooze`), { until }),
    markSeen: (ref, body) => call('POST', inboxPath(ref, '/seen'), body),
    wake: (ref) => call('POST', inboxPath(ref, '/wake')),
    sendMessage: (ref, body, itemId = null) => call('POST', inboxPath(ref, '/messages'), itemId ? { body, item_id: itemId } : { body }),
    async getNotes(ref) {
      return read<InboxNotes>(inboxPath(ref, '/notes'));
    },
    forgetNote: (ref, noteId) => call('DELETE', inboxPath(ref, `/notes/${enc(noteId)}`)),
    async getHistory(ref, { before = null, kind = null, limit } = {}) {
      const q = new URLSearchParams();
      if (before) q.set('before', before);
      if (kind) q.set('kind', kind);
      if (limit) q.set('limit', String(limit));
      const qs = q.toString();
      const data = await read<InboxHistoryPage>(inboxPath(ref, `/history${qs ? `?${qs}` : ''}`));
      return data && Array.isArray(data.items) ? { items: data.items, next_before: data.next_before ?? null } : null;
    },
    async listTopics(ref, { before = null } = {}) {
      const data = await read<{ available?: boolean; topics?: InboxTopic[]; next_before?: string | null }>(
        inboxPath(ref, `/topics${before ? `?before=${enc(before)}` : ''}`));
      return data && data.available !== false && Array.isArray(data.topics) ? { topics: data.topics, next_before: data.next_before ?? null } : null;
    },
    async getTopic(ref, topicId) {
      const data = await read<{ topic: InboxTopic; messages: InboxMessage[] }>(inboxPath(ref, `/topics/${enc(topicId)}`));
      return data && Array.isArray(data.messages) ? data : null;
    },
    startTopic: (ref) => call('POST', inboxPath(ref, '/topics')),
    reopenTopic: (ref, topicId) => call('POST', inboxPath(ref, `/topics/${enc(topicId)}/reopen`)),
    undoProfileChange: (ref, itemId) => call('POST', inboxPath(ref, `/items/${enc(itemId)}/undo-profile`)),
    async listSidebarChannels({ picked = false } = {}) {
      const data = await read<SidebarChannels>(`/api/v1/me/channels${picked ? '?picked=1' : ''}`);
      return data && Array.isArray(data.channels)
        ? { channels: data.channels, households: Array.isArray(data.households) ? data.households : [] }
        : null;
    },
    async getChannelPosts(householdId, channelId, { limit = 20 } = {}) {
      const data = await read<{ posts?: ChannelPost[] }>(
        `/api/v1/households/${enc(householdId)}/feed?channel=${enc(channelId)}&limit=${limit}`);
      return data && Array.isArray(data.posts) ? data.posts : null;
    },
    postToChannel: (householdId, channelId, body) =>
      call('POST', `/api/v1/households/${enc(householdId)}/feed`, { body, channel_id: channelId }),
    setChannelInSidebar: (householdId, channelId, inSidebar) =>
      call('PUT', `/api/v1/households/${enc(householdId)}/channels/${enc(channelId)}/prefs`, { in_sidebar: inSidebar }),
  };
}

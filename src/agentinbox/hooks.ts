import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createAgentInboxApi, type AgentInboxApi, type AgentInboxApiOptions, type InboxRef } from './api';
import { awaitingReply, totalBadge } from './logic';
import type { InboxHistoryKind, InboxItem, InboxMessage, InboxNotes, InboxPage, InboxSummary, InboxTopic } from './types';

/** How often an open app re-reads its inbox list (also on focus). */
export const INBOX_POLL_MS = 60 * 1000;
/** How often an open inbox checks for a reply it is waiting on. */
export const AWAIT_POLL_MS = 15 * 1000;

/**
 * A stable inbox client for the life of the component. `getToken` may change
 * identity every render; the latest one is always used.
 */
export function useAgentInboxApi({ baseUrl, getToken, memberId = null, fetchImpl }: AgentInboxApiOptions): AgentInboxApi {
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  return useMemo(
    () => createAgentInboxApi({ baseUrl, memberId, fetchImpl, getToken: () => tokenRef.current() }),
    [baseUrl, memberId, fetchImpl],
  );
}

function useOnFocus(fn: () => void, enabled: boolean) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const onFocus = () => ref.current();
    const onVisible = () => { if (document.visibilityState === 'visible') ref.current(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);
}

export interface UseAgentInboxesResult {
  /** null until the first answer; [] when the member has no inbox here (or the server's inbox is off). */
  inboxes: InboxSummary[] | null;
  loading: boolean;
  /** Sum of every inbox's badge (open questions, or unseen where the inbox counts unread). */
  badge: number;
  refresh: () => Promise<void>;
}

/** The inboxes this app shows for the signed-in member: polled, and re-read on focus. */
export function useAgentInboxes(api: AgentInboxApi, app: string | null, { enabled = true, pollMs = INBOX_POLL_MS } = {}): UseAgentInboxesResult {
  const [inboxes, setInboxes] = useState<InboxSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const mine = ++seq.current;
    setLoading(true);
    const list = await api.listInboxes(app);
    if (mine !== seq.current) return;
    // A failed read keeps what was there: a blip must not empty the badge.
    setInboxes(prev => (list ?? prev ?? []));
    setLoading(false);
  }, [api, app, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    void refresh();
    if (!pollMs) return undefined;
    const t = setInterval(() => { void refresh(); }, pollMs);
    return () => clearInterval(t);
  }, [refresh, enabled, pollMs]);
  useOnFocus(() => { void refresh(); }, enabled);

  return { inboxes, loading, badge: totalBadge(inboxes), refresh };
}

export interface UseAgentInboxResult {
  page: InboxPage | null;
  loading: boolean;
  /** The last read failed (a page already loaded is kept). */
  error: boolean;
  /** The last action's refusal, in the server's words, until the next action. */
  actionError: string | null;
  /** Item ids with a write in flight. */
  busy: ReadonlySet<string>;
  refresh: () => Promise<void>;
  answer: (item: InboxItem, answer: { keys?: string[]; text?: string | null }) => Promise<boolean>;
  undo: (item: InboxItem) => Promise<boolean>;
  dismiss: (item: InboxItem) => Promise<boolean>;
  snooze: (item: InboxItem, until: string) => Promise<boolean>;
  send: (body: string, itemId?: string | null) => Promise<boolean>;
  /** Ask an agent that waits for its next run to act on its answers now. */
  actNow: () => Promise<boolean>;
  markAllSeen: () => void;
  notes: InboxNotes | null;
  loadNotes: () => Promise<void>;
  forgetNote: (noteId: string) => Promise<boolean>;
  /** The History view: null until first loaded. */
  history: InboxHistoryState | null;
  /** Load the first page for `kind` (null: everything), or the next page with `more`. */
  loadHistory: (kind?: InboxHistoryKind | null, opts?: { more?: boolean }) => Promise<void>;
  /** True when the server splits the conversation into topics. */
  hasTopics: boolean;
  /** Close the current topic; the next message starts a new one. */
  newTopic: () => Promise<boolean>;
  /** Make an earlier topic current again. */
  reopenTopic: (topicId: string) => Promise<boolean>;
  /** The Topics list: null until loaded. */
  topics: { items: InboxTopic[]; nextBefore: string | null; loading: boolean } | null;
  loadTopics: (opts?: { more?: boolean }) => Promise<void>;
  /** Undo a profile change the agent made, from the update that reported it. */
  undoProfile: (item: InboxItem) => Promise<boolean>;
  /** One earlier topic's messages, for reading. */
  readTopic: (topicId: string) => Promise<{ topic: InboxTopic; messages: InboxMessage[] } | null>;
}

export interface InboxHistoryState {
  kind: InboxHistoryKind | null;
  items: InboxItem[];
  nextBefore: string | null;
  loading: boolean;
  /** The last page failed to load (what loaded is kept). */
  error: boolean;
}

const UNDO_MS = 30 * 1000;

/** One inbox: its page, and every action a member takes in it. */
export function useAgentInbox(
  api: AgentInboxApi,
  ref: InboxRef | null,
  { onChange }: { onChange?: () => void } = {},
): UseAgentInboxResult {
  const [page, setPage] = useState<InboxPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const [notes, setNotes] = useState<InboxNotes | null>(null);
  const [history, setHistory] = useState<InboxHistoryState | null>(null);
  const [topics, setTopics] = useState<UseAgentInboxResult['topics']>(null);
  const pageRef = useRef<InboxPage | null>(null);
  pageRef.current = page;
  const historyRef = useRef<InboxHistoryState | null>(null);
  historyRef.current = history;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const key = ref ? `${ref.householdId}/${ref.instanceId}` : '';
  const refRef = useRef(ref);
  refRef.current = ref;
  const keyRef = useRef(key);
  keyRef.current = key;

  const refresh = useCallback(async () => {
    const r = refRef.current;
    if (!r) return;
    setLoading(true);
    const p = await api.getInbox(r.householdId, r.instanceId);
    // The member switched inboxes while this read was in flight.
    if (keyRef.current !== key) return;
    if (p) { setPage(p); setError(false); } else setError(true);
    setLoading(false);
  }, [api, key]);

  useEffect(() => {
    setPage(null);
    setNotes(null);
    setHistory(null);
    setTopics(null);
    setActionError(null);
    if (key) void refresh();
  }, [key, refresh]);
  useOnFocus(() => { void refresh(); }, Boolean(key));

  // While a reply is on its way (awaitingReply), check back every 15 s so it
  // shows up without reopening the inbox.
  const waiting = page ? awaitingReply(page) : false;
  useEffect(() => {
    if (!waiting) return undefined;
    const t = setInterval(() => { void refresh(); }, AWAIT_POLL_MS);
    return () => clearInterval(t);
  }, [waiting, refresh]);

  const withBusy = useCallback(async (id: string, fn: () => Promise<boolean>) => {
    setBusy(prev => new Set(prev).add(id));
    setActionError(null);
    try {
      return await fn();
    } finally {
      setBusy(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }, []);

  const settle = useCallback(async () => {
    await refresh();
    onChangeRef.current?.();
  }, [refresh]);

  const answer = useCallback<UseAgentInboxResult['answer']>((item, a) => withBusy(item.id, async () => {
    const r = refRef.current;
    if (!r) return false;
    // Optimistic: the question moves to Answered with its undo window at once.
    const optimistic: InboxItem = {
      ...item,
      status: 'answered',
      answer: {
        keys: a.keys ?? [],
        labels: (a.keys ?? []).map(k => item.options?.find(o => o.key === k)?.label ?? k),
        text: a.text ?? null,
      },
      undo_until: new Date(Date.now() + UNDO_MS).toISOString(),
      follow_through: 'pending',
    };
    setPage(p => p && { ...p, asks: p.asks.filter(x => x.id !== item.id), answered: [optimistic, ...p.answered] });
    const res = await api.answer(r, item.id, { keys: a.keys, text: a.text ?? undefined });
    if (!res.ok) {
      setActionError(res.message);
      await refresh();
      return false;
    }
    setPage(p => p && {
      ...p,
      answered: p.answered.map(x => (x.id === item.id ? { ...res.data.item, acts_at: res.data.wake === 'next_run' ? res.data.acts_at : null } : x)),
    });
    onChangeRef.current?.();
    return true;
  }), [api, refresh, withBusy]);

  const simple = useCallback((fn: (r: InboxRef, item: InboxItem) => Promise<{ ok: boolean; message?: string }>) =>
    (item: InboxItem) => withBusy(item.id, async () => {
      const r = refRef.current;
      if (!r) return false;
      const res = await fn(r, item);
      if (!res.ok) setActionError((res as { message: string }).message);
      await settle();
      return res.ok;
    }), [settle, withBusy]);

  const undo = useMemo(() => simple((r, item) => api.undo(r, item.id)), [api, simple]);
  const undoProfile = useMemo(() => simple((r, item) => (api.undoProfileChange
    ? api.undoProfileChange(r, item.id)
    : Promise.resolve({ ok: false, message: 'Undo needs a newer server.' }))), [api, simple]);
  const dismiss = useMemo(() => simple((r, item) => api.dismiss(r, item.id)), [api, simple]);
  const snooze = useCallback((item: InboxItem, until: string) =>
    simple((r, it) => api.snooze(r, it.id, until))(item), [api, simple]);

  const send = useCallback((body: string, itemId: string | null = null) => withBusy(itemId ?? '__composer', async () => {
    const r = refRef.current;
    const text = body.trim();
    if (!r || !text) return false;
    const res = await api.sendMessage(r, text, itemId);
    if (!res.ok) { setActionError(res.message); return false; }
    // A message into a stale topic opened a new one on the server: re-read.
    if (!itemId && pageRef.current?.topic?.stale) { await refresh(); return true; }
    setPage(p => p && (itemId ? p : { ...p, messages: [...p.messages, res.data.message] }));
    return true;
  }), [api, refresh, withBusy]);

  const actNow = useCallback(() => withBusy('__wake', async () => {
    const r = refRef.current;
    if (!r || !api.wake) return false;
    const res = await api.wake(r);
    if (!res.ok) { setActionError(res.message); return false; }
    await settle();
    return true;
  }), [api, settle, withBusy]);

  const markAllSeen = useCallback(() => {
    const r = refRef.current;
    if (!r) return;
    void api.markSeen(r, { all: true }).then(res => { if (res.ok) onChangeRef.current?.(); });
  }, [api]);

  const loadNotes = useCallback(async () => {
    const r = refRef.current;
    if (!r) return;
    setNotes(await api.getNotes(r));
  }, [api]);

  const forgetNote = useCallback((noteId: string) => withBusy(noteId, async () => {
    const r = refRef.current;
    if (!r) return false;
    const res = await api.forgetNote(r, noteId);
    if (!res.ok) { setActionError(res.message); return false; }
    setNotes(n => n && { ...n, notes: n.notes.filter(x => x.id !== noteId), used_chars: n.notes.filter(x => x.id !== noteId).reduce((s, x) => s + x.body.length, 0) });
    return true;
  }), [api, withBusy]);

  const historySeq = useRef(0);
  const loadHistory = useCallback<UseAgentInboxResult['loadHistory']>(async (kind = null, { more = false } = {}) => {
    const r = refRef.current;
    if (!r) return;
    const prev = historyRef.current;
    const appending = more && prev && prev.kind === kind && prev.nextBefore;
    const mine = ++historySeq.current;
    const forKey = keyRef.current;
    setHistory({
      kind,
      items: appending ? prev.items : [],
      nextBefore: appending ? prev.nextBefore : null,
      loading: true,
      error: false,
    });
    const res = await api.getHistory(r, { kind, before: appending ? prev.nextBefore : null });
    if (mine !== historySeq.current || keyRef.current !== forKey) return;
    setHistory(h => {
      const items = appending && h ? h.items : [];
      if (!res) return { kind, items, nextBefore: appending && h ? h.nextBefore : null, loading: false, error: true };
      const seen = new Set(items.map(i => i.id));
      return { kind, items: [...items, ...res.items.filter(i => !seen.has(i.id))], nextBefore: res.next_before, loading: false, error: false };
    });
  }, [api]);

  const newTopic = useCallback(() => withBusy('__topic', async () => {
    const r = refRef.current;
    if (!r || !api.startTopic) return false;
    const res = await api.startTopic(r);
    if (!res.ok) { setActionError(res.message); return false; }
    setTopics(null);
    await refresh();
    return true;
  }), [api, refresh, withBusy]);

  const reopenTopic = useCallback((topicId: string) => withBusy('__topic', async () => {
    const r = refRef.current;
    if (!r || !api.reopenTopic) return false;
    const res = await api.reopenTopic(r, topicId);
    if (!res.ok) { setActionError(res.message); return false; }
    setTopics(null);
    await refresh();
    return true;
  }), [api, refresh, withBusy]);

  const topicsRef = useRef(topics);
  topicsRef.current = topics;
  const loadTopics = useCallback<UseAgentInboxResult['loadTopics']>(async ({ more = false } = {}) => {
    const r = refRef.current;
    if (!r || !api.listTopics) return;
    const prev = topicsRef.current;
    const before = more && prev ? prev.nextBefore : null;
    setTopics({ items: more && prev ? prev.items : [], nextBefore: before, loading: true });
    const res = await api.listTopics(r, { before });
    setTopics(t => ({
      items: [...(more && t ? t.items : []), ...(res ? res.topics : [])],
      nextBefore: res ? res.next_before : null,
      loading: false,
    }));
  }, [api]);

  const readTopic = useCallback(async (topicId: string) => {
    const r = refRef.current;
    if (!r || !api.getTopic) return null;
    return api.getTopic(r, topicId);
  }, [api]);

  return {
    hasTopics: Boolean(page && page.topic && api.startTopic),
    newTopic, reopenTopic, topics, loadTopics, readTopic, undoProfile,
    page, loading, error, actionError, busy, refresh,
    answer, undo, dismiss, snooze, send, actNow, markAllSeen, notes, loadNotes, forgetNote,
    history, loadHistory,
  };
}

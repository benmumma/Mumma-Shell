import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createAgentInboxApi, type AgentInboxApi, type AgentInboxApiOptions, type InboxRef } from './api';
import { totalBadge } from './logic';
import type { InboxItem, InboxNotes, InboxPage, InboxSummary } from './types';

/** How often an open app re-reads its inbox list (also on focus). */
export const INBOX_POLL_MS = 60 * 1000;

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
  markAllSeen: () => void;
  notes: InboxNotes | null;
  loadNotes: () => Promise<void>;
  forgetNote: (noteId: string) => Promise<boolean>;
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
    setActionError(null);
    if (key) void refresh();
  }, [key, refresh]);
  useOnFocus(() => { void refresh(); }, Boolean(key));

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
  const dismiss = useMemo(() => simple((r, item) => api.dismiss(r, item.id)), [api, simple]);
  const snooze = useCallback((item: InboxItem, until: string) =>
    simple((r, it) => api.snooze(r, it.id, until))(item), [api, simple]);

  const send = useCallback((body: string, itemId: string | null = null) => withBusy(itemId ?? '__composer', async () => {
    const r = refRef.current;
    const text = body.trim();
    if (!r || !text) return false;
    const res = await api.sendMessage(r, text, itemId);
    if (!res.ok) { setActionError(res.message); return false; }
    setPage(p => p && (itemId ? p : { ...p, messages: [...p.messages, res.data.message] }));
    return true;
  }), [api, withBusy]);

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

  return {
    page, loading, error, actionError, busy, refresh,
    answer, undo, dismiss, snooze, send, markAllSeen, notes, loadNotes, forgetNote,
  };
}

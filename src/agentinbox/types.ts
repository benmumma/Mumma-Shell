/**
 * Agent Inbox — the shapes Mumapps-Server sends (docs/routes/agent-inbox.md
 * there). Every field an older server might not send is optional or nullable.
 */

export type InboxItemKind = 'card' | 'ask' | 'update';
export type FollowThrough = 'none' | 'pending' | 'acknowledged' | 'done' | 'failed';

export interface InboxBlock {
  type: 'stat' | 'progress' | 'schedule' | 'checklist' | 'link' | 'media' | string;
  /** Server-computed plain-text rendering, for any block type a client does not draw. */
  fallback?: string;
  [key: string]: unknown;
}

export interface InboxLink {
  label: string;
  /** An https URL or an in-app path starting with `/`. */
  url: string;
}

export interface InboxOption {
  key: string;
  label: string;
  means?: string | null;
}

export interface InboxAnswer {
  keys: string[];
  labels: string[];
  text: string | null;
}

export interface InboxItem {
  id: string;
  kind: InboxItemKind;
  status: string;
  title: string | null;
  body: string;
  blocks: InboxBlock[];
  links: InboxLink[];
  created_at: string;
  updated_at: string;
  revision: number;
  unseen?: boolean;
  card_key?: string;
  about_key?: string | null;
  expires_at?: string | null;
  snoozed_until?: string | null;
  question?: string | null;
  decides?: string | null;
  context?: string | null;
  response_type?: 'choice' | 'multi' | 'approval' | 'text' | null;
  options?: InboxOption[];
  recommended_key?: string | null;
  recommendation_reason?: string | null;
  allow_other?: boolean;
  due_at?: string | null;
  default_key?: string | null;
  act_by?: string | null;
  answer?: InboxAnswer | null;
  answered_at?: string | null;
  answered_via?: 'inbox' | 'feed' | 'timeout' | null;
  undo_until?: string | null;
  follow_through?: FollowThrough;
  outcome_summary?: string | null;
  outcome_at?: string | null;
  /** An answer waiting for the agent's next scheduled run: when that is. */
  acts_at?: string | null;
}

export interface InboxMessage {
  id: string;
  item_id: string | null;
  author_type: 'member' | 'agent';
  author_member_id?: string | null;
  body: string;
  created_at: string;
  topic_id?: string | null;
}

export interface InboxProfile {
  home_apps: string[];
  /** `type` is a card-catalog layout (cardTypes.ts); absent on a free-form card. */
  cards: { key: string; label: string; type?: string }[];
  composer: { enabled: boolean; quick_prompts: string[] };
  notify: { push: 'asks' | 'all' | 'none'; badge: 'asks' | 'unread' };
  answers: { wake: 'immediate' | 'next_run' };
  updates: { retention_days: number };
}

/** One row of `GET /api/v1/me/agent-inboxes`. */
export interface InboxSummary {
  household_id: string;
  instance_id: string;
  name: string;
  avatar_path: string | null;
  recipient_member_id: string | null;
  profile: InboxProfile;
  open_asks: number;
  unseen: number;
  /** Agent messages since the member last opened the inbox (server 2026-10-26; absent on older servers). */
  new_replies?: number;
  top_ask: InboxItem | null;
}

/** `GET /api/v1/households/:hid/agents/:id/inbox`. */
export interface InboxPage {
  household_id: string;
  instance_id: string;
  name: string;
  avatar_path: string | null;
  recipient_member_id: string | null;
  profile: InboxProfile;
  cards: InboxItem[];
  asks: InboxItem[];
  answered: InboxItem[];
  updates: InboxItem[];
  snoozed: InboxItem[];
  messages: InboxMessage[];
  seen_at: string | null;
  /** When the agent next runs on its own (Mumapps-Server 2026-10-26+), or null. */
  next_run_at?: string | null;
  /** How the agent actually behaves (Mumapps-Server 2026-10-27+); absent on older servers. */
  behavior?: InboxBehavior;
  /**
   * The current conversation topic (Mumapps-Server inbox m2). `messages` are
   * its messages. `id` null: no topic yet. `stale`: your next message starts a
   * new topic. Absent or null on a server without topics.
   */
  topic?: { id: string | null; title: string | null; opened_at: string | null; stale: boolean } | null;
}

/** One conversation topic (`GET …/inbox/topics`). */
export interface InboxTopic {
  id: string;
  title: string | null;
  summary: string | null;
  opened_at: string;
  last_message_at: string;
  /** null = the current topic. */
  closed_at: string | null;
}

/**
 * The agent's behaviour net of its profile, delivery mode and schedule — what
 * the one line at the top of its inbox says.
 */
export interface InboxBehavior {
  /** The app can start a run now (false for a self-scheduled routine or a paused agent). */
  can_wake: boolean;
  /** 'soon': a run shortly after you answer. 'next_run': it reads answers on its next run. */
  answers: 'soon' | 'next_run';
  /** 'soon': a run shortly after you write. 'next_run': it reads messages on its next run. */
  messages: 'soon' | 'next_run';
  /** 'scheduled': it runs on a clock (see next_run_at). 'on_demand': only when woken. */
  schedule: 'scheduled' | 'on_demand';
  paused: boolean;
}

/** `GET …/inbox/history`: everything the agent wrote, newest first. */
export interface InboxHistoryPage {
  items: InboxItem[];
  /** Pass back as `before` for the next page; null on the last. */
  next_before: string | null;
}

export type InboxHistoryKind = 'ask' | 'update' | 'card';

export interface InboxNote {
  id: string;
  key: string;
  kind: 'fact' | 'plan' | 'watch';
  body: string;
  expires_at: string | null;
  updated_at: string;
}

export interface InboxNotes {
  notes: InboxNote[];
  used_chars: number;
  max_chars: number;
}

/** A write's outcome. Writes never throw either. */
export type InboxResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string };

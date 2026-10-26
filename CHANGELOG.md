# Changelog

Releases are cut as GitHub Releases with the packed tarball attached; this file
is the short version. Entries before 0.7.0 live in the release notes at
https://github.com/benmumma/Mumma-Shell/releases.

## 0.12.0 — visual Now cards

- **Card catalog.** `CARD_TYPES` lists the six card layouts (Week, Next up,
  Progress, Numbers, Checklist, Note), mirroring Mumapps-Server's catalog,
  and `CardTypePreview` draws a layout's sample small for a settings
  gallery. `InboxProfile.cards[]` gains an optional `type`.
- **Week cards draw as a week.** Schedule blocks now render the server's
  shape (`rows: [{ date, label, status }]`): a weekday and date per row, today
  marked, and a chip for done, moved, skipped or missed. Before this they fell
  back to plain text. New `scheduleRows`.
- Checklists show a ring per item and "n of m done". Stat tiles show their
  `change` and shrink long values to fit.
- A typed card (anything but Note) leads with its picture, and its body is a
  caption under it.

## 0.11.1 — a chat box that grows, and "working on it"

- The message box (and "Answer in your own words") is a textarea that grows
  as you type, up to about eight lines, then scrolls. Enter sends,
  Shift+Enter starts a new line.
- After you write to an agent that wakes for messages, the conversation
  shows "{name} is working on it" with a pulsing dots bubble until the reply
  lands, and the open inbox checks back every 15 seconds meanwhile
  (`awaitingReply`, `AWAIT_POLL_MS`).
- Reply timing now says "within a few minutes", not "within a minute": a
  Claude routine takes a minute to start and a few more to run.
- The badge counts agent replies you have not read (`new_replies` on each
  inbox summary, from Mumapps-Server), in both badge modes. New `hasNew(list)`
  is true for anything new at all, so an app can show a dot when the count is
  0. The drawer marks the inbox seen again when a reply lands while it is open.

## 0.11.0 — how each agent works, and Act now

- `AgentInboxPanel` opens with one plain line on how the agent works: whether
  it runs on its own schedule or when you answer, when it reads your answers
  and messages, and when it next runs (or that it is paused). The status
  banner no longer repeats the next run when that line is shown.
- Under the message box, a hint says when the agent will read what you write
  ("usually replies within a minute", or "reads this on its next run, at
  9:30 PM tonight").
- When an agent holds answers for its next run but can be woken, **Your
  answers** offers "Have {name} act on these now".
- `InboxPage.behavior` (`InboxBehavior`), pure helpers `behaviorLine`,
  `composerHint`, `canActNow`, `createAgentInboxApi().wake`, and
  `useAgentInbox().actNow`. Needs Mumapps-Server's `behavior` field and
  `POST …/inbox/wake`; against an older server the line, hint and button
  simply don't show.

## 0.10.0 — the agent inbox dock

- `AgentInboxDock`: on a wide screen (≥ 1200 px) the inboxes are a sidebar
  that opens by itself and pads the page to make room; the member can shrink
  it to a bottom-right bubble, remembered per app. Narrower, it is the bubble,
  opening the same drawer as the header button.
- `MummaHeader`'s `agentInbox` prop now renders the dock by default.
  `placement: 'header'` keeps the 0.9 header icon; `dock: { breakpoint,
  reserveSpace }` tunes it. The prop is otherwise unchanged, so clients repin
  without code changes.
- New CSS hooks: `--mumma-ai-dock-width`, `--mumma-ai-bubble-bottom`, and the
  read-only `--mumma-ai-dock-reserved`.
- `AgentInboxPanel` redesigned. A status line says whether anything needs
  the member ("1 question needs you", "Nothing needs you") and when the agent
  next checks in. Then four views: **Now** (questions first, the recommended
  answer leading as the filled option, the default and deadline spelled out,
  then your recent answers, Now cards and the latest updates), **History**
  (everything the agent wrote, by day, filterable by kind, paged with Show
  older), **Chat**, and **Memory** (with how much of the budget is used).
  An empty inbox explains what will appear.
- `useAgentInbox` gains `history` / `loadHistory(kind, { more })`;
  `createAgentInboxApi` gains `getHistory`. Pure helpers `statusSummary`,
  `historyDays`, `historyStatus`, `kindLabel`, `agoLabel`. Needs
  Mumapps-Server's `…/inbox/history` and `next_run_at`; against an older
  server History shows "isn't available" and the status line leaves out the
  check-in time.

## 0.9.0 — agent inboxes, in any app

- New entry point `@mumma/shell/agentinbox`: the client side of the Agent
  Inbox (Mumapps-Server `docs/routes/agent-inbox.md`). `createAgentInboxApi`
  (never throws), `useAgentInboxes` (the badge list, polled and refreshed on
  focus), `useAgentInbox` (one inbox and every action: answer with an
  optimistic 30 s undo, undo, pass, snooze, clear, message, mark seen, see and
  forget notes), `AgentInboxPanel` and `AgentInboxButton` (header icon + count
  + side drawer, with tabs when there are several agents).
- `MummaHeader` takes an optional `agentInbox={{ baseUrl, app?, instanceId?,
  memberId?, getToken?, onNavigate? }}`. Absent, the header is unchanged;
  signed out or with no inbox in the app, it renders nothing.
- Theming through `--mumma-ai-*`, falling back to the What's New skin.

## 0.8.2 — a Supabase outage no longer signs a device out

- `NativeAuthClient`: when the device's access token has expired and Supabase
  is down, the local refresh fails with a retryable error, and the client
  used to clear state, so the member saw the sign-in screen until the next
  check. The client now keeps state with `stale: true`,
  both when `getSession()`'s own refresh of the expired stored token fails (a
  cold start, or a resume after an hour) and when the explicit refresh after a
  refused bearer fails. On a cold start that is the usual carry-forward
  (`authenticated: false, stale: true`), not a plain sign-out. auth-js already
  keeps the stored session after a retryable error, so the next check
  recovers.
- What counts as an outage matches Mumapps-Auth's `isTransientValidationError`:
  `AuthRetryableFetchError`, `AuthUnknownError`, or a status of 0, 408, 429 or
  ≥ 500. It is exported as `isTransientRefreshError`. A definitive refusal
  (`refresh_token_not_found`, `invalid_grant`, any other 4xx, a missing or
  discarded session) still signs out, and so does a refresh during which
  auth-js itself emitted `SIGNED_OUT` (it does that for a 408/429 on an
  expired token).
- A throw from `getSession()`/`refreshSession()` means the storage adapter or
  the client failed, not that Supabase refused the token (auth-js returns
  Supabase's answers as `error`). It still counts as no session, as before.

## 0.8.1 — the web client never refreshes the shared session itself

- `AuthClient` no longer calls `supabase.auth.getSession()`. In
  @supabase/auth-js 2.x, `getSession()` refreshes the stored token whenever it
  is within 90s of expiry, even with `autoRefreshToken: false`. The expiry
  re-check ran 60s before expiry, inside that margin, so every web app could
  refresh the suite's shared rotating token locally — the second refresher the
  v4 contract forbids (Invariant 1). The auth-status bearer now comes from the
  last auth-status answer, or from the standalone bridge hand-off until the
  first answer lands.
- The expiry re-check moves to 105s before expiry (`RECHECK_LEAD_SECONDS`):
  inside the auth service's 120s proactive-refresh window and clear of
  auth-js's 90s margin.
- While auth-status is unreachable (`stale`), re-checks back off 5s → 5 min
  instead of firing every 5s, and repeated failures no longer notify
  subscribers again (no re-render of every consumer per retry). Recovery resets
  the backoff. Pure `recheckDelayMs()` is exported for tests.
- `NativeAuthClient` is unchanged: a device session is its own refresh-token
  family and refreshes locally by design (Invariant 5).

## 0.8.0 — What's new, in every app

- New entry `@mumma/shell/whatsnew`: the suite's release-notes feed, read from
  `GET {baseUrl}/api/v1/releases` (entries authored in Mission Control →
  Release Notes). `fetchReleaseNotes` never throws — any failure is `null`.
- Seen tracking per app in `localStorage` (`mumma:whatsnew:v1:<app>`);
  `unreadCount` caps a first visit at the newest 5.
- `useReleaseNotes` (one fetch per mount, a shared five-minute cache, `loadMore`),
  the presentational `WhatsNewPanel` (kind chips, "Across Mumma apps", text-only
  bodies, date groups, empty/error states, Load more) and `WhatsNewButton`
  (unread dot, accessible dialog, `renderTrigger`), themed by `--mumma-wn-*`.
- `MummaHeader` takes an optional `whatsNew={{ baseUrl }}`: a button in the
  actions area plus a "What's new" gear-menu item. Without it the header
  renders exactly as before.

## 0.7.1 — Sign in with Apple never mints a stray account

- `signInWithApple()` posts the identity token to
  `{authBaseUrl}/api/auth/apple-precheck` before `signInWithIdToken`. A definite
  `known: false` throws `AppleNotLinkedError` (with `linkUrl` for
  `/manage-account#sign-in-methods`) and nothing reaches Supabase; a 400 is the
  generic Apple failure; a 429, a 5xx or a dead network fails OPEN and signs in
  exactly as before. The token is never logged.
- `NativeSignIn` renders that state under the Apple button with a "Link your
  Apple ID on the web" button, opened through `openExternal`.

## 0.7.0 — password sign-in on the native screen

- `NativeAuthClient.signInWithPassword({ email, password })`: email + password
  against the device's own Supabase session, landing exactly where
  `verifyEmailCode` lands (same Keychain storage, same refresh-token family,
  same entitlements load). Failures come back as one terse sentence and never
  reveal more than the API already does.
- `NativeSignIn`: a quiet "Use a password instead" link under the code form
  swaps in a password field (email carries over), with "Forgot password?" —
  opened externally via the new `openExternal` / `resetPasswordUrl` props — and
  "Use a code instead" back. The emailed code stays the default method and
  Sign in with Apple stays on the first screen.
- Sign-up is unchanged: web only.

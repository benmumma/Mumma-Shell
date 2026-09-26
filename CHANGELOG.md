# Changelog

Releases are cut as GitHub Releases with the packed tarball attached; this file
is the short version. Entries before 0.7.0 live in the release notes at
https://github.com/benmumma/Mumma-Shell/releases.

## Unreleased (proposed 0.8.2) — a Supabase outage no longer signs a device out

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

# Changelog

Releases are cut as GitHub Releases with the packed tarball attached; this file
is the short version. Entries before 0.7.0 live in the release notes at
https://github.com/benmumma/Mumma-Shell/releases.

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

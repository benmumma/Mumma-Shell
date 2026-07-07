# @mumma/shell

Client-side implementation of the Mumapps Auth v4 contract: a framework-agnostic auth core (`./auth`), a thin React provider/hooks layer (`./react`), and an optional shared app header (`./header`). Any `*.mumma.co` app should consume this package instead of hand-rolling auth-status polling, token hydration, and cross-app logout sync.

The authoritative contract this package implements is documented in **[`Mumapps-Auth/docs/CONTRACT.md`](../Mumapps-Auth/docs/CONTRACT.md)** — read "The Four Invariants" before integrating or modifying this package.

## Install

```bash
npm i github:<owner>/mumma-shell#v0.1.0
```

(Fill in the actual GitHub owner/repo once this package is pushed to a remote. Until then, consume it as a local path or `file:` dependency.)

## Usage

```js
// 1. Create a Supabase client that never refreshes its own tokens —
//    auth.mumma.co is the only refresher (Invariant 1).
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,     // true only in standalone PWA mode
    autoRefreshToken: false,   // REQUIRED — never let Supabase self-refresh
    detectSessionInUrl: false,
  },
});
```

```js
// 2. Create one AuthClient per app, injected with that Supabase client.
import { AuthClient } from '@mumma/shell/auth';
import { supabase } from './supabaseClient.js';

export const mummaAuthClient = new AuthClient({ supabase });
```

```jsx
// 3. Mount the provider above your app tree.
import { MummaAuthProvider, useAuth } from '@mumma/shell/react';
import { mummaAuthClient } from './mummaAuthClient.js';

function Root() {
  return (
    <MummaAuthProvider client={mummaAuthClient}>
      <App />
    </MummaAuthProvider>
  );
}

function App() {
  const { isAuthenticated, isLoading, user, signIn, signOut } = useAuth();
  if (isLoading) return <Spinner />;
  if (!isAuthenticated) return <button onClick={() => signIn()}>Sign in</button>;
  return <button onClick={() => signOut()}>Sign out, {user.email}</button>;
}
```

Optional chrome:

```jsx
import { MummaHeader } from '@mumma/shell/header';

<MummaHeader appName="Forward" logoSrc="/logo.png" familyUrl="https://family.mumma.co" />
```

Optional acting-as-member decoration (client state only, not auth):

```jsx
import { ActingMemberProvider, useActingMember } from '@mumma/shell/react';

const { acting, setActing, decorate } = useActingMember();
await api.completeTask(decorate({ task_id })); // adds completed_by: acting?.member_id ?? null
```

## What this package will never do

- **No client-side token refresh.** `auth.mumma.co` is the only refresher (Invariant 1 of the contract). Renewal is always re-calling `GET /api/auth-status`, never `supabase.auth.refreshSession()`.
- **No cookie writes.** The package never calls `/api/set-auth-cookies` or otherwise writes `mumapps_*` cookies — only the auth service does that.
- **No treating transient failure as logout.** Network errors, non-2xx responses, and `retryable: true` all carry the current auth state forward unchanged (`stale: true`); only an explicit `action: 'clear_cookies'` clears session state.

## Package layout

- `./auth` — `AuthClient` (single-flight status checks, expiry timer, marker-cookie wake watcher, PWA bridge-hash consumption), URL builders, and the contract's TypeScript types.
- `./react` — `MummaAuthProvider`, `useAuth`, `useSession`, `useHousehold`, and the acting-member decoration layer (`ActingMemberProvider`, `useActingMember`).
- `./header` — `MummaHeader`, a thin shared app header (logo/name, back-to-family link, gear menu with account/sign-out). Theme via CSS custom properties; ships no stylesheet.

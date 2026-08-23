# @mumma/shell

Client-side implementation of the Mumapps Auth v4 contract: a framework-agnostic auth core (`./auth`), a thin React provider/hooks layer (`./react`), and an optional shared app header (`./header`). Any `*.mumma.co` app should consume this package instead of hand-rolling auth-status polling, token hydration, and cross-app logout sync.

The authoritative contract this package implements is documented in **[`Mumapps-Auth/docs/CONTRACT.md`](../Mumapps-Auth/docs/CONTRACT.md)** — read "The Four Invariants" before integrating or modifying this package.

## Install

```bash
npm i https://github.com/benmumma/Mumma-Shell/releases/download/v0.3.3/mumma-shell-0.3.3.tgz
# Always install from the GitHub Release tarball (ships prebuilt dist/);
# git deps break under npm ignore-scripts/min-release-age hardening.
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

<MummaHeader appName="Forward" appKey="forward" dekkoUrl="https://dekko.mumma.co" />
```

The app name renders as an app switcher by default — a dropdown listing every
Mumma app (built-in `MUMMA_APPS` registry: Dekko, Forward, Intellect,
MealMate, Library, Arcade, REM, ScholarQuest, Fitter, Pick'em, plus the
access-gated Stonk Master and Mission Control) with icons hotlinked
from `https://www.mumma.co/new_logos/[app_name]_live.png`. Icons that fail to load
(e.g. not uploaded yet) fall back to the Mumma Labs mark at runtime, so new
icons appear without a package release.

Registry entries may be access-gated: entries with `gated: true` (implied by
`requiresAppAccess`) are HIDDEN from the switcher — not locked or greyed —
unless `appAccess[requiresAppAccess]` is truthy. The header reads `appAccess`
from the surrounding `MummaAuthProvider`; pass an explicit `appAccess` prop to
override it (the prop wins). If neither is available (standalone header),
gated entries are omitted — fail-closed.

- `appKey` — registry key of the current app; highlights it in the switcher
  and uses its registry icon when `logoSrc` is omitted.
- `homeHref` — where the brand icon links to; defaults to `/` (the CURRENT
  site's home). A plain same-origin left-click is turned into a fast SPA
  navigation — `history.pushState` plus a synthetic `popstate` event — so
  React-Router/wouter apps re-render without a full reload; modified clicks,
  cross-origin destinations, and non-SPA apps fall back to the plain `href`
  navigation. (`homeUrl` is a deprecated alias.)
- `onHomeNavigate` — callback that replaces the default brand-icon click
  behavior entirely (e.g. `() => navigate('/')`).
- `appAccess` — appAccess map used to filter gated entries; overrides the
  value read from the auth context.
- `logoSrc` — explicit header icon; omit to use the registry icon, falling
  back to the Mumma Labs mark.
- `apps` — override the switcher's app list (`MummaApp[]`).
- `appSwitcher={false}` — plain static title, no dropdown.

### Billing

`useBilling()` folds the raw `subscription` block into the same plan semantics
the server enforces in `entitlements/tierLimits.js` — so no app has to re-derive
"are they past due / which plan / do they have a standalone sub" itself.

```jsx
import { useBilling } from '@mumma/shell/react';

const { plan, coveredByFamilyPlan, hasStandalone, inGrace, slots, byokEnabled, renewsAt } = useBilling();
if (!coveredByFamilyPlan && !hasStandalone('intellect')) return <Upsell />;
if (inGrace) return <PaymentBanner renewsAt={renewsAt} />;
```

A status is **live** when it is `active`/`trialing`, or `past_due` within
`GRACE_DAYS` (7) of `current_period_end` — a `past_due` row with no period end
stays live. Stripe marks a sub `past_due` on the first failed payment while its
own dunning retries run, so grace keeps a card expiry from reading as a
cancellation.

- `plan` — `'household'` only when the household row is live; otherwise `'free'`.
- `status` / `isPastDue` / `inGrace` — the raw household status, whether it is
  `past_due`, and whether that past-due row is still inside grace.
- `coveredByFamilyPlan` — the family plan covers every app by construction.
- `standalone` / `hasStandalone(app)` — LIVE per-app plans, keyed by
  `app_identifier`; `appPlans` keeps every row, live or not.
- `slots`, `byokEnabled`, `renewsAt` — pass-throughs from the household row.

The pure form is `deriveBilling(subscription, now?)` from `@mumma/shell/auth`,
alongside `isLiveStatus(row, now?)` and `GRACE_DAYS`, for non-React callers.
This is read-side only: it drives chrome and upsells, never enforcement.

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

- `./auth` — `AuthClient` (single-flight status checks, expiry timer, marker-cookie wake watcher, PWA bridge-hash consumption), URL builders, the `deriveBilling`/`isLiveStatus` plan helpers, and the contract's TypeScript types.
- `./react` — `MummaAuthProvider`, `useAuth`, `useOptionalAuth`, `useSession`, `useHousehold`, `useSubscription`, `useBilling`, and the acting-member decoration layer (`ActingMemberProvider`, `useActingMember`).
- `./header` — `MummaHeader`, a thin shared app header (app icon with Mumma Labs fallback, app-switcher dropdown, back-to-Dekko link, gear menu with account/sign-out) plus the `MUMMA_APPS` registry. Theme via CSS custom properties; ships no stylesheet.

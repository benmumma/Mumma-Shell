# Migration: @mumma/shell auth + banner → Fitter, Intellect, REM

Date: 2026-07-12
Reference architecture: **Forward-Client** (already integrated).

## Goal
Replace each app's hand-rolled auth with `@mumma/shell`, and replace each app's
header with `MummaHeader` (relocating in-app nav into the banner's `children` /
`actions` slots). Full rewrite to the shell's `useAuth`. All three apps.

All three targets are the same stack as Forward: **CRA (react-scripts 5) + React 18
+ Chakra UI + JavaScript**, env vars `process.env.REACT_APP_*`. None currently
depend on `@mumma/shell`; all already have `@supabase/supabase-js`.

## The Forward contract (what "done" looks like per app)

1. **Dependency** — `package.json`:
   ```json
   "@mumma/shell": "https://github.com/benmumma/Mumma-Shell/releases/download/v0.3.1/mumma-shell-0.3.1.tgz"
   ```
   Add Jest mapping so tests resolve the CJS build:
   ```json
   "jest": { "moduleNameMapper": { "^@mumma/shell/(.*)$": "<rootDir>/node_modules/@mumma/shell/dist/$1/index.cjs" } }
   ```

2. **Supabase client** — one client, per the v4 contract:
   ```js
   import { createClient } from '@supabase/supabase-js';
   function isStandalone() {
     try {
       return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
         || window.navigator?.standalone === true;
     } catch { return false; }
   }
   export const supabase = createClient(REACT_APP_SUPABASE_URL, REACT_APP_SUPABASE_ANON_KEY, {
     auth: {
       persistSession: isStandalone(),   // true ONLY in installed PWA mode
       autoRefreshToken: false,          // REQUIRED — auth.mumma.co is the only refresher
       detectSessionInUrl: false,
     },
   });
   ```
   NOTE: Fitter/REM currently ship `autoRefreshToken: true` — that violates the
   contract (double-spends the shared refresh token). This migration fixes it.

3. **AuthClient** — `src/auth/mummaShellClient.js`:
   ```js
   import { AuthClient } from '@mumma/shell/auth';
   import { supabase } from '../api/supabaseClient.js';
   export const mummaAuthClient = new AuthClient({ supabase }); // authBaseUrl defaults
   ```
   Shell defaults `authBaseUrl`: hostname `*.mumma.local` → `http://auth.mumma.local:2999`,
   else `https://auth.mumma.co`. Do not pass it.

4. **Provider** — wrap the tree inside the existing `<Router>`:
   ```jsx
   import { MummaAuthProvider } from '@mumma/shell/react';
   import { mummaAuthClient } from './auth/mummaShellClient.js';
   <Router><MummaAuthProvider client={mummaAuthClient}><App/></MummaAuthProvider></Router>
   ```

5. **useAuth (full rewrite)** — delete local auth context; consumers import from
   `@mumma/shell/react`. Shell surface:
   `{ user, session, isAuthenticated, isLoading, hasAppAccess(key), signIn(returnTo, mode?), signOut, refreshAuth, getAuthHeaders }`.
   Mapping from the old local API:
   - `appAccess[key]` → `hasAppAccess(key)`
   - `getAccessToken()` → `getAuthHeaders()` (returns `{ Authorization }`)
   - old exported `supabase` from context → import from `api/supabaseClient.js`
   - `signUp(returnTo)` → `signIn(returnTo, 'signup')`
   Preserve each app's existing access-key semantics when gating.

6. **Header (MummaHeader)** — replace the app's header. Render via a single
   per-app `AppShellHeader` wrapper that themes with CSS vars and injects nav:
   ```jsx
   import { MummaHeader } from '@mumma/shell/header';
   const shellVars = { '--mumma-header-bg': ..., '--mumma-header-fg': '#fff',
     '--mumma-menu-bg': ..., '--mumma-menu-fg': ..., '--mumma-menu-border': ... };
   <div style={shellVars}>
     <MummaHeader appName={..} appKey={..} logoSrc={..} familyUrl={..}
       familyUrl handling: hostname.endsWith('.mumma.local')
         ? 'http://family.mumma.local:5007' : 'https://family.mumma.co'
       actions={<AppControls/>}>
       {/* children: desktop nav links/dropdowns + mobile drawer trigger */}
     </MummaHeader>
   </div>
   ```
   The shell logo now links to `/` (homepage) by default (new in this pass);
   pass `homeUrl` to override. `children` renders after the app name; `actions`
   renders on the right before family/gear icons. Preserve full nav
   functionality (all links + mobile drawer) in the flatter banner style.

## Per-app specifics

### REM (`C:\Repositories\REM-Client`) — do FIRST (leanest)
- appKey `rem`; logo `/img/rem_2026.png`.
- Supabase: `src/api/supabaseClient.js`; env in `src/api/constants.js`.
- Delete `src/contexts/AuthContext.js`; rewire `useAuth` consumers.
- Header: `src/general/components/AppHeader.jsx` (nav: Properties/Leases/Contacts/
  Hours/Finances/Analysis; email + Sign out). Mounted per-page in ~10 pages
  (Dashboard, PropertiesPage, PropertyDetail, PropertyForm, LeasesPage, LeaseForm,
  FinancesPage, HoursPage, ContactsPage, FinancialAnalysisBuilderPage).
- Entry: `src/index.jsx` (`Router>App`); `App.jsx` (`ChakraProvider>AuthProvider>AppInner`).
  `ProtectedRoute` exists; no AccessGate. Landing/Waitlist pages exist.

### Fitter (`C:\Repositories\Fitter-Client`)
- appKey `fitter`; logo `/logos/fitter_logo.png`.
- Supabase: `src/api/supabaseClient.js`; env in `src/api/constants.js`.
- Delete `src/contexts/AuthContext.js`; rewire consumers. Keep `AccessGate.jsx`
  (whitelist via `profileService`) but re-point it at shell `useAuth`.
- Header: `src/general/components/Navbar.jsx` mounted via `src/general/components/Layout.jsx`
  (nav: Home/Activities/Analysis/Training dropdown/Settings; avatar menu; mobile drawer).
  `general/components/AppHeader.jsx` is a dead "Shell App" stub — ignore/remove.
- Entry: `src/index.jsx` (`Router>App`); `App.jsx` (`ChakraProvider>AuthProvider>AccessGate>AppInner`).

### Intellect (`C:\Repositories\Intellect-Client`) — do LAST (riskiest)
- appKey `intellect`; access key historically `intellect-inbox`/`intellect` — preserve.
- Supabase: `src/constants/supabaseClient.js` (`ii_supabase`, `ii_supabase_legacy`,
  chooses instance via `REACT_APP_USE_NEW_SUPABASE`).
- Delete vendored `src/auth/CentralizedAuthLib.js`, `useCentralizedAuth.js`,
  `AuthBridge.jsx`; reconcile the legacy Intellect-Inbox auth path
  (`src/account/hooks/useAuth.jsx`, `src/account/**`, `IntellectInboxContext`).
  `App.jsx` currently flag-gates on `REACT_APP_USE_CENTRALIZED_AUTH` — collapse to
  the shell provider unconditionally.
- Headers: `src/intellect_2/components/shell/I2Header.jsx` (primary, in
  `Intellect2Main.jsx`) and `src/general/components/MyHeader.jsx` (marketing/account).
- Entry: `src/index.jsx` (`StrictMode>PostHogProvider>ErrorBoundary>Router>App`).
- Higher risk: dual-mode + legacy path + two headers. Explore before editing.

## Verification (per app)
- `npm run build` clean; existing tests pass (`npm test -- --watchAll=false` / `test:ci`).
- Drive the app (`npm start`) to confirm: unauth → sign-in gate; auth → banner
  renders with app-switcher + account/sign-out; in-app nav (all links + mobile
  drawer) works; logo click returns home.
- Do NOT handle real secrets; rely on each app's existing `.env`.

## Execution
- Separate repo + branch per app. Subagent per app. Commit/push only when the user asks.
- Order: REM → Fitter → Intellect (risk-ascending), with review between.

## Assumptions
- Central auth already recognizes `fitter`/`rem`/`intellect` app-access keys.
- No new env vars; reuse existing `REACT_APP_SUPABASE_*`.

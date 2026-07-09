# App-switcher header — design (2026-07-09)

## Goal

Make `MummaHeader` the shared banner for all Mumma apps (Forward, Intellect,
Fitter, Gallery, …): the app title becomes a Vercel-style app switcher, the
app icon slot gains a Mumma Labs fallback, and the bar gets a bit taller.
Ship as `@mumma/shell` v0.3.0.

## Decisions

- **Scope: lightweight shell + slots.** The header owns switcher, icon,
  family link, gear menu, auth. App-specific nav links, XP/streak widgets,
  theme toggles, and mobile drawers (as seen in Intellect's `I2Header` and
  Fitter's `Navbar`) stay app-owned via the existing `children` / `actions`
  / `menuItems` slots. The package stays zero-dependency and
  style-system-agnostic (inline styles, works inside Chakra apps).
- **App list: baked-in registry**, overridable via an `apps` prop.
- **Icons: hotlinked** from `https://www.mumma.co/new_logos/*_2026.png`
  (served by Mumapps-Client). Gallery, Games, and Family Dashboard icons
  don't exist yet — their URLs are listed anyway and the `<img>` falls back
  to the Mumma Labs icon at runtime via `onError`, so uploading the PNGs
  later requires **no new package version**.
- **Height: 3.5rem** (56px) min-height, up from 3rem.

## Registry (`src/header/apps.ts`)

```ts
export interface MummaApp { key: string; name: string; url: string; iconSrc: string; }
export const MUMMA_LABS_ICON = 'https://www.mumma.co/new_logos/mumma_labs_2026.png';
export const MUMMA_APPS: MummaApp[] = [ /* 9 apps, in this order */ ];
```

| key | name | url | icon file |
|---|---|---|---|
| family | Family Dashboard | https://family.mumma.co | family_2026.png (future) |
| forward | Forward | https://forward.mumma.co | forward_2026.png |
| intellect | Intellect | https://intellect.mumma.co | ii_2026.png |
| mealmate | MealMate | https://mealmate.mumma.co | mm_2026.png |
| gallery | Gallery | https://gallery.mumma.co | gallery_2026.png (future) |
| games | Games | https://games.mumma.co | games_2026.png (future) |
| rem | REM | https://rem.mumma.co | rem_2026.png |
| scholarquest | ScholarQuest | https://scholar.mumma.co | scholar_2026.png |
| fitter | Fitter | https://fitter.mumma.co | fitter_2026.png |

## Header changes (`src/header/MummaHeader.tsx`)

- New props: `apps?: MummaApp[]` (default `MUMMA_APPS`), `appKey?: string`
  (identifies current app; falls back to case-insensitive name match),
  `appSwitcher?: boolean` (default `true`).
- Title renders as a button: app name + chevron. Click opens a dropdown of
  all apps — icon + name per row, current app highlighted with a check,
  rows are plain `<a href>` links.
- `logoSrc` still supported; when omitted, the header shows the current
  app's registry icon, else the Mumma Labs icon. All header/switcher icons
  get an `onError` fallback to `MUMMA_LABS_ICON`.
- Bar `minHeight: 3.5rem`; dropdown offsets updated to match.
- Both dropdowns (switcher + gear) close on outside click and Escape;
  triggers get `aria-expanded` / `aria-haspopup`.

## Testing

Vitest + testing-library (already set up): switcher lists default apps,
`apps` override, current-app highlight via `appKey`, `appSwitcher={false}`
renders plain title, icon fallback on error, Escape/outside-click close.

## Out of scope

Wiring the header into Intellect-Client / Fitter-Client (follow-up per
app); nav-link arrays, mobile drawers, gamification widgets (stay in apps).

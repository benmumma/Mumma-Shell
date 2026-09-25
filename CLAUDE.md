# Mumma-Shell

The `@mumma/shell` shared package — auth client, React provider/hooks, and the
`MummaHeader` chrome consumed by every suite client via a pinned release tarball.

## Suite conventions
Suite contracts live in C:/Repositories/ml-strategy/_suite/contracts/. Before
adding an AI feature, a new app surface, a widget, or access control, read the
relevant contract. Track atomic work items in C:/Repositories/ml-strategy/_tasks/
per the agent contract in that folder's README.

## What's New (C-007)
- `@mumma/shell/whatsnew` (0.8.0+) is the suite's only What's New surface:
  `useReleaseNotes`, `WhatsNewButton`, `WhatsNewPanel`, and `MummaHeader`'s
  `whatsNew={{ baseUrl, app, onNavigate }}` prop. `baseUrl` is the
  Mumapps-Server API base (`https://api.mumma.co` in prod), not Mission Control.
- Every client pins a shell ≥ 0.8.0 and passes the prop (or places the
  button). Keep the prop backwards compatible: a release that breaks it has to
  land with PRs that repin every client (`Dev-Launcher/scripts/shell-pins.sh`
  lists them).
- This repo ships user-visible changes through its consumers. Write a
  `suite` release note only when a shell change is something members would
  notice in every app, such as a sign-in change.

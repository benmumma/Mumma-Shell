/** What kind of change a release note announces; drives the chip. */
export type ReleaseKind = 'new' | 'improved' | 'fixed' | 'balance';

export const RELEASE_KINDS: readonly ReleaseKind[] = ['new', 'improved', 'fixed', 'balance'];

/** The `app` value of a note that applies to every Mumma app. */
export const SUITE_APP = 'suite';

/** One entry from `GET /api/v1/releases`, as the server sends it. */
export interface ReleaseEntry {
  id: string;
  /** A `MUMMA_APPS` key, or `'suite'` for suite-wide notes. */
  app: string;
  title: string;
  summary: string | null;
  /** Plain text: blank-line-separated paragraphs; lines starting `- ` are bullets. */
  body: string | null;
  kind: ReleaseKind;
  /** A relative in-app path starting with `/`, or an https URL. */
  link: string | null;
  /** ISO timestamp. */
  published_at: string;
}

/** A page of notes. `nextBefore` is the cursor for the next (older) page. */
export interface ReleaseNotesPage {
  entries: ReleaseEntry[];
  nextBefore: string | null;
}

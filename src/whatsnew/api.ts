import { RELEASE_KINDS, type ReleaseEntry, type ReleaseKind, type ReleaseNotesPage } from './types';

export const DEFAULT_RELEASE_LIMIT = 20;
export const MAX_RELEASE_LIMIT = 50;

export interface FetchReleaseNotesOptions {
  /** Origin that serves `/api/v1/releases`. A trailing slash is fine. */
  baseUrl: string;
  /** `MUMMA_APPS` key of the app asking. */
  app: string;
  /** 1..50; defaults to 20. */
  limit?: number;
  /** Cursor: only notes published before this ISO timestamp (the previous page's `nextBefore`). */
  before?: string | null;
  /** Include suite-wide notes (`app: 'suite'`). Defaults to true. */
  includeSuite?: boolean;
  /** Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_RELEASE_LIMIT;
  return Math.min(MAX_RELEASE_LIMIT, Math.max(1, Math.floor(limit)));
}

/** Builds the releases URL. Exported for tests and for apps that fetch their own way. */
export function releaseNotesUrl({ baseUrl, app, limit, before, includeSuite = true }: FetchReleaseNotesOptions): string {
  const base = String(baseUrl ?? '').replace(/\/+$/, '');
  const params = new URLSearchParams({ app, limit: String(clampLimit(limit)) });
  if (before) params.set('before', before);
  params.set('suite', includeSuite ? '1' : '0');
  return `${base}/api/v1/releases?${params.toString()}`;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/** Shapes one raw row; drops it (null) when it lacks an id, a title or a parseable date. */
export function normalizeReleaseEntry(raw: unknown): ReleaseEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'number' ? String(r.id) : str(r.id);
  const title = str(r.title);
  const publishedAt = str(r.published_at);
  if (!id || !title || !publishedAt || Number.isNaN(Date.parse(publishedAt))) return null;
  const kind = RELEASE_KINDS.includes(r.kind as ReleaseKind) ? (r.kind as ReleaseKind) : 'new';
  return {
    id,
    app: str(r.app) ?? 'suite',
    title,
    summary: str(r.summary),
    body: str(r.body),
    kind,
    link: str(r.link),
    published_at: publishedAt,
  };
}

/**
 * Fetches one page of release notes. NEVER throws: a network error, a non-2xx
 * (including 400 `UNKNOWN_APP` and 503 while the server is not ready), a
 * non-JSON body or an unexpected shape all resolve to `null`, because a
 * What's New feed must never break the app around it.
 */
export async function fetchReleaseNotes(options: FetchReleaseNotesOptions): Promise<ReleaseNotesPage | null> {
  try {
    if (!options?.baseUrl || !options.app) return null;
    const doFetch = options.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
    if (!doFetch) return null;
    const res = await doFetch(releaseNotesUrl(options), {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      signal: options.signal,
    });
    if (!res || !res.ok) return null;
    const json = (await res.json()) as { success?: unknown; data?: { entries?: unknown; next_before?: unknown } } | null;
    if (!json || json.success !== true || !json.data || !Array.isArray(json.data.entries)) return null;
    const entries = json.data.entries
      .map(normalizeReleaseEntry)
      .filter((e): e is ReleaseEntry => e !== null);
    const nextBefore = str(json.data.next_before);
    return { entries, nextBefore };
  } catch {
    return null;
  }
}

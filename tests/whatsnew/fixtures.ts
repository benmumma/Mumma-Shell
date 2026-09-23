import { vi } from 'vitest';
import type { ReleaseEntry } from '../../src/whatsnew';

export function entry(over: Partial<ReleaseEntry> & { id: string }): ReleaseEntry {
  return {
    app: 'arcade',
    title: `Title ${over.id}`,
    summary: null,
    body: null,
    kind: 'new',
    link: null,
    published_at: '2026-09-20T12:00:00.000Z',
    ...over,
  };
}

/** A fetch mock answering with the releases envelope. */
export function okFetch(entries: unknown[], nextBefore: string | null = null) {
  return vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => ({ success: true, data: { entries, next_before: nextBefore } }),
  });
}

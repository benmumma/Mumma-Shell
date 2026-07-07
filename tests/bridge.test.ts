import { describe, test, expect, vi, beforeEach } from 'vitest';
import { consumeBridgeHash } from '../src/auth/bridge';

const supabase = { auth: { setSession: vi.fn().mockResolvedValue({}), signOut: vi.fn(), getSession: vi.fn() } };

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/app');
  localStorage.clear();
});

describe('consumeBridgeHash', () => {
  test('hydrates from hash tokens, cleans URL, stamps markers', async () => {
    window.location.hash = '#access_token=at&refresh_token=rt&expires_at=123';
    const result = await consumeBridgeHash(supabase as any);
    expect(result).toEqual({ access_token: 'at', refresh_token: 'rt', expires_at: 123 });
    expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'at', refresh_token: 'rt' });
    expect(window.location.hash).toBe('');
    expect(localStorage.getItem('ma_bridge_ts')).toBeTruthy();
    expect(localStorage.getItem('ma_bridge_inflight')).toBeNull();
  });
  test('no-op when hash has no tokens', async () => {
    window.location.hash = '#section-2';
    expect(await consumeBridgeHash(supabase as any)).toBeNull();
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });
});

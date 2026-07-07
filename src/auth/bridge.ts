import type { SupabaseAuthLike, AuthSession } from './types';

/**
 * Standalone-PWA login returns tokens in the URL hash (auth-bridge flow)
 * because the installed app cannot ride the normal redirect. Consume them
 * once: hydrate Supabase, stamp the bridge markers, scrub the URL.
 */
export async function consumeBridgeHash(supabase: SupabaseAuthLike): Promise<AuthSession | null> {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  const expires_at = params.get('expires_at') ? Number(params.get('expires_at')) : null;

  try {
    await supabase.auth.setSession({ access_token, refresh_token });
  } catch {
    // fall through — auth-status will reconcile
  }
  try {
    localStorage.setItem('ma_bridge_ts', String(Date.now()));
    localStorage.setItem('ma_auth_redirect_ts', String(Date.now()));
    localStorage.removeItem('ma_bridge_inflight');
  } catch {}
  try {
    window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
  } catch {}
  return { access_token, refresh_token, expires_at };
}

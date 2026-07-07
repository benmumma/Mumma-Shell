export const MARKER_COOKIE = 'mumapps_sid';

export function readSessionMarker(
  cookieString: string = typeof document !== 'undefined' ? document.cookie : ''
): string | null {
  const m = cookieString.match(new RegExp(`(?:^|; )${MARKER_COOKIE}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

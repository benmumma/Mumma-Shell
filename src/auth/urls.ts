export function resolveAuthBaseUrl(
  hostname: string = typeof window !== 'undefined' ? window.location.hostname : ''
): string {
  return hostname.endsWith('.mumma.local') || hostname === 'mumma.local'
    ? 'http://auth.mumma.local:2999'
    : 'https://auth.mumma.co';
}

export const buildSignInUrl = (base: string, returnTo: string, mode?: 'signup') =>
  `${base}/auth?${mode ? 'mode=signup&' : ''}return_to=${encodeURIComponent(returnTo)}`;

export const buildLogoutUrl = (base: string, returnUrl: string) =>
  `${base}/api/logout?return_url=${encodeURIComponent(returnUrl)}`;

export const buildBridgeUrl = (base: string, returnTo: string) =>
  `${base}/auth-bridge?return_to=${encodeURIComponent(returnTo)}`;

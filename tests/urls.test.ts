import { describe, test, expect } from 'vitest';
import { resolveAuthBaseUrl, buildSignInUrl, buildLogoutUrl, buildBridgeUrl } from '../src/auth/urls';

describe('resolveAuthBaseUrl', () => {
  test('mumma.local hostnames use the local auth service', () => {
    expect(resolveAuthBaseUrl('forward.mumma.local')).toBe('http://auth.mumma.local:2999');
  });
  test('everything else uses production', () => {
    expect(resolveAuthBaseUrl('forward.mumma.co')).toBe('https://auth.mumma.co');
  });
});

describe('url builders', () => {
  const base = 'https://auth.mumma.co';
  test('signIn carries return_to', () => {
    expect(buildSignInUrl(base, 'https://forward.mumma.co/app')).toBe(
      'https://auth.mumma.co/auth?return_to=https%3A%2F%2Fforward.mumma.co%2Fapp'
    );
  });
  test('logout carries return_url', () => {
    expect(buildLogoutUrl(base, 'https://forward.mumma.co')).toBe(
      'https://auth.mumma.co/api/logout?return_url=https%3A%2F%2Fforward.mumma.co'
    );
  });
  test('bridge carries return_to', () => {
    expect(buildBridgeUrl(base, 'https://forward.mumma.co/app')).toBe(
      'https://auth.mumma.co/auth-bridge?return_to=https%3A%2F%2Fforward.mumma.co%2Fapp'
    );
  });
});

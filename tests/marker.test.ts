import { describe, test, expect } from 'vitest';
import { readSessionMarker } from '../src/auth/marker';

describe('readSessionMarker', () => {
  test('parses the marker out of a cookie string', () => {
    expect(readSessionMarker('foo=1; mumapps_sid=user-1.1234; bar=2')).toBe('user-1.1234');
  });
  test('returns null when absent', () => {
    expect(readSessionMarker('foo=1')).toBeNull();
  });
  test('decodes URI-encoded values', () => {
    expect(readSessionMarker('mumapps_sid=user%2D1.99')).toBe('user-1.99');
  });
  test('reads document.cookie by default', () => {
    document.cookie = 'mumapps_sid=abc.123';
    expect(readSessionMarker()).toBe('abc.123');
  });
});

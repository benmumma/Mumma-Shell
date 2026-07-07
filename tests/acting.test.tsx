import { test, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ActingMemberProvider, useActingMember } from '../src/react/acting';

const wrapper = ({ children }: any) => <ActingMemberProvider>{children}</ActingMemberProvider>;
beforeEach(() => localStorage.clear());

test('defaults to null, persists selection, decorates writes', () => {
  const { result } = renderHook(() => useActingMember(), { wrapper });
  expect(result.current.acting).toBeNull();
  expect(result.current.decorate({ done: true })).toEqual({ done: true, completed_by: null });

  act(() => result.current.setActing({ member_id: 'm2', household_id: 'h1', display_name: 'Philipp' }));
  expect(result.current.acting?.member_id).toBe('m2');
  expect(result.current.decorate({ done: true })).toEqual({ done: true, completed_by: 'm2' });
  expect(JSON.parse(localStorage.getItem('mumapps_acting')!).member_id).toBe('m2');

  act(() => result.current.clearActing());
  expect(result.current.acting).toBeNull();
  expect(localStorage.getItem('mumapps_acting')).toBeNull();
});

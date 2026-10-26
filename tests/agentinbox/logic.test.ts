import { test, expect } from 'vitest';
import {
  answerLine, badgeCount, classifyInboxLink, followThroughLine, progressFraction, totalBadge, undoRemainingMs, whenLabel,
} from '../../src/agentinbox';
import { item, summary, profile } from './fixtures';

test('the badge counts open questions, or unseen where the inbox says so', () => {
  expect(badgeCount(summary({ open_asks: 1, unseen: 4 }))).toBe(1);
  expect(badgeCount(summary({ open_asks: 1, unseen: 4, profile: { ...profile, notify: { push: 'asks', badge: 'unread' } } }))).toBe(4);
  expect(totalBadge([summary({ open_asks: 2 }), summary({ open_asks: 1 })])).toBe(3);
  expect(totalBadge(null)).toBe(0);
});

test('whenLabel speaks in local, relative terms', () => {
  const now = new Date(2026, 9, 26, 12, 0, 0);
  expect(whenLabel(new Date(2026, 9, 26, 12, 20).toISOString(), now)).toBe('in 20 min');
  expect(whenLabel(new Date(2026, 9, 26, 21, 0).toISOString(), now)).toMatch(/^at 9.*PM tonight$/);
  expect(whenLabel(new Date(2026, 9, 27, 7, 0).toISOString(), now)).toMatch(/^tomorrow at 7/);
  expect(whenLabel(null, now)).toBeNull();
});

test('undo window and follow-through lines', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');
  const a = item({ status: 'answered', undo_until: '2026-10-26T12:00:20Z', follow_through: 'pending', answer: { keys: ['sun'], labels: ['Sunday'], text: null } });
  expect(undoRemainingMs(a, now)).toBe(20000);
  expect(answerLine(a)).toBe('You chose Sunday');
  // nothing to say while the person can still undo
  expect(followThroughLine(a, 'Coach', new Date(now))).toBeNull();
  const later = new Date('2026-10-26T12:01:00Z');
  expect(followThroughLine(a, 'Coach', later)).toBe('Coach will act on this shortly');
  expect(followThroughLine({ ...a, follow_through: 'done', outcome_summary: 'Moved it to Sunday.' }, 'Coach', later)).toBe('Moved it to Sunday.');
  expect(answerLine({ ...a, status: 'defaulted' })).toBe('No answer by the deadline, so Sunday applied');
});

test('links: in-app paths and https only', () => {
  expect(classifyInboxLink('/fitter/week')).toBe('internal');
  expect(classifyInboxLink('https://strava.com/x')).toBe('external');
  expect(classifyInboxLink('//evil.test')).toBeNull();
  expect(classifyInboxLink('javascript:alert(1)')).toBeNull();
});

test('progress blocks clamp', () => {
  expect(progressFraction({ type: 'progress', value: 50, max: 40 })).toBe(1);
  expect(progressFraction({ type: 'stat', value: 1 })).toBeNull();
});

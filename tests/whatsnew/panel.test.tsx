import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { WhatsNewPanel, parseReleaseBody, classifyReleaseLink } from '../../src/whatsnew';
import { entry } from './fixtures';

test('parseReleaseBody: paragraphs on blank lines, "- " lines become bullets', () => {
  expect(parseReleaseBody('First para\nstill first.\n\n- one\n- two\n\nLast\n- tail')).toEqual([
    { type: 'paragraph', text: 'First para\nstill first.' },
    { type: 'list', items: ['one', 'two'] },
    { type: 'paragraph', text: 'Last' },
    { type: 'list', items: ['tail'] },
  ]);
  expect(parseReleaseBody('a\r\n\r\n  - b  ')).toEqual([{ type: 'paragraph', text: 'a' }, { type: 'list', items: ['b'] }]);
  expect(parseReleaseBody(null)).toEqual([]);
  expect(parseReleaseBody('-not a bullet')).toEqual([{ type: 'paragraph', text: '-not a bullet' }]);
});

test('classifyReleaseLink accepts /paths and https only', () => {
  expect(classifyReleaseLink('/games/overland')).toBe('internal');
  expect(classifyReleaseLink('https://mumma.co/x')).toBe('external');
  expect(classifyReleaseLink('//evil.test/x')).toBeNull();
  expect(classifyReleaseLink('http://mumma.co')).toBeNull();
  expect(classifyReleaseLink('javascript:alert(1)')).toBeNull();
  expect(classifyReleaseLink(null)).toBeNull();
});

test('renders chip, title, summary, body and groups by day', () => {
  render(<WhatsNewPanel locale="en-US" entries={[
    entry({ id: '1', kind: 'improved', title: 'Faster boards', summary: 'Par is kept.', body: 'Intro line.\n\n- one\n- two', published_at: '2026-09-20T15:00:00' }),
    entry({ id: '2', kind: 'fixed', title: 'Scores stick', published_at: '2026-09-20T09:00:00' }),
    entry({ id: '3', kind: 'balance', title: 'Snow comes early', published_at: '2026-09-12T09:00:00' }),
  ]} />);
  expect(screen.getByText('IMPROVED')).toBeTruthy();
  expect(screen.getByText('FIXED')).toBeTruthy();
  expect(screen.getByText('BALANCE')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Faster boards' })).toBeTruthy();
  expect(screen.getByText('Par is kept.')).toBeTruthy();
  expect(screen.getByText('Intro line.').tagName).toBe('P');
  expect(screen.getByText('one').tagName).toBe('LI');
  const sections = screen.getAllByRole('region');
  expect(sections).toHaveLength(2);
  expect(within(sections[0]).getByText('Sep 20, 2026')).toBeTruthy();
  expect(within(sections[0]).getAllByRole('article')).toHaveLength(2);
  expect(within(sections[1]).getByText('Sep 12, 2026')).toBeTruthy();
});

test('suite-wide notes are marked; app notes are not', () => {
  render(<WhatsNewPanel entries={[entry({ id: 's', app: 'suite', title: 'One login' }), entry({ id: 'a', title: 'Arcade thing' })]} />);
  expect(screen.getAllByText('Across Mumma apps')).toHaveLength(1);
  expect(screen.getByText('Across Mumma apps').closest('article')?.textContent).toContain('One login');
});

test('relative links route through onNavigate; https opens a new tab; unsafe links are dropped', () => {
  const onNavigate = vi.fn();
  render(<WhatsNewPanel onNavigate={onNavigate} entries={[
    entry({ id: '1', title: 'Rel', link: '/games/overland' }),
    entry({ id: '2', title: 'Ext', link: 'https://mumma.co/blog' }),
    entry({ id: '3', title: 'Bad', link: 'javascript:alert(1)' }),
  ]} />);
  const rel = screen.getByRole('link', { name: 'Open: Rel' }) as HTMLAnchorElement;
  expect(fireEvent.click(rel)).toBe(false); // default prevented — SPA route
  expect(onNavigate).toHaveBeenCalledWith('/games/overland');
  const ext = screen.getByRole('link', { name: 'Open: Ext' }) as HTMLAnchorElement;
  expect(ext.target).toBe('_blank');
  expect(ext.rel).toContain('noopener');
  expect(screen.queryByRole('link', { name: 'Open: Bad' })).toBeNull();
});

test('without onNavigate a relative link is a plain anchor (browser navigation)', () => {
  render(<WhatsNewPanel entries={[entry({ id: '1', title: 'Rel', link: '/x' })]} />);
  const rel = screen.getByRole('link', { name: 'Open: Rel' });
  expect(rel.getAttribute('href')).toBe('/x');
  expect(rel.getAttribute('target')).toBeNull();
});

test('empty, loading and error states', () => {
  const { rerender } = render(<WhatsNewPanel entries={[]} />);
  expect(screen.getByText('Nothing new yet')).toBeTruthy();
  rerender(<WhatsNewPanel entries={[]} loading />);
  expect(screen.getByRole('status').textContent).toMatch(/loading/i);
  const onRetry = vi.fn();
  rerender(<WhatsNewPanel entries={[]} error onRetry={onRetry} />);
  expect(screen.getByRole('alert').textContent).toMatch(/couldn't load what's new/i);
  fireEvent.click(screen.getByRole('button', { name: /try again/i }));
  expect(onRetry).toHaveBeenCalled();
});

test('Load more appears only with hasMore', () => {
  const onLoadMore = vi.fn();
  const { rerender } = render(<WhatsNewPanel entries={[entry({ id: '1' })]} onLoadMore={onLoadMore} />);
  expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
  rerender(<WhatsNewPanel entries={[entry({ id: '1' })]} hasMore onLoadMore={onLoadMore} />);
  fireEvent.click(screen.getByRole('button', { name: /load more/i }));
  expect(onLoadMore).toHaveBeenCalledTimes(1);
});

test('HTML in any field is rendered as text, never injected', () => {
  const evil = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>';
  const { container } = render(<WhatsNewPanel entries={[
    entry({ id: '1', title: `<b>${evil}</b>`, summary: evil, body: `${evil}\n\n- ${evil}` }),
  ]} />);
  expect(container.querySelector('img, script, b')).toBeNull();
  expect(container.textContent).toContain('<script>');
  expect((window as any).__pwned).toBeUndefined();
});

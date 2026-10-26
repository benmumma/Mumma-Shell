import type { InboxBlock } from './types';

/**
 * The card catalog: the layouts a Now card can be declared with. Mirrors
 * Mumapps-Server `db_query_functions/v1/agents/inbox/cardTypes.js`, which
 * holds the agent to each layout; this side carries what a settings screen
 * shows (a name, a line, and a sample to draw as the tile's preview).
 */
export type CardType = 'week' | 'next_up' | 'progress' | 'numbers' | 'checklist' | 'note';

export interface CardTypeInfo {
  type: CardType;
  label: string;
  blurb: string;
  /** The name a new card of this type starts with. */
  defaultName: string;
  sample: { title: string; body?: string; blocks: InboxBlock[] };
}

export const CARD_TYPES: readonly CardTypeInfo[] = [
  {
    type: 'week', label: 'Week', blurb: 'One row per day, each with a status', defaultName: 'This week',
    sample: {
      title: 'This week',
      blocks: [{ type: 'schedule', rows: [
        { date: '2026-10-27', label: 'Easy 5 mi', status: 'done' },
        { date: '2026-10-29', label: 'Intervals', status: 'planned' },
        { date: '2026-11-01', label: 'Long run', status: 'moved' },
      ] }],
    },
  },
  {
    type: 'next_up', label: 'Next up', blurb: 'The next thing, when, and a few numbers', defaultName: 'Next up',
    sample: {
      title: 'Tempo run, Wed 6:30 AM', body: 'Coolest window of the day.',
      blocks: [{ type: 'stat', label: 'Distance', value: '6 mi' }, { type: 'stat', label: 'Pace', value: '7:45' }],
    },
  },
  {
    type: 'progress', label: 'Progress', blurb: 'Bars toward one to three goals', defaultName: 'Progress',
    sample: {
      title: 'Progress',
      blocks: [{ type: 'progress', label: 'Weekly miles', value: 22, max: 32 }, { type: 'progress', label: 'Runs', value: 3, max: 5 }],
    },
  },
  {
    type: 'numbers', label: 'Numbers', blurb: 'Two to four stat tiles with their change', defaultName: 'Last 7 days',
    sample: {
      title: 'Last 7 days',
      blocks: [{ type: 'stat', label: 'Miles', value: '24.1', change: '+3.2' }, { type: 'stat', label: 'Avg pace', value: '8:12', change: '-0:09' }],
    },
  },
  {
    type: 'checklist', label: 'Checklist', blurb: 'A list to tick off', defaultName: 'Checklist',
    sample: {
      title: 'Race-week prep',
      blocks: [{ type: 'checklist', items: [{ label: 'Lay out kit', done: true }, { label: 'Pick up bib', done: false }] }],
    },
  },
  {
    type: 'note', label: 'Note', blurb: 'A few lines of text', defaultName: 'Note',
    sample: { title: 'Note', body: 'Knee felt fine Sunday; keep the extra rest day one more week.', blocks: [] },
  },
];

export function cardTypeInfo(type: string | null | undefined): CardTypeInfo | null {
  return CARD_TYPES.find(t => t.type === type) ?? null;
}

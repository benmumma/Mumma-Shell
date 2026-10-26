import { test, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentInboxPanel, inboxPath, useAgentInbox, useAgentInboxApi, type AgentInboxView } from '../../src/agentinbox';
import { COACH, HH, ok, page, routeFetch, summary } from './fixtures';

const ref = { householdId: HH, instanceId: COACH };

function server() {
  return routeFetch({
    'GET /api/v1/me/agent-inboxes': () => ok({ inboxes: [summary()] }),
    [`GET ${inboxPath(ref)}`]: () => ok(page({ asks: [] })),
    [`POST ${inboxPath(ref, '/seen')}`]: () => ok({ seen_at: 'x' }),
    [`GET ${inboxPath(ref, '/notes')}`]: () => ok({ notes: [], used_chars: 0, max_chars: 4000, profile: null }),
  });
}

/** An app that draws the tabs itself, as Dekko's channel header does. */
const fetchImpl = server();

function Channel() {
  const api = useAgentInboxApi({ baseUrl: 'https://api.test', getToken: () => 't', fetchImpl });
  const inbox = useAgentInbox(api, ref);
  const [view, setView] = useState<AgentInboxView>('now');
  return (
    <div>
      <nav>
        {(['now', 'history', 'memory'] as const).map(v => (
          <button key={v} type="button" onClick={() => setView(v)}>{`app ${v}`}</button>
        ))}
      </nav>
      <AgentInboxPanel inbox={inbox} view={view} onViewChange={setView} hideTabs />
    </div>
  );
}

test('an app can own the tabs: the panel follows its view and draws no tab strip', async () => {
  render(<Channel />);
  await screen.findByRole('button', { name: 'app now' });
  await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
  expect(screen.queryByRole('tablist')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'app memory' }));
  expect(await screen.findByText(/no notes yet/)).toBeTruthy();
});

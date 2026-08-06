// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InventoryAgent from '../../src/components/InventoryAgent.jsx';

function jsonResponse(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  localStorage.clear();
  global.fetch = vi.fn((url) => {
    if (url === '/api/geocode-status') return jsonResponse({ ready: true });
    if (typeof url === 'string' && url.startsWith('/api/chat/')) return jsonResponse({ messages: [] });
    if (url === '/api/ai/query') return jsonResponse({ answer: 'The answer.' });
    return jsonResponse({});
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('InventoryAgent', () => {
  it('sends the persisted sessionId with each query', async () => {
    render(<InventoryAgent />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText(/ask something like/i), 'how many containers?');
    await user.click(screen.getByRole('button', { name: /ask/i }));

    await waitFor(() => expect(screen.getByText('The answer.')).toBeInTheDocument());

    const queryCall = global.fetch.mock.calls.find(([url]) => url === '/api/ai/query');
    expect(queryCall).toBeTruthy();
    const body = JSON.parse(queryCall[1].body);
    expect(body.sessionId).toBe(localStorage.getItem('inventoryAgentSessionId'));
    expect(body.query).toBe('how many containers?');
  });

  // Regression test: "New chat" used to call DELETE /api/chat/:sessionId on
  // the old session, permanently wiping it from the DB — which defeated the
  // point of the /inventory/chats history page. It should now only reset
  // local state and start a new session, leaving the old conversation intact.
  it('New chat starts a fresh session without deleting the old one', async () => {
    render(<InventoryAgent />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText(/ask something like/i), 'first question');
    await user.click(screen.getByRole('button', { name: /ask/i }));
    await waitFor(() => expect(screen.getByText('The answer.')).toBeInTheDocument());

    const originalSessionId = localStorage.getItem('inventoryAgentSessionId');

    await user.click(screen.getByRole('button', { name: /new chat/i }));

    const newSessionId = localStorage.getItem('inventoryAgentSessionId');
    expect(newSessionId).not.toBe(originalSessionId);
    expect(screen.queryByText('first question')).not.toBeInTheDocument();

    // The old session must never be deleted.
    const deleteCalls = global.fetch.mock.calls.filter(([, opts]) => opts?.method === 'DELETE');
    expect(deleteCalls).toHaveLength(0);
  });
});

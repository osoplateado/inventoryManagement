import { describe, expect, it, beforeEach } from 'vitest';
import request from 'supertest';
import { app, openaiMock } from './testServer.js';

beforeEach(() => {
  // /api/ai/query calls through classifyIntent -> generateFilters (or
  // searchNotesSemantically) -> summarizeContainerResults, each a separate
  // OpenAI call. Queue up enough canned responses to get through all of
  // them without the route erroring, since we only care about persistence
  // here, not what the "AI" actually says.
  openaiMock.chat.completions.create
    .mockReset()
    .mockResolvedValueOnce({ choices: [{ message: { content: '{"intent":"structured_query"}' }, finish_reason: 'stop' }] })
    .mockResolvedValueOnce({ choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] })
    .mockResolvedValue({ choices: [{ message: { content: 'Here is your answer.' }, finish_reason: 'stop' }] });
});

describe('AI chat persistence', () => {
  it('persists both sides of an exchange under the given sessionId', async () => {
    const res = await request(app)
      .post('/api/ai/query')
      .send({ query: 'how many containers?', history: [], sessionId: 'test-session-1' });
    expect(res.status).toBe(200);
    expect(res.body.answer).toBeTruthy();

    const history = await request(app).get('/api/chat/test-session-1');
    expect(history.body.messages).toEqual([
      { role: 'user', text: 'how many containers?' },
      { role: 'assistant', text: res.body.answer },
    ]);
  });

  it('does not persist anything when no sessionId is given', async () => {
    await request(app).post('/api/ai/query').send({ query: 'anonymous question', history: [] });
    const all = await request(app).get('/api/chat');
    expect(all.body.sessions).toEqual([]);
  });

  it('groups sessions and orders them newest-first in GET /api/chat', async () => {
    await request(app).post('/api/ai/query').send({ query: 'q1', history: [], sessionId: 'session-a' });
    await request(app).post('/api/ai/query').send({ query: 'q2', history: [], sessionId: 'session-b' });

    const all = await request(app).get('/api/chat');
    expect(all.body.sessions).toHaveLength(2);
    expect(all.body.sessions.map((s) => s.sessionId).sort()).toEqual(['session-a', 'session-b']);
  });

  it('DELETE /api/chat/:sessionId removes only that session', async () => {
    await request(app).post('/api/ai/query').send({ query: 'q1', history: [], sessionId: 'keep-me' });
    await request(app).post('/api/ai/query').send({ query: 'q2', history: [], sessionId: 'delete-me' });

    const del = await request(app).delete('/api/chat/delete-me');
    expect(del.status).toBe(204);

    const kept = await request(app).get('/api/chat/keep-me');
    expect(kept.body.messages).toHaveLength(2);
    const deleted = await request(app).get('/api/chat/delete-me');
    expect(deleted.body.messages).toHaveLength(0);
  });
});

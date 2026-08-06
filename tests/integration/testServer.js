import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { app, initializeDatabase, closeDatabase, runStatement, __setOpenAIClientForTests } from '../../server.js';

// Never let a test call the real OpenAI API — cost, network flakiness, and
// non-deterministic output all make that unsuitable for automated tests.
// Every server.js function that talks to OpenAI (geocoding, filter
// extraction, summarization, location normalization) goes through this one
// fake client, swapped in via server.js's __setOpenAIClientForTests seam.
// Individual tests can override a specific call with
// `openaiMock.chat.completions.create.mockResolvedValueOnce(...)`.
export const openaiMock = {
  chat: {
    completions: {
      create: vi.fn().mockResolvedValue({
        choices: [{ message: { content: '{}' }, finish_reason: 'stop' }],
      }),
    },
  },
};
__setOpenAIClientForTests(openaiMock);

// Shared setup for every integration test file: boots the real Express app
// against the local test Postgres database (see tests/setup/vitest.setup.js
// for the connection string), and wipes app-owned tables between tests so
// they can't see leftovers from one another. Import this for its side
// effects (`import '../integration/testServer.js'`) alongside `app`.
export { app };

beforeAll(async () => {
  await initializeDatabase();
});

afterEach(async () => {
  await runStatement('TRUNCATE containers, chat_messages');
  openaiMock.chat.completions.create.mockClear();
});

afterAll(async () => {
  await closeDatabase();
});

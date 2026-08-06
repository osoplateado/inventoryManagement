import '@testing-library/jest-dom/vitest';

// Test-only environment config — never point this at the real Render DB.
// loadEnvFile() in server.js only fills in vars that aren't already set, so
// setting these here (before server.js is ever imported by a test) takes
// priority over whatever's in .env.
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST || 'postgresql://inventory_test:localtest@localhost:5432/inventory_test';
process.env.DATABASE_SSL = 'false';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-not-real';

// NOTE: the OpenAI client mock lives in tests/integration/testServer.js
// instead of here. vi.mock() is only reliably hoisted above the imports of
// the file that calls it directly — a mock declared in this shared setup
// file does not reliably apply to server.js's `require('openai')` by the
// time individual test files import it.

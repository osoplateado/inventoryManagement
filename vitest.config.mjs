import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Default environment is plain Node (server.js tests). Frontend
    // component tests opt into jsdom individually via a
    // `// @vitest-environment jsdom` docblock at the top of the file —
    // keeps server tests fast and avoids a global jsdom cost for every file.
    environment: 'node',
    setupFiles: ['./tests/setup/vitest.setup.js'],
    // Integration tests share one real Postgres connection pool and hit the
    // same tables, so they can't run concurrently against each other.
    fileParallelism: false,
    testTimeout: 15000,
  },
});

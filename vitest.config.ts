import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // Node 25+ has its own localStorage, empty without --localstorage-file, and it hides the test page's
    // (happy-dom) localStorage; switched off so the tests behave the same on every Node
    execArgv: ['--no-experimental-webstorage'],
  },
});

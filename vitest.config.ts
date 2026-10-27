import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['packages/*/src/**/*.test.ts', 'packages/*/test/**/*.test.ts', 'tools/*/src/**/*.test.ts', 'tools/*/test/**/*.test.ts', 'apps/*/src/**/*.test.ts'], testTimeout: 60000 },
});

import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const workflowModulePath = fileURLToPath(new URL('./src/workflow/public.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@emberai/agent-node/workflow': workflowModulePath,
    },
  },
  test: {
    globals: true,
    setupFiles: ['./tests/setup/vitest.unit.setup.ts'],
    include: ['src/**/*.unit.test.ts'],
  },
});

import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const setupFiles = ['./tests/setup/vitest.setup.ts'];
const runtimeContractsEntry = fileURLToPath(
  new URL('../../../../agent-runtime/lib/contracts/src/index.ts', import.meta.url),
);
const workflowCoreEntry = fileURLToPath(new URL('../agent-workflow-core/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      'agent-runtime-contracts': runtimeContractsEntry,
      'agent-workflow-core': workflowCoreEntry,
    },
  },
  test: {
    name: 'unit',
    globals: true,
    environment: 'node',
    setupFiles,
    passWithNoTests: true,
    include: ['src/**/*.unit.test.ts', 'tests/**/*.unit.test.ts'],
    exclude: ['src/**/*.int.test.ts', 'src/**/*.e2e.test.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage/unit',
      reporter: ['text', 'lcov'],
    },
    typecheck: {
      tsconfig: './tsconfig.vitest.json',
    },
  },
});

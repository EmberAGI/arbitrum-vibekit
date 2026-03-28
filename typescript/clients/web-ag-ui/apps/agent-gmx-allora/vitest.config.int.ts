import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const setupFiles = ['./tests/setup/vitest.setup.ts'];
const runtimeContractsEntry = fileURLToPath(
  new URL('../../../../lib/pi-runtime-legacy-contracts/src/index.ts', import.meta.url),
);
const workflowCoreEntry = fileURLToPath(new URL('../agent-workflow-core/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      'pi-runtime-legacy-contracts': runtimeContractsEntry,
      'agent-workflow-core': workflowCoreEntry,
    },
  },
  test: {
    name: 'integration',
    globals: true,
    environment: 'node',
    setupFiles,
    include: ['tests/**/*.int.test.ts'],
    passWithNoTests: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    typecheck: {
      tsconfig: './tsconfig.vitest.json',
    },
  },
});

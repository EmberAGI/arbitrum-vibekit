import type { PiRuntimeGatewayService } from 'agent-runtime';
import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_EMBER_LENDING_RUNTIME_MODULE,
  loadEmberLendingRuntimeModule,
} from './privateRuntime.js';

function createStubService(): PiRuntimeGatewayService {
  return {
    connect: async () => [],
    run: async () => [],
    stop: async () => [],
    control: {
      inspectHealth: async () => ({ status: 'ok' }),
      listThreads: async () => [],
      listExecutions: async () => [],
      listAutomations: async () => [],
      listAutomationRuns: async () => [],
      inspectScheduler: async () => ({ dueAutomationIds: [], leases: [] }),
      inspectOutbox: async () => ({ dueOutboxIds: [], intents: [] }),
      inspectMaintenance: async () => ({ recovery: {}, archival: {} }),
    },
  };
}

describe('loadEmberLendingRuntimeModule', () => {
  it('loads the private Ember runtime module from the configured module specifier', async () => {
    const createEmberLendingGatewayService = vi.fn(() => createStubService());
    const importModule = vi.fn(async () => ({
      createEmberLendingGatewayService,
    }));

    const runtimeModule = await loadEmberLendingRuntimeModule(
      {
        EMBER_LENDING_RUNTIME_MODULE: '@private/ember-lending-runtime',
      },
      { importModule },
    );

    expect(importModule).toHaveBeenCalledWith('@private/ember-lending-runtime');
    expect(runtimeModule.createEmberLendingGatewayService).toBe(createEmberLendingGatewayService);
  });

  it('falls back to the default private module name when no override is configured', async () => {
    const importModule = vi.fn(async () => ({
      createEmberLendingGatewayService: () => createStubService(),
    }));

    await loadEmberLendingRuntimeModule({}, { importModule });

    expect(importModule).toHaveBeenCalledWith(DEFAULT_EMBER_LENDING_RUNTIME_MODULE);
  });

  it('rejects modules that do not expose the expected service factory', async () => {
    await expect(
      loadEmberLendingRuntimeModule(
        {
          EMBER_LENDING_RUNTIME_MODULE: '@private/bad-runtime',
        },
        {
          importModule: async () => ({}),
        },
      ),
    ).rejects.toThrow(
      'Private Ember lending runtime module "@private/bad-runtime" must export createEmberLendingGatewayService().',
    );
  });
});

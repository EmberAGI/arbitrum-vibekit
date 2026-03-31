import { describe, expect, it, vi } from 'vitest';

import type { AgentRuntimeService } from 'agent-runtime';

import { preparePortfolioManagerServer } from './startup.js';

function createStubService(): AgentRuntimeService {
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
    createAgUiHandler: () => async () => new Response(null),
  };
}

describe('preparePortfolioManagerServer', () => {
  it('forwards the provided env directly into the blessed service factory', async () => {
    const service = createStubService();
    const createService = vi.fn(async () => service);

    await expect(
      preparePortfolioManagerServer({
        env: {
          OPENROUTER_API_KEY: 'test-openrouter-key',
          DATABASE_URL: 'postgresql://portfolio:secret@db.internal:5432/pi_runtime',
          PORT: '3420',
        },
        createService,
      }),
    ).resolves.toEqual({
      port: 3420,
      service,
    });

    expect(createService).toHaveBeenCalledWith({
      env: {
        OPENROUTER_API_KEY: 'test-openrouter-key',
        DATABASE_URL: 'postgresql://portfolio:secret@db.internal:5432/pi_runtime',
        PORT: '3420',
      },
    });
  });

  it('uses the default portfolio-manager port when no override is configured', async () => {
    const service = createStubService();
    const createService = vi.fn(async () => service);

    await expect(
      preparePortfolioManagerServer({
        env: {
          OPENROUTER_API_KEY: 'test-openrouter-key',
        },
        createService,
      }),
    ).resolves.toEqual({
      port: 3420,
      service,
    });

    expect(createService).toHaveBeenCalledWith({
      env: {
        OPENROUTER_API_KEY: 'test-openrouter-key',
      },
    });
  });
});

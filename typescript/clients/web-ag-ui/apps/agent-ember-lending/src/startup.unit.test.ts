import { describe, expect, it, vi } from 'vitest';

import type { AgentRuntimeService } from 'agent-runtime';

import { prepareEmberLendingServer } from './startup.js';

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

describe('prepareEmberLendingServer', () => {
  it('forwards the provided env directly into the blessed service factory', async () => {
    const service = createStubService();
    const createService = vi.fn(async () => service);
    const inspectHealth = vi.spyOn(service.control, 'inspectHealth');

    await expect(
      prepareEmberLendingServer({
        env: {
          OPENROUTER_API_KEY: 'test-openrouter-key',
          DATABASE_URL: 'postgresql://lending:secret@db.internal:5432/pi_runtime',
          PORT: '3430',
        },
        createService,
      }),
    ).resolves.toEqual({
      port: 3430,
      service,
    });

    expect(createService).toHaveBeenCalledWith({
      env: {
        OPENROUTER_API_KEY: 'test-openrouter-key',
        DATABASE_URL: 'postgresql://lending:secret@db.internal:5432/pi_runtime',
        PORT: '3430',
      },
    });
    expect(inspectHealth).toHaveBeenCalledOnce();
  });

  it('uses the default lending port when no override is configured', async () => {
    const service = createStubService();
    const createService = vi.fn(async () => service);
    const inspectHealth = vi.spyOn(service.control, 'inspectHealth');

    await expect(
      prepareEmberLendingServer({
        env: {
          OPENROUTER_API_KEY: 'test-openrouter-key',
        },
        createService,
      }),
    ).resolves.toEqual({
      port: 3430,
      service,
    });

    expect(createService).toHaveBeenCalledWith({
      env: {
        OPENROUTER_API_KEY: 'test-openrouter-key',
      },
    });
    expect(inspectHealth).toHaveBeenCalledOnce();
  });

  it('fails closed when startup health inspection fails', async () => {
    const service = createStubService();
    vi.spyOn(service.control, 'inspectHealth').mockRejectedValue(new Error('identity preflight failed'));
    const createService = vi.fn(async () => service);

    await expect(
      prepareEmberLendingServer({
        env: {
          OPENROUTER_API_KEY: 'test-openrouter-key',
        },
        createService,
      }),
    ).rejects.toThrow('identity preflight failed');
  });
});

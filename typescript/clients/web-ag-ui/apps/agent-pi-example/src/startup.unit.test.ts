import { describe, expect, it, vi } from 'vitest';

import type { AgentRuntimeService } from 'agent-runtime';

import { preparePiExampleServer } from './startup.js';

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
  };
}

describe('preparePiExampleServer', () => {
  it('forwards the provided env directly into the blessed service factory', async () => {
    const service = createStubService();
    const createService = vi.fn(async () => service);

    await expect(
      preparePiExampleServer({
        env: {
          DATABASE_URL: 'postgresql://custom-user:custom-pass@db.internal:5432/custom_runtime',
          PORT: '4010',
          E2E_PROFILE: 'mocked',
        },
        createService,
      }),
    ).resolves.toEqual({
      databaseUrl: 'postgresql://custom-user:custom-pass@db.internal:5432/custom_runtime',
      port: 4010,
      service,
    });

    expect(createService).toHaveBeenCalledWith({
      env: {
        DATABASE_URL: 'postgresql://custom-user:custom-pass@db.internal:5432/custom_runtime',
        PORT: '4010',
        E2E_PROFILE: 'mocked',
      },
    });
  });

  it('reports null when no explicit DATABASE_URL override is configured', async () => {
    const service = createStubService();
    const createService = vi.fn(async () => service);

    await expect(
      preparePiExampleServer({
        env: {
          E2E_PROFILE: 'mocked',
        },
        createService,
      }),
    ).resolves.toEqual({
      databaseUrl: null,
      port: 3410,
      service,
    });

    expect(createService).toHaveBeenCalledWith({
      env: {
        E2E_PROFILE: 'mocked',
      },
    });
  });
});

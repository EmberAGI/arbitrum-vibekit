import type { PiRuntimeGatewayService } from 'agent-runtime';
import { describe, expect, it, vi } from 'vitest';

import type { PiExampleRuntimeStateStore } from './runtimeState.js';
import { preparePiExampleServer } from './startup.js';

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

describe('preparePiExampleServer', () => {
  it('ensures local runtime readiness before creating the service', async () => {
    const service = createStubService();
    const scheduler = {
      stop: vi.fn(),
    };
    const ensureReady = vi.fn(async () => ({
      bootstrapPlan: {
        mode: 'local-docker' as const,
        databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
        startCommand:
          'docker run --name pi-runtime-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pi_runtime -p 55432:5432 -d postgres:17',
      },
      databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
      startedLocalDocker: true,
    }));
    const createService = vi.fn(() => service);
    const startScheduler = vi.fn(() => scheduler);

    await expect(
      preparePiExampleServer({
        env: {
          PORT: '4010',
          E2E_PROFILE: 'mocked',
        },
        ensureReady,
        createService,
        startScheduler,
      }),
    ).resolves.toEqual({
      bootstrap: {
        bootstrapPlan: {
          mode: 'local-docker',
          databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
          startCommand:
            'docker run --name pi-runtime-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pi_runtime -p 55432:5432 -d postgres:17',
        },
        databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
        startedLocalDocker: true,
      },
      port: 4010,
      service,
      scheduler,
    });

    expect(ensureReady).toHaveBeenCalledTimes(1);
    expect(createService).toHaveBeenCalledWith({
      env: {
        PORT: '4010',
        E2E_PROFILE: 'mocked',
      },
      runtimeState: expect.any(Object) as PiExampleRuntimeStateStore,
    });
    expect(startScheduler).toHaveBeenCalledWith({
      databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
      runtimeState: expect.any(Object) as PiExampleRuntimeStateStore,
    });
    expect(ensureReady.mock.invocationCallOrder[0]).toBeLessThan(createService.mock.invocationCallOrder[0]);
    expect(createService.mock.invocationCallOrder[0]).toBeLessThan(startScheduler.mock.invocationCallOrder[0]);
  });
});

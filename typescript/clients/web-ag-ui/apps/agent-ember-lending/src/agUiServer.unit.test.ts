import { describe, expect, it, vi } from 'vitest';

import type { AgentRuntimeService } from 'agent-runtime';

import { createEmberLendingGatewayService } from './agUiServer.js';

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

describe('createEmberLendingGatewayService', () => {
  it('runs service-identity preflight before runtime creation when the live Shared Ember path is configured', async () => {
    const service = createStubService();
    const ensureServiceIdentity = vi.fn(async () => ({
      revision: 2,
      wroteIdentity: false,
      identity: {
        wallet_address: '0x00000000000000000000000000000000000000b1',
      },
    }));
    const createAgentRuntime = vi.fn(async () => ({
      service,
    }));

    await expect(
      createEmberLendingGatewayService({
        env: {
          OPENROUTER_API_KEY: 'test-openrouter-key',
          SHARED_EMBER_BASE_URL: 'http://127.0.0.1:56436',
          EMBER_LENDING_OWS_BASE_URL: 'http://127.0.0.1:4020',
        },
        __internalEnsureServiceIdentity: ensureServiceIdentity,
        __internalCreateAgentRuntime: createAgentRuntime,
      } as never),
    ).resolves.toBe(service);

    expect(ensureServiceIdentity).toHaveBeenCalledOnce();
    expect(createAgentRuntime).toHaveBeenCalledOnce();
    expect(ensureServiceIdentity.mock.invocationCallOrder[0]).toBeLessThan(
      createAgentRuntime.mock.invocationCallOrder[0],
    );
  });

  it('fails closed before runtime creation when the lending service identity cannot be established', async () => {
    const ensureServiceIdentity = vi.fn(async () => {
      throw new Error(
        'Lending startup identity preflight failed because the local OWS signer did not resolve a wallet address.',
      );
    });
    const createAgentRuntime = vi.fn(async () => ({
      service: createStubService(),
    }));

    await expect(
      createEmberLendingGatewayService({
        env: {
          OPENROUTER_API_KEY: 'test-openrouter-key',
          SHARED_EMBER_BASE_URL: 'http://127.0.0.1:56436',
          EMBER_LENDING_OWS_BASE_URL: 'http://127.0.0.1:4020',
        },
        __internalEnsureServiceIdentity: ensureServiceIdentity,
        __internalCreateAgentRuntime: createAgentRuntime,
      } as never),
    ).rejects.toThrow(
      'Lending startup identity preflight failed because the local OWS signer did not resolve a wallet address.',
    );

    expect(createAgentRuntime).not.toHaveBeenCalled();
  });
});

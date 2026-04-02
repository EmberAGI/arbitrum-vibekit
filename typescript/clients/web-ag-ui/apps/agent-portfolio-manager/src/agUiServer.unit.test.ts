import { describe, expect, it, vi } from 'vitest';

import type { AgentRuntimeService } from 'agent-runtime';

import { createPortfolioManagerGatewayService } from './agUiServer.js';

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

describe('createPortfolioManagerGatewayService', () => {
  it('runs controller-wallet identity preflight before runtime creation when the live Shared Ember path is configured', async () => {
    const service = createStubService();
    const ensureServiceIdentity = vi.fn(async () => ({
      revision: 2,
      wroteIdentity: false,
      identity: {
        wallet_address: '0x00000000000000000000000000000000000000c1',
      },
    }));
    const createAgentRuntime = vi.fn(async () => ({
      service,
    }));

    await expect(
      createPortfolioManagerGatewayService({
        env: {
          OPENROUTER_API_KEY: 'test-openrouter-key',
          SHARED_EMBER_BASE_URL: 'http://127.0.0.1:56436',
          PORTFOLIO_MANAGER_OWS_BASE_URL: 'http://127.0.0.1:4030',
        },
        __internalEnsureServiceIdentity: ensureServiceIdentity,
        __internalCreateAgentRuntime: createAgentRuntime,
      } as never),
    ).resolves.toBe(service);

    expect(ensureServiceIdentity).toHaveBeenCalledOnce();
    expect(createAgentRuntime).toHaveBeenCalledOnce();
    const ensureInvocationOrder = ensureServiceIdentity.mock.invocationCallOrder[0];
    const runtimeInvocationOrder = createAgentRuntime.mock.invocationCallOrder[0];
    expect(ensureInvocationOrder).toEqual(expect.any(Number));
    expect(runtimeInvocationOrder).toEqual(expect.any(Number));
    if (ensureInvocationOrder === undefined || runtimeInvocationOrder === undefined) {
      throw new Error('expected both preflight and runtime creation to be invoked');
    }
    expect(ensureInvocationOrder).toBeLessThan(runtimeInvocationOrder);
  });

  it('fails closed before runtime creation when the controller wallet identity cannot be established', async () => {
    const ensureServiceIdentity = vi.fn(async () => {
      throw new Error(
        'Portfolio-manager startup identity preflight failed because the local OWS controller did not resolve a wallet address.',
      );
    });
    const createAgentRuntime = vi.fn(async () => ({
      service: createStubService(),
    }));

    await expect(
      createPortfolioManagerGatewayService({
        env: {
          OPENROUTER_API_KEY: 'test-openrouter-key',
          SHARED_EMBER_BASE_URL: 'http://127.0.0.1:56436',
          PORTFOLIO_MANAGER_OWS_BASE_URL: 'http://127.0.0.1:4030',
        },
        __internalEnsureServiceIdentity: ensureServiceIdentity,
        __internalCreateAgentRuntime: createAgentRuntime,
      } as never),
    ).rejects.toThrow(
      'Portfolio-manager startup identity preflight failed because the local OWS controller did not resolve a wallet address.',
    );

    expect(createAgentRuntime).not.toHaveBeenCalled();
  });
});

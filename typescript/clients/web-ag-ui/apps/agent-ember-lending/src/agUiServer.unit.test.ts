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
    const runtimeCreated = vi.fn();
    const createAgentRuntimeKernel = vi.fn(async ({ createRuntimeOptions }) => {
      const signing = {
        readAddress: vi.fn(async () => '0x00000000000000000000000000000000000000b1' as const),
        signPayload: vi.fn(),
      };
      await createRuntimeOptions({
        signing,
      });
      runtimeCreated();
      return {
        service,
        signing,
      };
    });

    await expect(
      createEmberLendingGatewayService({
        env: {
          OPENROUTER_API_KEY: 'test-openrouter-key',
          SHARED_EMBER_BASE_URL: 'http://127.0.0.1:56436',
          EMBER_LENDING_OWS_WALLET_NAME: 'ember-lending-service-wallet',
          EMBER_LENDING_OWS_VAULT_PATH: '/tmp/ember-lending-ows-vault',
        },
        __internalEnsureServiceIdentity: ensureServiceIdentity,
        __internalCreateAgentRuntimeKernel: createAgentRuntimeKernel,
      } as never),
    ).resolves.toBe(service);

    expect(ensureServiceIdentity).toHaveBeenCalledOnce();
    expect(createAgentRuntimeKernel).toHaveBeenCalledOnce();
    const ensureCallOrder = ensureServiceIdentity.mock.invocationCallOrder.at(0);
    const runtimeCallOrder = runtimeCreated.mock.invocationCallOrder.at(0);
    expect(ensureCallOrder).toBeDefined();
    expect(runtimeCallOrder).toBeDefined();
    expect(ensureCallOrder!).toBeLessThan(runtimeCallOrder!);
  });

  it('fails closed before runtime creation when the lending service identity cannot be established', async () => {
    const ensureServiceIdentity = vi.fn(async () => {
      throw new Error(
        'Lending startup identity preflight failed because the configured OWS wallet did not resolve an EVM address.',
      );
    });
    const createAgentRuntimeKernel = vi.fn(async ({ createRuntimeOptions }) => {
      const signing = {
        readAddress: vi.fn(async () => '0x00000000000000000000000000000000000000b1' as const),
        signPayload: vi.fn(),
      };
      await createRuntimeOptions({
        signing,
      });
      throw new Error('runtime creation should not be reached');
    });

    await expect(
      createEmberLendingGatewayService({
        env: {
          OPENROUTER_API_KEY: 'test-openrouter-key',
          SHARED_EMBER_BASE_URL: 'http://127.0.0.1:56436',
          EMBER_LENDING_OWS_WALLET_NAME: 'ember-lending-service-wallet',
          EMBER_LENDING_OWS_VAULT_PATH: '/tmp/ember-lending-ows-vault',
        },
        __internalEnsureServiceIdentity: ensureServiceIdentity,
        __internalCreateAgentRuntimeKernel: createAgentRuntimeKernel,
      } as never),
    ).rejects.toThrow(
      'Lending startup identity preflight failed because the configured OWS wallet did not resolve an EVM address.',
    );

    expect(createAgentRuntimeKernel).toHaveBeenCalledOnce();
  });
});

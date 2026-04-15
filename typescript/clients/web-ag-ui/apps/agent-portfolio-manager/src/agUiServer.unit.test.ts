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
    const deriveControllerSmartAccountAddress = vi.fn(
      async () => '0x00000000000000000000000000000000000000c2' as const,
    );
    const ensureControllerSmartAccountDeployed = vi.fn(
      async () => '0x00000000000000000000000000000000000000c2' as const,
    );
    const ensureServiceIdentity = vi.fn(async () => ({
      revision: 2,
      wroteIdentity: false,
      identity: {
        wallet_address: '0x00000000000000000000000000000000000000c2',
      },
    }));
    const runtimeCreated = vi.fn();
    const createAgentRuntimeKernel = vi.fn(async ({ createRuntimeOptions }) => {
      const signing = {
        readAddress: vi.fn(async () => '0x00000000000000000000000000000000000000c1' as const),
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
      createPortfolioManagerGatewayService({
        env: {
          OPENROUTER_API_KEY: 'test-openrouter-key',
          SHARED_EMBER_BASE_URL: 'http://127.0.0.1:56436',
          PORTFOLIO_MANAGER_OWS_WALLET_NAME: 'portfolio-manager-controller-wallet',
          PORTFOLIO_MANAGER_OWS_VAULT_PATH: '/tmp/portfolio-manager-ows-vault',
        },
        __internalEnsureServiceIdentity: ensureServiceIdentity,
        __internalDeriveControllerSmartAccountAddress: deriveControllerSmartAccountAddress,
        __internalEnsureControllerSmartAccountDeployed: ensureControllerSmartAccountDeployed,
        __internalCreateAgentRuntimeKernel: createAgentRuntimeKernel,
      } as never),
    ).resolves.toBe(service);

    expect(deriveControllerSmartAccountAddress).toHaveBeenCalledWith({
      signerAddress: '0x00000000000000000000000000000000000000c1',
    });
    expect(ensureControllerSmartAccountDeployed).toHaveBeenCalledWith({
      signing: expect.objectContaining({
        readAddress: expect.any(Function),
        signPayload: expect.any(Function),
      }),
      signerRef: 'controller-wallet',
      signerAddress: '0x00000000000000000000000000000000000000c1',
    });
    expect(ensureServiceIdentity).toHaveBeenCalledOnce();
    expect(createAgentRuntimeKernel).toHaveBeenCalledOnce();
    const deployCallOrder = ensureControllerSmartAccountDeployed.mock.invocationCallOrder.at(0);
    const ensureCallOrder = ensureServiceIdentity.mock.invocationCallOrder.at(0);
    const runtimeCallOrder = runtimeCreated.mock.invocationCallOrder.at(0);
    expect(deployCallOrder).toBeDefined();
    expect(ensureCallOrder).toBeDefined();
    expect(runtimeCallOrder).toBeDefined();
    expect(deployCallOrder!).toBeLessThan(ensureCallOrder!);
    expect(ensureCallOrder!).toBeLessThan(runtimeCallOrder!);
  });

  it('fails closed before runtime creation when the controller wallet identity cannot be established', async () => {
    const ensureControllerSmartAccountDeployed = vi.fn(async () => {
      throw new Error(
        'Portfolio-manager startup identity preflight failed because the configured OWS wallet did not resolve an EVM address.',
      );
    });
    const ensureServiceIdentity = vi.fn(async () => {
      throw new Error(
        'Portfolio-manager startup identity preflight failed because the configured OWS wallet did not resolve an EVM address.',
      );
    });
    const createAgentRuntimeKernel = vi.fn(async ({ createRuntimeOptions }) => {
      const signing = {
        readAddress: vi.fn(async () => '0x00000000000000000000000000000000000000c1' as const),
        signPayload: vi.fn(),
      };
      await createRuntimeOptions({
        signing,
      });
      throw new Error('runtime creation should not be reached');
    });

    await expect(
      createPortfolioManagerGatewayService({
        env: {
          OPENROUTER_API_KEY: 'test-openrouter-key',
          SHARED_EMBER_BASE_URL: 'http://127.0.0.1:56436',
          PORTFOLIO_MANAGER_OWS_WALLET_NAME: 'portfolio-manager-controller-wallet',
          PORTFOLIO_MANAGER_OWS_VAULT_PATH: '/tmp/portfolio-manager-ows-vault',
        },
        __internalEnsureControllerSmartAccountDeployed: ensureControllerSmartAccountDeployed,
        __internalEnsureServiceIdentity: ensureServiceIdentity,
        __internalCreateAgentRuntimeKernel: createAgentRuntimeKernel,
      } as never),
    ).rejects.toThrow(
      'Portfolio-manager startup identity preflight failed because the configured OWS wallet did not resolve an EVM address.',
    );

    expect(ensureServiceIdentity).not.toHaveBeenCalled();
    expect(createAgentRuntimeKernel).toHaveBeenCalledOnce();
  });

  it('fails closed when the controller signer cannot fund smart-account deployment gas', async () => {
    const deriveControllerSmartAccountAddress = vi.fn(
      async () => '0x00000000000000000000000000000000000000c2' as const,
    );
    const ensureControllerSmartAccountDeployed = vi.fn(async () => {
      throw new Error('insufficient funds for gas * price + value');
    });
    const ensureServiceIdentity = vi.fn(async () => ({
      revision: 2,
      wroteIdentity: false,
      identity: {
        wallet_address: '0x00000000000000000000000000000000000000c2',
      },
    }));
    const createAgentRuntimeKernel = vi.fn(async ({ createRuntimeOptions }) => {
      const signing = {
        readAddress: vi.fn(async () => '0x00000000000000000000000000000000000000c1' as const),
        signPayload: vi.fn(),
      };
      await createRuntimeOptions({
        signing,
      });
      throw new Error('runtime creation should not be reached');
    });

    await expect(
      createPortfolioManagerGatewayService({
        env: {
          OPENROUTER_API_KEY: 'test-openrouter-key',
          SHARED_EMBER_BASE_URL: 'http://127.0.0.1:56436',
          PORTFOLIO_MANAGER_OWS_WALLET_NAME: 'portfolio-manager-controller-wallet',
          PORTFOLIO_MANAGER_OWS_VAULT_PATH: '/tmp/portfolio-manager-ows-vault',
        },
        __internalDeriveControllerSmartAccountAddress: deriveControllerSmartAccountAddress,
        __internalEnsureControllerSmartAccountDeployed: ensureControllerSmartAccountDeployed,
        __internalEnsureServiceIdentity: ensureServiceIdentity,
        __internalCreateAgentRuntimeKernel: createAgentRuntimeKernel,
      } as never),
    ).rejects.toThrow(
      'Portfolio-manager startup failed because controller signer 0x00000000000000000000000000000000000000c1 has no ETH to deploy controller smart account 0x00000000000000000000000000000000000000c2 on Arbitrum. Fund the controller signer and restart the service.',
    );

    expect(deriveControllerSmartAccountAddress).toHaveBeenCalledWith({
      signerAddress: '0x00000000000000000000000000000000000000c1',
    });
    expect(ensureServiceIdentity).not.toHaveBeenCalled();
    expect(createAgentRuntimeKernel).toHaveBeenCalledOnce();
  });
});

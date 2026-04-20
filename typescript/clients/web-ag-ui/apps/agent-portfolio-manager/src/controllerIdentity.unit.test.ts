import { describe, expect, it, vi } from 'vitest';

import {
  derivePortfolioManagerControllerSmartAccountAddress,
  ensurePortfolioManagerControllerSmartAccountDeployed,
  resolvePortfolioManagerControllerIdentity,
} from './controllerIdentity.js';

describe('portfolio-manager controller identity', () => {
  it('derives the Hybrid controller smart-account address from the runtime signer owner address', async () => {
    const publicClient = { transport: 'public-client' };
    const createPublicClient = vi.fn(() => publicClient as never);
    const toMetaMaskSmartAccount = vi.fn(async (input) => {
      expect(input).toMatchObject({
        client: publicClient,
        implementation: 'Hybrid',
        deployParams: ['0x00000000000000000000000000000000000000c1', [], [], []],
        deploySalt: '0x',
        signer: {
          account: expect.objectContaining({
            address: '0x00000000000000000000000000000000000000c1',
          }),
        },
        environment: {
          DelegationManager: '0x00000000000000000000000000000000000000d1',
        },
      });

      return {
        address: '0x00000000000000000000000000000000000000c2',
      };
    });

    await expect(
      derivePortfolioManagerControllerSmartAccountAddress({
        signerAddress: '0x00000000000000000000000000000000000000c1',
        dependencies: {
          createPublicClient,
          toMetaMaskSmartAccount: toMetaMaskSmartAccount as never,
          getDeleGatorEnvironment: vi.fn(() => ({
            DelegationManager: '0x00000000000000000000000000000000000000d1',
          })) as never,
        },
      }),
    ).resolves.toBe('0x00000000000000000000000000000000000000c2');
  });

  it('resolves both the signer owner address and the controller smart-account address', async () => {
    const signing = {
      readAddress: vi.fn(async () => '0x00000000000000000000000000000000000000c1' as const),
    };

    await expect(
      resolvePortfolioManagerControllerIdentity({
        signing: signing as never,
        signerRef: 'controller-wallet',
        dependencies: {
          createPublicClient: vi.fn(() => ({}) as never),
          toMetaMaskSmartAccount: vi.fn(async () => ({
            address: '0x00000000000000000000000000000000000000c2',
          })) as never,
          getDeleGatorEnvironment: vi.fn(
            () =>
              ({
                DelegationManager: '0x00000000000000000000000000000000000000d1',
              }) as never,
          ),
        },
      }),
    ).resolves.toEqual({
      signerAddress: '0x00000000000000000000000000000000000000c1',
      smartAccountAddress: '0x00000000000000000000000000000000000000c2',
    });

    expect(signing.readAddress).toHaveBeenCalledWith({
      signerRef: 'controller-wallet',
    });
  });

  it('does not broadcast a deployment transaction when the controller smart account is already deployed', async () => {
    const createPublicClient = vi.fn(
      () =>
        ({
          request: vi.fn(),
          waitForTransactionReceipt: vi.fn(),
        }) as never,
    );
    const signPreparedTransaction = vi.fn();

    await expect(
      ensurePortfolioManagerControllerSmartAccountDeployed({
        signing: {
          readAddress: vi.fn(),
          signPayload: vi.fn(),
        } as never,
        signerRef: 'controller-wallet',
        signerAddress: '0x00000000000000000000000000000000000000c1',
        dependencies: {
          createPublicClient,
          toMetaMaskSmartAccount: vi.fn(
            async () =>
              ({
                address: '0x00000000000000000000000000000000000000c2',
                isDeployed: vi.fn(async () => true),
              }) as never,
          ),
          getDeleGatorEnvironment: vi.fn(
            () =>
              ({
                DelegationManager: '0x00000000000000000000000000000000000000d1',
              }) as never,
          ),
          signPreparedEvmTransaction: signPreparedTransaction as never,
        },
      }),
    ).resolves.toBe('0x00000000000000000000000000000000000000c2');

    expect(signPreparedTransaction).not.toHaveBeenCalled();
  });

  it('deploys the controller smart account through the runtime signer when it is undeployed', async () => {
    const request = vi.fn(async () => '0x00000000000000000000000000000000000000a1');
    const waitForTransactionReceipt = vi.fn(async () => ({ status: 'success' }));
    const createPublicClient = vi.fn(
      () =>
        ({
          getTransactionCount: vi.fn(async () => 7),
          estimateFeesPerGas: vi.fn(async () => ({
            maxFeePerGas: 10n,
            maxPriorityFeePerGas: 2n,
          })),
          estimateGas: vi.fn(async () => 21000n),
          request,
          waitForTransactionReceipt,
        }) as never,
    );
    const signPreparedTransaction = vi.fn(
      async () =>
        ({
          rawTransaction: '0x02deadbeef',
        }) as never,
    );

    await expect(
      ensurePortfolioManagerControllerSmartAccountDeployed({
        signing: {
          readAddress: vi.fn(),
          signPayload: vi.fn(),
        } as never,
        signerRef: 'controller-wallet',
        signerAddress: '0x00000000000000000000000000000000000000c1',
        dependencies: {
          createPublicClient,
          toMetaMaskSmartAccount: vi.fn(
            async () =>
              ({
                address: '0x00000000000000000000000000000000000000c2',
                isDeployed: vi.fn(async () => false),
                getFactoryArgs: vi.fn(async () => ({
                  factory: '0x00000000000000000000000000000000000000f1',
                  factoryData: '0x1234',
                })),
              }) as never,
          ),
          getDeleGatorEnvironment: vi.fn(
            () =>
              ({
                DelegationManager: '0x00000000000000000000000000000000000000d1',
              }) as never,
          ),
          signPreparedEvmTransaction: signPreparedTransaction as never,
        },
      }),
    ).resolves.toBe('0x00000000000000000000000000000000000000c2');

    expect(signPreparedTransaction).toHaveBeenCalledWith({
      signing: expect.objectContaining({
        readAddress: expect.any(Function),
        signPayload: expect.any(Function),
      }),
      signerRef: 'controller-wallet',
      expectedAddress: '0x00000000000000000000000000000000000000c1',
      chain: 'evm',
      unsignedTransactionHex: expect.stringMatching(/^0x/),
    });
    expect(request).toHaveBeenCalledWith({
      method: 'eth_sendRawTransaction',
      params: ['0x02deadbeef'],
    });
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: '0x00000000000000000000000000000000000000a1',
    });
  });
});

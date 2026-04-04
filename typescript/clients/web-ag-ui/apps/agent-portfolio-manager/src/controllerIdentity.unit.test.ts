import { describe, expect, it, vi } from 'vitest';

import {
  derivePortfolioManagerControllerSmartAccountAddress,
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
});

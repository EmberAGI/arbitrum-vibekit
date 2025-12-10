import { afterEach, describe, expect, it, vi } from 'vitest';

import { checkTokenAllowance, ensureAllowance } from './allowances.js';
import type { OnchainClients } from '../clients/clients.js';
import * as transactionModule from './transaction.js';

describe('allowances helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('checkTokenAllowance issues an ERC20 allowance read with the provided addresses', async () => {
    // Given a viem public client stub
    const readContract = vi.fn().mockResolvedValue(123n);
    const publicClient = { readContract } as unknown as OnchainClients['public'];

    // When the helper queries allowances
    const allowance = await checkTokenAllowance(
      publicClient,
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
      '0x3333333333333333333333333333333333333333',
    );

    // Then it should call into viem with the ERC20 ABI and relevant arguments
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: '0x1111111111111111111111111111111111111111',
        functionName: 'allowance',
        args: [
          '0x2222222222222222222222222222222222222222',
          '0x3333333333333333333333333333333333333333',
        ],
      }),
    );
    expect(allowance).toBe(123n);
  });

  it('ensureAllowance short-circuits when the current allowance already satisfies the requirement', async () => {
    // Given an allowance equal to the requested spend limit
    const readContract = vi.fn().mockResolvedValue(200n);
    const publicClient = { readContract } as unknown as OnchainClients['public'];
    const executeSpy = vi
      .spyOn(transactionModule, 'executeTransaction')
      .mockResolvedValue({} as never);
    const clients = {
      public: publicClient,
      wallet: {} as OnchainClients['wallet'],
    };

    // When ensureAllowance runs with a requirement beneath the current allowance
    await ensureAllowance({
      publicClient,
      tokenAddress: '0x1111111111111111111111111111111111111111',
      ownerAccount: '0x2222222222222222222222222222222222222222',
      spenderAddress: '0x3333333333333333333333333333333333333333',
      requiredAmount: 150n,
      clients,
    });

    // Then it should avoid constructing approvals or sending user operations
    expect(executeSpy).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';

import type { Token } from '../core/index.js';

import { AAVEAdapter } from './adapter.js';

describe('AAVEAdapter.createWithdrawTransaction', () => {
  it('matches reserve underlyings case-insensitively and withdraws the underlying with a decimal amount', async () => {
    const adapter = new AAVEAdapter({
      chainId: 42161,
      rpcUrl: 'http://127.0.0.1:8545',
      wrappedNativeToken: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
    });

    const withdraw = vi.fn().mockResolvedValue([
      {
        to: '0x0000000000000000000000000000000000000001',
        data: '0x',
        value: 0,
      },
    ]);

    Reflect.set(
      adapter,
      'getReserves',
      vi.fn().mockResolvedValue({
        reservesData: [
          {
            underlyingAsset: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
            aTokenAddress: '0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8',
          },
        ],
      }),
    );
    Reflect.set(adapter, 'withdraw', withdraw);

    const walletAddress = '0x00000000000000000000000000000000000000f1';
    const tokenToWithdraw: Token = {
      tokenUid: {
        address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        chainId: '42161',
      },
      name: 'Wrapped Ether',
      symbol: 'WETH',
      decimals: 18,
      isNative: false,
      isVetted: true,
      iconUri: null,
    };

    const response = await adapter.createWithdrawTransaction({
      tokenToWithdraw,
      amount: 1n,
      walletAddress,
    });

    expect(withdraw).toHaveBeenCalledWith(
      '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
      '0.000000000000000001',
      walletAddress,
      walletAddress,
    );
    expect(response.transactions).toHaveLength(1);
    expect(response.transactions[0]?.chainId).toBe('42161');
  });
});

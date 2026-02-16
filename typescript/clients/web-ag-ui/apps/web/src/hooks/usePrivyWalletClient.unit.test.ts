import { describe, expect, it } from 'vitest';
import type { ConnectedWallet } from '@privy-io/react-auth';

import {
  normalizeWalletAddress,
  parseChainId,
  resolveWalletClientError,
  selectPrivyWallet,
} from './usePrivyWalletClient';

function wallet(params: { address: string; type: string }): ConnectedWallet {
  return {
    address: params.address,
    walletClientType: params.type,
  } as unknown as ConnectedWallet;
}

describe('usePrivyWalletClient helpers', () => {
  it('parses valid hex chain ids and rejects invalid values', () => {
    expect(parseChainId('0xa4b1')).toBe(42161);
    expect(parseChainId('0x1')).toBe(1);
    expect(parseChainId('42161')).toBeNull();
    expect(parseChainId(42161)).toBeNull();
    expect(parseChainId('0xnothex')).toBeNull();
  });

  it('normalizes optional wallet addresses', () => {
    expect(normalizeWalletAddress(undefined)).toBeNull();
    expect(normalizeWalletAddress(' 0xAbCd ')).toBe('0xabcd');
  });

  it('selects preferred wallet when provided and falls back to privy wallet', () => {
    const wallets = [
      wallet({ address: '0x1111', type: 'metamask' }),
      wallet({ address: '0x2222', type: 'privy' }),
      wallet({ address: '0x3333', type: 'coinbase_wallet' }),
    ];

    expect(
      selectPrivyWallet({
        wallets,
        preferredWalletAddress: '0x3333',
      }),
    ).toBe(wallets[2]);

    expect(
      selectPrivyWallet({
        wallets,
      }),
    ).toBe(wallets[1]);

    expect(
      selectPrivyWallet({
        wallets,
        preferredWalletAddress: '0x4444',
      }),
    ).toBeNull();
  });

  it('resolves query errors with provider > chain > wallet precedence', () => {
    const providerError = new Error('provider failed');
    const chainError = new Error('chain failed');
    const walletError = new Error('wallet failed');

    expect(
      resolveWalletClientError({
        providerError,
        chainIdError: chainError,
        walletClientError: walletError,
      }),
    ).toBe(providerError);

    expect(
      resolveWalletClientError({
        providerError: null,
        chainIdError: chainError,
        walletClientError: walletError,
      }),
    ).toBe(chainError);

    expect(
      resolveWalletClientError({
        providerError: null,
        chainIdError: null,
        walletClientError: walletError,
      }),
    ).toBe(walletError);

    expect(
      resolveWalletClientError({
        providerError: null,
        chainIdError: null,
        walletClientError: null,
      }),
    ).toBeNull();
  });
});

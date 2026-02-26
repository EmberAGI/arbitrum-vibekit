import { describe, expect, it } from 'vitest';

import {
  isHexAddress,
  isUserRejectedTransactionError,
  selectConnectedDestinationWallet,
  validateWithdrawRequest,
} from './withdraw';

describe('withdraw helpers', () => {
  it('validates hex addresses', () => {
    expect(isHexAddress('0x1111111111111111111111111111111111111111')).toBe(true);
    expect(isHexAddress('0xabc')).toBe(false);
    expect(isHexAddress('hello')).toBe(false);
  });

  it('rejects custom destination when address is invalid', () => {
    const result = validateWithdrawRequest({
      mode: 'custom',
      customDestination: 'invalid',
      connectedDestination: null,
      sourceAddress: '0x1111111111111111111111111111111111111111',
      amount: '1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('valid wallet address');
    }
  });

  it('rejects connected mode when no connected destination exists', () => {
    const result = validateWithdrawRequest({
      mode: 'connected',
      customDestination: '',
      connectedDestination: null,
      sourceAddress: '0x1111111111111111111111111111111111111111',
      amount: '1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('No connected destination wallet');
    }
  });

  it('rejects destination equal to source address', () => {
    const result = validateWithdrawRequest({
      mode: 'custom',
      customDestination: '0x1111111111111111111111111111111111111111',
      connectedDestination: null,
      sourceAddress: '0x1111111111111111111111111111111111111111',
      amount: '1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('must be different');
    }
  });

  it('returns parsed destination when request is valid', () => {
    const result = validateWithdrawRequest({
      mode: 'connected',
      customDestination: '',
      connectedDestination: '0x2222222222222222222222222222222222222222',
      sourceAddress: '0x1111111111111111111111111111111111111111',
      amount: '1.5',
    });

    expect(result).toEqual({
      ok: true,
      destinationAddress: '0x2222222222222222222222222222222222222222',
    });
  });

  it('selects the first non-privy connected destination wallet that differs from source', () => {
    const selected = selectConnectedDestinationWallet({
      sourceAddress: '0x1111111111111111111111111111111111111111',
      wallets: [
        {
          address: '0x1111111111111111111111111111111111111111',
          walletClientType: 'metamask',
        },
        {
          address: '0x2222222222222222222222222222222222222222',
          walletClientType: 'privy',
        },
        {
          address: '0x3333333333333333333333333333333333333333',
          walletClientType: 'coinbase_wallet',
        },
      ],
    });

    expect(selected).toBe('0x3333333333333333333333333333333333333333');
  });

  it('detects user rejected transaction errors from message text', () => {
    const rejected = new Error('User rejected the request.');
    expect(isUserRejectedTransactionError(rejected)).toBe(true);
  });

  it('detects user rejected transaction errors from wallet error code', () => {
    expect(
      isUserRejectedTransactionError({
        code: 4001,
        message: 'Request rejected',
      }),
    ).toBe(true);
  });

  it('does not classify unrelated errors as user-rejected', () => {
    expect(isUserRejectedTransactionError(new Error('RPC timeout'))).toBe(false);
  });
});

import { describe, expect, it, vi } from 'vitest';

import type { UnsignedDelegation } from '../types/agent';

import { signDelegationWithFallback } from './delegationSigning';

type SignDelegationAction = typeof import('@metamask/delegation-toolkit/actions').signDelegation;

const makeDelegation = (caveatCount: number): UnsignedDelegation => ({
  delegate: '0x0000000000000000000000000000000000000001',
  delegator: '0x0000000000000000000000000000000000000002',
  authority: '0x0000000000000000000000000000000000000000000000000000000000000000',
  caveats: Array.from({ length: caveatCount }, () => ({
    enforcer: '0x0000000000000000000000000000000000000003',
    terms: '0x',
    args: '0x',
  })),
  salt: '0x01',
});

describe('signDelegationWithFallback', () => {
  it('signs empty-caveat delegations with unrestricted flag on first attempt', async () => {
    const walletClient = {} as Parameters<SignDelegationAction>[0];
    const signDelegationFn = vi.fn(async () => '0xabc' as const) as SignDelegationAction;

    const signature = await signDelegationWithFallback({
      walletClient,
      delegation: makeDelegation(0),
      delegationManager: '0x0000000000000000000000000000000000000004',
      chainId: 42161,
      account: '0x0000000000000000000000000000000000000002',
      signDelegationFn,
    });

    expect(signature).toBe('0xabc');
    expect(signDelegationFn).toHaveBeenCalledTimes(1);
    expect(signDelegationFn).toHaveBeenCalledWith(
      walletClient,
      expect.objectContaining({ allowInsecureUnrestrictedDelegation: true }),
    );
  });

  it('retries once with unrestricted flag when toolkit throws no-caveat guard error', async () => {
    const walletClient = {} as Parameters<SignDelegationAction>[0];
    const noCaveatsError = new Error(
      'No caveats found. If you definitely want to sign a delegation without caveats, set `allowInsecureUnrestrictedDelegation` to `true`.',
    );
    const signDelegationFn = vi
      .fn()
      .mockRejectedValueOnce(noCaveatsError)
      .mockResolvedValueOnce('0xdef') as SignDelegationAction;

    const signature = await signDelegationWithFallback({
      walletClient,
      delegation: makeDelegation(1),
      delegationManager: '0x0000000000000000000000000000000000000004',
      chainId: 42161,
      account: '0x0000000000000000000000000000000000000002',
      signDelegationFn,
    });

    expect(signature).toBe('0xdef');
    expect(signDelegationFn).toHaveBeenCalledTimes(2);
    expect(signDelegationFn).toHaveBeenNthCalledWith(
      1,
      walletClient,
      expect.objectContaining({ allowInsecureUnrestrictedDelegation: false }),
    );
    expect(signDelegationFn).toHaveBeenNthCalledWith(
      2,
      walletClient,
      expect.objectContaining({ allowInsecureUnrestrictedDelegation: true }),
    );
  });

  it('does not retry for non-guard errors', async () => {
    const walletClient = {} as Parameters<SignDelegationAction>[0];
    const signDelegationFn = vi.fn(async () => {
      throw new Error('wallet disconnected');
    }) as SignDelegationAction;

    await expect(
      signDelegationWithFallback({
        walletClient,
        delegation: makeDelegation(1),
        delegationManager: '0x0000000000000000000000000000000000000004',
        chainId: 42161,
        account: '0x0000000000000000000000000000000000000002',
        signDelegationFn,
      }),
    ).rejects.toThrow('wallet disconnected');

    expect(signDelegationFn).toHaveBeenCalledTimes(1);
    expect(signDelegationFn).toHaveBeenCalledWith(
      walletClient,
      expect.objectContaining({ allowInsecureUnrestrictedDelegation: false }),
    );
  });
});

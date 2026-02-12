import { signDelegation } from '@metamask/delegation-toolkit/actions';

import type { UnsignedDelegation } from '../types/agent';

type SignDelegationAction = typeof signDelegation;
type WalletSignerClient = Parameters<SignDelegationAction>[0];

const NO_CAVEATS_ERROR_FRAGMENT = 'No caveats found';
const INSECURE_FLAG_ERROR_FRAGMENT = 'allowInsecureUnrestrictedDelegation';

function hasNoCaveatsGuardError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message.includes(NO_CAVEATS_ERROR_FRAGMENT) &&
    error.message.includes(INSECURE_FLAG_ERROR_FRAGMENT)
  );
}

function resolveCaveatCount(delegation: UnsignedDelegation): number {
  return Array.isArray(delegation.caveats) ? delegation.caveats.length : 0;
}

export async function signDelegationWithFallback(params: {
  walletClient: WalletSignerClient;
  delegation: UnsignedDelegation;
  delegationManager: `0x${string}`;
  chainId: number;
  account: `0x${string}`;
  signDelegationFn?: SignDelegationAction;
}): Promise<`0x${string}`> {
  const signDelegationFn = params.signDelegationFn ?? signDelegation;
  const shouldAllowUnrestrictedDelegation = resolveCaveatCount(params.delegation) === 0;

  try {
    return await signDelegationFn(params.walletClient, {
      delegation: params.delegation,
      delegationManager: params.delegationManager,
      chainId: params.chainId,
      account: params.account,
      allowInsecureUnrestrictedDelegation: shouldAllowUnrestrictedDelegation,
    });
  } catch (error) {
    if (shouldAllowUnrestrictedDelegation || !hasNoCaveatsGuardError(error)) {
      throw error;
    }

    // Some runtime payloads can still trip the toolkit no-caveats guard.
    // Retry once with the explicit opt-in flag so signing can proceed.
    return await signDelegationFn(params.walletClient, {
      delegation: params.delegation,
      delegationManager: params.delegationManager,
      chainId: params.chainId,
      account: params.account,
      allowInsecureUnrestrictedDelegation: true,
    });
  }
}

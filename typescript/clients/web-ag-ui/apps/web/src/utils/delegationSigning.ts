import { signDelegation } from '@metamask/delegation-toolkit/actions';

import type { UnsignedDelegation } from '../types/agent';

type SignDelegationAction = typeof signDelegation;
type WalletSignerClient = Parameters<SignDelegationAction>[0];

const NO_CAVEATS_ERROR_FRAGMENT = 'No caveats found';
const INSECURE_FLAG_ERROR_FRAGMENT = 'allowInsecureUnrestrictedDelegation';
const FETCH_FAILED_ERROR_FRAGMENT = 'fetch failed';
const FAILED_TO_FETCH_ERROR_FRAGMENT = 'failed to fetch';
const USER_REJECTED_ERROR_FRAGMENTS = ['user rejected', 'user denied', 'rejected the request'];

type DelegationSigningErrorContext = {
  chainId: number;
  expectedChainId: number;
  requiredDelegatorAddress: `0x${string}`;
  currentSignerAddress: `0x${string}` | null;
};

function collectErrorMessages(error: unknown): string[] {
  const messages = new Set<string>();
  const queue: unknown[] = [error];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const candidate = queue.shift();
    if (candidate === undefined || candidate === null || visited.has(candidate)) {
      continue;
    }
    visited.add(candidate);

    if (typeof candidate === 'string') {
      const normalized = candidate.trim();
      if (normalized.length > 0) {
        messages.add(normalized);
      }
      continue;
    }

    if (candidate instanceof Error) {
      const normalized = candidate.message.trim();
      if (normalized.length > 0) {
        messages.add(normalized);
      }
      queue.push((candidate as Error & { cause?: unknown }).cause);
    }

    if (typeof candidate === 'object') {
      for (const key of ['message', 'shortMessage', 'details', 'cause']) {
        if (key in candidate) {
          queue.push((candidate as Record<string, unknown>)[key]);
        }
      }
    }
  }

  return [...messages];
}

function isFetchFailedError(messages: string[]): boolean {
  return messages.some((message) => {
    const normalized = message.toLowerCase();
    return (
      normalized.includes(FETCH_FAILED_ERROR_FRAGMENT) ||
      normalized.includes(FAILED_TO_FETCH_ERROR_FRAGMENT)
    );
  });
}

function isUserRejectedError(messages: string[]): boolean {
  return messages.some((message) => {
    const normalized = message.toLowerCase();
    return USER_REJECTED_ERROR_FRAGMENTS.some((fragment) => normalized.includes(fragment));
  });
}

export function formatDelegationSigningError(params: {
  error: unknown;
  context: DelegationSigningErrorContext;
}): string {
  const messages = collectErrorMessages(params.error);
  const rawMessage = messages[0] ?? 'Unknown error';

  if (isUserRejectedError(messages)) {
    return 'Delegation signing was rejected in the wallet confirmation.';
  }

  if (isFetchFailedError(messages)) {
    return [
      'Delegation signing failed during the wallet provider request for `eth_signTypedData_v4`.',
      'This usually means the embedded Privy wallet session or browser network path failed before the signature was returned.',
      `Signer=${params.context.currentSignerAddress ?? 'unknown'}, required=${params.context.requiredDelegatorAddress}, chain=${params.context.chainId}, expectedChain=${params.context.expectedChainId}.`,
      'Retry after reconnecting the wallet. If it persists, check browser network, adblock/privacy settings, and Privy session state.',
      `Raw error: ${rawMessage}`,
    ].join(' ');
  }

  return rawMessage;
}

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

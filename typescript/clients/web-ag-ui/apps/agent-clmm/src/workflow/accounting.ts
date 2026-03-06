import { createCamelotNavSnapshot } from '../accounting/snapshot.js';
import type { NavSnapshot, NavSnapshotTrigger } from '../accounting/types.js';
import type { EmberCamelotClient } from '../clients/emberApi.js';
import { ARBITRUM_CHAIN_ID } from '../config/constants.js';

import type { ClmmState } from './context.js';

export function resolveAccountingContextId(params: {
  state: ClmmState;
  threadId?: string;
}): string | null {
  return params.threadId ?? null;
}

export function cloneSnapshotForTrigger(params: {
  snapshot: NavSnapshot;
  trigger: NavSnapshotTrigger;
  transactionHash?: `0x${string}`;
}): NavSnapshot {
  return {
    ...params.snapshot,
    trigger: params.trigger,
    transactionHash: params.transactionHash,
    timestamp: new Date().toISOString(),
  };
}

export async function createCamelotAccountingSnapshot(params: {
  state: ClmmState;
  camelotClient: EmberCamelotClient;
  trigger: NavSnapshotTrigger;
  flowLog?: ClmmState['thread']['accounting']['flowLog'];
  transactionHash?: `0x${string}`;
  threadId?: string;
  cycle?: number;
}): Promise<NavSnapshot | null> {
  const walletAddress = params.state.thread.operatorConfig?.walletAddress;
  if (!walletAddress) {
    return null;
  }

  const contextId = resolveAccountingContextId({ state: params.state, threadId: params.threadId });
  if (!contextId) {
    return null;
  }

  const managedPoolAddress =
    params.state.thread.selectedPool?.address ??
    params.state.thread.operatorInput?.poolAddress ??
    params.state.thread.metrics.lastSnapshot?.address ??
    params.state.thread.metrics.latestSnapshot?.poolAddress;

  return createCamelotNavSnapshot({
    contextId,
    trigger: params.trigger,
    walletAddress,
    chainId: ARBITRUM_CHAIN_ID,
    camelotClient: params.camelotClient,
    flowLog: params.flowLog ?? params.state.thread.accounting.flowLog,
    managedPoolAddresses: managedPoolAddress ? [managedPoolAddress] : undefined,
    transactionHash: params.transactionHash,
    threadId: params.threadId,
    cycle: params.cycle,
  });
}

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
  flowLog?: ClmmState['view']['accounting']['flowLog'];
  transactionHash?: `0x${string}`;
  threadId?: string;
  cycle?: number;
}): Promise<NavSnapshot | null> {
  const walletAddress = params.state.view.operatorConfig?.walletAddress;
  if (!walletAddress) {
    return null;
  }

  const contextId = resolveAccountingContextId({ state: params.state, threadId: params.threadId });
  if (!contextId) {
    return null;
  }

  return createCamelotNavSnapshot({
    contextId,
    trigger: params.trigger,
    walletAddress,
    chainId: ARBITRUM_CHAIN_ID,
    camelotClient: params.camelotClient,
    flowLog: params.flowLog ?? params.state.view.accounting.flowLog,
    managedPoolAddresses: params.state.view.selectedPool
      ? [params.state.view.selectedPool.address]
      : undefined,
    transactionHash: params.transactionHash,
    threadId: params.threadId,
    cycle: params.cycle,
  });
}

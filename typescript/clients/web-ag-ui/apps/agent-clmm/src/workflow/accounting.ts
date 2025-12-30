import { createCamelotNavSnapshot } from '../accounting/snapshot.js';
import type { NavSnapshot, NavSnapshotTrigger } from '../accounting/types.js';
import type { EmberCamelotClient } from '../clients/emberApi.js';
import { ARBITRUM_CHAIN_ID } from '../config/constants.js';

import type { ClmmState } from './context.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function findContextIdInCopilotContext(context: unknown[] | undefined): string | null {
  if (!context) {
    return null;
  }

  for (const entry of context) {
    if (typeof entry === 'string') {
      continue;
    }
    if (!isRecord(entry)) {
      continue;
    }
    const direct = entry['contextId'];
    if (typeof direct === 'string' && direct.length > 0) {
      return direct;
    }
    const name = entry['name'];
    const value = entry['value'];
    if (typeof name === 'string' && typeof value === 'string') {
      const normalized = name.toLowerCase();
      if (normalized === 'contextid' || normalized === 'context_id' || normalized === 'ag-ui-context') {
        return value;
      }
    }
    const id = entry['id'];
    if (typeof id === 'string' && id.length > 0 && entry['type'] === 'context') {
      return id;
    }
  }

  return null;
}

export function resolveAccountingContextId(params: {
  state: ClmmState;
  threadId?: string;
}): string | null {
  const fromCopilot = findContextIdInCopilotContext(params.state.copilotkit?.context);
  if (fromCopilot) {
    return fromCopilot;
  }
  if (params.threadId) {
    return params.threadId;
  }
  return params.state.view.task?.id ?? null;
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
    transactionHash: params.transactionHash,
    threadId: params.threadId,
    cycle: params.cycle,
  });
}

import { createExecution, ExecutionMode } from '@metamask/delegation-toolkit';
import { DelegationManager } from '@metamask/delegation-toolkit/contracts';
import type { TransactionReceipt } from 'viem';

import type { createClients } from '../clients/clients.js';
import type { TransactionInformation } from '../clients/emberApi.js';
import {
  EmberEvmTransactionSchema,
  normalizeAndExpandTransactions,
  txMatchesDelegationIntent,
} from '../delegations/emberDelegations.js';
import type { DelegationBundle } from '../workflow/context.js';

type Execution = {
  target: `0x${string}`;
  value: bigint;
  callData: `0x${string}`;
};

function assertIsExecution(value: unknown): asserts value is Execution {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Internal error: createExecution returned a non-object');
  }
  if (!('target' in value) || !('value' in value) || !('callData' in value)) {
    throw new Error('Internal error: createExecution returned an unexpected shape');
  }
}

function createExecutionSafe(params: { target: `0x${string}`; value: bigint; callData: `0x${string}` }): Execution {
  const execution: unknown = createExecution(params);
  assertIsExecution(execution);
  return execution;
}

function toNormalizedIntent(intent: DelegationBundle['intents'][number]) {
  return {
    target: intent.target,
    selector: intent.selector,
    allowedCalldata: intent.allowedCalldata.map((pin) => ({
      startIndex: pin.startIndex,
      value: pin.value,
    })),
  };
}

export async function redeemDelegationsAndExecuteTransactions(params: {
  clients: ReturnType<typeof createClients>;
  delegationBundle: DelegationBundle;
  transactions: readonly TransactionInformation[];
}): Promise<{ txHash: `0x${string}`; receipt: TransactionReceipt }> {
  if (params.transactions.length === 0) {
    throw new Error('No transactions provided for delegated execution');
  }

  const emberTxs = EmberEvmTransactionSchema.array().parse(params.transactions);
  const normalization = normalizeAndExpandTransactions({ transactions: emberTxs });

  if (normalization.chainId !== params.delegationBundle.chainId) {
    throw new Error(
      `Delegation chainId mismatch (bundle=${params.delegationBundle.chainId}, plan=${normalization.chainId})`,
    );
  }

  const intents = params.delegationBundle.intents.map(toNormalizedIntent);

  if (params.delegationBundle.delegations.length !== intents.length) {
    throw new Error(
      `Delegation bundle invalid: delegations/intents length mismatch (delegations=${params.delegationBundle.delegations.length}, intents=${intents.length})`,
    );
  }

  const executionsByIntentIndex = new Map<number, Execution[]>();
  const firstTxIndexByIntentIndex = new Map<number, number>();
  const intentIndexSequence: number[] = [];

  for (const [txIndex, tx] of normalization.normalizedTransactions.entries()) {
    const matchingIndex = intents.findIndex((intent) => txMatchesDelegationIntent(tx, intent));
    if (matchingIndex === -1) {
      throw new Error(
        `No delegation intent matched planned call[${txIndex}] (to=${tx.to}, selector=${tx.selector}). Re-run onboarding to sign updated delegations.`,
      );
    }

    if (!firstTxIndexByIntentIndex.has(matchingIndex)) {
      firstTxIndexByIntentIndex.set(matchingIndex, txIndex);
      intentIndexSequence.push(matchingIndex);
    } else {
      const last = intentIndexSequence.at(-1);
      if (last !== matchingIndex) {
        throw new Error(
          `Execution plan requires interleaving intent[${matchingIndex}] across other intents; refusing to redeem the same delegation multiple times in a single transaction.`,
        );
      }
    }

    const list = executionsByIntentIndex.get(matchingIndex) ?? [];
    list.push(
      createExecutionSafe({
        target: tx.to,
        value: tx.value,
        callData: tx.data,
      }),
    );
    executionsByIntentIndex.set(matchingIndex, list);
  }

  const orderedIntentIndices = [...executionsByIntentIndex.keys()].sort((a, b) => {
    const aIndex = firstTxIndexByIntentIndex.get(a);
    const bIndex = firstTxIndexByIntentIndex.get(b);
    if (aIndex === undefined || bIndex === undefined) {
      throw new Error('Internal error: missing firstTxIndexByIntentIndex entry');
    }
    return aIndex - bIndex;
  });

  const permissionContexts = orderedIntentIndices.map((index) => [params.delegationBundle.delegations[index]]);
  const executions = orderedIntentIndices.map((index) => executionsByIntentIndex.get(index) ?? []);
  const modes = executions.map((group) => (group.length === 1 ? ExecutionMode.SingleDefault : ExecutionMode.BatchDefault));

  const simulation = await DelegationManager.simulate.redeemDelegations({
    client: params.clients.public,
    delegationManagerAddress: params.delegationBundle.delegationManager,
    delegations: permissionContexts,
    modes,
    executions,
  });
  const estimatedGas = typeof simulation.request.gas === 'bigint' ? simulation.request.gas : undefined;
  const gas = estimatedGas ? (estimatedGas * 12n) / 10n : undefined;

  const txHash = await params.clients.wallet.sendTransaction({
    account: params.clients.wallet.account,
    chain: params.clients.wallet.chain,
    to: params.delegationBundle.delegationManager,
    data: DelegationManager.encode.redeemDelegations({
      delegations: permissionContexts,
      modes,
      executions,
    }),
    value: 0n,
    ...(gas ? { gas } : {}),
  });

  const receipt = await params.clients.public.waitForTransactionReceipt({ hash: txHash });
  return { txHash, receipt };
}

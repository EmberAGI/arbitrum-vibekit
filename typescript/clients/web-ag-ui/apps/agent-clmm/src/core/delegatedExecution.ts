import { createExecution, ExecutionMode } from '@metamask/delegation-toolkit';
import { DelegationManager } from '@metamask/delegation-toolkit/contracts';
import { createClient, publicActions, type TransactionReceipt } from 'viem';

import { createRpcTransport, type createClients } from '../clients/clients.js';
import type { TransactionInformation } from '../clients/emberApi.js';
import {
  EmberEvmTransactionSchema,
  normalizeAndExpandTransactions,
  summarizeNormalizedTransactions,
  txMatchesDelegationIntent,
} from '../delegations/emberDelegations.js';
import { logInfo, type DelegationBundle } from '../workflow/context.js';

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
}): Promise<{ txHashes: `0x${string}`[]; receipts: TransactionReceipt[]; gasSpentWei?: bigint }> {
  if (params.transactions.length === 0) {
    throw new Error('No transactions provided for delegated execution');
  }

  const senderAddress = params.clients.wallet.account.address.toLowerCase() as `0x${string}`;
  const expectedDelegate = params.delegationBundle.delegateeAddress.toLowerCase() as `0x${string}`;

  logInfo('Delegated execution starting', {
    senderAddress,
    expectedDelegate,
    delegatorAddress: params.delegationBundle.delegatorAddress,
    delegationManager: params.delegationBundle.delegationManager,
    transactionCount: params.transactions.length,
  });

  const emberTxs = EmberEvmTransactionSchema.array().parse(params.transactions);
  const normalization = normalizeAndExpandTransactions({ transactions: emberTxs });
  const normalizedSummary = summarizeNormalizedTransactions({
    chainId: normalization.chainId,
    transactions: normalization.normalizedTransactions,
  });
  logInfo(
    'Delegated execution normalized calls',
    { callCount: normalizedSummary.length, calls: normalizedSummary },
    { detailed: true },
  );

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

  const executionSegments: Array<{ intentIndex: number; executions: Execution[] }> = [];
  const intentSegmentCounts = new Map<number, number>();

  for (const [txIndex, tx] of normalization.normalizedTransactions.entries()) {
    const matchingIndex = intents.findIndex((intent) => txMatchesDelegationIntent(tx, intent));
    if (matchingIndex === -1) {
      throw new Error(
        `No delegation intent matched planned call[${txIndex}] (to=${tx.to}, selector=${tx.selector}). Re-run onboarding to sign updated delegations.`,
      );
    }

    const lastSegment = executionSegments.at(-1);
    if (!lastSegment || lastSegment.intentIndex !== matchingIndex) {
      executionSegments.push({ intentIndex: matchingIndex, executions: [] });
      intentSegmentCounts.set(matchingIndex, (intentSegmentCounts.get(matchingIndex) ?? 0) + 1);
    }

    const currentSegment = executionSegments.at(-1);
    if (!currentSegment) {
      throw new Error('Internal error: failed to create execution segment');
    }
    currentSegment.executions.push(
      createExecutionSafe({
        target: tx.to,
        value: tx.value,
        callData: tx.data,
      }),
    );
  }

  const uniqueDelegates = new Set(
    params.delegationBundle.delegations
      .flat()
      .map((delegation) => delegation.delegate.toLowerCase()),
  );
  const uniqueDelegators = new Set(
    params.delegationBundle.delegations
      .flat()
      .map((delegation) => delegation.delegator.toLowerCase()),
  );

  logInfo('Delegated execution plan prepared', {
    chainId: normalization.chainId,
    segmentCount: executionSegments.length,
    totalCalls: executionSegments.reduce((sum, segment) => sum + segment.executions.length, 0),
    uniqueDelegates: [...uniqueDelegates],
    uniqueDelegators: [...uniqueDelegators],
    expectedDelegate,
    senderAddress,
  });

  if (senderAddress !== expectedDelegate) {
    logInfo('Delegated execution sender mismatch (will likely revert InvalidDelegate)', {
      senderAddress,
      expectedDelegate,
    });
  }

  const rpcUrl = (params.clients.public as unknown as { transport?: { url?: unknown } }).transport?.url;
  const defaultArbitrumRpcUrl = 'https://arb1.arbitrum.io/rpc';
  const resolvedRpcUrl =
    typeof rpcUrl === 'string'
      ? rpcUrl
      : process.env['ARBITRUM_RPC_URL'] ?? defaultArbitrumRpcUrl;

  const simulationClient = createClient({
    account: params.clients.wallet.account,
    chain: params.clients.wallet.chain,
    transport: createRpcTransport(resolvedRpcUrl),
  }).extend(publicActions);

  const requiresMultipleRedemptions = [...intentSegmentCounts.values()].some((count) => count > 1);
  if (requiresMultipleRedemptions) {
    const repeatedIntents = [...intentSegmentCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([intentIndex, count]) => ({
        intentIndex,
        count,
        target: params.delegationBundle.intents[intentIndex]?.target,
        selector: params.delegationBundle.intents[intentIndex]?.selector,
        description: params.delegationBundle.descriptions[intentIndex],
      }));
    logInfo('Delegated execution will split redemptions to preserve intent order', {
      redemptionCount: executionSegments.length,
      repeatedIntents,
    });
  }

  const redemptionPlans = requiresMultipleRedemptions
    ? executionSegments.map((segment) => ({
        permissionContexts: [[params.delegationBundle.delegations[segment.intentIndex]]],
        executions: [segment.executions],
        modes: [
          segment.executions.length === 1 ? ExecutionMode.SingleDefault : ExecutionMode.BatchDefault,
        ],
      }))
    : [
        {
          permissionContexts: executionSegments.map((segment) => [
            params.delegationBundle.delegations[segment.intentIndex],
          ]),
          executions: executionSegments.map((segment) => segment.executions),
          modes: executionSegments.map((segment) =>
            segment.executions.length === 1 ? ExecutionMode.SingleDefault : ExecutionMode.BatchDefault,
          ),
        },
      ];

  const txHashes: `0x${string}`[] = [];
  const receipts: TransactionReceipt[] = [];
  let totalGasSpentWei: bigint | undefined;

  for (const [planIndex, plan] of redemptionPlans.entries()) {
    const intentIndex =
      plan.permissionContexts.length === 1
        ? params.delegationBundle.delegations.findIndex(
            (delegation) => delegation === plan.permissionContexts[0]?.[0],
          )
        : null;
    const intentSummary =
      intentIndex !== null && intentIndex >= 0
        ? {
            intentIndex,
            intentTarget: params.delegationBundle.intents[intentIndex]?.target,
            intentSelector: params.delegationBundle.intents[intentIndex]?.selector,
            intentDescription: params.delegationBundle.descriptions[intentIndex],
          }
        : undefined;

    logInfo('Delegated execution segment prepared', {
      segmentIndex: planIndex,
      segmentCount: redemptionPlans.length,
      groupCount: plan.executions.length,
      callCount: plan.executions.reduce((sum, group) => sum + group.length, 0),
      ...(intentSummary ? { intent: intentSummary } : {}),
    });

    const simulation = await DelegationManager.simulate.redeemDelegations({
      client: simulationClient,
      delegationManagerAddress: params.delegationBundle.delegationManager,
      delegations: plan.permissionContexts,
      modes: plan.modes,
      executions: plan.executions,
    });
    const estimatedGasFromSimulation =
      typeof simulation.request.gas === 'bigint' ? simulation.request.gas : undefined;

    const data = DelegationManager.encode.redeemDelegations({
      delegations: plan.permissionContexts,
      modes: plan.modes,
      executions: plan.executions,
    });

    let estimatedGasFromNode: bigint | undefined;
    try {
      estimatedGasFromNode = await params.clients.public.estimateGas({
        account: params.clients.wallet.account,
        to: params.delegationBundle.delegationManager,
        data,
        value: 0n,
      });
    } catch (error) {
      logInfo(
        'Delegated execution gas estimate failed; falling back to simulation estimate',
        {
          error: error instanceof Error ? error.message : String(error),
          planIndex,
        },
      );
    }

    const baseEstimate =
      estimatedGasFromNode && estimatedGasFromSimulation
        ? estimatedGasFromNode > estimatedGasFromSimulation
          ? estimatedGasFromNode
          : estimatedGasFromSimulation
        : estimatedGasFromNode ?? estimatedGasFromSimulation;
    const gasFloor = 200_000n;
    const bufferedGas = baseEstimate ? (baseEstimate * 3n) / 2n : undefined;
    const gas = bufferedGas ? (bufferedGas > gasFloor ? bufferedGas : gasFloor) : gasFloor;

    logInfo(
      'Delegated execution gas selected',
      {
        planIndex,
        gasFloor: gasFloor.toString(),
        estimateFromNode: estimatedGasFromNode?.toString(),
        estimateFromSimulation: estimatedGasFromSimulation?.toString(),
        selectedGas: gas.toString(),
      },
      { detailed: true },
    );

    const txHash = await params.clients.wallet.sendTransaction({
      account: params.clients.wallet.account,
      chain: params.clients.wallet.chain,
      to: params.delegationBundle.delegationManager,
      data,
      value: 0n,
      ...(gas ? { gas } : {}),
    });

    const receipt = await params.clients.public.waitForTransactionReceipt({ hash: txHash });
    txHashes.push(txHash);
    receipts.push(receipt);
    if (receipt.gasUsed !== undefined && receipt.effectiveGasPrice !== undefined) {
      totalGasSpentWei =
        (totalGasSpentWei ?? 0n) + receipt.gasUsed * receipt.effectiveGasPrice;
    }
  }

  return { txHashes, receipts, gasSpentWei: totalGasSpentWei };
}

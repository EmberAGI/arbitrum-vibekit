import { erc20Abi, parseUnits } from 'viem';

import type { createClients } from '../clients/clients.js';
import type {
  EmberCamelotClient} from '../clients/emberApi.js';
import {
  fetchPoolSnapshot,
  type ClmmRebalanceRequest,
  type ClmmWithdrawRequest,
  type TransactionInformation,
} from '../clients/emberApi.js';
import {
  ARBITRUM_CHAIN_ID,
  CAMELOT_POSITION_MANAGER_ADDRESS,
} from '../config/constants.js';
import { ensureAllowance } from '../core/allowances.js';
import { buildRange, deriveMidPrice } from '../core/decision-engine.js';
import { executeTransaction } from '../core/transaction.js';
import { type CamelotPool, type ClmmAction, type ResolvedOperatorConfig } from '../domain/types.js';

import { logInfo, normalizeHexAddress } from './context.js';

type TokenAllocation = {
  token0: bigint;
  token1: bigint;
};

const MAX_WITHDRAW_ATTEMPTS = 3;

export async function executeDecision({
  action,
  camelotClient,
  pool,
  operatorConfig,
  clients,
}: {
  action: ClmmAction;
  camelotClient: EmberCamelotClient;
  pool: CamelotPool;
  operatorConfig: ResolvedOperatorConfig;
  clients: ReturnType<typeof createClients>;
}): Promise<{ txHash?: string; gasSpentWei?: bigint }> {
  const walletAddress = operatorConfig.walletAddress;
  if (action.kind === 'hold') {
    throw new Error('executeDecision invoked with hold action');
  }

  const chainIdString = ARBITRUM_CHAIN_ID.toString();
  const poolIdentifier = {
    chainId: chainIdString,
    address: pool.address,
  };

  const withdrawPayload: ClmmWithdrawRequest = {
    walletAddress,
    poolTokenUid: poolIdentifier,
  };
  let lastTxHash: string | undefined;
  let totalGasSpentWei: bigint | undefined;

  if (
    action.kind === 'adjust-range' ||
    action.kind === 'exit-range' ||
    action.kind === 'compound-fees'
  ) {
    const withdrawalOutcome = await executeWithdrawalPlans({
      camelotClient,
      withdrawPayload,
      clients,
    });
    lastTxHash = withdrawalOutcome.lastHash;
    if (withdrawalOutcome.gasSpentWei !== undefined) {
      totalGasSpentWei = (totalGasSpentWei ?? 0n) + withdrawalOutcome.gasSpentWei;
    }
  }

  switch (action.kind) {
    case 'enter-range':
    case 'adjust-range': {
      const refreshedPoolSnapshot =
        (await fetchPoolSnapshot(
          camelotClient,
          normalizeHexAddress(pool.address, 'pool address'),
          ARBITRUM_CHAIN_ID,
        )) ?? pool;
      const decimalsDiff =
        refreshedPoolSnapshot.token0.decimals - refreshedPoolSnapshot.token1.decimals;
      const refreshedTargetRange = buildRange(
        deriveMidPrice(refreshedPoolSnapshot),
        action.targetRange.bandwidthBps,
        refreshedPoolSnapshot.tickSpacing,
        decimalsDiff,
      );
      if (
        refreshedTargetRange.lowerTick !== action.targetRange.lowerTick ||
        refreshedTargetRange.upperTick !== action.targetRange.upperTick
      ) {
        logInfo('Refreshed target range after withdrawal', {
          previousRange: {
            lowerTick: action.targetRange.lowerTick,
            upperTick: action.targetRange.upperTick,
          },
          refreshedRange: {
            lowerTick: refreshedTargetRange.lowerTick,
            upperTick: refreshedTargetRange.upperTick,
          },
          confirmationTick: refreshedPoolSnapshot.tick,
        });
      }
      action.targetRange = refreshedTargetRange;

      const allocations = estimateTokenAllocations(
        refreshedPoolSnapshot,
        operatorConfig.baseContributionUsd,
      );
      const tokenBudget = await resolveTokenBudget({
        publicClient: clients.public,
        walletAddress,
        pool: refreshedPoolSnapshot,
        desired: allocations,
      });

      if (!tokenBudget) {
        logInfo('Skipping supply: wallet lacks required token balances', {
          walletAddress,
          token0Required: allocations.token0.toString(),
          token1Required: allocations.token1.toString(),
        });
        return { txHash: lastTxHash, gasSpentWei: totalGasSpentWei };
      }

      if (tokenBudget.token0 < allocations.token0 || tokenBudget.token1 < allocations.token1) {
        logInfo('Clamped supply allocation to wallet balances', {
          walletAddress,
          token0Planned: allocations.token0.toString(),
          token0Using: tokenBudget.token0.toString(),
          token1Planned: allocations.token1.toString(),
          token1Using: tokenBudget.token1.toString(),
        });
      }

      await ensureAllowance({
        publicClient: clients.public,
        tokenAddress: refreshedPoolSnapshot.token0.address,
        ownerAccount: walletAddress,
        spenderAddress: CAMELOT_POSITION_MANAGER_ADDRESS,
        requiredAmount: tokenBudget.token0,
        clients,
      });
      await ensureAllowance({
        publicClient: clients.public,
        tokenAddress: refreshedPoolSnapshot.token1.address,
        ownerAccount: walletAddress,
        spenderAddress: CAMELOT_POSITION_MANAGER_ADDRESS,
        requiredAmount: tokenBudget.token1,
        clients,
      });

      const rebalancePayload: ClmmRebalanceRequest = {
        walletAddress,
        supplyChain: chainIdString,
        poolIdentifier,
        range: {
          type: 'limited',
          minPrice: action.targetRange.lowerPrice.toString(),
          maxPrice: action.targetRange.upperPrice.toString(),
        },
        payableTokens: [
          {
            tokenUid: {
              chainId: chainIdString,
              address: refreshedPoolSnapshot.token0.address,
            },
            amount: tokenBudget.token0.toString(),
          },
          {
            tokenUid: {
              chainId: chainIdString,
              address: refreshedPoolSnapshot.token1.address,
            },
            amount: tokenBudget.token1.toString(),
          },
        ],
      };

      logInfo('Prepared Ember supply payload', {
        walletAddress,
        poolAddress: poolIdentifier.address,
        tickLower: action.targetRange.lowerTick,
        tickUpper: action.targetRange.upperTick,
        tokenBudget: {
          token0: tokenBudget.token0.toString(),
          token1: tokenBudget.token1.toString(),
        },
      });

      const rebalancePlan = await camelotClient.requestRebalance(rebalancePayload);
      logInfo('Received Ember supply plan', {
        requestId: rebalancePlan.requestId,
        transactionCount: rebalancePlan.transactions.length,
      });

      const confirmationSnapshot = await fetchPoolSnapshot(
        camelotClient,
        normalizeHexAddress(pool.address, 'pool address'),
        ARBITRUM_CHAIN_ID,
      );
      if (confirmationSnapshot) {
        logInfo('Validated pool snapshot prior to executing supply plan', {
          previousTick: refreshedPoolSnapshot.tick,
          confirmationTick: confirmationSnapshot.tick,
          tickDelta: confirmationSnapshot.tick - refreshedPoolSnapshot.tick,
        });
      }

      const supplyOutcome = await executePlanTransactions({
        plan: rebalancePlan,
        clients,
      });
      lastTxHash = supplyOutcome.lastHash ?? lastTxHash;
      if (supplyOutcome.gasSpentWei !== undefined) {
        totalGasSpentWei = (totalGasSpentWei ?? 0n) + supplyOutcome.gasSpentWei;
      }
      return { txHash: lastTxHash, gasSpentWei: totalGasSpentWei };
    }
    case 'exit-range':
    case 'compound-fees':
      return { txHash: lastTxHash, gasSpentWei: totalGasSpentWei };
    default:
      assertUnreachable(action);
  }
}

async function executePlannedTransaction({
  tx,
  clients,
}: {
  tx: TransactionInformation;
  clients: ReturnType<typeof createClients>;
}): Promise<{ receipt: Awaited<ReturnType<typeof executeTransaction>>; gasSpentWei?: bigint }> {
  const callValue = parseTransactionValue(tx.value);

  logInfo('Submitting Camelot transaction', {
    to: tx.to,
    chainId: tx.chainId,
    callValue: callValue.toString(),
    dataLength: tx.data.length,
  });

  const receipt = await executeTransaction(clients, {
    to: tx.to,
    data: tx.data,
    ...(callValue > 0n ? { value: callValue } : {}),
  });

  const receiptMetadata = {
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    to: tx.to,
    status: receipt.status,
    chainId: tx.chainId,
  };

  if (receipt.status !== 'success') {
    logInfo('Transaction failed', receiptMetadata);
    const revertReason = await describeRevertReason({
      tx,
      clients,
      callValue,
      blockNumber: receipt.blockNumber,
    });
    const detail = revertReason ? `: ${revertReason}` : '';
    throw new Error(`Camelot transaction ${receipt.transactionHash} reverted${detail}`);
  }

  logInfo('Transaction confirmed', receiptMetadata);
  const gasSpentWei =
    receipt.gasUsed !== undefined && receipt.effectiveGasPrice !== undefined
      ? receipt.gasUsed * receipt.effectiveGasPrice
      : undefined;
  if (gasSpentWei !== undefined) {
    logInfo('Transaction gas spent (wei)', { transactionHash: receipt.transactionHash, gasSpentWei: gasSpentWei.toString() });
  }
  return { receipt, gasSpentWei };
}

async function executeWithdrawalPlans({
  camelotClient,
  withdrawPayload,
  clients,
}: {
  camelotClient: EmberCamelotClient;
  withdrawPayload: ClmmWithdrawRequest;
  clients: ReturnType<typeof createClients>;
}): Promise<{ lastHash?: string; gasSpentWei?: bigint }> {
  let lastHash: string | undefined;
  let totalGasSpentWei: bigint | undefined;

  // Keep requesting withdrawal plans until the provider reports no further transactions.
  // This allows multi-step withdrawals (e.g. unwind, collect, etc.) without changing thread state.
  for (let planIndex = 0; ; planIndex += 1) {
    let plan: Awaited<ReturnType<EmberCamelotClient['requestWithdrawal']>> | undefined;
    for (let attempt = 0; attempt < MAX_WITHDRAW_ATTEMPTS; attempt += 1) {
      try {
        plan = await camelotClient.requestWithdrawal(withdrawPayload);
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logInfo('Withdrawal request failed', { attempt: attempt + 1, error: message });
        if (attempt + 1 >= MAX_WITHDRAW_ATTEMPTS) {
          throw new Error(
            `Ember withdrawal request failed after ${MAX_WITHDRAW_ATTEMPTS} attempts: ${message}`,
          );
        }
      }
    }

    if (!plan) {
      throw new Error('Withdrawal request failed without returning a plan');
    }

    if (plan.transactions.length === 0) {
      return { lastHash, gasSpentWei: totalGasSpentWei };
    }

    logInfo('Executing Ember withdrawal plan', {
      attempt: planIndex + 1,
      transactionCount: plan.transactions.length,
    });
    const outcome = await executePlanTransactions({ plan, clients });
    lastHash = outcome.lastHash ?? lastHash;
    if (outcome.gasSpentWei !== undefined) {
      totalGasSpentWei = (totalGasSpentWei ?? 0n) + outcome.gasSpentWei;
    }
  }
}

async function executePlanTransactions({
  plan,
  clients,
}: {
  plan: { transactions: TransactionInformation[] };
  clients: ReturnType<typeof createClients>;
}): Promise<{ lastHash?: string; gasSpentWei?: bigint }> {
  let lastHash: string | undefined;
  let totalGasSpentWei: bigint | undefined;
  for (const tx of plan.transactions) {
    const { receipt, gasSpentWei } = await executePlannedTransaction({ tx, clients });
    lastHash = receipt.transactionHash;
    if (gasSpentWei !== undefined) {
      totalGasSpentWei = (totalGasSpentWei ?? 0n) + gasSpentWei;
    }
  }
  return { lastHash, gasSpentWei: totalGasSpentWei };
}

async function resolveTokenBudget({
  publicClient,
  walletAddress,
  pool,
  desired,
}: {
  publicClient: ReturnType<typeof createClients>['public'];
  walletAddress: `0x${string}`;
  pool: CamelotPool;
  desired: TokenAllocation;
}): Promise<TokenAllocation | undefined> {
  const [token0Balance, token1Balance] = await Promise.all([
    readTokenBalance(publicClient, pool.token0.address, walletAddress),
    readTokenBalance(publicClient, pool.token1.address, walletAddress),
  ]);

  const token0 = token0Balance < desired.token0 ? token0Balance : desired.token0;
  const token1 = token1Balance < desired.token1 ? token1Balance : desired.token1;
  if (token0 === 0n || token1 === 0n) {
    logInfo('Wallet lacks sufficient balance to supply both tokens', {
      walletAddress,
      token0Balance: token0Balance.toString(),
      token1Balance: token1Balance.toString(),
      token0Required: desired.token0.toString(),
      token1Required: desired.token1.toString(),
    });
    return undefined;
  }

  return { token0, token1 };
}

function readTokenBalance(
  publicClient: ReturnType<typeof createClients>['public'],
  tokenAddress: `0x${string}`,
  walletAddress: `0x${string}`,
) {
  return publicClient.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [walletAddress],
  });
}

function parseTransactionValue(value: string | undefined) {
  if (!value) {
    return 0n;
  }
  try {
    return BigInt(value);
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
    throw new Error(`Unable to parse transaction value "${value}": ${reason}`);
  }
}

async function describeRevertReason({
  tx,
  clients,
  callValue,
  blockNumber,
}: {
  tx: TransactionInformation;
  clients: ReturnType<typeof createClients>;
  callValue: bigint;
  blockNumber: bigint;
}) {
  try {
    await clients.public.call({
      account: clients.wallet.account,
      to: tx.to,
      data: tx.data,
      ...(callValue > 0n ? { value: callValue } : {}),
      blockNumber,
    });
    return 'Call succeeded when replayed; original revert reason unavailable.';
  } catch (error) {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return undefined;
  }
}

function assertUnreachable(value: never): never {
  const kind =
    typeof value === 'object' && value !== null && 'kind' in value
      ? (value as { kind?: string }).kind
      : undefined;
  const detail = kind ? `: ${kind}` : '';
  throw new Error(`Unsupported action kind${detail}`);
}

function estimateTokenAllocations(pool: CamelotPool, baseContributionUsd: number) {
  const half = baseContributionUsd / 2;
  const midPrice = deriveMidPrice(pool);
  const token0Price =
    pool.token0.usdPrice ??
    (pool.token1.usdPrice && midPrice > 0 ? pool.token1.usdPrice * midPrice : undefined);
  const token1Price =
    pool.token1.usdPrice ??
    (pool.token0.usdPrice && midPrice > 0 ? pool.token0.usdPrice / midPrice : undefined);

  if (!token0Price || !token1Price || token0Price <= 0 || token1Price <= 0) {
    throw new Error('Token USD prices unavailable; cannot size allowances');
  }

  const amount0 = parseUnits(
    (half / token0Price).toFixed(pool.token0.decimals),
    pool.token0.decimals,
  );
  const amount1 = parseUnits(
    (half / token1Price).toFixed(pool.token1.decimals),
    pool.token1.decimals,
  );

  return { token0: amount0, token1: amount1 };
}

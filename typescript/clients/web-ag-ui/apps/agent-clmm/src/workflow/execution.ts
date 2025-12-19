import { erc20Abi, parseUnits } from 'viem';

import type { createClients } from '../clients/clients.js';
import type { EmberCamelotClient } from '../clients/emberApi.js';
import {
  formatEmberApiError,
  fetchPoolSnapshot,
  type ClmmRebalanceRequest,
  type ClmmSwapRequest,
  type ClmmWithdrawRequest,
  type TransactionInformation,
} from '../clients/emberApi.js';
import { ARBITRUM_CHAIN_ID } from '../config/constants.js';
import { buildRange, deriveMidPrice } from '../core/decision-engine.js';
import { redeemDelegationsAndExecuteTransactions } from '../core/delegatedExecution.js';
import { executeTransaction } from '../core/transaction.js';
import { type CamelotPool, type ClmmAction, type ResolvedOperatorConfig } from '../domain/types.js';

import { logInfo, normalizeHexAddress, type DelegationBundle } from './context.js';
import { estimateTokenAllocationsUsd } from './planning/allocations.js';

const MAX_WITHDRAW_ATTEMPTS = 3;

function stableTokenDecimals(address: `0x${string}`): number | null {
  const normalized = address.toLowerCase();
  switch (normalized) {
    case '0xaf88d065e77c8cc2239327c5edb3a432268e5831': // USDC
    case '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8': // USDC.e
    case '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': // USDT
      return 6;
    case '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': // DAI
      return 18;
    default:
      return null;
  }
}

function buildStableSwapExactInAmount(params: {
  baseContributionUsd: number;
  swapCount: number;
  decimals: number;
}): string {
  const count = Math.max(1, Math.floor(params.swapCount));
  const perSwapUsd = params.baseContributionUsd / count;
  const boundedUsd = Math.max(1, Math.min(10, perSwapUsd));
  return parseUnits(boundedUsd.toFixed(params.decimals), params.decimals).toString();
}

function summarizeSwapRequest(request: ClmmSwapRequest) {
  return {
    walletAddress: request.walletAddress,
    amountType: request.amountType,
    amount: request.amount,
    fromTokenUid: request.fromTokenUid,
    toTokenUid: request.toTokenUid,
  };
}

function isKnownEmberSwapUpstream400(error: unknown): boolean {
  const emberError = formatEmberApiError(error);
  return (
    emberError?.path === '/swap' &&
    emberError.status === 500 &&
    emberError.upstreamStatus === 400
  );
}

function estimateExactInFromUsd(params: {
  amountOutBaseUnits: bigint;
  toTokenUsdPrice: number;
  toTokenDecimals: number;
  fromTokenUsdPrice: number;
  fromTokenDecimals: number;
  slippageMultiplier: number;
  maxAmountInBaseUnits?: bigint;
}): string {
  if (params.amountOutBaseUnits <= 0n) {
    return '0';
  }
  if (params.toTokenUsdPrice <= 0 || params.fromTokenUsdPrice <= 0) {
    return '0';
  }

  const amountOut =
    Number(params.amountOutBaseUnits) / Math.pow(10, params.toTokenDecimals);
  if (!Number.isFinite(amountOut) || amountOut <= 0) {
    return '0';
  }

  const usdOut = amountOut * params.toTokenUsdPrice;
  const usdIn = usdOut * params.slippageMultiplier;
  const fromAmount = usdIn / params.fromTokenUsdPrice;
  if (!Number.isFinite(fromAmount) || fromAmount <= 0) {
    return '0';
  }

  let amountInBaseUnits = parseUnits(fromAmount.toFixed(params.fromTokenDecimals), params.fromTokenDecimals);
  if (amountInBaseUnits <= 0n) {
    amountInBaseUnits = 1n;
  }
  if (typeof params.maxAmountInBaseUnits === 'bigint' && params.maxAmountInBaseUnits > 0n) {
    amountInBaseUnits =
      amountInBaseUnits > params.maxAmountInBaseUnits ? params.maxAmountInBaseUnits : amountInBaseUnits;
  }
  return amountInBaseUnits.toString();
}

function summarizeSupplyRequest(request: ClmmRebalanceRequest) {
  return {
    walletAddress: request.walletAddress,
    supplyChain: request.supplyChain,
    poolIdentifier: request.poolIdentifier,
    range: request.range,
    payableTokens: request.payableTokens.map((token) => ({
      tokenUid: token.tokenUid,
      amount: token.amount,
    })),
  };
}

function summarizeWithdrawRequest(request: ClmmWithdrawRequest) {
  return {
    walletAddress: request.walletAddress,
    poolTokenUid: request.poolTokenUid,
  };
}

export async function executeDecision({
  action,
  camelotClient,
  pool,
  operatorConfig,
  delegationBundle,
  fundingTokenAddress,
  delegationsBypassActive,
  clients,
}: {
  action: ClmmAction;
  camelotClient: EmberCamelotClient;
  pool: CamelotPool;
  operatorConfig: ResolvedOperatorConfig;
  delegationBundle?: DelegationBundle;
  fundingTokenAddress?: `0x${string}`;
  delegationsBypassActive?: boolean;
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
      delegationBundle: delegationsBypassActive ? undefined : delegationBundle,
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

      const desired = estimateTokenAllocationsUsd(
        refreshedPoolSnapshot,
        operatorConfig.baseContributionUsd,
      );
      const [token0Balance, token1Balance] = await Promise.all([
        readTokenBalance(clients.public, refreshedPoolSnapshot.token0.address, walletAddress),
        readTokenBalance(clients.public, refreshedPoolSnapshot.token1.address, walletAddress),
      ]);

      const deficit0 = desired.token0 > token0Balance ? desired.token0 - token0Balance : 0n;
      const deficit1 = desired.token1 > token1Balance ? desired.token1 - token1Balance : 0n;

      const swapTransactions: TransactionInformation[] = [];
      const normalizedFundingToken = fundingTokenAddress
        ? normalizeHexAddress(fundingTokenAddress, 'funding token address')
        : undefined;

      if (deficit0 > 0n || deficit1 > 0n) {
        const swapFromWithinPair = async (params: {
          fromToken: `0x${string}`;
          toToken: `0x${string}`;
          amountOut: bigint;
          maxAmountIn: bigint;
        }) => {
          const exactOutRequest: ClmmSwapRequest = {
            walletAddress,
            amount: params.amountOut.toString(),
            amountType: 'exactOut',
            fromTokenUid: { chainId: chainIdString, address: params.fromToken },
            toTokenUid: { chainId: chainIdString, address: params.toToken },
          };
          let response: Awaited<ReturnType<EmberCamelotClient['requestSwap']>>;
          try {
            response = await camelotClient.requestSwap(exactOutRequest);
          } catch (error: unknown) {
            logInfo('Ember /swap request failed', {
              request: summarizeSwapRequest(exactOutRequest),
              emberError: formatEmberApiError(error),
              error: error instanceof Error ? error.message : String(error),
            });

            if (!isKnownEmberSwapUpstream400(error)) {
              throw error;
            }

            const fromTokenIsToken0 =
              refreshedPoolSnapshot.token0.address.toLowerCase() === params.fromToken.toLowerCase();
            const fromMeta = fromTokenIsToken0
              ? refreshedPoolSnapshot.token0
              : refreshedPoolSnapshot.token1;
            const toMeta = fromTokenIsToken0 ? refreshedPoolSnapshot.token1 : refreshedPoolSnapshot.token0;

            const amountIn = estimateExactInFromUsd({
              amountOutBaseUnits: params.amountOut,
              toTokenUsdPrice: toMeta.usdPrice ?? 0,
              toTokenDecimals: toMeta.decimals,
              fromTokenUsdPrice: fromMeta.usdPrice ?? 0,
              fromTokenDecimals: fromMeta.decimals,
              slippageMultiplier: 1.05,
              maxAmountInBaseUnits: params.maxAmountIn,
            });

            if (amountIn === '0') {
              throw error;
            }

            const exactInRequest: ClmmSwapRequest = {
              walletAddress,
              amount: amountIn,
              amountType: 'exactIn',
              fromTokenUid: { chainId: chainIdString, address: params.fromToken },
              toTokenUid: { chainId: chainIdString, address: params.toToken },
            };

            logInfo('Retrying Ember /swap with exactIn after upstream 400', {
              previous: summarizeSwapRequest(exactOutRequest),
              retry: summarizeSwapRequest(exactInRequest),
            });

            response = await camelotClient.requestSwap(exactInRequest);
          }
          swapTransactions.push(...response.transactions);
        };

        const swapFromExternalFundingExactOut = async (params: {
          toToken: `0x${string}`;
          amountOut: bigint;
        }) => {
          if (!normalizedFundingToken) {
            throw new Error(
              'Swap funding token not configured. Re-hire the agent or provide pool tokens to proceed.',
            );
          }
          const request: ClmmSwapRequest = {
            walletAddress,
            amount: params.amountOut.toString(),
            amountType: 'exactOut',
            fromTokenUid: { chainId: chainIdString, address: normalizedFundingToken },
            toTokenUid: { chainId: chainIdString, address: params.toToken },
          };
          let response: Awaited<ReturnType<EmberCamelotClient['requestSwap']>>;
          try {
            response = await camelotClient.requestSwap(request);
          } catch (error: unknown) {
            logInfo('Ember /swap request failed', {
              request: summarizeSwapRequest(request),
              emberError: formatEmberApiError(error),
              error: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
          swapTransactions.push(...response.transactions);
        };

        // Prefer swaps within the pool token pair when possible (no external funding).
        if (deficit0 > 0n && deficit1 === 0n && token1Balance > desired.token1) {
          await swapFromWithinPair({
            fromToken: refreshedPoolSnapshot.token1.address,
            toToken: refreshedPoolSnapshot.token0.address,
            amountOut: deficit0,
            maxAmountIn: token1Balance - desired.token1,
          });
        } else if (deficit1 > 0n && deficit0 === 0n && token0Balance > desired.token0) {
          await swapFromWithinPair({
            fromToken: refreshedPoolSnapshot.token0.address,
            toToken: refreshedPoolSnapshot.token1.address,
            amountOut: deficit1,
            maxAmountIn: token0Balance - desired.token0,
          });
        } else {
          // External funding required (either both tokens short, or the available token pair value
          // is not sufficient to convert within-pair without underfunding the other side).
          const targets: Array<{ toToken: `0x${string}`; amountOut: bigint }> = [];
          if (deficit0 > 0n) {
            targets.push({ toToken: refreshedPoolSnapshot.token0.address, amountOut: deficit0 });
          }
          if (deficit1 > 0n) {
            targets.push({ toToken: refreshedPoolSnapshot.token1.address, amountOut: deficit1 });
          }

          const fundingStableDecimals =
            normalizedFundingToken ? stableTokenDecimals(normalizedFundingToken) : null;

          if (normalizedFundingToken && fundingStableDecimals !== null && targets.length > 0) {
            // Swap providers often reject `exactOut` for small outputs (or certain routes).
            // When funding with a known stablecoin, prefer `exactIn` bounded by baseContributionUsd,
            // mirroring the working demo/liquidity behavior.
            const exactInAmount = buildStableSwapExactInAmount({
              baseContributionUsd: operatorConfig.baseContributionUsd,
              swapCount: targets.length,
              decimals: fundingStableDecimals,
            });

            for (const target of targets) {
              const request: ClmmSwapRequest = {
                walletAddress,
                amount: exactInAmount,
                amountType: 'exactIn',
                fromTokenUid: { chainId: chainIdString, address: normalizedFundingToken },
                toTokenUid: { chainId: chainIdString, address: target.toToken },
              };
              let response: Awaited<ReturnType<EmberCamelotClient['requestSwap']>>;
              try {
                response = await camelotClient.requestSwap(request);
              } catch (error: unknown) {
                logInfo('Ember /swap request failed', {
                  request: summarizeSwapRequest(request),
                  emberError: formatEmberApiError(error),
                  error: error instanceof Error ? error.message : String(error),
                });
                throw error;
              }
              swapTransactions.push(...response.transactions);
            }
          } else {
            for (const target of targets) {
              await swapFromExternalFundingExactOut({
                toToken: target.toToken,
                amountOut: target.amountOut,
              });
            }
          }
        }
      }

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
            amount: desired.token0.toString(),
          },
          {
            tokenUid: {
              chainId: chainIdString,
              address: refreshedPoolSnapshot.token1.address,
            },
            amount: desired.token1.toString(),
          },
        ],
      };

      logInfo('Prepared Ember supply payload', {
        walletAddress,
        poolAddress: poolIdentifier.address,
        tickLower: action.targetRange.lowerTick,
        tickUpper: action.targetRange.upperTick,
        desired: {
          token0: desired.token0.toString(),
          token1: desired.token1.toString(),
        },
      });

      let rebalancePlan: Awaited<ReturnType<EmberCamelotClient['requestRebalance']>>;
      try {
        rebalancePlan = await camelotClient.requestRebalance(rebalancePayload);
      } catch (error: unknown) {
        logInfo('Ember /liquidity/supply request failed', {
          request: summarizeSupplyRequest(rebalancePayload),
          emberError: formatEmberApiError(error),
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
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
        plan: { transactions: [...swapTransactions, ...rebalancePlan.transactions] },
        clients,
        delegationBundle: delegationsBypassActive ? undefined : delegationBundle,
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
  delegationBundle,
}: {
  camelotClient: EmberCamelotClient;
  withdrawPayload: ClmmWithdrawRequest;
  clients: ReturnType<typeof createClients>;
  delegationBundle?: DelegationBundle;
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
        logInfo('Ember /liquidity/withdraw request failed', {
          attempt: attempt + 1,
          request: summarizeWithdrawRequest(withdrawPayload),
          emberError: formatEmberApiError(error),
          error: message,
        });
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
    const outcome = await executePlanTransactions({ plan, clients, delegationBundle });
    lastHash = outcome.lastHash ?? lastHash;
    if (outcome.gasSpentWei !== undefined) {
      totalGasSpentWei = (totalGasSpentWei ?? 0n) + outcome.gasSpentWei;
    }
  }
}

async function executePlanTransactions({
  plan,
  clients,
  delegationBundle,
}: {
  plan: { transactions: TransactionInformation[] };
  clients: ReturnType<typeof createClients>;
  delegationBundle?: DelegationBundle;
}): Promise<{ lastHash?: string; gasSpentWei?: bigint }> {
  if (delegationBundle) {
    const { txHash, receipt } = await redeemDelegationsAndExecuteTransactions({
      clients,
      delegationBundle,
      transactions: plan.transactions,
    });
    const gasSpentWei =
      receipt.gasUsed !== undefined && receipt.effectiveGasPrice !== undefined
        ? receipt.gasUsed * receipt.effectiveGasPrice
        : undefined;
    return { lastHash: txHash, gasSpentWei };
  }

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

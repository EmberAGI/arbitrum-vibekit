import {
  type WorkflowContext,
  type WorkflowPlugin,
  type WorkflowState,
  type Artifact,
} from '@emberai/agent-node/workflow';
import { erc20Abi, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { ensureAllowance } from './allowances.js';
import { createClients } from './clients.js';
import {
  ARBITRUM_CHAIN_ID,
  CAMELOT_POSITION_MANAGER_ADDRESS,
  DEFAULT_DEBUG_ALLOWED_TOKENS,
  DEFAULT_REBALANCE_THRESHOLD_PCT,
  DEFAULT_TICK_BANDWIDTH_BPS,
  DATA_STALE_CYCLE_LIMIT,
  EMBER_API_BASE_URL,
  MAX_GAS_SPEND_ETH,
  resolveEthUsdPrice,
  resolvePollIntervalMs,
  resolveStreamLimit,
} from './constants.js';
import {
  computeVolatilityPct,
  deriveMidPrice,
  evaluateDecision,
  estimateFeeValueUsd,
  normalizePosition,
  buildRange,
  tickToPrice,
} from './decision-engine.js';
import {
  EmberCamelotClient,
  fetchPoolSnapshot,
  type ClmmRebalanceRequest,
  type ClmmWithdrawRequest,
  type TransactionInformation,
} from './emberApi.js';
import { executeTransaction } from './transaction.js';
import {
  OperatorConfigInputSchema,
  type CamelotPool,
  type ClmmAction,
  type OperatorConfigInput,
  type RebalanceTelemetry,
  type ResolvedOperatorConfig,
} from './types.js';
import { sleep } from './utils.js';

const rawAgentPrivateKey = process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'];
if (!rawAgentPrivateKey) {
  throw new Error('A2A_TEST_AGENT_NODE_PRIVATE_KEY environment variable is required');
}
const agentPrivateKey = normalizeHexAddress(rawAgentPrivateKey, 'agent private key');

const DEBUG_MODE = process.env['DEBUG_MODE'] === 'true';
const MAX_WITHDRAW_ATTEMPTS = 3;

const plugin: WorkflowPlugin = {
  id: 'camelot-clmm-rebalancer',
  name: 'Camelot CLMM Auto-Rebalancer',
  description:
    'Maintains Camelot concentrated liquidity positions by polling Ember APIs every 30 seconds and adjusting tick ranges automatically.',
  version: '1.0.0',
  inputSchema: undefined,

  async *execute(
    context: WorkflowContext,
  ): AsyncGenerator<WorkflowState, void, OperatorConfigInput> {
    void context;
    const mode = process.env['CLMM_MODE'] === 'production' ? 'production' : 'debug';
    const pollIntervalMs = resolvePollIntervalMs();
    const streamLimit = resolveStreamLimit();

    const camelotClient = new EmberCamelotClient(EMBER_API_BASE_URL);
    logInfo('Initialized workflow context', { mode, pollIntervalMs, streamLimit });

    yield {
      type: 'dispatch-response',
      parts: [
        {
          kind: 'data',
          data: {
            name: 'Camelot CLMM Auto-Rebalancer',
            subtitle: 'Arbitrum One',
            description:
              'Keeps liquidity centered around the pool mid price and enforces 30-second rebalance cadence.',
          },
        },
      ],
    };

    yield {
      type: 'status-update',
      message: `Bootstrapping CLMM workflow in ${mode} mode (poll every ${pollIntervalMs / 1000}s)`,
    };

    const pools = await camelotClient.listCamelotPools(ARBITRUM_CHAIN_ID);
    const filteredPools = pools.filter((pool) => isPoolAllowed(pool, mode));
    logInfo('Retrieved Camelot pools', {
      total: pools.length,
      allowed: filteredPools.length,
      mode,
    });
    if (filteredPools.length === 0) {
      throw new Error(`No Camelot pools available for mode=${mode}`);
    }

    const poolsArtifact = buildPoolArtifact(filteredPools.slice(0, 8));
    yield { type: 'artifact', artifact: poolsArtifact };

    const operatorInput = yield {
      type: 'interrupted',
      reason: 'input-required',
      message:
        'Select a Camelot pool to manage, confirm wallet, and optional allocation override for this CLMM workflow.',
      inputSchema: OperatorConfigInputSchema,
      artifact: poolsArtifact,
    };

    const { poolAddress, walletAddress, baseContributionUsd } = operatorInput;
    const selectedPoolAddress: `0x${string}` = normalizeHexAddress(poolAddress, 'pool address');
    const operatorWalletAddress = normalizeHexAddress(walletAddress, 'wallet address');

    const selectedPool =
      filteredPools.find(
        (pool) => pool.address.toLowerCase() === selectedPoolAddress.toLowerCase(),
      ) ?? (await fetchPoolSnapshot(camelotClient, selectedPoolAddress, ARBITRUM_CHAIN_ID));

    if (!selectedPool) {
      throw new Error(`Pool ${selectedPoolAddress} not available from Ember API`);
    }

    const account = privateKeyToAccount(agentPrivateKey);
    const clients = createClients(account);
    const agentWalletAddress = normalizeHexAddress(account.address, 'agent wallet address');
    if (agentWalletAddress !== operatorWalletAddress) {
      logInfo('Operator wallet input differs from managed account', {
        operatorWalletAddress,
        agentWalletAddress,
      });
      yield {
        type: 'status-update',
        message: `NOTICE: Private key controls ${agentWalletAddress}; workflow will act on this address instead of ${operatorWalletAddress}.`,
      };
    }

    const operatorConfig: ResolvedOperatorConfig = {
      walletAddress: agentWalletAddress,
      baseContributionUsd: baseContributionUsd ?? 5_000,
      manualBandwidthBps: DEFAULT_TICK_BANDWIDTH_BPS,
      autoCompoundFees: true,
    };
    logInfo('Operator configuration established', {
      poolAddress: selectedPoolAddress,
      operatorWalletAddress,
      agentWalletAddress,
      baseContributionUsd: operatorConfig.baseContributionUsd,
    });

    // TODO: Need to remove delegations and replace with the agent's embedded smart account. The agent's wallet will directly sign and manage the transactions.
    // const delegations = createClmmDelegations({
    //   walletAddress: operatorConfig.walletAddress,
    //   agentSmartAccount: agentsWallet.address,
    //   token0: selectedPool.token0.address as `0x${string}`,
    //   token1: selectedPool.token1.address as `0x${string}`,
    //   environment: String(agentsWallet.environment),
    // });

    // const delegationArtifact = buildDelegationArtifact(delegations);
    // yield { type: 'artifact', artifact: delegationArtifact };

    // const signedDelegationsInput = (yield {
    //   type: 'interrupted',
    //   reason: 'input-required',
    //   message: 'Sign and return each delegation to authorize the workflow.',
    //   inputSchema: z.object({
    //     delegations: z.array(
    //       z.object({
    //         id: z.enum(['approveToken0', 'approveToken1', 'manageCamelot']),
    //         signedDelegation: z.templateLiteral(['0x', z.string()]),
    //       }),
    //     ),
    //   }),
    //   artifact: delegationArtifact,
    // }) as unknown as {
    //   delegations: Array<{ id: keyof typeof delegations; signedDelegation: `0x${string}` }>;
    // };

    // const signedDelegations = Object.fromEntries(
    //   signedDelegationsInput.delegations.map((entry) => [
    //     entry.id,
    //     {
    //       ...delegations[entry.id],
    //       signature: entry.signedDelegation,
    //     } satisfies SignedDelegation,
    //   ]),
    // ) as Record<keyof typeof delegations, SignedDelegation>;

    // yield {
    //   type: 'status-update',
    //   message: 'Delegations received. Starting live polling loop.',
    // };

    const telemetry: RebalanceTelemetry[] = [];
    let previousPrice: number | undefined;
    let cyclesSinceRebalance = 0;
    let staleCycles = 0;
    let lastSnapshot: CamelotPool | undefined = selectedPool;
    let iteration = 0;

    logInfo('Entering polling loop', { streamLimit, pollIntervalMs });
    while (streamLimit < 0 || iteration < streamLimit) {
      iteration += 1;
      logInfo('Polling cycle begin', { iteration, poolAddress: selectedPoolAddress });
      let poolSnapshot: CamelotPool | undefined;
      try {
        poolSnapshot =
          (await fetchPoolSnapshot(camelotClient, selectedPoolAddress, ARBITRUM_CHAIN_ID)) ??
          lastSnapshot;
        staleCycles = 0;
      } catch (error) {
        staleCycles += 1;
        const cause =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : 'Unknown error';
        logInfo('Pool snapshot fetch failed; falling back to cache', {
          iteration,
          staleCycles,
          error: cause,
        });
        if (staleCycles > DATA_STALE_CYCLE_LIMIT) {
          yield {
            type: 'status-update',
            message: `ERROR: Abort: Ember API unreachable for ${staleCycles} consecutive cycles (last error: ${cause})`,
          };
          break;
        }
        poolSnapshot = lastSnapshot;
        yield {
          type: 'status-update',
          message: `WARNING: Using cached pool state (attempt ${staleCycles}/${DATA_STALE_CYCLE_LIMIT}) - last error: ${cause}`,
        };
      }

      if (!poolSnapshot) {
        throw new Error('Unable to obtain Camelot pool snapshot');
      }
      lastSnapshot = poolSnapshot;

      const midPrice = deriveMidPrice(poolSnapshot);
      const volatilityPct = computeVolatilityPct(midPrice, previousPrice);
      previousPrice = midPrice;
      logInfo('Pool snapshot ready', {
        iteration,
        tick: poolSnapshot.tick,
        midPrice,
        volatilityPct,
        tvl: poolSnapshot.activeTvlUSD,
      });
      const decimalsDiff = poolSnapshot.token0.decimals - poolSnapshot.token1.decimals;

      const walletPositions = await camelotClient.getWalletPositions(
        operatorConfig.walletAddress,
        ARBITRUM_CHAIN_ID,
      );
      const currentPositionRaw = walletPositions.find(
        (position) => position.poolAddress.toLowerCase() === poolSnapshot.address.toLowerCase(),
      );
      const currentPosition = currentPositionRaw
        ? normalizePosition(currentPositionRaw)
        : undefined;
      logInfo('Wallet positions fetched', {
        iteration,
        totalPositions: walletPositions.length,
        hasActivePosition: Boolean(currentPosition),
      });
      const positionSummaries = walletPositions.map((position) => ({
        poolAddress: position.poolAddress,
        operator: position.operator,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
        liquidity: position.liquidity,
        suppliedTokens: position.suppliedTokens?.map((token) => ({
          tokenAddress: token.tokenAddress,
          symbol: token.symbol,
          decimals: token.decimals,
          amount: token.amount,
        })),
      }));
      logInfo(
        'Wallet position snapshots',
        { iteration, positions: positionSummaries },
        { detailed: true },
      );

      const ethUsd = resolveEthUsdPrice(poolSnapshot);
      if (!ethUsd) {
        logInfo('Missing WETH/USD price for pool', { poolAddress: poolSnapshot.address });
        throw new Error(
          `failure: Unable to locate a WETH/USD price for pool ${poolSnapshot.address}`,
        );
      }
      const maxGasSpendUsd = MAX_GAS_SPEND_ETH * ethUsd;
      const estimatedFeeValueUsd = estimateFeeValueUsd(currentPosition, poolSnapshot);

      const rebalanceThresholdPct = DEFAULT_REBALANCE_THRESHOLD_PCT;
      const decision = evaluateDecision({
        pool: poolSnapshot,
        position: currentPosition,
        midPrice,
        volatilityPct,
        cyclesSinceRebalance,
        tickBandwidthBps: operatorConfig.manualBandwidthBps,
        rebalanceThresholdPct,
        autoCompoundFees: operatorConfig.autoCompoundFees,
        maxGasSpendUsd,
        estimatedFeeValueUsd,
      });
      logInfo('Decision evaluated', {
        iteration,
        action: decision.kind,
        reason: decision.reason,
        cyclesSinceRebalance,
        volatilityPct,
      });
      const targetRangeForLog =
        decision.kind === 'hold' ||
        decision.kind === 'exit-range' ||
        decision.kind === 'compound-fees'
          ? buildRange(
              midPrice,
              operatorConfig.manualBandwidthBps,
              poolSnapshot.tickSpacing,
              decimalsDiff,
            )
          : decision.targetRange;
      const positionLowerPrice = currentPosition
        ? tickToPrice(currentPosition.tickLower, decimalsDiff)
        : undefined;
      const positionUpperPrice = currentPosition
        ? tickToPrice(currentPosition.tickUpper, decimalsDiff)
        : undefined;
      const pctFromLower =
        currentPosition && positionLowerPrice !== undefined && midPrice > 0
          ? Number((((midPrice - positionLowerPrice) / midPrice) * 100).toFixed(4))
          : undefined;
      const pctToUpper =
        currentPosition && positionUpperPrice !== undefined && midPrice > 0
          ? Number((((positionUpperPrice - midPrice) / midPrice) * 100).toFixed(4))
          : undefined;
      const innerBand =
        currentPosition && rebalanceThresholdPct > 0
          ? (() => {
              const width = currentPosition.tickUpper - currentPosition.tickLower;
              const innerWidth = Math.round(width * rebalanceThresholdPct);
              const padding = Math.max(1, Math.floor((width - innerWidth) / 2));
              return {
                lowerTick: currentPosition.tickLower + padding,
                upperTick: currentPosition.tickUpper - padding,
              };
            })()
          : undefined;
      const distanceToEdges =
        currentPosition && innerBand
          ? {
              ticksFromLower: poolSnapshot.tick - currentPosition.tickLower,
              ticksToUpper: currentPosition.tickUpper - poolSnapshot.tick,
              pctFromLower,
              pctToUpper,
              innerBand: {
                lowerTick: innerBand.lowerTick,
                upperTick: innerBand.upperTick,
                ticksFromInnerLower: poolSnapshot.tick - innerBand.lowerTick,
                ticksToInnerUpper: innerBand.upperTick - poolSnapshot.tick,
              },
            }
          : currentPosition
            ? {
                ticksFromLower: poolSnapshot.tick - currentPosition.tickLower,
                ticksToUpper: currentPosition.tickUpper - poolSnapshot.tick,
                pctFromLower,
                pctToUpper,
              }
            : undefined;
      const inRange = currentPosition
        ? poolSnapshot.tick >= currentPosition.tickLower &&
          poolSnapshot.tick <= currentPosition.tickUpper
        : undefined;
      const inInnerBand = innerBand
        ? poolSnapshot.tick >= innerBand.lowerTick && poolSnapshot.tick <= innerBand.upperTick
        : undefined;
      const positionRangeTelemetry = currentPosition
        ? {
            lowerTick: currentPosition.tickLower,
            upperTick: currentPosition.tickUpper,
            lowerPrice: positionLowerPrice ?? tickToPrice(currentPosition.tickLower, decimalsDiff),
            upperPrice: positionUpperPrice ?? tickToPrice(currentPosition.tickUpper, decimalsDiff),
            widthTicks: currentPosition.tickUpper - currentPosition.tickLower,
          }
        : undefined;
      const targetRangeTelemetry = {
        lowerTick: targetRangeForLog.lowerTick,
        upperTick: targetRangeForLog.upperTick,
        lowerPrice: targetRangeForLog.lowerPrice,
        upperPrice: targetRangeForLog.upperPrice,
        widthTicks: targetRangeForLog.upperTick - targetRangeForLog.lowerTick,
        bandwidthBps: targetRangeForLog.bandwidthBps,
      };
      let cycleMetrics = {
        tick: poolSnapshot.tick,
        tickSpacing: poolSnapshot.tickSpacing,
        midPrice,
        volatilityPct,
        tvlUsd: poolSnapshot.activeTvlUSD,
        rebalanceThresholdPct,
        cyclesSinceRebalance,
        bandwidthBps: targetRangeTelemetry.bandwidthBps,
        inRange,
        inInnerBand,
        positionRange: positionRangeTelemetry,
        targetRange: targetRangeTelemetry,
        distanceToEdges,
        estimatedFeeValueUsd,
        maxGasSpendUsd,
      };
      logInfo('Range diagnostics', {
        iteration,
        midPrice,
        currentTick: poolSnapshot.tick,
        inRange,
        inInnerBand,
        positionRange: positionRangeTelemetry,
        targetRange: targetRangeTelemetry,
        distanceToEdges,
      });
      logInfo('Cycle metrics', { iteration, metrics: cycleMetrics }, { detailed: true });

      let txHash: string | undefined;
      let gasSpentWei: bigint | undefined;

      if (decision.kind === 'hold') {
        cyclesSinceRebalance += 1;
      } else {
        logInfo('Executing action', {
          iteration,
          action: decision.kind,
          reason: decision.reason,
        });
        if (DEBUG_MODE) {
          txHash = `0xdebug${Date.now().toString(16)}`;
        } else {
          const result = await executeDecision({
            action: decision,
            camelotClient,
            pool: poolSnapshot,
            operatorConfig,
            clients,
          });
          txHash = result?.txHash;
          gasSpentWei = result?.gasSpentWei;
        }
        cyclesSinceRebalance = 0;
        logInfo('Action execution complete', {
          iteration,
          action: decision.kind,
          txHash,
          gasSpentWei: gasSpentWei?.toString(),
        });
      }

      const gasSpentUsd =
        gasSpentWei !== undefined ? (Number(gasSpentWei) / 1_000_000_000_000_000_000) * ethUsd : undefined;
      cycleMetrics = {
        ...cycleMetrics,
        gasSpentWei: gasSpentWei?.toString(),
        gasSpentUsd,
      };

      const cycleTelemetry: RebalanceTelemetry = {
        cycle: iteration,
        poolAddress: poolSnapshot.address,
        midPrice,
        action: decision.kind,
        reason: decision.reason,
        tickLower:
          decision.kind === 'hold' ||
          decision.kind === 'exit-range' ||
        decision.kind === 'compound-fees'
            ? undefined
            : decision.targetRange.lowerTick,
        tickUpper:
          decision.kind === 'hold' ||
          decision.kind === 'exit-range' ||
          decision.kind === 'compound-fees'
            ? undefined
            : decision.targetRange.upperTick,
        txHash,
        timestamp: new Date().toISOString(),
        metrics: cycleMetrics,
      };
      telemetry.push(cycleTelemetry);

      yield {
        type: 'artifact',
        artifact: buildTelemetryArtifact(cycleTelemetry),
        append: true,
      };

      yield {
        type: 'status-update',
        message: `[Cycle ${iteration}] ${decision.kind}: ${decision.reason}${
          txHash ? ` (tx: ${txHash})` : ''
        }`,
      };

      await sleep(pollIntervalMs);
    }

    logInfo('Exiting polling loop', { totalCycles: iteration, telemetryCount: telemetry.length });
    yield {
      type: 'artifact',
      artifact: buildSummaryArtifact(telemetry),
    };

    yield {
      type: 'status-update',
      message: 'CLMM workflow completed.',
    };

    return;
  },
};

export default plugin;

function normalizeHexAddress(value: string, label: string): `0x${string}` {
  if (!value.startsWith('0x')) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value as `0x${string}`;
}

function buildPoolArtifact(pools: CamelotPool[]): Artifact {
  return {
    artifactId: 'camelot-pools',
    name: 'camelot-pools.json',
    description: 'Available Camelot pools on Arbitrum',
    parts: [
      {
        kind: 'data',
        data: {
          pools: pools.map((pool) => ({
            address: pool.address,
            token0: pool.token0.symbol,
            token1: pool.token1.symbol,
            liquidityUsd: pool.activeTvlUSD ?? 0,
            tickSpacing: pool.tickSpacing,
            feeTierBps: pool.feeTierBps ?? 0,
          })),
        },
      },
    ],
  };
}

function isPoolAllowed(pool: CamelotPool, mode: 'debug' | 'production') {
  if (mode === 'production') {
    return true;
  }
  return (
    DEFAULT_DEBUG_ALLOWED_TOKENS.has(pool.token0.address.toLowerCase()) ||
    DEFAULT_DEBUG_ALLOWED_TOKENS.has(pool.token1.address.toLowerCase())
  );
}

type LogOptions = {
  detailed?: boolean;
};

function logInfo(message: string, metadata?: Record<string, unknown>, options?: LogOptions) {
  const timestamp = new Date().toISOString();
  const prefix = `[CamelotCLMM][${timestamp}]`;
  if (metadata && Object.keys(metadata).length > 0) {
    if (options?.detailed) {
      console.info(`${prefix} ${message}`);
      // eslint-disable-next-line no-console
      console.dir(metadata, { depth: null });
      return;
    }
    console.info(`${prefix} ${message}`, metadata);
    return;
  }
  console.info(`${prefix} ${message}`);
}

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
        return lastTxHash;
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
  for (let attempt = 0; attempt < MAX_WITHDRAW_ATTEMPTS; attempt += 1) {
    try {
      const plan = await camelotClient.requestWithdrawal(withdrawPayload);
      if (plan.transactions.length === 0) {
        return { lastHash, gasSpentWei: totalGasSpentWei };
      }

      logInfo('Executing Ember withdrawal plan', {
        attempt: attempt + 1,
        transactionCount: plan.transactions.length,
      });
      for (const tx of plan.transactions) {
        const { receipt, gasSpentWei } = await executePlannedTransaction({ tx, clients });
        lastHash = receipt.transactionHash;
        if (gasSpentWei !== undefined) {
          totalGasSpentWei = (totalGasSpentWei ?? 0n) + gasSpentWei;
        }
      }

      return { lastHash, gasSpentWei: totalGasSpentWei };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logInfo('Withdrawal attempt failed', { attempt: attempt + 1, error: message });
      if (attempt + 1 >= MAX_WITHDRAW_ATTEMPTS) {
        throw new Error(
          `Camelot withdrawal failed after ${MAX_WITHDRAW_ATTEMPTS} attempts: ${message}`,
        );
      }
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

type TokenAllocation = {
  token0: bigint;
  token1: bigint;
};

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

function buildTelemetryArtifact(entry: RebalanceTelemetry): Artifact {
  return {
    artifactId: 'clmm-telemetry',
    name: 'clmm-telemetry.json',
    description: 'Per-cycle Camelot CLMM telemetry',
    parts: [
      {
        kind: 'data',
        data: entry,
      },
    ],
  };
}

function buildSummaryArtifact(telemetry: RebalanceTelemetry[]): Artifact {
  const actions: Record<string, number> = {};
  let rebalanceCount = 0;
  let firstTimestamp: Date | undefined;
  let lastTimestamp: Date | undefined;
  let volatilitySum = 0;
  let volatilityCount = 0;
  let maxVolatility = 0;
  let bandwidthSum = 0;
  let bandwidthCount = 0;
  let widthSum = 0;
  let widthCount = 0;
  let inRangeCount = 0;
  let inInnerBandCount = 0;
  let ticksFromLowerSum = 0;
  let ticksToUpperSum = 0;
  let pctFromLowerSum = 0;
  let pctToUpperSum = 0;
  let ticksDistanceCount = 0;
  let pctDistanceCount = 0;
  let minTicksToEdge: number | undefined;
  let minPctToEdge: number | undefined;
  let feeSumUsd = 0;
  let feeCount = 0;
  let gasSpentSumUsd = 0;
  let gasSpentCount = 0;
  let cyclesSinceLastRebalance = 0;
  let maxCyclesSinceRebalance = 0;
  let minTvlUsd: number | undefined;
  let maxTvlUsd: number | undefined;
  let lastTvlUsd: number | undefined;

  for (const entry of telemetry) {
    actions[entry.action] = (actions[entry.action] ?? 0) + 1;
    if (entry.action === 'enter-range' || entry.action === 'adjust-range') {
      rebalanceCount += 1;
      cyclesSinceLastRebalance = 0;
    }
    if (entry.action === 'hold') {
      cyclesSinceLastRebalance += 1;
      if (cyclesSinceLastRebalance > maxCyclesSinceRebalance) {
        maxCyclesSinceRebalance = cyclesSinceLastRebalance;
      }
    }

    const ts = new Date(entry.timestamp);
    if (!firstTimestamp || ts < firstTimestamp) {
      firstTimestamp = ts;
    }
    if (!lastTimestamp || ts > lastTimestamp) {
      lastTimestamp = ts;
    }

    const metrics = entry.metrics;
    if (!metrics) {
      continue;
    }

    if (typeof metrics.volatilityPct === 'number') {
      volatilitySum += metrics.volatilityPct;
      volatilityCount += 1;
      if (metrics.volatilityPct > maxVolatility) {
        maxVolatility = metrics.volatilityPct;
      }
    }

    if (typeof metrics.bandwidthBps === 'number') {
      bandwidthSum += metrics.bandwidthBps;
      bandwidthCount += 1;
    }

    if (metrics.targetRange) {
      widthSum += metrics.targetRange.widthTicks;
      widthCount += 1;
    }

    if (metrics.inRange) {
      inRangeCount += 1;
    }
    if (metrics.inInnerBand) {
      inInnerBandCount += 1;
    }

    if (metrics.distanceToEdges) {
      const { ticksFromLower, ticksToUpper, pctFromLower: pctLow, pctToUpper: pctUp } =
        metrics.distanceToEdges;
      ticksFromLowerSum += ticksFromLower;
      ticksToUpperSum += ticksToUpper;
      ticksDistanceCount += 1;
      const minTickEdge = Math.min(ticksFromLower, ticksToUpper);
      minTicksToEdge = minTicksToEdge === undefined ? minTickEdge : Math.min(minTicksToEdge, minTickEdge);

      if (typeof pctLow === 'number') {
        pctFromLowerSum += pctLow;
        pctDistanceCount += 1;
        minPctToEdge = minPctToEdge === undefined ? pctLow : Math.min(minPctToEdge, pctLow);
      }
      if (typeof pctUp === 'number') {
        pctToUpperSum += pctUp;
        if (pctDistanceCount === 0 && minPctToEdge === undefined) {
          minPctToEdge = pctUp;
        } else if (typeof minPctToEdge === 'number') {
          minPctToEdge = Math.min(minPctToEdge, pctUp);
        }
        pctDistanceCount += 1;
      }
    }

    if (typeof metrics.estimatedFeeValueUsd === 'number') {
      feeSumUsd += metrics.estimatedFeeValueUsd;
      feeCount += 1;
    }
    if (typeof metrics.gasSpentUsd === 'number') {
      gasSpentSumUsd += metrics.gasSpentUsd;
      gasSpentCount += 1;
    }

    if (typeof metrics.tvlUsd === 'number') {
      lastTvlUsd = metrics.tvlUsd;
      minTvlUsd = minTvlUsd === undefined ? metrics.tvlUsd : Math.min(minTvlUsd, metrics.tvlUsd);
      maxTvlUsd = maxTvlUsd === undefined ? metrics.tvlUsd : Math.max(maxTvlUsd, metrics.tvlUsd);
    }
  }

  const elapsedMs =
    firstTimestamp && lastTimestamp ? Math.max(0, lastTimestamp.getTime() - firstTimestamp.getTime()) : 0;
  const elapsedDays = elapsedMs > 0 ? elapsedMs / 86_400_000 : undefined;
  const avgRebalancesPerDay =
    elapsedDays && elapsedDays > 0 ? Number((rebalanceCount / elapsedDays).toFixed(2)) : undefined;
  const avgVolatilityPct =
    volatilityCount > 0 ? Number((volatilitySum / volatilityCount).toFixed(4)) : undefined;
  const avgBandwidthBps =
    bandwidthCount > 0 ? Number((bandwidthSum / bandwidthCount).toFixed(2)) : undefined;
  const avgWidthTicks = widthCount > 0 ? Number((widthSum / widthCount).toFixed(2)) : undefined;
  const avgTicksFromLower =
    ticksDistanceCount > 0 ? Number((ticksFromLowerSum / ticksDistanceCount).toFixed(2)) : undefined;
  const avgTicksToUpper =
    ticksDistanceCount > 0 ? Number((ticksToUpperSum / ticksDistanceCount).toFixed(2)) : undefined;
  const avgPctFromLower =
    pctDistanceCount > 0 ? Number((pctFromLowerSum / pctDistanceCount).toFixed(4)) : undefined;
  const avgPctToUpper =
    pctDistanceCount > 0 ? Number((pctToUpperSum / pctDistanceCount).toFixed(4)) : undefined;
  const timeInRangePct =
    telemetry.length > 0 ? Number(((inRangeCount / telemetry.length) * 100).toFixed(2)) : undefined;
  const timeInInnerBandPct =
    telemetry.length > 0
      ? Number(((inInnerBandCount / telemetry.length) * 100).toFixed(2))
      : undefined;
  const avgFeesUsd = feeCount > 0 ? Number((feeSumUsd / feeCount).toFixed(6)) : undefined;
  const avgGasSpentUsd =
    gasSpentCount > 0 ? Number((gasSpentSumUsd / gasSpentCount).toFixed(6)) : undefined;

  return {
    artifactId: 'clmm-summary',
    name: 'clmm-summary.json',
    description: 'Summary of Camelot CLMM workflow run',
    parts: [
      {
        kind: 'data',
        data: {
          cycles: telemetry.length,
          actionsTimeline: telemetry.map((item) => ({
            cycle: item.cycle,
            action: item.action,
            reason: item.reason,
            txHash: item.txHash,
          })),
          actionCounts: actions,
          rebalanceCount,
          rebalanceCadence: {
            currentCyclesSinceRebalance: cyclesSinceLastRebalance || undefined,
            maxCyclesSinceRebalance: maxCyclesSinceRebalance || undefined,
          },
          avgRebalancesPerDay,
          timeWindow: {
            firstTimestamp: firstTimestamp?.toISOString(),
            lastTimestamp: lastTimestamp?.toISOString(),
            elapsedMs,
          },
          priceDrift: {
            avgVolatilityPct,
            maxVolatilityPct: maxVolatility || undefined,
          },
          rangeWidths: {
            avgBandwidthBps,
            avgWidthTicks,
          },
          positioning: {
            timeInRangePct,
            timeInInnerBandPct,
            avgTicksFromLower,
            avgTicksToUpper,
            avgPctFromLower,
            avgPctToUpper,
            minTicksToEdge,
            minPctToEdge,
          },
          economics: {
            avgEstimatedFeesUsd: avgFeesUsd,
            totalEstimatedFeesUsd: feeSumUsd || undefined,
            avgGasSpentUsd,
            totalGasSpentUsd: gasSpentSumUsd || undefined,
          },
          tvl: {
            lastTvlUsd,
            minTvlUsd,
            maxTvlUsd,
          },
        },
      },
    ],
  };
}

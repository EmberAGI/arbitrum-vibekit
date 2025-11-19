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
  SAFETY_NET_MAX_IDLE_CYCLES,
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
const MAX_WITHDRAW_ATTEMPTS = 10;

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
      maxIdleCycles: SAFETY_NET_MAX_IDLE_CYCLES,
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
      logInfo('Wallet position snapshots', { iteration, positions: positionSummaries }, { detailed: true });

      const ethUsd = resolveEthUsdPrice(poolSnapshot);
      if (!ethUsd) {
        logInfo('Missing WETH/USD price for pool', { poolAddress: poolSnapshot.address });
        throw new Error(`failure: Unable to locate a WETH/USD price for pool ${poolSnapshot.address}`);
      }

      const decision = evaluateDecision({
        pool: poolSnapshot,
        position: currentPosition,
        midPrice,
        volatilityPct,
        cyclesSinceRebalance,
        tickBandwidthBps: operatorConfig.manualBandwidthBps,
        rebalanceThresholdPct: DEFAULT_REBALANCE_THRESHOLD_PCT,
        maxIdleCycles: operatorConfig.maxIdleCycles,
        autoCompoundFees: operatorConfig.autoCompoundFees,
        estimatedGasCostUsd: MAX_GAS_SPEND_ETH * ethUsd,
        estimatedFeeValueUsd: estimateFeeValueUsd(currentPosition, poolSnapshot),
      });
      logInfo('Decision evaluated', {
        iteration,
        action: decision.kind,
        reason: decision.reason,
        cyclesSinceRebalance,
        volatilityPct,
      });

      let txHash: string | undefined;

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
          txHash = await executeDecision({
            action: decision,
            camelotClient,
            pool: poolSnapshot,
            operatorConfig,
            clients,
          });
        }
        cyclesSinceRebalance = 0;
        logInfo('Action execution complete', { iteration, action: decision.kind, txHash });
      }

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
}): Promise<string | undefined> {
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

  if (action.kind === 'adjust-range' || action.kind === 'exit-range' || action.kind === 'compound-fees') {
    lastTxHash = await executeWithdrawalPlans({
      camelotClient,
      withdrawPayload,
      clients,
    });
  }

  switch (action.kind) {
    case 'enter-range':
    case 'adjust-range': {
      const allocations = estimateTokenAllocations(pool, operatorConfig.baseContributionUsd);
      const tokenBudget = await resolveTokenBudget({
        publicClient: clients.public,
        walletAddress,
        pool,
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

    if (
      tokenBudget.token0 < allocations.token0 ||
      tokenBudget.token1 < allocations.token1
    ) {
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
      tokenAddress: pool.token0.address,
      ownerAccount: walletAddress,
      spenderAddress: CAMELOT_POSITION_MANAGER_ADDRESS,
      requiredAmount: tokenBudget.token0,
      clients,
    });
    await ensureAllowance({
      publicClient: clients.public,
      tokenAddress: pool.token1.address,
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
            address: pool.token0.address,
          },
          amount: tokenBudget.token0.toString(),
        },
        {
          tokenUid: {
            chainId: chainIdString,
            address: pool.token1.address,
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
        previousTick: pool.tick,
        confirmationTick: confirmationSnapshot.tick,
        tickDelta: confirmationSnapshot.tick - pool.tick,
      });
    }

    lastTxHash = await executePlanTransactions({
      plan: rebalancePlan,
      clients,
    }) ?? lastTxHash;
    return lastTxHash;
    }
    case 'exit-range':
    case 'compound-fees':
      return lastTxHash;
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
}) {
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
  return receipt;
}

async function executeWithdrawalPlans({
  camelotClient,
  withdrawPayload,
  clients,
}: {
  camelotClient: EmberCamelotClient;
  withdrawPayload: ClmmWithdrawRequest;
  clients: ReturnType<typeof createClients>;
}) {
  let lastHash: string | undefined;
  for (let attempt = 0; attempt < MAX_WITHDRAW_ATTEMPTS; attempt += 1) {
    const plan = await camelotClient.requestWithdrawal(withdrawPayload);
    if (plan.transactions.length === 0) {
      return lastHash;
    }

    logInfo('Executing Ember withdrawal plan', {
      attempt: attempt + 1,
      transactionCount: plan.transactions.length,
    });
    for (const tx of plan.transactions) {
      const receipt = await executePlannedTransaction({ tx, clients });
      lastHash = receipt.transactionHash;
    }
  }

  throw new Error(
    `Ember withdrawal endpoint returned transactions after ${MAX_WITHDRAW_ATTEMPTS} attempts; aborting`,
  );
}

async function executePlanTransactions({
  plan,
  clients,
}: {
  plan: { transactions: TransactionInformation[] };
  clients: ReturnType<typeof createClients>;
}) {
  let lastHash: string | undefined;
  for (const tx of plan.transactions) {
    const receipt = await executePlannedTransaction({ tx, clients });
    lastHash = receipt.transactionHash;
  }
  return lastHash;
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
  return {
    artifactId: 'clmm-summary',
    name: 'clmm-summary.json',
    description: 'Summary of Camelot CLMM workflow run',
    parts: [
      {
        kind: 'data',
        data: {
          cycles: telemetry.length,
          actions: telemetry.map((item) => ({
            cycle: item.cycle,
            action: item.action,
            reason: item.reason,
            txHash: item.txHash,
          })),
        },
      },
    ],
  };
}

import {
  type WorkflowContext,
  type WorkflowPlugin,
  type WorkflowState,
  type Artifact,
} from '@emberai/agent-node/workflow';
import {
  Implementation,
  toMetaMaskSmartAccount,
  type MetaMaskSmartAccount,
} from '@metamask/delegation-toolkit';
import type { Client, PublicActions, PublicRpcSchema, Transport } from 'viem';
import { parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Chain } from 'viem/chains';

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
  ClmmWorkflowParametersSchema,
  OperatorConfigInputSchema,
  PoolSelectionInputSchema,
  type CamelotPool,
  type ClmmAction,
  type OperatorConfigInput,
  type PoolSelectionInput,
  type RebalanceTelemetry,
} from './types.js';
import { sleep } from './utils.js';

const agentPrivateKey = process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'];
if (!agentPrivateKey) {
  throw new Error('A2A_TEST_AGENT_NODE_PRIVATE_KEY environment variable is required');
}

const DEBUG_MODE = process.env['DEBUG_MODE'] === 'true';

const plugin: WorkflowPlugin = {
  id: 'camelot-clmm-rebalancer',
  name: 'Camelot CLMM Auto-Rebalancer',
  description:
    'Maintains Camelot concentrated liquidity positions by polling Ember APIs every 30 seconds and adjusting tick ranges automatically.',
  version: '1.0.0',
  inputSchema: ClmmWorkflowParametersSchema,

  async *execute(
    context: WorkflowContext,
  ): AsyncGenerator<WorkflowState, void, PoolSelectionInput | OperatorConfigInput> {
    const parameters = ClmmWorkflowParametersSchema.parse(context.parameters ?? {});
    const mode =
      parameters.mode ?? (process.env['CLMM_MODE'] === 'production' ? 'production' : 'debug');
    const pollIntervalMs = resolvePollIntervalMs();
    const streamLimit = resolveStreamLimit();
    const ethUsd = resolveEthUsdPrice();

    const camelotClient = new EmberCamelotClient(EMBER_API_BASE_URL);

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
    if (filteredPools.length === 0) {
      throw new Error(`No Camelot pools available for mode=${mode}`);
    }

    const poolsArtifact = buildPoolArtifact(filteredPools.slice(0, 8));
    yield { type: 'artifact', artifact: poolsArtifact };

    let selectedPoolAddress =
      parameters.poolAddress ?? (filteredPools.length === 1 ? filteredPools[0].address : undefined);
    if (!selectedPoolAddress) {
      const poolSelection = (yield {
        type: 'interrupted',
        reason: 'input-required',
        message: 'Select a Camelot pool to manage',
        inputSchema: PoolSelectionInputSchema,
        artifact: poolsArtifact,
      }) as PoolSelectionInput;
      selectedPoolAddress = poolSelection.poolAddress;
    }

    const selectedPool =
      filteredPools.find(
        (pool) => pool.address.toLowerCase() === selectedPoolAddress.toLowerCase(),
      ) ??
      (await fetchPoolSnapshot(
        camelotClient,
        selectedPoolAddress as `0x${string}`,
        ARBITRUM_CHAIN_ID,
      ));

    if (!selectedPool) {
      throw new Error(`Pool ${selectedPoolAddress} not available from Ember API`);
    }

    const operatorInput = (yield {
      type: 'interrupted',
      reason: 'input-required',
      message: 'Confirm wallet, allocation, and safety toggles for this CLMM workflow.',
      inputSchema: OperatorConfigInputSchema,
    }) as OperatorConfigInput;

    const account = privateKeyToAccount(agentPrivateKey as `0x${string}`);
    const clients = createClients();
    const agentsWallet = await toMetaMaskSmartAccount({
      client: clients.public as Client<
        Transport,
        Chain | undefined,
        undefined,
        PublicRpcSchema,
        PublicActions<Transport, Chain | undefined>
      >,
      implementation: Implementation.Hybrid,
      deployParams: [account.address, [], [], []],
      deploySalt: '0x',
      signer: { account },
    });

    const operatorConfig: OperatorConfigInput = {
      ...operatorInput,
      walletAddress: agentsWallet.address, // Using the agent's embedded smart account for all transactions.
      baseContributionUsd:
        operatorInput.baseContributionUsd ?? parameters.targetNotionalUsd ?? 5_000,
      maxIdleCycles:
        operatorInput.maxIdleCycles ?? parameters.maxIdleCycles ?? SAFETY_NET_MAX_IDLE_CYCLES,
      manualBandwidthBps:
        operatorInput.manualBandwidthBps ??
        parameters.tickBandwidthBps ??
        DEFAULT_TICK_BANDWIDTH_BPS,
    };

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

    while (streamLimit < 0 || iteration < streamLimit) {
      iteration += 1;
      let poolSnapshot: CamelotPool | undefined;
      try {
        poolSnapshot =
          (await fetchPoolSnapshot(camelotClient, selectedPool.address, ARBITRUM_CHAIN_ID)) ??
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

      const decision = evaluateDecision({
        pool: poolSnapshot,
        position: currentPosition,
        midPrice,
        volatilityPct,
        cyclesSinceRebalance,
        tickBandwidthBps: operatorConfig.manualBandwidthBps ?? DEFAULT_TICK_BANDWIDTH_BPS,
        rebalanceThresholdPct: parameters.rebalanceThresholdPct ?? DEFAULT_REBALANCE_THRESHOLD_PCT,
        maxIdleCycles: operatorConfig.maxIdleCycles ?? SAFETY_NET_MAX_IDLE_CYCLES,
        autoCompoundFees: operatorConfig.autoCompoundFees,
        estimatedGasCostUsd: MAX_GAS_SPEND_ETH * ethUsd,
        estimatedFeeValueUsd: estimateFeeValueUsd(currentPosition, poolSnapshot),
      });

      let txHash: string | undefined;

      if (decision.kind === 'hold') {
        cyclesSinceRebalance += 1;
      } else {
        if (DEBUG_MODE) {
          txHash = `0xdebug${Date.now().toString(16)}`;
        } else {
          txHash = await executeDecision({
            action: decision,
            camelotClient,
            pool: poolSnapshot,
            operatorConfig,
            agentsWallet,
            clients,
          });
        }
        cyclesSinceRebalance = 0;
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

async function executeDecision({
  action,
  camelotClient,
  pool,
  operatorConfig,
  agentsWallet,
  clients,
}: {
  action: ClmmAction;
  camelotClient: EmberCamelotClient;
  pool: CamelotPool;
  operatorConfig: OperatorConfigInput;
  agentsWallet: MetaMaskSmartAccount;
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

  let response: Awaited<ReturnType<EmberCamelotClient['requestRebalance']>>;

  if (action.kind === 'enter-range' || action.kind === 'adjust-range') {
    const allocations = estimateTokenAllocations(pool, operatorConfig.baseContributionUsd);
    await ensureAllowance({
      publicClient: clients.public,
      tokenAddress: pool.token0.address,
      ownerAccount: walletAddress,
      spenderAddress: CAMELOT_POSITION_MANAGER_ADDRESS,
      requiredAmount: allocations.token0,
      agentAccount: agentsWallet,
      clients,
    });
    await ensureAllowance({
      publicClient: clients.public,
      tokenAddress: pool.token1.address,
      ownerAccount: walletAddress,
      spenderAddress: CAMELOT_POSITION_MANAGER_ADDRESS,
      requiredAmount: allocations.token1,
      agentAccount: agentsWallet,
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
          amount: allocations.token0.toString(),
        },
        {
          tokenUid: {
            chainId: chainIdString,
            address: pool.token1.address,
          },
          amount: allocations.token1.toString(),
        },
      ],
    };

    response = await camelotClient.requestRebalance(rebalancePayload);
  } else if (action.kind === 'exit-range' || action.kind === 'compound-fees') {
    const withdrawPayload: ClmmWithdrawRequest = {
      walletAddress,
      poolTokenUid: poolIdentifier,
    };
    response = await camelotClient.requestWithdrawal(withdrawPayload);
  } else {
    assertUnreachable(action);
  }

  let lastTxHash: string | undefined;
  for (const tx of response.transactions) {
    const receipt = await executePlannedTransaction({
      tx,
      agentsWallet,
      clients,
    });
    lastTxHash = receipt.transactionHash;
  }

  return lastTxHash;
}

async function executePlannedTransaction({
  tx,
  agentsWallet,
  clients,
}: {
  tx: TransactionInformation;
  agentsWallet: MetaMaskSmartAccount;
  clients: ReturnType<typeof createClients>;
}) {
  const callValue = parseTransactionValue(tx.value);

  return executeTransaction(clients, {
    account: agentsWallet,
    calls: [
      {
        to: tx.to,
        data: tx.data,
        ...(callValue > 0n ? { value: callValue } : {}),
      },
    ],
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

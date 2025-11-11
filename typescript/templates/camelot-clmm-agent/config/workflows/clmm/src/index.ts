import {
  z,
  type WorkflowContext,
  type WorkflowPlugin,
  type WorkflowState,
  type Artifact,
} from '@emberai/agent-node/workflow';
import {
  createDelegation,
  Implementation,
  toMetaMaskSmartAccount,
  createExecution,
  ExecutionMode,
  type Delegation,
  type MetaMaskSmartAccount,
} from '@metamask/delegation-toolkit';
import type { Client, PublicActions, PublicRpcSchema, Transport } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Chain } from 'viem/chains';

import {
  ARBITRUM_CHAIN_ID,
  CAMELOT_POSITION_MANAGER_ADDRESS,
  DEFAULT_DEBUG_ALLOWED_TOKENS,
  DEFAULT_REBALANCE_THRESHOLD_PCT,
  DEFAULT_TICK_BANDWIDTH_BPS,
  DATA_STALE_CYCLE_LIMIT,
  EMBER_API_BASE_URL,
  MAX_GAS_SPEND_ETH,
  MAX_SLIPPAGE_BPS,
  SAFETY_NET_MAX_IDLE_CYCLES,
  resolveEthUsdPrice,
  resolvePollIntervalMs,
  resolveStreamLimit,
} from './constants.js';
import { createClients } from './clients.js';
import { EmberCamelotClient, fetchPoolSnapshot, type TransactionInformation } from './emberApi.js';
import {
  ClmmWorkflowParametersSchema,
  OperatorConfigInputSchema,
  PoolSelectionInputSchema,
  type CamelotPool,
  type ClmmAction,
  type ClmmWorkflowParameters,
  type OperatorConfigInput,
  type PoolSelectionInput,
  type PositionSnapshot,
  type RebalanceTelemetry,
} from './types.js';
import { sleep } from './utils.js';
import {
  computeVolatilityPct,
  deriveMidPrice,
  evaluateDecision,
  estimateFeeValueUsd,
  normalizePosition,
} from './decision-engine.js';
import { ensureAllowance } from './allowances.js';
import { executeTransaction } from './transaction.js';
import { DelegationManager } from '@metamask/delegation-toolkit/contracts';
import { parseUnits } from 'viem';

type SignedDelegation = Delegation & { signature: `0x${string}` };

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
      parameters.poolAddress ??
      (filteredPools.length === 1 ? filteredPools[0]!.address : undefined);
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
        (pool) => pool.address.toLowerCase() === selectedPoolAddress!.toLowerCase(),
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

    const operatorConfig: OperatorConfigInput = {
      ...operatorInput,
      baseContributionUsd:
        operatorInput.baseContributionUsd ?? parameters.targetNotionalUsd ?? 5_000,
      maxIdleCycles:
        operatorInput.maxIdleCycles ?? parameters.maxIdleCycles ?? SAFETY_NET_MAX_IDLE_CYCLES,
      manualBandwidthBps:
        operatorInput.manualBandwidthBps ??
        parameters.tickBandwidthBps ??
        DEFAULT_TICK_BANDWIDTH_BPS,
    };

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

    const delegations = createClmmDelegations({
      walletAddress: operatorConfig.walletAddress,
      agentSmartAccount: agentsWallet.address,
      token0: selectedPool.token0.address as `0x${string}`,
      token1: selectedPool.token1.address as `0x${string}`,
      environment: String(agentsWallet.environment),
    });

    const delegationArtifact = buildDelegationArtifact(delegations);
    yield { type: 'artifact', artifact: delegationArtifact };

    const signedDelegationsInput = (yield {
      type: 'interrupted',
      reason: 'input-required',
      message: 'Sign and return each delegation to authorize the workflow.',
      inputSchema: z.object({
        delegations: z.array(
          z.object({
            id: z.enum(['approveToken0', 'approveToken1', 'manageCamelot']),
            signedDelegation: z.templateLiteral(['0x', z.string()]),
          }),
        ),
      }),
      artifact: delegationArtifact,
    }) as unknown as { delegations: Array<{ id: keyof typeof delegations; signedDelegation: `0x${string}` }> };

    const signedDelegations = Object.fromEntries(
      signedDelegationsInput.delegations.map((entry) => [
        entry.id,
        {
          ...delegations[entry.id],
          signature: entry.signedDelegation,
        } satisfies SignedDelegation,
      ]),
    ) as Record<keyof typeof delegations, SignedDelegation>;

    yield {
      type: 'status-update',
      message: 'Delegations received. Starting live polling loop.',
    };

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
          (await fetchPoolSnapshot(
            camelotClient,
            selectedPool.address as `0x${string}`,
            ARBITRUM_CHAIN_ID,
          )) ?? lastSnapshot;
        staleCycles = 0;
      } catch (error) {
        staleCycles += 1;
        if (staleCycles > DATA_STALE_CYCLE_LIMIT) {
          yield {
            type: 'status-update',
            message: `ERROR: Abort: Ember API unreachable for ${staleCycles} consecutive cycles`,
          };
          break;
        }
        poolSnapshot = lastSnapshot;
        yield {
          type: 'status-update',
          message: `WARNING: Using cached pool state (attempt ${staleCycles}/${DATA_STALE_CYCLE_LIMIT})`,
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
        operatorConfig.walletAddress as `0x${string}`,
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
            signedDelegations,
            agentsWallet,
            clients,
          });
        }
        cyclesSinceRebalance = 0;
      }

      const cycleTelemetry: RebalanceTelemetry = {
        cycle: iteration,
        poolAddress: poolSnapshot.address as `0x${string}`,
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

function buildDelegationArtifact(delegations: ReturnType<typeof createClmmDelegations>): Artifact {
  return {
    artifactId: 'clmm-delegations',
    name: 'clmm-delegations.json',
    description: 'Delegations required for Camelot CLMM management',
    parts: [
      {
        kind: 'data',
        data: {
          delegations: Object.entries(delegations).map(([id, delegation]) => ({
            id,
            description: describeDelegation(id),
            delegation: JSON.stringify(delegation),
          })),
        },
      },
    ],
  };
}

function describeDelegation(id: string) {
  switch (id) {
    case 'approveToken0':
      return 'Allows the agent to approve token0 for Camelot LP actions.';
    case 'approveToken1':
      return 'Allows the agent to approve token1 for Camelot LP actions.';
    case 'manageCamelot':
      return 'Allows the agent to call Camelot position manager (mint/burn/collect).';
    default:
      return 'Delegation';
  }
}

function createClmmDelegations(args: {
  walletAddress: `0x${string}`;
  agentSmartAccount: `0x${string}`;
  token0: `0x${string}`;
  token1: `0x${string}`;
  environment: string;
}) {
  const approveSelectors = ['approve(address, uint256)'];
  return {
    approveToken0: createDelegation({
      scope: {
        type: 'functionCall' as const,
        targets: [args.token0],
        selectors: approveSelectors,
      },
      to: args.agentSmartAccount,
      from: args.walletAddress,
      environment: args.environment as unknown,
    } as Parameters<typeof createDelegation>[0]),
    approveToken1: createDelegation({
      scope: {
        type: 'functionCall' as const,
        targets: [args.token1],
        selectors: approveSelectors,
      },
      to: args.agentSmartAccount,
      from: args.walletAddress,
      environment: args.environment as unknown,
    } as Parameters<typeof createDelegation>[0]),
    manageCamelot: createDelegation({
      scope: {
        type: 'functionCall' as const,
        targets: [CAMELOT_POSITION_MANAGER_ADDRESS],
        selectors: [
          'mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))',
          'increaseLiquidity((uint256,uint256,uint256,uint256,uint256,uint256))',
          'decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))',
          'collect((uint256,address,uint128,uint128))',
          'burn(uint256)',
          'multicall(bytes[])',
        ],
      },
      to: args.agentSmartAccount,
      from: args.walletAddress,
      environment: args.environment as unknown,
    } as Parameters<typeof createDelegation>[0]),
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
  signedDelegations,
  agentsWallet,
  clients,
}: {
  action: ClmmAction;
  camelotClient: EmberCamelotClient;
  pool: CamelotPool;
  operatorConfig: OperatorConfigInput;
  signedDelegations: Record<'approveToken0' | 'approveToken1' | 'manageCamelot', SignedDelegation>;
  agentsWallet: MetaMaskSmartAccount;
  clients: ReturnType<typeof createClients>;
}): Promise<string | undefined> {
  const walletAddress = operatorConfig.walletAddress as `0x${string}`;
  if (action.kind === 'hold') {
    throw new Error('executeDecision invoked with hold action');
  }

  if (action.kind === 'enter-range' || action.kind === 'adjust-range') {
    const allocations = estimateTokenAllocations(pool, operatorConfig.baseContributionUsd);
    await ensureAllowance({
      publicClient: clients.public,
      tokenAddress: pool.token0.address as `0x${string}`,
      ownerAccount: walletAddress,
      spenderAddress: CAMELOT_POSITION_MANAGER_ADDRESS,
      requiredAmount: allocations.token0,
      delegation: signedDelegations.approveToken0,
      agentAccount: agentsWallet,
      clients,
    });
    await ensureAllowance({
      publicClient: clients.public,
      tokenAddress: pool.token1.address as `0x${string}`,
      ownerAccount: walletAddress,
      spenderAddress: CAMELOT_POSITION_MANAGER_ADDRESS,
      requiredAmount: allocations.token1,
      delegation: signedDelegations.approveToken1,
      agentAccount: agentsWallet,
      clients,
    });
  }

  const rebalancePayload = {
    walletAddress,
    poolAddress: pool.address as `0x${string}`,
    chainId: ARBITRUM_CHAIN_ID.toString(),
    action: mapActionKind(action.kind),
    range:
      action.kind === 'exit-range' || action.kind === 'compound-fees'
        ? undefined
        : {
            minPrice: action.targetRange.lowerPrice.toString(),
            maxPrice: action.targetRange.upperPrice.toString(),
          },
    maxSlippageBps: MAX_SLIPPAGE_BPS,
    maxGasEth: MAX_GAS_SPEND_ETH,
    autoCompound: operatorConfig.autoCompoundFees,
    baseContributionUsd: operatorConfig.baseContributionUsd,
  };

  const response = await camelotClient.requestRebalance(rebalancePayload);
  let lastTxHash: string | undefined;
  for (const tx of response.transactions) {
    const receipt = await executePlannedTransaction({
      tx,
      delegation: signedDelegations.manageCamelot,
      agentsWallet,
      clients,
    });
    lastTxHash = receipt.transactionHash;
  }

  return lastTxHash;
}

function mapActionKind(kind: ClmmAction['kind']): 'enter' | 'adjust' | 'exit' | 'compound' {
  switch (kind) {
    case 'enter-range':
      return 'enter';
    case 'adjust-range':
      return 'adjust';
    case 'exit-range':
      return 'exit';
    case 'compound-fees':
      return 'compound';
    case 'hold':
      throw new Error('Cannot map hold action to rebalance request');
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unexpected action kind: ${_exhaustive}`);
    }
  }
}

async function executePlannedTransaction({
  tx,
  delegation,
  agentsWallet,
  clients,
}: {
  tx: TransactionInformation;
  delegation: SignedDelegation;
  agentsWallet: MetaMaskSmartAccount;
  clients: ReturnType<typeof createClients>;
}) {
  const execution = createExecution({
    target: tx.to,
    callData: tx.data,
  });

  const redeemData = DelegationManager.encode.redeemDelegations({
    delegations: [[delegation]],
    modes: [ExecutionMode.SingleDefault],
    executions: [[execution]],
  });

  return executeTransaction(clients, {
    account: agentsWallet,
    calls: [
      {
        to: agentsWallet.address,
        data: redeemData,
      },
    ],
  });
}

function estimateTokenAllocations(pool: CamelotPool, baseContributionUsd: number) {
  const half = baseContributionUsd / 2;
  const token0Price = pool.token0.usdPrice ?? pool.token1.usdPrice ?? 0;
  const token1Price =
    pool.token1.usdPrice ??
    (pool.token0.usdPrice && pool.token0.usdPrice > 0
      ? pool.token0.usdPrice / deriveMidPrice(pool)
      : 0);

  if (token0Price <= 0 || token1Price <= 0) {
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

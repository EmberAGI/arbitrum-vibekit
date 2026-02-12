import { erc20Abi, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { beforeAll, describe, expect, it } from 'vitest';

import { CAMELOT_PROTOCOL_ID } from '../src/accounting/camelotAdapter.js';
import { createCamelotNavSnapshot } from '../src/accounting/snapshot.js';
import { applyAccountingUpdate, createFlowEvent } from '../src/accounting/state.js';
import type { FlowLogEvent } from '../src/accounting/types.js';
import { createClients } from '../src/clients/clients.js';
import { EmberCamelotClient } from '../src/clients/emberApi.js';
import { ARBITRUM_CHAIN_ID, DEFAULT_TICK_BANDWIDTH_BPS } from '../src/config/constants.js';
import { buildRange, deriveMidPrice } from '../src/core/decision-engine.js';
import type { CamelotPool, ClmmAction } from '../src/domain/types.js';
import { executeDecision } from '../src/workflow/execution.js';
import { estimateTokenAllocationsUsd } from '../src/workflow/planning/allocations.js';

const BASE_URL = process.env['EMBER_API_BASE_URL']?.replace(/\/$/, '') ?? 'https://api.emberai.xyz';
const LIVE_TEST_TIMEOUT_MS = Number(process.env['EMBER_E2E_TIMEOUT_MS'] ?? 180_000);
const E2E_PRIVATE_KEY_ENV = 'CLMM_E2E_PRIVATE_KEY';
const ALLOCATION_USD_ENV = 'CLMM_E2E_ALLOCATION_USD';
const MIN_AVAILABLE_USD = 1;

const client = new EmberCamelotClient(BASE_URL);

function normalizeHexAddress(value: string, label: string): `0x${string}` {
  const trimmed = value.trim();
  if (!trimmed.startsWith('0x')) {
    throw new Error(`${label} must start with 0x`);
  }
  const normalized = trimmed.toLowerCase();
  return normalized as `0x${string}`;
}

function requirePrivateKey(): `0x${string}` {
  const raw = process.env[E2E_PRIVATE_KEY_ENV];
  if (!raw || raw === 'replace-with-private-key') {
    throw new Error(
      `${E2E_PRIVATE_KEY_ENV} is required to run live accounting e2e tests (set a real Arbitrum key).`,
    );
  }
  const trimmed = raw.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new Error(`${E2E_PRIVATE_KEY_ENV} must be a 32-byte hex string (0x + 64 hex chars).`);
  }
  return trimmed.toLowerCase() as `0x${string}`;
}

async function resolvePoolSnapshot(params: {
  pools: CamelotPool[];
  poolAddress: `0x${string}`;
}): Promise<CamelotPool> {
  const normalized = params.poolAddress.toLowerCase();
  const direct = params.pools.find((pool) => pool.address.toLowerCase() === normalized);
  if (direct) {
    return direct;
  }
  const fallback = await client.listCamelotPools(ARBITRUM_CHAIN_ID);
  const resolved = fallback.find((pool) => pool.address.toLowerCase() === normalized);
  if (!resolved) {
    throw new Error(`Unable to resolve Camelot pool ${params.poolAddress} from Ember API.`);
  }
  return resolved;
}

function resolvePoolTokenUsdPrices(pool: CamelotPool): { token0: number; token1: number } {
  const midPrice = deriveMidPrice(pool);
  const token0Price =
    pool.token0.usdPrice ??
    (pool.token1.usdPrice && midPrice > 0 ? pool.token1.usdPrice * midPrice : undefined);
  const token1Price =
    pool.token1.usdPrice ??
    (pool.token0.usdPrice && midPrice > 0 ? pool.token0.usdPrice / midPrice : undefined);

  if (!token0Price || !token1Price || token0Price <= 0 || token1Price <= 0) {
    throw new Error('Pool token USD prices unavailable for allocation sizing.');
  }

  return { token0: token0Price, token1: token1Price };
}

type PoolFundingSnapshot = {
  pool: CamelotPool;
  token0Balance: bigint;
  token1Balance: bigint;
  token0Usd: number;
  token1Usd: number;
  availableUsd: number;
  allocationUsd: number;
  baseContributionUsd: number;
  usdPrices: { token0: number; token1: number };
};

async function evaluatePoolFunding(params: {
  pool: CamelotPool;
  walletAddress: `0x${string}`;
  clients: ReturnType<typeof createClients>;
  allocationUsd?: number;
}): Promise<PoolFundingSnapshot | null> {
  const [token0Balance, token1Balance] = await Promise.all([
    params.clients.public.readContract({
      address: params.pool.token0.address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [params.walletAddress],
    }),
    params.clients.public.readContract({
      address: params.pool.token1.address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [params.walletAddress],
    }),
  ]);

  const usdPrices = resolvePoolTokenUsdPrices(params.pool);
  const token0Amount = Number(formatUnits(token0Balance, params.pool.token0.decimals));
  const token1Amount = Number(formatUnits(token1Balance, params.pool.token1.decimals));
  const token0Usd = token0Amount * usdPrices.token0;
  const token1Usd = token1Amount * usdPrices.token1;
  const availableUsd = token0Usd + token1Usd;
  if (!Number.isFinite(availableUsd) || availableUsd < MIN_AVAILABLE_USD) {
    return null;
  }
  const allocationUsd = params.allocationUsd ?? availableUsd;
  if (allocationUsd > availableUsd) {
    return null;
  }
  const baseContributionUsd = Number((allocationUsd / 2).toFixed(6));
  const decimalsDiff = params.pool.token0.decimals - params.pool.token1.decimals;
  const targetRange = buildRange(
    deriveMidPrice(params.pool),
    DEFAULT_TICK_BANDWIDTH_BPS,
    params.pool.tickSpacing ?? 10,
    decimalsDiff,
  );
  const desiredAllocation = estimateTokenAllocationsUsd(
    params.pool,
    baseContributionUsd,
    targetRange,
  );
  if (token0Balance < desiredAllocation.token0 || token1Balance < desiredAllocation.token1) {
    return null;
  }

  return {
    pool: params.pool,
    token0Balance,
    token1Balance,
    token0Usd,
    token1Usd,
    availableUsd,
    allocationUsd,
    baseContributionUsd,
    usdPrices,
  };
}

async function exitAllPositions(params: {
  walletAddress: `0x${string}`;
  pools: CamelotPool[];
  baseContributionUsd: number;
  clients: ReturnType<typeof createClients>;
}) {
  const positions = await client.getWalletPositions(params.walletAddress, ARBITRUM_CHAIN_ID);
  const poolAddresses = Array.from(
    new Set(positions.map((position) => position.poolAddress.toLowerCase())),
  );
  if (poolAddresses.length === 0) {
    return;
  }

  for (const poolAddress of poolAddresses) {
    const pool = await resolvePoolSnapshot({
      pools: params.pools,
      poolAddress: poolAddress as `0x${string}`,
    });
    const action: ClmmAction = {
      kind: 'exit-range',
      reason: 'e2e cleanup - exit before accounting scenario',
    };

    // When we execute the exit-range decision to clear the wallet
    await executeDecision({
      action,
      camelotClient: client,
      pool,
      operatorConfig: {
        walletAddress: params.walletAddress,
        baseContributionUsd: params.baseContributionUsd,
        autoCompoundFees: false,
        manualBandwidthBps: DEFAULT_TICK_BANDWIDTH_BPS,
      },
      delegationsBypassActive: true,
      clients: params.clients,
    });
  }

  // Then the wallet should report no active positions after exit
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const remaining = await client.getWalletPositions(params.walletAddress, ARBITRUM_CHAIN_ID);
    if (remaining.length === 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error('Wallet still has active positions after cleanup attempts.');
}

async function waitForPositionsToClear(walletAddress: `0x${string}`) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const remaining = await client.getWalletPositions(walletAddress, ARBITRUM_CHAIN_ID);
    if (remaining.length === 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error('Wallet still has active positions after exit-range.');
}

describe('Accounting (e2e)', () => {
  let walletAddress: `0x${string}`;
  let clients: ReturnType<typeof createClients>;
  let initialAllocationUsd = 0;
  let baseContributionUsd = 0;
  let targetPool: CamelotPool;
  let initialTokenUsd = { token0: 0, token1: 0 };
  let poolTokenUsdPrices = { token0: 0, token1: 0 };

  beforeAll(async () => {
    // Given a live Arbitrum wallet (private key required)
    const privateKey = requirePrivateKey();
    const account = privateKeyToAccount(privateKey);
    walletAddress = account.address.toLowerCase() as `0x${string}`;
    const configuredWallet = process.env['CLMM_E2E_LIVE_WALLET'];
    if (configuredWallet) {
      const normalized = normalizeHexAddress(configuredWallet, 'CLMM_E2E_LIVE_WALLET');
      if (normalized !== walletAddress) {
        throw new Error(
          `CLMM_E2E_LIVE_WALLET (${normalized}) does not match ${E2E_PRIVATE_KEY_ENV} wallet (${walletAddress}).`,
        );
      }
    }

    clients = createClients(account);
    const pools = await client.listCamelotPools(ARBITRUM_CHAIN_ID);
    if (pools.length === 0) {
      throw new Error('Ember returned no Camelot pools; cannot run accounting e2e.');
    }

    // Before tests run, exit any existing LP positions to start from a fresh state.
    await exitAllPositions({
      walletAddress,
      pools,
      baseContributionUsd: 0,
      clients,
    });

    const nativeBalance = await clients.public.getBalance({ address: walletAddress });
    const configuredPool = process.env['CLMM_E2E_POOL_ADDRESS'];
    const allocationOverride = process.env[ALLOCATION_USD_ENV];
    const requestedAllocationUsd = allocationOverride
      ? Number(allocationOverride)
      : undefined;
    if (requestedAllocationUsd !== undefined) {
      if (!Number.isFinite(requestedAllocationUsd) || requestedAllocationUsd <= 0) {
        throw new Error(
          `${ALLOCATION_USD_ENV} must be a positive number when provided (got ${allocationOverride}).`,
        );
      }
    }
    let fundingSnapshot: PoolFundingSnapshot | null = null;
    if (configuredPool) {
      const resolved = await resolvePoolSnapshot({
        pools,
        poolAddress: normalizeHexAddress(configuredPool, 'target pool address'),
      });
      fundingSnapshot = await evaluatePoolFunding({
        pool: resolved,
        walletAddress,
        clients,
        allocationUsd: requestedAllocationUsd,
      });
      if (!fundingSnapshot) {
        throw new Error(
          `Configured pool ${resolved.token0.symbol}/${resolved.token1.symbol} lacks ` +
            `sufficient wallet balances to fund allocation without swaps.`,
        );
      }
    } else {
      const scanLimit = Number(process.env['CLMM_E2E_POOL_SCAN_LIMIT'] ?? 20);
      for (const pool of pools.slice(0, scanLimit)) {
        const snapshot = await evaluatePoolFunding({
          pool,
          walletAddress,
          clients,
          allocationUsd: requestedAllocationUsd,
        });
        if (snapshot) {
          fundingSnapshot = snapshot;
          break;
        }
      }
      if (!fundingSnapshot) {
        throw new Error(
          'No Camelot pool found with sufficient token balances to fund allocation.',
        );
      }
    }

    targetPool = fundingSnapshot.pool;
    poolTokenUsdPrices = fundingSnapshot.usdPrices;
    initialAllocationUsd = Number(fundingSnapshot.allocationUsd.toFixed(6));
    baseContributionUsd = fundingSnapshot.baseContributionUsd;
    const allocationRatio = fundingSnapshot.availableUsd
      ? initialAllocationUsd / fundingSnapshot.availableUsd
      : 0;
    initialTokenUsd = {
      token0: Number((fundingSnapshot.token0Usd * allocationRatio).toFixed(6)),
      token1: Number((fundingSnapshot.token1Usd * allocationRatio).toFixed(6)),
    };

    const nativeBalanceEth = Number(formatUnits(nativeBalance, 18));
    if (!Number.isFinite(nativeBalanceEth) || nativeBalanceEth <= 0.0005) {
      throw new Error(
        `Wallet ${walletAddress} has insufficient ETH for gas (balance=${nativeBalanceEth}).`,
      );
    }
  });

  it(
    'tracks reserved vs allocated assets across enter/exit',
    async () => {
      // Given a fresh wallet, a hire event, and a target pool
      const hireTimestamp = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const contextId = `ctx-e2e-${Date.now()}`;
      const hireEvent = createFlowEvent({
        id: 'flow-hire-1',
        type: 'hire',
        timestamp: hireTimestamp,
        contextId,
        chainId: ARBITRUM_CHAIN_ID,
        protocolId: CAMELOT_PROTOCOL_ID,
        usdValue: initialAllocationUsd,
      });
      const totalInitialUsd = Number(
        (initialTokenUsd.token0 + initialTokenUsd.token1).toFixed(6),
      );
      expect(totalInitialUsd).toBeCloseTo(initialAllocationUsd, 6);

      const decimalsDiff = targetPool.token0.decimals - targetPool.token1.decimals;
      const targetRange = buildRange(
        deriveMidPrice(targetPool),
        DEFAULT_TICK_BANDWIDTH_BPS,
        targetPool.tickSpacing ?? 10,
        decimalsDiff,
      );
      const enterAction: ClmmAction = {
        kind: 'enter-range',
        reason: 'e2e enter to validate accounting allocation',
        targetRange,
      };

      // When we enter a position using only half of the available allocation
      const enterOutcome = await executeDecision({
        action: enterAction,
        camelotClient: client,
        pool: targetPool,
        operatorConfig: {
          walletAddress,
          baseContributionUsd,
          autoCompoundFees: false,
          manualBandwidthBps: DEFAULT_TICK_BANDWIDTH_BPS,
        },
        delegationsBypassActive: true,
        clients,
      });
      if (enterOutcome.flowEvents?.some((event) => event.type === 'swap')) {
        throw new Error('Expected no swaps when wallet already holds pool tokens.');
      }

      const supplyEvents = (enterOutcome.flowEvents ?? []).map((event) =>
        createFlowEvent({ ...event, contextId }),
      );
      const flowLog: FlowLogEvent[] = [hireEvent, ...supplyEvents];

      const snapshot = await createCamelotNavSnapshot({
        contextId,
        trigger: 'cycle',
        walletAddress,
        chainId: ARBITRUM_CHAIN_ID,
        camelotClient: client,
        flowLog,
      });

      // Then the snapshot should include the managed position valuation
      expect(snapshot.contextId).toBe(contextId);
      expect(snapshot.protocolId).toBe(CAMELOT_PROTOCOL_ID);
      expect(snapshot.walletAddress).toBe(walletAddress);
      expect(snapshot.positions.length).toBeGreaterThan(0);
      expect(snapshot.positions[0]?.poolAddress?.toLowerCase()).toBe(
        targetPool.address.toLowerCase(),
      );
      expect(snapshot.totalUsd).toBeGreaterThanOrEqual(0);

      // And accounting metrics should reflect reserved vs allocated assets
      const accounting = applyAccountingUpdate({
        existing: undefined,
        flowEvents: flowLog,
        snapshots: [snapshot],
        now: new Date().toISOString(),
      });
      expect(accounting.initialAllocationUsd).toBeCloseTo(initialAllocationUsd, 6);
      expect(accounting.positionsUsd).toBe(snapshot.totalUsd);
      expect(accounting.aumUsd).toBeGreaterThanOrEqual(snapshot.totalUsd);
      expect(accounting.highWaterMarkUsd).toBe(accounting.aumUsd);
      if (accounting.aumUsd !== undefined) {
        expect(accounting.lifetimePnlUsd).toBeCloseTo(
          accounting.aumUsd - initialAllocationUsd,
          6,
        );
        expect(accounting.lifetimeReturnPct).toBeCloseTo(
          (accounting.aumUsd / initialAllocationUsd) - 1,
          6,
        );
      }

      const allocationRatio = accounting.positionsUsd / initialAllocationUsd;
      if (allocationRatio <= 0.35 || allocationRatio >= 0.65) {
        throw new Error(
          `Expected ~50% allocation, got ${(allocationRatio * 100).toFixed(2)}%`,
        );
      }
      const cashDelta = Math.abs(
        (accounting.cashUsd ?? 0) - (initialAllocationUsd - accounting.positionsUsd),
      );
      expect(cashDelta).toBeLessThanOrEqual(1);

      const supplyUsdTotal = supplyEvents.reduce((total, event) => {
        if (event.type !== 'supply' || !event.tokenAddress || !event.amountBaseUnits) {
          return total;
        }
        const normalized = event.tokenAddress.toLowerCase();
        const usdPrice =
          normalized === targetPool.token0.address.toLowerCase()
            ? poolTokenUsdPrices.token0
            : normalized === targetPool.token1.address.toLowerCase()
              ? poolTokenUsdPrices.token1
              : undefined;
        if (!usdPrice) {
          return total;
        }
        const decimals =
          normalized === targetPool.token0.address.toLowerCase()
            ? targetPool.token0.decimals
            : targetPool.token1.decimals;
        const amount = Number(formatUnits(BigInt(event.amountBaseUnits), decimals));
        return total + amount * usdPrice;
      }, 0);
      const supplyRatio = supplyUsdTotal / baseContributionUsd;
      if (supplyRatio <= 0.9 || supplyRatio >= 1.1) {
        throw new Error(
          `Expected supply total near ${baseContributionUsd.toFixed(2)} USD, got ${supplyUsdTotal.toFixed(2)} USD.`,
        );
      }

      // When we exit the position and create a fresh NAV snapshot
      const exitAction: ClmmAction = {
        kind: 'exit-range',
        reason: 'e2e exit to validate accounting unwind',
      };
      const exitOutcome = await executeDecision({
        action: exitAction,
        camelotClient: client,
        pool: targetPool,
        operatorConfig: {
          walletAddress,
          baseContributionUsd,
          autoCompoundFees: false,
          manualBandwidthBps: DEFAULT_TICK_BANDWIDTH_BPS,
        },
        delegationsBypassActive: true,
        clients,
      });
      const exitEvents = (exitOutcome.flowEvents ?? []).map((event) =>
        createFlowEvent({ ...event, contextId }),
      );
      const finalFlowLog: FlowLogEvent[] = [...flowLog, ...exitEvents];
      await waitForPositionsToClear(walletAddress);
      const snapshotAfterExit = await createCamelotNavSnapshot({
        contextId,
        trigger: 'cycle',
        walletAddress,
        chainId: ARBITRUM_CHAIN_ID,
        camelotClient: client,
        flowLog: finalFlowLog,
      });

      const accountingAfterExit = applyAccountingUpdate({
        existing: accounting,
        flowEvents: exitEvents,
        snapshots: [snapshotAfterExit],
        now: new Date().toISOString(),
      });

      // Then positions should drop while AUM stays consistent with the reserved allocation
      expect(snapshotAfterExit.positions.length).toBe(0);
      expect(snapshotAfterExit.totalUsd).toBe(0);
      expect(accountingAfterExit.positionsUsd).toBe(0);
      expect(accountingAfterExit.aumUsd).toBeCloseTo(accounting.aumUsd ?? 0, 6);
      expect(accountingAfterExit.cashUsd).toBeCloseTo(initialAllocationUsd, 6);
      expect(accountingAfterExit.highWaterMarkUsd).toBeGreaterThanOrEqual(
        accounting.highWaterMarkUsd ?? 0,
      );
    },
    LIVE_TEST_TIMEOUT_MS,
  );
});

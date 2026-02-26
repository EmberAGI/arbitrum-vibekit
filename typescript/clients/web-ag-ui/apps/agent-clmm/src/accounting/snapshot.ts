import type { EmberCamelotClient } from '../clients/emberApi.js';
import type { CamelotPool, WalletPosition } from '../domain/types.js';

import { CAMELOT_PROTOCOL_ID, computeCamelotPositionValues } from './camelotAdapter.js';
import { resolveTokenPriceMap } from './pricing.js';
import type {
  FlowLogEvent,
  NavSnapshot,
  NavSnapshotTrigger,
  PriceSource,
  PriceSourceSummary,
  TokenDescriptor,
} from './types.js';

function normalizeAddress(address: `0x${string}`): `0x${string}` {
  return address.toLowerCase() as `0x${string}`;
}

function buildTokenDescriptors(params: {
  chainId: number;
  positions: WalletPosition[];
  poolsByAddress: Map<string, CamelotPool>;
}): TokenDescriptor[] {
  const descriptorMap = new Map<string, TokenDescriptor>();

  const addToken = (token: TokenDescriptor) => {
    const key = normalizeAddress(token.address);
    if (!descriptorMap.has(key)) {
      descriptorMap.set(key, { ...token, address: key });
    }
  };

  for (const position of params.positions) {
    for (const token of position.suppliedTokens ?? []) {
      addToken({
        chainId: params.chainId,
        address: token.tokenAddress,
        symbol: token.symbol,
        decimals: token.decimals,
      });
    }

    for (const token of position.feesOwedTokens ?? []) {
      addToken({
        chainId: params.chainId,
        address: token.tokenAddress,
        symbol: token.symbol,
        decimals: token.decimals,
      });
    }

    for (const token of position.rewardsOwedTokens ?? []) {
      addToken({
        chainId: params.chainId,
        address: token.tokenAddress,
        symbol: token.symbol,
        decimals: token.decimals,
      });
    }

    if (position.tokensOwed0 || position.tokensOwed1) {
      const pool = params.poolsByAddress.get(position.poolAddress.toLowerCase());
      if (pool) {
        if (position.tokensOwed0) {
          addToken({
            chainId: params.chainId,
            address: pool.token0.address,
            symbol: pool.token0.symbol,
            decimals: pool.token0.decimals,
          });
        }
        if (position.tokensOwed1) {
          addToken({
            chainId: params.chainId,
            address: pool.token1.address,
            symbol: pool.token1.symbol,
            decimals: pool.token1.decimals,
          });
        }
      }
    }
  }

  return Array.from(descriptorMap.values());
}

function summarizePriceSources(sources: Set<PriceSource>): PriceSourceSummary {
  if (sources.size === 0) {
    return 'unknown';
  }
  if (sources.size === 1) {
    return sources.values().next().value ?? 'unknown';
  }
  return 'mixed';
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function parseTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function extractManagedPools(params: {
  flowLog?: FlowLogEvent[];
  managedPoolAddresses?: Array<`0x${string}`>;
}): Set<string> | null {
  const pools = new Set<string>();
  if (params.flowLog) {
    for (const event of params.flowLog) {
      if (event.protocolId && event.protocolId !== CAMELOT_PROTOCOL_ID) {
        continue;
      }
      if (event.poolAddress) {
        pools.add(event.poolAddress.toLowerCase());
      }
    }
  }
  if (pools.size === 0 && params.managedPoolAddresses) {
    for (const poolAddress of params.managedPoolAddresses) {
      pools.add(poolAddress.toLowerCase());
    }
  }
  return pools.size > 0 ? pools : null;
}

function computeFeesApy(params: {
  totalUsd: number;
  feesUsd?: number;
  positionOpenedAt?: string;
  now: string;
}): number | undefined {
  if (params.totalUsd <= 0) {
    return undefined;
  }
  if (!params.feesUsd || params.feesUsd <= 0) {
    return undefined;
  }
  const start = parseTimestamp(params.positionOpenedAt);
  if (!start) {
    return undefined;
  }
  const end = parseTimestamp(params.now);
  if (!end || end <= start) {
    return undefined;
  }
  const days = (end - start) / (1000 * 60 * 60 * 24);
  if (days <= 0) {
    return undefined;
  }
  return (params.feesUsd / params.totalUsd) * (365 / days) * 100;
}

function resolvePositionOpenedAt(params: {
  flowLog?: FlowLogEvent[];
  poolAddresses: Array<`0x${string}`>;
}): string | undefined {
  if (!params.flowLog || params.flowLog.length === 0) {
    return undefined;
  }
  const targetPools = new Set(params.poolAddresses.map((address) => address.toLowerCase()));
  if (targetPools.size === 0) {
    return undefined;
  }
  const supplies = params.flowLog.filter(
    (event) =>
      event.type === 'supply' &&
      event.poolAddress &&
      targetPools.has(event.poolAddress.toLowerCase()),
  );
  if (supplies.length === 0) {
    return undefined;
  }
  return supplies.reduce<string | undefined>((latest, event) => {
    if (!latest) {
      return event.timestamp;
    }
    const latestTs = parseTimestamp(latest) ?? 0;
    const eventTs = parseTimestamp(event.timestamp) ?? 0;
    return eventTs >= latestTs ? event.timestamp : latest;
  }, undefined);
}

export async function createCamelotNavSnapshot(params: {
  contextId: string;
  trigger: NavSnapshotTrigger;
  walletAddress: `0x${string}`;
  chainId: number;
  camelotClient: EmberCamelotClient;
  flowLog?: FlowLogEvent[];
  managedPoolAddresses?: Array<`0x${string}`>;
  transactionHash?: `0x${string}`;
  threadId?: string;
  cycle?: number;
}): Promise<NavSnapshot> {
  const managedPools = extractManagedPools({
    flowLog: params.flowLog,
    managedPoolAddresses: params.managedPoolAddresses,
  });
  const snapshotTimestamp = new Date().toISOString();
  const allPositions = await params.camelotClient.getWalletPositions(
    params.walletAddress,
    params.chainId,
  );
  const positions =
    managedPools === null
      ? allPositions
      : allPositions.filter((position) =>
          managedPools.has(position.poolAddress.toLowerCase()),
        );

  if (positions.length === 0) {
    return {
      contextId: params.contextId,
      trigger: params.trigger,
      timestamp: snapshotTimestamp,
      protocolId: CAMELOT_PROTOCOL_ID,
      walletAddress: normalizeAddress(params.walletAddress),
      chainId: params.chainId,
      totalUsd: 0,
      positions: [],
      priceSource: 'unknown',
      transactionHash: params.transactionHash,
      threadId: params.threadId,
      cycle: params.cycle,
    };
  }

  const poolAddresses = Array.from(
    new Set(positions.map((position) => normalizeAddress(position.poolAddress))),
  );
  const pools = await params.camelotClient.listCamelotPools(params.chainId, { poolAddresses });
  const poolsByAddress = new Map(pools.map((pool) => [pool.address.toLowerCase(), pool]));
  const tokens = buildTokenDescriptors({
    chainId: params.chainId,
    positions,
    poolsByAddress,
  });

  const priceMap = await resolveTokenPriceMap({
    chainId: params.chainId,
    pools,
    tokens,
    positions,
  });

  const positionsValued = computeCamelotPositionValues({
    chainId: params.chainId,
    positions,
    poolsByAddress,
    priceMap,
  });

  const priceSources = new Set<PriceSource>();
  for (const position of positionsValued) {
    for (const token of position.tokens) {
      if (token.source) {
        priceSources.add(token.source);
      }
    }
  }

  const feesUsd = sum(positionsValued.map((position) => position.feesUsd ?? 0));
  const rewardsUsd = sum(positionsValued.map((position) => position.rewardsUsd ?? 0));
  const totalUsd = Number(sum(positionsValued.map((position) => position.positionValueUsd)).toFixed(6));
  const positionOpenedAt = resolvePositionOpenedAt({
    flowLog: params.flowLog,
    poolAddresses: positionsValued
      .map((position) => position.poolAddress)
      .filter((address): address is `0x${string}` => Boolean(address)),
  });
  const feesApy = computeFeesApy({
    totalUsd,
    feesUsd,
    positionOpenedAt,
    now: snapshotTimestamp,
  });

  return {
    contextId: params.contextId,
    trigger: params.trigger,
    timestamp: snapshotTimestamp,
    protocolId: CAMELOT_PROTOCOL_ID,
    walletAddress: normalizeAddress(params.walletAddress),
    chainId: params.chainId,
    totalUsd,
    positions: positionsValued,
    feesUsd: feesUsd > 0 ? Number(feesUsd.toFixed(6)) : undefined,
    feesApy: feesApy !== undefined ? Number(feesApy.toFixed(6)) : undefined,
    rewardsUsd: rewardsUsd > 0 ? Number(rewardsUsd.toFixed(6)) : undefined,
    priceSource: summarizePriceSources(priceSources),
    transactionHash: params.transactionHash,
    threadId: params.threadId,
    cycle: params.cycle,
  };
}

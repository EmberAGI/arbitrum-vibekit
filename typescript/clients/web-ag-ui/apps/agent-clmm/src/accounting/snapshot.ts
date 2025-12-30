import type { EmberCamelotClient } from '../clients/emberApi.js';
import type { CamelotPool, WalletPosition } from '../domain/types.js';

import { CAMELOT_PROTOCOL_ID, computeCamelotPositionValues } from './camelotAdapter.js';
import { resolveTokenPriceMap } from './pricing.js';
import type {
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

export async function createCamelotNavSnapshot(params: {
  contextId: string;
  trigger: NavSnapshotTrigger;
  walletAddress: `0x${string}`;
  chainId: number;
  camelotClient: EmberCamelotClient;
  transactionHash?: `0x${string}`;
  threadId?: string;
  cycle?: number;
}): Promise<NavSnapshot> {
  const [positions, pools] = await Promise.all([
    params.camelotClient.getWalletPositions(params.walletAddress, params.chainId),
    params.camelotClient.listCamelotPools(params.chainId),
  ]);

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

  return {
    contextId: params.contextId,
    trigger: params.trigger,
    timestamp: new Date().toISOString(),
    protocolId: CAMELOT_PROTOCOL_ID,
    walletAddress: normalizeAddress(params.walletAddress),
    chainId: params.chainId,
    totalUsd,
    positions: positionsValued,
    feesUsd: feesUsd > 0 ? Number(feesUsd.toFixed(6)) : undefined,
    rewardsUsd: rewardsUsd > 0 ? Number(rewardsUsd.toFixed(6)) : undefined,
    priceSource: summarizePriceSources(priceSources),
    transactionHash: params.transactionHash,
    threadId: params.threadId,
    cycle: params.cycle,
  };
}

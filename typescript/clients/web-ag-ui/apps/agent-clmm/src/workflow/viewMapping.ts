import type { AccountingState, NavSnapshot, TokenAmountBreakdown } from '../accounting/types.js';

import type { ClmmMetrics, ClmmProfile } from './context.js';

type ViewMappingInput = {
  profile: ClmmProfile;
  metrics: ClmmMetrics;
  accounting: AccountingState;
};

type PositionToken = NonNullable<ClmmMetrics['latestSnapshot']>['positionTokens'][number];

export function applyAccountingToProfile(
  profile: ClmmProfile,
  accounting: AccountingState,
): ClmmProfile {
  const nextProfile: ClmmProfile = { ...profile };

  if (accounting.aumUsd !== undefined) {
    nextProfile.aum = accounting.aumUsd;
  }
  if (accounting.apy !== undefined) {
    nextProfile.apy = accounting.apy;
  }
  if (accounting.lifetimePnlUsd !== undefined) {
    nextProfile.agentIncome = accounting.lifetimePnlUsd;
  }

  return nextProfile;
}

function normalizeAddress(address?: string): string | undefined {
  if (!address) {
    return undefined;
  }
  return address.toLowerCase();
}

function toAmountBaseUnits(total: bigint | undefined): string | undefined {
  if (total === undefined) {
    return undefined;
  }
  return total.toString();
}

function mergeTokenTotals(
  totals: Map<
    string,
    TokenAmountBreakdown & { amountTotal?: number; baseUnitsTotal?: bigint; valueUsdTotal?: number }
  >,
  token: TokenAmountBreakdown,
) {
  const key = normalizeAddress(token.tokenAddress);
  if (!key) {
    return;
  }
  const existing = totals.get(key);
  const amountTotal = (existing?.amountTotal ?? 0) + (token.amount ?? 0);
  const baseUnitsTotal =
    token.amountBaseUnits !== undefined
      ? (existing?.baseUnitsTotal ?? 0n) + BigInt(token.amountBaseUnits)
      : existing?.baseUnitsTotal;
  const valueUsdTotal = (existing?.valueUsdTotal ?? 0) + (token.valueUsd ?? 0);

  totals.set(key, {
    ...token,
    amountTotal,
    baseUnitsTotal,
    valueUsdTotal,
  });
}

function buildPositionTokens(params: {
  snapshot?: NavSnapshot;
  poolAddress?: `0x${string}`;
}): PositionToken[] {
  if (!params.snapshot || params.snapshot.positions.length === 0) {
    return [];
  }
  const targetPool = normalizeAddress(params.poolAddress);
  const positions = targetPool
    ? params.snapshot.positions.filter(
        (position) => normalizeAddress(position.poolAddress) === targetPool,
      )
    : params.snapshot.positions;
  if (positions.length === 0) {
    return [];
  }

  const totals = new Map<
    string,
    TokenAmountBreakdown & { amountTotal?: number; baseUnitsTotal?: bigint; valueUsdTotal?: number }
  >();
  for (const position of positions) {
    for (const token of position.tokens) {
      mergeTokenTotals(totals, token);
    }
  }

  return Array.from(totals.values()).map((token) => ({
    address: token.tokenAddress,
    symbol: token.symbol,
    decimals: token.decimals,
    amount: token.amountTotal !== undefined ? Number(token.amountTotal.toFixed(6)) : undefined,
    amountBaseUnits: toAmountBaseUnits(token.baseUnitsTotal),
    valueUsd: token.valueUsdTotal !== undefined ? Number(token.valueUsdTotal.toFixed(6)) : undefined,
  }));
}

function buildLatestSnapshot(params: {
  accounting: AccountingState;
  poolAddress?: `0x${string}`;
  positionOpenedAt?: string;
}): ClmmMetrics['latestSnapshot'] {
  const snapshot = params.accounting.latestNavSnapshot;
  if (!snapshot) {
    return undefined;
  }
  return {
    poolAddress: params.poolAddress ?? snapshot.positions[0]?.poolAddress,
    totalUsd: snapshot.totalUsd,
    feesUsd: snapshot.feesUsd,
    timestamp: snapshot.timestamp,
    positionOpenedAt: params.positionOpenedAt,
    positionTokens: buildPositionTokens({
      snapshot,
      poolAddress: params.poolAddress,
    }),
  };
}

function resolvePositionOpenedAt(params: {
  flowLog: AccountingState['flowLog'];
  poolAddress?: `0x${string}`;
}): string | undefined {
  if (!params.poolAddress || params.flowLog.length === 0) {
    return undefined;
  }
  const targetPool = normalizeAddress(params.poolAddress);
  if (!targetPool) {
    return undefined;
  }
  const supplies = params.flowLog.filter(
    (event) =>
      event.type === 'supply' &&
      event.poolAddress &&
      normalizeAddress(event.poolAddress) === targetPool,
  );
  if (supplies.length === 0) {
    return undefined;
  }
  return supplies.reduce<string | undefined>((latest, event) => {
    if (!latest) {
      return event.timestamp;
    }
    const latestTs = Date.parse(latest);
    const eventTs = Date.parse(event.timestamp);
    if (Number.isNaN(latestTs) || Number.isNaN(eventTs)) {
      return latest;
    }
    return eventTs >= latestTs ? event.timestamp : latest;
  }, undefined);
}

function computeFeesApy(params: {
  totalUsd?: number;
  feesUsd?: number;
  positionOpenedAt?: string;
  snapshotTimestamp?: string;
}): number | undefined {
  if (!params.totalUsd || params.totalUsd <= 0) {
    return undefined;
  }
  if (!params.feesUsd || params.feesUsd <= 0) {
    return undefined;
  }
  if (!params.positionOpenedAt || !params.snapshotTimestamp) {
    return undefined;
  }
  const start = Date.parse(params.positionOpenedAt);
  const end = Date.parse(params.snapshotTimestamp);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return undefined;
  }
  const days = (end - start) / (1000 * 60 * 60 * 24);
  if (days <= 0) {
    return undefined;
  }
  return (params.feesUsd / params.totalUsd) * (365 / days) * 100;
}

export function applyAccountingToMetrics(
  metrics: ClmmMetrics,
  accounting: AccountingState,
): ClmmMetrics {
  const nextMetrics: ClmmMetrics = { ...metrics };
  const snapshotCycle = accounting.latestNavSnapshot?.cycle;
  if (typeof snapshotCycle === 'number' && snapshotCycle > nextMetrics.iteration) {
    nextMetrics.iteration = snapshotCycle;
  }
  const poolAddress = metrics.lastSnapshot?.address;
  const positionOpenedAt = resolvePositionOpenedAt({
    flowLog: accounting.flowLog,
    poolAddress,
  });
  const snapshotTimestamp = accounting.latestNavSnapshot?.timestamp;
  const computedFeesApy = computeFeesApy({
    totalUsd: accounting.latestNavSnapshot?.totalUsd,
    feesUsd: accounting.latestNavSnapshot?.feesUsd,
    positionOpenedAt,
    snapshotTimestamp,
  });
  if (accounting.aumUsd !== undefined) {
    nextMetrics.aumUsd = accounting.aumUsd;
  }
  if (accounting.lifetimePnlUsd !== undefined) {
    nextMetrics.lifetimePnlUsd = accounting.lifetimePnlUsd;
  }
  if (computedFeesApy !== undefined) {
    nextMetrics.apy = Number(computedFeesApy.toFixed(6));
  } else if (accounting.latestNavSnapshot?.feesApy !== undefined) {
    nextMetrics.apy = accounting.latestNavSnapshot.feesApy;
  } else if (accounting.apy !== undefined) {
    nextMetrics.apy = accounting.apy;
  }
  nextMetrics.latestSnapshot = buildLatestSnapshot({
    accounting,
    poolAddress,
    positionOpenedAt,
  });
  if (nextMetrics.latestSnapshot && computedFeesApy !== undefined) {
    nextMetrics.latestSnapshot.feesApy = Number(computedFeesApy.toFixed(6));
  } else if (nextMetrics.latestSnapshot && accounting.latestNavSnapshot?.feesApy !== undefined) {
    nextMetrics.latestSnapshot.feesApy = accounting.latestNavSnapshot.feesApy;
  }

  return nextMetrics;
}

export function applyAccountingToView(input: ViewMappingInput): {
  profile: ClmmProfile;
  metrics: ClmmMetrics;
} {
  return {
    profile: applyAccountingToProfile(input.profile, input.accounting),
    metrics: applyAccountingToMetrics(input.metrics, input.accounting),
  };
}

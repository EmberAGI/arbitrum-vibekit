import { type Artifact } from '@emberai/agent-node/workflow';

import { type CamelotPool, type RebalanceTelemetry } from '../domain/types.js';

export function buildPoolArtifact(pools: CamelotPool[]): Artifact {
  return {
    artifactId: 'camelot-pools',
    name: 'camelot-pools.json',
    description: 'Mock Camelot pools for CLMM onboarding',
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

export function buildTelemetryArtifact(entry: RebalanceTelemetry): Artifact {
  return {
    artifactId: 'clmm-telemetry',
    name: 'clmm-telemetry.json',
    description: 'Mock CLMM telemetry entry',
    parts: [
      {
        kind: 'data',
        data: entry,
      },
    ],
  };
}

export function buildSummaryArtifact(telemetry: RebalanceTelemetry[]): Artifact {
  const actions: Record<string, number> = {};
  let firstTimestamp: string | undefined;
  let lastTimestamp: string | undefined;
  let volatilitySum = 0;
  let volatilityCount = 0;

  for (const entry of telemetry) {
    actions[entry.action] = (actions[entry.action] ?? 0) + 1;
    if (!firstTimestamp || entry.timestamp < firstTimestamp) {
      firstTimestamp = entry.timestamp;
    }
    if (!lastTimestamp || entry.timestamp > lastTimestamp) {
      lastTimestamp = entry.timestamp;
    }
    const volatility = entry.metrics?.volatilityPct;
    if (typeof volatility === 'number') {
      volatilitySum += volatility;
      volatilityCount += 1;
    }
  }

  const avgVolatilityPct =
    volatilityCount > 0 ? Number((volatilitySum / volatilityCount).toFixed(4)) : undefined;
  const latest = telemetry.length > 0 ? telemetry[telemetry.length - 1] : undefined;

  return {
    artifactId: 'clmm-summary',
    name: 'clmm-summary.json',
    description: 'Summary of mock CLMM workflow run',
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
          latestCycle: latest,
          timeWindow: {
            firstTimestamp,
            lastTimestamp,
          },
          priceDrift: {
            avgVolatilityPct,
          },
        },
      },
    ],
  };
}

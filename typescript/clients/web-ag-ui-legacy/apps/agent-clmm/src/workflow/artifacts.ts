import { type Artifact } from '@emberai/agent-node/workflow';

import { type CamelotPool, type RebalanceTelemetry } from '../domain/types.js';

export function buildPoolArtifact(pools: CamelotPool[]): Artifact {
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

export function buildTelemetryArtifact(entry: RebalanceTelemetry): Artifact {
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

export function buildSummaryArtifact(telemetry: RebalanceTelemetry[]): Artifact {
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

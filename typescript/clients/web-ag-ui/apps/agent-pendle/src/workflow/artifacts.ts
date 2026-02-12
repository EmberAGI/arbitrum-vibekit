import { type Artifact } from '@emberai/agent-node/workflow';

import { type PendleTelemetry } from '../domain/types.js';

export function buildTelemetryArtifact(entry: PendleTelemetry): Artifact {
  return {
    artifactId: 'pendle-telemetry',
    name: 'pendle-telemetry.json',
    description: 'Pendle telemetry entry',
    parts: [
      {
        kind: 'data',
        data: entry,
      },
    ],
  };
}

export function buildSummaryArtifact(telemetry: PendleTelemetry[]): Artifact {
  const actions: Record<string, number> = {};
  let firstTimestamp: string | undefined;
  let lastTimestamp: string | undefined;
  let bestApy = 0;
  let lastApy = 0;
  let lastYt = '';

  for (const entry of telemetry) {
    actions[entry.action] = (actions[entry.action] ?? 0) + 1;
    if (!firstTimestamp || entry.timestamp < firstTimestamp) {
      firstTimestamp = entry.timestamp;
    }
    if (!lastTimestamp || entry.timestamp > lastTimestamp) {
      lastTimestamp = entry.timestamp;
    }
    if (entry.apy > bestApy) {
      bestApy = entry.apy;
    }
    lastApy = entry.apy;
    lastYt = entry.ytSymbol;
  }

  const latest = telemetry.length > 0 ? telemetry[telemetry.length - 1] : undefined;

  return {
    artifactId: 'pendle-summary',
    name: 'pendle-summary.json',
    description: 'Summary of Pendle yield cycles',
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
          yieldSummary: {
            bestApy,
            lastApy,
            lastYt,
          },
        },
      },
    ],
  };
}

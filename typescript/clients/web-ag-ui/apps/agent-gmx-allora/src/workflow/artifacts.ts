import { type Artifact } from '@emberai/agent-node/workflow';

import type { ExecutionPlan } from '../core/executionPlan.js';
import { type GmxAlloraTelemetry } from '../domain/types.js';

export function buildTelemetryArtifact(entry: GmxAlloraTelemetry): Artifact {
  return {
    artifactId: 'gmx-allora-telemetry',
    name: 'gmx-allora-telemetry.json',
    description: 'GMX Allora telemetry entry',
    parts: [
      {
        kind: 'data',
        data: entry,
      },
    ],
  };
}

export function buildExecutionPlanArtifact(plan: ExecutionPlan): Artifact {
  return {
    artifactId: 'gmx-allora-execution-plan',
    name: 'gmx-allora-execution-plan.json',
    description: 'GMX Allora execution plan',
    parts: [
      {
        kind: 'data',
        data: plan,
      },
    ],
  };
}

export function buildExecutionResultArtifact(result: {
  action: ExecutionPlan['action'];
  ok: boolean;
  error?: string;
  txHashes?: `0x${string}`[];
  lastTxHash?: `0x${string}`;
}): Artifact {
  return {
    artifactId: 'gmx-allora-execution-result',
    name: 'gmx-allora-execution-result.json',
    description: 'GMX Allora execution result',
    parts: [
      {
        kind: 'data',
        data: result,
      },
    ],
  };
}

export function buildSummaryArtifact(telemetry: GmxAlloraTelemetry[]): Artifact {
  const actions: Record<string, number> = {};
  let firstTimestamp: string | undefined;
  let lastTimestamp: string | undefined;
  let bestConfidence = 0;
  let lastConfidence = 0;
  let lastMarket = '';

  for (const entry of telemetry) {
    actions[entry.action] = (actions[entry.action] ?? 0) + 1;
    if (!firstTimestamp || entry.timestamp < firstTimestamp) {
      firstTimestamp = entry.timestamp;
    }
    if (!lastTimestamp || entry.timestamp > lastTimestamp) {
      lastTimestamp = entry.timestamp;
    }
    const confidence = entry.prediction?.confidence ?? 0;
    if (confidence > bestConfidence) {
      bestConfidence = confidence;
    }
    lastConfidence = confidence;
    lastMarket = entry.marketSymbol;
  }

  const latest = telemetry.length > 0 ? telemetry[telemetry.length - 1] : undefined;

  return {
    artifactId: 'gmx-allora-summary',
    name: 'gmx-allora-summary.json',
    description: 'Summary of GMX Allora trade cycles',
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
          signalSummary: {
            bestConfidence,
            lastConfidence,
            lastMarket,
          },
        },
      },
    ],
  };
}

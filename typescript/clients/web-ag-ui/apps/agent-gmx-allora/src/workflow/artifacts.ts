import crypto from 'node:crypto';

import { type Artifact } from '@emberai/agent-node/workflow';

import type { TransactionPlan } from '../clients/onchainActions.js';
import type { ExecutionPlan } from '../core/executionPlan.js';
import type { AlloraPrediction, GmxAlloraTelemetry } from '../domain/types.js';

function formatConfidence(value: number | undefined): string | null {
  if (value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return `${Math.round(value * 100)}%`;
}

function formatUsd(value: number | undefined): string | null {
  if (value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return `$${value.toFixed(2)}`;
}

function formatSignal(prediction?: AlloraPrediction): string | null {
  if (!prediction) {
    return null;
  }
  const direction = prediction.direction === 'up' ? 'bullish' : 'bearish';
  const confidence = formatConfidence(prediction.confidence);
  const predicted = Number.isFinite(prediction.predictedPrice)
    ? `$${Math.round(prediction.predictedPrice).toLocaleString()}`
    : null;
  const parts = [
    `Allora ${prediction.horizonHours}h signal: ${direction}`,
    confidence ? `confidence ${confidence}` : null,
    predicted ? `predicted ${predicted}` : null,
  ].filter((value): value is string => Boolean(value));

  return parts.join(' · ');
}

function formatRebalance(telemetry: GmxAlloraTelemetry): string {
  switch (telemetry.action) {
    case 'open': {
      const side = telemetry.side ? telemetry.side.toUpperCase() : 'POSITION';
      const leverage = telemetry.leverage !== undefined ? `${telemetry.leverage}x` : null;
      const size = formatUsd(telemetry.sizeUsd);
      const parts = ['Rebalance: OPEN', side, leverage, size].filter(
        (value): value is string => Boolean(value),
      );
      return parts.join(' ');
    }
    case 'reduce': {
      const side = telemetry.side ? telemetry.side.toUpperCase() : 'POSITION';
      return `Rebalance: REDUCE ${side}`;
    }
    case 'close': {
      const side = telemetry.side ? telemetry.side.toUpperCase() : 'POSITION';
      return `Rebalance: CLOSE ${side}`;
    }
    case 'hold':
      return 'Rebalance: HOLD (no trade)';
    case 'cooldown':
      return 'Rebalance: COOLDOWN (no trade)';
    case 'signal':
      return 'Allora signal summarized';
    default: {
      const exhaustive: never = telemetry.action;
      return `Rebalance: ${String(exhaustive)}`;
    }
  }
}

function createTxPlanSlug(transactions: TransactionPlan[] | undefined): string | null {
  if (!transactions || transactions.length === 0) {
    return null;
  }

  const normalized = transactions.map((tx) => ({
    chainId: tx.chainId,
    to: tx.to.toLowerCase(),
    data: tx.data.toLowerCase(),
    value: tx.value.toLowerCase(),
  }));
  const digest = crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  return `plan_${digest.slice(0, 10)}`;
}

export function buildTelemetryArtifact(entry: GmxAlloraTelemetry): Artifact {
  const signal = formatSignal(entry.prediction);
  const rebalance = formatRebalance(entry);
  const description = signal ? `${rebalance} · ${signal}` : rebalance;

  return {
    artifactId: 'gmx-allora-telemetry',
    name: 'gmx-allora-telemetry.json',
    description,
    parts: [
      {
        kind: 'text',
        text: description,
      },
      {
        kind: 'data',
        data: entry,
      },
    ],
  };
}

export function buildExecutionPlanArtifact(params: {
  plan: ExecutionPlan;
  telemetry: GmxAlloraTelemetry;
}): Artifact {
  const rebalance = formatRebalance(params.telemetry);
  const signal = formatSignal(params.telemetry.prediction);
  const description = signal ? `${rebalance} · ${signal}` : rebalance;

  return {
    artifactId: 'gmx-allora-execution-plan',
    name: 'gmx-allora-execution-plan.json',
    description,
    parts: [
      {
        kind: 'text',
        text: description,
      },
      {
        kind: 'data',
        data: params.plan,
      },
    ],
  };
}

export function buildExecutionResultArtifact(params: {
  action: ExecutionPlan['action'];
  ok: boolean;
  error?: string;
  telemetry?: GmxAlloraTelemetry;
  transactions?: TransactionPlan[];
  txHashes?: `0x${string}`[];
  lastTxHash?: `0x${string}`;
}): Artifact {
  const txHash = params.lastTxHash;
  const planSlug = txHash ? null : createTxPlanSlug(params.transactions);
  const rebalance = params.telemetry ? formatRebalance(params.telemetry) : null;
  const signal = params.telemetry ? formatSignal(params.telemetry.prediction) : null;

  const txRef = txHash
    ? { kind: 'tx' as const, value: txHash, url: `https://arbiscan.io/tx/${txHash}` }
    : planSlug
      ? { kind: 'plan' as const, value: planSlug }
      : undefined;

  const headline = [
    rebalance,
    signal,
    txRef ? `${txRef.kind === 'tx' ? 'tx' : 'plan'} ${txRef.value}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' · ');

  return {
    artifactId: 'gmx-allora-execution-result',
    name: 'gmx-allora-execution-result.json',
    description: headline.length > 0 ? headline : 'GMX Allora execution result',
    parts: [
      {
        kind: 'text',
        text: headline.length > 0 ? headline : `Execution ${params.ok ? 'succeeded' : 'failed'}`,
      },
      {
        kind: 'data',
        data: {
          action: params.action,
          ok: params.ok,
          error: params.error,
          txHashes: params.txHashes,
          lastTxHash: params.lastTxHash,
          txRef,
          // Useful for the UI to render the signal next to the plan/tx reference.
          signal,
        },
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
  const summaryText = latest
    ? [formatRebalance(latest), formatSignal(latest.prediction)]
        .filter((value): value is string => Boolean(value))
        .join(' · ')
    : 'Allora signal summarized';

  return {
    artifactId: 'gmx-allora-summary',
    name: 'gmx-allora-summary.json',
    description: summaryText,
    parts: [
      {
        kind: 'text',
        text: summaryText,
      },
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

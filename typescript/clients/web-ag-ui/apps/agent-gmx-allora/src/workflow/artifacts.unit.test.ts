import { describe, expect, it } from 'vitest';

import type { ExecutionPlan } from '../core/executionPlan.js';
import type { GmxAlloraTelemetry } from '../domain/types.js';

import { buildExecutionPlanArtifact, buildExecutionResultArtifact, buildTelemetryArtifact } from './artifacts.js';

describe('buildExecutionPlanArtifact', () => {
  it('wraps execution plan data into an artifact', () => {
    const plan: ExecutionPlan = {
      action: 'long',
      request: {
        amount: '160',
        walletAddress: '0xwallet',
        chainId: '42161',
        marketAddress: '0xmarket',
        payTokenAddress: '0xusdc',
        collateralTokenAddress: '0xusdc',
        leverage: '2',
      },
    };

    const artifact = buildExecutionPlanArtifact(plan);

    expect(artifact.artifactId).toBe('gmx-allora-execution-plan');
    expect(artifact.name).toBe('gmx-allora-execution-plan.json');
    expect(artifact.parts[0]?.data).toEqual(plan);
  });

  it('wraps execution result data into an artifact', () => {
    const artifact = buildExecutionResultArtifact({
      action: 'long',
      ok: true,
    });

    expect(artifact.artifactId).toBe('gmx-allora-execution-result');
    expect(artifact.parts[0]?.data).toEqual({ action: 'long', ok: true });
  });

  it('wraps telemetry data into an artifact', () => {
    const telemetry: GmxAlloraTelemetry = {
      cycle: 3,
      action: 'hold',
      reason: 'No position',
      marketSymbol: 'BTC/USDC',
      timestamp: '2026-02-05T20:00:00.000Z',
      prediction: {
        topicId: 14,
        combinedValue: 47000,
        confidence: 0.42,
      },
    };

    const artifact = buildTelemetryArtifact(telemetry);

    expect(artifact.artifactId).toBe('gmx-allora-telemetry');
    expect(artifact.parts[0]?.data).toEqual(telemetry);
  });
});

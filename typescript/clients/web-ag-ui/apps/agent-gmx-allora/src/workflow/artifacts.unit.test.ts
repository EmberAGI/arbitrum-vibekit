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

    const telemetry: GmxAlloraTelemetry = {
      cycle: 1,
      action: 'open',
      reason: 'Signal bullish',
      marketSymbol: 'BTC/USDC',
      side: 'long',
      leverage: 2,
      sizeUsd: 250,
      timestamp: '2026-02-05T20:00:00.000Z',
      prediction: {
        topic: 'BTC/USD - Price Prediction - 8h',
        horizonHours: 8,
        confidence: 0.71,
        direction: 'up',
        predictedPrice: 47000,
        timestamp: '2026-02-05T20:00:00.000Z',
      },
    };

    const artifact = buildExecutionPlanArtifact({ plan, telemetry });

    expect(artifact.artifactId).toBe('gmx-allora-execution-plan');
    expect(artifact.name).toBe('gmx-allora-execution-plan.json');
    expect(artifact.description.toLowerCase()).toContain('bullish');
    expect(artifact.parts[0]?.kind).toBe('text');
    expect(artifact.description).toMatch(/plan planreq_[0-9a-f]{10}$/u);
    expect(artifact.parts[1]?.data).toMatchObject(plan);
    expect((artifact.parts[1] as { kind: 'data'; data: { planSlug?: unknown } }).data.planSlug).toMatch(
      /^planreq_[0-9a-f]{10}$/u,
    );
  });

  it('wraps execution result data into an artifact', () => {
    const artifact = buildExecutionResultArtifact({
      action: 'long',
      ok: true,
    });

    expect(artifact.artifactId).toBe('gmx-allora-execution-result');
    expect(artifact.parts[1]?.data).toMatchObject({ action: 'long', ok: true });
  });

  it('includes a stable plan placeholder when transactions are unavailable', () => {
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

    const artifact = buildExecutionResultArtifact({
      action: 'long',
      plan,
      ok: true,
      transactions: [],
    });

    expect(artifact.description).toMatch(/plan planreq_[0-9a-f]{10}$/u);
  });

  it('wraps telemetry data into an artifact', () => {
    const telemetry: GmxAlloraTelemetry = {
      cycle: 3,
      action: 'hold',
      reason: 'No position',
      marketSymbol: 'BTC/USDC',
      timestamp: '2026-02-05T20:00:00.000Z',
      prediction: {
        topic: 'BTC/USD - Price Prediction - 8h',
        horizonHours: 8,
        confidence: 0.42,
        direction: 'down',
        predictedPrice: 47000,
        timestamp: '2026-02-05T20:00:00.000Z',
      },
    };

    const artifact = buildTelemetryArtifact(telemetry);

    expect(artifact.artifactId).toBe('gmx-allora-telemetry');
    expect(artifact.description.length).toBeGreaterThan(0);
    expect(artifact.parts[1]?.data).toEqual(telemetry);
  });
});

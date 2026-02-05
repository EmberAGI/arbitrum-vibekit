import { describe, expect, it } from 'vitest';

import type { ExecutionPlan } from '../core/executionPlan.js';

import { buildExecutionPlanArtifact, buildExecutionResultArtifact } from './artifacts.js';


describe('buildExecutionPlanArtifact', () => {
  it('wraps execution plan data into an artifact', () => {
    const plan: ExecutionPlan = {
      action: 'long',
      request: {
        amount: 160n,
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
});

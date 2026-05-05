import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { projectDetailConnectAgentListUpdate } from './AgentRuntimeProvider';

const providerPath = path.resolve(process.cwd(), 'src/components/AgentRuntimeProvider.tsx');

describe('projectDetailConnectAgentListUpdate', () => {
  it('propagates lifecycle and onboarding status into the list update', () => {
    const update = projectDetailConnectAgentListUpdate({
      uiState: {
        lifecycle: {
          phase: 'active',
        },
        onboardingFlow: {
          status: 'completed',
          steps: [],
        },
        task: {
          id: 'task-1',
          taskStatus: {
            state: 'working',
            message: { content: 'Processing managed onboarding.' },
          },
        },
        haltReason: null,
        executionError: null,
      },
      profile: {
        agentIncome: 0,
        aum: 0,
        totalUsers: 0,
        apy: 0,
        chains: ['Arbitrum'],
        protocols: ['Aave'],
        tokens: ['USDC'],
        pools: [],
        allowedPools: [],
      },
      metrics: {
        iteration: 0,
        cyclesSinceRebalance: 0,
        staleCycles: 0,
        rebalanceCycles: 0,
        aumUsd: 0,
        apy: 0,
        lifetimePnlUsd: 0,
      },
    });

    expect(update).toMatchObject({
      lifecyclePhase: 'active',
      onboardingStatus: 'completed',
      taskId: 'task-1',
      taskState: 'working',
      taskMessage: 'Processing managed onboarding.',
    });
  });
});

describe('AgentRuntimeProvider shell stability', () => {
  it('keeps the CopilotKit remount key scoped to the page runtime boundary', () => {
    const source = fs.readFileSync(providerPath, 'utf8');

    expect(source).toContain('threadId={threadId}');
    expect(source).toContain('key={threadId}');
  });
});

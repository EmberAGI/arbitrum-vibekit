import { describe, expect, it } from 'vitest';

import {
  applyThreadPatch,
  clmmMessagesReducer,
  createDefaultClmmThreadState,
  reduceThreadStateForTest,
  type ClmmState,
} from './context.js';

describe('clmmMessagesReducer', () => {
  it('does not duplicate when reducer receives the same snapshot reference', () => {
    const snapshot = [{ role: 'user', content: 'sync' }] as const;
    const result = clmmMessagesReducer(snapshot, snapshot);
    expect(result).toBe(snapshot);
  });

  it('replaces when right side is a full-prefix snapshot', () => {
    const m1 = { id: '1' };
    const m2 = { id: '2' };
    const m3 = { id: '3' };
    const left = [m1, m2];
    const right = [m1, m2, m3];
    const result = clmmMessagesReducer(left, right);
    expect(result).toBe(right);
  });

  it('appends when right side is a delta update', () => {
    const m1 = { id: '1' };
    const m2 = { id: '2' };
    const m3 = { id: '3' };
    const left = [m1, m2];
    const right = [m3];
    const result = clmmMessagesReducer(left, right);
    expect(result).toEqual([m1, m2, m3]);
  });
});

describe('CLMM thread lifecycle invariants', () => {
  it('does not regress onboarding to prehire via the thread annotation reducer path', () => {
    type ThreadState = ReturnType<typeof createDefaultClmmThreadState>;

    const left: ThreadState = {
      ...createDefaultClmmThreadState(),
      lifecycle: { phase: 'onboarding' },
      onboarding: { step: 2, key: 'delegation-signing' },
    };

    const next = reduceThreadStateForTest(left, {
      lifecycle: { phase: 'prehire' },
      profile: { aum: 123 },
    });

    expect(next.lifecycle.phase).toBe('onboarding');
  });

  it('does not regress onboarding to prehire from stale explicit lifecycle patch', () => {
    const state: ClmmState = {
      messages: [],
      copilotkit: { actions: [], context: [] },
      settings: { amount: undefined },
      private: {
        mode: undefined,
        pollIntervalMs: 30_000,
        streamLimit: 200,
        cronScheduled: false,
        bootstrapped: false,
      },
      thread: {
        ...createDefaultClmmThreadState(),
        lifecycle: { phase: 'onboarding' },
        onboarding: { step: 2, key: 'delegation-signing' },
      },
    };

    const next = applyThreadPatch(state, {
      lifecycle: { phase: 'prehire' },
      profile: { aum: 123 },
    });

    expect(next.lifecycle.phase).toBe('onboarding');
  });

  it('normalizes stale onboarding input-required task after onboarding is complete', () => {
    const left = {
      ...createDefaultClmmThreadState(),
      lifecycle: { phase: 'active' as const },
      onboarding: { step: 3, key: 'delegation-signing' as const },
      onboardingFlow: {
        status: 'completed' as const,
        revision: 4,
        key: 'delegation-signing',
        steps: [
          { id: 'setup', title: 'Agent Preferences', status: 'completed' as const },
          { id: 'delegation-signing', title: 'Delegation Signing', status: 'completed' as const },
        ],
      },
      operatorConfig: {
        walletAddress: '0x1111111111111111111111111111111111111111',
        baseContributionUsd: 50,
        manualBandwidthBps: 125,
        autoCompoundFees: true,
      },
      delegationBundle: {
        chainId: 42161,
      },
      task: {
        id: 'task-1',
        taskStatus: {
          state: 'working' as const,
          timestamp: '2026-02-28T00:00:00.000Z',
          message: {
            id: 'msg-1',
            role: 'assistant' as const,
            content: 'CLMM cycle summarized.',
          },
        },
      },
    };

    const next = reduceThreadStateForTest(left, {
      task: {
        id: 'task-1',
        taskStatus: {
          state: 'input-required',
          timestamp: '2026-02-28T00:00:01.000Z',
          message: {
            id: 'msg-2',
            role: 'assistant',
            content: 'Waiting for you to approve the required permissions to continue setup.',
          },
        },
      },
    });

    expect(next.lifecycle.phase).toBe('active');
    expect(next.task?.taskStatus.state).toBe('working');
    expect(next.task?.taskStatus.message?.content).toBe('Onboarding complete. CLMM strategy is active.');
  });

  it('resets stale onboarding domain state when a new hire starts', () => {
    const left = {
      ...createDefaultClmmThreadState(),
      lifecycle: { phase: 'active' as const },
      onboarding: { step: 3, key: 'delegation-signing' as const },
      onboardingFlow: {
        status: 'in_progress' as const,
        revision: 8,
        key: 'delegation-signing',
        steps: [
          { id: 'setup', title: 'Agent Preferences', status: 'completed' as const },
          { id: 'funding-token', title: 'Funding Token', status: 'completed' as const },
          { id: 'delegation-signing', title: 'Delegation Signing', status: 'active' as const },
        ],
      },
      operatorInput: {
        poolAddress: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
        walletAddress: '0x1111111111111111111111111111111111111111',
        baseContributionUsd: 10,
      },
      fundingTokenInput: {
        fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
      },
      operatorConfig: {
        walletAddress: '0x1111111111111111111111111111111111111111',
        baseContributionUsd: 10,
        manualBandwidthBps: 125,
        autoCompoundFees: true,
      },
      delegationBundle: {
        chainId: 42161,
        delegationManager: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3',
        delegatorAddress: '0x1111111111111111111111111111111111111111',
        delegateeAddress: '0x2222222222222222222222222222222222222222',
        delegations: [],
        intents: [],
        descriptions: [],
        warnings: [],
      },
      task: {
        id: 'old-task',
        taskStatus: {
          state: 'input-required' as const,
          timestamp: '2026-02-28T20:05:45.317Z',
          message: {
            id: 'old-msg',
            role: 'assistant' as const,
            content: 'Waiting for you to approve the required permissions to continue setup.',
          },
        },
      },
      metrics: {
        ...createDefaultClmmThreadState().metrics,
        iteration: 42,
      },
    };

    const next = reduceThreadStateForTest(left, {
      lifecycle: { phase: 'onboarding' },
      task: {
        id: 'new-task',
        taskStatus: {
          state: 'submitted',
          timestamp: '2026-02-28T20:10:00.000Z',
          message: {
            id: 'new-msg',
            role: 'assistant',
            content: 'Agent hired!',
          },
        },
      },
      activity: { events: [], telemetry: [] },
    });

    expect(next.lifecycle.phase).toBe('onboarding');
    expect(next.task?.id).toBe('new-task');
    expect(next.task?.taskStatus.state).toBe('submitted');
    expect(next.onboarding).toBeUndefined();
    expect(next.onboardingFlow).toBeUndefined();
    expect(next.operatorInput).toBeUndefined();
    expect(next.fundingTokenInput).toBeUndefined();
    expect(next.operatorConfig).toBeUndefined();
    expect(next.delegationBundle).toBeUndefined();
    expect(next.metrics.iteration).toBe(0);
  });

  it('keeps input-required task when stale working summary update arrives during onboarding', () => {
    const left = {
      ...createDefaultClmmThreadState(),
      lifecycle: { phase: 'onboarding' as const },
      onboarding: { step: 2, key: 'delegation-signing' as const },
      task: {
        id: 'task-1',
        taskStatus: {
          state: 'input-required' as const,
          timestamp: '2026-02-28T20:32:59.703Z',
          message: {
            id: 'wait-msg',
            role: 'assistant' as const,
            content: 'Waiting for you to approve the required permissions to continue setup.',
          },
        },
      },
    };

    const next = reduceThreadStateForTest(left, {
      task: {
        id: 'task-1',
        taskStatus: {
          state: 'working',
          timestamp: '2026-02-28T20:32:59.704Z',
          message: {
            id: 'summary-msg',
            role: 'assistant',
            content: 'CLMM cycle summarized.',
          },
        },
      },
    });

    expect(next.task?.taskStatus.state).toBe('input-required');
    expect(next.task?.taskStatus.message?.content).toBe(
      'Waiting for you to approve the required permissions to continue setup.',
    );
    expect(next.onboarding?.key).toBe('delegation-signing');
  });

  it('does not regress onboarding key from delegation-signing to funding-token at the same step', () => {
    const left = {
      ...createDefaultClmmThreadState(),
      lifecycle: { phase: 'onboarding' as const },
      onboarding: { step: 2, key: 'delegation-signing' as const },
      task: {
        id: 'task-1',
        taskStatus: {
          state: 'working' as const,
          timestamp: '2026-02-28T20:32:23.030Z',
          message: {
            id: 'working-msg',
            role: 'assistant' as const,
            content: 'Operator configuration received. Preparing execution context.',
          },
        },
      },
    };

    const next = reduceThreadStateForTest(left, {
      onboarding: { step: 2, key: 'funding-token' },
    });

    expect(next.onboarding?.step).toBe(2);
    expect(next.onboarding?.key).toBe('delegation-signing');
  });

  it('does not regress onboarding step for delegation-signing when stale step 2 patch arrives', () => {
    const left = {
      ...createDefaultClmmThreadState(),
      lifecycle: { phase: 'onboarding' as const },
      onboarding: { step: 3, key: 'delegation-signing' as const },
      task: {
        id: 'task-1',
        taskStatus: {
          state: 'input-required' as const,
          timestamp: '2026-03-04T02:10:00.000Z',
          message: {
            id: 'wait-msg',
            role: 'assistant' as const,
            content: 'Waiting for you to approve the required permissions to continue setup.',
          },
        },
      },
    };

    const next = reduceThreadStateForTest(left, {
      onboarding: { step: 2, key: 'delegation-signing' },
      task: {
        id: 'task-1',
        taskStatus: {
          state: 'working',
          timestamp: '2026-03-04T02:10:00.100Z',
          message: {
            id: 'working-msg',
            role: 'assistant',
            content: 'Delegation approvals received. Continuing onboarding.',
          },
        },
      },
    });

    expect(next.onboarding?.step).toBe(3);
    expect(next.onboarding?.key).toBe('delegation-signing');
    expect(next.task?.taskStatus.state).toBe('input-required');
  });

  it('does not regress onboarding key at equal progress when stale key patch arrives', () => {
    const left = {
      ...createDefaultClmmThreadState(),
      lifecycle: { phase: 'onboarding' as const },
      onboarding: { step: 3, key: 'delegation-signing' as const },
    };

    const next = reduceThreadStateForTest(left, {
      onboarding: { step: 3, key: 'funding-token' },
    });

    expect(next.onboarding?.step).toBe(3);
    expect(next.onboarding?.key).toBe('delegation-signing');
  });

  it('does not regress active cycle task message when stale lower-iteration update arrives', () => {
    const left = {
      ...createDefaultClmmThreadState(),
      lifecycle: { phase: 'active' as const },
      metrics: {
        ...createDefaultClmmThreadState().metrics,
        iteration: 4,
      },
      task: {
        id: 'task-1',
        taskStatus: {
          state: 'working' as const,
          timestamp: '2026-03-04T03:35:04.421Z',
          message: {
            id: 'cycle-4',
            role: 'assistant' as const,
            content: '[Cycle 4] hold: Within target band; monitoring continues',
          },
        },
      },
    };

    const next = reduceThreadStateForTest(left, {
      metrics: {
        iteration: 3,
      },
      task: {
        id: 'task-1',
        taskStatus: {
          state: 'working',
          timestamp: '2026-03-04T03:35:11.681Z',
          message: {
            id: 'cycle-3',
            role: 'assistant',
            content: '[Cycle 3] hold: Within target band; monitoring continues',
          },
        },
      },
    });

    expect(next.metrics.iteration).toBe(4);
    expect(next.task?.taskStatus.message?.content).toBe(
      '[Cycle 4] hold: Within target band; monitoring continues',
    );
  });

  it('ignores stale onboarding-era working message once active cycle telemetry is established', () => {
    const left = {
      ...createDefaultClmmThreadState(),
      lifecycle: { phase: 'active' as const },
      metrics: {
        ...createDefaultClmmThreadState().metrics,
        iteration: 2,
      },
      task: {
        id: 'task-1',
        taskStatus: {
          state: 'working' as const,
          timestamp: '2026-03-04T03:34:15.798Z',
          message: {
            id: 'cycle-2',
            role: 'assistant' as const,
            content: '[Cycle 2] hold: Within target band; monitoring continues',
          },
        },
      },
    };

    const next = reduceThreadStateForTest(left, {
      task: {
        id: 'task-1',
        taskStatus: {
          state: 'working',
          timestamp: '2026-03-04T03:34:11.357Z',
          message: {
            id: 'delegations-active',
            role: 'assistant',
            content:
              'Delegations active. Managing pool WETH/USDC from user wallet 0xbD70792F773a39f88b43d35bb5Aa3d5e098EfeA4',
          },
        },
      },
    });

    expect(next.metrics.iteration).toBe(2);
    expect(next.task?.taskStatus.message?.content).toBe(
      '[Cycle 2] hold: Within target band; monitoring continues',
    );
  });

  it('does not replace cycle message with non-cycle active message when iteration does not advance', () => {
    const left = {
      ...createDefaultClmmThreadState(),
      lifecycle: { phase: 'active' as const },
      metrics: {
        ...createDefaultClmmThreadState().metrics,
        iteration: 1,
      },
      task: {
        id: 'task-1',
        taskStatus: {
          state: 'working' as const,
          timestamp: '2026-03-04T04:39:02.420Z',
          message: {
            id: 'cycle-1',
            role: 'assistant' as const,
            content:
              '[Cycle 1] enter-range: No active CLMM position detected for this pool (tx: 0xafbc59bc37ed7b5d6dcf5fae644c35380a6dc91a63f2e7632e777798d579492f)',
          },
        },
      },
    };

    const next = reduceThreadStateForTest(left, {
      metrics: {
        iteration: 1,
      },
      task: {
        id: 'task-1',
        taskStatus: {
          state: 'working',
          timestamp: '2026-03-04T04:39:05.243Z',
          message: {
            id: 'delegations-active',
            role: 'assistant',
            content:
              'Delegations active. Managing pool WETH/USDC from user wallet 0xbD70792F773a39f88b43d35bb5Aa3d5e098EfeA4',
          },
        },
      },
    });

    expect(next.metrics.iteration).toBe(1);
    expect(next.task?.taskStatus.message?.content).toContain('[Cycle 1] enter-range');
  });

  it('does not regress active working task timestamp before first cycle iteration', () => {
    const left = {
      ...createDefaultClmmThreadState(),
      lifecycle: { phase: 'active' as const },
      metrics: {
        ...createDefaultClmmThreadState().metrics,
        iteration: 0,
      },
      task: {
        id: 'task-1',
        taskStatus: {
          state: 'working' as const,
          timestamp: '2026-03-04T04:38:55.048Z',
          message: {
            id: 'delegations-active',
            role: 'assistant' as const,
            content:
              'Delegations active. Managing pool WETH/USDC from user wallet 0xbD70792F773a39f88b43d35bb5Aa3d5e098EfeA4',
          },
        },
      },
    };

    const next = reduceThreadStateForTest(left, {
      task: {
        id: 'task-1',
        taskStatus: {
          state: 'working',
          timestamp: '2026-03-04T04:38:55.021Z',
          message: {
            id: 'delegations-signed',
            role: 'assistant',
            content: 'Delegations signed. Continuing onboarding.',
          },
        },
      },
    });

    expect(next.metrics.iteration).toBe(0);
    expect(next.task?.taskStatus.timestamp).toBe('2026-03-04T04:38:55.048Z');
    expect(next.task?.taskStatus.message?.content).toContain('Delegations active.');
  });
});

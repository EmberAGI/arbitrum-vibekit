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
});

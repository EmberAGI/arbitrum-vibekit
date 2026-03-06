import { describe, expect, it } from 'vitest';

import { applyThreadPatch, clmmMessagesReducer, type ClmmState } from './context.js';

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

describe('GMX thread lifecycle invariants', () => {
  it('keeps inactive after terminal snapshots even when setup signals persist', () => {
    const state = {
      thread: {
        lifecycle: { phase: 'inactive' },
        task: { id: 'task-1', taskStatus: { state: 'completed' } },
        operatorConfig: {
          delegateeWalletAddress: '0x1111111111111111111111111111111111111111',
          delegatorWalletAddress: '0x2222222222222222222222222222222222222222',
          baseContributionUsd: 10,
          targetMarket: {
            address: '0x3333333333333333333333333333333333333333',
            indexToken: 'WETH',
            longToken: 'WETH',
            shortToken: 'USDC',
          },
        },
      },
    } as unknown as ClmmState;

    const next = applyThreadPatch(state, {
      profile: { aum: 123 },
    });

    expect(next.lifecycle.phase).toBe('inactive');
  });

  it('allows explicit onboarding transition from inactive during rehire', () => {
    const state = {
      thread: {
        lifecycle: { phase: 'inactive' },
        task: { id: 'fire-task', taskStatus: { state: 'completed' } },
        operatorConfig: {
          delegateeWalletAddress: '0x1111111111111111111111111111111111111111',
          delegatorWalletAddress: '0x2222222222222222222222222222222222222222',
          baseContributionUsd: 10,
          targetMarket: {
            address: '0x3333333333333333333333333333333333333333',
            indexToken: 'WETH',
            longToken: 'WETH',
            shortToken: 'USDC',
          },
        },
      },
    } as unknown as ClmmState;

    const next = applyThreadPatch(state, {
      lifecycle: { phase: 'onboarding' },
      task: { id: 'rehire-task', taskStatus: { state: 'submitted' } },
    });

    expect(next.lifecycle.phase).toBe('onboarding');
  });

  it('resets stale onboarding domain state when a new hire starts', () => {
    const state = {
      thread: {
        lifecycle: { phase: 'active' },
        onboarding: { step: 3, key: 'delegation-signing' },
        onboardingFlow: {
          status: 'in_progress',
          revision: 9,
          key: 'delegation-signing',
          steps: [
            { id: 'setup', title: 'Strategy Config', status: 'completed' },
            { id: 'funding-token', title: 'Funding Token', status: 'completed' },
            { id: 'delegation-signing', title: 'Delegation Signing', status: 'active' },
          ],
        },
        operatorInput: {
          delegatorWalletAddress: '0x1111111111111111111111111111111111111111',
          targetMarketAddress: '0x3333333333333333333333333333333333333333',
          baseContributionUsd: 10,
        },
        fundingTokenInput: {
          fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        },
        selectedPool: {
          address: '0x3333333333333333333333333333333333333333',
          indexToken: 'WETH',
          longToken: 'WETH',
          shortToken: 'USDC',
        },
        operatorConfig: {
          delegateeWalletAddress: '0x2222222222222222222222222222222222222222',
          delegatorWalletAddress: '0x1111111111111111111111111111111111111111',
          baseContributionUsd: 10,
          targetMarket: {
            address: '0x3333333333333333333333333333333333333333',
            indexToken: 'WETH',
            longToken: 'WETH',
            shortToken: 'USDC',
          },
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
            state: 'input-required',
            message: {
              id: 'old-msg',
              role: 'assistant',
              content: 'Waiting for you to approve the required permissions to continue setup.',
            },
          },
        },
        metrics: {
          iteration: 37,
        },
      },
    } as unknown as ClmmState;

    const next = applyThreadPatch(state, {
      lifecycle: { phase: 'onboarding' },
      task: {
        id: 'new-task',
        taskStatus: {
          state: 'submitted',
          message: { id: 'new-msg', role: 'assistant', content: 'Agent hired!' },
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
    expect(next.selectedPool).toBeUndefined();
    expect(next.operatorConfig).toBeUndefined();
    expect(next.delegationBundle).toBeUndefined();
    expect(next.metrics.iteration).toBe(0);
  });
});

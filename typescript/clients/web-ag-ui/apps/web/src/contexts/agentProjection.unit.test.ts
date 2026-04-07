import { describe, expect, it } from 'vitest';

import {
  projectAgentListUpdateFromState,
  projectDetailStateFromPayload,
} from './agentProjection';

describe('agentProjection', () => {
  it('returns null when payload is empty or invalid', () => {
    expect(projectDetailStateFromPayload(null)).toBeNull();
    expect(projectDetailStateFromPayload({})).toBeNull();
    expect(projectDetailStateFromPayload('bad')).toBeNull();
  });

  it('projects partial detail payload onto a stable ThreadSnapshot shape', () => {
    const projected = projectDetailStateFromPayload({
      thread: {
        setupComplete: true,
      },
      settings: {
        amount: 123,
      },
    });

    expect(projected).not.toBeNull();
    expect(projected?.thread.setupComplete).toBe(true);
    expect(projected?.settings.amount).toBe(123);
    expect(Array.isArray(projected?.thread.activity?.events)).toBe(true);
  });

  it('projects thread payloads (wire contract) onto a stable ThreadSnapshot shape', () => {
    const projected = projectDetailStateFromPayload({
      thread: {
        setupComplete: true,
      },
      settings: {
        amount: 321,
      },
    });

    expect(projected).not.toBeNull();
    expect(projected?.thread?.setupComplete).toBe(true);
    expect(projected?.settings.amount).toBe(321);
  });

  it('does not emit legacy top-level view key in projected snapshots', () => {
    const projected = projectDetailStateFromPayload({
      thread: {
        setupComplete: true,
      },
    });

    expect(projected).not.toBeNull();
    expect(projected?.thread?.setupComplete).toBe(true);
    expect('view' in (projected ?? {})).toBe(false);
  });

  it('projects sidebar list update from the same projected state artifact', () => {
    const projected = projectDetailStateFromPayload({
      thread: {
        command: 'cycle',
        lifecycle: {
          phase: 'prehire',
        },
        onboardingFlow: {
          status: 'completed',
          revision: 1,
          steps: [],
        },
        task: {
          id: 'task-1',
          taskStatus: {
            state: 'working',
            message: { content: 'processing' },
          },
        },
      },
    });

    const update = projectAgentListUpdateFromState(projected!);
    expect(update.taskId).toBe('task-1');
    expect(update.taskState).toBe('working');
    expect(update.taskMessage).toBe('processing');
    expect(update.lifecyclePhase).toBe('prehire');
    expect(update.onboardingStatus).toBe('completed');
  });

  it('preserves string-shaped task status messages when projecting sidebar list updates', () => {
    const projected = projectDetailStateFromPayload({
      thread: {
        lifecycle: {
          phase: 'prehire',
        },
        task: {
          id: 'task-ready',
          taskStatus: {
            state: 'working',
            message: 'Ready for a live runtime conversation.',
          },
        },
      },
    });

    const update = projectAgentListUpdateFromState(projected!);
    expect(update.taskId).toBe('task-ready');
    expect(update.taskState).toBe('working');
    expect(update.taskMessage).toBe('Ready for a live runtime conversation.');
    expect(update.lifecyclePhase).toBe('prehire');
  });

  it('drops incoming command intent from projected detail state', () => {
    const projected = projectDetailStateFromPayload({
      thread: {
        command: 'cycle',
        onboardingFlow: {
          status: 'in_progress',
          revision: 1,
          steps: [],
        },
      },
    });

    expect(projected).not.toBeNull();
    expect((projected?.thread as Record<string, unknown> | undefined)?.command).toBeUndefined();
  });

  it('preserves previously projected thread fields when applying partial payload updates', () => {
    const previous = projectDetailStateFromPayload({
      thread: {
        profile: {
          chains: ['Arbitrum'],
          protocols: ['Pendle'],
          tokens: ['USDC'],
        },
        metrics: {
          apy: 8.46,
        },
      },
    });

    const projectWithPrevious = projectDetailStateFromPayload as (
      payload: unknown,
      previousState?: unknown,
    ) => ReturnType<typeof projectDetailStateFromPayload>;

    const projected = projectWithPrevious(
      {
        thread: {
          task: {
            id: 'task-2',
            taskStatus: {
              state: 'working',
            },
          },
        },
      },
      previous,
    );

    expect(projected).not.toBeNull();
    expect((projected?.thread as Record<string, unknown> | undefined)?.command).toBeUndefined();
    expect(projected?.thread.profile.chains).toEqual(['Arbitrum']);
    expect(projected?.thread.profile.protocols).toEqual(['Pendle']);
    expect(projected?.thread.profile.tokens).toEqual(['USDC']);
    expect(projected?.thread.metrics.apy).toBe(8.46);
    expect(projected?.thread.task?.id).toBe('task-2');
  });

  it('clears onboarding-specific fields when a fresh prehire snapshot arrives', () => {
    const previous = projectDetailStateFromPayload({
      thread: {
        lifecycle: {
          phase: 'onboarding',
        },
        task: {
          id: 'task-setup',
          taskStatus: {
            state: 'input-required',
          },
        },
        onboardingFlow: {
          status: 'in_progress',
          revision: 2,
          activeStepId: 'funding-token',
          steps: [],
        },
        operatorInput: {
          walletAddress: '0x0000000000000000000000000000000000000001',
          baseContributionUsd: 500,
        },
        fundingTokenInput: {
          tokenAddress: '0x0000000000000000000000000000000000000002',
        },
        profile: {
          chains: ['Arbitrum'],
        },
      },
    });

    const projected = projectDetailStateFromPayload(
      {
        thread: {
          lifecycle: {
            phase: 'prehire',
          },
        },
      },
      previous,
    );

    expect(projected?.thread.lifecycle?.phase).toBe('prehire');
    expect(projected?.thread.task).toBeUndefined();
    expect(projected?.thread.onboardingFlow).toBeUndefined();
    expect(projected?.thread.operatorInput).toBeUndefined();
    expect(projected?.thread.fundingTokenInput).toBeUndefined();
    expect(projected?.thread.profile.chains).toEqual(['Arbitrum']);
  });
});

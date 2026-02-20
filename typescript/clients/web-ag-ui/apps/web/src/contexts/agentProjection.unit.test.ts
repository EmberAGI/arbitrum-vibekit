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

  it('projects partial detail payload onto a stable AgentState shape', () => {
    const projected = projectDetailStateFromPayload({
      view: {
        command: 'sync',
      },
      settings: {
        amount: 123,
      },
    });

    expect(projected).not.toBeNull();
    expect(projected?.view.command).toBe('sync');
    expect(projected?.settings.amount).toBe(123);
    expect(Array.isArray(projected?.view.activity?.events)).toBe(true);
  });

  it('projects sidebar list update from the same projected state artifact', () => {
    const projected = projectDetailStateFromPayload({
      view: {
        command: 'cycle',
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
    expect(update.command).toBe('cycle');
    expect(update.taskId).toBe('task-1');
    expect(update.taskState).toBe('working');
    expect(update.taskMessage).toBe('processing');
  });

  it('preserves previously projected view fields when applying partial payload updates', () => {
    const previous = projectDetailStateFromPayload({
      view: {
        command: 'cycle',
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
        view: {
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
    expect(projected?.view.command).toBe('cycle');
    expect(projected?.view.profile.chains).toEqual(['Arbitrum']);
    expect(projected?.view.profile.protocols).toEqual(['Pendle']);
    expect(projected?.view.profile.tokens).toEqual(['USDC']);
    expect(projected?.view.metrics.apy).toBe(8.46);
    expect(projected?.view.task?.id).toBe('task-2');
  });
});

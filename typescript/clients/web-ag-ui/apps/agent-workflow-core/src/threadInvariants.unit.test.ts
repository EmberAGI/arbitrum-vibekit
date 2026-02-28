import { describe, expect, it } from 'vitest';

import {
  normalizeStaleOnboardingTask,
  projectCycleCommandThread,
  shouldPersistInputRequiredCheckpoint,
} from './threadInvariants.js';

describe('threadInvariants', () => {
  it('persists pending checkpoint when onboarding key advances despite identical input-required task message', () => {
    expect(
      shouldPersistInputRequiredCheckpoint({
        currentTaskState: 'input-required',
        currentTaskMessage: 'Waiting for delegation approval to continue onboarding.',
        currentOnboardingKey: 'funding-token',
        nextOnboardingKey: 'delegation-signing',
        nextTaskMessage: 'Waiting for delegation approval to continue onboarding.',
      }),
    ).toBe(true);
  });

  it('does not persist redundant checkpoint when task and onboarding key are unchanged', () => {
    expect(
      shouldPersistInputRequiredCheckpoint({
        currentTaskState: 'input-required',
        currentTaskMessage: 'Waiting for delegation approval to continue onboarding.',
        currentOnboardingKey: 'delegation-signing',
        nextOnboardingKey: 'delegation-signing',
        nextTaskMessage: 'Waiting for delegation approval to continue onboarding.',
      }),
    ).toBe(false);
  });

  it('normalizes stale onboarding input-required state without injecting command intent', () => {
    const projected = projectCycleCommandThread({
      command: 'hire',
      onboardingFlow: {
        status: 'completed',
        revision: 8,
        steps: [
          { id: 'setup', title: 'Setup', status: 'completed' },
          { id: 'delegation-signing', title: 'Delegation Signing', status: 'completed' },
        ],
      },
      task: {
        id: 'task-1',
        taskStatus: {
          state: 'input-required',
          message: { content: 'Waiting for delegation approval to continue onboarding.' },
        },
      },
    });

    const projectedTask = projected['task'] as
      | {
          taskStatus?: {
            state?: string;
          };
        }
      | undefined;

    expect(projected['command']).toBeUndefined();
    expect(projectedTask?.taskStatus?.state).toBe('working');
  });

  it('normalizes continue-setup input-required when setup is already complete', () => {
    const projected = projectCycleCommandThread({
      operatorConfig: { walletAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9' },
      task: {
        id: 'task-2',
        taskStatus: {
          state: 'input-required',
          message: { content: 'Waiting for you to approve the required permissions to continue setup.' },
        },
      },
    });

    const projectedTask = projected['task'] as
      | {
          taskStatus?: {
            state?: string;
          };
        }
      | undefined;

    expect(projectedTask?.taskStatus?.state).toBe('working');
  });

  it('can override stale input-required message via shared normalizer', () => {
    const projected = normalizeStaleOnboardingTask({
      thread: {
        onboardingFlow: {
          status: 'completed',
        },
        task: {
          id: 'task-3',
          taskStatus: {
            state: 'input-required',
            message: {
              content: 'Cycle paused until onboarding input is complete.',
            },
          },
        },
      },
      completedMessage: 'Onboarding complete. Strategy is active.',
    });

    const projectedTask = projected['task'] as
      | {
          taskStatus?: {
            state?: string;
            message?: { content?: string };
          };
        }
      | undefined;

    expect(projectedTask?.taskStatus?.state).toBe('working');
    expect(projectedTask?.taskStatus?.message?.content).toBe('Onboarding complete. Strategy is active.');
  });
});

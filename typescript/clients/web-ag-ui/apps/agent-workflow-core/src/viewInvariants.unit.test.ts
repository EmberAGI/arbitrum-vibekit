import { describe, expect, it } from 'vitest';

import {
  projectCycleCommandView,
  shouldPersistInputRequiredCheckpoint,
} from './viewInvariants.js';

describe('viewInvariants', () => {
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

  it('normalizes stale onboarding input-required state when projecting cycle command', () => {
    const projected = projectCycleCommandView({
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

    expect(projected['command']).toBe('cycle');
    expect(projectedTask?.taskStatus?.state).toBe('working');
  });
});

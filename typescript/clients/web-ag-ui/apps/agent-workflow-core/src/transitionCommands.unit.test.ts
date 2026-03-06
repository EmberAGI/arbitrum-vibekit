import { describe, expect, it } from 'vitest';

import {
  buildInterruptPauseTransition,
  buildNodeTransition,
  buildStateUpdate,
  buildTerminalTransition,
} from './index';

describe('transitionCommands', () => {
  it('builds an interrupt pause transition that self-loops to the same node', () => {
    const command = buildInterruptPauseTransition({
      node: 'collectSetupInput',
      update: {
        thread: {
          onboarding: { step: 1, key: 'setup' },
        },
      },
      createCommand: (input) => input,
    });

    const resolved = command as unknown as {
      goto?: string;
      update?: {
        thread?: {
          onboarding?: {
            step?: number;
            key?: string;
          };
        };
      };
    };

    expect(resolved.goto).toBe('collectSetupInput');
    expect(resolved.update?.thread?.onboarding).toEqual({ step: 1, key: 'setup' });
  });

  it('builds an explicit terminal transition to __end__', () => {
    const command = buildTerminalTransition({
      update: {
        thread: {
          task: { taskStatus: { state: 'completed' } },
        },
      },
      createCommand: (input) => input,
    });

    const resolved = command as unknown as {
      goto?: string;
      update?: {
        thread?: {
          task?: {
            taskStatus?: {
              state?: string;
            };
          };
        };
      };
    };

    expect(resolved.goto).toBe('__end__');
    expect(resolved.update?.thread?.task?.taskStatus?.state).toBe('completed');
  });

  it('builds a non-terminal transition with shared invariant checks', () => {
    const command = buildNodeTransition({
      node: 'summarize',
      update: {
        thread: {
          task: {
            taskStatus: {
              state: 'failed',
              message: { content: 'Unable to continue.' },
            },
          },
        },
      },
      createCommand: (input) => input,
    });

    const resolved = command as unknown as {
      goto?: string;
      update?: {
        thread?: {
          task?: {
            taskStatus?: {
              state?: string;
              message?: {
                content?: string;
              };
            };
          };
        };
      };
    };

    expect(resolved.goto).toBe('summarize');
    expect(resolved.update?.thread?.task?.taskStatus?.state).toBe('failed');
    expect(resolved.update?.thread?.task?.taskStatus?.message?.content).toBe('Unable to continue.');
  });

  it('validates plain state updates with shared invariant checks', () => {
    const update = buildStateUpdate({
      thread: {
        task: {
          taskStatus: {
            state: 'input-required',
            message: { content: 'Waiting for input.' },
          },
        },
      },
    });

    expect(update.thread.task.taskStatus.state).toBe('input-required');
    expect(update.thread.task.taskStatus.message?.content).toBe('Waiting for input.');
  });

  it('rejects interrupt transitions with blank input-required task messages', () => {
    expect(() =>
      buildInterruptPauseTransition({
        node: 'collectSetupInput',
        update: {
          thread: {
            task: {
              taskStatus: {
                state: 'input-required',
                message: { content: '   ' },
              },
            },
          },
        },
        createCommand: (input) => input,
      }),
    ).toThrow("Invalid transition update: 'input-required' task message content must be a non-empty string.");
  });

  it('rejects terminal transitions with missing input-required task messages', () => {
    expect(() =>
      buildTerminalTransition({
        update: {
          thread: {
            task: {
              taskStatus: {
                state: 'input-required',
              },
            },
          },
        },
        createCommand: (input) => input,
      }),
    ).toThrow("Invalid transition update: 'input-required' task status must include message content.");
  });

  it('rejects transitions that retain legacy onboarding with terminal onboardingFlow status', () => {
    expect(() =>
      buildInterruptPauseTransition({
        node: 'collectSetupInput',
        update: {
          thread: {
            onboardingFlow: {
              status: 'completed',
            },
            onboarding: {
              step: 4,
              key: 'fund-wallet',
            },
          },
        },
        createCommand: (input) => input,
      }),
    ).toThrow(
      'Invalid transition update: terminal onboardingFlow status cannot include legacy onboarding step/key.',
    );
  });

  it('rejects plain state updates that violate input-required message invariant', () => {
    expect(() =>
      buildStateUpdate({
        thread: {
          task: {
            taskStatus: {
              state: 'input-required',
              message: { content: '' },
            },
          },
        },
      }),
    ).toThrow("Invalid transition update: 'input-required' task message content must be a non-empty string.");
  });
});

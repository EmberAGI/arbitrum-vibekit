import { describe, expect, it } from 'vitest';

import { buildInterruptPauseTransition, buildTerminalTransition } from './index';

describe('transitionCommands', () => {
  it('builds an interrupt pause transition that self-loops to the same node', () => {
    const command = buildInterruptPauseTransition({
      node: 'collectSetupInput',
      update: {
        view: {
          onboarding: { step: 1, key: 'setup' },
        },
      },
      createCommand: (input) => input,
    });

    const resolved = command as unknown as {
      goto?: string;
      update?: {
        view?: {
          onboarding?: {
            step?: number;
            key?: string;
          };
        };
      };
    };

    expect(resolved.goto).toBe('collectSetupInput');
    expect(resolved.update?.view?.onboarding).toEqual({ step: 1, key: 'setup' });
  });

  it('builds an explicit terminal transition to __end__', () => {
    const command = buildTerminalTransition({
      update: {
        view: {
          task: { taskStatus: { state: 'completed' } },
        },
      },
      createCommand: (input) => input,
    });

    const resolved = command as unknown as {
      goto?: string;
      update?: {
        view?: {
          task?: {
            taskStatus?: {
              state?: string;
            };
          };
        };
      };
    };

    expect(resolved.goto).toBe('__end__');
    expect(resolved.update?.view?.task?.taskStatus?.state).toBe('completed');
  });

  it('rejects interrupt transitions with blank input-required task messages', () => {
    expect(() =>
      buildInterruptPauseTransition({
        node: 'collectSetupInput',
        update: {
          view: {
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
          view: {
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
          view: {
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
});

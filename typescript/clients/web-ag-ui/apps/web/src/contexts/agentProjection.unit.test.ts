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
      shared: {
        settings: {
          amount: 123,
        },
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
      shared: {
        settings: {
          amount: 321,
        },
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

  it('maps top-level runtime artifacts onto thread artifacts for canonical interrupt hydration', () => {
    const projected = projectDetailStateFromPayload({
      thread: {
        lifecycle: {
          phase: 'onboarding',
        },
      },
      artifacts: {
        current: {
          artifactId: 'artifact-current',
          data: {
            type: 'lifecycle-status',
            phase: 'onboarding',
          },
        },
        activity: {
          artifactId: 'artifact-hidden-interrupt',
          data: {
            type: 'interrupt-status',
            status: 'pending',
            surfacedInThread: false,
            interruptType: 'portfolio-manager-setup-request',
          },
        },
      },
    });

    expect(projected?.thread.artifacts).toEqual({
      current: {
        artifactId: 'artifact-current',
        data: {
          type: 'lifecycle-status',
          phase: 'onboarding',
        },
      },
      activity: {
        artifactId: 'artifact-hidden-interrupt',
        data: {
          type: 'interrupt-status',
          status: 'pending',
          surfacedInThread: false,
          interruptType: 'portfolio-manager-setup-request',
        },
      },
    });
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

  it('merges partial domain projection payloads onto the previous projected state', () => {
    const previous = projectDetailStateFromPayload({
      projected: {
        managedMandate: {
          mandateRef: 'mandate-1',
          summary: {
            riskLevel: 'medium',
          },
        },
      },
    });

    const projected = projectDetailStateFromPayload(
      {
        projected: {
          managedMandate: {
            summary: {
              status: 'active',
            },
          },
        },
      },
      previous,
    );

    expect(projected?.thread.domainProjection).toEqual({
      managedMandate: {
        mandateRef: 'mandate-1',
        summary: {
          riskLevel: 'medium',
          status: 'active',
        },
      },
    });
  });

  it('ignores legacy top-level settings and thread.domainProjection runtime payload shapes', () => {
    const previous = projectDetailStateFromPayload({
      shared: {
        settings: {
          amount: 456,
        },
      },
      projected: {
        managedMandate: {
          summary: {
            status: 'active',
          },
        },
      },
    });

    const projected = projectDetailStateFromPayload(
      {
        settings: {
          amount: 999,
        },
        thread: {
          domainProjection: {
            managedMandate: {
              summary: {
                status: 'stale-legacy-shape',
              },
            },
          },
        },
      },
      previous,
    );

    expect(projected?.settings.amount).toBe(456);
    expect(projected?.thread.domainProjection).toEqual({
      managedMandate: {
        summary: {
          status: 'active',
        },
      },
    });
  });

  it('ignores state-embedded transcript payloads in runtime snapshots and deltas', () => {
    const previous = projectDetailStateFromPayload({
      shared: {
        settings: {
          amount: 123,
        },
      },
    });

    previous!.messages = [
      {
        id: 'message-1',
        role: 'assistant',
        content: 'Canonical transcript event',
      },
    ];

    const projected = projectDetailStateFromPayload(
      {
        messages: [
          {
            id: 'legacy-top-level-message',
            role: 'assistant',
            content: 'Legacy top-level message payload',
          },
        ],
        thread: {
          messages: [
            {
              id: 'legacy-thread-message',
              role: 'assistant',
              content: 'Legacy thread message payload',
            },
          ],
        },
      },
      previous,
    );

    expect(projected?.messages).toEqual(previous?.messages);
    expect((projected?.thread as Record<string, unknown> | undefined)?.messages).toBeUndefined();
  });

  it('hydrates legacy web-facing settings and domain projection from canonical shared/projected payloads', () => {
    const projected = projectDetailStateFromPayload({
      shared: {
        settings: {
          amount: 456,
        },
      },
      projected: {
        managedMandate: {
          summary: {
            status: 'active',
          },
        },
      },
      thread: {
        setupComplete: true,
      },
    });

    expect(projected).not.toBeNull();
    expect(projected?.thread.setupComplete).toBe(true);
    expect(projected?.settings.amount).toBe(456);
    expect(projected?.thread.domainProjection).toEqual({
      managedMandate: {
        summary: {
          status: 'active',
        },
      },
    });
  });
});

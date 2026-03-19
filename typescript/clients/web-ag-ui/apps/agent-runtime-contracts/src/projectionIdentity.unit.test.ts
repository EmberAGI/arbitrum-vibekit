import { describe, expect, it } from 'vitest';

import { assertProjectionIdentityTransition, buildProjectionIdentitySnapshot } from './index.js';

describe('projectionIdentity', () => {
  it('projects canonical Pi thread and execution ids into AG-UI and A2A views without minting new durable ids', () => {
    const projection = buildProjectionIdentitySnapshot({
      threadId: 'pi-thread-123',
      executionId: 'pi-execution-456',
    });

    expect(projection.canonical.threadId).toBe('pi-thread-123');
    expect(projection.canonical.executionId).toBe('pi-execution-456');

    expect(projection.agUi).toEqual({
      threadId: 'pi-thread-123',
      taskId: 'pi-execution-456',
    });
    expect(projection.a2a).toEqual({
      contextId: 'pi-thread-123',
      taskId: 'pi-execution-456',
    });
    expect(projection.channel).toEqual({
      threadId: 'pi-thread-123',
      executionId: 'pi-execution-456',
    });
  });

  it('preserves thread continuity across replay or restart while allowing a new execution identity', () => {
    const beforeRestart = buildProjectionIdentitySnapshot({
      threadId: 'pi-thread-123',
      executionId: 'pi-execution-456',
    });
    const afterRestart = buildProjectionIdentitySnapshot({
      threadId: 'pi-thread-123',
      executionId: 'pi-execution-789',
    });

    expect(afterRestart.agUi.threadId).toBe(beforeRestart.agUi.threadId);
    expect(afterRestart.a2a.contextId).toBe(beforeRestart.a2a.contextId);

    expect(afterRestart.agUi.taskId).not.toBe(beforeRestart.agUi.taskId);
    expect(afterRestart.a2a.taskId).not.toBe(beforeRestart.a2a.taskId);
    expect(afterRestart.channel.executionId).toBe('pi-execution-789');
  });

  it('keeps automation ids attached as provenance without promoting them into task identity', () => {
    const projection = buildProjectionIdentitySnapshot({
      threadId: 'pi-thread-123',
      executionId: 'pi-execution-456',
      automationId: 'pi-automation-222',
      automationRunId: 'automation-run-333',
    });

    expect(projection.canonical.automationId).toBe('pi-automation-222');
    expect(projection.canonical.automationRunId).toBe('automation-run-333');
    expect(projection.channel.automationId).toBe('pi-automation-222');
    expect(projection.channel.automationRunId).toBe('automation-run-333');

    expect(projection.agUi.taskId).toBe('pi-execution-456');
    expect(projection.a2a.taskId).toBe('pi-execution-456');
  });

  it('rejects blank canonical ids', () => {
    expect(() =>
      buildProjectionIdentitySnapshot({
        threadId: '   ',
        executionId: 'pi-execution-456',
      }),
    ).toThrow("Projection identity requires a non-empty 'threadId'.");

    expect(() =>
      buildProjectionIdentitySnapshot({
        threadId: 'pi-thread-123',
        executionId: '',
      }),
    ).toThrow("Projection identity requires a non-empty 'executionId'.");
  });

  it('rejects duplicate canonical ids across distinct durable record types', () => {
    expect(() =>
      buildProjectionIdentitySnapshot({
        threadId: 'shared-id',
        executionId: 'shared-id',
      }),
    ).toThrow("Projection identity requires distinct canonical ids for 'threadId' and 'executionId'.");

    expect(() =>
      buildProjectionIdentitySnapshot({
        threadId: 'pi-thread-123',
        executionId: 'pi-execution-456',
        automationId: 'pi-automation-222',
        automationRunId: 'pi-execution-456',
      }),
    ).toThrow(
      "Projection identity requires distinct canonical ids for 'executionId' and 'automationRunId'.",
    );
  });

  it('requires automation provenance to be complete when automationRunId is present', () => {
    expect(() =>
      buildProjectionIdentitySnapshot({
        threadId: 'pi-thread-123',
        executionId: 'pi-execution-456',
        automationRunId: 'automation-run-333',
      }),
    ).toThrow("Projection identity requires 'automationId' when 'automationRunId' is present.");
  });
});

describe('projectionIdentity transitions', () => {
  it('accepts replay transitions only when thread and execution identity both remain stable', () => {
    const previous = buildProjectionIdentitySnapshot({
      threadId: 'pi-thread-123',
      executionId: 'pi-execution-456',
    });
    const next = buildProjectionIdentitySnapshot({
      threadId: 'pi-thread-123',
      executionId: 'pi-execution-456',
    });

    expect(() =>
      assertProjectionIdentityTransition({
        previous,
        next,
        mode: 'replay',
      }),
    ).not.toThrow();
  });

  it('rejects replay transitions that mint a new execution identity', () => {
    const previous = buildProjectionIdentitySnapshot({
      threadId: 'pi-thread-123',
      executionId: 'pi-execution-456',
    });
    const next = buildProjectionIdentitySnapshot({
      threadId: 'pi-thread-123',
      executionId: 'pi-execution-789',
    });

    expect(() =>
      assertProjectionIdentityTransition({
        previous,
        next,
        mode: 'replay',
      }),
    ).toThrow("Replay must preserve the canonical 'executionId' across projections.");
  });

  it('accepts restart transitions when thread identity is preserved and execution identity changes', () => {
    const previous = buildProjectionIdentitySnapshot({
      threadId: 'pi-thread-123',
      executionId: 'pi-execution-456',
    });
    const next = buildProjectionIdentitySnapshot({
      threadId: 'pi-thread-123',
      executionId: 'pi-execution-789',
    });

    expect(() =>
      assertProjectionIdentityTransition({
        previous,
        next,
        mode: 'restart',
      }),
    ).not.toThrow();
  });

  it('rejects restart transitions that change the root thread identity', () => {
    const previous = buildProjectionIdentitySnapshot({
      threadId: 'pi-thread-123',
      executionId: 'pi-execution-456',
    });
    const next = buildProjectionIdentitySnapshot({
      threadId: 'pi-thread-999',
      executionId: 'pi-execution-789',
    });

    expect(() =>
      assertProjectionIdentityTransition({
        previous,
        next,
        mode: 'restart',
      }),
    ).toThrow("Restart must preserve the canonical 'threadId' across projections.");
  });
});

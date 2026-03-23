import type { LoadedPiRuntimeInspectionState } from 'agent-runtime';
import { describe, expect, it, vi } from 'vitest';

import { runPiExampleAutomationSchedulerTick } from './automationScheduler.js';
import { createPiExampleRuntimeStateStore } from './runtimeState.js';

function buildInspectionState(): LoadedPiRuntimeInspectionState {
  return {
    threads: [
      {
        threadId: 'thread-uuid-1',
        threadKey: 'thread-1',
        status: 'active',
        threadState: { threadId: 'thread-1' },
        createdAt: new Date('2026-03-23T02:50:00.000Z'),
        updatedAt: new Date('2026-03-23T02:55:00.000Z'),
      },
    ],
    executions: [
      {
        executionId: 'exec-1',
        threadId: 'thread-uuid-1',
        automationRunId: 'run-1',
        status: 'queued',
        source: 'automation',
        currentInterruptId: null,
        createdAt: new Date('2026-03-23T02:55:00.000Z'),
        updatedAt: new Date('2026-03-23T02:55:00.000Z'),
        completedAt: null,
      },
    ],
    automations: [
      {
        automationId: 'auto-1',
        threadId: 'thread-uuid-1',
        commandName: 'sync',
        cadence: 'interval',
        schedulePayload: { command: 'sync', minutes: 5 },
        suspended: false,
        nextRunAt: new Date('2026-03-23T02:59:00.000Z'),
        createdAt: new Date('2026-03-23T02:50:00.000Z'),
        updatedAt: new Date('2026-03-23T02:55:00.000Z'),
      },
    ],
    automationRuns: [
      {
        runId: 'run-1',
        automationId: 'auto-1',
        threadId: 'thread-uuid-1',
        executionId: 'exec-1',
        status: 'scheduled',
        scheduledAt: new Date('2026-03-23T02:55:00.000Z'),
        startedAt: null,
        completedAt: null,
      },
    ],
    interrupts: [],
    leases: [],
    outboxIntents: [],
    executionEvents: [],
    threadActivities: [],
  };
}

describe('runPiExampleAutomationSchedulerTick', () => {
  it('completes due automations, schedules the next recurrence, and updates runtime-state artifacts', async () => {
    const runtimeState = createPiExampleRuntimeStateStore();
    const executeStatements = vi.fn(async () => undefined);

    const result = await runPiExampleAutomationSchedulerTick({
      databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
      loadInspectionState: async () => buildInspectionState(),
      executeStatements,
      runtimeState,
      now: () => new Date('2026-03-23T03:00:00.000Z'),
    });

    expect(result).toEqual({
      executedAutomationIds: ['auto-1'],
    });
    expect(executeStatements).toHaveBeenCalledWith(
      'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
      expect.arrayContaining([
        expect.objectContaining({ tableName: 'pi_automation_runs' }),
        expect.objectContaining({ tableName: 'pi_executions' }),
        expect.objectContaining({ tableName: 'pi_automations' }),
        expect.objectContaining({ tableName: 'pi_execution_events' }),
        expect.objectContaining({ tableName: 'pi_thread_activity' }),
      ]),
    );

    expect(runtimeState.getSession('thread-1')).toMatchObject({
      execution: {
        status: 'completed',
        statusMessage: 'Automation sync executed successfully.',
      },
      automation: {
        id: 'auto-1',
      },
      artifacts: {
        current: {
          data: {
            type: 'automation-status',
            status: 'completed',
            command: 'sync',
          },
        },
      },
      a2ui: {
        kind: 'automation-status',
        payload: {
          status: 'completed',
          command: 'sync',
          cadenceMinutes: 5,
        },
      },
    });
  });
});

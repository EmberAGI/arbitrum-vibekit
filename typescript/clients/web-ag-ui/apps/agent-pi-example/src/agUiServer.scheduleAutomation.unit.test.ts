import type * as AgentRuntimeModule from 'agent-runtime';
import { describe, expect, it, vi } from 'vitest';

const executePostgresStatementsMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('agent-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof AgentRuntimeModule>();
  return {
    ...actual,
    executePostgresStatements: executePostgresStatementsMock,
  };
});

import { createPiExampleGatewayService } from './agUiServer.js';

async function collectEventSource<T>(source: readonly T[] | AsyncIterable<T>): Promise<T[]> {
  if (Array.isArray(source)) {
    return [...source];
  }

  const events: T[] = [];
  for await (const event of source) {
    events.push(event);
  }

  return events;
}

function requireStatement(
  statements: Array<{
    tableName: string;
    text: string;
    values: readonly unknown[];
  }>,
  tableName: string,
): {
  tableName: string;
  text: string;
  values: readonly unknown[];
} {
  const statement = statements.find((candidate) => candidate.tableName === tableName);
  if (!statement) {
    throw new Error(`Missing expected statement for ${tableName}`);
  }
  return statement;
}

describe('createPiExampleGatewayService schedule persistence', () => {
  it('creates a fresh automation run and execution for each repeated schedule in the same thread', async () => {
    executePostgresStatementsMock.mockClear();

    const service = createPiExampleGatewayService({
      env: {
        PI_AGENT_EXTERNAL_BOUNDARY_MODE: 'mocked',
      },
      persistence: {
        ensureReady: async () => undefined,
        persistDirectExecution: async () => undefined,
        loadInspectionState: async () => ({
          threads: [],
          executions: [],
          automations: [],
          automationRuns: [],
          interrupts: [],
          leases: [],
          outboxIntents: [],
          executionEvents: [],
          threadActivities: [],
        }),
      },
    });

    await collectEventSource(
      await service.run({
        threadId: 'thread-1',
        runId: 'run-1',
        messages: [
          {
            id: 'message-1',
            role: 'user',
            content: 'Schedule a sync every minute.',
          },
        ],
      }),
    );

    await collectEventSource(
      await service.run({
        threadId: 'thread-1',
        runId: 'run-2',
        messages: [
          {
            id: 'message-2',
            role: 'user',
            content: 'Schedule a sync every minute again.',
          },
        ],
      }),
    );

    expect(executePostgresStatementsMock).toHaveBeenCalledTimes(2);

    const firstStatements = executePostgresStatementsMock.mock.calls[0]?.[1] as Array<{
      tableName: string;
      text: string;
      values: readonly unknown[];
    }>;
    const secondStatements = executePostgresStatementsMock.mock.calls[1]?.[1] as Array<{
      tableName: string;
      text: string;
      values: readonly unknown[];
    }>;

    const firstAutomation = requireStatement(firstStatements, 'pi_automations');
    const secondAutomation = requireStatement(secondStatements, 'pi_automations');
    const firstRun = requireStatement(firstStatements, 'pi_automation_runs');
    const secondRun = requireStatement(secondStatements, 'pi_automation_runs');
    const firstExecution = requireStatement(firstStatements, 'pi_executions');
    const secondExecution = requireStatement(secondStatements, 'pi_executions');

    expect(firstAutomation.values[0]).toBe(secondAutomation.values[0]);
    expect(firstRun.values[0]).not.toBe(secondRun.values[0]);
    expect(firstExecution.values[0]).not.toBe(secondExecution.values[0]);
  });
});

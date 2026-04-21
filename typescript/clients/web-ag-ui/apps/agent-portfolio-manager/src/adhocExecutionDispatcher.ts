import { createHash, randomUUID } from 'node:crypto';

import { createAgentRuntimeHttpAgent } from 'agent-runtime';

const HIDDEN_EXECUTION_WORKER_AGENT_ID = 'agent-ember-lending';
const DEFAULT_HIDDEN_EXECUTION_WORKER_RUNTIME_URL = 'http://127.0.0.1:3430/ag-ui';

type AdhocExecutionQuantity =
  | {
      kind: 'exact';
      value: string;
    }
  | {
      kind: 'percent';
      value: number;
    };

export type PortfolioManagerAdhocExecutionRequest = {
  control_path: 'lending.supply' | 'lending.withdraw' | 'lending.borrow' | 'lending.repay';
  asset: string;
  protocol_system: string;
  network: string;
  quantity: AdhocExecutionQuantity;
};

export type PortfolioManagerAdhocExecutionDispatcherInput = {
  pmThreadId: string;
  instruction: string;
  request: PortfolioManagerAdhocExecutionRequest;
  reservationConflictHandling: string | null;
};

type ObservableLike<T> = {
  subscribe: (observer: {
    next?: (value: T) => void;
    error?: (error: unknown) => void;
    complete?: () => void;
  }) => { unsubscribe?: () => void } | void;
};

type RuntimeEvent = {
  type?: string;
  snapshot?: unknown;
};

type RuntimeHttpAgent = ReturnType<typeof createAgentRuntimeHttpAgent>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readTaskStatusMessage(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }

  if (!isRecord(value)) {
    return null;
  }

  return readString(value['content']);
}

function deriveHiddenWorkerThreadId(pmThreadId: string): string {
  const digest = createHash('sha256').update(pmThreadId).digest('hex');
  return `pm-hidden-worker-${digest.slice(0, 24)}`;
}

async function collectRuntimeEvents(stream: ObservableLike<RuntimeEvent>): Promise<RuntimeEvent[]> {
  return await new Promise<RuntimeEvent[]>((resolve, reject) => {
    const events: RuntimeEvent[] = [];
    stream.subscribe({
      next: (event) => {
        events.push(event);
      },
      error: reject,
      complete: () => {
        resolve(events);
      },
    });
  });
}

function readLatestSnapshot(events: readonly RuntimeEvent[]): Record<string, unknown> | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === 'STATE_SNAPSHOT' && isRecord(event.snapshot)) {
      return event.snapshot;
    }
  }

  return null;
}

async function readFirstConnectSnapshot(input: {
  agent: RuntimeHttpAgent;
  threadId: string;
}): Promise<Record<string, unknown> | null> {
  return await new Promise<Record<string, unknown> | null>((resolve) => {
    const subscription = input.agent
      .connect({
        threadId: input.threadId,
        runId: randomUUID(),
        messages: [],
        state: {},
        tools: [],
        context: [],
      })
      .subscribe({
        next: (event: RuntimeEvent) => {
          if (event.type === 'STATE_SNAPSHOT' && isRecord(event.snapshot)) {
            subscription?.unsubscribe?.();
            resolve(event.snapshot);
          }
        },
        error: () => {
          resolve(null);
        },
        complete: () => {
          resolve(null);
        },
      });
  });
}

function readFailureMessage(snapshot: Record<string, unknown> | null): string | null {
  const thread = isRecord(snapshot?.['thread']) ? snapshot['thread'] : null;
  const task = isRecord(thread?.['task']) ? thread['task'] : null;
  const taskStatus = isRecord(task?.['taskStatus']) ? task['taskStatus'] : null;
  const execution = isRecord(thread?.['execution']) ? thread['execution'] : null;
  const taskState = readString(taskStatus?.['state']);
  const executionStatus = readString(execution?.['status']);
  const statusMessage = readTaskStatusMessage(taskStatus?.['message']);
  const executionStatusMessage = readString(execution?.['statusMessage']);
  const executionError = readString(thread?.['executionError']);
  const haltReason = readString(thread?.['haltReason']);

  if (
    taskState === 'failed' ||
    taskState === 'canceled' ||
    executionStatus === 'failed' ||
    executionStatus === 'canceled' ||
    executionError ||
    haltReason
  ) {
    return (
      executionError ??
      haltReason ??
      executionStatusMessage ??
      statusMessage ??
      'Hidden execution worker command failed.'
    );
  }

  return null;
}

async function runNamedCommand(input: {
  agent: RuntimeHttpAgent;
  threadId: string;
  name: string;
  commandInput?: unknown;
}): Promise<void> {
  const events = await collectRuntimeEvents(
    input.agent.run({
      threadId: input.threadId,
      runId: randomUUID(),
      messages: [],
      state: {},
      tools: [],
      context: [],
      forwardedProps: {
        command: {
          name: input.name,
          ...(input.commandInput !== undefined ? { input: input.commandInput } : {}),
        },
      },
    }),
  );
  const snapshot = readLatestSnapshot(events) ?? (await readFirstConnectSnapshot(input));
  const failureMessage = readFailureMessage(snapshot);
  if (failureMessage) {
    throw new Error(failureMessage);
  }
}

export function resolvePortfolioManagerHiddenExecutorRuntimeUrl(
  env:
    | NodeJS.ProcessEnv
    | {
        EMBER_LENDING_AGENT_DEPLOYMENT_URL?: string;
      } = process.env,
): string {
  return (
    env.EMBER_LENDING_AGENT_DEPLOYMENT_URL?.trim() || DEFAULT_HIDDEN_EXECUTION_WORKER_RUNTIME_URL
  );
}

export function createPortfolioManagerAdhocExecutionDispatcher(input: {
  runtimeUrl: string;
  createHttpAgent?: typeof createAgentRuntimeHttpAgent;
  createWorkerThreadId?: (pmThreadId: string) => string;
}) {
  const createHttpAgent = input.createHttpAgent ?? createAgentRuntimeHttpAgent;
  const createWorkerThreadId = input.createWorkerThreadId ?? deriveHiddenWorkerThreadId;

  return async (dispatch: PortfolioManagerAdhocExecutionDispatcherInput) => {
    const workerThreadId = createWorkerThreadId(dispatch.pmThreadId);
    const agent = createHttpAgent({
      agentId: HIDDEN_EXECUTION_WORKER_AGENT_ID,
      runtimeUrl: input.runtimeUrl,
    });

    await runNamedCommand({
      agent,
      threadId: workerThreadId,
      name: 'create_transaction',
      commandInput: dispatch.request,
    });
    await runNamedCommand({
      agent,
      threadId: workerThreadId,
      name: 'request_execution',
    });

    return {
      status: {
        executionStatus: 'completed' as const,
        statusMessage: 'Adhoc execution dispatched through the hidden execution worker.',
      },
      artifacts: [
        {
          data: {
            type: 'pm-hidden-execution-dispatch',
            workerAgentId: HIDDEN_EXECUTION_WORKER_AGENT_ID,
            workerThreadId,
            instruction: dispatch.instruction,
            request: dispatch.request,
            reservationConflictHandling: dispatch.reservationConflictHandling,
          },
        },
      ],
    };
  };
}

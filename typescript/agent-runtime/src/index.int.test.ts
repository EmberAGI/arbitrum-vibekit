import { EventType } from '@ag-ui/core';
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Message,
  type Model,
} from '@mariozechner/pi-ai';
import { describe, expect, it, vi } from 'vitest';

import {
  AGENT_RUNTIME_AUTOMATION_CANCEL_TOOL,
  AGENT_RUNTIME_DOMAIN_COMMAND_TOOL,
  AGENT_RUNTIME_REQUEST_OPERATOR_INPUT_TOOL,
  type AgentRuntimeService,
  createAgentRuntime,
} from './index.js';

type GatewayEvent = Awaited<ReturnType<AgentRuntimeService['run']>> extends
  | readonly (infer TEvent)[]
  | AsyncIterable<infer TEvent>
  ? TEvent
  : never;
type RunStartedEvent = Extract<GatewayEvent, { type: 'RUN_STARTED' }>;
type StateSnapshotEvent = Extract<GatewayEvent, { snapshot: unknown }>;
type StateDeltaEvent = Extract<GatewayEvent, { delta: unknown }>;
type MessagesSnapshotEvent = Extract<GatewayEvent, { messages: unknown }>;
type InternalPostgresStatement = {
  tableName: string;
  text: string;
  values: readonly unknown[];
  requiredAffectedRows?: number;
};
type InternalPersistDirectExecutionOptions = {
  threadId: string;
  threadKey: string;
  threadState: Record<string, unknown>;
  executionId: string;
  now: Date;
};
type PersistedThreadRecord = {
  threadId: string;
  threadKey: string;
  status: string;
  threadState: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};
type PersistedExecutionRecord = {
  executionId: string;
  threadId: string;
  automationRunId: string | null;
  status: string;
  source: string;
  currentInterruptId: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};
type PersistedInterruptRecord = {
  interruptId: string;
  threadId: string;
  executionId: string;
  status: 'pending' | 'resolved';
  mirroredToActivity: boolean;
  createdAt: Date;
  resolvedAt: Date | null;
};

type LifecycleState = {
  phase: string;
  onboardingStep: string | null;
  operatorNote: string | null;
};

type LifecycleContext = {
  threadId: string;
  state?: LifecycleState;
};

function createModel(id: string): Model<'openai-responses'> {
  return {
    id,
    name: id,
    api: 'openai-responses',
    provider: 'openai',
    baseUrl: 'https://example.invalid',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 2048,
  };
}

function createInternalPostgresHooks(
  overrides: Partial<{
    databaseUrl: string;
    loadInspectionState: (options: { databaseUrl: string }) => Promise<{
      threads: unknown[];
      executions: unknown[];
      automations: unknown[];
      automationRuns: unknown[];
      interrupts: unknown[];
      leases: unknown[];
      outboxIntents: unknown[];
      executionEvents: unknown[];
      threadActivities: unknown[];
      artifacts?: unknown[];
    }>;
    executeStatements: (
      databaseUrl: string,
      statements: readonly InternalPostgresStatement[],
    ) => Promise<void>;
    persistDirectExecution: (options: unknown) => Promise<void>;
  }> = {},
) {
  const databaseUrl = overrides.databaseUrl ?? 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime';
  const ensureReady = vi.fn(async (options?: { env?: { DATABASE_URL?: string } }) => ({
    bootstrapPlan: options?.env?.DATABASE_URL
      ? {
          mode: 'external' as const,
          databaseUrl: options.env.DATABASE_URL,
          startCommand: null,
        }
      : {
          mode: 'local-docker' as const,
          databaseUrl,
          startCommand: 'docker run --name pi-runtime-postgres ...',
        },
    databaseUrl: options?.env?.DATABASE_URL ?? databaseUrl,
    startedLocalDocker: !options?.env?.DATABASE_URL,
  }));
  const loadInspectionState =
    overrides.loadInspectionState ??
    vi.fn(async () => ({
      threads: [],
      executions: [],
      automations: [],
      automationRuns: [],
      interrupts: [],
      leases: [],
      outboxIntents: [],
      executionEvents: [],
      threadActivities: [],
      artifacts: [],
    }));
  const executeStatements = overrides.executeStatements ?? vi.fn(async () => undefined);
  const persistDirectExecution = overrides.persistDirectExecution ?? vi.fn(async () => undefined);

  return {
    ensureReady,
    loadInspectionState,
    executeStatements,
    persistDirectExecution,
  };
}

function createPersistingInternalPostgres() {
  const persistedThreads = new Map<string, PersistedThreadRecord>();
  const persistedExecutions = new Map<string, PersistedExecutionRecord>();
  const persistedInterrupts = new Map<string, PersistedInterruptRecord>();
  const loadInspectionState = vi.fn(async () => ({
    threads: [...persistedThreads.values()],
    executions: [...persistedExecutions.values()],
    automations: [],
    automationRuns: [],
    interrupts: [...persistedInterrupts.values()],
    leases: [],
    outboxIntents: [],
    executionEvents: [],
    threadActivities: [],
    artifacts: [],
  }));
  const persistDirectExecution = vi.fn(async (options: unknown) => {
    const params = options as InternalPersistDirectExecutionOptions;
    persistedThreads.set(params.threadKey, {
      threadId: params.threadId,
      threadKey: params.threadKey,
      status: 'active',
      threadState: params.threadState,
      createdAt: params.now,
      updatedAt: params.now,
    });
    persistedExecutions.set(params.executionId, {
      executionId: params.executionId,
      threadId: params.threadId,
      automationRunId: null,
      status: 'working',
      source: 'user',
      currentInterruptId: null,
      createdAt: params.now,
      updatedAt: params.now,
      completedAt: null,
    });
  });
  const executeStatements = vi.fn(
    async (_databaseUrl: string, statements: readonly InternalPostgresStatement[]) => {
      for (const statement of statements) {
        if (statement.tableName === 'pi_threads') {
          const [threadId, threadKey, status, threadStateValue, createdAt, updatedAt] = statement.values;
          persistedThreads.set(threadKey as string, {
            threadId: threadId as string,
            threadKey: threadKey as string,
            status: status as string,
            threadState:
              typeof threadStateValue === 'string'
                ? (JSON.parse(threadStateValue) as Record<string, unknown>)
                : (threadStateValue as Record<string, unknown>),
            createdAt: createdAt as Date,
            updatedAt: updatedAt as Date,
          });
          continue;
        }

        if (statement.tableName === 'pi_executions') {
          if (statement.text.startsWith('insert into pi_executions')) {
            const [
              executionId,
              threadId,
              automationRunId,
              status,
              source,
              currentInterruptId,
              createdAt,
              updatedAt,
              completedAt,
            ] = statement.values;
            const existing = persistedExecutions.get(executionId as string);
            persistedExecutions.set(executionId as string, {
              executionId: executionId as string,
              threadId: threadId as string,
              automationRunId: (automationRunId as string | null) ?? existing?.automationRunId ?? null,
              status: status as string,
              source: source as string,
              currentInterruptId: (currentInterruptId as string | null) ?? null,
              createdAt: (existing?.createdAt ?? createdAt) as Date,
              updatedAt: updatedAt as Date,
              completedAt: (completedAt as Date | null) ?? null,
            });
          } else if (statement.text.startsWith('update pi_executions')) {
            const [status, updatedAt, completedAt, executionId] = statement.values;
            const existing = persistedExecutions.get(executionId as string);
            if (existing) {
              persistedExecutions.set(executionId as string, {
                ...existing,
                status: status as string,
                updatedAt: updatedAt as Date,
                completedAt: (completedAt as Date | null) ?? null,
              });
            }
          }
          continue;
        }

        if (statement.tableName === 'pi_interrupts') {
          if (statement.text.startsWith('insert into pi_interrupts')) {
            const [
              interruptId,
              threadId,
              executionId,
              _interruptType,
              status,
              mirroredToActivity,
              _requestPayload,
              createdAt,
            ] = statement.values;
            persistedInterrupts.set(interruptId as string, {
              interruptId: interruptId as string,
              threadId: threadId as string,
              executionId: executionId as string,
              status: status as 'pending' | 'resolved',
              mirroredToActivity: mirroredToActivity as boolean,
              createdAt: createdAt as Date,
              resolvedAt: null,
            });
          } else if (statement.text.startsWith('update pi_interrupts')) {
            const [status, resolvedAt, executionId, currentInterruptId] = statement.values;
            for (const [interruptId, interrupt] of persistedInterrupts.entries()) {
              if (interrupt.executionId !== (executionId as string)) {
                continue;
              }
              if (interrupt.status !== 'pending') {
                continue;
              }
              if (typeof currentInterruptId === 'string' && interruptId === currentInterruptId) {
                continue;
              }
              persistedInterrupts.set(interruptId, {
                ...interrupt,
                status: status as 'pending' | 'resolved',
                resolvedAt: resolvedAt as Date,
              });
            }
          }
          continue;
        }
      }
    },
  );

  return {
    persistedThreads,
    persistedExecutions,
    persistedInterrupts,
    hooks: createInternalPostgresHooks({
      loadInspectionState,
      executeStatements,
      persistDirectExecution,
    }),
  };
}

function createUsage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function createAssistantMessage(params: {
  content: AssistantMessage['content'];
  stopReason: 'stop' | 'toolUse';
}): AssistantMessage {
  return {
    role: 'assistant',
    content: params.content,
    api: 'openai-responses',
    provider: 'openai',
    model: 'mock-model',
    usage: createUsage(),
    stopReason: params.stopReason,
    timestamp: Date.now(),
  };
}

function createToolStream(params: {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
}) {
  const stream = createAssistantMessageEventStream();

  queueMicrotask(() => {
    const message = createAssistantMessage({
      content: [
        {
          type: 'toolCall',
          id: params.toolCallId,
          name: params.toolName,
          arguments: params.args,
        },
      ],
      stopReason: 'toolUse',
    });
    const argsJson = JSON.stringify(params.args);

    stream.push({
      type: 'start',
      partial: createAssistantMessage({
        content: [],
        stopReason: 'toolUse',
      }),
    });
    stream.push({ type: 'toolcall_start', contentIndex: 0, partial: message });
    stream.push({ type: 'toolcall_delta', contentIndex: 0, delta: argsJson, partial: message });
    stream.push({
      type: 'toolcall_end',
      contentIndex: 0,
      toolCall: {
        type: 'toolCall',
        id: params.toolCallId,
        name: params.toolName,
        arguments: params.args,
      },
      partial: message,
    });
    stream.push({ type: 'done', reason: 'toolUse', message });
  });

  return stream;
}

function createTextStream(text: string) {
  const stream = createAssistantMessageEventStream();

  queueMicrotask(() => {
    const message = createAssistantMessage({
      content: [{ type: 'text', text }],
      stopReason: 'stop',
    });

    stream.push({
      type: 'start',
      partial: createAssistantMessage({
        content: [],
        stopReason: 'stop',
      }),
    });
    stream.push({ type: 'text_start', contentIndex: 0, partial: message });
    stream.push({ type: 'text_delta', contentIndex: 0, delta: text, partial: message });
    stream.push({ type: 'text_end', contentIndex: 0, content: text, partial: message });
    stream.push({ type: 'done', reason: 'stop', message });
  });

  return stream;
}

function createNeverEndingStream(): AsyncIterable<never> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<never> {
      return {
        async next(): Promise<IteratorResult<never>> {
          return await new Promise<IteratorResult<never>>(() => undefined);
        },
      };
    },
  };
}

async function collectEventSource<T>(source: readonly T[] | AsyncIterable<T>): Promise<T[]> {
  if (Array.isArray(source)) {
    return Array.from(source);
  }

  const events: T[] = [];
  for await (const event of source) {
    events.push(event);
  }
  return events;
}

async function collectEventSourceUntilFailure<T>(source: readonly T[] | AsyncIterable<T>): Promise<{
  events: T[];
  error: Error | null;
}> {
  if (Array.isArray(source)) {
    return {
      events: Array.from(source),
      error: null,
    };
  }

  const events: T[] = [];
  const iterator = source[Symbol.asyncIterator]();

  while (true) {
    try {
      const result = await iterator.next();
      if (result.done) {
        return { events, error: null };
      }
      events.push(result.value);
    } catch (error) {
      return {
        events,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
}

async function collectQueuedEvents<T>(
  source: readonly T[] | AsyncIterable<T>,
  timeoutMs = 25,
  initialTimeoutMs = 250,
): Promise<T[]> {
  if (Array.isArray(source)) {
    return Array.from(source);
  }

  const events: T[] = [];
  const iterator = source[Symbol.asyncIterator]();
  let hasSeenEvent = false;

  try {
    while (true) {
      const activeTimeoutMs = hasSeenEvent ? timeoutMs : Math.max(timeoutMs, initialTimeoutMs);
      const result = await Promise.race([
        iterator.next(),
        new Promise<'timeout'>((resolve) => {
          setTimeout(() => resolve('timeout'), activeTimeoutMs);
        }),
      ]);

      if (result === 'timeout' || result.done) {
        break;
      }

      hasSeenEvent = true;
      events.push(result.value);
    }
  } finally {
    await iterator.return?.();
  }

  return events;
}

async function readFirstMatchingEvent<T>(
  source: readonly T[] | AsyncIterable<T>,
  predicate: (event: T) => boolean,
): Promise<T | undefined> {
  if (Array.isArray(source)) {
    return source.find(predicate);
  }

  const iterator = source[Symbol.asyncIterator]();
  try {
    while (true) {
      const result = await iterator.next();
      if (result.done) {
        return undefined;
      }

      if (predicate(result.value)) {
        return result.value;
      }
    }
  } finally {
    await iterator.return?.();
  }
}

function isStateSnapshotEvent(event: GatewayEvent): event is StateSnapshotEvent {
  return typeof event === 'object' && event !== null && 'snapshot' in event;
}

function isStateDeltaEvent(event: GatewayEvent): event is StateDeltaEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'type' in event &&
    event.type === EventType.STATE_DELTA &&
    'delta' in event
  );
}

function findStateSnapshotEvent(
  events: readonly GatewayEvent[],
  predicate: (event: StateSnapshotEvent) => boolean,
): StateSnapshotEvent | undefined {
  return events.filter(isStateSnapshotEvent).find(predicate);
}

function isMessagesSnapshotEvent(event: GatewayEvent): event is MessagesSnapshotEvent {
  return typeof event === 'object' && event !== null && 'messages' in event;
}

function isRunStartedEvent(event: GatewayEvent): event is RunStartedEvent {
  if (typeof event !== 'object' || event === null || !('type' in event)) {
    return false;
  }

  const candidateType = (event as { type?: unknown }).type;
  return typeof candidateType === 'string' && candidateType === 'RUN_STARTED';
}

function hasSystemPromptFragments(
  prompts: readonly string[],
  fragments: readonly string[],
): boolean {
  return prompts.some((prompt) => fragments.every((fragment) => prompt.includes(fragment)));
}

function createLifecycleDomain(options?: {
  mirroredToActivity?: boolean;
  projectSharedState?: (params: {
    sharedState: Record<string, unknown>;
    currentProjection?: Record<string, unknown>;
  }) => Record<string, unknown> | undefined;
}) {
  const phases = new Map<string, LifecycleState>();

  const getState = (threadId: string) =>
    phases.get(threadId) ?? {
      phase: 'prehire',
      onboardingStep: null,
      operatorNote: null,
    };
  const buildLifecycleDomainProjection = (state: LifecycleState) => ({
    managedLifecycle: {
      phase: state.phase,
      ...(state.onboardingStep ? { onboardingStep: state.onboardingStep } : {}),
      ...(state.operatorNote ? { operatorNote: state.operatorNote } : {}),
    },
  });

  return {
    lifecycle: {
      initialPhase: 'prehire',
      phases: ['prehire', 'onboarding', 'hired', 'fired'],
      terminalPhases: ['fired'],
      commands: [
        { name: 'hire', description: 'Start onboarding.' },
        { name: 'continue_onboarding', description: 'Capture onboarding input.' },
        { name: 'refresh_status', description: 'Refresh status without clearing the interrupt.' },
        { name: 'complete_onboarding', description: 'Finish onboarding.' },
        { name: 'fire', description: 'End the lifecycle.' },
      ],
      transitions: [
        {
          command: 'hire',
          from: ['prehire'],
          to: 'onboarding',
          description: 'Move into onboarding.',
          interrupt: 'operator-config',
        },
        {
          command: 'continue_onboarding',
          from: ['onboarding'],
          to: 'onboarding',
          description: 'Continue onboarding.',
        },
      ],
      interrupts: [
        {
          type: 'operator-config',
          description: 'Capture an operator note.',
          mirroredToActivity: options?.mirroredToActivity ?? true,
        },
      ],
    },
    systemContext: ({ threadId, state }: LifecycleContext) => {
      const currentState = state ?? getState(threadId);
      phases.set(threadId, currentState);
      return [`Lifecycle phase: ${currentState.phase}.`];
    },
    ...(options?.projectSharedState
      ? {
          projectSharedState: options.projectSharedState,
        }
      : {}),
    handleOperation: ({
      operation,
      threadId,
      state,
    }: {
      operation: { source: 'command' | 'tool' | 'interrupt'; name: string; input?: unknown };
      threadId: string;
      state?: LifecycleState;
    }) => {
      const current = state ?? getState(threadId);

      switch (operation.name) {
        case 'hire': {
          const nextState = {
            phase: 'onboarding',
            onboardingStep: 'operator-profile',
            operatorNote: null,
          };
          phases.set(threadId, nextState);
          return {
            state: nextState,
            domainProjectionUpdate: buildLifecycleDomainProjection(nextState),
            outputs: {
              status: {
                executionStatus: 'interrupted' as const,
                statusMessage: 'Please provide a short operator note to continue onboarding.',
              },
              interrupt: {
                type: 'operator-config',
                mirroredToActivity: options?.mirroredToActivity ?? true,
                message: 'Please provide a short operator note to continue onboarding.',
                payload: {
                  promptKind: 'text-note',
                  inputLabel: 'Operator note',
                  submitLabel: 'Continue agent loop',
                },
              },
            },
          };
        }
        case 'operator-config': {
          const operatorNote =
            typeof operation.input === 'object' &&
            operation.input !== null &&
            'operatorNote' in operation.input &&
            typeof operation.input.operatorNote === 'string'
              ? operation.input.operatorNote
              : current.operatorNote;
          const nextState = {
            phase: 'onboarding',
            onboardingStep: 'delegation-note',
            operatorNote: operatorNote ?? null,
          };
          phases.set(threadId, nextState);
          return {
            state: nextState,
            domainProjectionUpdate: buildLifecycleDomainProjection(nextState),
            outputs: {
              status: {
                executionStatus: 'working' as const,
                statusMessage: 'Operator note captured. Ready to complete onboarding.',
              },
              artifacts: [
                {
                  data: {
                    type: 'lifecycle-status',
                    phase: nextState.phase,
                    onboardingStep: nextState.onboardingStep,
                    operatorNote: nextState.operatorNote,
                  },
                },
              ],
            },
          };
        }
        case 'refresh_status': {
          phases.set(threadId, current);
          return {
            state: current,
            domainProjectionUpdate: buildLifecycleDomainProjection(current),
            outputs: {
              artifacts: [
                {
                  data: {
                    type: 'lifecycle-status',
                    phase: current.phase,
                    onboardingStep: current.onboardingStep,
                    operatorNote: current.operatorNote,
                  },
                },
              ],
            },
          };
        }
        case 'complete_onboarding': {
          const nextState = {
            phase: 'hired',
            onboardingStep: null,
            operatorNote: current.operatorNote,
          };
          phases.set(threadId, nextState);
          return {
            state: nextState,
            domainProjectionUpdate: buildLifecycleDomainProjection(nextState),
            outputs: {
              status: {
                executionStatus: 'completed' as const,
                statusMessage: 'Onboarding complete. Agent is now hired.',
              },
              artifacts: [
                {
                  data: {
                    type: 'lifecycle-status',
                    phase: nextState.phase,
                    operatorNote: nextState.operatorNote,
                  },
                },
              ],
            },
          };
        }
        case 'fire': {
          const nextState = {
            phase: 'fired',
            onboardingStep: null,
            operatorNote: current.operatorNote,
          };
          phases.set(threadId, nextState);
          return {
            state: nextState,
            domainProjectionUpdate: buildLifecycleDomainProjection(nextState),
            outputs: {
              status: {
                executionStatus: 'completed' as const,
                statusMessage: 'Agent moved to fired. Rehire is still available in this thread.',
              },
              artifacts: [
                {
                  data: {
                    type: 'lifecycle-status',
                    phase: nextState.phase,
                    operatorNote: nextState.operatorNote,
                  },
                },
              ],
            },
          };
        }
        default:
          return { state: current, outputs: {} };
      }
    },
  };
}

describe('agent-runtime integration', () => {
  it('waits longer for the first queued event before switching to idle drain timing', async () => {
    const delayedSource = {
      async *[Symbol.asyncIterator]() {
        await new Promise((resolve) => setTimeout(resolve, 50));
        yield { type: 'delayed-event' as const };
      },
    };

    const events = await collectQueuedEvents(delayedSource, 25, 100);

    expect(events).toEqual([{ type: 'delayed-event' }]);
  });

  it('normalizes tool-driven lifecycle commands and interrupt resumes through the full runtime-owned lifecycle', async () => {
    let latestUserText = '';
    const observedSystemPrompts: string[] = [];
    let observedDomainCommandToolDescription = '';
    let observedDomainCommandNames: string[] = [];
    let sawSyntheticDomainContextMessage = false;
    const { persistedThreads, hooks: internalPostgres } = createPersistingInternalPostgres();

    const domain = createLifecycleDomain();
    const runtime = await createAgentRuntime({
      model: createModel('int-model'),
      systemPrompt: 'You are a lifecycle agent.',
      domain,
      agentOptions: {
        streamFn: (_model, context) => {
          observedSystemPrompts.push(context.systemPrompt ?? '');
          const domainCommandTool = context.tools?.find(
            (tool) => tool.name === AGENT_RUNTIME_DOMAIN_COMMAND_TOOL,
          ) as
            | {
                description?: string;
                parameters?: {
                  properties?: {
                    name?: {
                      const?: string;
                      anyOf?: Array<{ const?: string }>;
                    };
                  };
                };
              }
            | undefined;
          observedDomainCommandToolDescription = domainCommandTool?.description ?? '';
          const nameSchema = domainCommandTool?.parameters?.properties?.name;
          observedDomainCommandNames =
            nameSchema?.anyOf?.flatMap((option) =>
              typeof option.const === 'string' ? [option.const] : [],
            ) ??
            (typeof nameSchema?.const === 'string' ? [nameSchema.const] : []);
          sawSyntheticDomainContextMessage = context.messages.some((message: Message) => {
            if (message.role !== 'user') {
              return false;
            }

            const text =
              typeof message.content === 'string'
                ? message.content
                : message.content
                    .filter((part) => part.type === 'text')
                    .map((part) => part.text)
                    .join(' ');
            return text.includes('<agent-runtime-domain-context>');
          });

          const latestToolResult = [...context.messages]
            .reverse()
            .find((message: Message) => message.role === 'toolResult');

          if (latestToolResult) {
            return createTextStream('Onboarding started.');
          }

          latestUserText = [...context.messages]
            .reverse()
            .map((message: Message) =>
              message.role === 'user'
                ? typeof message.content === 'string'
                  ? message.content
                  : message.content
                      .filter((part) => part.type === 'text')
                      .map((part) => part.text)
                      .join(' ')
                : '',
            )
            .find((value) => value.trim().length > 0 && !value.startsWith('<')) ?? '';

          return createToolStream({
            toolName: AGENT_RUNTIME_DOMAIN_COMMAND_TOOL,
            toolCallId: 'tool-hire',
            args: {
              name: 'hire',
              inputJson: '{}',
            },
          });
        },
      },
      __internalPostgres: internalPostgres,
    } as any);

    const initialConnectSnapshot = await readFirstMatchingEvent(
      await runtime.service.connect({
        threadId: 'thread-1',
        runId: 'run-connect-initial',
      }),
      isStateSnapshotEvent,
    );

    const hireEvents = await collectEventSource(
      await runtime.service.run({
        threadId: 'thread-1',
        runId: 'run-hire',
        messages: [
          {
            id: 'message-1',
            role: 'user',
            content: 'Please hire the agent.',
          },
        ],
      }),
    );

    const hireSnapshot = hireEvents.find(isStateSnapshotEvent);
    expect(latestUserText).toBe('Please hire the agent.');
    expect(
      hasSystemPromptFragments(observedSystemPrompts, [
        'You are a lifecycle agent.',
        'Lifecycle phase: prehire.',
      ]),
    ).toBe(true);
    expect(observedDomainCommandToolDescription).toContain('Available commands: hire (Start onboarding.)');
    expect(observedDomainCommandToolDescription).toContain('complete_onboarding (Finish onboarding.)');
    expect(observedDomainCommandToolDescription).toContain(
      'Put any structured command payload in inputJson as a JSON object string',
    );
    expect(observedDomainCommandNames).toEqual([
      'hire',
      'continue_onboarding',
      'refresh_status',
      'complete_onboarding',
      'fire',
    ]);
    expect(sawSyntheticDomainContextMessage).toBe(false);
    expect(initialConnectSnapshot).toBeDefined();
    expect(initialConnectSnapshot!.snapshot.thread.lifecycle).toMatchObject({
      phase: 'prehire',
    });
    expect(initialConnectSnapshot!.snapshot.thread.task?.taskStatus).toMatchObject({
      state: 'working',
      message: {
        content: 'Ready for a live runtime conversation.',
      },
    });
    expect(hireSnapshot).toBeDefined();
    expect(hireSnapshot!.snapshot.thread.lifecycle).toMatchObject({
      phase: 'onboarding',
      onboardingStep: 'operator-profile',
    });
    expect(hireSnapshot!.snapshot.thread.task?.taskStatus).toMatchObject({
      state: 'input-required',
    });
    expect(hireSnapshot!.snapshot.projected).toMatchObject({
      managedLifecycle: {
        phase: 'onboarding',
        onboardingStep: 'operator-profile',
      },
    });

    expect(persistedThreads.get('thread-1')?.threadState).toHaveProperty('a2ui');
    expect(persistedThreads.get('thread-1')?.threadState).toHaveProperty('projectedState');

    const resumeEvents = await collectEventSource(
      await runtime.service.run({
        threadId: 'thread-1',
        runId: 'run-resume',
        forwardedProps: {
          command: {
            resume: {
              operatorNote: 'safe window approved',
            },
          },
        },
      }),
    );

    const resolvedInterruptSnapshot = findStateSnapshotEvent(
      resumeEvents,
      (event) => event.snapshot.thread.artifacts.current?.data?.status === 'resolved',
    );
    const domainResumeSnapshot = findStateSnapshotEvent(
      resumeEvents,
      (event) => event.snapshot.thread.lifecycle?.onboardingStep === 'delegation-note',
    );

    expect(resolvedInterruptSnapshot).toBeDefined();
    expect(resolvedInterruptSnapshot!.snapshot.thread.task?.taskStatus).toMatchObject({
      state: 'working',
    });
    expect(domainResumeSnapshot).toBeDefined();
    expect(domainResumeSnapshot!.snapshot.thread.lifecycle).toMatchObject({
      onboardingStep: 'delegation-note',
      operatorNote: 'safe window approved',
    });
    expect(domainResumeSnapshot!.snapshot.projected).toMatchObject({
      managedLifecycle: {
        operatorNote: 'safe window approved',
      },
    });

    expect(persistedThreads.get('thread-1')?.threadState).not.toHaveProperty('a2ui');

    const completeEvents = await collectEventSource(
      await runtime.service.run({
        threadId: 'thread-1',
        runId: 'run-complete',
        forwardedProps: {
          command: {
            name: 'complete_onboarding',
          },
        },
      }),
    );

    const completeSnapshot = completeEvents.find(isStateSnapshotEvent);

    expect(completeSnapshot).toBeDefined();
    expect(completeSnapshot!.snapshot.thread.lifecycle).toMatchObject({
      phase: 'hired',
      onboardingStep: null,
    });
    expect(completeSnapshot!.snapshot.projected).toMatchObject({
      managedLifecycle: {
        phase: 'hired',
      },
    });
    expect(completeSnapshot!.snapshot.thread.task?.taskStatus).toMatchObject({
      state: 'completed',
    });

    const fireEvents = await collectEventSource(
      await runtime.service.run({
        threadId: 'thread-1',
        runId: 'run-fire',
        forwardedProps: {
          command: {
            name: 'fire',
          },
        },
      }),
    );

    const fireSnapshot = fireEvents.find(isStateSnapshotEvent);

    expect(fireSnapshot).toBeDefined();
    expect(fireSnapshot!.snapshot.thread.lifecycle).toMatchObject({
      phase: 'fired',
    });
    expect(fireSnapshot!.snapshot.projected).toMatchObject({
      managedLifecycle: {
        phase: 'fired',
      },
    });
  });

  it('keeps non-thread-surfaced interrupts canonical without mirroring them into transcript activity', async () => {
    const threadId = 'thread-hidden-interrupt';
    const { persistedThreads, persistedInterrupts, hooks: internalPostgres } =
      createPersistingInternalPostgres();
    const runtime = await createAgentRuntime({
      model: createModel('int-model-hidden-interrupt'),
      systemPrompt: 'You are a lifecycle agent.',
      domain: createLifecycleDomain({
        mirroredToActivity: false,
      }),
      agentOptions: {
        streamFn: () => createTextStream('Model fallback should not run for direct commands.'),
      },
      __internalPostgres: internalPostgres,
    } as any);

    await collectEventSource(
      await runtime.service.run({
        threadId,
        runId: 'run-hidden-hire',
        forwardedProps: {
          command: {
            name: 'hire',
          },
        },
      }),
    );

    expect(persistedThreads.get(threadId)?.threadState).toMatchObject({
      execution: {
        status: 'interrupted',
      },
      artifacts: {
        current: {
          data: {
            type: 'interrupt-status',
            interruptType: 'operator-config',
            status: 'pending',
            mirroredToActivity: false,
          },
        },
        activity: {
          data: {
            type: 'interrupt-status',
            interruptType: 'operator-config',
            status: 'pending',
            mirroredToActivity: false,
          },
        },
      },
    });
    expect(persistedThreads.get(threadId)?.threadState).not.toHaveProperty('a2ui');
    expect(persistedThreads.get(threadId)?.threadState.activityEvents ?? []).toEqual([]);
    expect([...persistedInterrupts.values()][0]).toMatchObject({
      status: 'pending',
      mirroredToActivity: false,
    });

    await collectEventSource(
      await runtime.service.run({
        threadId,
        runId: 'run-hidden-refresh',
        forwardedProps: {
          command: {
            name: 'refresh_status',
          },
        },
      }),
    );

    expect(persistedThreads.get(threadId)?.threadState).toMatchObject({
      artifacts: {
        current: {
          data: {
            type: 'lifecycle-status',
          },
        },
        activity: {
          data: {
            type: 'interrupt-status',
            interruptType: 'operator-config',
            status: 'pending',
            mirroredToActivity: false,
          },
        },
      },
    });
    expect(persistedThreads.get(threadId)?.threadState.activityEvents ?? []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'artifact',
          artifact: expect.objectContaining({
            data: expect.objectContaining({
              type: 'lifecycle-status',
            }),
          }),
        }),
      ]),
    );

    const reconnectSnapshot = await readFirstMatchingEvent(
      await runtime.service.connect({
        threadId,
        runId: 'run-hidden-reconnect',
      }),
      isStateSnapshotEvent,
    );

    expect(reconnectSnapshot).toBeDefined();
    expect(
      (reconnectSnapshot!.snapshot.thread.activity?.events ?? []).some(
        (event) =>
          event.type === 'artifact' &&
          typeof event.artifact?.data === 'object' &&
          event.artifact.data !== null &&
          'type' in event.artifact.data &&
          event.artifact.data.type === 'interrupt-status',
      ),
    ).toBe(false);
    expect(reconnectSnapshot!.snapshot.thread.artifacts).toMatchObject({
      current: {
        data: {
          type: 'lifecycle-status',
        },
      },
      activity: {
        data: {
          type: 'interrupt-status',
          interruptType: 'operator-config',
          status: 'pending',
          mirroredToActivity: false,
        },
      },
    });

    const resumeEvents = await collectQueuedEvents(
      await runtime.service.run({
        threadId,
        runId: 'run-hidden-resume',
        forwardedProps: {
          command: {
            resume: {
              operatorNote: 'safe window approved',
            },
          },
        },
      }),
    );
    const domainResumeSnapshot = findStateSnapshotEvent(
      resumeEvents,
      (event) => event.snapshot.thread.lifecycle?.onboardingStep === 'delegation-note',
    );

    expect(domainResumeSnapshot).toBeDefined();
    expect(domainResumeSnapshot!.snapshot.thread.lifecycle).toMatchObject({
      operatorNote: 'safe window approved',
    });
    expect(
      (domainResumeSnapshot!.snapshot.thread.activity?.events ?? []).some(
        (event) =>
          event.type === 'artifact' &&
          typeof event.artifact?.data === 'object' &&
          event.artifact.data !== null &&
          'type' in event.artifact.data &&
          event.artifact.data.type === 'interrupt-status',
      ),
    ).toBe(false);
    expect(persistedThreads.get(threadId)?.threadState).not.toHaveProperty('a2ui');
    expect(
      (persistedThreads.get(threadId)?.threadState.activityEvents ?? []).some(
        (event) =>
          event.type === 'artifact' &&
          typeof event.artifact?.data === 'object' &&
          event.artifact.data !== null &&
          'type' in event.artifact.data &&
          event.artifact.data.type === 'interrupt-status',
      ),
    ).toBe(false);
    expect([...persistedInterrupts.values()][0]).toMatchObject({
      status: 'resolved',
      mirroredToActivity: false,
      resolvedAt: expect.any(Date),
    });
  });

  it('executes forwardedProps command before inference when both command and messages are present', async () => {
    let inferenceCalls = 0;

    const runtime = await createAgentRuntime({
      model: createModel('int-model'),
      systemPrompt: 'You are a lifecycle agent.',
      domain: createLifecycleDomain(),
      agentOptions: {
        streamFn: () => {
          inferenceCalls += 1;
          return createTextStream('This should never be emitted for direct commands.');
        },
      },
      __internalPostgres: createInternalPostgresHooks(),
    } as any);

    const events = await collectEventSource(
      await runtime.service.run({
        threadId: 'thread-direct-command',
        runId: 'run-direct-hire',
        messages: [
          {
            id: 'message-1',
            role: 'user',
            content: 'Please hire the agent later.',
          },
        ],
        forwardedProps: {
          command: {
            name: 'hire',
          },
        },
      }),
    );

    const snapshot = events.find(isStateSnapshotEvent);

    expect(inferenceCalls).toBe(0);
    expect(events.some(isStateDeltaEvent)).toBe(false);
    expect(snapshot).toBeDefined();
    expect(snapshot!.snapshot.thread.lifecycle).toMatchObject({
      phase: 'onboarding',
      onboardingStep: 'operator-profile',
    });
    expect(snapshot!.snapshot.thread.task?.taskStatus).toMatchObject({
      state: 'input-required',
    });
    expect(snapshot!.snapshot.projected).toMatchObject({
      managedLifecycle: {
        phase: 'onboarding',
        onboardingStep: 'operator-profile',
      },
    });
  });

  it('emits one authoritative state delta when a shared-state update also recomputes projected state', async () => {
    const { persistedThreads, hooks: internalPostgres } = createPersistingInternalPostgres();
    const runtime = await createAgentRuntime({
      model: createModel('int-model-shared-update'),
      systemPrompt: 'You are a lifecycle agent.',
      domain: createLifecycleDomain({
        projectSharedState: ({ sharedState, currentProjection }) => {
          const settings =
            typeof sharedState.settings === 'object' && sharedState.settings !== null
              ? (sharedState.settings as { amount?: unknown })
              : null;
          const amount =
            typeof settings?.amount === 'number' && Number.isFinite(settings.amount)
              ? settings.amount
              : null;

          return {
            ...(currentProjection ?? {}),
            managedLifecycle: {
              amountSummary: amount === null ? 'No managed amount configured.' : `Managed amount: ${amount}`,
            },
          };
        },
      }),
      __internalPostgres: internalPostgres,
    } as any);

    await readFirstMatchingEvent(
      await runtime.service.connect({
        threadId: 'thread-shared-projection',
        runId: 'run-connect-shared-projection',
      }),
      isStateSnapshotEvent,
    );

    const events = await collectEventSource(
      await runtime.service.run({
        threadId: 'thread-shared-projection',
        runId: 'run-shared-projection',
        forwardedProps: {
          command: {
            update: {
              clientMutationId: 'mutation-1',
              baseRevision: 'shared-rev-0',
              patch: [
                {
                  op: 'add',
                  path: '/shared/settings',
                  value: {
                    amount: 250,
                  },
                },
              ],
            },
          },
        },
      }),
    );

    const delta = events.find(isStateDeltaEvent);
    expect(delta?.delta).toEqual(
      expect.arrayContaining([
        {
          op: 'add',
          path: '/shared/settings',
          value: {
            amount: 250,
          },
        },
        {
          op: 'replace',
          path: '/projected/managedLifecycle/amountSummary',
          value: 'Managed amount: 250',
        },
        {
          op: 'replace',
          path: '/projected/managedLifecycle/amountSummary',
          value: 'Managed amount: 250',
        },
      ]),
    );
    expect(persistedThreads.get('thread-shared-projection')?.threadState).toMatchObject({
      sharedState: {
        settings: {
          amount: 250,
        },
      },
      projectedState: {
        managedLifecycle: {
          amountSummary: 'Managed amount: 250',
        },
      },
    });
  });

  it('passes persisted projected state into systemContext when rebuilding the model prompt', async () => {
    const { hooks: internalPostgres } = createPersistingInternalPostgres();
    const runtimeA = await createAgentRuntime({
      model: createModel('int-model-projected-system-context'),
      systemPrompt: 'You are a lifecycle agent.',
      domain: createLifecycleDomain(),
      agentOptions: {
        streamFn: () => createTextStream('Unused for direct command.'),
      },
      __internalPostgres: internalPostgres,
    } as any);

    await collectEventSource(
      await runtimeA.service.run({
        threadId: 'thread-projected-system-context',
        runId: 'run-projected-system-context-hire',
        forwardedProps: {
          command: {
            name: 'hire',
          },
        },
      }),
    );

    const observedSystemPrompts: string[] = [];
    const runtimeB = await createAgentRuntime({
      model: createModel('int-model-projected-system-context'),
      systemPrompt: 'You are a lifecycle agent.',
      domain: {
        ...createLifecycleDomain(),
        systemContext: (params) => {
          const { threadId, state, currentProjection } = params as LifecycleContext & {
            currentProjection?: Record<string, unknown>;
          };
          const currentState =
            state ?? {
              phase: 'prehire',
              onboardingStep: null,
              operatorNote: null,
            };
          const projectedPhase =
            typeof currentProjection?.managedLifecycle === 'object' &&
            currentProjection.managedLifecycle !== null &&
            'phase' in currentProjection.managedLifecycle &&
            typeof currentProjection.managedLifecycle.phase === 'string'
              ? currentProjection.managedLifecycle.phase
              : 'missing';

          return [
            `Lifecycle phase: ${currentState.phase}.`,
            `Projected phase: ${projectedPhase}.`,
            `Thread: ${threadId}.`,
          ];
        },
      },
      agentOptions: {
        streamFn: (_model, context) => {
          observedSystemPrompts.push(context.systemPrompt ?? '');
          return createTextStream('Prompt rebuilt from projected state.');
        },
      },
      __internalPostgres: internalPostgres,
    } as any);

    await collectEventSource(
      await runtimeB.service.run({
        threadId: 'thread-projected-system-context',
        runId: 'run-projected-system-context-prompt',
        messages: [
          {
            id: 'user-projected-system-context',
            role: 'user',
            content: 'show me the current managed lifecycle',
          },
        ],
      }),
    );

    expect(hasSystemPromptFragments(observedSystemPrompts, [
      'Lifecycle phase: onboarding.',
      'Projected phase: onboarding.',
      'Thread: thread-projected-system-context.',
    ])).toBe(true);
  });

  it('logs the final system prompt when DEBUG_AGENT_RUNTIME_SYSTEM_PROMPT is enabled', async () => {
    const originalDebugFlag = process.env.DEBUG_AGENT_RUNTIME_SYSTEM_PROMPT;
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    process.env.DEBUG_AGENT_RUNTIME_SYSTEM_PROMPT = '1';

    try {
      const runtime = await createAgentRuntime({
        model: createModel('int-model'),
        systemPrompt: 'You are a lifecycle agent.',
        domain: createLifecycleDomain(),
        agentOptions: {
          streamFn: () => createTextStream('Debug prompt captured.'),
        },
        __internalPostgres: createInternalPostgresHooks(),
      } as any);

      await collectEventSource(
        await runtime.service.run({
          threadId: 'thread-debug-system-prompt',
          runId: 'run-debug-system-prompt',
          messages: [
            {
              id: 'message-debug-system-prompt',
              role: 'user',
              content: 'Show me the runtime prompt.',
            },
          ],
        }),
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[agent-runtime] final system prompt for thread thread-debug-system-prompt:',
        ),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Lifecycle phase: prehire.'),
      );
    } finally {
      consoleLogSpy.mockRestore();
      if (originalDebugFlag === undefined) {
        delete process.env.DEBUG_AGENT_RUNTIME_SYSTEM_PROMPT;
      } else {
        process.env.DEBUG_AGENT_RUNTIME_SYSTEM_PROMPT = originalDebugFlag;
      }
    }
  });

  it('awaits async domain system context before starting inference', async () => {
    const observedSystemPrompts: string[] = [];

    const runtime = await createAgentRuntime({
      model: createModel('int-model'),
      systemPrompt: 'You are an async lifecycle agent.',
      domain: {
        lifecycle: {
          initialPhase: 'prehire',
          phases: ['prehire'],
          terminalPhases: [],
          commands: [],
          transitions: [],
          interrupts: [],
        },
        systemContext: async () => {
          await Promise.resolve();
          return ['<async_context>', '  <phase>prehire</phase>', '</async_context>'];
        },
      },
      agentOptions: {
        streamFn: (_model, context) => {
          observedSystemPrompts.push(context.systemPrompt ?? '');
          return createTextStream('Async context observed.');
        },
      },
      __internalPostgres: createInternalPostgresHooks(),
    } as any);

    await collectEventSource(
      await runtime.service.run({
        threadId: 'thread-async-context',
        runId: 'run-async-context',
        messages: [
          {
            id: 'message-async-context',
            role: 'user',
            content: 'Show async context.',
          },
        ],
      }),
    );

    expect(
      observedSystemPrompts.some(
        (prompt) =>
          prompt.includes('You are an async lifecycle agent.') &&
          prompt.includes('<async_context>') &&
          prompt.includes('<phase>prehire</phase>') &&
          prompt.includes('</async_context>'),
      ),
    ).toBe(true);
  });

  it('runs due scheduled automations through the agent with the saved instruction', async () => {
    vi.useFakeTimers();

    try {
      const currentTime = Date.parse('2026-03-20T00:00:00.000Z');
      const observedScheduledUserMessages: string[] = [];
      const observedScheduledPromptUserMessages: string[][] = [];
      const observedScheduledSystemPrompts: string[] = [];
      let inspectionState = {
        threads: [],
        executions: [],
        automations: [],
        automationRuns: [],
        interrupts: [],
        leases: [],
        outboxIntents: [],
        executionEvents: [],
        threadActivities: [],
      } as {
        threads: unknown[];
        executions: unknown[];
        automations: unknown[];
        automationRuns: unknown[];
        interrupts: unknown[];
        leases: unknown[];
        outboxIntents: unknown[];
        executionEvents: unknown[];
        threadActivities: unknown[];
        artifacts?: unknown[];
      };
      const internalPostgres = createInternalPostgresHooks({
        loadInspectionState: vi.fn(async () => inspectionState),
      });

      const runtime = await createAgentRuntime({
        model: createModel('int-model'),
        systemPrompt: 'You are an automation agent.',
        now: () => currentTime,
        agentOptions: {
          streamFn: (_model, context) => {
            const latestUserMessage = [...context.messages]
              .reverse()
              .find((message: Message) => message.role === 'user');
            if (latestUserMessage?.content === 'sync treasury balances') {
              observedScheduledUserMessages.push(latestUserMessage.content);
              observedScheduledSystemPrompts.push(context.systemPrompt);
              observedScheduledPromptUserMessages.push(
                context.messages
                  .filter((message: Message) => message.role === 'user')
                  .map((message: Message) =>
                    typeof message.content === 'string'
                      ? message.content
                      : JSON.stringify(message.content),
                  ),
              );
            }

            const latestToolResult = [...context.messages]
              .reverse()
              .find((message: Message) => message.role === 'toolResult');

            if (latestToolResult) {
              return createTextStream('Automation scheduled.');
            }

            return createToolStream({
              toolName: 'automation_schedule',
              toolCallId: 'tool-automation-schedule',
              args: {
                title: 'Sync every minute',
                instruction: 'sync',
                schedule: {
                  kind: 'every',
                  intervalMinutes: 1,
                },
              },
            });
          },
        },
        __internalPostgres: internalPostgres,
      } as any);

      await collectEventSource(
        await runtime.service.run({
          threadId: 'thread-1',
          runId: 'run-schedule',
          messages: [
            {
              id: 'message-1',
              role: 'user',
              content: 'Please schedule sync automation every minute.',
            },
          ],
        }),
      );

      inspectionState = {
        threads: [
          {
            threadId: 'thread-record-1',
            threadKey: 'thread-1',
            threadState: {
              thread: {
                id: 'thread-1',
              },
              execution: {
                id: 'execution-thread-1',
                status: 'completed',
              },
              activityEvents: [
                {
                  type: 'artifact',
                  artifact: {
                    artifactId: 'artifact-previous',
                    data: {
                      type: 'automation-status',
                      runId: 'run-automation-previous',
                      status: 'completed',
                      detail: 'Automation Sync every minute executed successfully.',
                    },
                  },
                  append: true,
                },
              ],
            },
          },
        ],
        executions: [],
        automations: [
          {
            automationId: 'automation-1',
            threadId: 'thread-record-1',
            commandName: 'Sync every minute',
            nextRunAt: new Date(currentTime - 1_000),
            suspended: false,
            schedulePayload: {
              title: 'Sync every minute',
              instruction: 'sync treasury balances',
              minutes: 1,
            },
          },
        ],
        automationRuns: [
          {
            automationId: 'automation-1',
            runId: 'run-automation-1',
            executionId: 'execution-automation-1',
            status: 'scheduled',
            scheduledAt: new Date(currentTime - 60_000),
          },
          {
            automationId: 'automation-1',
            runId: 'run-automation-previous',
            executionId: 'execution-automation-previous',
            status: 'completed',
            scheduledAt: new Date(currentTime - 120_000),
            startedAt: new Date(currentTime - 119_000),
            completedAt: new Date(currentTime - 110_000),
          },
        ],
        interrupts: [],
        leases: [],
        outboxIntents: [],
        executionEvents: [],
        threadActivities: [
          {
            activityId: 'activity-previous',
            threadId: 'thread-record-1',
            executionId: 'execution-automation-previous',
            activityKind: 'automation-executed',
            createdAt: new Date(currentTime - 110_000),
          },
        ],
        artifacts: [
          {
            artifactId: 'artifact-previous-snapshot',
            threadId: 'thread-record-1',
            executionId: 'execution-automation-previous',
            artifactKind: 'automation-run-snapshot',
            appendOnly: false,
            payload: {
              automationRunId: 'run-automation-previous',
              runThreadKey: 'automation:automation-1:run:run-automation-previous',
              snapshot: {
                summary: 'Rebalanced 120 USDC.',
              },
            },
            createdAt: new Date(currentTime - 110_000),
            updatedAt: new Date(currentTime - 110_000),
          },
        ],
      };

      await vi.advanceTimersByTimeAsync(1_100);

      const connectSnapshot = await readFirstMatchingEvent(
        await runtime.service.connect({
          threadId: 'thread-1',
          runId: 'run-connect',
        }),
        isStateSnapshotEvent,
      );

      expect(connectSnapshot).toBeDefined();
      expect(connectSnapshot!.snapshot.thread.artifacts?.current?.data).toMatchObject({
        type: 'automation-status',
        status: 'completed',
        command: 'Sync every minute',
      });
      expect(observedScheduledUserMessages).toContain('sync treasury balances');
      expect(observedScheduledPromptUserMessages).toContainEqual(['sync treasury balances']);
      const scheduledSystemPrompt = observedScheduledSystemPrompts.join('\n');
      expect(scheduledSystemPrompt).toContain('<scheduled_automation_context>');
      expect(scheduledSystemPrompt).toContain('<automation_id>automation-1</automation_id>');
      expect(scheduledSystemPrompt).toContain('<automation_title>Sync every minute</automation_title>');
      expect(scheduledSystemPrompt).toContain('<root_thread_id>thread-1</root_thread_id>');
      expect(scheduledSystemPrompt).toContain('<previous_run_status>completed</previous_run_status>');
      expect(scheduledSystemPrompt).toContain('<previous_run_id>run-automation-previous</previous_run_id>');
      expect(scheduledSystemPrompt).toContain('<previous_run_summary>Rebalanced 120 USDC.</previous_run_summary>');
      expect(scheduledSystemPrompt).not.toContain('Automation Sync every minute executed successfully.');
      expect(scheduledSystemPrompt).toContain(
        '<previous_run_detail_ref>automation-run:run-automation-previous</previous_run_detail_ref>',
      );
      expect(scheduledSystemPrompt).toContain(
        '<previous_run_artifact_ref>artifact:artifact-previous-snapshot</previous_run_artifact_ref>',
      );
      expect(scheduledSystemPrompt).toContain(
        '<previous_run_activity_ref>thread-activity:activity-previous</previous_run_activity_ref>',
      );
      const rootMessages = await readFirstMatchingEvent(
        await runtime.service.connect({
          threadId: 'thread-1',
          runId: 'run-connect-messages',
        }),
        isMessagesSnapshotEvent,
      );
      expect(rootMessages?.messages).not.toContainEqual(
        expect.objectContaining({
          role: 'user',
          content: 'sync treasury balances',
        }),
      );
      const statements = internalPostgres.executeStatements.mock.calls.flatMap((call) => call[1]);
      expect(statements).not.toContainEqual(
        expect.objectContaining({
          tableName: 'pi_threads',
          values: expect.arrayContaining(['automation:automation-1:run:run-automation-1']),
        }),
      );
      expect(internalPostgres.ensureReady).toHaveBeenCalledWith({});
      expect(internalPostgres.loadInspectionState).toHaveBeenCalled();
      expect(internalPostgres.executeStatements).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks scheduled automation runs failed when the agent invocation fails', async () => {
    vi.useFakeTimers();

    try {
      const currentTime = Date.parse('2026-03-20T00:00:00.000Z');
      const executeStatements = vi.fn(async () => undefined);
      const inspectionState = {
        threads: [
          {
            threadId: 'thread-record-1',
            threadKey: 'thread-1',
            threadState: {
              thread: {
                id: 'thread-1',
              },
              execution: {
                id: 'execution-thread-1',
                status: 'completed',
              },
            },
          },
        ],
        executions: [],
        automations: [
          {
            automationId: 'automation-1',
            threadId: 'thread-record-1',
            commandName: 'Sync every minute',
            nextRunAt: new Date(currentTime - 1_000),
            suspended: false,
            schedulePayload: {
              title: 'Sync every minute',
              instruction: 'sync treasury balances',
              minutes: 1,
            },
          },
        ],
        automationRuns: [
          {
            automationId: 'automation-1',
            runId: 'run-automation-1',
            executionId: 'execution-automation-1',
            status: 'scheduled',
            scheduledAt: new Date(currentTime - 60_000),
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
      const internalPostgres = createInternalPostgresHooks({
        loadInspectionState: vi.fn(async () => inspectionState),
        executeStatements,
      });

      await createAgentRuntime({
        model: createModel('int-model'),
        systemPrompt: 'You are an automation agent.',
        now: () => currentTime,
        agentOptions: {
          streamFn: (_model, context) => {
            const latestUserMessage = [...context.messages]
              .reverse()
              .find((message: Message) => message.role === 'user');
            if (latestUserMessage?.content === 'sync treasury balances') {
              throw new Error('Synthetic scheduled failure.');
            }

            return createTextStream('Idle.');
          },
        },
        __internalPostgres: internalPostgres,
      } as any);

      await vi.advanceTimersByTimeAsync(1_100);

      const statements = executeStatements.mock.calls.flatMap((call) => call[1]);
      expect(statements).toContainEqual(
        expect.objectContaining({
          tableName: 'pi_automation_runs',
          text: expect.stringContaining('update pi_automation_runs'),
          values: ['failed', expect.any(Date), expect.any(Date), 'run-automation-1'],
        }),
      );
      expect(statements).toContainEqual(
        expect.objectContaining({
          tableName: 'pi_executions',
          text: expect.stringContaining('update pi_executions'),
          values: ['failed', expect.any(Date), expect.any(Date), 'execution-automation-1'],
        }),
      );
      expect(statements).toContainEqual(
        expect.objectContaining({
          tableName: 'pi_automation_runs',
          text: expect.stringContaining('insert into pi_automation_runs'),
          values: [
            expect.any(String),
            'automation-1',
            'thread-record-1',
            expect.any(String),
            'scheduled',
            expect.any(Date),
            null,
          ],
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('recovers persisted due scheduled automations after restart and invokes through the agent', async () => {
    vi.useFakeTimers();

    try {
      const currentTime = Date.parse('2026-03-20T00:00:00.000Z');
      const observedScheduledUserMessages: string[] = [];
      const executeStatements = vi.fn(async () => undefined);
      const inspectionState = {
        threads: [
          {
            threadId: 'thread-record-1',
            threadKey: 'thread-1',
            threadState: {
              thread: {
                id: 'thread-1',
              },
              execution: {
                id: 'execution-thread-1',
                status: 'completed',
              },
            },
          },
        ],
        executions: [],
        automations: [
          {
            automationId: 'automation-1',
            threadId: 'thread-record-1',
            commandName: 'Sync every minute',
            nextRunAt: new Date(currentTime - 1_000),
            suspended: false,
            schedulePayload: {
              title: 'Sync every minute',
              instruction: 'sync treasury balances',
              minutes: 1,
            },
          },
        ],
        automationRuns: [
          {
            automationId: 'automation-1',
            runId: 'run-automation-1',
            executionId: 'execution-automation-1',
            status: 'scheduled',
            scheduledAt: new Date(currentTime - 60_000),
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
      const internalPostgres = createInternalPostgresHooks({
        loadInspectionState: vi.fn(async () => inspectionState),
        executeStatements,
      });

      await createAgentRuntime({
        model: createModel('int-model'),
        systemPrompt: 'You are an automation agent.',
        now: () => currentTime,
        agentOptions: {
          streamFn: (_model, context) => {
            const latestUserMessage = [...context.messages]
              .reverse()
              .find((message: Message) => message.role === 'user');
            if (latestUserMessage?.content === 'sync treasury balances') {
              observedScheduledUserMessages.push(latestUserMessage.content);
            }
            return createTextStream('Recovered run complete.');
          },
        },
        __internalPostgres: internalPostgres,
      } as any);

      await vi.advanceTimersByTimeAsync(1_100);

      expect(observedScheduledUserMessages).toEqual(['sync treasury balances']);
      expect(executeStatements.mock.calls.flatMap((call) => call[1])).toContainEqual(
        expect.objectContaining({
          tableName: 'pi_automation_runs',
          text: expect.stringContaining('update pi_automation_runs'),
          values: ['completed', expect.any(Date), expect.any(Date), 'run-automation-1'],
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not invoke due suspended automations or canceled scheduled runs', async () => {
    vi.useFakeTimers();

    try {
      const currentTime = Date.parse('2026-03-20T00:00:00.000Z');
      const observedScheduledUserMessages: string[] = [];
      const executeStatements = vi.fn(async () => undefined);
      const inspectionState = {
        threads: [
          {
            threadId: 'thread-record-1',
            threadKey: 'thread-1',
            threadState: {
              thread: {
                id: 'thread-1',
              },
              execution: {
                id: 'execution-thread-1',
                status: 'completed',
              },
            },
          },
          {
            threadId: 'thread-record-2',
            threadKey: 'thread-2',
            threadState: {
              thread: {
                id: 'thread-2',
              },
              execution: {
                id: 'execution-thread-2',
                status: 'completed',
              },
            },
          },
        ],
        executions: [],
        automations: [
          {
            automationId: 'automation-suspended',
            threadId: 'thread-record-1',
            commandName: 'Suspended sync',
            nextRunAt: new Date(currentTime - 1_000),
            suspended: true,
            schedulePayload: {
              title: 'Suspended sync',
              instruction: 'should not run suspended',
              minutes: 1,
            },
          },
          {
            automationId: 'automation-canceled',
            threadId: 'thread-record-2',
            commandName: 'Canceled sync',
            nextRunAt: new Date(currentTime - 1_000),
            suspended: false,
            schedulePayload: {
              title: 'Canceled sync',
              instruction: 'should not run canceled',
              minutes: 1,
            },
          },
        ],
        automationRuns: [
          {
            automationId: 'automation-suspended',
            runId: 'run-suspended',
            executionId: 'execution-suspended',
            status: 'scheduled',
            scheduledAt: new Date(currentTime - 60_000),
            startedAt: null,
            completedAt: null,
          },
          {
            automationId: 'automation-canceled',
            runId: 'run-canceled',
            executionId: 'execution-canceled',
            status: 'canceled',
            scheduledAt: new Date(currentTime - 60_000),
            startedAt: null,
            completedAt: new Date(currentTime - 30_000),
          },
        ],
        interrupts: [],
        leases: [],
        outboxIntents: [],
        executionEvents: [],
        threadActivities: [],
      };

      await createAgentRuntime({
        model: createModel('int-model'),
        systemPrompt: 'You are an automation agent.',
        now: () => currentTime,
        agentOptions: {
          streamFn: (_model, context) => {
            const latestUserMessage = [...context.messages]
              .reverse()
              .find((message: Message) => message.role === 'user');
            if (typeof latestUserMessage?.content === 'string') {
              observedScheduledUserMessages.push(latestUserMessage.content);
            }
            return createTextStream('Unexpected.');
          },
        },
        __internalPostgres: createInternalPostgresHooks({
          loadInspectionState: vi.fn(async () => inspectionState),
          executeStatements,
        }),
      } as any);

      await vi.advanceTimersByTimeAsync(1_100);

      expect(observedScheduledUserMessages).toEqual([]);
      expect(executeStatements).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels the current active scheduled automation run', async () => {
    const currentTime = Date.parse('2026-03-20T00:00:00.000Z');
    const executeStatements = vi.fn(async () => undefined);
    const inspectionState = {
      threads: [
        {
          threadId: 'thread-record-1',
          threadKey: 'thread-1',
          threadState: {
            thread: {
              id: 'thread-1',
            },
            execution: {
              id: 'execution-thread-1',
              status: 'completed',
            },
          },
        },
      ],
      executions: [],
      automations: [
        {
          automationId: 'automation-1',
          threadId: 'thread-record-1',
          commandName: 'Sync every minute',
          nextRunAt: new Date(currentTime + 60_000),
          suspended: false,
          schedulePayload: {
            title: 'Sync every minute',
            instruction: 'sync treasury balances',
            minutes: 1,
          },
        },
      ],
      automationRuns: [
        {
          automationId: 'automation-1',
          runId: 'run-automation-active',
          executionId: 'execution-automation-active',
          status: 'running',
          scheduledAt: new Date(currentTime - 60_000),
          startedAt: new Date(currentTime - 55_000),
          completedAt: null,
        },
      ],
      interrupts: [],
      leases: [],
      outboxIntents: [],
      executionEvents: [],
      threadActivities: [],
    };
    const runtime = await createAgentRuntime({
      model: createModel('int-model'),
      systemPrompt: 'You are an automation agent.',
      now: () => currentTime,
      agentOptions: {
        streamFn: (_model, context) => {
          const latestToolResult = [...context.messages]
            .reverse()
            .find((message: Message) => message.role === 'toolResult');
          if (latestToolResult) {
            return createTextStream('Automation canceled.');
          }

          return createToolStream({
            toolName: AGENT_RUNTIME_AUTOMATION_CANCEL_TOOL,
            toolCallId: 'tool-automation-cancel',
            args: {
              automationId: 'automation-1',
            },
          });
        },
      },
      __internalPostgres: createInternalPostgresHooks({
        loadInspectionState: vi.fn(async () => inspectionState),
        executeStatements,
      }),
    } as any);

    await collectEventSource(
      await runtime.service.run({
        threadId: 'thread-1',
        runId: 'run-cancel-active',
        messages: [
          {
            id: 'message-cancel-active',
            role: 'user',
            content: 'Cancel this automation.',
          },
        ],
      }),
    );

    const statements = executeStatements.mock.calls.flatMap((call) => call[1]);
    expect(statements).toContainEqual(
      expect.objectContaining({
        tableName: 'pi_automation_runs',
        text: expect.stringContaining("status in ('scheduled', 'running', 'started')"),
        values: ['canceled', new Date(currentTime), 'run-automation-active'],
        requiredAffectedRows: 1,
      }),
    );
  });

  it('persists scheduled automation runs as running before invoking the agent', async () => {
    vi.useFakeTimers();

    try {
      const currentTime = Date.parse('2026-03-20T00:00:00.000Z');
      const executeStatements = vi.fn(async () => undefined);
      const inspectionState = {
        threads: [
          {
            threadId: 'thread-record-1',
            threadKey: 'thread-1',
            threadState: {
              thread: {
                id: 'thread-1',
              },
              execution: {
                id: 'execution-thread-1',
                status: 'completed',
              },
            },
          },
        ],
        executions: [],
        automations: [
          {
            automationId: 'automation-1',
            threadId: 'thread-record-1',
            commandName: 'Sync every minute',
            nextRunAt: new Date(currentTime - 1_000),
            suspended: false,
            schedulePayload: {
              title: 'Sync every minute',
              instruction: 'sync treasury balances',
              minutes: 1,
            },
          },
        ],
        automationRuns: [
          {
            automationId: 'automation-1',
            runId: 'run-automation-1',
            executionId: 'execution-automation-1',
            status: 'scheduled',
            scheduledAt: new Date(currentTime - 60_000),
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
      const internalPostgres = createInternalPostgresHooks({
        loadInspectionState: vi.fn(async () => inspectionState),
        executeStatements,
      });

      await createAgentRuntime({
        model: createModel('int-model'),
        systemPrompt: 'You are an automation agent.',
        now: () => currentTime,
        agentOptions: {
          streamFn: () => createTextStream('Done.'),
        },
        __internalPostgres: internalPostgres,
      } as any);

      await vi.advanceTimersByTimeAsync(1_100);

      const calls = executeStatements.mock.calls.map((call) => call[1]);
      const runningCallIndex = calls.findIndex((statements) =>
        statements.some(
          (statement) =>
            statement.tableName === 'pi_automation_runs' &&
            statement.text.includes('update pi_automation_runs') &&
            statement.values[0] === 'running',
        ),
      );
      const terminalCallIndex = calls.findIndex((statements) =>
        statements.some(
          (statement) =>
            statement.tableName === 'pi_automation_runs' &&
            statement.text.includes('update pi_automation_runs') &&
            statement.values[0] === 'completed',
        ),
      );
      expect(runningCallIndex).toBeGreaterThanOrEqual(0);
      expect(terminalCallIndex).toBeGreaterThan(runningCallIndex);
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips agent invocation when another scheduler process already claimed the run', async () => {
    vi.useFakeTimers();

    try {
      const currentTime = Date.parse('2026-03-20T00:00:00.000Z');
      const observedScheduledUserMessages: string[] = [];
      const inspectionState = {
        threads: [
          {
            threadId: 'thread-record-1',
            threadKey: 'thread-1',
            threadState: {
              thread: {
                id: 'thread-1',
              },
              execution: {
                id: 'execution-thread-1',
                status: 'completed',
              },
            },
          },
        ],
        executions: [],
        automations: [
          {
            automationId: 'automation-1',
            threadId: 'thread-record-1',
            commandName: 'Sync every minute',
            nextRunAt: new Date(currentTime - 1_000),
            suspended: false,
            schedulePayload: {
              title: 'Sync every minute',
              instruction: 'sync treasury balances',
              minutes: 1,
            },
          },
        ],
        automationRuns: [
          {
            automationId: 'automation-1',
            runId: 'run-automation-1',
            executionId: 'execution-automation-1',
            status: 'scheduled',
            scheduledAt: new Date(currentTime - 60_000),
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
      const executeStatements = vi.fn(async (_databaseUrl: string, statements: readonly InternalPostgresStatement[]) => {
        if (statements.some((statement) => statement.requiredAffectedRows === 1)) {
          const error = new Error('Expected pi_automation_runs statement to affect 1 row, but it affected 0.');
          error.name = 'PostgresAffectedRowsError';
          throw error;
        }
      });

      await createAgentRuntime({
        model: createModel('int-model'),
        systemPrompt: 'You are an automation agent.',
        now: () => currentTime,
        agentOptions: {
          streamFn: (_model, context) => {
            const latestUserMessage = [...context.messages]
              .reverse()
              .find((message: Message) => message.role === 'user');
            if (typeof latestUserMessage?.content === 'string') {
              observedScheduledUserMessages.push(latestUserMessage.content);
            }
            return createTextStream('Should not run.');
          },
        },
        __internalPostgres: createInternalPostgresHooks({
          loadInspectionState: vi.fn(async () => inspectionState),
          executeStatements,
        }),
      } as any);

      await vi.advanceTimersByTimeAsync(1_100);

      expect(observedScheduledUserMessages).toEqual([]);
      expect(executeStatements).toHaveBeenCalled();
      expect(executeStatements.mock.calls.flatMap((call) => call[1])).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            tableName: 'pi_automation_runs',
            requiredAffectedRows: 1,
          }),
        ]),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('persists scheduled-run transcript artifacts under the automation execution without a run pi_thread', async () => {
    vi.useFakeTimers();

    try {
      const currentTime = Date.parse('2026-03-20T00:00:00.000Z');
      const executeStatements = vi.fn(async () => undefined);
      const inspectionState = {
        threads: [
          {
            threadId: 'thread-record-1',
            threadKey: 'thread-1',
            threadState: {
              thread: {
                id: 'thread-1',
              },
              execution: {
                id: 'execution-thread-1',
                status: 'completed',
              },
            },
          },
        ],
        executions: [],
        automations: [
          {
            automationId: 'automation-1',
            threadId: 'thread-record-1',
            commandName: 'Sync every minute',
            nextRunAt: new Date(currentTime - 1_000),
            suspended: false,
            schedulePayload: {
              title: 'Sync every minute',
              instruction: 'sync treasury balances',
              minutes: 1,
            },
          },
        ],
        automationRuns: [
          {
            automationId: 'automation-1',
            runId: 'run-automation-1',
            executionId: 'execution-automation-1',
            status: 'scheduled',
            scheduledAt: new Date(currentTime - 60_000),
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

      const runtime = await createAgentRuntime({
        model: createModel('int-model'),
        systemPrompt: 'You are an automation agent.',
        now: () => currentTime,
        agentOptions: {
          streamFn: (_model, context) => {
            const latestUserMessage = [...context.messages]
              .reverse()
              .find((message: Message) => message.role === 'user');
            if (latestUserMessage?.content === 'sync treasury balances') {
              return createTextStream('Scheduled run summarized 42 balances.');
            }
            return createTextStream('Idle.');
          },
        },
        __internalPostgres: createInternalPostgresHooks({
          loadInspectionState: vi.fn(async () => inspectionState),
          executeStatements,
        }),
      } as any);

      await vi.advanceTimersByTimeAsync(1_100);

      const statements = executeStatements.mock.calls.flatMap((call) => call[1]);
      expect(statements).toContainEqual(
        expect.objectContaining({
          tableName: 'pi_artifacts',
          values: [
            expect.any(String),
            'thread-record-1',
            'execution-automation-1',
            'automation-run-snapshot',
            false,
            expect.stringContaining('Scheduled run summarized 42 balances.'),
            expect.any(Date),
            expect.any(Date),
          ],
        }),
      );
      expect(statements).toContainEqual(
        expect.objectContaining({
          tableName: 'pi_execution_events',
          values: [
            expect.any(String),
            'execution-automation-1',
            'thread-record-1',
            'automation-run-snapshot',
            expect.stringContaining('"automationRunId":"run-automation-1"'),
            expect.any(Date),
          ],
        }),
      );
      expect(statements).not.toContainEqual(
        expect.objectContaining({
          tableName: 'pi_threads',
          values: expect.arrayContaining(['automation:automation-1:run:run-automation-1']),
        }),
      );
      const snapshot = await readFirstMatchingEvent(
        await runtime.service.connect({
          threadId: 'thread-1',
          runId: 'run-connect-live-snapshot-artifact',
        }),
        isStateSnapshotEvent,
      );
      expect(snapshot?.snapshot.thread.activity?.events).toContainEqual(
        expect.objectContaining({
          type: 'artifact',
          artifact: expect.objectContaining({
            artifactId: expect.any(String),
            data: expect.objectContaining({
              type: 'automation-run-snapshot',
              automationRunId: 'run-automation-1',
              snapshot: expect.objectContaining({
                summary: 'Scheduled run summarized 42 balances.',
              }),
            }),
          }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('hydrates persisted scheduled-run snapshot artifacts into root activity inspection state', async () => {
    const currentTime = Date.parse('2026-03-20T00:00:00.000Z');
    const internalPostgres = createInternalPostgresHooks({
      loadInspectionState: vi.fn(async () => ({
        threads: [
          {
            threadId: 'thread-record-1',
            threadKey: 'thread-1',
            threadState: {
              thread: {
                id: 'thread-1',
              },
              execution: {
                id: 'execution-thread-1',
                status: 'completed',
              },
              activityEvents: [],
            },
            createdAt: new Date(currentTime - 120_000),
            updatedAt: new Date(currentTime - 60_000),
          },
        ],
        executions: [],
        automations: [],
        automationRuns: [
          {
            automationId: 'automation-1',
            runId: 'run-automation-1',
            executionId: 'execution-automation-1',
            status: 'completed',
            scheduledAt: new Date(currentTime - 60_000),
            startedAt: new Date(currentTime - 55_000),
            completedAt: new Date(currentTime - 50_000),
          },
        ],
        interrupts: [],
        leases: [],
        outboxIntents: [],
        executionEvents: [
          {
            eventId: 'event-snapshot-1',
            executionId: 'execution-automation-1',
            threadId: 'thread-record-1',
            eventKind: 'automation-run-snapshot',
            payload: {
              automationRunId: 'run-automation-1',
              runThreadKey: 'automation:automation-1:run:run-automation-1',
              snapshot: {
                summary: 'Synced 42 balances.',
              },
            },
            createdAt: new Date(currentTime - 50_000),
          },
        ],
        threadActivities: [],
        artifacts: [
          {
            artifactId: 'artifact-snapshot-1',
            threadId: 'thread-record-1',
            executionId: 'execution-automation-1',
            artifactKind: 'automation-run-snapshot',
            appendOnly: false,
            payload: {
              automationRunId: 'run-automation-1',
              runThreadKey: 'automation:automation-1:run:run-automation-1',
              snapshot: {
                summary: 'Synced 42 balances.',
              },
            },
            createdAt: new Date(currentTime - 50_000),
            updatedAt: new Date(currentTime - 50_000),
          },
        ],
      })),
    });

    const runtime = await createAgentRuntime({
      model: createModel('int-model'),
      systemPrompt: 'You are an automation agent.',
      now: () => currentTime,
      agentOptions: {
        streamFn: () => createTextStream('Idle.'),
      },
      __internalPostgres: internalPostgres,
    } as any);

    const snapshot = await readFirstMatchingEvent(
      await runtime.service.connect({
        threadId: 'thread-1',
        runId: 'run-connect-snapshot-artifacts',
      }),
      isStateSnapshotEvent,
    );

    expect(snapshot?.snapshot.thread.activity?.events).toContainEqual(
      expect.objectContaining({
        type: 'artifact',
        artifact: expect.objectContaining({
          artifactId: 'artifact-snapshot-1',
          data: expect.objectContaining({
            type: 'automation-run-snapshot',
            automationRunId: 'run-automation-1',
            snapshot: expect.objectContaining({
              summary: 'Synced 42 balances.',
            }),
          }),
        }),
      }),
    );
  });

  it('keeps scheduled runtime-owned tool checkpoints on the automation execution and root thread', async () => {
    vi.useFakeTimers();

    try {
      const currentTime = Date.parse('2026-03-20T00:00:00.000Z');
      const executeStatements = vi.fn(async () => undefined);
      const inspectionState = {
        threads: [
          {
            threadId: 'thread-record-1',
            threadKey: 'thread-1',
            threadState: {
              thread: {
                id: 'thread-1',
              },
              execution: {
                id: 'execution-thread-1',
                status: 'completed',
              },
            },
          },
        ],
        executions: [],
        automations: [
          {
            automationId: 'automation-1',
            threadId: 'thread-record-1',
            commandName: 'Sync every minute',
            nextRunAt: new Date(currentTime - 1_000),
            suspended: false,
            schedulePayload: {
              title: 'Sync every minute',
              instruction: 'sync treasury balances',
              minutes: 1,
            },
          },
        ],
        automationRuns: [
          {
            automationId: 'automation-1',
            runId: 'run-automation-1',
            executionId: 'execution-automation-1',
            status: 'scheduled',
            scheduledAt: new Date(currentTime - 60_000),
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

      await createAgentRuntime({
        model: createModel('int-model'),
        systemPrompt: 'You are an automation agent.',
        now: () => currentTime,
        agentOptions: {
          streamFn: (_model, context) => {
            const latestToolResult = [...context.messages]
              .reverse()
              .find((message: Message) => message.role === 'toolResult');
            if (latestToolResult) {
              return createTextStream('Operator input requested.');
            }

            const latestUserMessage = [...context.messages]
              .reverse()
              .find((message: Message) => message.role === 'user');
            if (latestUserMessage?.content === 'sync treasury balances') {
              return createToolStream({
                toolName: AGENT_RUNTIME_REQUEST_OPERATOR_INPUT_TOOL,
                toolCallId: 'tool-operator-input',
                args: {
                  message: 'Approve scheduled balance sync.',
                },
              });
            }
            return createTextStream('Idle.');
          },
        },
        __internalPostgres: createInternalPostgresHooks({
          loadInspectionState: vi.fn(async () => inspectionState),
          executeStatements,
        }),
      } as any);

      await vi.advanceTimersByTimeAsync(1_100);

      const statements = executeStatements.mock.calls.flatMap((call) => call[1]);
      expect(statements).toContainEqual(
        expect.objectContaining({
          tableName: 'pi_interrupts',
          values: [
            expect.any(String),
            'thread-record-1',
            'execution-automation-1',
            'input-required',
            'pending',
            true,
            '{}',
            expect.any(Date),
          ],
        }),
      );
      expect(statements).not.toContainEqual(
        expect.objectContaining({
          tableName: 'pi_interrupts',
          values: expect.arrayContaining([
            expect.stringContaining('automation:automation-1:run:run-automation-1'),
          ]),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('times out a stale active automation run instead of starting a concurrent invocation', async () => {
    vi.useFakeTimers();

    try {
      const currentTime = Date.parse('2026-03-20T00:20:00.000Z');
      const observedScheduledUserMessages: string[] = [];
      const executeStatements = vi.fn(async () => undefined);
      const inspectionState = {
        threads: [
          {
            threadId: 'thread-record-1',
            threadKey: 'thread-1',
            threadState: {
              thread: {
                id: 'thread-1',
              },
              execution: {
                id: 'execution-thread-1',
                status: 'completed',
              },
            },
          },
        ],
        executions: [],
        automations: [
          {
            automationId: 'automation-1',
            threadId: 'thread-record-1',
            commandName: 'Sync every minute',
            nextRunAt: new Date(currentTime - 1_000),
            suspended: false,
            schedulePayload: {
              title: 'Sync every minute',
              instruction: 'sync treasury balances',
              minutes: 1,
              timeoutMinutes: 15,
            },
          },
        ],
        automationRuns: [
          {
            automationId: 'automation-1',
            runId: 'run-automation-stale',
            executionId: 'execution-automation-stale',
            status: 'running',
            scheduledAt: new Date(currentTime - 20 * 60_000),
            startedAt: new Date(currentTime - 20 * 60_000),
            completedAt: null,
          },
        ],
        interrupts: [],
        leases: [],
        outboxIntents: [],
        executionEvents: [],
        threadActivities: [],
      };
      const internalPostgres = createInternalPostgresHooks({
        loadInspectionState: vi.fn(async () => inspectionState),
        executeStatements,
      });

      await createAgentRuntime({
        model: createModel('int-model'),
        systemPrompt: 'You are an automation agent.',
        now: () => currentTime,
        agentOptions: {
          streamFn: (_model, context) => {
            const latestUserMessage = [...context.messages]
              .reverse()
              .find((message: Message) => message.role === 'user');
            if (latestUserMessage) {
              observedScheduledUserMessages.push(
                typeof latestUserMessage.content === 'string'
                  ? latestUserMessage.content
                  : JSON.stringify(latestUserMessage.content),
              );
            }

            return createTextStream('Should not run concurrently.');
          },
        },
        __internalPostgres: internalPostgres,
      } as any);

      await vi.advanceTimersByTimeAsync(1_100);

      const statements = executeStatements.mock.calls.flatMap((call) => call[1]);
      expect(observedScheduledUserMessages).toEqual([]);
      expect(statements).toContainEqual(
        expect.objectContaining({
          tableName: 'pi_automation_runs',
          text: expect.stringContaining('update pi_automation_runs'),
          values: ['timed_out', expect.any(Date), expect.any(Date), 'run-automation-stale'],
        }),
      );
      expect(statements).toContainEqual(
        expect.objectContaining({
          tableName: 'pi_execution_events',
          text: expect.stringContaining('insert into pi_execution_events'),
          values: [
            expect.any(String),
            'execution-automation-stale',
            'thread-record-1',
            'automation-timed-out',
            expect.stringContaining('Exceeded the 15 minute scheduled automation timeout.'),
            expect.any(Date),
          ],
        }),
      );
      expect(statements).toContainEqual(
        expect.objectContaining({
          tableName: 'pi_automation_runs',
          text: expect.stringContaining('insert into pi_automation_runs'),
          values: [
            expect.any(String),
            'automation-1',
            'thread-record-1',
            expect.any(String),
            'scheduled',
            new Date(currentTime + 60_000),
            null,
          ],
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks a same-process hung scheduled invocation timed out without waiting for the agent stream to return', async () => {
    vi.useFakeTimers();

    try {
      let currentTime = Date.parse('2026-03-20T00:20:00.000Z');
      const terminalTime = Date.parse('2026-03-20T00:22:00.000Z');
      const observedScheduledUserMessages: string[] = [];
      let invocationAbortObserved = false;
      const executeStatements = vi.fn(async () => undefined);
      const inspectionState = {
        threads: [
          {
            threadId: 'thread-record-1',
            threadKey: 'thread-1',
            threadState: {
              thread: {
                id: 'thread-1',
              },
              execution: {
                id: 'execution-thread-1',
                status: 'completed',
              },
            },
          },
        ],
        executions: [],
        automations: [
          {
            automationId: 'automation-1',
            threadId: 'thread-record-1',
            commandName: 'Sync every minute',
            nextRunAt: new Date(currentTime - 1_000),
            suspended: false,
            schedulePayload: {
              title: 'Sync every minute',
              instruction: 'sync treasury balances',
              minutes: 1,
              timeoutMinutes: 0.001,
            },
          },
        ],
        automationRuns: [
          {
            automationId: 'automation-1',
            runId: 'run-automation-1',
            executionId: 'execution-automation-1',
            status: 'scheduled',
            scheduledAt: new Date(currentTime - 60_000),
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
      const internalPostgres = createInternalPostgresHooks({
        loadInspectionState: vi.fn(async () => inspectionState),
        executeStatements,
      });

      await createAgentRuntime({
        model: createModel('int-model'),
        systemPrompt: 'You are an automation agent.',
        now: () => currentTime,
        agentOptions: {
          streamFn: (_model, context, streamOptions) => {
            const latestUserMessage = [...context.messages]
              .reverse()
              .find((message: Message) => message.role === 'user');
            if (latestUserMessage) {
              const content =
                typeof latestUserMessage.content === 'string'
                  ? latestUserMessage.content
                  : JSON.stringify(latestUserMessage.content);
              observedScheduledUserMessages.push(content);
              currentTime = terminalTime;
            }

            if (streamOptions?.signal?.aborted) {
              invocationAbortObserved = true;
            } else {
              streamOptions?.signal?.addEventListener('abort', () => {
                invocationAbortObserved = true;
              }, { once: true });
            }

            return createNeverEndingStream() as unknown as ReturnType<typeof createTextStream>;
          },
        },
        __internalPostgres: internalPostgres,
      } as any);

      await vi.advanceTimersByTimeAsync(1_100);

      const statements = executeStatements.mock.calls.flatMap((call) => call[1]);
      expect(observedScheduledUserMessages).toEqual(['sync treasury balances']);
      expect(invocationAbortObserved).toBe(true);
      expect(statements).toContainEqual(
        expect.objectContaining({
          tableName: 'pi_automation_runs',
          text: expect.stringContaining('update pi_automation_runs'),
          values: ['timed_out', new Date(terminalTime), new Date(terminalTime), 'run-automation-1'],
        }),
      );
      expect(statements).toContainEqual(
        expect.objectContaining({
          tableName: 'pi_thread_activity',
          text: expect.stringContaining('insert into pi_thread_activity'),
          values: [
            expect.any(String),
            'thread-record-1',
            'execution-automation-1',
            'automation-timed-out',
            expect.stringContaining('Exceeded the 0.001 minute scheduled automation timeout.'),
            new Date(terminalTime),
          ],
        }),
      );
      expect(statements).toContainEqual(
        expect.objectContaining({
          tableName: 'pi_automation_runs',
          text: expect.stringContaining('insert into pi_automation_runs'),
          values: [
            expect.any(String),
            'automation-1',
            'thread-record-1',
            expect.any(String),
            'scheduled',
            new Date(terminalTime + 60_000),
            null,
          ],
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses terminal decision time for completed scheduled automation persistence and cadence', async () => {
    vi.useFakeTimers();

    try {
      let currentTime = Date.parse('2026-03-20T00:20:00.000Z');
      const terminalTime = Date.parse('2026-03-20T00:22:00.000Z');
      const executeStatements = vi.fn(async () => undefined);
      const inspectionState = {
        threads: [
          {
            threadId: 'thread-record-1',
            threadKey: 'thread-1',
            threadState: {
              thread: {
                id: 'thread-1',
              },
              execution: {
                id: 'execution-thread-1',
                status: 'completed',
              },
            },
          },
        ],
        executions: [],
        automations: [
          {
            automationId: 'automation-1',
            threadId: 'thread-record-1',
            commandName: 'Sync every minute',
            nextRunAt: new Date(currentTime - 1_000),
            suspended: false,
            schedulePayload: {
              title: 'Sync every minute',
              instruction: 'sync treasury balances',
              minutes: 1,
              timeoutMinutes: 15,
            },
          },
        ],
        automationRuns: [
          {
            automationId: 'automation-1',
            runId: 'run-automation-1',
            executionId: 'execution-automation-1',
            status: 'scheduled',
            scheduledAt: new Date(currentTime - 60_000),
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
      const internalPostgres = createInternalPostgresHooks({
        loadInspectionState: vi.fn(async () => inspectionState),
        executeStatements,
      });

      await createAgentRuntime({
        model: createModel('int-model'),
        systemPrompt: 'You are an automation agent.',
        now: () => currentTime,
        agentOptions: {
          streamFn: (_model, context) => {
            const latestUserMessage = [...context.messages]
              .reverse()
              .find((message: Message) => message.role === 'user');
            if (latestUserMessage?.content === 'sync treasury balances') {
              currentTime = terminalTime;
            }

            return createTextStream('Scheduled run complete.');
          },
        },
        __internalPostgres: internalPostgres,
      } as any);

      await vi.advanceTimersByTimeAsync(1_100);

      const statements = executeStatements.mock.calls.flatMap((call) => call[1]);
      expect(statements).toContainEqual(
        expect.objectContaining({
          tableName: 'pi_automation_runs',
          text: expect.stringContaining('update pi_automation_runs'),
          values: ['completed', new Date(terminalTime), new Date(terminalTime), 'run-automation-1'],
        }),
      );
      expect(statements).toContainEqual(
        expect.objectContaining({
          tableName: 'pi_automation_runs',
          text: expect.stringContaining('insert into pi_automation_runs'),
          values: [
            expect.any(String),
            'automation-1',
            'thread-record-1',
            expect.any(String),
            'scheduled',
            new Date(terminalTime + 60_000),
            null,
          ],
        }),
      );
      expect(statements).toContainEqual(
        expect.objectContaining({
          tableName: 'pi_thread_activity',
          text: expect.stringContaining('insert into pi_thread_activity'),
          values: [
            expect.any(String),
            'thread-record-1',
            'execution-automation-1',
            'automation-executed',
            expect.stringContaining('2026-03-20T00:23:00.000Z'),
            new Date(terminalTime),
          ],
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports persisted automation last-run status and timestamp in automation.list', async () => {
    const currentTime = Date.parse('2026-03-20T00:20:00.000Z');
    const observedToolResults: string[] = [];
    const inspectionState = {
      threads: [],
      executions: [],
      automations: [
        {
          automationId: 'automation-1',
          threadId: 'd877526e-beed-5450-a4f4-6c2e0c37edcf',
          commandName: 'Sync every minute',
          nextRunAt: new Date(currentTime + 60_000),
          suspended: false,
          schedulePayload: {
            title: 'Sync every minute',
            instruction: 'sync treasury balances',
            minutes: 1,
          },
        },
      ],
      automationRuns: [
        {
          automationId: 'automation-1',
          runId: 'run-automation-previous',
          executionId: 'execution-automation-previous',
          status: 'completed',
          scheduledAt: new Date(currentTime - 120_000),
          startedAt: new Date(currentTime - 119_000),
          completedAt: new Date(currentTime - 110_000),
        },
        {
          automationId: 'automation-1',
          runId: 'run-automation-next',
          executionId: 'execution-automation-next',
          status: 'scheduled',
          scheduledAt: new Date(currentTime + 60_000),
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
    const internalPostgres = createInternalPostgresHooks({
      loadInspectionState: vi.fn(async () => inspectionState),
    });

    const runtime = await createAgentRuntime({
      model: createModel('int-model'),
      systemPrompt: 'You are an automation agent.',
      now: () => currentTime,
      agentOptions: {
        streamFn: (_model, context) => {
          const latestToolResult = [...context.messages]
            .reverse()
            .find((message: Message) => message.role === 'toolResult');
          if (latestToolResult) {
            observedToolResults.push(JSON.stringify(latestToolResult));
            return createTextStream('Listed automations.');
          }

          return createToolStream({
            toolName: 'automation_list',
            toolCallId: 'tool-automation-list',
            args: {
              state: 'active',
              limit: 20,
            },
          });
        },
      },
      __internalPostgres: internalPostgres,
    } as any);

    await collectEventSource(
      await runtime.service.run({
        threadId: 'thread-1',
        runId: 'run-list',
        messages: [
          {
            id: 'message-list',
            role: 'user',
            content: 'List my automations.',
          },
        ],
      }),
    );

    const toolResultText = observedToolResults.join('\n');
    expect(toolResultText).toContain('lastRunStatus');
    expect(toolResultText).toContain('completed');
    expect(toolResultText).toContain('2026-03-20T00:18:10.000Z');
  });

  it('rehydrates persisted transcript before reconnect snapshots after process restart', async () => {
    const { hooks: internalPostgres } = createPersistingInternalPostgres();

    const runtimeA = await createAgentRuntime({
      model: createModel('int-model'),
      systemPrompt: 'You are a persistence agent.',
      agentOptions: {
        streamFn: () => createTextStream('Hello back from persisted state.'),
      },
      __internalPostgres: internalPostgres,
    } as any);

    await collectEventSource(
      await runtimeA.service.run({
        threadId: 'thread-1',
        runId: 'run-initial',
        messages: [
          {
            id: 'message-1',
            role: 'user',
            content: 'Hello from persisted thread.',
          },
        ],
      }),
    );

    const runtimeB = await createAgentRuntime({
      model: createModel('int-model'),
      systemPrompt: 'You are a persistence agent.',
      agentOptions: {
        streamFn: () => createTextStream('Unused after reconnect.'),
      },
      __internalPostgres: internalPostgres,
    } as any);

    const reconnectMessages = await readFirstMatchingEvent(
      await runtimeB.service.connect({
        threadId: 'thread-1',
        runId: 'run-reconnect',
      }),
      isMessagesSnapshotEvent,
    );
    expect(reconnectMessages).toBeDefined();
    expect(reconnectMessages!.messages.length).toBeGreaterThanOrEqual(2);
    expect(reconnectMessages!.messages).toContainEqual(
      expect.objectContaining({
        role: 'user',
        content: 'Hello from persisted thread.',
      }),
    );
    expect(
      reconnectMessages!.messages.some(
        (message) => typeof message === 'object' && message !== null && 'role' in message && message.role === 'assistant',
      ),
    ).toBe(true);
  });

  it('rehydrates persisted domain state before rebuilding system prompt after process restart', async () => {
    const { hooks: internalPostgres } = createPersistingInternalPostgres();

    const runtimeA = await createAgentRuntime({
      model: createModel('int-model'),
      systemPrompt: 'You are a persistence agent.',
      domain: createLifecycleDomain(),
      agentOptions: {
        streamFn: () => createTextStream('Unused for direct command.'),
      },
      __internalPostgres: internalPostgres,
    } as any);

    await collectEventSource(
      await runtimeA.service.run({
        threadId: 'thread-domain-state',
        runId: 'run-domain-state-hire',
        forwardedProps: {
          command: {
            name: 'hire',
          },
        },
      }),
    );

    const observedSystemPrompts: string[] = [];
    const runtimeB = await createAgentRuntime({
      model: createModel('int-model'),
      systemPrompt: 'You are a persistence agent.',
      domain: createLifecycleDomain(),
      agentOptions: {
        streamFn: (_model, context) => {
          observedSystemPrompts.push(context.systemPrompt ?? '');
          return createTextStream('Prompt rebuilt after restart.');
        },
      },
      __internalPostgres: internalPostgres,
    } as any);

    await collectEventSource(
      await runtimeB.service.run({
        threadId: 'thread-domain-state',
        runId: 'run-domain-state-after-restart',
        messages: [
          {
            id: 'message-domain-state-after-restart',
            role: 'user',
            content: 'What state are you in?',
          },
        ],
      }),
    );

    expect(
      hasSystemPromptFragments(observedSystemPrompts, [
        'You are a persistence agent.',
        'Lifecycle phase: onboarding.',
      ]),
    ).toBe(true);
  });

  it('recovers domain state from persisted thread lifecycle when the dedicated domain-state blob is missing', async () => {
    const { persistedThreads, hooks: internalPostgres } = createPersistingInternalPostgres();

    const runtimeA = await createAgentRuntime({
      model: createModel('int-model'),
      systemPrompt: 'You are a persistence agent.',
      domain: createLifecycleDomain(),
      agentOptions: {
        streamFn: () => createTextStream('Unused for direct command.'),
      },
      __internalPostgres: internalPostgres,
    } as any);

    await collectEventSource(
      await runtimeA.service.run({
        threadId: 'thread-legacy-lifecycle',
        runId: 'run-legacy-lifecycle-hire',
        forwardedProps: {
          command: {
            name: 'hire',
          },
        },
      }),
    );

    const persistedThread = persistedThreads.get('thread-legacy-lifecycle');
    expect(persistedThread).toBeDefined();
    if (!persistedThread) {
      return;
    }

    const legacyThreadState = {
      ...persistedThread.threadState,
    };
    delete legacyThreadState.__agentRuntimeDomainState;
    persistedThreads.set('thread-legacy-lifecycle', {
      ...persistedThread,
      threadState: legacyThreadState,
    });

    const observedSystemPrompts: string[] = [];
    const runtimeB = await createAgentRuntime({
      model: createModel('int-model'),
      systemPrompt: 'You are a persistence agent.',
      domain: createLifecycleDomain(),
      agentOptions: {
        streamFn: (_model, context) => {
          observedSystemPrompts.push(context.systemPrompt ?? '');
          return createTextStream('Recovered from legacy lifecycle state.');
        },
      },
      __internalPostgres: internalPostgres,
    } as any);

    await collectEventSource(
      await runtimeB.service.run({
        threadId: 'thread-legacy-lifecycle',
        runId: 'run-legacy-lifecycle-after-restart',
        messages: [
          {
            id: 'message-legacy-lifecycle-after-restart',
            role: 'user',
            content: 'What state are you in?',
          },
        ],
      }),
    );

    expect(
      hasSystemPromptFragments(observedSystemPrompts, [
        'You are a persistence agent.',
        'Lifecycle phase: onboarding.',
      ]),
    ).toBe(true);

    const migratedThreadState = persistedThreads.get('thread-legacy-lifecycle')?.threadState;
    expect(migratedThreadState).toMatchObject({
      __agentRuntimeDomainState: {
        phase: 'onboarding',
        onboardingStep: 'operator-profile',
        operatorNote: null,
      },
    });
  });

  it('keeps persisted execution and interrupt checkpoints aligned across interrupt, resume, and completion', async () => {
    const { persistedExecutions, persistedInterrupts, hooks: internalPostgres } =
      createPersistingInternalPostgres();

    const runtime = await createAgentRuntime({
      model: createModel('int-model'),
      systemPrompt: 'You are a lifecycle agent.',
      domain: createLifecycleDomain(),
      agentOptions: {
        streamFn: () => createTextStream('Unused after direct commands.'),
      },
      __internalPostgres: internalPostgres,
    } as any);

    await collectEventSource(
      await runtime.service.run({
        threadId: 'thread-checkpoint-alignment',
        runId: 'run-hire-checkpoint-alignment',
        forwardedProps: {
          command: {
            name: 'hire',
          },
        },
      }),
    );

    expect(persistedExecutions.size).toBe(1);
    const persistedExecution = [...persistedExecutions.values()][0];
    expect(persistedExecution).toMatchObject({
      status: 'interrupted',
    });
    expect(persistedExecution?.currentInterruptId).toBeTruthy();
    expect([...persistedInterrupts.values()]).toEqual([
      expect.objectContaining({
        executionId: persistedExecution?.executionId,
        interruptId: persistedExecution?.currentInterruptId,
        status: 'pending',
      }),
    ]);

    await collectEventSource(
      await runtime.service.run({
        threadId: 'thread-checkpoint-alignment',
        runId: 'run-resume-checkpoint-alignment',
        forwardedProps: {
          command: {
            resume: {
              operatorNote: 'safe window approved',
            },
          },
        },
      }),
    );

    expect([...persistedExecutions.values()][0]).toMatchObject({
      status: 'working',
      currentInterruptId: null,
      completedAt: null,
    });
    expect([...persistedInterrupts.values()]).toEqual([
      expect.objectContaining({
        executionId: persistedExecution?.executionId,
        status: 'resolved',
      }),
    ]);

    await collectEventSource(
      await runtime.service.run({
        threadId: 'thread-checkpoint-alignment',
        runId: 'run-complete-checkpoint-alignment',
        forwardedProps: {
          command: {
            name: 'complete_onboarding',
          },
        },
      }),
    );

    expect([...persistedExecutions.values()][0]).toMatchObject({
      status: 'completed',
      currentInterruptId: null,
      completedAt: expect.any(Date),
    });
    expect(
      [...persistedInterrupts.values()].filter((interrupt) => interrupt.status === 'pending'),
    ).toHaveLength(0);
  });

  it('routes resume through the declared interrupt even after a later non-interrupt artifact overwrites artifacts.current', async () => {
    const { persistedThreads, hooks: internalPostgres } = createPersistingInternalPostgres();
    const runtime = await createAgentRuntime({
      model: createModel('int-model'),
      systemPrompt: 'You are a lifecycle agent.',
      domain: createLifecycleDomain(),
      agentOptions: {
        streamFn: () => createTextStream('Model fallback should not run for interrupt resume.'),
      },
      __internalPostgres: internalPostgres,
    } as any);

    await collectEventSource(
      await runtime.service.run({
        threadId: 'thread-resume-after-artifact-overwrite',
        runId: 'run-hire-after-artifact-overwrite',
        forwardedProps: {
          command: {
            name: 'hire',
          },
        },
      }),
    );

    await collectEventSource(
      await runtime.service.run({
        threadId: 'thread-resume-after-artifact-overwrite',
        runId: 'run-refresh-after-artifact-overwrite',
        forwardedProps: {
          command: {
            name: 'refresh_status',
          },
        },
      }),
    );

    expect(
      persistedThreads.get('thread-resume-after-artifact-overwrite')?.threadState,
    ).toMatchObject({
      artifacts: {
        current: {
          data: {
            type: 'lifecycle-status',
          },
        },
      },
      activityEvents: expect.arrayContaining([
        expect.objectContaining({
          type: 'artifact',
          artifact: expect.objectContaining({
            data: expect.objectContaining({
              type: 'interrupt-status',
              status: 'pending',
              interruptType: 'operator-config',
            }),
          }),
        }),
      ]),
    });

    const resumeEvents = await collectQueuedEvents(
      await runtime.service.run({
        threadId: 'thread-resume-after-artifact-overwrite',
        runId: 'run-resume-after-artifact-overwrite',
        forwardedProps: {
          command: {
            resume: {
              operatorNote: 'safe window approved',
            },
          },
        },
      }),
    );

    const resolvedInterruptSnapshot = findStateSnapshotEvent(
      resumeEvents,
      (event) => event.snapshot.thread.artifacts.current?.data?.status === 'resolved',
    );
    const domainResumeSnapshot = findStateSnapshotEvent(
      resumeEvents,
      (event) => event.snapshot.thread.lifecycle?.onboardingStep === 'delegation-note',
    );

    expect(resolvedInterruptSnapshot).toBeDefined();
    expect(domainResumeSnapshot).toBeDefined();
    expect(domainResumeSnapshot!.snapshot.thread.lifecycle).toMatchObject({
      onboardingStep: 'delegation-note',
      operatorNote: 'safe window approved',
    });
    expect(resolvedInterruptSnapshot!.snapshot.thread.task?.taskStatus).toMatchObject({
      state: 'working',
    });
    expect(
      (resolvedInterruptSnapshot!.snapshot.thread.activity?.events ?? []).some(
        (event) =>
          event.type === 'artifact' &&
          typeof event.artifact?.data === 'object' &&
          event.artifact.data !== null &&
          'type' in event.artifact.data &&
          event.artifact.data.type === 'interrupt-status' &&
          'status' in event.artifact.data &&
          event.artifact.data.status === 'resolved' &&
          'interruptType' in event.artifact.data &&
          event.artifact.data.interruptType === 'operator-config',
      ),
    ).toBe(true);
    expect(domainResumeSnapshot!.snapshot.thread.task?.taskStatus.message).toMatchObject({
      content: 'Operator note captured. Ready to complete onboarding.',
    });

    expect(
      persistedThreads.get('thread-resume-after-artifact-overwrite')?.threadState,
    ).toMatchObject({
      activityEvents: expect.arrayContaining([
        expect.objectContaining({
          type: 'artifact',
          artifact: expect.objectContaining({
            data: expect.objectContaining({
              type: 'interrupt-status',
              status: 'resolved',
              interruptType: 'operator-config',
            }),
          }),
        }),
      ]),
    });
  });

  it('routes resume through the declared interrupt when the AG-UI client sends empty request scaffolding', async () => {
    const { persistedThreads, hooks: internalPostgres } = createPersistingInternalPostgres();
    const runtime = await createAgentRuntime({
      model: createModel('int-model'),
      systemPrompt: 'You are a lifecycle agent.',
      domain: createLifecycleDomain(),
      agentOptions: {
        streamFn: () => createTextStream('Model fallback should not run for interrupt resume.'),
      },
      __internalPostgres: internalPostgres,
    } as any);

    await collectEventSource(
      await runtime.service.run({
        threadId: 'thread-resume-with-client-scaffolding',
        runId: 'run-hire-with-client-scaffolding',
        forwardedProps: {
          command: {
            name: 'hire',
          },
        },
      }),
    );

    const resumeEvents = await collectQueuedEvents(
      await runtime.service.run({
        threadId: 'thread-resume-with-client-scaffolding',
        runId: 'run-resume-with-client-scaffolding',
        messages: [],
        state: {},
        tools: [],
        context: [],
        forwardedProps: {
          command: {
            resume: {
              operatorNote: 'safe window approved',
            },
          },
        },
      }),
    );

    const domainResumeSnapshot = findStateSnapshotEvent(
      resumeEvents,
      (event) => event.snapshot.thread.lifecycle?.onboardingStep === 'delegation-note',
    );

    expect(domainResumeSnapshot).toBeDefined();
    expect(domainResumeSnapshot!.snapshot.thread.lifecycle).toMatchObject({
      operatorNote: 'safe window approved',
    });
    expect(domainResumeSnapshot!.snapshot.thread.task?.taskStatus.message).toMatchObject({
      content: 'Operator note captured. Ready to complete onboarding.',
    });
    expect(
      persistedThreads.get('thread-resume-with-client-scaffolding')?.threadState,
    ).toMatchObject({
      activityEvents: expect.arrayContaining([
        expect.objectContaining({
          type: 'artifact',
          artifact: expect.objectContaining({
            data: expect.objectContaining({
              type: 'interrupt-status',
              status: 'resolved',
            }),
          }),
        }),
      ]),
    });
  });

  it('repairs stale pending interrupt artifacts during reconnect hydration when execution is no longer interrupted', async () => {
    const { persistedThreads, hooks: internalPostgres } = createPersistingInternalPostgres();

    const runtimeA = await createAgentRuntime({
      model: createModel('int-model'),
      systemPrompt: 'You are a lifecycle agent.',
      domain: createLifecycleDomain(),
      agentOptions: {
        streamFn: () => createTextStream('Unused after direct commands.'),
      },
      __internalPostgres: internalPostgres,
    } as any);

    await collectEventSource(
      await runtimeA.service.run({
        threadId: 'thread-hydrate-stale-pending-interrupt',
        runId: 'run-hydrate-stale-pending-interrupt-hire',
        forwardedProps: {
          command: {
            name: 'hire',
          },
        },
      }),
    );

    const persistedThread = persistedThreads.get('thread-hydrate-stale-pending-interrupt');
    expect(persistedThread).toBeDefined();
    if (!persistedThread) {
      return;
    }

    persistedThreads.set('thread-hydrate-stale-pending-interrupt', {
      ...persistedThread,
      threadState: {
        ...persistedThread.threadState,
        execution: {
          ...(persistedThread.threadState.execution as Record<string, unknown>),
          status: 'failed',
          statusMessage: 'Reconnect should repair the stale pending interrupt.',
        },
      },
      updatedAt: new Date('2026-03-20T17:00:00.000Z'),
    });

    const runtimeB = await createAgentRuntime({
      model: createModel('int-model'),
      systemPrompt: 'You are a lifecycle agent.',
      domain: createLifecycleDomain(),
      agentOptions: {
        streamFn: () => createTextStream('Unused after reconnect.'),
      },
      __internalPostgres: internalPostgres,
    } as any);

    const reconnectSnapshot = await readFirstMatchingEvent(
      await runtimeB.service.connect({
        threadId: 'thread-hydrate-stale-pending-interrupt',
        runId: 'run-hydrate-stale-pending-interrupt-reconnect',
      }),
      isStateSnapshotEvent,
    );

    expect(reconnectSnapshot).toBeDefined();
    expect(reconnectSnapshot!.snapshot.thread.activity.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'artifact',
          artifact: expect.objectContaining({
            data: expect.objectContaining({
              type: 'interrupt-status',
              status: 'resolved',
              interruptType: 'operator-config',
            }),
          }),
        }),
      ]),
    );
    expect(persistedThreads.get('thread-hydrate-stale-pending-interrupt')?.threadState).toMatchObject({
      execution: {
        status: 'failed',
        statusMessage: 'Reconnect should repair the stale pending interrupt.',
      },
      activityEvents: expect.arrayContaining([
        expect.objectContaining({
          type: 'artifact',
          artifact: expect.objectContaining({
            data: expect.objectContaining({
              type: 'interrupt-status',
              status: 'resolved',
              interruptType: 'operator-config',
            }),
          }),
        }),
      ]),
    });
    expect(
      persistedThreads.get('thread-hydrate-stale-pending-interrupt')?.threadState,
    ).not.toHaveProperty('a2ui');
  });

  it('normalizes legacy surfacedInThread interrupt artifacts during reconnect repair', async () => {
    const { persistedThreads, hooks: internalPostgres } = createPersistingInternalPostgres();

    const runtimeA = await createAgentRuntime({
      model: createModel('int-model'),
      systemPrompt: 'You are a lifecycle agent.',
      domain: createLifecycleDomain(),
      agentOptions: {
        streamFn: () => createTextStream('Unused after direct commands.'),
      },
      __internalPostgres: internalPostgres,
    } as any);

    await collectEventSource(
      await runtimeA.service.run({
        threadId: 'thread-hydrate-legacy-surfaced-flag',
        runId: 'run-hydrate-legacy-surfaced-flag-hire',
        forwardedProps: {
          command: {
            name: 'hire',
          },
        },
      }),
    );

    const persistedThread = persistedThreads.get('thread-hydrate-legacy-surfaced-flag');
    expect(persistedThread).toBeDefined();
    if (!persistedThread) {
      return;
    }

    const currentArtifact = persistedThread.threadState.artifacts?.current;
    expect(currentArtifact).toBeDefined();
    if (!currentArtifact) {
      return;
    }

    const currentData =
      typeof currentArtifact.data === 'object' && currentArtifact.data !== null
        ? (currentArtifact.data as Record<string, unknown>)
        : null;
    expect(currentData).toBeTruthy();
    if (!currentData) {
      return;
    }

    const legacyInterruptData = {
      ...currentData,
      status: 'pending',
      surfacedInThread: false,
    } as Record<string, unknown>;
    delete legacyInterruptData['mirroredToActivity'];

    persistedThreads.set('thread-hydrate-legacy-surfaced-flag', {
      ...persistedThread,
      threadState: {
        ...persistedThread.threadState,
        execution: {
          ...(persistedThread.threadState.execution as Record<string, unknown>),
          status: 'completed',
          statusMessage: 'Reconnect should normalize the legacy interrupt metadata.',
        },
        artifacts: {
          ...(persistedThread.threadState.artifacts as Record<string, unknown>),
          current: {
            ...currentArtifact,
            data: legacyInterruptData,
          },
          activity: {
            ...currentArtifact,
            data: legacyInterruptData,
          },
        },
        activityEvents: [],
        a2ui: undefined,
      },
      updatedAt: new Date('2026-03-20T17:05:00.000Z'),
    });

    const runtimeB = await createAgentRuntime({
      model: createModel('int-model'),
      systemPrompt: 'You are a lifecycle agent.',
      domain: createLifecycleDomain(),
      agentOptions: {
        streamFn: () => createTextStream('Unused after reconnect.'),
      },
      __internalPostgres: internalPostgres,
    } as any);

    const reconnectSnapshot = await readFirstMatchingEvent(
      await runtimeB.service.connect({
        threadId: 'thread-hydrate-legacy-surfaced-flag',
        runId: 'run-hydrate-legacy-surfaced-flag-reconnect',
      }),
      isStateSnapshotEvent,
    );

    expect(reconnectSnapshot).toBeDefined();
    expect(reconnectSnapshot!.snapshot.thread.activity?.events ?? []).toEqual([]);

    const repairedThreadState = persistedThreads.get('thread-hydrate-legacy-surfaced-flag')?.threadState;
    const repairedActivityData =
      repairedThreadState &&
      repairedThreadState.artifacts &&
      typeof repairedThreadState.artifacts === 'object' &&
      repairedThreadState.artifacts !== null &&
      'activity' in repairedThreadState.artifacts &&
      typeof repairedThreadState.artifacts.activity === 'object' &&
      repairedThreadState.artifacts.activity !== null &&
      'data' in repairedThreadState.artifacts.activity &&
      typeof repairedThreadState.artifacts.activity.data === 'object' &&
      repairedThreadState.artifacts.activity.data !== null
        ? (repairedThreadState.artifacts.activity.data as Record<string, unknown>)
        : null;

    expect(repairedActivityData).toMatchObject({
      type: 'interrupt-status',
      status: 'resolved',
      mirroredToActivity: false,
    });
    expect(repairedActivityData).not.toHaveProperty('surfacedInThread');
  });

  it('repairs drifted execution and interrupt checkpoints when reconnect hydrates persisted thread state after restart', async () => {
    const { persistedExecutions, persistedInterrupts, hooks: internalPostgres } =
      createPersistingInternalPostgres();

    const runtimeA = await createAgentRuntime({
      model: createModel('int-model'),
      systemPrompt: 'You are a lifecycle agent.',
      domain: createLifecycleDomain(),
      agentOptions: {
        streamFn: () => createTextStream('Unused after direct commands.'),
      },
      __internalPostgres: internalPostgres,
    } as any);

    await collectEventSource(
      await runtimeA.service.run({
        threadId: 'thread-hydrate-repair',
        runId: 'run-hydrate-repair-hire',
        forwardedProps: {
          command: {
            name: 'hire',
          },
        },
      }),
    );

    const persistedExecution = [...persistedExecutions.values()][0];
    const originalInterrupt = [...persistedInterrupts.values()][0];
    expect(persistedExecution).toBeDefined();
    expect(originalInterrupt).toBeDefined();
    if (!persistedExecution || !originalInterrupt) {
      return;
    }

    persistedExecutions.set(persistedExecution.executionId, {
      ...persistedExecution,
      status: 'working',
      currentInterruptId: 'interrupt-stale',
      updatedAt: new Date('2026-03-20T17:00:00.000Z'),
    });
    persistedInterrupts.set(originalInterrupt.interruptId, {
      ...originalInterrupt,
      status: 'resolved',
      resolvedAt: new Date('2026-03-20T17:00:00.000Z'),
    });
    persistedInterrupts.set('interrupt-stale', {
      interruptId: 'interrupt-stale',
      threadId: originalInterrupt.threadId,
      executionId: originalInterrupt.executionId,
      status: 'pending',
      mirroredToActivity: true,
      createdAt: new Date('2026-03-20T17:00:00.000Z'),
      resolvedAt: null,
    });

    const runtimeB = await createAgentRuntime({
      model: createModel('int-model'),
      systemPrompt: 'You are a lifecycle agent.',
      domain: createLifecycleDomain(),
      agentOptions: {
        streamFn: () => createTextStream('Unused after reconnect.'),
      },
      __internalPostgres: internalPostgres,
    } as any);

    const reconnectSnapshot = await readFirstMatchingEvent(
      await runtimeB.service.connect({
        threadId: 'thread-hydrate-repair',
        runId: 'run-hydrate-repair-reconnect',
      }),
      isStateSnapshotEvent,
    );

    expect(reconnectSnapshot).toBeDefined();
    expect([...persistedExecutions.values()][0]).toMatchObject({
      status: 'interrupted',
      currentInterruptId: originalInterrupt.interruptId,
      completedAt: null,
    });
    expect(persistedInterrupts.get(originalInterrupt.interruptId)).toMatchObject({
      status: 'pending',
      resolvedAt: null,
    });
    expect(persistedInterrupts.get('interrupt-stale')).toMatchObject({
      status: 'resolved',
      resolvedAt: expect.any(Date),
    });
  });

  it('persists failed execution state when a run stream crashes after start', async () => {
    const { persistedThreads, persistedExecutions, hooks: internalPostgres } =
      createPersistingInternalPostgres();
    const executeStatements = internalPostgres.executeStatements;
    const baseExecuteStatements = executeStatements.getMockImplementation();
    let failNextCheckpoint = true;
    executeStatements.mockImplementation(
      async (databaseUrl: string, statements: readonly InternalPostgresStatement[]) => {
        if (failNextCheckpoint) {
          failNextCheckpoint = false;
          throw new Error('Synthetic persistence failure.');
        }
        if (!baseExecuteStatements) {
          throw new Error('Missing base executeStatements implementation.');
        }
        await baseExecuteStatements(databaseUrl, statements);
      },
    );

    const runtime = await createAgentRuntime({
      model: createModel('int-model'),
      systemPrompt: 'You are a failing persistence agent.',
      agentOptions: {
        streamFn: () => createTextStream('This run should fail before inference completes.'),
      },
      __internalPostgres: internalPostgres,
    } as any);

    const failedRun = await collectEventSourceUntilFailure(
      await runtime.service.run({
        threadId: 'thread-failed-persistence-checkpoint',
        runId: 'run-failed-persistence-checkpoint',
        messages: [
          {
            id: 'message-failed-persistence-checkpoint',
            role: 'user',
            content: 'Trigger the failing checkpoint.',
          },
        ],
      }),
    );

    expect(failedRun.error?.message).toBe('Synthetic persistence failure.');
    expect([...persistedExecutions.values()][0]).toMatchObject({
      status: 'failed',
      currentInterruptId: null,
      completedAt: expect.any(Date),
    });
    expect(
      persistedThreads.get('thread-failed-persistence-checkpoint')?.threadState,
    ).toMatchObject({
      execution: {
        status: 'failed',
        statusMessage: 'Synthetic persistence failure.',
      },
    });
  });

  it('does not replay a stale attached run after a failed run stream', async () => {
    const persistenceFailure = new Error('Synthetic persistence failure.');
    const runtime = await createAgentRuntime({
      model: createModel('int-model'),
      systemPrompt: 'You are a failing persistence agent.',
      __internalPostgres: createInternalPostgresHooks({
        executeStatements: vi.fn(async () => {
          throw persistenceFailure;
        }),
      }),
    } as any);

    const failedRun = await collectEventSourceUntilFailure(
      await runtime.service.run({
        threadId: 'thread-failed-run-reconnect',
        runId: 'run-failed-run-reconnect',
        messages: [
          {
            id: 'message-failed-run-reconnect',
            role: 'user',
            content: 'Trigger the failing run.',
          },
        ],
      }),
    );

    expect(failedRun.error?.message).toBe('Synthetic persistence failure.');
    expect(
      failedRun.events.some(
        (event) =>
          isRunStartedEvent(event) &&
          'runId' in event &&
          event.runId === 'run-failed-run-reconnect',
      ),
    ).toBe(true);

    const reconnectEvents = await collectQueuedEvents(
      await runtime.service.connect({
        threadId: 'thread-failed-run-reconnect',
        runId: 'run-reconnect-after-failure',
      }),
    );

    expect(reconnectEvents.filter(isRunStartedEvent)).toEqual([
      expect.objectContaining({
        runId: 'run-reconnect-after-failure',
      }),
    ]);
  });
});

import { EventType } from '@ag-ui/core';
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Message,
  type Model,
} from '@mariozechner/pi-ai';
import { describe, expect, it, vi } from 'vitest';

import {
  AGENT_RUNTIME_DOMAIN_COMMAND_TOOL,
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
  surfacedInThread: boolean;
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
              surfacedInThread,
              _requestPayload,
              createdAt,
            ] = statement.values;
            persistedInterrupts.set(interruptId as string, {
              interruptId: interruptId as string,
              threadId: threadId as string,
              executionId: executionId as string,
              status: status as 'pending' | 'resolved',
              surfacedInThread: surfacedInThread as boolean,
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
): Promise<T[]> {
  if (Array.isArray(source)) {
    return Array.from(source);
  }

  const events: T[] = [];
  const iterator = source[Symbol.asyncIterator]();

  try {
    while (true) {
      const result = await Promise.race([
        iterator.next(),
        new Promise<'timeout'>((resolve) => {
          setTimeout(() => resolve('timeout'), timeoutMs);
        }),
      ]);

      if (result === 'timeout' || result.done) {
        break;
      }

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
          surfacedInThread: true,
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
                surfacedInThread: true,
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

    const hireDelta = hireEvents.find(isStateDeltaEvent);
    expect(latestUserText).toBe('Please hire the agent.');
    expect(
      hasSystemPromptFragments(observedSystemPrompts, [
        'You are a lifecycle agent.',
        'Lifecycle phase: prehire.',
      ]),
    ).toBe(true);
    expect(observedDomainCommandToolDescription).toContain('Available commands: hire (Start onboarding.)');
    expect(observedDomainCommandToolDescription).toContain('complete_onboarding (Finish onboarding.)');
    expect(observedDomainCommandNames).toEqual([
      'hire',
      'continue_onboarding',
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
    expect(hireDelta).toBeDefined();
    expect(hireDelta!.delta).toEqual(
      expect.arrayContaining([
        {
          op: 'replace',
          path: '/thread/lifecycle/phase',
          value: 'onboarding',
        },
        {
          op: 'add',
          path: '/thread/lifecycle/onboardingStep',
          value: 'operator-profile',
        },
        {
          op: 'replace',
          path: '/thread/task/taskStatus/state',
          value: 'input-required',
        },
        {
          op: 'add',
          path: '/thread/domainProjection',
          value: {
            managedLifecycle: {
              phase: 'onboarding',
              onboardingStep: 'operator-profile',
            },
          },
        },
      ]),
    );

    expect(persistedThreads.get('thread-1')?.threadState).toHaveProperty('a2ui');
    expect(persistedThreads.get('thread-1')?.threadState).toHaveProperty('domainProjection');

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

    const resumeDelta = resumeEvents.find(isStateDeltaEvent);

    expect(resumeDelta).toBeDefined();
    expect(resumeDelta!.delta).toEqual(
      expect.arrayContaining([
        {
          op: 'replace',
          path: '/thread/lifecycle/onboardingStep',
          value: 'delegation-note',
        },
        {
          op: 'replace',
          path: '/thread/lifecycle/operatorNote',
          value: 'safe window approved',
        },
        {
          op: 'replace',
          path: '/thread/task/taskStatus/state',
          value: 'working',
        },
        {
          op: 'add',
          path: '/thread/domainProjection/managedLifecycle/operatorNote',
          value: 'safe window approved',
        },
      ]),
    );

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

    const completeDelta = completeEvents.find(isStateDeltaEvent);

    expect(completeDelta).toBeDefined();
    expect(completeDelta!.delta).toEqual(
      expect.arrayContaining([
        {
          op: 'replace',
          path: '/thread/lifecycle/phase',
          value: 'hired',
        },
        {
          op: 'replace',
          path: '/thread/lifecycle/onboardingStep',
          value: null,
        },
        {
          op: 'replace',
          path: '/thread/domainProjection/managedLifecycle/phase',
          value: 'hired',
        },
        {
          op: 'replace',
          path: '/thread/task/taskStatus/state',
          value: 'completed',
        },
      ]),
    );

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

    const fireDelta = fireEvents.find(isStateDeltaEvent);

    expect(fireDelta).toBeDefined();
    expect(fireDelta!.delta).toEqual(
      expect.arrayContaining([
        {
          op: 'replace',
          path: '/thread/lifecycle/phase',
          value: 'fired',
        },
        {
          op: 'replace',
          path: '/thread/domainProjection/managedLifecycle/phase',
          value: 'fired',
        },
      ]),
    );
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

    const delta = events.find(isStateDeltaEvent);

    expect(inferenceCalls).toBe(0);
    expect(delta).toBeDefined();
    expect(delta!.delta).toEqual(
      expect.arrayContaining([
        {
          op: 'replace',
          path: '/thread/lifecycle/phase',
          value: 'onboarding',
        },
        {
          op: 'add',
          path: '/thread/lifecycle/onboardingStep',
          value: 'operator-profile',
        },
      ]),
    );
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
          path: '/thread/domainProjection/managedLifecycle/amountSummary',
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

  it('runs scheduled automation updates through the runtime-owned default Postgres bootstrap path', async () => {
    vi.useFakeTimers();

    try {
      const currentTime = Date.parse('2026-03-20T00:00:00.000Z');
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
          },
        ],
        executions: [],
        automations: [
          {
            automationId: 'automation-1',
            threadId: 'thread-record-1',
            commandName: 'sync',
            nextRunAt: new Date(currentTime - 1_000),
            suspended: false,
            schedulePayload: {
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
        ],
        interrupts: [],
        leases: [],
        outboxIntents: [],
        executionEvents: [],
        threadActivities: [],
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
        command: 'sync',
      });
      expect(internalPostgres.ensureReady).toHaveBeenCalledWith({});
      expect(internalPostgres.loadInspectionState).toHaveBeenCalled();
      expect(internalPostgres.executeStatements).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
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
      surfacedInThread: true,
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

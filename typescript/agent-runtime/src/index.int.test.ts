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
type StateSnapshotEvent = Extract<GatewayEvent, { snapshot: unknown }>;
type MessagesSnapshotEvent = Extract<GatewayEvent, { messages: unknown }>;
type InternalPostgresStatement = {
  tableName: string;
  values: readonly unknown[];
};
type InternalPersistDirectExecutionOptions = {
  threadId: string;
  threadKey: string;
  threadState: Record<string, unknown>;
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
  const loadInspectionState = vi.fn(async () => ({
    threads: [...persistedThreads.values()],
    executions: [],
    automations: [],
    automationRuns: [],
    interrupts: [],
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
  });
  const executeStatements = vi.fn(
    async (_databaseUrl: string, statements: readonly InternalPostgresStatement[]) => {
      for (const statement of statements) {
        if (statement.tableName !== 'pi_threads') {
          continue;
        }

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
      }
    },
  );

  return {
    persistedThreads,
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

function isMessagesSnapshotEvent(event: GatewayEvent): event is MessagesSnapshotEvent {
  return typeof event === 'object' && event !== null && 'messages' in event;
}

function createLifecycleDomain() {
  const phases = new Map<string, LifecycleState>();

  const getState = (threadId: string) =>
    phases.get(threadId) ?? {
      phase: 'prehire',
      onboardingStep: null,
      operatorNote: null,
    };

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

    const hireSnapshot = hireEvents.find(isStateSnapshotEvent);
    expect(latestUserText).toBe('Please hire the agent.');
    expect(observedSystemPrompts).toContain('You are a lifecycle agent.\n\nLifecycle phase: prehire.');
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
    expect(hireSnapshot).toBeDefined();
    expect(hireSnapshot!.snapshot.thread.lifecycle).toMatchObject({
      phase: 'onboarding',
      onboardingStep: 'operator-profile',
    });
    expect(hireSnapshot!.snapshot.thread.task?.taskStatus).toMatchObject({
      state: 'input-required',
      message: {
        content: 'Please provide a short operator note to continue onboarding.',
      },
    });
    expect(hireSnapshot!.snapshot.thread.artifacts?.current?.data).toMatchObject({
      type: 'interrupt-status',
      interruptType: 'operator-config',
      payload: {
        promptKind: 'text-note',
        inputLabel: 'Operator note',
        submitLabel: 'Continue agent loop',
      },
    });
    expect(hireSnapshot!.snapshot.thread.activity?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'dispatch-response',
          parts: expect.arrayContaining([
            expect.objectContaining({
              kind: 'a2ui',
              data: expect.objectContaining({
                payload: expect.objectContaining({
                  kind: 'interrupt',
                  payload: expect.objectContaining({
                    type: 'operator-config',
                    promptKind: 'text-note',
                    inputLabel: 'Operator note',
                    submitLabel: 'Continue agent loop',
                  }),
                }),
              }),
            }),
          ]),
        }),
      ]),
    );

    expect(persistedThreads.get('thread-1')?.threadState).toHaveProperty('a2ui');

    const resumeEvents = await collectEventSource(
      await runtime.service.run({
        threadId: 'thread-1',
        runId: 'run-resume',
        forwardedProps: {
          command: {
            resume: '{"operatorNote":"safe window approved"}',
          },
        },
      }),
    );

    const resumeSnapshot = resumeEvents.find(isStateSnapshotEvent);

    expect(resumeSnapshot).toBeDefined();
    expect(resumeSnapshot!.snapshot.thread.lifecycle).toMatchObject({
      phase: 'onboarding',
      onboardingStep: 'delegation-note',
      operatorNote: 'safe window approved',
    });
    expect(resumeSnapshot!.snapshot.thread.task?.taskStatus).toMatchObject({
      state: 'working',
      message: {
        content: 'Operator note captured. Ready to complete onboarding.',
      },
    });
    expect(resumeSnapshot!.snapshot.thread.artifacts?.current?.data).toMatchObject({
      type: 'lifecycle-status',
      onboardingStep: 'delegation-note',
      operatorNote: 'safe window approved',
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
      operatorNote: 'safe window approved',
    });
    expect(completeSnapshot!.snapshot.thread.task?.taskStatus).toMatchObject({
      state: 'completed',
      message: {
        content: 'Onboarding complete. Agent is now hired.',
      },
    });
    expect(completeSnapshot!.snapshot.thread.artifacts?.current?.data).toMatchObject({
      type: 'lifecycle-status',
      phase: 'hired',
      operatorNote: 'safe window approved',
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
      operatorNote: 'safe window approved',
    });
    expect(fireSnapshot!.snapshot.thread.task?.taskStatus).toMatchObject({
      state: 'completed',
      message: {
        content: 'Agent moved to fired. Rehire is still available in this thread.',
      },
    });
    expect(fireSnapshot!.snapshot.thread.artifacts?.current?.data).toMatchObject({
      type: 'lifecycle-status',
      phase: 'fired',
      operatorNote: 'safe window approved',
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
    expect(snapshot).toBeDefined();
    expect(snapshot!.snapshot.thread.lifecycle).toMatchObject({
      phase: 'onboarding',
      onboardingStep: 'operator-profile',
    });
    expect(snapshot!.snapshot.thread.task?.taskStatus).toMatchObject({
      state: 'input-required',
      message: {
        content: 'Please provide a short operator note to continue onboarding.',
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
        expect.stringContaining('You are a lifecycle agent.\n\nLifecycle phase: prehire.'),
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

    expect(observedSystemPrompts).toContain(
      'You are a persistence agent.\n\nLifecycle phase: onboarding.',
    );
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

    expect(observedSystemPrompts).toContain(
      'You are a persistence agent.\n\nLifecycle phase: onboarding.',
    );

    const migratedThreadState = persistedThreads.get('thread-legacy-lifecycle')?.threadState;
    expect(migratedThreadState).toMatchObject({
      __agentRuntimeDomainState: {
        phase: 'onboarding',
        onboardingStep: 'operator-profile',
        operatorNote: null,
      },
    });
  });
});

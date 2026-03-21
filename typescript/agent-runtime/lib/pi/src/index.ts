import {
  EventType,
  type BaseEvent,
  type Message as AgUiMessage,
  type RunFinishedEvent,
  type RunStartedEvent,
  type StateSnapshotEvent,
} from '@ag-ui/core';
import { Agent, type AgentEvent, type AgentMessage, type AgentOptions, type AgentTool } from '@mariozechner/pi-agent-core';
import { createAssistantMessageEventStream, type Api, type Message, type Model, type ToolResultMessage } from '@mariozechner/pi-ai';
import { mergeThreadPatchForEmit, type TaskState } from 'agent-runtime-contracts';
import {
  buildPiRuntimeInspectionSnapshot,
  buildPiRuntimeMaintenancePlan,
  resolvePostgresBootstrapPlan,
  type PiAutomationRecord,
  type PiAutomationRunRecord,
  type PiExecutionEventRecord,
  type PiExecutionRecord,
  type PiOutboxRecoveryRecord,
  type PiRestartInterruptRecord,
  type PiRuntimeMaintenancePlan,
  type PiRuntimeRetentionPolicy,
  type PiSchedulerLeaseRecord,
  type PiThreadActivityRecord,
  type PiThreadRecord,
  type PostgresBootstrapPlan,
} from 'agent-runtime-postgres';
export {
  createPiRuntimeGatewayAgUiHandler,
  DEFAULT_PI_RUNTIME_GATEWAY_AG_UI_BASE_PATH,
  PiRuntimeGatewayHttpAgent,
} from './agUiTransport.js';
export type { PiRuntimeGatewayAgUiHandlerOptions, PiRuntimeGatewayHttpAgentConfig } from './agUiTransport.js';
export {
  buildPiRuntimeDirectExecutionRecordIds,
  ensurePiRuntimePostgresReady,
  loadPiRuntimeInspectionState,
  persistPiRuntimeDirectExecution,
} from 'agent-runtime-postgres';
export type {
  EnsuredPiRuntimePostgres,
  EnsurePiRuntimePostgresReadyOptions,
  LoadedPiRuntimeInspectionState,
  LoadPiRuntimeInspectionStateOptions,
  PersistPiRuntimeDirectExecutionOptions,
} from 'agent-runtime-postgres';

export type PiRuntimeGatewayConnectRequest = {
  threadId: string;
};

export type PiRuntimeGatewayRunRequest = {
  threadId: string;
  runId: string;
  messages?: AgUiMessage[];
};

export type PiRuntimeGatewayStopRequest = {
  threadId: string;
  runId: string;
};

export type PiRuntimeGatewayArtifact = {
  artifactId: string;
  data: unknown;
};

export type PiRuntimeGatewayA2UiPayload = {
  kind: string;
  payload: unknown;
};

export type PiRuntimeGatewayActivityEvent = {
  type: 'dispatch-response';
  parts: Array<{
    kind: string;
    data: unknown;
  }>;
};

export type PiRuntimeGatewayExecutionStatus =
  | 'queued'
  | 'working'
  | 'interrupted'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'auth-required';

export type PiRuntimeGatewaySession = {
  thread: {
    id: string;
  };
  execution: {
    id: string;
    status: PiRuntimeGatewayExecutionStatus;
    statusMessage?: string;
  };
  automation?: {
    id: string;
    runId?: string;
  };
  artifacts?: {
    current?: PiRuntimeGatewayArtifact;
    activity?: PiRuntimeGatewayArtifact;
  };
  a2ui?: PiRuntimeGatewayA2UiPayload;
  threadPatch?: Record<string, unknown>;
};

export type PiRuntimeGatewayRuntimeNoteMessage = {
  role: 'pi-runtime-note';
  threadId: string;
  executionId: string;
  text: string;
  timestamp: number;
};

export type PiRuntimeGatewayArtifactMessage = {
  role: 'pi-artifact';
  threadId: string;
  executionId: string;
  channel: 'current' | 'activity';
  artifactId: string;
  data: unknown;
  timestamp: number;
};

export type PiRuntimeGatewayA2UiMessage = {
  role: 'pi-a2ui';
  threadId: string;
  executionId: string;
  payload: PiRuntimeGatewayA2UiPayload;
  timestamp: number;
};

export type PiRuntimeGatewayContextMessage =
  | PiRuntimeGatewayRuntimeNoteMessage
  | PiRuntimeGatewayArtifactMessage
  | PiRuntimeGatewayA2UiMessage;

declare module '@mariozechner/pi-agent-core' {
  interface CustomAgentMessages {
    'pi-runtime-note': PiRuntimeGatewayRuntimeNoteMessage;
    'pi-artifact': PiRuntimeGatewayArtifactMessage;
    'pi-a2ui': PiRuntimeGatewayA2UiMessage;
  }
}

export type PiRuntimeGatewayRuntime = {
  connect: (request: PiRuntimeGatewayConnectRequest) => Promise<BaseEvent[]>;
  run: (request: PiRuntimeGatewayRunRequest) => Promise<BaseEvent[]>;
  stop: (request: PiRuntimeGatewayStopRequest) => Promise<BaseEvent[]>;
};

export type PiRuntimeGatewayControlPlane = {
  inspectHealth: () => Promise<unknown>;
  listThreads: () => Promise<unknown>;
  listExecutions: () => Promise<unknown>;
  listAutomations: () => Promise<unknown>;
  listAutomationRuns: () => Promise<unknown>;
  inspectScheduler: () => Promise<unknown>;
  inspectOutbox: () => Promise<unknown>;
  inspectMaintenance: () => Promise<unknown>;
};

export type PiRuntimeGatewayService = {
  connect: PiRuntimeGatewayRuntime['connect'];
  run: PiRuntimeGatewayRuntime['run'];
  stop: PiRuntimeGatewayRuntime['stop'];
  control: PiRuntimeGatewayControlPlane;
};

export type PiRuntimeGatewayAgent = Pick<Agent, 'subscribe' | 'prompt' | 'continue' | 'abort' | 'state'> & {
  sessionId?: string;
  steer?: (message: AgentMessage) => void;
  followUp?: (message: AgentMessage) => void;
};

export type PiRuntimeGatewayFoundation = {
  agent: Agent;
  bootstrapPlan: PostgresBootstrapPlan;
};

export type PiRuntimeGatewayInspectionState = {
  threads: readonly PiThreadRecord[];
  executions: readonly PiExecutionRecord[];
  automations: readonly PiAutomationRecord[];
  automationRuns: readonly PiAutomationRunRecord[];
  interrupts: readonly PiRestartInterruptRecord[];
  leases: readonly PiSchedulerLeaseRecord[];
  outboxIntents: readonly PiOutboxRecoveryRecord[];
  executionEvents: readonly PiExecutionEventRecord[];
  threadActivities: readonly PiThreadActivityRecord[];
};

export const DEFAULT_PI_RUNTIME_GATEWAY_RETENTION = {
  completedExecutionMs: 7 * 24 * 60 * 60 * 1000,
  completedAutomationRunMs: 7 * 24 * 60 * 60 * 1000,
  executionEventMs: 7 * 24 * 60 * 60 * 1000,
  threadActivityMs: 7 * 24 * 60 * 60 * 1000,
} as const satisfies PiRuntimeRetentionPolicy;

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
} as const;

export const createPiRuntimeGatewayMockStream = (
  responseText: string,
): NonNullable<AgentOptions['streamFn']> => {
  return async (model) => {
    const stream = createAssistantMessageEventStream();

    queueMicrotask(() => {
      stream.push({
        type: 'done',
        reason: 'stop',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: responseText }],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: EMPTY_USAGE,
          stopReason: 'stop',
          timestamp: Date.now(),
        },
      });
    });

    return stream;
  };
};

const asBaseEvent = <TEvent extends BaseEvent>(event: TEvent): BaseEvent => event;

const isPiRuntimeGatewayRuntimeNoteMessage = (message: AgentMessage): message is PiRuntimeGatewayRuntimeNoteMessage =>
  getMessageRole(message) === 'pi-runtime-note';

const isPiRuntimeGatewayArtifactMessage = (message: AgentMessage): message is PiRuntimeGatewayArtifactMessage =>
  getMessageRole(message) === 'pi-artifact';

const isPiRuntimeGatewayA2UiMessage = (message: AgentMessage): message is PiRuntimeGatewayA2UiMessage =>
  getMessageRole(message) === 'pi-a2ui';

const isLlmCompatibleMessage = (message: AgentMessage): message is Message => {
  const role = getMessageRole(message);
  return role === 'user' || role === 'assistant' || role === 'toolResult';
};

const mapExecutionStatusToTaskState = (status: PiRuntimeGatewayExecutionStatus): TaskState => {
  switch (status) {
    case 'queued':
      return 'submitted';
    case 'working':
      return 'working';
    case 'interrupted':
      return 'input-required';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'canceled':
      return 'canceled';
    case 'auth-required':
      return 'auth-required';
  }
};

const stringifyUnknown = (value: unknown): string => {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
};

const getMessageRole = (message: AgentMessage): string =>
  typeof message === 'object' && message !== null && 'role' in message && typeof message.role === 'string'
    ? message.role
    : 'assistant';

const getMessageTimestamp = (message: AgentMessage): number | string | undefined =>
  typeof message === 'object' && message !== null && 'timestamp' in message
    ? (message.timestamp as number | string | undefined)
    : undefined;

const resolveProjectedMessageId = (executionId: string, message: AgentMessage, fallbackIndex: number): string => {
  const role = getMessageRole(message);
  const timestamp = getMessageTimestamp(message) ?? fallbackIndex;
  return `pi:${executionId}:${role}:${timestamp}`;
};

const buildExecutionStatusText = (session: PiRuntimeGatewaySession): string =>
  [
    `Thread ${session.thread.id} execution ${session.execution.id} is ${session.execution.status}.`,
    session.execution.statusMessage,
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ');

export const buildPiRuntimeGatewayContextMessages = (params: {
  session: PiRuntimeGatewaySession;
  now?: () => number;
}): PiRuntimeGatewayContextMessage[] => {
  const now = params.now ?? (() => Date.now());
  const timestamp = now();

  return [
    {
      role: 'pi-runtime-note',
      threadId: params.session.thread.id,
      executionId: params.session.execution.id,
      text: buildExecutionStatusText(params.session),
      timestamp,
    },
    ...(params.session.artifacts?.current
      ? [
          {
            role: 'pi-artifact' as const,
            threadId: params.session.thread.id,
            executionId: params.session.execution.id,
            channel: 'current' as const,
            artifactId: params.session.artifacts.current.artifactId,
            data: params.session.artifacts.current.data,
            timestamp,
          },
        ]
      : []),
    ...(params.session.artifacts?.activity
      ? [
          {
            role: 'pi-artifact' as const,
            threadId: params.session.thread.id,
            executionId: params.session.execution.id,
            channel: 'activity' as const,
            artifactId: params.session.artifacts.activity.artifactId,
            data: params.session.artifacts.activity.data,
            timestamp,
          },
        ]
      : []),
    ...(params.session.a2ui
      ? [
          {
            role: 'pi-a2ui' as const,
            threadId: params.session.thread.id,
            executionId: params.session.execution.id,
            payload: params.session.a2ui,
            timestamp,
          },
        ]
      : []),
  ];
};

export const convertPiRuntimeGatewayMessagesToLlm = (
  messages: AgentMessage[],
  delegate?: (messages: AgentMessage[]) => Message[] | Promise<Message[]>,
): Message[] | Promise<Message[]> => {
  const preprocessedMessages = messages.flatMap((message): AgentMessage[] => {
    if (isPiRuntimeGatewayRuntimeNoteMessage(message)) {
      return [
        {
          role: 'user',
          content: `<pi-runtime-gateway>${message.text}</pi-runtime-gateway>`,
          timestamp: message.timestamp,
        },
      ];
    }

    if (isPiRuntimeGatewayArtifactMessage(message) || isPiRuntimeGatewayA2UiMessage(message)) {
      return [];
    }

    return [message];
  });

  return delegate ? delegate(preprocessedMessages) : preprocessedMessages.filter(isLlmCompatibleMessage);
};

const convertAgUiMessagesToPiMessages = (messages: AgUiMessage[], now: () => number): AgentMessage[] =>
  messages.flatMap((message): AgentMessage[] => {
    switch (message.role) {
      case 'user': {
        const content: string | Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> =
          typeof message.content === 'string'
            ? message.content
            : message.content.map((part) =>
                part.type === 'text'
                  ? { type: 'text', text: part.text }
                  : {
                      type: 'image',
                      data: part.data ?? part.url ?? part.id ?? '',
                      mimeType: part.mimeType,
                    },
              );
        return [
          {
            role: 'user',
            content,
            timestamp: now(),
          },
        ];
      }
      case 'assistant':
        return [
          {
            role: 'assistant',
            content:
              typeof message.content === 'string' && message.content.length > 0
                ? [{ type: 'text', text: message.content }]
                : [],
            api: 'responses' as never,
            provider: 'openai' as never,
            model: 'ag-ui-projected',
            usage: EMPTY_USAGE,
            stopReason: 'stop',
            timestamp: now(),
          } as AgentMessage,
        ];
      case 'tool':
        return [
          {
            role: 'toolResult',
            toolCallId: message.toolCallId,
            toolName: 'ag-ui-tool',
            content: [{ type: 'text', text: message.content }],
            isError: typeof message.error === 'string' && message.error.length > 0,
            timestamp: now(),
          } satisfies ToolResultMessage,
        ];
      default:
        return [];
    }
  });

export const buildPiThreadStateSnapshot = (params: PiRuntimeGatewaySession): Record<string, unknown> => {
  const activityEvents: PiRuntimeGatewayActivityEvent[] = params.a2ui
    ? [
        buildPiA2UiActivityEvent({
          threadId: params.thread.id,
          executionId: params.execution.id,
          payload: params.a2ui,
        }),
      ]
    : [];

  const baseThread = {
    id: params.thread.id,
    task: {
      id: params.execution.id,
      taskStatus: {
        state: mapExecutionStatusToTaskState(params.execution.status),
        message: params.execution.statusMessage,
      },
    },
    projection: {
      source: 'pi-runtime-gateway',
      canonicalIds: {
        piThreadId: params.thread.id,
        piExecutionId: params.execution.id,
        ...(params.automation?.id ? { piAutomationId: params.automation.id } : {}),
        ...(params.automation?.runId ? { automationRunId: params.automation.runId } : {}),
      },
    },
    ...(activityEvents.length > 0
      ? {
          activity: {
            telemetry: [],
            events: activityEvents,
          },
        }
      : {}),
    ...(params.artifacts
      ? {
          artifacts: {
            ...(params.artifacts.current ? { current: params.artifacts.current } : {}),
            ...(params.artifacts.activity ? { activity: params.artifacts.activity } : {}),
          },
        }
      : {}),
  };

  return {
    thread: mergeThreadPatchForEmit({
      currentThread: baseThread,
      patchThread: params.threadPatch ?? {},
    }),
  };
};

export const buildPiA2UiActivityEvent = (params: {
  threadId: string;
  executionId: string;
  payload: PiRuntimeGatewayA2UiPayload;
}): PiRuntimeGatewayActivityEvent => ({
  type: 'dispatch-response',
  parts: [
    {
      kind: 'a2ui',
      data: {
        threadId: params.threadId,
        executionId: params.executionId,
        payload: params.payload,
      },
    },
  ],
});

export const mapPiAgentEventsToAgUiEvents = (params: {
  executionId: string;
  events: AgentEvent[];
}): BaseEvent[] => {
  const mapped: BaseEvent[] = [];
  const seenToolStarts = new Set<string>();
  let currentMessageId: string | null = null;
  let fallbackIndex = 0;

  for (const event of params.events) {
    switch (event.type) {
      case 'agent_start':
        mapped.push(asBaseEvent({ type: EventType.STEP_STARTED, stepName: 'pi-agent' }));
        break;
      case 'agent_end':
        mapped.push(asBaseEvent({ type: EventType.STEP_FINISHED, stepName: 'pi-agent' }));
        break;
      case 'turn_start':
        mapped.push(asBaseEvent({ type: EventType.STEP_STARTED, stepName: 'turn' }));
        break;
      case 'turn_end':
        mapped.push(asBaseEvent({ type: EventType.STEP_FINISHED, stepName: 'turn' }));
        break;
      case 'message_start': {
        fallbackIndex += 1;
        currentMessageId = resolveProjectedMessageId(params.executionId, event.message, fallbackIndex);
        const role = getMessageRole(event.message);
        if (role === 'assistant' || role === 'user') {
          mapped.push(asBaseEvent({
            type: EventType.TEXT_MESSAGE_START,
            messageId: currentMessageId,
            role,
          }));
        }
        break;
      }
      case 'message_update': {
        const messageId =
          currentMessageId ??
          resolveProjectedMessageId(params.executionId, event.message, fallbackIndex + 1);
        const detail = event.assistantMessageEvent;

        if (detail.type === 'text_delta') {
          mapped.push(asBaseEvent({
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId,
            delta: detail.delta,
          }));
        }

        if (detail.type === 'toolcall_delta') {
          const toolCall = detail.partial.content[detail.contentIndex];
          if (toolCall?.type === 'toolCall' && !seenToolStarts.has(toolCall.id)) {
            seenToolStarts.add(toolCall.id);
            mapped.push(asBaseEvent({
              type: EventType.TOOL_CALL_START,
              toolCallId: toolCall.id,
              toolCallName: toolCall.name,
              parentMessageId: messageId,
            }));
          }
          mapped.push(asBaseEvent({
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: toolCall?.type === 'toolCall' ? toolCall.id : `pi:${params.executionId}:tool-call`,
            delta: detail.delta,
          }));
        }

        if (detail.type === 'toolcall_end') {
          if (!seenToolStarts.has(detail.toolCall.id)) {
            seenToolStarts.add(detail.toolCall.id);
            mapped.push(asBaseEvent({
              type: EventType.TOOL_CALL_START,
              toolCallId: detail.toolCall.id,
              toolCallName: detail.toolCall.name,
              parentMessageId: messageId,
            }));
          }
          mapped.push(asBaseEvent({
            type: EventType.TOOL_CALL_END,
            toolCallId: detail.toolCall.id,
          }));
        }
        break;
      }
      case 'tool_execution_end':
        mapped.push(asBaseEvent({
          type: EventType.TOOL_CALL_RESULT,
          messageId: `pi:${params.executionId}:tool-result:${event.toolCallId}`,
          toolCallId: event.toolCallId,
          content: stringifyUnknown(event.result),
          role: 'tool',
        }));
        break;
      case 'message_end':
        if (currentMessageId) {
          const role = getMessageRole(event.message);
          if (role === 'assistant' || role === 'user') {
            mapped.push(asBaseEvent({
              type: EventType.TEXT_MESSAGE_END,
              messageId: currentMessageId,
            }));
          }
        }
        currentMessageId = null;
        break;
      default:
        break;
    }
  }

  return mapped;
};

export const createPiRuntimeGatewayFoundation = (params: {
  model: Model<Api>;
  systemPrompt: string;
  tools?: AgentTool[];
  databaseUrl?: string;
  agentOptions?: AgentOptions;
  getSessionContext?: () => PiRuntimeGatewaySession | undefined;
  now?: () => number;
}): PiRuntimeGatewayFoundation => {
  const now = params.now ?? (() => Date.now());
  const transformContext =
    params.getSessionContext || params.agentOptions?.transformContext
      ? async (messages: AgentMessage[], signal?: AbortSignal) => {
          const transformedMessages = params.agentOptions?.transformContext
            ? await params.agentOptions.transformContext(messages, signal)
            : messages;
          const session = params.getSessionContext?.();
          return session
            ? [
                ...transformedMessages,
                ...buildPiRuntimeGatewayContextMessages({
                  session,
                  now,
                }),
              ]
            : transformedMessages;
        }
      : undefined;

  const agent = new Agent({
    ...params.agentOptions,
    convertToLlm: (messages) => convertPiRuntimeGatewayMessagesToLlm(messages, params.agentOptions?.convertToLlm),
    transformContext,
    initialState: {
      ...params.agentOptions?.initialState,
      model: params.model,
      systemPrompt: params.systemPrompt,
      ...(params.tools ? { tools: params.tools } : {}),
    },
  });

  return {
    agent,
    bootstrapPlan: resolvePostgresBootstrapPlan({
      DATABASE_URL: params.databaseUrl,
    }),
  };
};

export const createPiRuntimeGatewayRuntime = (params: {
  agent: PiRuntimeGatewayAgent;
  getSession: () => PiRuntimeGatewaySession;
  now?: () => number;
}): PiRuntimeGatewayRuntime => {
  const now = params.now ?? (() => Date.now());
  const syncAgentSessionId = (threadId: string): void => {
    params.agent.sessionId = threadId;
  };

  const buildSnapshotEvent = (session: PiRuntimeGatewaySession): StateSnapshotEvent => ({
    type: EventType.STATE_SNAPSHOT,
    snapshot: buildPiThreadStateSnapshot(session),
  });

  return {
    connect: (request) => {
      syncAgentSessionId(request.threadId);
      const session = params.getSession();
      return Promise.resolve([buildSnapshotEvent(session)]);
    },
    run: async (request) => {
      syncAgentSessionId(request.threadId);
      const capturedEvents: AgentEvent[] = [];
      const unsubscribe = params.agent.subscribe((event) => {
        capturedEvents.push(event);
      });

      try {
        if (request.messages && request.messages.length > 0) {
          const promptMessages = convertAgUiMessagesToPiMessages(request.messages, now);
          if (params.agent.state.isStreaming) {
            if (params.agent.steer) {
              for (const message of promptMessages) {
                params.agent.steer(message);
              }
            } else if (params.agent.followUp) {
              for (const message of promptMessages) {
                params.agent.followUp(message);
              }
            } else {
              await params.agent.prompt(promptMessages);
            }
          } else {
            await params.agent.prompt(promptMessages);
          }
        } else {
          await params.agent.continue();
        }
      } finally {
        unsubscribe();
      }

      const session = params.getSession();
      const events: BaseEvent[] = [
        asBaseEvent({
          type: EventType.RUN_STARTED,
          threadId: request.threadId,
          runId: request.runId,
        } satisfies RunStartedEvent),
        ...mapPiAgentEventsToAgUiEvents({
          executionId: session.execution.id,
          events: capturedEvents,
        }),
        buildSnapshotEvent(session),
      ];

      events.push(asBaseEvent({
        type: EventType.RUN_FINISHED,
        threadId: request.threadId,
        runId: request.runId,
        result: {
          executionId: session.execution.id,
          status: session.execution.status,
        },
      } satisfies RunFinishedEvent));

      return events;
    },
    stop: (request) => {
      params.agent.abort();
      return Promise.resolve([
        asBaseEvent({
          type: EventType.RUN_FINISHED,
          threadId: request.threadId,
          runId: request.runId,
          result: {
            status: 'aborted',
          },
        } satisfies RunFinishedEvent),
      ]);
    },
  };
};

export const createCanonicalPiRuntimeGatewayControlPlane = (params: {
  loadInspectionState: () => Promise<PiRuntimeGatewayInspectionState>;
  retention?: PiRuntimeRetentionPolicy;
  now?: () => Date;
}): PiRuntimeGatewayControlPlane => {
  const now = params.now ?? (() => new Date());
  const retention = params.retention ?? DEFAULT_PI_RUNTIME_GATEWAY_RETENTION;

  const loadSnapshot = async () =>
    buildPiRuntimeInspectionSnapshot({
      now: now(),
      ...(await params.loadInspectionState()),
    });

  return {
    inspectHealth: async () => (await loadSnapshot()).health,
    listThreads: async () => (await loadSnapshot()).threads,
    listExecutions: async () => (await loadSnapshot()).executions,
    listAutomations: async () => (await loadSnapshot()).automations,
    listAutomationRuns: async () => (await loadSnapshot()).automationRuns,
    inspectScheduler: async () => (await loadSnapshot()).scheduler,
    inspectOutbox: async () => (await loadSnapshot()).outbox,
    inspectMaintenance: async (): Promise<PiRuntimeMaintenancePlan> =>
      buildPiRuntimeMaintenancePlan({
        now: now(),
        snapshot: await loadSnapshot(),
        retention,
      }),
  };
};

export const createPiRuntimeGatewayService = (params: {
  runtime: PiRuntimeGatewayRuntime;
  controlPlane: PiRuntimeGatewayControlPlane;
}): PiRuntimeGatewayService => ({
  connect: (request) => params.runtime.connect(request),
  run: (request) => params.runtime.run(request),
  stop: (request) => params.runtime.stop(request),
  control: {
    inspectHealth: () => params.controlPlane.inspectHealth(),
    listThreads: () => params.controlPlane.listThreads(),
    listExecutions: () => params.controlPlane.listExecutions(),
    listAutomations: () => params.controlPlane.listAutomations(),
    listAutomationRuns: () => params.controlPlane.listAutomationRuns(),
    inspectScheduler: () => params.controlPlane.inspectScheduler(),
    inspectOutbox: () => params.controlPlane.inspectOutbox(),
    inspectMaintenance: () => params.controlPlane.inspectMaintenance(),
  },
});

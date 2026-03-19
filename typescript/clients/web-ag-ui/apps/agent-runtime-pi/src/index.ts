import {
  EventType,
  type BaseEvent,
  type Message as AgUiMessage,
  type RunFinishedEvent,
  type RunStartedEvent,
  type StateSnapshotEvent,
} from '@ag-ui/core';
import { Agent, type AgentEvent, type AgentMessage, type AgentTool } from '@mariozechner/pi-agent-core';
import type { Model, ToolResultMessage } from '@mariozechner/pi-ai';
import { mergeThreadPatchForEmit, type TaskState } from 'agent-runtime-contracts';
import { resolvePostgresBootstrapPlan, type PostgresBootstrapPlan } from 'agent-runtime-postgres';

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

export type PiRuntimeGatewayRuntime = {
  connect: (request: PiRuntimeGatewayConnectRequest) => Promise<BaseEvent[]>;
  run: (request: PiRuntimeGatewayRunRequest) => Promise<BaseEvent[]>;
  stop: (request: PiRuntimeGatewayStopRequest) => Promise<BaseEvent[]>;
};

export type PiRuntimeGatewayControlPlane = {
  inspectHealth: () => Promise<unknown>;
  listExecutions: () => Promise<unknown>;
};

export type PiRuntimeGatewayService = {
  connect: PiRuntimeGatewayRuntime['connect'];
  run: PiRuntimeGatewayRuntime['run'];
  stop: PiRuntimeGatewayRuntime['stop'];
  control: PiRuntimeGatewayControlPlane;
};

export type PiRuntimeGatewayAgent = Pick<Agent, 'subscribe' | 'prompt' | 'continue' | 'abort' | 'state'>;

export type PiRuntimeGatewayFoundation = {
  agent: Agent;
  bootstrapPlan: PostgresBootstrapPlan;
};

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

const asBaseEvent = <TEvent extends BaseEvent>(event: TEvent): BaseEvent => event;

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
  model: Model<any>;
  systemPrompt: string;
  tools?: AgentTool[];
  databaseUrl?: string;
}): PiRuntimeGatewayFoundation => {
  const agent = new Agent();
  agent.setModel(params.model);
  agent.setSystemPrompt(params.systemPrompt);
  if (params.tools) {
    agent.setTools(params.tools);
  }

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

  const buildSnapshotEvent = (session: PiRuntimeGatewaySession): StateSnapshotEvent => ({
    type: EventType.STATE_SNAPSHOT,
    snapshot: buildPiThreadStateSnapshot(session),
  });

  return {
    connect: async () => {
      const session = params.getSession();
      return [buildSnapshotEvent(session)];
    },
    run: async (request) => {
      const capturedEvents: AgentEvent[] = [];
      const unsubscribe = params.agent.subscribe((event) => {
        capturedEvents.push(event);
      });

      try {
        if (request.messages && request.messages.length > 0) {
          await params.agent.prompt(convertAgUiMessagesToPiMessages(request.messages, now));
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
    stop: async (request) => {
      params.agent.abort();
      return [
        asBaseEvent({
          type: EventType.RUN_FINISHED,
          threadId: request.threadId,
          runId: request.runId,
          result: {
            status: 'aborted',
          },
        } satisfies RunFinishedEvent),
      ];
    },
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
    listExecutions: () => params.controlPlane.listExecutions(),
  },
});

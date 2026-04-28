import { createRequire } from 'node:module';

import {
  EventType,
  type BaseEvent,
  type Message as AgUiMessage,
  type MessagesSnapshotEvent,
  type RunFinishedEvent,
  type RunStartedEvent,
  type StateDeltaEvent,
  type StateSnapshotEvent,
} from '@ag-ui/core';
import { Agent, type AgentEvent, type AgentMessage, type AgentOptions, type AgentTool } from '@mariozechner/pi-agent-core';
import {
  createAssistantMessageEventStream,
  streamSimple,
  type Api,
  type Message,
  type Model,
  type ToolResultMessage,
} from '@mariozechner/pi-ai';
import {
  buildPiRuntimeInspectionSnapshot,
  buildPiRuntimeMaintenancePlan,
  resolvePostgresBootstrapPlan,
  type PiAutomationRecord,
  type PiAutomationRunRecord,
  type PiArtifactRecord,
  type PiExecutionEventRecord,
  type PiExecutionRecord,
  type PiOutboxRecoveryRecord,
  type PiRestartInterruptRecord,
  type PiRuntimeInspectionSnapshot,
  type PiRuntimeMaintenancePlan,
  type PiRuntimeRetentionPolicy,
  type PiSchedulerLeaseRecord,
  type PiThreadActivityRecord,
  type PiThreadRecord,
  type PostgresBootstrapPlan,
} from 'agent-runtime-postgres';

import { type TaskState } from './taskState.js';
import { mergeThreadPatchForEmit } from './threadEmission.js';
export type { AgentOptions, AgentTool } from '@mariozechner/pi-agent-core';
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
  runId?: string;
};

export type PiRuntimeGatewayRunRequest = {
  threadId: string;
  runId: string;
  messages?: AgUiMessage[];
  forwardedProps?: {
    command?: {
      name?: string;
      input?: unknown;
      resume?: unknown;
      update?: {
        clientMutationId?: string;
        baseRevision?: string;
        patch?: unknown;
      };
    };
  };
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

export type PiRuntimeGatewayActivityEvent =
  | {
      type: 'dispatch-response';
      parts: Array<{
        kind: string;
        data: unknown;
      }>;
    }
  | {
      type: 'artifact';
      artifact: PiRuntimeGatewayArtifact;
      append?: boolean;
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
  messages?: AgUiMessage[];
  automation?: {
    id: string;
    runId?: string;
  };
  artifacts?: {
    current?: PiRuntimeGatewayArtifact;
    activity?: PiRuntimeGatewayArtifact;
  };
  a2ui?: PiRuntimeGatewayA2UiPayload;
  activityEvents?: PiRuntimeGatewayActivityEvent[];
  projectedState?: Record<string, unknown>;
  sharedState?: Record<string, unknown>;
  sharedStateVersion?: number;
  sharedStateRevision?: string;
  sharedStateHydrated?: boolean;
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
  connect: (request: PiRuntimeGatewayConnectRequest) => Promise<PiRuntimeGatewayEventSource> | PiRuntimeGatewayEventSource;
  run: (request: PiRuntimeGatewayRunRequest) => Promise<PiRuntimeGatewayEventSource> | PiRuntimeGatewayEventSource;
  stop: (request: PiRuntimeGatewayStopRequest) => Promise<PiRuntimeGatewayEventSource> | PiRuntimeGatewayEventSource;
};

type PiRuntimeGatewayForwardedCommand = NonNullable<
  NonNullable<PiRuntimeGatewayRunRequest['forwardedProps']>['command']
>;

export type PiRuntimeGatewayControlPlane = {
  inspectHealth: () => Promise<unknown>;
  listThreads: () => Promise<unknown>;
  listExecutions: () => Promise<unknown>;
  listAutomations: () => Promise<unknown>;
  listAutomationRuns: (scope?: PiRuntimeGatewayControlScope) => Promise<unknown>;
  listArtifacts: (scope?: PiRuntimeGatewayControlScope) => Promise<unknown>;
  inspectScheduler: () => Promise<unknown>;
  inspectOutbox: () => Promise<unknown>;
  inspectMaintenance: () => Promise<unknown>;
};

export type PiRuntimeGatewayControlScope = {
  threadId?: string;
};

export type PiRuntimeGatewayService = {
  connect: PiRuntimeGatewayRuntime['connect'];
  run: PiRuntimeGatewayRuntime['run'];
  stop: PiRuntimeGatewayRuntime['stop'];
  control: PiRuntimeGatewayControlPlane;
};

export type PiRuntimeGatewayEventSource = readonly BaseEvent[] | AsyncIterable<BaseEvent>;

export type PiRuntimeGatewayAgent = Pick<Agent, 'subscribe' | 'prompt' | 'continue' | 'abort' | 'state'> & {
  sessionId?: string;
  steer?: (message: AgentMessage) => void;
  followUp?: (message: AgentMessage) => void;
  replaceMessages?: (messages: AgentMessage[]) => void;
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
  artifacts?: readonly PiArtifactRecord[];
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

type JsonPatchCompare = (
  left: object,
  right: object,
  invertible?: boolean,
) => Array<Record<string, unknown>>;

type JsonPatchApply = <T>(
  document: T,
  patch: ReadonlyArray<Record<string, unknown>>,
  validateOperation?: boolean,
  mutateDocument?: boolean,
  banPrototypeModifications?: boolean,
) => {
  newDocument: T;
};

type JsonPatchModule = {
  compare?: JsonPatchCompare;
  applyPatch?: JsonPatchApply;
  default?: JsonPatchModule;
  'module.exports'?: JsonPatchModule;
};

const require = createRequire(import.meta.url);
const jsonPatchModule = require('fast-json-patch') as JsonPatchModule;

const resolveJsonPatchCompare = (module: JsonPatchModule | undefined): JsonPatchCompare | undefined =>
  module?.compare ?? module?.default?.compare ?? module?.['module.exports']?.compare;

const resolveJsonPatchApply = (module: JsonPatchModule | undefined): JsonPatchApply | undefined =>
  module?.applyPatch ?? module?.default?.applyPatch ?? module?.['module.exports']?.applyPatch;

const jsonPatchCompare = resolveJsonPatchCompare(jsonPatchModule);
const jsonPatchApply = resolveJsonPatchApply(jsonPatchModule);

type PiRuntimeGatewaySharedStateHydrationReason = 'bootstrap' | 'reconnect';
type PiRuntimeGatewaySharedStateUpdateAckStatus = 'accepted' | 'noop' | 'rejected';
type PiRuntimeGatewaySharedStateUpdateAckCode =
  | 'stale_revision'
  | 'missing_base_revision'
  | 'forbidden_path'
  | 'invalid_patch';

const PI_RUNTIME_SHARED_STATE_CONTROL_EVENT = 'shared-state.control';
const PI_RUNTIME_SHARED_STATE_REVISION_PREFIX = 'shared-rev-';
const MISSING_CLIENT_MUTATION_ID_ERROR =
  'Shared-state update commands require a non-empty clientMutationId.';

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const getProjectedState = (session: PiRuntimeGatewaySession): Record<string, unknown> =>
  isRecord(session.projectedState) ? session.projectedState : {};

const getSharedState = (session: PiRuntimeGatewaySession): Record<string, unknown> =>
  isRecord(session.sharedState) ? session.sharedState : {};

const getSharedStateVersion = (session: PiRuntimeGatewaySession): number =>
  typeof session.sharedStateVersion === 'number' &&
  Number.isInteger(session.sharedStateVersion) &&
  session.sharedStateVersion >= 0
    ? session.sharedStateVersion
    : 0;

const buildSharedStateRevision = (version: number): string =>
  `${PI_RUNTIME_SHARED_STATE_REVISION_PREFIX}${version}`;

const getSharedStateRevision = (session: PiRuntimeGatewaySession): string => {
  const revision = session.sharedStateRevision;
  return typeof revision === 'string' && revision.length > 0
    ? revision
    : buildSharedStateRevision(getSharedStateVersion(session));
};

const normalizeSharedStateSession = (session: PiRuntimeGatewaySession): PiRuntimeGatewaySession => ({
  ...session,
  projectedState: getProjectedState(session),
  sharedState: getSharedState(session),
  sharedStateVersion: getSharedStateVersion(session),
  sharedStateRevision: getSharedStateRevision(session),
  sharedStateHydrated: session.sharedStateHydrated === true,
});

const buildSharedStateControlHydrationEvent = (params: {
  reason: PiRuntimeGatewaySharedStateHydrationReason;
  revision: string;
}) => ({
  type: EventType.CUSTOM,
  name: PI_RUNTIME_SHARED_STATE_CONTROL_EVENT,
  value: {
    kind: 'hydration',
    reason: params.reason,
    revision: params.revision,
  },
} satisfies BaseEvent);

const buildSharedStateControlUpdateAckEvent = (params: {
  clientMutationId: string;
  status: PiRuntimeGatewaySharedStateUpdateAckStatus;
  resultingRevision: string;
  baseRevision?: string;
  code?: PiRuntimeGatewaySharedStateUpdateAckCode;
  message?: string;
}) => ({
  type: EventType.CUSTOM,
  name: PI_RUNTIME_SHARED_STATE_CONTROL_EVENT,
  value: {
    kind: 'update-ack',
    clientMutationId: params.clientMutationId,
    status: params.status,
    resultingRevision: params.resultingRevision,
    ...(params.baseRevision ? { baseRevision: params.baseRevision } : {}),
    ...(params.code ? { code: params.code } : {}),
    ...(params.message ? { message: params.message } : {}),
  },
} satisfies BaseEvent);

const readSharedStateUpdateCommand = (
  request: PiRuntimeGatewayRunRequest,
):
  | { kind: 'none' }
  | {
      kind: 'invalid';
      error: string;
    }
  | {
      kind: 'update';
      clientMutationId: string;
      baseRevision: string | undefined;
      patch: unknown;
    } => {
  const update = request.forwardedProps?.command?.update;
  if (!isRecord(update)) {
    return { kind: 'none' };
  }

  const clientMutationId =
    typeof update.clientMutationId === 'string' && update.clientMutationId.length > 0
      ? update.clientMutationId
      : undefined;
  if (!clientMutationId) {
    return {
      kind: 'invalid',
      error: MISSING_CLIENT_MUTATION_ID_ERROR,
    };
  }

  return {
    kind: 'update',
    clientMutationId,
    baseRevision:
      typeof update.baseRevision === 'string' && update.baseRevision.length > 0
        ? update.baseRevision
        : undefined,
    patch: Object.prototype.hasOwnProperty.call(update, 'patch') ? update.patch : undefined,
  };
};

const validateSharedStatePatch = (
  patch: unknown,
):
  | {
      ok: true;
      patch: ReadonlyArray<Record<string, unknown>>;
    }
  | {
      ok: false;
      code: PiRuntimeGatewaySharedStateUpdateAckCode;
    } => {
  if (!Array.isArray(patch)) {
    return {
      ok: false,
      code: 'invalid_patch',
    };
  }

  for (const operation of patch) {
    if (!isRecord(operation)) {
      return {
        ok: false,
        code: 'invalid_patch',
      };
    }

    const op = operation.op;
    const path = operation.path;
    if ((op !== 'add' && op !== 'replace' && op !== 'remove') || typeof path !== 'string') {
      return {
        ok: false,
        code: 'invalid_patch',
      };
    }

    if (path !== '/shared' && !path.startsWith('/shared/')) {
      return {
        ok: false,
        code: 'forbidden_path',
      };
    }
  }

  return {
    ok: true,
    patch,
  };
};

const shouldDebugPiGateway = process.env.PI_GATEWAY_DEBUG === 'true';
const PORTABLE_PI_TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

function logPiGatewayDebug(message: string, detail?: unknown): void {
  if (!shouldDebugPiGateway) {
    return;
  }

  console.warn('[pi-gateway][debug]', {
    ts: new Date().toISOString(),
    message,
    ...(detail === undefined ? {} : { detail }),
  });
}

function validatePiGatewayToolNames(_model: Model<Api>, tools: readonly AgentTool[] | undefined): void {
  if (!tools || tools.length === 0) {
    return;
  }

  const invalidToolNames = tools.map((tool) => tool.name).filter((name) => !PORTABLE_PI_TOOL_NAME_PATTERN.test(name));

  if (invalidToolNames.length === 0) {
    return;
  }

  throw new Error(
    `Invalid Pi tool name(s): ${invalidToolNames.join(', ')}. Tool names must match ^[a-zA-Z0-9_-]+$ for cross-provider compatibility.`,
  );
}

export const createPiRuntimeGatewayMockStream = (
  responseText: string,
): NonNullable<AgentOptions['streamFn']> => {
  return (model) => {
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isTextPart = (value: unknown): value is { type: 'text'; text: string } =>
  isRecord(value) && value.type === 'text' && typeof value.text === 'string';

const isThinkingPart = (value: unknown): value is { type: 'thinking'; thinking: string } =>
  isRecord(value) && value.type === 'thinking' && typeof value.thinking === 'string';

const getMessageErrorText = (message: unknown): string | undefined =>
  isRecord(message) && typeof message.errorMessage === 'string' ? message.errorMessage : undefined;

const isToolCallPart = (
  value: unknown,
): value is { type: 'toolCall'; id: string; name: string; arguments: unknown } =>
  isRecord(value) &&
  value.type === 'toolCall' &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  'arguments' in value;

const resolveProjectedMessageId = (executionId: string, message: AgentMessage, fallbackIndex: number): string => {
  const role = getMessageRole(message);
  const timestamp = getMessageTimestamp(message) ?? fallbackIndex;
  return `pi:${executionId}:${role}:${timestamp}`;
};

const resolveProjectedReasoningMessageId = (
  executionId: string,
  assistantMessageId: string,
  contentIndex: number,
): string => `pi:${executionId}:reasoning:${assistantMessageId}:${contentIndex}`;

const getTextContent = (message: AgentMessage): string | undefined => {
  if (typeof message !== 'object' || message === null || !('content' in message)) {
    return getMessageErrorText(message);
  }

  const { content } = message as { content?: unknown };
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return undefined;
  }

  const text = content
    .flatMap((part) => (isTextPart(part) ? [part.text] : []))
    .join('');

  if (text.length > 0) {
    return text;
  }

  return getMessageErrorText(message);
};

const getAssistantToolCalls = (message: AgentMessage): Array<{
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}> => {
  if (typeof message !== 'object' || message === null || !('content' in message)) {
    return [];
  }

  const { content } = message as { content?: unknown };
  if (!Array.isArray(content)) {
    return [];
  }

  return content.flatMap((part) => {
    if (!isToolCallPart(part)) {
      return [];
    }

    return [
      {
        id: part.id,
        type: 'function',
        function: {
          name: part.name,
          arguments: JSON.stringify(part.arguments),
        },
      },
    ];
  });
};

const getReasoningMessages = (params: {
  executionId: string;
  assistantMessageId: string;
  message: AgentMessage;
}): AgUiMessage[] => {
  if (typeof params.message !== 'object' || params.message === null || !('content' in params.message)) {
    return [];
  }

  const { content } = params.message as { content?: unknown };
  if (!Array.isArray(content)) {
    return [];
  }

  return content.flatMap((part, index) => {
    if (!isThinkingPart(part)) {
      return [];
    }

    return [
      {
        id: resolveProjectedReasoningMessageId(params.executionId, params.assistantMessageId, index),
        role: 'reasoning',
        content: part.thinking,
      } satisfies AgUiMessage,
    ];
  });
};

export const projectPiAgentMessagesToAgUiMessages = (params: {
  executionId: string;
  messages: AgentMessage[];
}): AgUiMessage[] => {
  let fallbackIndex = 0;

  return params.messages.flatMap((message): AgUiMessage[] => {
    if (
      isPiRuntimeGatewayRuntimeNoteMessage(message) ||
      isPiRuntimeGatewayArtifactMessage(message) ||
      isPiRuntimeGatewayA2UiMessage(message)
    ) {
      return [];
    }

    fallbackIndex += 1;
    const id = resolveProjectedMessageId(params.executionId, message, fallbackIndex);
    const role = getMessageRole(message);

    switch (role) {
      case 'user':
        return [
          {
            id,
            role: 'user',
            content: getTextContent(message) ?? '',
          },
        ];
      case 'assistant': {
        const reasoningMessages = getReasoningMessages({
          executionId: params.executionId,
          assistantMessageId: id,
          message,
        });
        const toolCalls = getAssistantToolCalls(message);
        const content = getTextContent(message);

        return [
          ...reasoningMessages,
          {
            id,
            role: 'assistant',
            ...(content ? { content } : {}),
            ...(toolCalls.length > 0 ? { toolCalls } : {}),
          },
        ];
      }
      case 'toolResult':
        return [
          {
            id,
            role: 'tool',
            toolCallId:
              typeof message === 'object' &&
              message !== null &&
              'toolCallId' in message &&
              typeof message.toolCallId === 'string'
                ? message.toolCallId
                : 'pi-tool-call',
            content: getTextContent(message) ?? '',
            ...(
              typeof message === 'object' &&
              message !== null &&
              'isError' in message &&
              message.isError === true
                ? { error: getTextContent(message) ?? 'Tool execution failed.' }
                : {}
            ),
          },
        ];
      default:
        return [];
    }
  });
};

const mergeAgUiMessages = (baseMessages: readonly AgUiMessage[], incomingMessages: readonly AgUiMessage[]): AgUiMessage[] => {
  const merged = [...baseMessages];
  const indexById = new Map<string, number>();

  for (const [index, message] of merged.entries()) {
    indexById.set(message.id, index);
  }

  for (const message of incomingMessages) {
    const existingIndex = indexById.get(message.id);
    if (existingIndex === undefined) {
      indexById.set(message.id, merged.length);
      merged.push(message);
      continue;
    }

    merged[existingIndex] = message;
  }

  return merged;
};

const selectAgUiPromptDeltaMessages = (
  persistedMessages: readonly AgUiMessage[],
  requestMessages: readonly AgUiMessage[],
): AgUiMessage[] => {
  const persistedMessagesById = new Map<string, string>();

  for (const message of persistedMessages) {
    persistedMessagesById.set(message.id, JSON.stringify(message));
  }

  return requestMessages.filter((message) => {
    const persistedMessage = persistedMessagesById.get(message.id);
    return persistedMessage === undefined || persistedMessage !== JSON.stringify(message);
  });
};

type PersistedTextMessageStartEvent = {
  type: EventType.TEXT_MESSAGE_START;
  messageId: string;
  role: string;
};

type PersistedTextMessageContentEvent = {
  type: EventType.TEXT_MESSAGE_CONTENT;
  messageId: string;
  delta: string;
};

type PersistedReasoningMessageStartEvent = {
  type: EventType.REASONING_MESSAGE_START;
  messageId: string;
};

type PersistedReasoningMessageContentEvent = {
  type: EventType.REASONING_MESSAGE_CONTENT;
  messageId: string;
  delta: string;
};

type PersistedToolCallStartEvent = {
  type: EventType.TOOL_CALL_START;
  toolCallId: string;
  toolCallName: string;
  parentMessageId?: string;
};

type PersistedToolCallArgsEvent = {
  type: EventType.TOOL_CALL_ARGS;
  toolCallId: string;
  delta: string;
};

type PersistedToolCallResultEvent = {
  type: EventType.TOOL_CALL_RESULT;
  messageId: string;
  toolCallId: string;
  content: string;
  error?: string;
};

const isBaseEventRecord = (event: BaseEvent): event is BaseEvent & Record<string, unknown> =>
  typeof event === 'object' && event !== null;

const isPersistedTextMessageStartEvent = (event: BaseEvent): event is PersistedTextMessageStartEvent =>
  isBaseEventRecord(event) &&
  event.type === EventType.TEXT_MESSAGE_START &&
  typeof event.messageId === 'string' &&
  typeof event.role === 'string';

const isPersistedTextMessageContentEvent = (event: BaseEvent): event is PersistedTextMessageContentEvent =>
  isBaseEventRecord(event) &&
  event.type === EventType.TEXT_MESSAGE_CONTENT &&
  typeof event.messageId === 'string' &&
  typeof event.delta === 'string';

const isPersistedReasoningMessageStartEvent = (event: BaseEvent): event is PersistedReasoningMessageStartEvent =>
  isBaseEventRecord(event) &&
  event.type === EventType.REASONING_MESSAGE_START &&
  typeof event.messageId === 'string';

const isPersistedReasoningMessageContentEvent = (event: BaseEvent): event is PersistedReasoningMessageContentEvent =>
  isBaseEventRecord(event) &&
  event.type === EventType.REASONING_MESSAGE_CONTENT &&
  typeof event.messageId === 'string' &&
  typeof event.delta === 'string';

const isPersistedToolCallStartEvent = (event: BaseEvent): event is PersistedToolCallStartEvent =>
  isBaseEventRecord(event) &&
  event.type === EventType.TOOL_CALL_START &&
  typeof event.toolCallId === 'string' &&
  typeof event.toolCallName === 'string' &&
  (!('parentMessageId' in event) || typeof event.parentMessageId === 'string');

const isPersistedToolCallArgsEvent = (event: BaseEvent): event is PersistedToolCallArgsEvent =>
  isBaseEventRecord(event) &&
  event.type === EventType.TOOL_CALL_ARGS &&
  typeof event.toolCallId === 'string' &&
  typeof event.delta === 'string';

const isPersistedToolCallResultEvent = (event: BaseEvent): event is PersistedToolCallResultEvent =>
  isBaseEventRecord(event) &&
  event.type === EventType.TOOL_CALL_RESULT &&
  typeof event.messageId === 'string' &&
  typeof event.toolCallId === 'string' &&
  typeof event.content === 'string' &&
  (!('error' in event) || typeof event.error === 'string');

const applyProjectedRunEventsToMessages = (
  baseMessages: readonly AgUiMessage[],
  projectedEvents: readonly BaseEvent[],
): AgUiMessage[] => {
  const messages = [...baseMessages];
  const indexById = new Map(messages.map((message, index) => [message.id, index]));

  const upsertMessage = (message: AgUiMessage): void => {
    const existingIndex = indexById.get(message.id);
    if (existingIndex === undefined) {
      indexById.set(message.id, messages.length);
      messages.push(message);
      return;
    }

    messages[existingIndex] = message;
  };

  const updateMessage = (
    messageId: string,
    create: () => AgUiMessage,
    update: (message: AgUiMessage) => AgUiMessage,
  ): void => {
    const existingIndex = indexById.get(messageId);
    if (existingIndex === undefined) {
      const created = create();
      indexById.set(messageId, messages.length);
      messages.push(update(created));
      return;
    }

    messages[existingIndex] = update(messages[existingIndex]!);
  };

  const updateAssistantToolCall = (
    messageId: string,
    toolCallId: string,
    update: (toolCall: {
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }) => {
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    },
    defaults?: {
      name: string;
      arguments: string;
    },
  ): void => {
    updateMessage(
      messageId,
      () => ({
        id: messageId,
        role: 'assistant',
        toolCalls: [],
      }),
      (message) => {
        const toolCalls = message.role === 'assistant' && Array.isArray(message.toolCalls) ? [...message.toolCalls] : [];
        const existingToolCallIndex = toolCalls.findIndex((toolCall) => toolCall.id === toolCallId);
        const baselineToolCall =
          existingToolCallIndex === -1
            ? {
                id: toolCallId,
                type: 'function' as const,
                function: {
                  name: defaults?.name ?? 'pi-tool-call',
                  arguments: defaults?.arguments ?? '',
                },
              }
            : toolCalls[existingToolCallIndex]!;
        const nextToolCall = update(baselineToolCall);

        if (existingToolCallIndex === -1) {
          toolCalls.push(nextToolCall);
        } else {
          toolCalls[existingToolCallIndex] = nextToolCall;
        }

        return {
          ...(message.role === 'assistant'
            ? message
            : {
                id: messageId,
                role: 'assistant' as const,
              }),
          toolCalls,
        };
      },
    );
  };

  for (const event of projectedEvents) {
    if (isPersistedTextMessageStartEvent(event)) {
      const role = event.role;
      if (role === 'assistant' || role === 'user') {
        updateMessage(
          event.messageId,
          () => ({
            id: event.messageId,
            role,
            content: '',
          }),
          (message) =>
            role === 'assistant'
              ? {
                  id: event.messageId,
                  role: 'assistant',
                  content: '',
                  ...(message.role === 'assistant' && Array.isArray(message.toolCalls)
                    ? { toolCalls: message.toolCalls }
                    : {}),
                }
              : {
                  id: event.messageId,
                  role: 'user',
                  content: '',
                },
        );
      }
      continue;
    }

    if (isPersistedTextMessageContentEvent(event)) {
      updateMessage(
        event.messageId,
        () => ({
          id: event.messageId,
          role: 'assistant',
          content: '',
        }),
        (message) => {
          const role = message.role === 'user' ? 'user' : 'assistant';

          return {
            id: event.messageId,
            role,
            content: `${typeof message.content === 'string' ? message.content : ''}${event.delta}`,
            ...(role === 'assistant' && message.role === 'assistant' && Array.isArray(message.toolCalls)
              ? { toolCalls: message.toolCalls }
              : {}),
          };
        },
      );
      continue;
    }

    if (isPersistedReasoningMessageStartEvent(event)) {
      upsertMessage({
        id: event.messageId,
        role: 'reasoning',
        content: '',
      });
      continue;
    }

    if (isPersistedReasoningMessageContentEvent(event)) {
      updateMessage(
        event.messageId,
        () => ({
          id: event.messageId,
          role: 'reasoning',
          content: '',
        }),
        (message) => ({
          ...message,
          role: 'reasoning',
          content: `${typeof message.content === 'string' ? message.content : ''}${event.delta}`,
        }),
      );
      continue;
    }

    if (isPersistedToolCallStartEvent(event)) {
      if (event.parentMessageId) {
        updateAssistantToolCall(
          event.parentMessageId,
          event.toolCallId,
          () => ({
            id: event.toolCallId,
            type: 'function',
            function: {
              name: event.toolCallName,
              arguments: '',
            },
          }),
          {
            name: event.toolCallName,
            arguments: '',
          },
        );
      }
      continue;
    }

    if (isPersistedToolCallArgsEvent(event)) {
      for (const [messageId, index] of indexById.entries()) {
        const candidate = messages[index];
        if (candidate?.role !== 'assistant' || !Array.isArray(candidate.toolCalls)) {
          continue;
        }
        const toolCall = candidate.toolCalls.find((value) => value.id === event.toolCallId);
        if (!toolCall) {
          continue;
        }
        updateAssistantToolCall(messageId, event.toolCallId, (currentToolCall) => ({
          ...currentToolCall,
          function: {
            ...currentToolCall.function,
            arguments: `${currentToolCall.function.arguments}${event.delta}`,
          },
        }));
        break;
      }
      continue;
    }

    if (isPersistedToolCallResultEvent(event)) {
      upsertMessage({
        id: event.messageId,
        role: 'tool',
        toolCallId: event.toolCallId,
        content: event.content,
        ...(typeof event.error === 'string' ? { error: event.error } : {}),
      });
    }
  }

  return messages;
};

const buildExecutionStatusText = (session: PiRuntimeGatewaySession): string =>
  [
    `Thread ${session.thread.id} execution ${session.execution.id} is ${session.execution.status}.`,
    session.execution.statusMessage,
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ');

const getAgentFailureMessage = (agent: PiRuntimeGatewayAgent): string | undefined => {
  const { error } = agent.state as { error?: unknown };
  return typeof error === 'string' && error.trim().length > 0 ? error : undefined;
};

const applyAgentFailureToSession = (
  session: PiRuntimeGatewaySession,
  failureMessage: string | undefined,
): PiRuntimeGatewaySession =>
  failureMessage
    ? {
        ...session,
        execution: {
          ...session.execution,
          status: 'failed',
          statusMessage: failureMessage,
        },
      }
    : session;

const buildPiRuntimeGatewaySystemPromptLines = (session: PiRuntimeGatewaySession): string[] => {
  const executionStatusText = buildExecutionStatusText(session);
  return executionStatusText.length > 0 ? [`<pi-runtime-gateway>${executionStatusText}</pi-runtime-gateway>`] : [];
};

const appendPiRuntimeGatewaySystemPromptContext = (
  systemPrompt: string | undefined,
  lines: readonly string[],
): string | undefined => {
  if (lines.length === 0) {
    return systemPrompt;
  }

  const appended = lines.join('\n');
  if (!systemPrompt || systemPrompt.trim().length === 0) {
    return appended;
  }

  return `${systemPrompt}\n\n${appended}`;
};

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
    if (
      isPiRuntimeGatewayRuntimeNoteMessage(message) ||
      isPiRuntimeGatewayArtifactMessage(message) ||
      isPiRuntimeGatewayA2UiMessage(message)
    ) {
      return [];
    }

    return [message];
  });

  return delegate ? delegate(preprocessedMessages) : preprocessedMessages.filter(isLlmCompatibleMessage);
};

const readReplayAssistantModelIdentity = (
  model: unknown,
): {
  api: string;
  provider: string;
  model: string;
} | null => {
  if (!isRecord(model)) {
    return null;
  }

  const api = typeof model.api === 'string' ? model.api : null;
  const provider = typeof model.provider === 'string' ? model.provider : null;
  const modelId = typeof model.id === 'string' ? model.id : null;

  if (!api || !provider || !modelId) {
    return null;
  }

  return {
    api,
    provider,
    model: modelId,
  };
};

const convertAgUiMessagesToPiMessages = (
  messages: AgUiMessage[],
  now: () => number,
  assistantModelIdentity?: {
    api: string;
    provider: string;
    model: string;
  } | null,
): AgentMessage[] =>
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
      case 'assistant': {
        const content: Array<
          { type: 'text'; text: string } | { type: 'toolCall'; id: string; name: string; arguments: unknown }
        > = [];

        if (typeof message.content === 'string' && message.content.length > 0) {
          content.push({ type: 'text', text: message.content });
        }

        if (Array.isArray(message.toolCalls)) {
          for (const toolCall of message.toolCalls) {
            content.push({
              type: 'toolCall',
              id: toolCall.id,
              name: toolCall.function.name,
              arguments: parseAgUiToolCallArguments(toolCall.function.arguments),
            });
          }
        }

        return [
          {
            role: 'assistant',
            content,
            api: (assistantModelIdentity?.api ?? 'responses') as never,
            provider: (assistantModelIdentity?.provider ?? 'openai') as never,
            model: assistantModelIdentity?.model ?? 'ag-ui-projected',
            usage: EMPTY_USAGE,
            stopReason: 'stop',
            timestamp: now(),
          } as AgentMessage,
        ];
      }
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

const parseAgUiToolCallArguments = (serializedArguments: string): unknown => {
  try {
    return JSON.parse(serializedArguments);
  } catch {
    return serializedArguments;
  }
};

function hasResumePayload(command: PiRuntimeGatewayForwardedCommand | undefined): boolean {
  return !!command && Object.prototype.hasOwnProperty.call(command, 'resume');
}

function serializeResumePayload(resumePayload: unknown): string {
  if (typeof resumePayload === 'string') {
    return resumePayload;
  }

  const serialized = JSON.stringify(resumePayload);
  return typeof serialized === 'string' ? serialized : String(resumePayload);
}

const buildResumePromptMessages = (resumePayload: unknown, now: () => number): AgentMessage[] => [
  {
    role: 'user',
    content: serializeResumePayload(resumePayload),
    timestamp: now(),
  },
];

const stripLegacyThreadMirrors = <TThread extends Record<string, unknown>>(thread: TThread): TThread => {
  const {
    messages: _messages,
    domainProjection: _domainProjection,
    ...canonicalThread
  } = thread as TThread & {
    messages?: unknown;
    domainProjection?: unknown;
  };
  return canonicalThread as TThread;
};

const shouldEmitArtifactActivityFallback = (
  artifact: PiRuntimeGatewayArtifact | undefined,
): artifact is PiRuntimeGatewayArtifact => {
  if (!artifact) {
    return false;
  }

  if (!isRecord(artifact.data) || artifact.data.type !== 'interrupt-status') {
    return true;
  }

  return artifact.data.mirroredToActivity !== false;
};

export const buildPiThreadStateSnapshot = (params: PiRuntimeGatewaySession): Record<string, unknown> => {
  const projectedState = getProjectedState(params);
  const activityEvents: PiRuntimeGatewayActivityEvent[] =
    params.activityEvents && params.activityEvents.length > 0
      ? [...params.activityEvents]
      : [
          ...(shouldEmitArtifactActivityFallback(params.artifacts?.activity)
            ? [
                {
                  type: 'artifact',
                  artifact: params.artifacts.activity,
                  append: true,
                } satisfies PiRuntimeGatewayActivityEvent,
              ]
            : []),
          ...(params.a2ui
            ? [
                buildPiA2UiActivityEvent({
                  threadId: params.thread.id,
                  executionId: params.execution.id,
                  payload: params.a2ui,
                }),
              ]
            : []),
        ];

  const baseThread = {
    id: params.thread.id,
    task: {
      id: params.execution.id,
      taskStatus: {
        state: mapExecutionStatusToTaskState(params.execution.status),
        ...(typeof params.execution.statusMessage === 'string'
          ? {
              message: {
                content: params.execution.statusMessage,
              },
            }
          : {}),
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
    shared: getSharedState(params),
    projected: projectedState,
    thread: stripLegacyThreadMirrors(
      mergeThreadPatchForEmit({
        currentThread: baseThread,
        patchThread: params.threadPatch ?? {},
      }),
    ),
  };
};

export const buildPiRuntimeGatewayStateDeltaEvent = (params: {
  previousSession: PiRuntimeGatewaySession;
  session: PiRuntimeGatewaySession;
}): StateDeltaEvent | null => {
  const previousSnapshot = buildPiThreadStateSnapshot(params.previousSession);
  const nextSnapshot = buildPiThreadStateSnapshot(params.session);
  if (!jsonPatchCompare) {
    throw new TypeError('fast-json-patch compare export unavailable');
  }
  const delta = jsonPatchCompare(previousSnapshot, nextSnapshot, true);

  if (delta.length === 0) {
    return null;
  }

  return {
    type: EventType.STATE_DELTA,
    delta,
  } satisfies StateDeltaEvent;
};

export const buildPiRuntimeGatewayStateRebaselineEvent = (params: {
  previousSession: PiRuntimeGatewaySession;
  session: PiRuntimeGatewaySession;
}): StateSnapshotEvent | null => {
  const previousSnapshot = buildPiThreadStateSnapshot(params.previousSession);
  const nextSnapshot = buildPiThreadStateSnapshot(params.session);
  if (!jsonPatchCompare) {
    throw new TypeError('fast-json-patch compare export unavailable');
  }
  const delta = jsonPatchCompare(previousSnapshot, nextSnapshot, true);

  if (delta.length === 0) {
    return null;
  }

  // Run completion can fold in state changes that were already published on
  // another stream. A snapshot re-establishes the AG-UI baseline for future
  // deltas instead of assuming the client still matches previousSession.
  return {
    type: EventType.STATE_SNAPSHOT,
    snapshot: nextSnapshot,
  } satisfies StateSnapshotEvent;
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

export const buildPiRuntimeGatewayConnectEvents = (params: {
  threadId: string;
  runId: string;
  session: PiRuntimeGatewaySession;
  hydrationReason?: PiRuntimeGatewaySharedStateHydrationReason;
}): BaseEvent[] => {
  const messagesSnapshotEvent: MessagesSnapshotEvent | null = params.session.messages
    ? {
        type: EventType.MESSAGES_SNAPSHOT,
        messages: params.session.messages,
      }
    : null;

  return [
    asBaseEvent({
      type: EventType.RUN_STARTED,
      threadId: params.threadId,
      runId: params.runId,
    } satisfies RunStartedEvent),
    {
      type: EventType.STATE_SNAPSHOT,
      snapshot: buildPiThreadStateSnapshot(params.session),
    } satisfies StateSnapshotEvent,
    buildSharedStateControlHydrationEvent({
      reason:
        params.hydrationReason ?? (params.session.sharedStateHydrated ? 'reconnect' : 'bootstrap'),
      revision: getSharedStateRevision(params.session),
    }),
    ...(messagesSnapshotEvent ? [messagesSnapshotEvent] : []),
    asBaseEvent({
      type: EventType.RUN_FINISHED,
      threadId: params.threadId,
      runId: params.runId,
      result: {
        executionId: params.session.execution.id,
        status: params.session.execution.status,
      },
    } satisfies RunFinishedEvent),
  ];
};

export const mapPiAgentEventsToAgUiEvents = (params: {
  executionId: string;
  events: AgentEvent[];
}): BaseEvent[] => {
  const projector = createPiAgentEventProjector(params.executionId);
  return params.events.flatMap((event) => projector.project(event));
};

function createPiAgentEventProjector(
  executionId: string,
  options: {
    projectUserMessages?: boolean;
  } = {},
): {
  project: (event: AgentEvent) => BaseEvent[];
} {
  const mapped: BaseEvent[] = [];
  const seenToolStarts = new Set<string>();
  const messageIdsWithTextContent = new Set<string>();
  const openReasoningMessageIds = new Set<string>();
  const projectUserMessages = options.projectUserMessages ?? true;
  let currentMessageId: string | null = null;
  let fallbackIndex = 0;

  return {
    project: (event) => {
      mapped.length = 0;

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
        const role = getMessageRole(event.message);
        const shouldProjectMessage =
          role === 'assistant' || (role === 'user' && projectUserMessages);
        if (!shouldProjectMessage) {
          currentMessageId = null;
          break;
        }
        fallbackIndex += 1;
        currentMessageId = resolveProjectedMessageId(executionId, event.message, fallbackIndex);
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
          resolveProjectedMessageId(executionId, event.message, fallbackIndex + 1);
        const detail = event.assistantMessageEvent;

        if (detail.type === 'text_delta') {
          messageIdsWithTextContent.add(messageId);
          mapped.push(asBaseEvent({
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId,
            delta: detail.delta,
          }));
        }

        if (detail.type === 'thinking_start') {
          const reasoningMessageId = resolveProjectedReasoningMessageId(
            executionId,
            messageId,
            detail.contentIndex,
          );
          if (!openReasoningMessageIds.has(reasoningMessageId)) {
            openReasoningMessageIds.add(reasoningMessageId);
            mapped.push(asBaseEvent({
              type: EventType.REASONING_START,
              messageId: reasoningMessageId,
            }));
            mapped.push(asBaseEvent({
              type: EventType.REASONING_MESSAGE_START,
              messageId: reasoningMessageId,
              role: 'reasoning',
            }));
          }
        }

        if (detail.type === 'thinking_delta') {
          const reasoningMessageId = resolveProjectedReasoningMessageId(
            executionId,
            messageId,
            detail.contentIndex,
          );
          if (!openReasoningMessageIds.has(reasoningMessageId)) {
            openReasoningMessageIds.add(reasoningMessageId);
            mapped.push(asBaseEvent({
              type: EventType.REASONING_START,
              messageId: reasoningMessageId,
            }));
            mapped.push(asBaseEvent({
              type: EventType.REASONING_MESSAGE_START,
              messageId: reasoningMessageId,
              role: 'reasoning',
            }));
          }
          mapped.push(asBaseEvent({
            type: EventType.REASONING_MESSAGE_CONTENT,
            messageId: reasoningMessageId,
            delta: detail.delta,
          }));
        }

        if (detail.type === 'thinking_end') {
          const reasoningMessageId = resolveProjectedReasoningMessageId(
            executionId,
            messageId,
            detail.contentIndex,
          );
          if (openReasoningMessageIds.has(reasoningMessageId)) {
            mapped.push(asBaseEvent({
              type: EventType.REASONING_MESSAGE_END,
              messageId: reasoningMessageId,
            }));
            mapped.push(asBaseEvent({
              type: EventType.REASONING_END,
              messageId: reasoningMessageId,
            }));
            openReasoningMessageIds.delete(reasoningMessageId);
          }
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
            toolCallId: toolCall?.type === 'toolCall' ? toolCall.id : `pi:${executionId}:tool-call`,
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
          messageId: `pi:${executionId}:tool-result:${event.toolCallId}`,
          toolCallId: event.toolCallId,
          content: stringifyUnknown(event.result),
          role: 'tool',
        }));
        break;
      case 'message_end':
        if (currentMessageId) {
          const role = getMessageRole(event.message);
          if (role === 'assistant' || role === 'user') {
            const content = getTextContent(event.message);
            if (!messageIdsWithTextContent.has(currentMessageId) && content) {
              messageIdsWithTextContent.add(currentMessageId);
              mapped.push(asBaseEvent({
                type: EventType.TEXT_MESSAGE_CONTENT,
                messageId: currentMessageId,
                delta: content,
              }));
            }
            mapped.push(asBaseEvent({
              type: EventType.TEXT_MESSAGE_END,
              messageId: currentMessageId,
            }));
          }
          messageIdsWithTextContent.delete(currentMessageId);
        }
        currentMessageId = null;
        break;
      default:
        break;
    }

      return [...mapped];
    },
  };
}

function createAsyncEventStream<T>(run: (controller: {
  push: (value: T) => void;
  close: () => void;
  fail: (error: unknown) => void;
}) => Promise<void> | void): AsyncIterable<T> {
  const values: T[] = [];
  const readers: Array<{
    resolve: (result: IteratorResult<T>) => void;
    reject: (error: unknown) => void;
  }> = [];
  let done = false;
  let failure: Error | null = null;

  const flushValue = (value: T) => {
    const reader = readers.shift();
    if (reader) {
      reader.resolve({ value, done: false });
      return;
    }

    values.push(value);
  };

  const close = () => {
    if (done) return;
    done = true;
    while (readers.length > 0) {
      readers.shift()!.resolve({ value: undefined, done: true });
    }
  };

  const fail = (error: unknown) => {
    if (done) return;
    done = true;
    failure = error instanceof Error ? error : new Error(String(error));
    while (readers.length > 0) {
      readers.shift()!.reject(failure);
    }
  };

  queueMicrotask(() => {
    Promise.resolve(run({ push: flushValue, close, fail })).catch(fail);
  });

  return {
    [Symbol.asyncIterator]() {
      return {
        next() {
          if (values.length > 0) {
            return Promise.resolve({ value: values.shift()!, done: false });
          }

          if (failure !== null) {
            return Promise.reject(failure);
          }

          if (done) {
            return Promise.resolve({ value: undefined, done: true });
          }

          return new Promise<IteratorResult<T>>((resolve, reject) => {
            readers.push({ resolve, reject });
          });
        },
      };
    },
  };
}

export const createPiRuntimeGatewayFoundation = (params: {
  model: Model<Api>;
  systemPrompt: string;
  tools?: AgentTool[];
  databaseUrl?: string;
  agentOptions?: AgentOptions;
  getSessionContext?: () => PiRuntimeGatewaySession | undefined;
  now?: () => number;
}): PiRuntimeGatewayFoundation => {
  validatePiGatewayToolNames(params.model, params.tools);
  const transformContext =
    params.agentOptions?.transformContext
      ? async (messages: AgentMessage[], signal?: AbortSignal) => {
          return await params.agentOptions!.transformContext!(messages, signal);
        }
      : undefined;
  const streamFn: AgentOptions['streamFn'] | undefined = params.getSessionContext
    ? async (model, context, streamOptions) => {
        const session = params.getSessionContext?.();
        const lines = session ? buildPiRuntimeGatewaySystemPromptLines(session) : [];
        const nextContext = lines.length
          ? {
              ...context,
              systemPrompt: appendPiRuntimeGatewaySystemPromptContext(context.systemPrompt, lines),
            }
          : context;

        return await (params.agentOptions?.streamFn ?? streamSimple)(model, nextContext, streamOptions);
      }
    : params.agentOptions?.streamFn;

  const agent = new Agent({
    ...params.agentOptions,
    convertToLlm: (messages) => convertPiRuntimeGatewayMessagesToLlm(messages, params.agentOptions?.convertToLlm),
    transformContext,
    streamFn,
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
  getSession: (threadId: string) => PiRuntimeGatewaySession;
  updateSession?: (
    threadId: string,
    update: (session: PiRuntimeGatewaySession) => PiRuntimeGatewaySession,
  ) => PiRuntimeGatewaySession;
  onSessionUpdated?: (
    threadId: string,
    session: PiRuntimeGatewaySession,
  ) => Promise<void> | void;
  now?: () => number;
}): PiRuntimeGatewayRuntime => {
  const now = params.now ?? (() => Date.now());
  const syncAgentSessionId = (threadId: string): void => {
    params.agent.sessionId = threadId;
  };
  const syncAgentMessagesFromSession = (session: PiRuntimeGatewaySession): void => {
    if (typeof params.agent.replaceMessages !== 'function') {
      return;
    }

    const replayAssistantModelIdentity = readReplayAssistantModelIdentity(
      (params.agent.state as { model?: unknown } | undefined)?.model,
    );
    params.agent.replaceMessages(
      convertAgUiMessagesToPiMessages(
        session.messages ?? [],
        now,
        replayAssistantModelIdentity,
      ),
    );
  };

  const buildMessagesSnapshotEvent = (session: PiRuntimeGatewaySession): MessagesSnapshotEvent | null =>
    session.messages
      ? {
          type: EventType.MESSAGES_SNAPSHOT,
          messages: session.messages,
        }
      : null;
  const persistRequestMessages = async (threadId: string, requestMessages: readonly AgUiMessage[]) => {
    const session =
      requestMessages.length === 0 || !params.updateSession
        ? params.getSession(threadId)
        : params.updateSession(threadId, (session) => ({
            ...session,
            messages: mergeAgUiMessages(session.messages ?? [], requestMessages),
          }));

    await params.onSessionUpdated?.(threadId, session);
    return session;
  };
  const persistRunTranscript = async (
    threadId: string,
    requestMessages: readonly AgUiMessage[],
    projectedEvents: readonly BaseEvent[],
    failureMessage?: string,
  ) => {
    const session =
      !params.updateSession
        ? applyAgentFailureToSession(params.getSession(threadId), failureMessage)
        : params.updateSession(threadId, (session) => ({
            ...applyAgentFailureToSession(session, failureMessage),
            messages: applyProjectedRunEventsToMessages(
              mergeAgUiMessages(session.messages ?? [], requestMessages),
              projectedEvents,
            ),
          }));

    await params.onSessionUpdated?.(threadId, session);
    return session;
  };

  return {
    connect: async (request) => {
      syncAgentSessionId(request.threadId);
      const currentSession = normalizeSharedStateSession(params.getSession(request.threadId));
      const hydrationReason: PiRuntimeGatewaySharedStateHydrationReason = currentSession.sharedStateHydrated
        ? 'reconnect'
        : 'bootstrap';
      const session = params.updateSession
        ? params.updateSession(request.threadId, (session) => ({
            ...normalizeSharedStateSession(session),
            sharedStateHydrated: true,
          }))
        : {
            ...currentSession,
            sharedStateHydrated: true,
          };
      const runId = request.runId ?? `connect:${request.threadId}`;
      await params.onSessionUpdated?.(request.threadId, session);
      return buildPiRuntimeGatewayConnectEvents({
        threadId: request.threadId,
        runId,
        session,
        hydrationReason,
      });
    },
    run: (request) => {
      syncAgentSessionId(request.threadId);
      const initialSession = normalizeSharedStateSession(params.getSession(request.threadId));
      const executionId = initialSession.execution.id;
      const projector = createPiAgentEventProjector(`${executionId}:${request.runId}`, {
        projectUserMessages: (request.messages?.length ?? 0) === 0,
      });
      const projectedRunEvents: BaseEvent[] = [];
      const requestMessages = request.messages ?? [];
      const promptRequestMessages = selectAgUiPromptDeltaMessages(initialSession.messages ?? [], requestMessages);
      const resumePayload = request.forwardedProps?.command?.resume;
      const requestHasResumePayload = hasResumePayload(request.forwardedProps?.command);
      const sharedStateUpdate = readSharedStateUpdateCommand(request);
      if (sharedStateUpdate.kind === 'invalid') {
        throw new TypeError(sharedStateUpdate.error);
      }

      return createAsyncEventStream<BaseEvent>(async (controller) => {
        logPiGatewayDebug('run start', {
          threadId: request.threadId,
          runId: request.runId,
          messageCount: request.messages?.length ?? 0,
          hasResumePayload: requestHasResumePayload,
        });
        controller.push(asBaseEvent({
          type: EventType.RUN_STARTED,
          threadId: request.threadId,
          runId: request.runId,
        } satisfies RunStartedEvent));

        if (sharedStateUpdate.kind === 'update') {
          const currentSession = initialSession;
          const currentRevision = getSharedStateRevision(currentSession);
          const clientMutationId = sharedStateUpdate.clientMutationId;
          const finishWithAck = (paramsForAck: {
            status: PiRuntimeGatewaySharedStateUpdateAckStatus;
            resultingRevision: string;
            code?: PiRuntimeGatewaySharedStateUpdateAckCode;
            baseRevision?: string;
          }) => {
            controller.push(
              buildSharedStateControlUpdateAckEvent({
                clientMutationId,
                status: paramsForAck.status,
                resultingRevision: paramsForAck.resultingRevision,
                ...(paramsForAck.baseRevision ? { baseRevision: paramsForAck.baseRevision } : {}),
                ...(paramsForAck.code ? { code: paramsForAck.code } : {}),
              }),
            );
            controller.push(asBaseEvent({
              type: EventType.RUN_FINISHED,
              threadId: request.threadId,
              runId: request.runId,
              result: {
                executionId: currentSession.execution.id,
                status: currentSession.execution.status,
              },
            } satisfies RunFinishedEvent));
            controller.close();
          };

          if (currentSession.sharedStateHydrated && !sharedStateUpdate.baseRevision) {
            finishWithAck({
              status: 'rejected',
              resultingRevision: currentRevision,
              code: 'missing_base_revision',
            });
            return;
          }

          if (
            sharedStateUpdate.baseRevision &&
            sharedStateUpdate.baseRevision !== currentRevision
          ) {
            finishWithAck({
              status: 'rejected',
              resultingRevision: currentRevision,
              code: 'stale_revision',
              baseRevision: sharedStateUpdate.baseRevision,
            });
            return;
          }

          const validatedPatch = validateSharedStatePatch(sharedStateUpdate.patch);
          if (!validatedPatch.ok) {
            finishWithAck({
              status: 'rejected',
              resultingRevision: currentRevision,
              code: validatedPatch.code,
              ...(sharedStateUpdate.baseRevision ? { baseRevision: sharedStateUpdate.baseRevision } : {}),
            });
            return;
          }

          if (!jsonPatchApply || !jsonPatchCompare) {
            throw new TypeError('fast-json-patch apply/compare export unavailable');
          }

          let nextSharedState: Record<string, unknown>;
          try {
            const nextDocument = jsonPatchApply(
              {
                shared: cloneJson(getSharedState(currentSession)),
              },
              validatedPatch.patch,
              true,
              false,
            ).newDocument as { shared?: unknown };
            if (!isRecord(nextDocument.shared)) {
              finishWithAck({
                status: 'rejected',
                resultingRevision: currentRevision,
                code: 'invalid_patch',
                ...(sharedStateUpdate.baseRevision ? { baseRevision: sharedStateUpdate.baseRevision } : {}),
              });
              return;
            }
            nextSharedState = nextDocument.shared;
          } catch {
            finishWithAck({
              status: 'rejected',
              resultingRevision: currentRevision,
              code: 'invalid_patch',
              ...(sharedStateUpdate.baseRevision ? { baseRevision: sharedStateUpdate.baseRevision } : {}),
            });
            return;
          }

          const sharedDelta = jsonPatchCompare(
            cloneJson(getSharedState(currentSession)),
            cloneJson(nextSharedState),
            true,
          );
          if (sharedDelta.length === 0) {
            finishWithAck({
              status: 'noop',
              resultingRevision: currentRevision,
              ...(sharedStateUpdate.baseRevision ? { baseRevision: sharedStateUpdate.baseRevision } : {}),
            });
            return;
          }

          const nextVersion = getSharedStateVersion(currentSession) + 1;
          const nextRevision = buildSharedStateRevision(nextVersion);
          const nextSession = params.updateSession
            ? params.updateSession(request.threadId, (session) => ({
                ...normalizeSharedStateSession(session),
                sharedState: nextSharedState,
                sharedStateVersion: nextVersion,
                sharedStateRevision: nextRevision,
              }))
            : {
                ...currentSession,
                sharedState: nextSharedState,
                sharedStateVersion: nextVersion,
                sharedStateRevision: nextRevision,
              };
          await params.onSessionUpdated?.(request.threadId, nextSession);

          const stateDeltaEvent = buildPiRuntimeGatewayStateDeltaEvent({
            previousSession: currentSession,
            session: nextSession,
          });
          if (stateDeltaEvent) {
            controller.push(stateDeltaEvent);
          }
          finishWithAck({
            status: 'accepted',
            resultingRevision: nextRevision,
            ...(sharedStateUpdate.baseRevision ? { baseRevision: sharedStateUpdate.baseRevision } : {}),
          });
          return;
        }

        const requestSession = await persistRequestMessages(request.threadId, requestMessages);
        const requestMessagesSnapshotEvent = buildMessagesSnapshotEvent(requestSession);
        if (requestMessagesSnapshotEvent) {
          controller.push(requestMessagesSnapshotEvent);
        }

        const unsubscribe = params.agent.subscribe((event) => {
          logPiGatewayDebug('raw agent event', event);
          for (const projectedEvent of projector.project(event)) {
            projectedRunEvents.push(projectedEvent);
            logPiGatewayDebug('projected ag-ui event', projectedEvent);
            controller.push(projectedEvent);
          }
        });

        try {
          syncAgentMessagesFromSession(initialSession);

          if (promptRequestMessages.length > 0 || requestHasResumePayload) {
            const replayAssistantModelIdentity = readReplayAssistantModelIdentity(
              (params.agent.state as { model?: unknown } | undefined)?.model,
            );
            const promptMessages =
              requestHasResumePayload
                ? buildResumePromptMessages(resumePayload, now)
                : convertAgUiMessagesToPiMessages(
                    promptRequestMessages,
                    now,
                    replayAssistantModelIdentity,
                  );
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

          const failureMessage = getAgentFailureMessage(params.agent);
          const session = await persistRunTranscript(
            request.threadId,
            requestMessages,
            projectedRunEvents,
            failureMessage,
          );
          logPiGatewayDebug('run session after transcript persist', session);
          const stateRebaselineEvent = buildPiRuntimeGatewayStateRebaselineEvent({
            previousSession: requestSession,
            session,
          });
          if (stateRebaselineEvent) {
            controller.push(stateRebaselineEvent);
          }
          const messagesSnapshotEvent = buildMessagesSnapshotEvent(session);
          if (messagesSnapshotEvent) {
            controller.push(messagesSnapshotEvent);
          }
          controller.push(asBaseEvent({
            type: EventType.RUN_FINISHED,
            threadId: request.threadId,
            runId: request.runId,
            result: {
              executionId: session.execution.id,
              status: session.execution.status,
            },
          } satisfies RunFinishedEvent));
          controller.close();
        } catch (error) {
          controller.fail(error);
        } finally {
          unsubscribe();
        }
      });
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
  const findScopedThreadIds = (snapshot: PiRuntimeInspectionSnapshot, scope?: PiRuntimeGatewayControlScope) => {
    if (!scope?.threadId) {
      return null;
    }

    return new Set(
      snapshot.threads
        .filter((thread) => thread.threadId === scope.threadId || thread.threadKey === scope.threadId)
        .map((thread) => thread.threadId),
    );
  };

  return {
    inspectHealth: async () => (await loadSnapshot()).health,
    listThreads: async () => (await loadSnapshot()).threads,
    listExecutions: async () => (await loadSnapshot()).executions,
    listAutomations: async () => (await loadSnapshot()).automations,
    listAutomationRuns: async (scope) => {
      const snapshot = await loadSnapshot();
      const scopedThreadIds = findScopedThreadIds(snapshot, scope);
      return scopedThreadIds
        ? snapshot.automationRuns.filter((run) => scopedThreadIds.has(run.threadId))
        : snapshot.automationRuns;
    },
    listArtifacts: async (scope) => {
      const snapshot = await loadSnapshot();
      const scopedThreadIds = findScopedThreadIds(snapshot, scope);
      return scopedThreadIds
        ? snapshot.artifacts.filter((artifact) => scopedThreadIds.has(artifact.threadId))
        : snapshot.artifacts;
    },
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
    listArtifacts: () => params.controlPlane.listArtifacts(),
    inspectScheduler: () => params.controlPlane.inspectScheduler(),
    inspectOutbox: () => params.controlPlane.inspectOutbox(),
    inspectMaintenance: () => params.controlPlane.inspectMaintenance(),
  },
});

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import type { HttpAgent, HttpAgentConfig } from '@ag-ui/client';
import { EventType, type BaseEvent, type Message as AgUiMessage } from '@ag-ui/core';
import type { AgentOptions as RuntimeAgentOptions, AgentTool as RuntimeAgentTool } from '@mariozechner/pi-agent-core';
import { Type, streamSimple, type Api, type Model } from '@mariozechner/pi-ai';

import {
  buildPiA2UiActivityEvent as buildPiA2UiActivityEventInternal,
  buildPiRuntimeDirectExecutionRecordIds as buildPiRuntimeDirectExecutionRecordIdsInternal,
  buildPiRuntimeGatewayConnectEvents as buildPiRuntimeGatewayConnectEventsInternal,
  buildPiRuntimeGatewayStateDeltaEvent as buildPiRuntimeGatewayStateDeltaEventInternal,
  buildPiRuntimeGatewayStateRebaselineEvent as buildPiRuntimeGatewayStateRebaselineEventInternal,
  createCanonicalPiRuntimeGatewayControlPlane as createCanonicalPiRuntimeGatewayControlPlaneInternal,
  createPiRuntimeGatewayAgUiHandler as createPiRuntimeGatewayAgUiHandlerInternal,
  createPiRuntimeGatewayFoundation as createPiRuntimeGatewayFoundationInternal,
  PiRuntimeGatewayHttpAgent as PiRuntimeGatewayHttpAgentInternal,
  createPiRuntimeGatewayRuntime as createPiRuntimeGatewayRuntimeInternal,
  createPiRuntimeGatewayService as createPiRuntimeGatewayServiceInternal,
  loadPiRuntimeInspectionState as loadPiRuntimeInspectionStateInternal,
  persistPiRuntimeDirectExecution as persistPiRuntimeDirectExecutionInternal,
  type PiRuntimeGatewayActivityEvent,
  type PiRuntimeGatewayArtifact,
  type PiRuntimeGatewayInspectionState,
  type PiRuntimeGatewayRunRequest,
  type PiRuntimeGatewayRuntime,
  type PiRuntimeGatewaySession,
} from '../lib/pi/dist/index.js';
import {
  buildCancelAutomationStatements,
  buildCompleteAutomationExecutionStatements,
  buildPersistAutomationDispatchStatements,
  buildPersistExecutionCheckpointStatements,
  buildPersistInterruptCheckpointStatements,
  buildPersistScheduledAutomationRunSnapshotStatements,
  buildPersistThreadStateStatements,
  buildPiRuntimeStableUuid,
  buildStartAutomationExecutionStatements,
  buildTimeoutAutomationExecutionStatements,
  ensurePiRuntimePostgresReady as ensurePiRuntimePostgresReadyInternal,
  executePostgresStatements,
  isPostgresAffectedRowsError,
  recoverDueAutomations,
} from '../lib/postgres/dist/index.js';

type AgentRuntimeTransformContext = NonNullable<RuntimeAgentOptions['transformContext']>;
type AgentRuntimeStreamFn = NonNullable<RuntimeAgentOptions['streamFn']>;
type AgentRuntimeGetApiKey = NonNullable<RuntimeAgentOptions['getApiKey']>;
type AgentRuntimeInitialState = NonNullable<RuntimeAgentOptions['initialState']>;
type AgentRuntimeConvertToLlm = NonNullable<RuntimeAgentOptions['convertToLlm']>;
type AgentRuntimeTool = RuntimeAgentTool;
type AgentRuntimeInternalForwardedCommand = NonNullable<
  NonNullable<PiRuntimeGatewayRunRequest['forwardedProps']>['command']
>;
type AgentRuntimeConnectEvent = ReturnType<typeof buildPiRuntimeGatewayConnectEventsInternal>[number];
type AgentRuntimeAttachedEventSource = readonly AgentRuntimeConnectEvent[] | AsyncIterable<AgentRuntimeConnectEvent>;
type AgentRuntimeAttachedThreadListener = (event: AgentRuntimeConnectEvent) => void;
type AgentRuntimeAttachedThreadState = {
  listeners: Set<AgentRuntimeAttachedThreadListener>;
  activeRun: {
    runId: string;
    events: AgentRuntimeConnectEvent[];
  } | null;
};

type AgentRuntimeDomainLifecycleCommand<TCommand extends string = string> = {
  name: TCommand;
  description: string;
};

type AgentRuntimeDomainLifecycleTransition<
  TCommand extends string = string,
  TPhase extends string = string,
  TInterrupt extends string = string,
> = {
  command: TCommand;
  from: readonly TPhase[];
  to: TPhase;
  description: string;
  interrupt?: TInterrupt;
};

type AgentRuntimeDomainInterrupt<TInterrupt extends string = string> = {
  type: TInterrupt;
  description: string;
  mirroredToActivity: boolean;
};

type AgentRuntimeDomainLifecycle<
  TPhase extends string = string,
  TCommand extends string = string,
  TInterrupt extends string = string,
> = {
  initialPhase: TPhase;
  phases: readonly TPhase[];
  terminalPhases: readonly TPhase[];
  commands: readonly AgentRuntimeDomainLifecycleCommand<TCommand>[];
  transitions: readonly AgentRuntimeDomainLifecycleTransition<TCommand, TPhase, TInterrupt>[];
  interrupts: readonly AgentRuntimeDomainInterrupt<TInterrupt>[];
};

export type AgentRuntimeDomainOperation = {
  source: 'command' | 'tool' | 'interrupt';
  name: string;
  input?: unknown;
};

export type AgentRuntimeExecutionStatus =
  | 'queued'
  | 'working'
  | 'interrupted'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'auth-required';

export type AgentRuntimeDomainStatusOutput = {
  executionStatus: AgentRuntimeExecutionStatus;
  statusMessage?: string;
};

export type AgentRuntimeDomainArtifactOutput = {
  artifactId?: string;
  data: unknown;
};

export type AgentRuntimeDomainInterruptOutput = {
  type: string;
  mirroredToActivity: boolean;
  message: string;
  payload?: Record<string, unknown>;
};

export type AgentRuntimeDomainOutputs = {
  status?: AgentRuntimeDomainStatusOutput;
  artifacts?: readonly AgentRuntimeDomainArtifactOutput[];
  interrupt?: AgentRuntimeDomainInterruptOutput;
};

export type AgentRuntimeDomainOperationResult<TState = unknown> = {
  state?: TState;
  domainProjectionUpdate?: Record<string, unknown>;
  outputs?: AgentRuntimeDomainOutputs;
};

export type AgentRuntimeDomainContext<TState = unknown> = {
  threadId: string;
  state?: TState;
};

export type AgentRuntimeSystemContext<TState = unknown> = AgentRuntimeDomainContext<TState> & {
  currentProjection?: Record<string, unknown>;
};

export type AgentRuntimeSharedStateProjectionContext<TState = unknown> = AgentRuntimeDomainContext<TState> & {
  sharedState: Record<string, unknown>;
  currentProjection?: Record<string, unknown>;
};

export type AgentRuntimeDomainConfig<TState = unknown> = {
  lifecycle: AgentRuntimeDomainLifecycle;
  systemContext?: (
    params: AgentRuntimeSystemContext<TState>,
  ) =>
    | string
    | readonly string[]
    | undefined
    | Promise<string | readonly string[] | undefined>;
  projectSharedState?: (
    params: AgentRuntimeSharedStateProjectionContext<TState>,
  ) => Record<string, unknown> | undefined;
  handleOperation?: (params: AgentRuntimeDomainContext<TState> & {
    operation: AgentRuntimeDomainOperation;
  }) => AgentRuntimeDomainOperationResult<TState> | Promise<AgentRuntimeDomainOperationResult<TState>>;
};

type AgentRuntimeModel = Model<Api>;

export interface AgentRuntimeAgentOptions {
  getApiKey?: AgentRuntimeGetApiKey;
  initialState?: AgentRuntimeInitialState;
  transformContext?: AgentRuntimeTransformContext;
  streamFn?: AgentRuntimeStreamFn;
  convertToLlm?: AgentRuntimeConvertToLlm;
}

export type AgentRuntimeSharedStatePatchOperation = {
  op: 'add' | 'replace' | 'remove';
  path: string;
  value?: unknown;
};

export type AgentRuntimeForwardedCommand = {
  name?: string;
  input?: unknown;
  resume?: unknown;
  update?: {
    clientMutationId: string;
    baseRevision?: string;
    patch: ReadonlyArray<AgentRuntimeSharedStatePatchOperation>;
  };
};

type AgentRuntimeDomainCommandToolArgs = {
  name: string;
  inputJson: string;
};

export const AGENT_RUNTIME_DOMAIN_COMMAND_TOOL = 'agent_runtime_domain_command';
export const AGENT_RUNTIME_AUTOMATION_SCHEDULE_TOOL = 'automation_schedule';
export const AGENT_RUNTIME_AUTOMATION_LIST_TOOL = 'automation_list';
export const AGENT_RUNTIME_AUTOMATION_CANCEL_TOOL = 'automation_cancel';
export const AGENT_RUNTIME_REQUEST_OPERATOR_INPUT_TOOL = 'request_operator_input';
export type AgentRuntimeConnectRequest = {
  threadId: string;
  runId?: string;
};
export type AgentRuntimeRunRequest = {
  threadId: string;
  runId: string;
  messages?: AgUiMessage[];
  forwardedProps?: {
    command?: AgentRuntimeForwardedCommand;
  };
};
export type AgentRuntimeStopRequest = {
  threadId: string;
  runId: string;
};
export type AgentRuntimeEventSource = readonly BaseEvent[] | AsyncIterable<BaseEvent>;
export interface AgentRuntimeControlPlane {
  inspectHealth: () => Promise<unknown>;
  listThreads: () => Promise<unknown>;
  listExecutions: () => Promise<unknown>;
  listAutomations: () => Promise<unknown>;
  listAutomationRuns: () => Promise<unknown>;
  listArtifacts: () => Promise<unknown>;
  inspectScheduler: () => Promise<unknown>;
  inspectOutbox: () => Promise<unknown>;
  inspectMaintenance: () => Promise<unknown>;
}
export type AgentRuntimeAgUiHandlerOptions = {
  agentId: string;
  basePath?: string;
};
export type AgentRuntimeAgUiHandler = (request: Request) => Promise<Response>;
export type AgentRuntimeHttpAgentConfig = Omit<HttpAgentConfig, 'url'> & {
  runtimeUrl: string;
};
export type AgentRuntimeHttpAgent = HttpAgent & {
  runtimeUrl: string;
  clone: () => AgentRuntimeHttpAgent;
};
export interface AgentRuntimeService {
  connect: (
    request: AgentRuntimeConnectRequest,
  ) => Promise<AgentRuntimeEventSource> | AgentRuntimeEventSource;
  run: (request: AgentRuntimeRunRequest) => Promise<AgentRuntimeEventSource> | AgentRuntimeEventSource;
  stop: (request: AgentRuntimeStopRequest) => Promise<AgentRuntimeEventSource> | AgentRuntimeEventSource;
  control: AgentRuntimeControlPlane;
  createAgUiHandler: (options: AgentRuntimeAgUiHandlerOptions) => AgentRuntimeAgUiHandler;
}

export function createAgentRuntimeHttpAgent(config: AgentRuntimeHttpAgentConfig): AgentRuntimeHttpAgent {
  return new PiRuntimeGatewayHttpAgentInternal(config);
}

type AgentRuntimeExecutionContext = {
  threadId: string;
};

type AgentRuntimeScheduledAutomationContext = {
  automationId: string;
  automationTitle: string;
  scheduledAt: Date;
  rootThreadId: string;
  rootThreadRecordId: string;
  previousRun?: {
    runId: string;
    executionId: string | null;
    status: string;
    completedAt: Date | null;
    summary?: string;
    runDetailRef: string;
    artifactRefs: readonly string[];
    activityRefs: readonly string[];
  };
};

const AGENT_RUNTIME_PERSISTED_DOMAIN_STATE_KEY = '__agentRuntimeDomainState';
const AGENT_RUNTIME_PREVIOUS_RUN_SUMMARY_MAX_CHARS = 512;

type AgentRuntimeSessionStore = {
  hasSession: (threadId: string) => boolean;
  getSession: (threadId: string) => PiRuntimeGatewaySession;
  setSession: (threadId: string, session: PiRuntimeGatewaySession) => PiRuntimeGatewaySession;
  updateSession: (
    threadId: string,
    update: (session: PiRuntimeGatewaySession) => PiRuntimeGatewaySession,
  ) => PiRuntimeGatewaySession;
};

type AgentRuntimeAutomationStatus =
  | 'scheduled'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timed_out'
  | 'canceled';

type AgentRuntimeAutomationRecord = {
  automationId: string;
  threadId: string;
  title: string;
  instruction: string;
  command: string;
  schedule: Record<string, unknown>;
  runId: string;
  executionId: string;
  artifactId: string;
  nextRunAt: string | null;
  status: 'active' | 'completed' | 'canceled';
  lastRunAt: string | null;
  lastRunStatus: string | null;
};

type PersistedExecutionCheckpointStatus =
  | 'queued'
  | 'working'
  | 'interrupted'
  | 'completed'
  | 'failed';

type AgentRuntimeAutomationRegistry = {
  upsert: (record: AgentRuntimeAutomationRecord) => AgentRuntimeAutomationRecord;
  getByThread: (threadId: string) => AgentRuntimeAutomationRecord[];
  getById: (automationId: string) => AgentRuntimeAutomationRecord | undefined;
};

function normalizeDomainSystemContextLines(
  contribution: string | readonly string[] | undefined,
): string[] {
  if (typeof contribution === 'string') {
    const normalized = contribution.trim();
    return normalized.length > 0 ? [normalized] : [];
  }

  if (!Array.isArray(contribution)) {
    return [];
  }

  const lines: string[] = [];
  for (const line of contribution) {
    if (typeof line !== 'string') {
      continue;
    }
    const normalized = line.trim();
    if (normalized.length > 0) {
      lines.push(normalized);
    }
  }

  return lines;
}

function buildDomainCommandToolDescription(lifecycle: AgentRuntimeDomainLifecycle): string {
  const commandList = lifecycle.commands
    .map((command) => `${command.name} (${command.description})`)
    .join('; ');

  return [
    'Execute one of the declared domain lifecycle commands through the runtime-owned normalized operation pipeline.',
    'Put any structured command payload in inputJson as a JSON object string.',
    'Do not rely on the default empty object when the selected command description names required fields.',
    `Available commands: ${commandList}.`,
  ].join(' ');
}

function buildDomainCommandNameSchema(
  lifecycle: AgentRuntimeDomainLifecycle,
): AgentRuntimeTool['parameters'] {
  const literalSchemas = lifecycle.commands.map((command) =>
    Type.Literal(command.name, {
      description: command.description,
    }),
  );

  return (literalSchemas.length === 1 ? literalSchemas[0] : Type.Union(literalSchemas)) as AgentRuntimeTool['parameters'];
}

function appendDomainSystemPromptContext(
  systemPrompt: string | undefined,
  lines: readonly string[],
): string | undefined {
  if (lines.length === 0) {
    return systemPrompt;
  }

  const appended = lines.join('\n');
  if (!systemPrompt || systemPrompt.trim().length === 0) {
    return appended;
  }

  return `${systemPrompt}\n\n${appended}`;
}

function escapeSystemContextXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function buildScheduledAutomationSystemContextLines(
  context: AgentRuntimeScheduledAutomationContext | undefined,
): string[] {
  if (!context) {
    return [];
  }

  const lines = [
    '<scheduled_automation_context>',
    `<automation_id>${escapeSystemContextXml(context.automationId)}</automation_id>`,
    `<automation_title>${escapeSystemContextXml(context.automationTitle)}</automation_title>`,
    `<scheduled_at>${context.scheduledAt.toISOString()}</scheduled_at>`,
    `<root_thread_id>${escapeSystemContextXml(context.rootThreadId)}</root_thread_id>`,
    `<root_thread_record_id>${escapeSystemContextXml(context.rootThreadRecordId)}</root_thread_record_id>`,
  ];

  if (context.previousRun) {
    const previousRunSummary =
      compactScheduledAutomationSummary(context.previousRun.summary) ??
      'No prior result summary recorded.';
    lines.push(
      '<previous_run>',
      `<previous_run_id>${escapeSystemContextXml(context.previousRun.runId)}</previous_run_id>`,
      `<previous_run_execution_id>${escapeSystemContextXml(context.previousRun.executionId ?? '')}</previous_run_execution_id>`,
      `<previous_run_status>${escapeSystemContextXml(context.previousRun.status)}</previous_run_status>`,
      `<previous_run_completed_at>${context.previousRun.completedAt?.toISOString() ?? ''}</previous_run_completed_at>`,
      `<previous_run_summary>${escapeSystemContextXml(previousRunSummary)}</previous_run_summary>`,
      `<previous_run_detail_ref>${escapeSystemContextXml(context.previousRun.runDetailRef)}</previous_run_detail_ref>`,
      ...context.previousRun.artifactRefs.map(
        (ref) => `<previous_run_artifact_ref>${escapeSystemContextXml(ref)}</previous_run_artifact_ref>`,
      ),
      ...context.previousRun.activityRefs.map(
        (ref) => `<previous_run_activity_ref>${escapeSystemContextXml(ref)}</previous_run_activity_ref>`,
      ),
      '</previous_run>',
    );
  }

  lines.push('</scheduled_automation_context>');
  return lines;
}

function shouldDebugLogSystemPrompt(): boolean {
  const value = process.env.DEBUG_AGENT_RUNTIME_SYSTEM_PROMPT?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function logSystemPromptDebug(input: {
  threadId?: string;
  systemPrompt: string | undefined;
}): void {
  if (!shouldDebugLogSystemPrompt()) {
    return;
  }

  const threadLabel = input.threadId ?? 'unknown-thread';
  console.log(
    `[agent-runtime] final system prompt for thread ${threadLabel}:\n${input.systemPrompt ?? ''}`,
  );
}

function materializeSessionLifecycle(
  session: PiRuntimeGatewaySession,
  initialLifecyclePhase?: string,
): PiRuntimeGatewaySession {
  if (!initialLifecyclePhase) {
    return session;
  }

  const existingThreadPatch =
    typeof session.threadPatch === 'object' && session.threadPatch !== null
      ? (session.threadPatch)
      : null;
  const existingLifecycle =
    existingThreadPatch && typeof existingThreadPatch.lifecycle === 'object' && existingThreadPatch.lifecycle !== null
      ? (existingThreadPatch.lifecycle as { phase?: unknown })
      : null;
  if (typeof existingLifecycle?.phase === 'string' && existingLifecycle.phase.length > 0) {
    return session;
  }

  return {
    ...session,
    threadPatch: mergeThreadPatch(session.threadPatch, {
      lifecycle: {
        phase: initialLifecyclePhase,
      },
    }),
  };
}

function buildDefaultSession(threadId: string, initialLifecyclePhase?: string): PiRuntimeGatewaySession {
  return materializeSessionLifecycle({
    thread: { id: threadId },
    execution: {
      id: `agent-runtime:${threadId}`,
      status: 'working',
      statusMessage: 'Ready for a live runtime conversation.',
    },
    messages: [],
    activityEvents: [],
  }, initialLifecyclePhase);
}

function createSessionStore(initialLifecyclePhase?: string): AgentRuntimeSessionStore {
  const sessions = new Map<string, PiRuntimeGatewaySession>();

  const hasSession = (threadId: string): boolean => sessions.has(threadId);

  const getSession = (threadId: string): PiRuntimeGatewaySession => {
    const existing = sessions.get(threadId);
    if (existing) {
      return existing;
    }

    const created = buildDefaultSession(threadId, initialLifecyclePhase);
    sessions.set(threadId, created);
    return created;
  };

  return {
    hasSession,
    getSession,
    setSession: (threadId, session) => {
      sessions.set(threadId, session);
      return session;
    },
    updateSession: (threadId, update) => {
      const nextSession = update(getSession(threadId));
      sessions.set(threadId, nextSession);
      return nextSession;
    },
  };
}

function readPersistedSession(
  threadId: string,
  threadState: Record<string, unknown>,
): PiRuntimeGatewaySession | null {
  const candidateThread =
    typeof threadState.thread === 'object' && threadState.thread !== null
      ? (threadState.thread as { id?: unknown })
      : null;
  const candidateExecution =
    typeof threadState.execution === 'object' && threadState.execution !== null
      ? (threadState.execution as { id?: unknown; status?: unknown })
      : null;

  if (
    candidateThread?.id !== threadId ||
    typeof candidateExecution?.id !== 'string' ||
    typeof candidateExecution.status !== 'string'
  ) {
    return null;
  }

  return normalizeLegacyPersistedInterruptMetadata(
    threadState as unknown as PiRuntimeGatewaySession,
  );
}

function buildScheduledAutomationRunSnapshot(
  session: PiRuntimeGatewaySession,
): Record<string, unknown> {
  const resultSummary =
    compactScheduledAutomationSummary(
      [...(session.messages ?? [])]
      .reverse()
      .find((message) => message.role === 'assistant' && readTrimmedString(message.content))
        ?.content,
    );
  const messages = (session.messages ?? []).map((message) => ({
    id: message.id,
    role: message.role,
    content: typeof message.content === 'string' ? message.content : '[non-text content]',
  }));
  const summarizeArtifactData = (data: unknown): unknown => {
    if (!isRecord(data)) {
      return data;
    }

    return {
      ...(typeof data.type === 'string' ? { type: data.type } : {}),
      ...(typeof data.status === 'string' ? { status: data.status } : {}),
      ...(typeof data.detail === 'string' ? { detail: data.detail } : {}),
      ...(typeof data.summary === 'string' ? { summary: data.summary } : {}),
      ...(typeof data.runId === 'string' ? { runId: data.runId } : {}),
      ...(typeof data.command === 'string' ? { command: data.command } : {}),
    };
  };
  const artifacts: Record<string, unknown> = {};
  if (session.artifacts?.current) {
    artifacts.current = {
      artifactId: session.artifacts.current.artifactId,
      data: summarizeArtifactData(session.artifacts.current.data),
    };
  }
  if (session.artifacts?.activity) {
    artifacts.activity = {
      artifactId: session.artifacts.activity.artifactId,
      data: summarizeArtifactData(session.artifacts.activity.data),
    };
  }
  const activityEvents = (session.activityEvents ?? []).map((event) => {
    if (event.type !== 'artifact') {
      return event;
    }

    return {
      type: event.type,
      append: event.append,
      artifact: {
        artifactId: event.artifact.artifactId,
        data: summarizeArtifactData(event.artifact.data),
      },
    };
  });

  return {
    thread: session.thread,
    execution: session.execution,
    automation: session.automation,
    ...(resultSummary ? { summary: resultSummary } : {}),
    messages,
    artifacts,
    activityEvents,
    ...(session.a2ui ? { a2ui: session.a2ui } : {}),
  };
}

function normalizeLegacyInterruptArtifactData(
  data: unknown,
): Record<string, unknown> | undefined {
  if (!isRecord(data) || data.type !== 'interrupt-status') {
    return undefined;
  }

  const legacyMirroredFlag =
    typeof data.mirroredToActivity === 'boolean'
      ? data.mirroredToActivity
      : typeof data.surfacedInThread === 'boolean'
        ? data.surfacedInThread
        : null;

  if (legacyMirroredFlag === null) {
    return undefined;
  }

  if (typeof data.mirroredToActivity === 'boolean' && !('surfacedInThread' in data)) {
    return undefined;
  }

  const { surfacedInThread: _surfacedInThread, ...remaining } = data;
  return {
    ...remaining,
    mirroredToActivity: legacyMirroredFlag,
  };
}

function normalizeLegacyInterruptArtifact(
  artifact: PiRuntimeGatewayArtifact | undefined,
): PiRuntimeGatewayArtifact | undefined {
  const normalizedData = normalizeLegacyInterruptArtifactData(artifact?.data);
  if (!artifact || !normalizedData) {
    return artifact;
  }

  return {
    ...artifact,
    data: normalizedData,
  };
}

function normalizeLegacyPersistedInterruptMetadata(
  session: PiRuntimeGatewaySession,
): PiRuntimeGatewaySession {
  let nextSession = session;

  const normalizedCurrentArtifact = normalizeLegacyInterruptArtifact(session.artifacts?.current);
  const normalizedActivityArtifact = normalizeLegacyInterruptArtifact(session.artifacts?.activity);
  if (
    normalizedCurrentArtifact !== session.artifacts?.current ||
    normalizedActivityArtifact !== session.artifacts?.activity
  ) {
    nextSession = {
      ...nextSession,
      artifacts: nextSession.artifacts
        ? {
            ...nextSession.artifacts,
            ...(normalizedCurrentArtifact ? { current: normalizedCurrentArtifact } : {}),
            ...(normalizedActivityArtifact ? { activity: normalizedActivityArtifact } : {}),
          }
        : nextSession.artifacts,
    };
  }

  const normalizedActivityEvents = nextSession.activityEvents?.map((event) => {
    if (event.type !== 'artifact') {
      return event;
    }

    const normalizedArtifact = normalizeLegacyInterruptArtifact(event.artifact);
    return normalizedArtifact === event.artifact
      ? event
      : {
          ...event,
          artifact: normalizedArtifact!,
        };
  });
  if (
    normalizedActivityEvents &&
    normalizedActivityEvents.some((event, index) => event !== nextSession.activityEvents?.[index])
  ) {
    nextSession = {
      ...nextSession,
      activityEvents: normalizedActivityEvents,
    };
  }

  return nextSession;
}

function readPersistedDomainState<TState>(
  threadState: Record<string, unknown>,
): TState | undefined {
  return AGENT_RUNTIME_PERSISTED_DOMAIN_STATE_KEY in threadState
    ? (threadState[AGENT_RUNTIME_PERSISTED_DOMAIN_STATE_KEY] as TState)
    : undefined;
}

function readPersistedLifecycleDomainState<TState>(
  threadState: Record<string, unknown>,
): TState | undefined {
  const threadPatch =
    'threadPatch' in threadState && isRecord(threadState.threadPatch) ? threadState.threadPatch : null;
  const lifecycleState =
    threadPatch && 'lifecycle' in threadPatch && isRecord(threadPatch.lifecycle)
      ? threadPatch.lifecycle
      : null;

  return lifecycleState ? (lifecycleState as TState) : undefined;
}

function buildPersistedThreadStateSnapshot<TState>(input: {
  session: PiRuntimeGatewaySession;
  state: TState | undefined;
}): Record<string, unknown> {
  if (input.state === undefined) {
    return input.session as unknown as Record<string, unknown>;
  }

  return {
    ...(input.session as unknown as Record<string, unknown>),
    [AGENT_RUNTIME_PERSISTED_DOMAIN_STATE_KEY]: input.state,
  };
}

function createAutomationRegistry(): AgentRuntimeAutomationRegistry {
  const records = new Map<string, AgentRuntimeAutomationRecord>();
  const byThread = new Map<string, Set<string>>();

  return {
    upsert: (record) => {
      records.set(record.automationId, record);
      const threadRecords = byThread.get(record.threadId) ?? new Set<string>();
      threadRecords.add(record.automationId);
      byThread.set(record.threadId, threadRecords);
      return record;
    },
    getByThread: (threadId) =>
      Array.from(byThread.get(threadId) ?? [])
        .map((automationId) => records.get(automationId))
        .filter((record): record is AgentRuntimeAutomationRecord => record !== undefined),
    getById: (automationId) => records.get(automationId),
  };
}

function buildArtifactActivityEvent(artifact: PiRuntimeGatewayArtifact): PiRuntimeGatewayActivityEvent {
  return {
    type: 'artifact',
    artifact,
    append: true,
  };
}

function appendSessionActivityEvents(
  session: PiRuntimeGatewaySession,
  events: readonly PiRuntimeGatewayActivityEvent[],
): PiRuntimeGatewaySession {
  if (events.length === 0) {
    return session;
  }

  return {
    ...session,
    activityEvents: [...(session.activityEvents ?? []), ...events],
  };
}

function mapAutomationStatusToExecutionStatus(
  status: AgentRuntimeAutomationStatus,
): PiRuntimeGatewaySession['execution']['status'] {
  switch (status) {
    case 'scheduled':
      return 'queued';
    case 'running':
      return 'working';
    case 'completed':
    case 'canceled':
      return 'completed';
    case 'failed':
    case 'timed_out':
      return 'failed';
  }
}

function buildAutomationArtifact(params: {
  artifactId: string;
  automationId: string;
  runId: string;
  rootThreadId: string;
  status: AgentRuntimeAutomationStatus;
  command: string;
  minutes: number;
  detail: string;
}): PiRuntimeGatewayArtifact {
  return {
    artifactId: params.artifactId,
    data: {
      type: 'automation-status',
      automationId: params.automationId,
      runId: params.runId,
      rootThreadId: params.rootThreadId,
      status: params.status,
      command: params.command,
      cadenceMinutes: params.minutes,
      detail: params.detail,
    },
  };
}

function buildAutomationA2Ui(params: {
  automationId: string;
  runId: string;
  rootThreadId: string;
  status: AgentRuntimeAutomationStatus;
  command: string;
  minutes: number;
  detail: string;
}) {
  return {
    kind: 'automation-status' as const,
    payload: {
      automationId: params.automationId,
      runId: params.runId,
      rootThreadId: params.rootThreadId,
      status: params.status,
      command: params.command,
      cadenceMinutes: params.minutes,
      detail: params.detail,
    },
  };
}

function buildAutomationScheduledArtifactMessage(params: {
  artifactId: string;
  automationId: string;
  runId: string;
  rootThreadId: string;
  command: string;
  minutes: number;
  detail: string;
}): AgUiMessage {
  return {
    id: buildPiRuntimeStableUuid(
      'message',
      `agent-runtime:${params.rootThreadId}:automation:${params.automationId}:scheduled-artifact`,
    ),
    role: 'activity',
    activityType: 'artifact',
    content: {
      type: 'automation-status',
      status: 'scheduled',
      title: 'Automation scheduled',
      text: params.detail,
      automationId: params.automationId,
      runId: params.runId,
      rootThreadId: params.rootThreadId,
      artifactId: params.artifactId,
      command: params.command,
      cadenceMinutes: params.minutes,
    },
  };
}

function upsertAgUiMessage(
  messages: readonly AgUiMessage[] | undefined,
  nextMessage: AgUiMessage,
): AgUiMessage[] {
  const baseMessages = messages ?? [];
  const existingIndex = baseMessages.findIndex((message) => message.id === nextMessage.id);
  if (existingIndex === -1) {
    return [...baseMessages, nextMessage];
  }

  return baseMessages.map((message, index) => (index === existingIndex ? nextMessage : message));
}

function buildOperatorInterruptArtifact(params: {
  artifactId: string;
  message: string;
}): PiRuntimeGatewayArtifact {
  return {
    artifactId: params.artifactId,
    data: {
      type: 'interrupt-status',
      status: 'pending',
      message: params.message,
    },
  };
}

function buildOperatorInterruptA2Ui(params: {
  artifactId: string;
  message: string;
}) {
  return {
    kind: 'interrupt' as const,
    payload: {
      type: 'operator-config-request',
      artifactId: params.artifactId,
      message: params.message,
      inputLabel: 'Operator note',
      submitLabel: 'Continue agent loop',
    },
  };
}

function inferAutomationCommand(params: {
  instruction: string;
  title: string;
}): string {
  const instruction = params.instruction.trim();
  if (instruction.length > 0) {
    return instruction;
  }

  return params.title.trim() || 'sync';
}

function coerceSchedule(schedule: unknown, fallback: Record<string, unknown>): Record<string, unknown> {
  return typeof schedule === 'object' && schedule !== null ? (schedule as Record<string, unknown>) : fallback;
}

function readPositiveFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function getScheduleMinutes(schedule: Record<string, unknown>): number {
  const minutes = schedule.intervalMinutes;
  return typeof minutes === 'number' && Number.isFinite(minutes) && minutes >= 1 ? minutes : 5;
}

function buildAutomationTitle(params: {
  command: string;
  schedule: Record<string, unknown>;
}): string {
  return `${params.command} every ${getScheduleMinutes(params.schedule)} minutes`;
}

function describeScheduledAutomation(params: {
  command: string;
  schedule: Record<string, unknown>;
}): string {
  return `Scheduled ${buildAutomationTitle(params)}.`;
}

function describeCanceledAutomation(title: string): string {
  return `Canceled automation ${title}.`;
}

function validateDomainLifecycle(lifecycle: AgentRuntimeDomainLifecycle): void {
  const phases = new Set(lifecycle.phases);
  if (!phases.has(lifecycle.initialPhase)) {
    throw new Error(`Lifecycle initial phase "${lifecycle.initialPhase}" must be declared in phases.`);
  }

  if (phases.size !== lifecycle.phases.length) {
    throw new Error('Lifecycle phases must be unique.');
  }

  const terminalPhases = new Set(lifecycle.terminalPhases);
  if (terminalPhases.size !== lifecycle.terminalPhases.length) {
    throw new Error('Lifecycle terminal phases must be unique.');
  }

  for (const terminalPhase of lifecycle.terminalPhases) {
    if (!phases.has(terminalPhase)) {
      throw new Error(`Lifecycle terminal phase "${terminalPhase}" references an undeclared phase.`);
    }
  }

  const commands = new Set(lifecycle.commands.map((command) => command.name));
  if (commands.size !== lifecycle.commands.length) {
    throw new Error('Lifecycle commands must be unique.');
  }

  const interrupts = new Set(lifecycle.interrupts.map((interrupt) => interrupt.type));
  if (interrupts.size !== lifecycle.interrupts.length) {
    throw new Error('Lifecycle interrupts must be unique.');
  }

  for (const transition of lifecycle.transitions) {
    if (!commands.has(transition.command)) {
      throw new Error(`Lifecycle transition "${transition.command}" references an undeclared command.`);
    }

    if (!phases.has(transition.to)) {
      throw new Error(`Lifecycle transition "${transition.command}" references an undeclared phase "${transition.to}".`);
    }

    for (const fromPhase of transition.from) {
      if (!phases.has(fromPhase)) {
        throw new Error(
          `Lifecycle transition "${transition.command}" references an undeclared phase "${fromPhase}".`,
        );
      }
    }

    if (transition.interrupt && !interrupts.has(transition.interrupt)) {
      throw new Error(
        `Lifecycle transition "${transition.command}" references an undeclared interrupt "${transition.interrupt}".`,
      );
    }
  }
}

function readDirectCommandOperation(
  command: Pick<AgentRuntimeInternalForwardedCommand, 'name' | 'input'> | undefined,
): AgentRuntimeDomainOperation | null {
  if (!command || typeof command.name !== 'string') {
    return null;
  }

  const normalizedName = command.name.trim();
  if (normalizedName.length === 0) {
    return null;
  }

  return {
    source: 'command',
    name: normalizedName,
    ...(Object.prototype.hasOwnProperty.call(command, 'input') ? { input: command.input } : {}),
  };
}

function readInterruptOperation<TState>(params: {
  command: Pick<AgentRuntimeInternalForwardedCommand, 'resume'> | undefined;
  session: PiRuntimeGatewaySession;
  domain: AgentRuntimeDomainConfig<TState> | undefined;
}): AgentRuntimeDomainOperation | null {
  const hasResume = Object.prototype.hasOwnProperty.call(params.command ?? {}, 'resume');
  const resumePayload = params.command?.resume;
  if (!hasResume || !params.domain?.handleOperation) {
    return null;
  }

  const pendingInterruptArtifact = findLatestPendingInterruptArtifact(params.session);
  if (!pendingInterruptArtifact) {
    return null;
  }

  const interruptType = readInterruptType(pendingInterruptArtifact.data);
  if (!interruptType) {
    return null;
  }

  const isDeclaredInterrupt = params.domain.lifecycle.interrupts.some(
    (candidate) => candidate.type === interruptType,
  );
  if (!isDeclaredInterrupt) {
    return null;
  }

  return {
    source: 'interrupt',
    name: interruptType,
    input:
      typeof resumePayload === 'string'
        ? parseDomainCommandToolInput(resumePayload)
        : resumePayload,
  };
}

function parseDomainCommandToolArgs(args: unknown): AgentRuntimeDomainCommandToolArgs | null {
  if (typeof args !== 'object' || args === null) {
    return null;
  }

  const { inputJson, name } = args as {
    inputJson?: unknown;
    name?: unknown;
  };

  if (typeof name !== 'string') {
    return null;
  }

  return {
    name,
    inputJson: typeof inputJson === 'string' ? inputJson : '{}',
  };
}

function parseDomainCommandToolInput(inputJson: string): unknown {
  const normalized = inputJson.trim();
  return normalized.length === 0 ? {} : JSON.parse(normalized);
}

function readInterruptType(data: unknown): string | null {
  return isRecord(data) && typeof data.interruptType === 'string' ? data.interruptType : null;
}

function readInterruptStatus(data: unknown): string | null {
  return isRecord(data) && typeof data.status === 'string' ? data.status : null;
}

function readInterruptPayload(data: unknown): Record<string, unknown> | undefined {
  return isRecord(data) && isRecord(data.payload) ? data.payload : undefined;
}

function readInterruptMirroredToActivity(data: unknown): boolean {
  return isRecord(data) && typeof data.mirroredToActivity === 'boolean'
    ? data.mirroredToActivity
    : true;
}

function isInterruptStatusArtifact(artifact: PiRuntimeGatewayArtifact | undefined): artifact is PiRuntimeGatewayArtifact {
  return isRecord(artifact?.data) && artifact.data.type === 'interrupt-status';
}

function isHiddenPendingInterruptArtifact(
  artifact: PiRuntimeGatewayArtifact | undefined,
): artifact is PiRuntimeGatewayArtifact {
  return (
    isInterruptStatusArtifact(artifact) &&
    readInterruptStatus(artifact.data) === 'pending' &&
    !readInterruptMirroredToActivity(artifact.data)
  );
}

function findLatestPendingInterruptArtifact(
  session: Pick<PiRuntimeGatewaySession, 'activityEvents' | 'artifacts'>,
): PiRuntimeGatewayArtifact | null {
  const resolvedInterruptArtifactIds = new Set<string>();
  const currentArtifact = session.artifacts?.current;

  if (isInterruptStatusArtifact(currentArtifact)) {
    const status = readInterruptStatus(currentArtifact.data);
    if (status === 'pending') {
      return currentArtifact;
    }
    if (status === 'resolved') {
      resolvedInterruptArtifactIds.add(currentArtifact.artifactId);
    }
  }

  const activityArtifact = session.artifacts?.activity;
  if (isInterruptStatusArtifact(activityArtifact)) {
    const status = readInterruptStatus(activityArtifact.data);
    if (status === 'pending' && !resolvedInterruptArtifactIds.has(activityArtifact.artifactId)) {
      return activityArtifact;
    }
    if (status === 'resolved') {
      resolvedInterruptArtifactIds.add(activityArtifact.artifactId);
    }
  }

  for (const event of [...(session.activityEvents ?? [])].reverse()) {
    if (event.type !== 'artifact' || !isInterruptStatusArtifact(event.artifact)) {
      continue;
    }

    const status = readInterruptStatus(event.artifact.data);
    if (status === 'resolved') {
      resolvedInterruptArtifactIds.add(event.artifact.artifactId);
      continue;
    }

    if (status !== 'pending' || resolvedInterruptArtifactIds.has(event.artifact.artifactId)) {
      continue;
    }

    return event.artifact;
  }

  return null;
}

function buildDomainArtifact(params: {
  artifact: AgentRuntimeDomainArtifactOutput;
  threadId: string;
  operationName: string;
  now: () => number;
}): PiRuntimeGatewayArtifact {
  return {
    artifactId:
      params.artifact.artifactId ??
      `domain-artifact:${params.threadId}:${params.operationName}:${params.now()}`,
    data: params.artifact.data,
  };
}

function buildInterruptArtifact(params: {
  interrupt: AgentRuntimeDomainInterruptOutput;
  threadId: string;
  operationName: string;
  now: () => number;
}): PiRuntimeGatewayArtifact {
  return {
    artifactId: `domain-interrupt:${params.threadId}:${params.operationName}:${params.now()}`,
    data: {
      type: 'interrupt-status',
      interruptType: params.interrupt.type,
      status: 'pending',
      mirroredToActivity: params.interrupt.mirroredToActivity,
      message: params.interrupt.message,
      ...(params.interrupt.payload ? { payload: params.interrupt.payload } : {}),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function compactScheduledAutomationSummary(value: unknown): string | undefined {
  const summary = readTrimmedString(value)?.replace(/\s+/g, ' ');
  if (!summary) {
    return undefined;
  }

  if (summary.length <= AGENT_RUNTIME_PREVIOUS_RUN_SUMMARY_MAX_CHARS) {
    return summary;
  }

  return `${summary.slice(0, AGENT_RUNTIME_PREVIOUS_RUN_SUMMARY_MAX_CHARS - 3).trimEnd()}...`;
}

function readScheduledAutomationSnapshotSummary(payload: Record<string, unknown>): string | undefined {
  const snapshot = isRecord(payload.snapshot) ? payload.snapshot : null;
  const summary =
    compactScheduledAutomationSummary(snapshot?.summary) ??
    compactScheduledAutomationSummary(payload.summary);
  if (summary) {
    return summary;
  }

  const artifacts = isRecord(snapshot?.artifacts) ? snapshot.artifacts : null;
  const currentArtifact = isRecord(artifacts?.current) ? artifacts.current : null;
  const currentData = isRecord(currentArtifact?.data) ? currentArtifact.data : null;
  const activityArtifact = isRecord(artifacts?.activity) ? artifacts.activity : null;
  const activityData = isRecord(activityArtifact?.data) ? activityArtifact.data : null;
  return (
    compactScheduledAutomationSummary(currentData?.summary) ??
    compactScheduledAutomationSummary(activityData?.summary) ??
    compactScheduledAutomationSummary(currentData?.detail) ??
    compactScheduledAutomationSummary(activityData?.detail)
  );
}

function readScheduledAutomationSnapshotRunId(payload: Record<string, unknown>): string | undefined {
  return readTrimmedString(payload.automationRunId) ?? readTrimmedString(payload.runId);
}

function buildScheduledAutomationSnapshotActivityEvents(params: {
  inspectionState: PiRuntimeGatewayInspectionState;
  threadId: string;
  existingEvents: readonly PiRuntimeGatewayActivityEvent[];
}): PiRuntimeGatewayActivityEvent[] {
  const existingArtifactIds = new Set(
    params.existingEvents.flatMap((event) =>
      event.type === 'artifact' ? [event.artifact.artifactId] : [],
    ),
  );

  return [...(params.inspectionState.artifacts ?? [])]
    .filter(
      (artifact) =>
        artifact.threadId === params.threadId &&
        artifact.artifactKind === 'automation-run-snapshot' &&
        !existingArtifactIds.has(artifact.artifactId),
    )
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .map((artifact) => ({
      type: 'artifact',
      artifact: {
        artifactId: artifact.artifactId,
        data: {
          type: artifact.artifactKind,
          ...artifact.payload,
        },
      },
      append: true,
    }));
}

function appendPersistedAutomationSnapshotActivityEvents(params: {
  session: PiRuntimeGatewaySession;
  inspectionState: PiRuntimeGatewayInspectionState;
  threadId: string;
}): PiRuntimeGatewaySession {
  const existingEvents = params.session.activityEvents ?? [];
  const snapshotEvents = buildScheduledAutomationSnapshotActivityEvents({
    inspectionState: params.inspectionState,
    threadId: params.threadId,
    existingEvents,
  });
  if (snapshotEvents.length === 0) {
    return params.session;
  }

  return {
    ...params.session,
    activityEvents: [...existingEvents, ...snapshotEvents],
  };
}

function buildLiveScheduledAutomationSnapshotActivityEvent(params: {
  automationId: string;
  automationRunId: string;
  runThreadKey: string;
  rootThreadId: string;
  rootThreadRecordId: string;
  session: PiRuntimeGatewaySession;
}): PiRuntimeGatewayActivityEvent {
  return buildArtifactActivityEvent({
    artifactId: buildPiRuntimeStableUuid(
      'artifact',
      `agent-runtime:${params.automationId}:run:${params.automationRunId}:snapshot`,
    ),
    data: {
      type: 'automation-run-snapshot',
      automationRunId: params.automationRunId,
      runThreadKey: params.runThreadKey,
      rootThreadId: params.rootThreadId,
      rootThreadRecordId: params.rootThreadRecordId,
      snapshot: buildScheduledAutomationRunSnapshot(params.session),
    },
  });
}

function readPreviousAutomationRunArtifactContext(
  params: {
    inspectionState: PiRuntimeGatewayInspectionState;
    threadState: Record<string, unknown>;
    runId: string;
    executionId: string | null;
  },
): { summary?: string; artifactRefs: string[] } {
  const snapshotArtifacts = [...(params.inspectionState.artifacts ?? [])]
    .filter((artifact) => {
      if (artifact.artifactKind !== 'automation-run-snapshot') {
        return false;
      }
      const payloadRunId = readScheduledAutomationSnapshotRunId(artifact.payload);
      return payloadRunId === params.runId ||
        (payloadRunId === undefined && artifact.executionId === params.executionId);
    })
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
  const snapshotArtifact = snapshotArtifacts[0];
  if (snapshotArtifact) {
    const summary = readScheduledAutomationSnapshotSummary(snapshotArtifact.payload);
    return {
      ...(summary ? { summary } : {}),
      artifactRefs: [`artifact:${snapshotArtifact.artifactId}`],
    };
  }

  const snapshotEvent = [...params.inspectionState.executionEvents]
    .filter(
      (event) =>
        event.eventKind === 'automation-run-snapshot' &&
        event.payload !== null &&
        (readScheduledAutomationSnapshotRunId(event.payload) === params.runId ||
          (readScheduledAutomationSnapshotRunId(event.payload) === undefined &&
            event.executionId === params.executionId)),
    )
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
  if (snapshotEvent?.payload) {
    const summary = readScheduledAutomationSnapshotSummary(snapshotEvent.payload);
    return {
      ...(summary ? { summary } : {}),
      artifactRefs: [],
    };
  }

  const events = params.threadState.activityEvents;
  if (!Array.isArray(events)) {
    return { artifactRefs: [] };
  }

  const activityEvents: unknown[] = events;
  for (let index = activityEvents.length - 1; index >= 0; index -= 1) {
    const event = activityEvents[index];
    if (!isRecord(event) || event.type !== 'artifact' || !isRecord(event.artifact)) {
      continue;
    }

    const artifactId =
      typeof event.artifact.artifactId === 'string'
        ? event.artifact.artifactId
        : typeof event.artifact.id === 'string'
          ? event.artifact.id
          : null;
    const data = event.artifact.data;
    if (!isRecord(data) || data.runId !== params.runId) {
      continue;
    }

    const detail = typeof data.detail === 'string' ? data.detail.trim() : '';
    const summary = typeof data.summary === 'string' ? data.summary.trim() : detail;
    return {
      ...(summary.length > 0 ? { summary } : {}),
      artifactRefs: artifactId ? [`artifact:${artifactId}`] : [],
    };
  }

  return { artifactRefs: [] };
}

function buildLifecycleThreadPatch(params: {
  lifecycle: AgentRuntimeDomainLifecycle;
  state: unknown;
}): Record<string, unknown> | undefined {
  if (!isRecord(params.state)) {
    return undefined;
  }

  const phase = params.state.phase;
  if (typeof phase !== 'string' || !params.lifecycle.phases.includes(phase)) {
    return undefined;
  }

  const lifecycleState = Object.fromEntries(
    Object.entries(params.state).filter(([, value]) => value !== undefined),
  );

  return {
    lifecycle: lifecycleState,
  };
}

function isExplicitProjectionDelete(value: unknown): value is { $delete: true } {
  return isRecord(value) && value.$delete === true && Object.keys(value).length === 1;
}

function mergeDomainProjectionValue(currentValue: unknown, updateValue: unknown): unknown {
  if (updateValue === undefined) {
    return currentValue;
  }

  if (isExplicitProjectionDelete(updateValue)) {
    return undefined;
  }

  if (Array.isArray(updateValue)) {
    return updateValue;
  }

  if (isRecord(currentValue) && isRecord(updateValue)) {
    const merged: Record<string, unknown> = { ...currentValue };

    for (const [key, nextValue] of Object.entries(updateValue)) {
      const mergedValue = mergeDomainProjectionValue(currentValue[key], nextValue);
      if (mergedValue === undefined) {
        delete merged[key];
        continue;
      }
      merged[key] = mergedValue;
    }

    return Object.keys(merged).length > 0 ? merged : undefined;
  }

  return updateValue;
}

function mergeDomainProjection(
  currentProjection: Record<string, unknown> | undefined,
  updateProjection: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!updateProjection) {
    return currentProjection;
  }

  const merged = mergeDomainProjectionValue(currentProjection ?? {}, updateProjection);
  return isRecord(merged) ? merged : undefined;
}

function reconcileSharedStateProjection<TState>(params: {
  threadId: string;
  session: PiRuntimeGatewaySession;
  domain: AgentRuntimeDomainConfig<TState> | undefined;
  domainState: TState | undefined;
}): PiRuntimeGatewaySession {
  const projectSharedState = params.domain?.projectSharedState;
  if (!projectSharedState) {
    return params.session;
  }

  const currentProjection = isRecord(params.session.projectedState)
    ? params.session.projectedState
    : undefined;
  const projectionUpdate = projectSharedState({
    threadId: params.threadId,
    state: params.domainState,
    sharedState: isRecord(params.session.sharedState) ? params.session.sharedState : {},
    currentProjection,
  });
  if (!projectionUpdate) {
    return params.session;
  }

  return {
    ...params.session,
    projectedState: mergeDomainProjection(currentProjection, projectionUpdate),
  };
}

function mergeThreadPatch(
  currentPatch: Record<string, unknown> | undefined,
  nextPatch: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!currentPatch) {
    return nextPatch;
  }

  if (!nextPatch) {
    return currentPatch;
  }

  return {
    ...currentPatch,
    ...nextPatch,
  };
}

function applyAutomationStatusUpdate(params: {
  sessionStore: AgentRuntimeSessionStore;
  threadId: string;
  artifactId: string;
  automationId: string;
  executionId?: string;
  activityRunId: string;
  status: AgentRuntimeAutomationStatus;
  command: string;
  minutes: number;
  detail: string;
}): PiRuntimeGatewaySession {
  const artifact = buildAutomationArtifact({
    artifactId: params.artifactId,
    automationId: params.automationId,
    runId: params.activityRunId,
    rootThreadId: params.threadId,
    status: params.status,
    command: params.command,
    minutes: params.minutes,
    detail: params.detail,
  });

  return params.sessionStore.updateSession(params.threadId, (session) => {
    const executionId = params.executionId ?? session.execution.id;
    const a2ui = buildAutomationA2Ui({
      automationId: params.automationId,
      runId: params.activityRunId,
      rootThreadId: params.threadId,
      status: params.status,
      command: params.command,
      minutes: params.minutes,
      detail: params.detail,
    });
    const scheduledArtifactMessage =
      params.status === 'scheduled'
        ? buildAutomationScheduledArtifactMessage({
            artifactId: params.artifactId,
            automationId: params.automationId,
            runId: params.activityRunId,
            rootThreadId: params.threadId,
            command: params.command,
            minutes: params.minutes,
            detail: params.detail,
          })
        : null;

    return appendSessionActivityEvents(
      {
        ...session,
        ...(scheduledArtifactMessage
          ? { messages: upsertAgUiMessage(session.messages, scheduledArtifactMessage) }
          : {}),
        execution: {
          ...session.execution,
          id: executionId,
          status: mapAutomationStatusToExecutionStatus(params.status),
          statusMessage: params.detail,
        },
        automation: {
          id: params.automationId,
          runId: params.activityRunId,
        },
        artifacts: {
          current: artifact,
          activity: artifact,
        },
        a2ui,
      },
      [
        buildArtifactActivityEvent(artifact),
        buildPiA2UiActivityEventInternal({
          threadId: session.thread.id,
          executionId,
          payload: a2ui,
        }),
      ],
    );
  });
}

function applyOperatorInputRequest(params: {
  sessionStore: AgentRuntimeSessionStore;
  threadId: string;
  artifactId: string;
  message: string;
}): PiRuntimeGatewaySession {
  return params.sessionStore.updateSession(params.threadId, (session) => {
    const artifact = buildOperatorInterruptArtifact({
      artifactId: params.artifactId,
      message: params.message,
    });
    const a2ui = buildOperatorInterruptA2Ui({
      artifactId: params.artifactId,
      message: params.message,
    });

    return appendSessionActivityEvents(
      {
        ...session,
        execution: {
          ...session.execution,
          status: 'interrupted',
          statusMessage: params.message,
        },
        artifacts: {
          current: artifact,
          activity: artifact,
        },
        a2ui,
      },
      [
        buildArtifactActivityEvent(artifact),
        buildPiA2UiActivityEventInternal({
          threadId: session.thread.id,
          executionId: session.execution.id,
          payload: a2ui,
        }),
      ],
    );
  });
}

function applyDomainOperationResult(params: {
  threadId: string;
  now: () => number;
  operation: AgentRuntimeDomainOperation;
  session: PiRuntimeGatewaySession;
  lifecycle: AgentRuntimeDomainLifecycle;
  result: AgentRuntimeDomainOperationResult;
}): PiRuntimeGatewaySession {
  const outputs = params.result.outputs;
  const domainOutputs = outputs ?? {};
  const hasDomainProjectionUpdate = 'domainProjectionUpdate' in params.result;
  const lifecycleThreadPatch =
    params.result.state === undefined
      ? undefined
      : buildLifecycleThreadPatch({
          lifecycle: params.lifecycle,
          state: params.result.state,
        });
  const nextLifecyclePhase =
    lifecycleThreadPatch &&
    isRecord(lifecycleThreadPatch['lifecycle']) &&
    typeof lifecycleThreadPatch['lifecycle']['phase'] === 'string'
      ? (lifecycleThreadPatch['lifecycle']['phase'])
      : null;
  if (!outputs && !lifecycleThreadPatch && !hasDomainProjectionUpdate) {
    return params.session;
  }

  let nextArtifacts: PiRuntimeGatewaySession['artifacts'] = params.session.artifacts
    ? {
        ...params.session.artifacts,
      }
    : undefined;
  const nextActivityEvents: PiRuntimeGatewayActivityEvent[] = params.session.activityEvents
    ? [...params.session.activityEvents]
    : [];
  let nextA2Ui = params.session.a2ui;
  let shouldWriteA2Ui = false;
  const nextDomainProjection = hasDomainProjectionUpdate
    ? mergeDomainProjection(params.session.projectedState, params.result.domainProjectionUpdate)
    : params.session.projectedState;

  for (const artifactOutput of domainOutputs.artifacts ?? []) {
    const artifact = buildDomainArtifact({
      artifact: artifactOutput,
      threadId: params.threadId,
      operationName: params.operation.name,
      now: params.now,
    });
    const artifacts = nextArtifacts ?? {};
    artifacts.current = artifact;
    artifacts.activity = isHiddenPendingInterruptArtifact(artifacts.activity)
      ? artifacts.activity
      : artifact;
    nextArtifacts = artifacts;
    nextActivityEvents.push({
      type: 'artifact',
      artifact,
      append: true,
    });
  }

  let executionStatus = domainOutputs.status?.executionStatus ?? params.session.execution.status;
  let executionStatusMessage = domainOutputs.status?.statusMessage ?? params.session.execution.statusMessage;

  if (domainOutputs.interrupt) {
    const interruptArtifact = buildInterruptArtifact({
      interrupt: domainOutputs.interrupt,
      threadId: params.threadId,
      operationName: params.operation.name,
      now: params.now,
    });
    const mirroredToActivity = domainOutputs.interrupt.mirroredToActivity;
    const artifacts = nextArtifacts ?? {};
    artifacts.current = interruptArtifact;
    if (!mirroredToActivity) {
      artifacts.activity = interruptArtifact;
    }
    nextArtifacts = artifacts;
    if (mirroredToActivity) {
      nextActivityEvents.push({
        type: 'artifact',
        artifact: interruptArtifact,
        append: true,
      });
      nextA2Ui = {
        kind: 'interrupt',
        payload: {
          ...(domainOutputs.interrupt.payload ?? {}),
          type: domainOutputs.interrupt.type,
          artifactId: interruptArtifact.artifactId,
          message: domainOutputs.interrupt.message,
          ...(!domainOutputs.interrupt.payload || !('inputLabel' in domainOutputs.interrupt.payload)
            ? { inputLabel: 'Provide input' }
            : {}),
          ...(!domainOutputs.interrupt.payload || !('submitLabel' in domainOutputs.interrupt.payload)
            ? { submitLabel: 'Continue' }
            : {}),
        },
      };
      nextActivityEvents.push(
        buildPiA2UiActivityEventInternal({
          threadId: params.threadId,
          executionId: params.session.execution.id,
          payload: nextA2Ui,
        }),
      );
    } else {
      nextA2Ui = undefined;
    }
    executionStatus = 'interrupted';
    executionStatusMessage = domainOutputs.interrupt.message;
    shouldWriteA2Ui = true;
  } else if (domainOutputs.status && domainOutputs.status.executionStatus !== 'interrupted') {
    nextA2Ui = undefined;
    shouldWriteA2Ui = true;
  }

  if (
    nextLifecyclePhase === 'prehire' &&
    !domainOutputs.interrupt &&
    (!domainOutputs.artifacts || domainOutputs.artifacts.length === 0) &&
    nextArtifacts?.current
  ) {
    const { current: _current, ...remainingArtifacts } = nextArtifacts;
    nextArtifacts = Object.keys(remainingArtifacts).length > 0 ? remainingArtifacts : undefined;
  }

  return {
    ...params.session,
    execution: {
      ...params.session.execution,
      status: executionStatus,
      ...(executionStatusMessage ? { statusMessage: executionStatusMessage } : {}),
    },
    ...(nextArtifacts ? { artifacts: nextArtifacts } : {}),
    ...(nextActivityEvents.length > 0 ? { activityEvents: nextActivityEvents } : {}),
    ...(shouldWriteA2Ui ? { a2ui: nextA2Ui } : {}),
    ...(hasDomainProjectionUpdate ? { projectedState: nextDomainProjection } : {}),
    ...(lifecycleThreadPatch
      ? {
          threadPatch: mergeThreadPatch(params.session.threadPatch, lifecycleThreadPatch),
        }
      : {}),
  };
}

function resolveInterruptedSessionForUserInput(
  session: PiRuntimeGatewaySession,
): PiRuntimeGatewaySession {
  if (session.execution.status !== 'interrupted') {
    return session;
  }

  const pendingInterruptArtifact = findLatestPendingInterruptArtifact(session);
  const resolvedArtifact = pendingInterruptArtifact
    ? {
        artifactId: pendingInterruptArtifact.artifactId,
        data:
          typeof pendingInterruptArtifact.data === 'object' && pendingInterruptArtifact.data !== null
            ? {
                ...pendingInterruptArtifact.data,
                type: 'interrupt-status',
                status: 'resolved',
              }
            : {
                type: 'interrupt-status',
                status: 'resolved',
              },
      }
    : undefined;
  const shouldSurfaceResolvedArtifact =
    pendingInterruptArtifact !== null &&
    readInterruptMirroredToActivity(pendingInterruptArtifact.data);

  const nextActivityEvents = resolvedArtifact
    ? shouldSurfaceResolvedArtifact
      ? [
          ...(session.activityEvents ?? []),
          {
            type: 'artifact' as const,
            artifact: resolvedArtifact,
            append: true,
          },
        ]
      : session.activityEvents
    : session.activityEvents;

  return {
    ...session,
    execution: {
      ...session.execution,
      status: 'working',
      statusMessage: 'Operator input received. Continuing the Pi loop.',
    },
    artifacts: session.artifacts
      ? {
          ...session.artifacts,
          current: resolvedArtifact,
          activity:
            session.artifacts.activity &&
            isInterruptStatusArtifact(session.artifacts.activity) &&
            session.artifacts.activity.artifactId === pendingInterruptArtifact?.artifactId
              ? resolvedArtifact
              : session.artifacts.activity,
        }
      : undefined,
    ...(nextActivityEvents ? { activityEvents: nextActivityEvents } : {}),
    a2ui: undefined,
  };
}

function repairHydratedPendingInterruptDrift(
  session: PiRuntimeGatewaySession,
): PiRuntimeGatewaySession {
  if (session.execution.status === 'interrupted') {
    return session;
  }

  const pendingInterruptArtifact = findLatestPendingInterruptArtifact(session);
  if (!pendingInterruptArtifact) {
    return session;
  }

  const resolvedArtifact = {
    artifactId: pendingInterruptArtifact.artifactId,
    data:
      typeof pendingInterruptArtifact.data === 'object' && pendingInterruptArtifact.data !== null
        ? {
            ...pendingInterruptArtifact.data,
            type: 'interrupt-status',
            status: 'resolved',
          }
        : {
            type: 'interrupt-status',
            status: 'resolved',
          },
  };

  const nextActivityEvents = readInterruptMirroredToActivity(pendingInterruptArtifact.data)
    ? [
        ...(session.activityEvents ?? []),
        {
          type: 'artifact' as const,
          artifact: resolvedArtifact,
          append: true,
        },
      ]
    : session.activityEvents;
  const currentArtifact = session.artifacts?.current;
  const shouldReplaceCurrentArtifact =
    isInterruptStatusArtifact(currentArtifact) &&
    currentArtifact.artifactId === pendingInterruptArtifact.artifactId &&
    readInterruptStatus(currentArtifact.data) === 'pending';
  const activityArtifact = session.artifacts?.activity;
  const shouldReplaceActivityArtifact =
    isInterruptStatusArtifact(activityArtifact) &&
    activityArtifact.artifactId === pendingInterruptArtifact.artifactId &&
    readInterruptStatus(activityArtifact.data) === 'pending';

  return {
    ...session,
    artifacts: session.artifacts
      ? {
          ...session.artifacts,
          current: shouldReplaceCurrentArtifact ? resolvedArtifact : session.artifacts.current,
          activity: shouldReplaceActivityArtifact ? resolvedArtifact : session.artifacts.activity,
        }
      : session.artifacts,
    ...(nextActivityEvents ? { activityEvents: nextActivityEvents } : {}),
    a2ui: session.a2ui?.kind === 'interrupt' ? undefined : session.a2ui,
  };
}

function createAttachedRunRegistry() {
  const threads = new Map<string, AgentRuntimeAttachedThreadState>();

  const getThreadState = (threadId: string): AgentRuntimeAttachedThreadState => {
    const existing = threads.get(threadId);
    if (existing) {
      return existing;
    }

    const created: AgentRuntimeAttachedThreadState = {
      listeners: new Set(),
      activeRun: null,
    };
    threads.set(threadId, created);
    return created;
  };

  const publishEvents = (threadId: string, events: readonly AgentRuntimeConnectEvent[]): void => {
    if (events.length === 0) {
      return;
    }

    const state = getThreadState(threadId);
    for (const event of events) {
      for (const listener of state.listeners) {
        listener(event);
      }
    }
  };

  return {
    attachToThread(
      threadId: string,
      listener: AgentRuntimeAttachedThreadListener,
    ): {
      detach: () => void;
      activeRunEvents: readonly AgentRuntimeConnectEvent[];
    } {
      const state = getThreadState(threadId);
      state.listeners.add(listener);

      return {
        detach: () => {
          const currentState = getThreadState(threadId);
          currentState.listeners.delete(listener);
          if (currentState.listeners.size === 0 && currentState.activeRun === null) {
            threads.delete(threadId);
          }
        },
        activeRunEvents: state.activeRun ? [...state.activeRun.events] : [],
      };
    },
    startRun(threadId: string, runId: string): void {
      const state = getThreadState(threadId);
      state.activeRun = {
        runId,
        events: [],
      };
    },
    appendRunEvents(
      threadId: string,
      runId: string,
      events: readonly AgentRuntimeConnectEvent[],
    ): void {
      if (events.length === 0) {
        return;
      }

      const state = getThreadState(threadId);
      if (state.activeRun?.runId === runId) {
        state.activeRun = {
          runId,
          events: [...state.activeRun.events, ...events],
        };
      }

      for (const event of events) {
        for (const listener of state.listeners) {
          listener(event);
        }
      }
    },
    finishRun(threadId: string, runId: string): void {
      const state = getThreadState(threadId);
      if (state.activeRun?.runId === runId) {
        state.activeRun = null;
      }

      if (state.listeners.size === 0 && state.activeRun === null) {
        threads.delete(threadId);
      }
    },
    publishEvents,
    async publishEventSource(
      threadId: string,
      source: AgentRuntimeAttachedEventSource,
    ): Promise<void> {
      if (Array.isArray(source)) {
        publishEvents(threadId, source);
        return;
      }

      const events: AgentRuntimeConnectEvent[] = [];
      for await (const event of source) {
        events.push(event);
      }

      publishEvents(threadId, events);
    },
  };
}

function createAttachedEventStream(params: {
  seedEvents: readonly AgentRuntimeConnectEvent[];
  attach: (push: (event: AgentRuntimeConnectEvent) => void) => {
    detach: () => void;
    activeRunEvents: readonly AgentRuntimeConnectEvent[];
  };
}): AsyncIterable<AgentRuntimeConnectEvent> {
  const queue = [...params.seedEvents];
  const readers: Array<{
    resolve: (result: IteratorResult<AgentRuntimeConnectEvent>) => void;
    reject: (error: unknown) => void;
  }> = [];
  let detached = false;

  const flush = (event: AgentRuntimeConnectEvent) => {
    const reader = readers.shift();
    if (reader) {
      reader.resolve({ value: event, done: false });
      return;
    }

    queue.push(event);
  };

  const attachment = params.attach(flush);
  for (const event of attachment.activeRunEvents) {
    flush(event);
  }

  const detach = () => {
    if (detached) {
      return;
    }

    detached = true;
    attachment.detach();
    while (readers.length > 0) {
      readers.shift()?.resolve({ value: undefined, done: true });
    }
  };

  return {
    [Symbol.asyncIterator]() {
      return {
        next() {
          if (queue.length > 0) {
            return Promise.resolve({
              value: queue.shift()!,
              done: false,
            });
          }

          if (detached) {
            return Promise.resolve({ value: undefined, done: true });
          }

          return new Promise<IteratorResult<AgentRuntimeConnectEvent>>((resolve, reject) => {
            readers.push({ resolve, reject });
          });
        },
        return() {
          detach();
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };
}

function cloneAttachedEvents(events: readonly AgentRuntimeConnectEvent[]): AgentRuntimeConnectEvent[] {
  const clonedEvents: AgentRuntimeConnectEvent[] = [];
  for (const event of events) {
    clonedEvents.push(event);
  }

  return clonedEvents;
}

function isAttachedEventArray(
  source: AgentRuntimeAttachedEventSource,
): source is readonly AgentRuntimeConnectEvent[] {
  return Array.isArray(source);
}

function injectAttachedEventsAfterFirstEvent(
  source: AgentRuntimeAttachedEventSource,
  injectedEvents: readonly AgentRuntimeConnectEvent[],
): AgentRuntimeAttachedEventSource {
  if (injectedEvents.length === 0) {
    return source;
  }

  if (isAttachedEventArray(source)) {
    if (source.length === 0) {
      return cloneAttachedEvents(injectedEvents);
    }

    const mergedEvents = cloneAttachedEvents(source);
    mergedEvents.splice(1, 0, ...cloneAttachedEvents(injectedEvents));
    return mergedEvents;
  }

  return {
    async *[Symbol.asyncIterator]() {
      let isFirstEvent = true;
      for await (const event of source) {
        yield event;
        if (isFirstEvent) {
          isFirstEvent = false;
          for (const injectedEvent of injectedEvents) {
            yield injectedEvent;
          }
        }
      }
    },
  };
}

function tapAttachedEventSource(
  source: AgentRuntimeAttachedEventSource,
  onEvents: (events: readonly AgentRuntimeConnectEvent[]) => void,
  onComplete?: () => void,
  onError?: (error: unknown) => Promise<void> | void,
): AgentRuntimeAttachedEventSource {
  if (Array.isArray(source)) {
    onEvents(source);
    onComplete?.();
    return cloneAttachedEvents(source);
  }

  return {
    [Symbol.asyncIterator]() {
      const iterator = (source as AsyncIterable<AgentRuntimeConnectEvent>)[Symbol.asyncIterator]();
      let completed = false;
      const markComplete = () => {
        if (completed) {
          return;
        }

        completed = true;
        onComplete?.();
      };

      return {
        async next() {
          try {
            const result = await iterator.next();
            if (!result.done) {
              onEvents([result.value]);
            } else {
              markComplete();
            }
            return result;
          } catch (error) {
            try {
              await onError?.(error);
            } catch {
              // Preserve the original run-stream failure if checkpoint persistence also fails.
            } finally {
              markComplete();
            }
            throw error;
          }
        },
        async return() {
          markComplete();
          return typeof iterator.return === 'function'
            ? await iterator.return()
            : { value: undefined, done: true };
        },
        async throw(error: unknown) {
          markComplete();
          if (typeof iterator.throw === 'function') {
            return await iterator.throw(error);
          }

          throw error;
        },
      };
    },
  };
}

async function drainAttachedEventSource(source: AgentRuntimeAttachedEventSource): Promise<void> {
  if (Array.isArray(source)) {
    return;
  }

  for await (const _event of source) {
    // Drain the stream so runtime-owned side effects and persistence complete.
  }
}

async function stopAttachedEventSource(
  runtime: PiRuntimeGatewayRuntime,
  request: {
    threadId: string;
    runId: string;
  },
): Promise<void> {
  await drainAttachedEventSource(await runtime.stop(request));
}

function mapSessionExecutionStatusToPersistedStatus(
  status: AgentRuntimeExecutionStatus,
): PersistedExecutionCheckpointStatus {
  switch (status) {
    case 'queued':
      return 'queued';
    case 'working':
      return 'working';
    case 'interrupted':
      return 'interrupted';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'canceled':
      return 'failed';
    case 'auth-required':
      return 'interrupted';
  }
}

export interface CreateAgentRuntimeOptions<TState = unknown> {
  model: AgentRuntimeModel;
  systemPrompt: string;
  tools?: AgentRuntimeTool[];
  databaseUrl?: string;
  agentOptions?: AgentRuntimeAgentOptions;
  domain?: AgentRuntimeDomainConfig<TState>;
  now?: () => number;
}

export interface AgentRuntimeInstance {
  service: AgentRuntimeService;
}

type CreateAgentRuntimeInternalPostgres = {
  ensureReady?: (options?: { env?: { DATABASE_URL?: string } }) => Promise<{
    databaseUrl: string;
  }>;
  loadInspectionState?: (options: { databaseUrl: string }) => Promise<PiRuntimeGatewayInspectionState>;
  executeStatements?: (
    databaseUrl: string,
    statements: Parameters<typeof executePostgresStatements>[1],
  ) => Promise<void>;
  persistDirectExecution?: (
    options: Parameters<typeof persistPiRuntimeDirectExecutionInternal>[0],
  ) => Promise<void>;
};

type CreateAgentRuntimeInternalOptions<TState = unknown> = CreateAgentRuntimeOptions<TState> & {
  __internalPostgres?: CreateAgentRuntimeInternalPostgres;
};

export function createAgentRuntime<TState = unknown>(
  options: CreateAgentRuntimeOptions<TState>,
): Promise<AgentRuntimeInstance>;
export async function createAgentRuntime<TState = unknown>(
  options: CreateAgentRuntimeInternalOptions<TState>,
): Promise<AgentRuntimeInstance> {
  const domain = options.domain;
  const now = options.now ?? (() => Date.now());
  if (domain) {
    validateDomainLifecycle(domain.lifecycle);
  }
  const configuredDatabaseUrl = options.databaseUrl?.trim();
  const postgres = {
    ensureReady: options.__internalPostgres?.ensureReady ?? ensurePiRuntimePostgresReadyInternal,
    loadInspectionState: options.__internalPostgres?.loadInspectionState ?? loadPiRuntimeInspectionStateInternal,
    executeStatements: options.__internalPostgres?.executeStatements ?? executePostgresStatements,
    persistDirectExecution:
      options.__internalPostgres?.persistDirectExecution ?? persistPiRuntimeDirectExecutionInternal,
  };
  const { databaseUrl: resolvedDatabaseUrl } = await postgres.ensureReady(
    configuredDatabaseUrl
      ? {
          env: {
            DATABASE_URL: configuredDatabaseUrl,
          },
        }
      : {},
  );
  const initialLifecyclePhase = domain?.lifecycle.initialPhase;
  const sessionStore = createSessionStore(initialLifecyclePhase);
  const domainStateStore = new Map<string, TState>();
  const reconcileSession = (
    threadId: string,
    session: PiRuntimeGatewaySession,
  ): PiRuntimeGatewaySession =>
    reconcileSharedStateProjection({
      threadId,
      session,
      domain,
      domainState: domainStateStore.get(threadId),
    });
  const getSession = (threadId: string): PiRuntimeGatewaySession => {
    const session = sessionStore.getSession(threadId);
    const reconciled = reconcileSession(threadId, session);
    if (reconciled !== session) {
      sessionStore.setSession(threadId, reconciled);
    }
    return reconciled;
  };
  const setSession = (threadId: string, session: PiRuntimeGatewaySession): PiRuntimeGatewaySession => {
    const reconciled = reconcileSession(threadId, session);
    sessionStore.setSession(threadId, reconciled);
    return reconciled;
  };
  const updateSession = (
    threadId: string,
    update: (session: PiRuntimeGatewaySession) => PiRuntimeGatewaySession,
  ): PiRuntimeGatewaySession => {
    const nextSession = update(getSession(threadId));
    return setSession(threadId, nextSession);
  };
  const automationRegistry = createAutomationRegistry();
  const attachedRuns = createAttachedRunRegistry();
  const executionContext = new AsyncLocalStorage<AgentRuntimeExecutionContext>();
  const scheduledAutomationContexts = new Map<string, AgentRuntimeScheduledAutomationContext>();
  const timedOutScheduledRunThreadIds = new Set<string>();
  const persistedThreads = new Set<string>();
  const getActiveThreadId = (): string | undefined => {
    const context = executionContext.getStore();
    return context?.threadId;
  };
  const getActiveSessionContext = (): PiRuntimeGatewaySession | undefined => {
    const threadId = getActiveThreadId();
    return threadId ? getSession(threadId) : undefined;
  };
  const loadInspectionState = async (): Promise<PiRuntimeGatewayInspectionState> => {
    return await postgres.loadInspectionState({
      databaseUrl: resolvedDatabaseUrl,
    });
  };
  const resolvePersistedExecutionId = (
    threadId: string,
    session: PiRuntimeGatewaySession,
  ): string => {
    const defaultExecutionId = `agent-runtime:${threadId}`;
    if (session.execution.id === defaultExecutionId) {
      return buildPiRuntimeDirectExecutionRecordIdsInternal(threadId).executionId;
    }

    return session.execution.id;
  };
  const readCurrentInterruptState = (
    session: PiRuntimeGatewaySession,
  ):
    | {
        type: string;
        payload: Record<string, unknown>;
        mirroredToActivity: boolean;
      }
    | undefined => {
    if (session.execution.status !== 'interrupted') {
      return undefined;
    }

    if (session.a2ui?.kind === 'interrupt' && isRecord(session.a2ui.payload)) {
      const interruptType =
        typeof session.a2ui.payload.type === 'string' ? session.a2ui.payload.type : null;
      if (interruptType) {
        return {
          type: interruptType,
          payload: session.a2ui.payload,
          mirroredToActivity: true,
        };
      }
    }

    const pendingInterruptArtifact = findLatestPendingInterruptArtifact(session);
    const interruptType = readInterruptType(pendingInterruptArtifact?.data);
    if (!pendingInterruptArtifact || !interruptType) {
      return undefined;
    }

    return {
      type: interruptType,
      payload: readInterruptPayload(pendingInterruptArtifact.data) ?? {},
      mirroredToActivity: readInterruptMirroredToActivity(pendingInterruptArtifact.data),
    };
  };
  const persistSessionSnapshot = async (
    threadId: string,
    session: PiRuntimeGatewaySession = getSession(threadId),
  ): Promise<void> => {
    const scheduledAutomationContext = scheduledAutomationContexts.get(threadId);
    const ids = scheduledAutomationContext
      ? { threadId: scheduledAutomationContext.rootThreadRecordId }
      : buildPiRuntimeDirectExecutionRecordIdsInternal(threadId);
    const persistedExecutionId = resolvePersistedExecutionId(threadId, session);
    const currentInterrupt = readCurrentInterruptState(session);
    const currentInterruptId = currentInterrupt
      ? buildPiRuntimeStableUuid('interrupt', `agent-runtime:execution:${persistedExecutionId}:interrupt`)
      : null;
    const executionSource = session.automation?.runId ? 'automation' : 'user';
    const currentNow = new Date(now());
    if (scheduledAutomationContext) {
      if (timedOutScheduledRunThreadIds.has(threadId)) {
        return;
      }

      await postgres.executeStatements(
        resolvedDatabaseUrl,
        [
          ...buildPersistExecutionCheckpointStatements({
            executionId: persistedExecutionId,
            threadId: ids.threadId,
            automationRunId: session.automation?.runId ?? null,
            status: mapSessionExecutionStatusToPersistedStatus(session.execution.status),
            source: 'automation',
            currentInterruptId,
            interruptType: currentInterrupt?.type,
            interruptPayload: currentInterrupt?.payload,
            mirroredToActivity: currentInterrupt?.mirroredToActivity,
            now: currentNow,
          }),
          ...buildPersistScheduledAutomationRunSnapshotStatements({
            artifactId: buildPiRuntimeStableUuid(
              'artifact',
              `agent-runtime:${scheduledAutomationContext.automationId}:run:${session.automation?.runId ?? threadId}:snapshot`,
            ),
            eventId: randomUUID(),
            threadId: ids.threadId,
            executionId: persistedExecutionId,
            automationRunId: session.automation?.runId ?? threadId,
            runThreadKey: threadId,
            rootThreadId: scheduledAutomationContext.rootThreadId,
            rootThreadRecordId: scheduledAutomationContext.rootThreadRecordId,
            sessionSnapshot: buildScheduledAutomationRunSnapshot(session),
            now: currentNow,
          }),
        ],
      );
      return;
    }

    const threadState = buildPersistedThreadStateSnapshot({
      session,
      state: domainStateStore.get(threadId),
    });
    await postgres.executeStatements(
      resolvedDatabaseUrl,
      [
        ...buildPersistThreadStateStatements({
          threadId: ids.threadId,
          threadKey: threadId,
          threadState,
          now: currentNow,
        }),
        ...buildPersistExecutionCheckpointStatements({
          executionId: persistedExecutionId,
          threadId: ids.threadId,
          automationRunId: session.automation?.runId ?? null,
          status: mapSessionExecutionStatusToPersistedStatus(session.execution.status),
          source: executionSource,
          currentInterruptId,
          interruptType: currentInterrupt?.type,
          interruptPayload: currentInterrupt?.payload,
          mirroredToActivity: currentInterrupt?.mirroredToActivity,
          now: currentNow,
        }),
      ],
    );
  };
  const isPersistedExecutionCheckpointOutOfSync = (params: {
    threadId: string;
    session: PiRuntimeGatewaySession;
    inspectionState: PiRuntimeGatewayInspectionState;
  }): boolean => {
    const persistedExecutionId = resolvePersistedExecutionId(params.threadId, params.session);
    const expectedStatus = mapSessionExecutionStatusToPersistedStatus(params.session.execution.status);
    const expectedSource = params.session.automation?.runId ? 'automation' : 'user';
    const expectedInterrupt = readCurrentInterruptState(params.session);
    const expectedCurrentInterruptId = expectedInterrupt
      ? buildPiRuntimeStableUuid(
          'interrupt',
          `agent-runtime:execution:${persistedExecutionId}:interrupt`,
        )
      : null;
    const execution = params.inspectionState.executions.find(
      (candidate) => candidate.executionId === persistedExecutionId,
    );

    if (!execution) {
      return true;
    }

    const expectedCompleted = expectedStatus === 'completed' || expectedStatus === 'failed';
    if (
      execution.status !== expectedStatus ||
      execution.source !== expectedSource ||
      execution.currentInterruptId !== expectedCurrentInterruptId ||
      (expectedCompleted ? execution.completedAt === null : execution.completedAt !== null)
    ) {
      return true;
    }

    const executionInterrupts = params.inspectionState.interrupts.filter(
      (candidate) => candidate.executionId === persistedExecutionId,
    );
    const pendingInterrupts = executionInterrupts.filter(
      (candidate) => candidate.status === 'pending',
    );

    if (expectedCurrentInterruptId === null) {
      return pendingInterrupts.length > 0;
    }

    const currentInterrupt = executionInterrupts.find(
      (candidate) => candidate.interruptId === expectedCurrentInterruptId,
    );
    if (!currentInterrupt) {
      return true;
    }

    return (
      currentInterrupt.status !== 'pending' ||
      currentInterrupt.mirroredToActivity !== expectedInterrupt?.mirroredToActivity ||
      pendingInterrupts.some((candidate) => candidate.interruptId !== expectedCurrentInterruptId)
    );
  };
  const hydrateThreadSession = async (threadId: string): Promise<PiRuntimeGatewaySession> => {
    if (sessionStore.hasSession(threadId)) {
      return getSession(threadId);
    }

    const inspectionState = await loadInspectionState();
    const persistedThread = inspectionState.threads.find((candidate) => candidate.threadKey === threadId);
    if (persistedThread) {
      persistedThreads.add(threadId);
      const persistedSession = readPersistedSession(threadId, persistedThread.threadState);
      if (persistedSession) {
        const persistedDomainState = readPersistedDomainState<TState>(persistedThread.threadState);
        const recoveredLifecycleState =
          persistedDomainState === undefined
            ? readPersistedLifecycleDomainState<TState>(persistedThread.threadState)
            : undefined;
        const sessionWithPersistedActivity = appendPersistedAutomationSnapshotActivityEvents({
          session: persistedSession,
          inspectionState,
          threadId: persistedThread.threadId,
        });
        const normalizedSession = materializeSessionLifecycle(sessionWithPersistedActivity, initialLifecyclePhase);
        const repairedSession = repairHydratedPendingInterruptDrift(normalizedSession);
        const hydratedSession = setSession(threadId, repairedSession);
        if (persistedDomainState !== undefined) {
          domainStateStore.set(threadId, persistedDomainState);
        } else if (recoveredLifecycleState !== undefined) {
          domainStateStore.set(threadId, recoveredLifecycleState);
        }
        if (
          repairedSession !== persistedSession ||
          (persistedDomainState === undefined && recoveredLifecycleState !== undefined) ||
          isPersistedExecutionCheckpointOutOfSync({
            threadId,
            session: hydratedSession,
            inspectionState,
          })
        ) {
          await persistSessionSnapshot(threadId, hydratedSession);
        }
        return hydratedSession;
      }
    }

    return getSession(threadId);
  };
  const ensureThread = async (threadId: string): Promise<PiRuntimeGatewaySession> => {
    const session = await hydrateThreadSession(threadId);
    if (persistedThreads.has(threadId)) {
      return session;
    }

    const ids = buildPiRuntimeDirectExecutionRecordIdsInternal(threadId);
    const threadState = buildPersistedThreadStateSnapshot({
      session,
      state: domainStateStore.get(threadId),
    });
    await postgres.persistDirectExecution({
      databaseUrl: resolvedDatabaseUrl,
      threadId: ids.threadId,
      threadKey: threadId,
      threadState,
      executionId: ids.executionId,
      artifactId: ids.artifactId,
      activityId: randomUUID(),
      now: new Date(now()),
    });
    persistedThreads.add(threadId);
    return session;
  };
  const publishSessionUpdate = async (params: {
    threadId: string;
    previousSession: PiRuntimeGatewaySession;
    nextSession: PiRuntimeGatewaySession;
    runId?: string;
  }): Promise<void> => {
    const runId = params.runId ?? `update:${params.threadId}:${now()}`;
    const stateDeltaEvent = buildPiRuntimeGatewayStateDeltaEventInternal({
      previousSession: params.previousSession,
      session: params.nextSession,
    });
    const events: BaseEvent[] = [
      {
        type: EventType.RUN_STARTED,
        threadId: params.threadId,
        runId,
      },
      ...(stateDeltaEvent ? [stateDeltaEvent] : []),
      {
        type: EventType.RUN_FINISHED,
        threadId: params.threadId,
        runId,
        result: {
          executionId: params.nextSession.execution.id,
          status: params.nextSession.execution.status,
        },
      },
    ];
    await attachedRuns.publishEventSource(
      params.threadId,
      events,
    );
  };
  const transformContext: AgentRuntimeTransformContext | undefined =
    options.agentOptions?.transformContext
      ? async (messages, signal) => await options.agentOptions!.transformContext!(messages, signal)
      : undefined;
  const streamFn: AgentRuntimeStreamFn | undefined =
    options.agentOptions?.streamFn || domain
      ? async (model, context, streamOptions) => {
          const threadId = getActiveThreadId();
          const session = threadId ? getSession(threadId) : null;
          const lines = threadId && domain
            ? [
                ...normalizeDomainSystemContextLines(
                  await domain.systemContext?.({
                    threadId,
                    state: domainStateStore.get(threadId),
                    currentProjection: session && isRecord(session.projectedState)
                      ? session.projectedState
                      : undefined,
                  }),
                ),
              ]
            : [];
          if (threadId) {
            lines.push(
              ...buildScheduledAutomationSystemContextLines(
                scheduledAutomationContexts.get(threadId),
              ),
            );
          }
          const nextContext = lines.length
            ? {
                ...context,
                systemPrompt: appendDomainSystemPromptContext(context.systemPrompt, lines),
              }
            : context;

          logSystemPromptDebug({
            threadId,
            systemPrompt: nextContext.systemPrompt,
          });

          return await (options.agentOptions?.streamFn ?? streamSimple)(
            model,
            nextContext,
            streamOptions,
          );
        }
      : undefined;

  const runDomainOperation = async (
    threadId: string,
    operation: AgentRuntimeDomainOperation,
  ): Promise<PiRuntimeGatewaySession> => {
    if (!domain?.handleOperation) {
      return getSession(threadId);
    }

    const result = await domain.handleOperation({
      operation,
      threadId,
      state: domainStateStore.get(threadId),
    });
    if ('state' in result) {
      if (result.state === undefined) {
        domainStateStore.delete(threadId);
      } else {
        domainStateStore.set(threadId, result.state);
      }
    }

    const nextSession = updateSession(threadId, (currentSession) =>
      applyDomainOperationResult({
        threadId,
        now,
        operation,
        session: currentSession,
        lifecycle: domain.lifecycle,
        result,
      }),
    );
    await persistSessionSnapshot(threadId, nextSession);
    return nextSession;
  };

  const resumeInterruptedSession = async (threadId: string): Promise<PiRuntimeGatewaySession> => {
    const nextSession = updateSession(threadId, resolveInterruptedSessionForUserInput);
    await persistSessionSnapshot(threadId, nextSession);
    return nextSession;
  };

  const persistFailedRun = async (
    threadId: string,
    error: unknown,
  ): Promise<PiRuntimeGatewaySession> => {
    const detail = error instanceof Error ? error.message : String(error);
    const nextSession = updateSession(threadId, (session) => ({
      ...session,
      execution: {
        ...session.execution,
        status: 'failed',
        statusMessage: detail,
      },
      a2ui: undefined,
    }));
    await persistSessionSnapshot(threadId, nextSession);
    return nextSession;
  };

  const readCurrentThreadId = (): string => {
    const threadId = executionContext.getStore()?.threadId;
    if (!threadId) {
      throw new Error('Runtime-owned tools require an active thread execution context.');
    }

    return threadId;
  };

  const resolveCurrentPersistenceContext = (threadId: string): {
    threadRecordId: string;
    executionId: string;
    automationRunId: string | null;
  } => {
    const scheduledAutomationContext = scheduledAutomationContexts.get(threadId);
    if (scheduledAutomationContext) {
      const session = getSession(threadId);
      return {
        threadRecordId: scheduledAutomationContext.rootThreadRecordId,
        executionId: session.execution.id,
        automationRunId: session.automation?.runId ?? null,
      };
    }

    const directExecutionIds = buildPiRuntimeDirectExecutionRecordIdsInternal(threadId);
    return {
      threadRecordId: directExecutionIds.threadId,
      executionId: directExecutionIds.executionId,
      automationRunId: null,
    };
  };

  const runtimeTools: AgentRuntimeTool[] = [
    {
      name: AGENT_RUNTIME_AUTOMATION_SCHEDULE_TOOL,
      label: 'Automation Schedule',
      description:
        'Create a new saved automation for the active thread and surface its current status via runtime artifacts and A2UI.',
      parameters: Type.Object({
        title: Type.String(),
        instruction: Type.String(),
        schedule: Type.Object({
          kind: Type.String(),
          intervalMinutes: Type.Number({ minimum: 1, default: 5 }),
        }),
      }) as AgentRuntimeTool['parameters'],
      execute: async (_toolCallId, args) => {
        const toolArgs = args as {
          title: string;
          instruction: string;
          schedule: Record<string, unknown>;
        };
        const threadId = readCurrentThreadId();
        const schedule = coerceSchedule(toolArgs.schedule, { kind: 'every', intervalMinutes: 5 });
        const command = inferAutomationCommand({
          instruction: toolArgs.instruction,
          title: toolArgs.title,
        });
        const minutes = getScheduleMinutes(schedule);
        const currentNow = new Date(now());
        const nextRunAt = new Date(currentNow.getTime() + minutes * 60 * 1000).toISOString();
        const automationId = randomUUID();
        const runId = randomUUID();
        const executionId = randomUUID();
        const artifactId = buildPiRuntimeStableUuid('artifact', `agent-runtime:${threadId}:automation-artifact`);

        const persistenceContext = resolveCurrentPersistenceContext(threadId);
        await postgres.executeStatements(
          resolvedDatabaseUrl,
          buildPersistAutomationDispatchStatements({
            automationId,
            runId,
            executionId,
            threadId: persistenceContext.threadRecordId,
            commandName: toolArgs.title,
            schedulePayload: {
              title: toolArgs.title,
              instruction: toolArgs.instruction,
              schedule,
              command,
              minutes,
            },
            activityId: randomUUID(),
            leaseOwnerId: buildPiRuntimeStableUuid('lease-owner', `agent-runtime:${threadId}:lease-owner`),
            now: currentNow,
            nextRunAt: new Date(nextRunAt),
            leaseExpiresAt: new Date(currentNow.getTime() + 60 * 1000),
          }),
        );

        const title = buildAutomationTitle({
          command,
          schedule,
        });
        automationRegistry.upsert({
          automationId,
          threadId,
          title,
          instruction: toolArgs.instruction,
          command,
          schedule,
          runId,
          executionId,
          artifactId,
          nextRunAt,
          status: 'active',
          lastRunAt: null,
          lastRunStatus: null,
        });
        const detail = describeScheduledAutomation({
          command,
          schedule,
        });
        const session = applyAutomationStatusUpdate({
          sessionStore,
          threadId,
          artifactId,
          automationId,
          executionId,
          activityRunId: runId,
          status: 'scheduled',
          command,
          minutes,
          detail,
        });
        await persistSessionSnapshot(threadId, session);

        return {
          content: [{ type: 'text' as const, text: detail }],
          details: {
            automation: {
              id: automationId,
              title,
              status: 'active' as const,
              schedule,
              nextRunAt,
            },
          },
        };
      },
    },
    {
      name: AGENT_RUNTIME_AUTOMATION_LIST_TOOL,
      label: 'Automation List',
      description: 'List saved automations visible to the active thread.',
      parameters: Type.Object({
        state: Type.String({ default: 'active' }),
        limit: Type.Number({ minimum: 1, default: 20 }),
      }) as AgentRuntimeTool['parameters'],
      execute: async (_toolCallId, args) => {
        const toolArgs = args as {
          state?: 'active' | 'completed' | 'canceled' | 'all';
          limit?: number;
        };
        const threadId = readCurrentThreadId();
        const limit = Math.max(1, Math.min(toolArgs.limit ?? 20, 50));
        const inspectionState = await loadInspectionState();
        const latestRunByAutomation = new Map<
          string,
          {
            status: string;
            completedAt: Date | null;
            scheduledAt: Date;
            startedAt: Date | null;
          }
        >();
        for (const run of inspectionState.automationRuns) {
          if (run.status === 'scheduled') {
            continue;
          }

          const existing = latestRunByAutomation.get(run.automationId);
          const runTime = run.completedAt ?? run.startedAt ?? run.scheduledAt;
          const existingTime = existing
            ? existing.completedAt ?? existing.startedAt ?? existing.scheduledAt
            : null;
          if (!existing || runTime.getTime() > existingTime!.getTime()) {
            latestRunByAutomation.set(run.automationId, {
              status: run.status,
              completedAt: run.completedAt,
              scheduledAt: run.scheduledAt,
              startedAt: run.startedAt,
            });
          }
        }
        const threadRecordId = resolveCurrentPersistenceContext(threadId).threadRecordId;
        const persistedAutomations = inspectionState.automations
          .filter((automation) => automation.threadId === threadRecordId)
          .map((automation) => {
            const latestRun = latestRunByAutomation.get(automation.automationId);
            return {
              id: automation.automationId,
              title:
                typeof automation.schedulePayload.title === 'string'
                  ? automation.schedulePayload.title
                  : automation.commandName,
              status: automation.suspended ? 'canceled' : automation.nextRunAt === null ? 'completed' : 'active',
              schedule: coerceSchedule(automation.schedulePayload.schedule, {
                kind: 'every',
                intervalMinutes: automation.schedulePayload.minutes ?? 5,
              }),
              nextRunAt: automation.nextRunAt?.toISOString() ?? null,
              lastRunAt: (latestRun?.completedAt ?? latestRun?.startedAt ?? latestRun?.scheduledAt)?.toISOString() ?? null,
              lastRunStatus: latestRun?.status ?? null,
            };
          });
        const automations = (persistedAutomations.length > 0
          ? persistedAutomations
          : automationRegistry.getByThread(threadId).map((record) => ({
              id: record.automationId,
              title: record.title,
              status: record.status,
              schedule: record.schedule,
              nextRunAt: record.nextRunAt,
              lastRunAt: record.lastRunAt,
              lastRunStatus: record.lastRunStatus,
            })))
          .filter((automation) => {
            const state = toolArgs.state ?? 'active';
            return state === 'all' ? true : automation.status === state;
          })
          .slice(0, limit);
        const detail =
          automations.length === 0
            ? 'No saved automations.'
            : `Found ${automations.length} automation${automations.length === 1 ? '' : 's'}: ${automations
                .map((automation) => `${automation.title} (${automation.status})`)
                .join(', ')}.`;

        return {
          content: [{ type: 'text' as const, text: detail }],
          details: {
            automations,
          },
        };
      },
    },
    {
      name: AGENT_RUNTIME_AUTOMATION_CANCEL_TOOL,
      label: 'Automation Cancel',
      description: 'Cancel a saved automation so it does not fire again and surface the canceled state in the thread.',
      parameters: Type.Object({
        automationId: Type.String(),
      }) as AgentRuntimeTool['parameters'],
      execute: async (_toolCallId, args) => {
        const toolArgs = args as {
          automationId: string;
        };
        const threadId = readCurrentThreadId();
        const currentRecordCandidate = automationRegistry.getById(toolArgs.automationId);
        const currentRecord =
          currentRecordCandidate?.threadId === threadId ? currentRecordCandidate : undefined;

        const inspectionState = await loadInspectionState();
        const threadRecordId = resolveCurrentPersistenceContext(threadId).threadRecordId;
        const persistedAutomation = inspectionState.automations.find(
          (automation) =>
            automation.automationId === toolArgs.automationId &&
            automation.threadId === threadRecordId,
        );
        const currentRun = [...inspectionState.automationRuns]
          .filter(
            (run) =>
              run.automationId === toolArgs.automationId &&
              run.threadId === threadRecordId &&
              (run.status === 'running' || run.status === 'started' || run.status === 'scheduled'),
          )
          .sort((left, right) => {
            const leftRank = left.status === 'running' || left.status === 'started' ? 1 : 0;
            const rightRank = right.status === 'running' || right.status === 'started' ? 1 : 0;
            return rightRank - leftRank || right.scheduledAt.getTime() - left.scheduledAt.getTime();
          })[0];
        if (persistedAutomation) {
          await postgres.executeStatements(
            resolvedDatabaseUrl,
            buildCancelAutomationStatements({
              automationId: toolArgs.automationId,
              currentRunId: currentRun?.runId ?? null,
              currentExecutionId: currentRun?.executionId ?? null,
              threadId: threadRecordId,
              eventId: randomUUID(),
              activityId: randomUUID(),
              now: new Date(now()),
            }),
          );
        }
        if (
          currentRun?.executionId &&
          (currentRun.status === 'running' || currentRun.status === 'started')
        ) {
          await stopAttachedEventSource(runtimeWithDomain, {
            threadId: `automation:${toolArgs.automationId}:run:${currentRun.runId}`,
            runId: currentRun.runId,
          });
        }

        const record = currentRecord ?? (persistedAutomation
          ? automationRegistry.upsert({
              automationId: persistedAutomation.automationId,
              threadId,
              title:
                typeof persistedAutomation.schedulePayload.title === 'string'
                  ? persistedAutomation.schedulePayload.title
                  : persistedAutomation.commandName,
              instruction:
                typeof persistedAutomation.schedulePayload.instruction === 'string'
                  ? persistedAutomation.schedulePayload.instruction
                  : persistedAutomation.commandName,
              command: persistedAutomation.commandName,
              schedule: coerceSchedule(persistedAutomation.schedulePayload.schedule, {
                kind: 'every',
                intervalMinutes: persistedAutomation.schedulePayload.minutes ?? 5,
              }),
              runId: currentRun?.runId ?? `run:${threadId}`,
              executionId: currentRun?.executionId ?? getSession(threadId).execution.id,
              artifactId:
                getSession(threadId).artifacts?.current?.artifactId ??
                `artifact:${threadId}:automation`,
              nextRunAt: persistedAutomation.nextRunAt?.toISOString() ?? null,
              status: persistedAutomation.suspended ? 'canceled' : 'active',
              lastRunAt: currentRun?.completedAt?.toISOString() ?? null,
              lastRunStatus: currentRun?.status ?? null,
            })
          : undefined);
        if (!record) {
          return {
            content: [{ type: 'text' as const, text: 'No saved automation found for the active thread.' }],
            details: {
              automation: null,
            },
          };
        }
        const minutes = getScheduleMinutes(record.schedule);
        const title = record.title;
        const detail = describeCanceledAutomation(title);
        automationRegistry.upsert({
          ...record,
          status: 'canceled',
          nextRunAt: null,
          lastRunStatus: 'canceled',
          lastRunAt: new Date(now()).toISOString(),
        });
        const session = applyAutomationStatusUpdate({
          sessionStore,
          threadId,
          artifactId: record.artifactId,
          automationId: record.automationId,
          executionId: record.executionId,
          activityRunId: record.runId,
          status: 'canceled',
          command: record.command,
          minutes,
          detail,
        });
        await persistSessionSnapshot(threadId, session);

        return {
          content: [{ type: 'text' as const, text: detail }],
          details: {
            automation: {
              id: record.automationId,
              title,
              status: 'canceled' as const,
            },
          },
        };
      },
    },
    {
      name: AGENT_RUNTIME_REQUEST_OPERATOR_INPUT_TOOL,
      label: 'Request Operator Input',
      description: 'Pause the active thread for operator input and surface a runtime-owned A2UI form.',
      parameters: Type.Object({
        message: Type.String({
          default: 'Please provide a short operator note to continue.',
        }),
      }) as AgentRuntimeTool['parameters'],
      execute: async (_toolCallId, args) => {
        const toolArgs = args as {
          message: string;
        };
        const threadId = readCurrentThreadId();
        const artifactId =
          buildPiRuntimeStableUuid('artifact', `agent-runtime:${threadId}:interrupt-artifact`);

        const persistenceContext = resolveCurrentPersistenceContext(threadId);
        await postgres.executeStatements(
          resolvedDatabaseUrl,
          buildPersistInterruptCheckpointStatements({
            executionId: persistenceContext.executionId,
            interruptId: buildPiRuntimeStableUuid(
              'interrupt',
              `agent-runtime:execution:${persistenceContext.executionId}:interrupt`,
            ),
            artifactId,
            activityId: buildPiRuntimeStableUuid('activity', `agent-runtime:${threadId}:interrupt-activity`),
            threadId: persistenceContext.threadRecordId,
            now: new Date(now()),
          }),
        );

        const session = applyOperatorInputRequest({
          sessionStore,
          threadId,
          artifactId,
          message: toolArgs.message,
        });
        await persistSessionSnapshot(threadId, session);

        return {
          content: [{ type: 'text' as const, text: toolArgs.message }],
          details: {
            status: 'interrupted',
            artifactId,
          },
        };
      },
    },
  ];

  const domainCommandTool: AgentRuntimeTool | null =
    domain?.handleOperation && domain.lifecycle.commands.length > 0
      ? {
          name: AGENT_RUNTIME_DOMAIN_COMMAND_TOOL,
          label: 'Agent Runtime Domain Command',
          description: buildDomainCommandToolDescription(domain.lifecycle),
          parameters: Type.Object({
            name: buildDomainCommandNameSchema(domain.lifecycle),
            inputJson: Type.String({
              description:
                'JSON object string for the selected command payload. Include all fields required by the command description.',
              default: '{}',
            }),
          }) as AgentRuntimeTool['parameters'],
          execute: async (_toolCallId, args) => {
            const toolArgs = parseDomainCommandToolArgs(args);
            if (!toolArgs) {
              throw new Error('Domain command tool requires a command name.');
            }

            const sessionContext = getActiveSessionContext();
            if (!sessionContext) {
              throw new Error('Domain command tool requires an active session context.');
            }

            const operation: AgentRuntimeDomainOperation = {
              source: 'tool',
              name: toolArgs.name.trim(),
              input: parseDomainCommandToolInput(toolArgs.inputJson),
            };
            const session = await runDomainOperation(sessionContext.thread.id, operation);

            return {
              content: [
                {
                  type: 'text' as const,
                  text:
                    session.execution.statusMessage ??
                    `Executed domain command ${operation.name}.`,
                },
              ],
              details: {
                operation: {
                  name: operation.name,
                },
              },
            };
          },
        }
      : null;

  const foundation = createPiRuntimeGatewayFoundationInternal({
    model: options.model,
    systemPrompt: options.systemPrompt,
    tools: [
      ...(options.tools ?? []),
      ...runtimeTools,
      ...(domainCommandTool ? [domainCommandTool] : []),
    ],
    databaseUrl: resolvedDatabaseUrl,
    agentOptions: {
      ...options.agentOptions,
      ...(streamFn ? { streamFn } : {}),
      ...(transformContext ? { transformContext } : {}),
    },
    getSessionContext: getActiveSessionContext,
    now,
  });

  const runtime = createPiRuntimeGatewayRuntimeInternal({
    agent: foundation.agent,
    getSession,
    updateSession,
    onSessionUpdated: persistSessionSnapshot,
    now,
  });

  const runtimeWithDomain: PiRuntimeGatewayRuntime = {
    ...runtime,
    run: async (request) => {
      const session = getSession(request.threadId);
      const operation =
        readDirectCommandOperation(request.forwardedProps?.command) ??
        readInterruptOperation({
          command: request.forwardedProps?.command,
          session,
          domain,
        });
      if (!operation || !domain?.handleOperation) {
        return await executionContext.run(
          {
            threadId: request.threadId,
          },
          async () => await runtime.run(request),
        );
      }

      const nextSession = await runDomainOperation(request.threadId, operation);
      const stateRebaselineEvent = buildPiRuntimeGatewayStateRebaselineEventInternal({
        previousSession: session,
        session: nextSession,
      });

      const events: BaseEvent[] = [
        {
          type: EventType.RUN_STARTED,
          threadId: request.threadId,
          runId: request.runId,
        },
        ...(stateRebaselineEvent ? [stateRebaselineEvent] : []),
        {
          type: EventType.RUN_FINISHED,
          threadId: request.threadId,
          runId: request.runId,
          result: {
            executionId: nextSession.execution.id,
            status: nextSession.execution.status,
          },
        },
      ];
      return events;
    },
  };

  const runtimeWithAttachedSessions: PiRuntimeGatewayRuntime = {
    ...runtimeWithDomain,
    connect: async (request) => {
      const session = await ensureThread(request.threadId);

      return createAttachedEventStream({
        seedEvents: buildPiRuntimeGatewayConnectEventsInternal({
          threadId: request.threadId,
          runId: request.runId ?? `connect:${request.threadId}`,
          session,
        }),
        attach: (push) => attachedRuns.attachToThread(request.threadId, push),
      });
    },
    run: async (request) => {
      const session = await ensureThread(request.threadId);
      let leadingEvents: AgentRuntimeConnectEvent[] = [];
      const resumeOperation =
        Object.prototype.hasOwnProperty.call(request.forwardedProps?.command ?? {}, 'resume') &&
        domain?.handleOperation
          ? readInterruptOperation({
              command: request.forwardedProps?.command,
              session,
              domain,
            })
          : null;

      const hasResume = Object.prototype.hasOwnProperty.call(
        request.forwardedProps?.command ?? {},
        'resume',
      );
      if (hasResume) {
        const resumedSession = await resumeInterruptedSession(request.threadId);
        const stateRebaselineEvent = buildPiRuntimeGatewayStateRebaselineEventInternal({
          previousSession: session,
          session: resumedSession,
        });
        if (stateRebaselineEvent) {
          leadingEvents = [stateRebaselineEvent];
        }
      }

      attachedRuns.startRun(request.threadId, request.runId);

      if (resumeOperation && domain?.handleOperation) {
        const previousSession = getSession(request.threadId);
        const nextSession = await runDomainOperation(request.threadId, resumeOperation);
        const stateRebaselineEvent = buildPiRuntimeGatewayStateRebaselineEventInternal({
          previousSession,
          session: nextSession,
        });

        return tapAttachedEventSource(
          injectAttachedEventsAfterFirstEvent(
            [
              {
                type: EventType.RUN_STARTED,
                threadId: request.threadId,
                runId: request.runId,
              },
              ...(stateRebaselineEvent ? [stateRebaselineEvent] : []),
              {
                type: EventType.RUN_FINISHED,
                threadId: request.threadId,
                runId: request.runId,
                result: {
                  executionId: nextSession.execution.id,
                  status: nextSession.execution.status,
                },
              },
            ],
            leadingEvents,
          ),
          (events) => attachedRuns.appendRunEvents(request.threadId, request.runId, events),
          () => attachedRuns.finishRun(request.threadId, request.runId),
          async (error) => {
            await persistFailedRun(request.threadId, error);
          },
        );
      }

      return tapAttachedEventSource(
        injectAttachedEventsAfterFirstEvent(
          await runtimeWithDomain.run(request),
          leadingEvents,
        ),
        (events) => attachedRuns.appendRunEvents(request.threadId, request.runId, events),
        () => attachedRuns.finishRun(request.threadId, request.runId),
        async (error) => {
          await persistFailedRun(request.threadId, error);
        },
      );
    },
    stop: async (request) =>
      tapAttachedEventSource(
        await runtimeWithDomain.stop(request),
        (events) => {
          attachedRuns.publishEvents(request.threadId, events);
        },
        () => attachedRuns.finishRun(request.threadId, request.runId),
      ),
  };

  const controlPlane = createCanonicalPiRuntimeGatewayControlPlaneInternal({
    loadInspectionState,
  });

  let tickInFlight = false;
  const automationTicksInFlight = new Set<string>();
  const runAutomationTick = async () => {
    if (tickInFlight) {
      return;
    }

    tickInFlight = true;
    try {
      const inspectionState = await loadInspectionState();
      const dueAutomationIds = recoverDueAutomations({
        now: new Date(now()),
        automations: inspectionState.automations.map((automation) => ({
          automationId: automation.automationId,
          nextRunAt: automation.nextRunAt,
          suspended: automation.suspended,
        })),
        leases: inspectionState.leases,
      });
      const threadById = new Map(inspectionState.threads.map((thread) => [thread.threadId, thread]));

      const runDueAutomation = async (automationId: string): Promise<void> => {
        const automation = inspectionState.automations.find((candidate) => candidate.automationId === automationId);
        if (!automation) {
          return;
        }

        const thread = threadById.get(automation.threadId);
        const minutes = readPositiveFiniteNumber(automation.schedulePayload.minutes);
        if (!thread || minutes === null) {
          return;
        }

        const currentNow = new Date(now());
        const nextRunAt = new Date(currentNow.getTime() + minutes * 60 * 1000);
        const activeRun = [...inspectionState.automationRuns]
          .filter(
            (run) =>
              run.automationId === automationId &&
              run.executionId !== null &&
              (run.status === 'running' || run.status === 'started'),
          )
          .sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime())[0];
        if (activeRun?.executionId) {
          const timeoutMinutes = readPositiveFiniteNumber(automation.schedulePayload.timeoutMinutes) ?? 15;
          const activeStartedAt = activeRun.startedAt ?? activeRun.scheduledAt;
          const timedOut = currentNow.getTime() - activeStartedAt.getTime() >= timeoutMinutes * 60 * 1000;
          if (!timedOut) {
            return;
          }

          const timeoutDetail = `Exceeded the ${timeoutMinutes} minute scheduled automation timeout.`;
          const previousSession = await hydrateThreadSession(thread.threadKey);
          try {
            await postgres.executeStatements(
              resolvedDatabaseUrl,
              buildTimeoutAutomationExecutionStatements({
                automationId,
                currentRunId: activeRun.runId,
                currentExecutionId: activeRun.executionId,
                nextRunId: buildPiRuntimeStableUuid(
                  'automation-run',
                  `agent-runtime:${automationId}:run:${currentNow.toISOString()}`,
                ),
                nextExecutionId: buildPiRuntimeStableUuid(
                  'execution',
                  `agent-runtime:${automationId}:execution:${currentNow.toISOString()}`,
                ),
                threadId: automation.threadId,
                commandName: automation.commandName,
                schedulePayload: automation.schedulePayload,
                eventId: buildPiRuntimeStableUuid(
                  'execution-event',
                  `agent-runtime:${automationId}:timeout:${currentNow.toISOString()}`,
                ),
                activityId: buildPiRuntimeStableUuid(
                  'activity',
                  `agent-runtime:${automationId}:timeout:${currentNow.toISOString()}`,
                ),
                now: currentNow,
                nextRunAt,
                leaseExpiresAt: currentNow,
                timeoutDetail,
              }),
            );
          } catch (error) {
            if (isPostgresAffectedRowsError(error)) {
              return;
            }
            throw error;
          }

          const timeoutSession = applyAutomationStatusUpdate({
            sessionStore,
            threadId: thread.threadKey,
            artifactId: buildPiRuntimeStableUuid(
              'artifact',
              `agent-runtime:${thread.threadKey}:automation-artifact`,
            ),
            automationId,
            executionId: activeRun.executionId,
            activityRunId: activeRun.runId,
            status: 'timed_out',
            command: automation.commandName,
            minutes,
            detail: timeoutDetail,
          });
          await persistSessionSnapshot(thread.threadKey, timeoutSession);
          await publishSessionUpdate({
            threadId: thread.threadKey,
            previousSession,
            nextSession: timeoutSession,
            runId: activeRun.runId,
          });
          return;
        }

        const scheduledRun = [...inspectionState.automationRuns]
          .filter(
            (run) =>
              run.automationId === automationId && run.status === 'scheduled' && run.executionId !== null,
          )
          .sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime())[0];
        if (!scheduledRun?.executionId) {
          return;
        }

        const artifactId = buildPiRuntimeStableUuid(
          'artifact',
          `agent-runtime:${thread.threadKey}:automation-artifact`,
        );

        try {
          await postgres.executeStatements(
            resolvedDatabaseUrl,
            buildStartAutomationExecutionStatements({
              currentRunId: scheduledRun.runId,
              currentExecutionId: scheduledRun.executionId,
              threadId: automation.threadId,
              automationId,
              eventId: buildPiRuntimeStableUuid(
                'execution-event',
                `agent-runtime:${automationId}:running:${currentNow.toISOString()}`,
              ),
              activityId: buildPiRuntimeStableUuid(
                'activity',
                `agent-runtime:${automationId}:running:${currentNow.toISOString()}`,
              ),
              now: currentNow,
            }),
          );
        } catch (error) {
          if (isPostgresAffectedRowsError(error)) {
            return;
          }
          throw error;
        }

        const session = await hydrateThreadSession(thread.threadKey);
        const runningSession = applyAutomationStatusUpdate({
          sessionStore,
          threadId: thread.threadKey,
          artifactId,
          automationId,
          executionId: scheduledRun.executionId,
          activityRunId: scheduledRun.runId,
          status: 'running',
          command: automation.commandName,
          minutes,
          detail: `Running automation ${automation.commandName}.`,
        });
        await persistSessionSnapshot(thread.threadKey, runningSession);
        await publishSessionUpdate({
          threadId: thread.threadKey,
          previousSession: session,
          nextSession: runningSession,
          runId: scheduledRun.runId,
        });

        const instruction =
          typeof automation.schedulePayload.instruction === 'string' &&
          automation.schedulePayload.instruction.trim().length > 0
            ? automation.schedulePayload.instruction
            : automation.commandName;
        const runThreadId = `automation:${automationId}:run:${scheduledRun.runId}`;
        const previousRun = inspectionState.automationRuns
          .filter(
            (run) =>
              run.automationId === automationId &&
              run.runId !== scheduledRun.runId &&
              run.status !== 'scheduled',
          )
          .sort((left, right) => {
            const leftTime = left.completedAt?.getTime() ?? left.scheduledAt.getTime();
            const rightTime = right.completedAt?.getTime() ?? right.scheduledAt.getTime();
            return rightTime - leftTime;
          })[0];
        const previousRunArtifactContext = previousRun
          ? readPreviousAutomationRunArtifactContext({
              inspectionState,
              threadState: thread.threadState,
              runId: previousRun.runId,
              executionId: previousRun.executionId,
            })
          : undefined;
        const previousRunActivityRefs = previousRun?.executionId
          ? inspectionState.threadActivities
              .filter((activity) => activity.executionId === previousRun.executionId)
              .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
              .slice(0, 3)
              .map((activity) => `thread-activity:${activity.activityId}`)
          : [];
        const automationTitle =
          typeof automation.schedulePayload.title === 'string' &&
          automation.schedulePayload.title.trim().length > 0
            ? automation.schedulePayload.title
            : automation.commandName;
        scheduledAutomationContexts.set(runThreadId, {
          automationId,
          automationTitle,
          scheduledAt: scheduledRun.scheduledAt,
          rootThreadId: thread.threadKey,
          rootThreadRecordId: automation.threadId,
          ...(previousRun
            ? {
                previousRun: {
                  runId: previousRun.runId,
                  executionId: previousRun.executionId,
                  status: previousRun.status,
                  completedAt: previousRun.completedAt,
                  summary: previousRunArtifactContext?.summary,
                  runDetailRef: `automation-run:${previousRun.runId}`,
                  artifactRefs: previousRunArtifactContext?.artifactRefs ?? [],
                  activityRefs: previousRunActivityRefs,
                },
              }
            : {}),
        });
        setSession(runThreadId, {
          ...getSession(runThreadId),
          thread: {
            id: runThreadId,
          },
          execution: {
            id: scheduledRun.executionId,
            status: 'working',
            statusMessage: `Running scheduled automation ${automation.commandName}.`,
          },
          automation: {
            id: automationId,
            runId: scheduledRun.runId,
          },
        });
        const timeoutMinutes = readPositiveFiniteNumber(automation.schedulePayload.timeoutMinutes) ?? 15;
        const timeoutMs = timeoutMinutes * 60 * 1000;
        let runOutcome: 'completed' | 'failed' | 'timed_out' = 'completed';
        let runFailureDetail: string | null = null;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let invocationSettled = false;
        const invocation = (async () => {
          await drainAttachedEventSource(
            await runtimeWithDomain.run({
              threadId: runThreadId,
              runId: scheduledRun.runId,
              messages: [
                {
                  id: buildPiRuntimeStableUuid(
                    'message',
                    `agent-runtime:${automationId}:run:${scheduledRun.runId}:instruction`,
                  ),
                  role: 'user',
                  content: instruction,
                },
              ],
            }),
          );
          invocationSettled = true;
        })();
        try {
          const invocationResult = await Promise.race([
            invocation.then(() => 'completed' as const),
            new Promise<'timed_out'>((resolve) => {
              timeoutId = setTimeout(() => resolve('timed_out'), timeoutMs);
            }),
          ]);
          if (invocationResult === 'timed_out') {
            runOutcome = 'timed_out';
            runFailureDetail = `Exceeded the ${timeoutMinutes} minute scheduled automation timeout.`;
            timedOutScheduledRunThreadIds.add(runThreadId);
            await stopAttachedEventSource(runtimeWithDomain, {
              threadId: runThreadId,
              runId: scheduledRun.runId,
            });
            void invocation.catch(() => undefined).finally(() => {
              scheduledAutomationContexts.delete(runThreadId);
              timedOutScheduledRunThreadIds.delete(runThreadId);
            });
          }
          const runSession = getSession(runThreadId);
          if (runOutcome !== 'timed_out' && runSession.execution.status === 'failed') {
            runOutcome = 'failed';
            runFailureDetail = runSession.execution.statusMessage ?? null;
          }
        } catch (error) {
          runOutcome = 'failed';
          runFailureDetail = error instanceof Error ? error.message : String(error);
        } finally {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          if (runOutcome !== 'timed_out' || invocationSettled) {
            scheduledAutomationContexts.delete(runThreadId);
            timedOutScheduledRunThreadIds.delete(runThreadId);
          }
        }

        const terminalNow = new Date(now());
        const terminalNextRunAt = new Date(terminalNow.getTime() + minutes * 60 * 1000);
        const completionStatements =
          runOutcome === 'timed_out'
            ? buildTimeoutAutomationExecutionStatements({
                automationId,
                currentRunId: scheduledRun.runId,
                currentExecutionId: scheduledRun.executionId,
                nextRunId: buildPiRuntimeStableUuid(
                  'automation-run',
                  `agent-runtime:${automationId}:run:${terminalNextRunAt.toISOString()}`,
                ),
                nextExecutionId: buildPiRuntimeStableUuid(
                  'execution',
                  `agent-runtime:${automationId}:execution:${terminalNextRunAt.toISOString()}`,
                ),
                threadId: automation.threadId,
                commandName: automation.commandName,
                schedulePayload: automation.schedulePayload,
                eventId: buildPiRuntimeStableUuid(
                  'execution-event',
                  `agent-runtime:${automationId}:timeout:${terminalNow.toISOString()}`,
                ),
                activityId: buildPiRuntimeStableUuid(
                  'activity',
                  `agent-runtime:${automationId}:timeout:${terminalNow.toISOString()}`,
                ),
                now: terminalNow,
                nextRunAt: terminalNextRunAt,
                leaseExpiresAt: terminalNow,
                timeoutDetail: runFailureDetail ?? `Exceeded the ${timeoutMinutes} minute scheduled automation timeout.`,
              })
            : buildCompleteAutomationExecutionStatements({
            automationId,
            currentRunId: scheduledRun.runId,
            currentExecutionId: scheduledRun.executionId,
            nextRunId: buildPiRuntimeStableUuid(
              'automation-run',
              `agent-runtime:${automationId}:run:${terminalNextRunAt.toISOString()}`,
            ),
            nextExecutionId: buildPiRuntimeStableUuid(
              'execution',
              `agent-runtime:${automationId}:execution:${terminalNextRunAt.toISOString()}`,
            ),
            threadId: automation.threadId,
            commandName: automation.commandName,
            schedulePayload: automation.schedulePayload,
            eventId: buildPiRuntimeStableUuid(
              'execution-event',
              `agent-runtime:${automationId}:event:${terminalNow.toISOString()}`,
            ),
            activityId: buildPiRuntimeStableUuid(
              'activity',
              `agent-runtime:${automationId}:activity:${terminalNow.toISOString()}`,
            ),
            now: terminalNow,
            nextRunAt: terminalNextRunAt,
            leaseExpiresAt: terminalNow,
            status: runOutcome,
          });
        try {
          await postgres.executeStatements(resolvedDatabaseUrl, completionStatements);
        } catch (error) {
          if (isPostgresAffectedRowsError(error)) {
            scheduledAutomationContexts.delete(runThreadId);
            timedOutScheduledRunThreadIds.delete(runThreadId);
            return;
          }
          throw error;
        }

        const finalAutomationStatus: AgentRuntimeAutomationStatus =
          runOutcome === 'completed' ? 'completed' : runOutcome === 'timed_out' ? 'timed_out' : 'failed';
        const finalAutomationDetail =
          runOutcome === 'completed'
            ? `Automation ${automation.commandName} executed successfully.`
            : runOutcome === 'timed_out'
              ? runFailureDetail ?? `Exceeded the ${timeoutMinutes} minute scheduled automation timeout.`
              : `Automation ${automation.commandName} failed: ${runFailureDetail ?? 'Unknown error'}.`;
        const completedStatusSession = applyAutomationStatusUpdate({
          sessionStore,
          threadId: thread.threadKey,
          artifactId,
          automationId,
          executionId: scheduledRun.executionId,
          activityRunId: scheduledRun.runId,
          status: finalAutomationStatus,
          command: automation.commandName,
          minutes,
          detail: finalAutomationDetail,
        });
        const completedSession = sessionStore.updateSession(thread.threadKey, () =>
          appendSessionActivityEvents(completedStatusSession, [
            buildLiveScheduledAutomationSnapshotActivityEvent({
              automationId,
              automationRunId: scheduledRun.runId,
              runThreadKey: runThreadId,
              rootThreadId: thread.threadKey,
              rootThreadRecordId: automation.threadId,
              session: getSession(runThreadId),
            }),
          ]),
        );
        await persistSessionSnapshot(thread.threadKey, completedSession);
        await publishSessionUpdate({
          threadId: thread.threadKey,
          previousSession: runningSession,
          nextSession: completedSession,
          runId: scheduledRun.runId,
        });
      };

      for (const automationId of dueAutomationIds) {
        if (automationTicksInFlight.has(automationId)) {
          continue;
        }
        automationTicksInFlight.add(automationId);
        void runDueAutomation(automationId)
          .catch((error) => {
            console.error('[agent-runtime] scheduled automation tick failed', error);
          })
          .finally(() => {
            automationTicksInFlight.delete(automationId);
          });
      }
    } finally {
      tickInFlight = false;
    }
  };

  void runAutomationTick();
  const timer = setInterval(() => {
    void runAutomationTick();
  }, 1_000);
  timer.unref?.();

  const serviceCore = createPiRuntimeGatewayServiceInternal({
    runtime: runtimeWithAttachedSessions,
    controlPlane,
  });
  const service: AgentRuntimeService = Object.assign(serviceCore, {
    createAgUiHandler: (handlerOptions: AgentRuntimeAgUiHandlerOptions) =>
      createPiRuntimeGatewayAgUiHandlerInternal({
        ...handlerOptions,
        service: serviceCore,
      }),
  });

  return {
    service,
  };
}

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
  buildPersistThreadStateStatements,
  buildPiRuntimeStableUuid,
  ensurePiRuntimePostgresReady as ensurePiRuntimePostgresReadyInternal,
  executePostgresStatements,
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
  surfacedInThread: boolean;
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
  surfacedInThread: boolean;
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

export type AgentRuntimeDomainConfig<TState = unknown> = {
  lifecycle: AgentRuntimeDomainLifecycle;
  systemContext?: (
    params: AgentRuntimeDomainContext<TState>,
  ) =>
    | string
    | readonly string[]
    | undefined
    | Promise<string | readonly string[] | undefined>;
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
  resume?: string;
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

const AGENT_RUNTIME_PERSISTED_DOMAIN_STATE_KEY = '__agentRuntimeDomainState';

type AgentRuntimeSessionStore = {
  hasSession: (threadId: string) => boolean;
  getSession: (threadId: string) => PiRuntimeGatewaySession;
  setSession: (threadId: string, session: PiRuntimeGatewaySession) => PiRuntimeGatewaySession;
  updateSession: (
    threadId: string,
    update: (session: PiRuntimeGatewaySession) => PiRuntimeGatewaySession,
  ) => PiRuntimeGatewaySession;
};

type AgentRuntimeAutomationStatus = 'scheduled' | 'running' | 'completed' | 'canceled';

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

  return threadState as unknown as PiRuntimeGatewaySession;
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
  }
}

function buildAutomationArtifact(params: {
  artifactId: string;
  automationId: string;
  runId: string;
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
      status: params.status,
      command: params.command,
      cadenceMinutes: params.minutes,
      detail: params.detail,
    },
  };
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
  const resumePayload = params.command?.resume;
  if (typeof resumePayload !== 'string' || !params.domain?.handleOperation) {
    return null;
  }

  const currentArtifact = params.session.artifacts?.current?.data;
  if (typeof currentArtifact !== 'object' || currentArtifact === null) {
    return null;
  }

  const interruptType =
    'interruptType' in currentArtifact && typeof currentArtifact.interruptType === 'string'
      ? currentArtifact.interruptType
      : null;
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
    input: parseDomainCommandToolInput(resumePayload),
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
      message: params.interrupt.message,
      ...(params.interrupt.payload ? { payload: params.interrupt.payload } : {}),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
      status: params.status,
      command: params.command,
      minutes: params.minutes,
      detail: params.detail,
    });

    return appendSessionActivityEvents(
      {
        ...session,
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
    ? mergeDomainProjection(params.session.domainProjection, params.result.domainProjectionUpdate)
    : params.session.domainProjection;

  for (const artifactOutput of domainOutputs.artifacts ?? []) {
    const artifact = buildDomainArtifact({
      artifact: artifactOutput,
      threadId: params.threadId,
      operationName: params.operation.name,
      now: params.now,
    });
    const artifacts = nextArtifacts ?? {};
    artifacts.current = artifact;
    artifacts.activity = artifact;
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
    const artifacts = nextArtifacts ?? {};
    artifacts.current = interruptArtifact;
    nextArtifacts = artifacts;
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
    executionStatus = 'interrupted';
    executionStatusMessage = domainOutputs.interrupt.message;
    shouldWriteA2Ui = true;
  } else if (domainOutputs.status && domainOutputs.status.executionStatus !== 'interrupted') {
    nextA2Ui = undefined;
    shouldWriteA2Ui = true;
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
    ...(hasDomainProjectionUpdate ? { domainProjection: nextDomainProjection } : {}),
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

  const currentArtifact = session.artifacts?.current;
  const resolvedArtifact = currentArtifact
    ? {
        artifactId: currentArtifact.artifactId,
        data:
          typeof currentArtifact.data === 'object' && currentArtifact.data !== null
            ? {
                ...currentArtifact.data,
                type: 'interrupt-status',
                status: 'resolved',
              }
            : {
                type: 'interrupt-status',
                status: 'resolved',
              },
      }
    : undefined;

  const nextActivityEvents = resolvedArtifact
    ? [
        ...(session.activityEvents ?? []),
        {
          type: 'artifact' as const,
          artifact: resolvedArtifact,
          append: true,
        },
      ]
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
          activity: session.artifacts.activity,
        }
      : undefined,
    ...(nextActivityEvents ? { activityEvents: nextActivityEvents } : {}),
    a2ui: undefined,
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
  const automationRegistry = createAutomationRegistry();
  const attachedRuns = createAttachedRunRegistry();
  const executionContext = new AsyncLocalStorage<AgentRuntimeExecutionContext>();
  const persistedThreads = new Set<string>();
  const getActiveThreadId = (): string | undefined => {
    const context = executionContext.getStore();
    return context?.threadId;
  };
  const getActiveSessionContext = (): PiRuntimeGatewaySession | undefined => {
    const threadId = getActiveThreadId();
    return threadId ? sessionStore.getSession(threadId) : undefined;
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
  const readCurrentInterruptPayload = (
    session: PiRuntimeGatewaySession,
  ): Record<string, unknown> | undefined => {
    if (session.execution.status !== 'interrupted') {
      return undefined;
    }

    if (session.a2ui?.kind !== 'interrupt') {
      return undefined;
    }

    return isRecord(session.a2ui.payload) ? session.a2ui.payload : undefined;
  };
  const persistSessionSnapshot = async (
    threadId: string,
    session: PiRuntimeGatewaySession = sessionStore.getSession(threadId),
  ): Promise<void> => {
    const ids = buildPiRuntimeDirectExecutionRecordIdsInternal(threadId);
    const persistedExecutionId = resolvePersistedExecutionId(threadId, session);
    const interruptPayload = readCurrentInterruptPayload(session);
    const currentInterruptId = interruptPayload
      ? buildPiRuntimeStableUuid('interrupt', `agent-runtime:execution:${persistedExecutionId}:interrupt`)
      : null;
    const executionSource = session.automation?.runId ? 'automation' : 'user';
    const currentNow = new Date(now());
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
          interruptPayload,
          surfacedInThread: true,
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
    const interruptPayload = readCurrentInterruptPayload(params.session);
    const expectedCurrentInterruptId = interruptPayload
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
      !currentInterrupt.surfacedInThread ||
      pendingInterrupts.some((candidate) => candidate.interruptId !== expectedCurrentInterruptId)
    );
  };
  const hydrateThreadSession = async (threadId: string): Promise<PiRuntimeGatewaySession> => {
    if (sessionStore.hasSession(threadId)) {
      return sessionStore.getSession(threadId);
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
        const normalizedSession = materializeSessionLifecycle(persistedSession, initialLifecyclePhase);
        const hydratedSession = sessionStore.setSession(threadId, normalizedSession);
        if (persistedDomainState !== undefined) {
          domainStateStore.set(threadId, persistedDomainState);
        } else if (recoveredLifecycleState !== undefined) {
          domainStateStore.set(threadId, recoveredLifecycleState);
        }
        if (
          normalizedSession !== persistedSession ||
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

    return sessionStore.getSession(threadId);
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
          const lines = threadId && domain
            ? [
                ...normalizeDomainSystemContextLines(
                  await domain.systemContext?.({
                    threadId,
                    state: domainStateStore.get(threadId),
                  }),
                ),
              ]
            : [];
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
      return sessionStore.getSession(threadId);
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

    const nextSession = sessionStore.updateSession(threadId, (currentSession) =>
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
    const nextSession = sessionStore.updateSession(threadId, resolveInterruptedSessionForUserInput);
    await persistSessionSnapshot(threadId, nextSession);
    return nextSession;
  };

  const persistFailedRun = async (
    threadId: string,
    error: unknown,
  ): Promise<PiRuntimeGatewaySession> => {
    const detail = error instanceof Error ? error.message : String(error);
    const nextSession = sessionStore.updateSession(threadId, (session) => ({
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
        const nextRunAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
        const automationId = randomUUID();
        const runId = randomUUID();
        const executionId = randomUUID();
        const artifactId = buildPiRuntimeStableUuid('artifact', `agent-runtime:${threadId}:automation-artifact`);

        const directExecutionIds = buildPiRuntimeDirectExecutionRecordIdsInternal(threadId);
        const currentNow = new Date(now());
        await postgres.executeStatements(
          resolvedDatabaseUrl,
          buildPersistAutomationDispatchStatements({
            automationId,
            runId,
            executionId,
            threadId: directExecutionIds.threadId,
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
        const persistedAutomations = (await loadInspectionState()).automations
          .filter(
            (automation) =>
              automation.threadId === buildPiRuntimeDirectExecutionRecordIdsInternal(threadId).threadId,
          )
          .map((automation) => ({
            id: automation.automationId,
            title:
              typeof automation.schedulePayload.title === 'string'
                ? automation.schedulePayload.title
                : automation.commandName,
            status: automation.nextRunAt === null ? 'completed' : automation.suspended ? 'canceled' : 'active',
            schedule: coerceSchedule(automation.schedulePayload.schedule, {
              kind: 'every',
              intervalMinutes: automation.schedulePayload.minutes ?? 5,
            }),
            nextRunAt: automation.nextRunAt?.toISOString() ?? null,
            lastRunAt: null,
            lastRunStatus: null,
          }));
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
        const currentRecord = automationRegistry.getById(toolArgs.automationId);

        const inspectionState = await loadInspectionState();
        const threadRecordId = buildPiRuntimeDirectExecutionRecordIdsInternal(threadId).threadId;
        const scheduledRun = [...inspectionState.automationRuns]
          .filter((run) => run.automationId === toolArgs.automationId && run.status === 'scheduled')
          .sort((left, right) => right.scheduledAt.getTime() - left.scheduledAt.getTime())[0];
        await postgres.executeStatements(
          resolvedDatabaseUrl,
          buildCancelAutomationStatements({
            automationId: toolArgs.automationId,
            currentRunId: scheduledRun?.runId ?? null,
            currentExecutionId: scheduledRun?.executionId ?? null,
            threadId: threadRecordId,
            eventId: randomUUID(),
            activityId: randomUUID(),
            now: new Date(now()),
          }),
        );

        const record =
          currentRecord ??
          automationRegistry.upsert({
            automationId: toolArgs.automationId,
            threadId,
            title: buildAutomationTitle({
              command: 'sync',
              schedule: { kind: 'every', intervalMinutes: 5 },
            }),
            instruction: 'sync',
            command: 'sync',
            schedule: { kind: 'every', intervalMinutes: 5 },
            runId: `run:${threadId}`,
            executionId: sessionStore.getSession(threadId).execution.id,
            artifactId:
              sessionStore.getSession(threadId).artifacts?.current?.artifactId ??
              `artifact:${threadId}:automation`,
            nextRunAt: null,
            status: 'active',
            lastRunAt: null,
            lastRunStatus: null,
          });
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

        const directExecutionIds = buildPiRuntimeDirectExecutionRecordIdsInternal(threadId);
        await postgres.executeStatements(
          resolvedDatabaseUrl,
          buildPersistInterruptCheckpointStatements({
            executionId: directExecutionIds.executionId,
            interruptId: buildPiRuntimeStableUuid(
              'interrupt',
              `agent-runtime:execution:${directExecutionIds.executionId}:interrupt`,
            ),
            artifactId,
            activityId: buildPiRuntimeStableUuid('activity', `agent-runtime:${threadId}:interrupt-activity`),
            threadId: directExecutionIds.threadId,
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
            inputJson: Type.String({ default: '{}' }),
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
    getSession: sessionStore.getSession,
    updateSession: sessionStore.updateSession,
    onSessionUpdated: persistSessionSnapshot,
    now,
  });

  const runtimeWithDomain: PiRuntimeGatewayRuntime = {
    ...runtime,
    run: async (request) => {
      const session = sessionStore.getSession(request.threadId);
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
      const stateDeltaEvent = buildPiRuntimeGatewayStateDeltaEventInternal({
        previousSession: session,
        session: nextSession,
      });

      const events: BaseEvent[] = [
        {
          type: EventType.RUN_STARTED,
          threadId: request.threadId,
          runId: request.runId,
        },
        ...(stateDeltaEvent ? [stateDeltaEvent] : []),
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

      const isDomainInterruptResume =
        readInterruptOperation({
          command: request.forwardedProps?.command,
          session,
          domain,
        }) !== null;
      if (typeof request.forwardedProps?.command?.resume === 'string' && !isDomainInterruptResume) {
        const resumedSession = await resumeInterruptedSession(request.threadId);
        const stateDeltaEvent = buildPiRuntimeGatewayStateDeltaEventInternal({
          previousSession: session,
          session: resumedSession,
        });
        if (stateDeltaEvent) {
          leadingEvents = [stateDeltaEvent];
        }
      }

      attachedRuns.startRun(request.threadId, request.runId);

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

      for (const automationId of dueAutomationIds) {
        const automation = inspectionState.automations.find((candidate) => candidate.automationId === automationId);
        const scheduledRun = [...inspectionState.automationRuns]
          .filter(
            (run) =>
              run.automationId === automationId && run.status === 'scheduled' && run.executionId !== null,
          )
          .sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime())[0];
        if (!automation || !scheduledRun?.executionId) {
          continue;
        }

        const thread = threadById.get(automation.threadId);
        const minutes =
          typeof automation.schedulePayload.minutes === 'number' &&
          Number.isFinite(automation.schedulePayload.minutes) &&
          automation.schedulePayload.minutes > 0
            ? automation.schedulePayload.minutes
            : null;
        if (!thread || minutes === null) {
          continue;
        }

        const currentNow = new Date(now());
        const nextRunAt = new Date(currentNow.getTime() + minutes * 60 * 1000);
        const artifactId = buildPiRuntimeStableUuid(
          'artifact',
          `agent-runtime:${thread.threadKey}:automation-artifact`,
        );

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

        await postgres.executeStatements(
          resolvedDatabaseUrl,
          buildCompleteAutomationExecutionStatements({
            automationId,
            currentRunId: scheduledRun.runId,
            currentExecutionId: scheduledRun.executionId,
            nextRunId: buildPiRuntimeStableUuid(
              'automation-run',
              `agent-runtime:${automationId}:run:${nextRunAt.toISOString()}`,
            ),
            nextExecutionId: buildPiRuntimeStableUuid(
              'execution',
              `agent-runtime:${automationId}:execution:${nextRunAt.toISOString()}`,
            ),
            threadId: automation.threadId,
            commandName: automation.commandName,
            schedulePayload: automation.schedulePayload,
            eventId: buildPiRuntimeStableUuid(
              'execution-event',
              `agent-runtime:${automationId}:event:${currentNow.toISOString()}`,
            ),
            activityId: buildPiRuntimeStableUuid(
              'activity',
              `agent-runtime:${automationId}:activity:${currentNow.toISOString()}`,
            ),
            now: currentNow,
            nextRunAt,
            leaseExpiresAt: currentNow,
          }),
        );

        const completedSession = applyAutomationStatusUpdate({
          sessionStore,
          threadId: thread.threadKey,
          artifactId,
          automationId,
          executionId: scheduledRun.executionId,
          activityRunId: scheduledRun.runId,
          status: 'completed',
          command: automation.commandName,
          minutes,
          detail: `Automation ${automation.commandName} executed successfully.`,
        });
        await persistSessionSnapshot(thread.threadKey, completedSession);
        await publishSessionUpdate({
          threadId: thread.threadKey,
          previousSession: runningSession,
          nextSession: completedSession,
          runId: scheduledRun.runId,
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

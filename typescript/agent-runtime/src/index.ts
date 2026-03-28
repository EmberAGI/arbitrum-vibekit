import { Type } from '@mariozechner/pi-ai';

import {
  buildPiA2UiActivityEvent as buildPiA2UiActivityEventInternal,
  buildPiRuntimeGatewayConnectEvents as buildPiRuntimeGatewayConnectEventsInternal,
  createCanonicalPiRuntimeGatewayControlPlane as createCanonicalPiRuntimeGatewayControlPlaneInternal,
  createPiRuntimeGatewayFoundation as createPiRuntimeGatewayFoundationInternal,
  createPiRuntimeGatewayRuntime as createPiRuntimeGatewayRuntimeInternal,
  createPiRuntimeGatewayService as createPiRuntimeGatewayServiceInternal,
  type PiRuntimeGatewayActivityEvent,
  type PiRuntimeGatewayArtifact,
  type PiRuntimeGatewayExecutionStatus,
  type PiRuntimeGatewayInspectionState,
  type PiRuntimeGatewayRunRequest,
  type PiRuntimeGatewayRuntime,
  type PiRuntimeGatewayService,
  type PiRuntimeGatewaySession,
} from '../lib/pi/dist/index.js';

type AgentRuntimeTransformContext = NonNullable<
  NonNullable<Parameters<typeof createPiRuntimeGatewayFoundationInternal>[0]['agentOptions']>['transformContext']
>;
type AgentRuntimeTransformMessages = Awaited<ReturnType<AgentRuntimeTransformContext>>;
type AgentRuntimeTransformMessage = AgentRuntimeTransformMessages[number];
type AgentRuntimeTool = NonNullable<
  Parameters<typeof createPiRuntimeGatewayFoundationInternal>[0]['tools']
>[number];
type AgentRuntimeConnectEvent = ReturnType<typeof buildPiRuntimeGatewayConnectEventsInternal>[number];
type AgentRuntimeAttachedEventSource = readonly AgentRuntimeConnectEvent[] | AsyncIterable<AgentRuntimeConnectEvent>;

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

type AgentRuntimeDomainOperation = {
  source: 'command' | 'tool' | 'interrupt';
  name: string;
  input?: unknown;
};

type AgentRuntimeDomainStatusOutput = {
  executionStatus: PiRuntimeGatewayExecutionStatus;
  statusMessage?: string;
};

type AgentRuntimeDomainArtifactOutput = {
  channel?: 'current' | 'activity';
  artifactId?: string;
  data: unknown;
  append?: boolean;
};

type AgentRuntimeDomainInterruptOutput = {
  type: string;
  surfacedInThread: boolean;
  message: string;
  inputLabel?: string;
  submitLabel?: string;
  artifactData?: unknown;
};

type AgentRuntimeDomainOutputs = {
  status?: AgentRuntimeDomainStatusOutput;
  artifacts?: readonly AgentRuntimeDomainArtifactOutput[];
  interrupt?: AgentRuntimeDomainInterruptOutput;
  threadPatch?: Record<string, unknown>;
};

type AgentRuntimeDomainOperationResult = {
  state?: unknown;
  outputs?: AgentRuntimeDomainOutputs;
};

type AgentRuntimeDomainConfig = {
  lifecycle: AgentRuntimeDomainLifecycle;
  systemContext?: (params: {
    threadId: string;
    session: PiRuntimeGatewaySession;
  }) => string | readonly string[] | undefined;
  handleOperation?: (params: {
    operation: AgentRuntimeDomainOperation;
    threadId: string;
    session: PiRuntimeGatewaySession;
  }) => AgentRuntimeDomainOperationResult | Promise<AgentRuntimeDomainOperationResult>;
};

type AgentRuntimeForwardedCommand = NonNullable<
  NonNullable<PiRuntimeGatewayRunRequest['forwardedProps']>['command']
>;

type AgentRuntimeDomainCommandToolArgs = {
  name: string;
  inputJson: string;
};

type AgentRuntimeAttachedSessions = {
  ensureThread?: (threadId: string) => void | Promise<void>;
  attachToThread: (
    threadId: string,
    listener: (event: AgentRuntimeConnectEvent) => void,
  ) => {
    detach: () => void;
    activeRunEvents: readonly AgentRuntimeConnectEvent[];
  };
  startAttachedRun: (threadId: string, runId: string) => void;
  appendAttachedRunEvents: (
    threadId: string,
    runId: string,
    events: readonly AgentRuntimeConnectEvent[],
  ) => void;
  finishAttachedRun: (threadId: string, runId: string) => void;
  publishAttachedEventSource: (
    threadId: string,
    source: AgentRuntimeAttachedEventSource,
  ) => Promise<void>;
  resumeFromUserInput?: (threadId: string) => PiRuntimeGatewaySession;
};

export const AGENT_RUNTIME_DOMAIN_COMMAND_TOOL = 'agent_runtime_domain_command';

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

function readDirectCommandOperation(
  command: AgentRuntimeForwardedCommand | undefined,
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

function readInterruptOperation(params: {
  command: AgentRuntimeForwardedCommand | undefined;
  session: PiRuntimeGatewaySession;
  domain: AgentRuntimeDomainConfig | undefined;
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
    data:
      params.interrupt.artifactData ?? {
        type: 'interrupt-status',
        interruptType: params.interrupt.type,
        status: 'pending',
        message: params.interrupt.message,
      },
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

function applyDomainOperationResult(params: {
  threadId: string;
  now: () => number;
  operation: AgentRuntimeDomainOperation;
  session: PiRuntimeGatewaySession;
  result: AgentRuntimeDomainOperationResult;
}): PiRuntimeGatewaySession {
  const outputs = params.result.outputs;
  if (!outputs) {
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

  for (const artifactOutput of outputs.artifacts ?? []) {
    const artifact = buildDomainArtifact({
      artifact: artifactOutput,
      threadId: params.threadId,
      operationName: params.operation.name,
      now: params.now,
    });
    const channel = artifactOutput.channel ?? 'current';
    const artifacts = nextArtifacts ?? {};
    if (channel === 'activity') {
      artifacts.activity = artifact;
    } else {
      artifacts.current = artifact;
    }
    nextArtifacts = artifacts;
    nextActivityEvents.push({
      type: 'artifact',
      artifact,
      ...(artifactOutput.append === true ? { append: true } : {}),
    });
  }

  let executionStatus = outputs.status?.executionStatus ?? params.session.execution.status;
  let executionStatusMessage = outputs.status?.statusMessage ?? params.session.execution.statusMessage;

  if (outputs.interrupt) {
    const interruptArtifact = buildInterruptArtifact({
      interrupt: outputs.interrupt,
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
        type: outputs.interrupt.type,
        artifactId: interruptArtifact.artifactId,
        message: outputs.interrupt.message,
        inputLabel: outputs.interrupt.inputLabel ?? 'Provide input',
        submitLabel: outputs.interrupt.submitLabel ?? 'Continue',
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
    executionStatusMessage = outputs.interrupt.message;
  } else if (outputs.status && outputs.status.executionStatus !== 'interrupted') {
    nextA2Ui = undefined;
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
    ...(nextA2Ui ? { a2ui: nextA2Ui } : {}),
    threadPatch: mergeThreadPatch(params.session.threadPatch, outputs.threadPatch),
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

function tapAttachedEventSource(
  source: AgentRuntimeAttachedEventSource,
  onEvents: (events: readonly AgentRuntimeConnectEvent[]) => void,
  onComplete?: () => void,
): AgentRuntimeAttachedEventSource {
  if (Array.isArray(source)) {
    onEvents(source);
    onComplete?.();
    return cloneAttachedEvents(source);
  }

  return {
    [Symbol.asyncIterator]() {
      const iterator = (source as AsyncIterable<AgentRuntimeConnectEvent>)[Symbol.asyncIterator]();

      return {
        async next() {
          const result = await iterator.next();
          if (!result.done) {
            onEvents([result.value]);
          } else {
            onComplete?.();
          }
          return result;
        },
        async return() {
          onComplete?.();
          return typeof iterator.return === 'function'
            ? await iterator.return()
            : { value: undefined, done: true };
        },
        async throw(error: unknown) {
          onComplete?.();
          if (typeof iterator.throw === 'function') {
            return await iterator.throw(error);
          }

          throw error;
        },
      };
    },
  };
}

type CreateAgentRuntimeOptions = Parameters<typeof createPiRuntimeGatewayFoundationInternal>[0] & {
  sessions: {
    getSession: (threadId: string) => PiRuntimeGatewaySession;
    updateSession?: (
      threadId: string,
      update: (session: PiRuntimeGatewaySession) => PiRuntimeGatewaySession,
    ) => PiRuntimeGatewaySession;
    attached?: AgentRuntimeAttachedSessions;
  };
  controlPlane: {
    loadInspectionState: () => Promise<PiRuntimeGatewayInspectionState>;
    retention?: Parameters<typeof createCanonicalPiRuntimeGatewayControlPlaneInternal>[0]['retention'];
    now?: () => Date;
  };
  domain?: AgentRuntimeDomainConfig;
};

type AgentRuntimeInstance = {
  bootstrapPlan: ReturnType<typeof createPiRuntimeGatewayFoundationInternal>['bootstrapPlan'];
  service: PiRuntimeGatewayService;
};

export function createAgentRuntime(options: CreateAgentRuntimeOptions): AgentRuntimeInstance {
  const now = options.now ?? (() => Date.now());
  const transformContext: AgentRuntimeTransformContext | undefined =
    options.agentOptions?.transformContext || options.domain?.systemContext
      ? async (messages, signal) => {
          const transformedMessages = options.agentOptions?.transformContext
            ? await options.agentOptions.transformContext(messages, signal)
            : messages;
          const session = options.getSessionContext?.();
          if (!session || !options.domain?.systemContext) {
            return transformedMessages;
          }

          const contribution = options.domain.systemContext({
            threadId: session.thread.id,
            session,
          });
          const lines = normalizeDomainSystemContextLines(contribution);

          if (lines.length === 0) {
            return transformedMessages;
          }

          const domainContextMessages = lines.map<AgentRuntimeTransformMessage>((line) => ({
            role: 'user',
            content: `<agent-runtime-domain-context>${line}</agent-runtime-domain-context>`,
            timestamp: now(),
          }));

          return [...transformedMessages, ...domainContextMessages];
        }
      : undefined;

  const runDomainOperation = async (
    threadId: string,
    operation: AgentRuntimeDomainOperation,
  ): Promise<PiRuntimeGatewaySession> => {
    if (!options.domain?.handleOperation) {
      return options.sessions.getSession(threadId);
    }

    const session = options.sessions.getSession(threadId);
    const result = await options.domain.handleOperation({
      operation,
      threadId,
      session,
    });

    return options.sessions.updateSession
      ? options.sessions.updateSession(threadId, (currentSession) =>
          applyDomainOperationResult({
            threadId,
            now,
            operation,
            session: currentSession,
            result,
          }),
        )
      : applyDomainOperationResult({
          threadId,
          now,
          operation,
          session,
          result,
        });
  };

  const domainCommandTool: AgentRuntimeTool | null =
    options.domain?.handleOperation && options.domain.lifecycle.commands.length > 0
      ? {
          name: AGENT_RUNTIME_DOMAIN_COMMAND_TOOL,
          label: 'Agent Runtime Domain Command',
          description:
            'Execute a declared domain lifecycle command through the runtime-owned normalized operation pipeline.',
          parameters: Type.Object({
            name: Type.String(),
            inputJson: Type.String({ default: '{}' }),
          }) as AgentRuntimeTool['parameters'],
          execute: async (_toolCallId, args) => {
            const toolArgs = parseDomainCommandToolArgs(args);
            if (!toolArgs) {
              throw new Error('Domain command tool requires a command name.');
            }

            const sessionContext = options.getSessionContext?.();
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
    tools: domainCommandTool ? [...(options.tools ?? []), domainCommandTool] : options.tools,
    databaseUrl: options.databaseUrl,
    agentOptions: {
      ...options.agentOptions,
      ...(transformContext ? { transformContext } : {}),
    },
    getSessionContext: options.getSessionContext,
    now,
  });

  const runtime = createPiRuntimeGatewayRuntimeInternal({
    agent: foundation.agent,
    getSession: options.sessions.getSession,
    updateSession: options.sessions.updateSession,
    now,
  });

  const runtimeWithDomain: PiRuntimeGatewayRuntime = {
    ...runtime,
    run: async (request) => {
      const session = options.sessions.getSession(request.threadId);
      const operation =
        readDirectCommandOperation(request.forwardedProps?.command) ??
        readInterruptOperation({
          command: request.forwardedProps?.command,
          session,
          domain: options.domain,
        });
      if (!operation || !options.domain?.handleOperation) {
        return await runtime.run(request);
      }

      const nextSession = await runDomainOperation(request.threadId, operation);

      return buildPiRuntimeGatewayConnectEventsInternal({
        threadId: request.threadId,
        runId: request.runId,
        session: nextSession,
      });
    },
  };

  const runtimeWithAttachedSessions: PiRuntimeGatewayRuntime = options.sessions.attached
    ? {
        ...runtimeWithDomain,
        connect: async (request) => {
          await options.sessions.attached?.ensureThread?.(request.threadId);

          return createAttachedEventStream({
            seedEvents: buildPiRuntimeGatewayConnectEventsInternal({
              threadId: request.threadId,
              runId: request.runId ?? `connect:${request.threadId}`,
              session: options.sessions.getSession(request.threadId),
            }),
            attach: (push) => options.sessions.attached!.attachToThread(request.threadId, push),
          });
        },
        run: async (request) => {
          await options.sessions.attached?.ensureThread?.(request.threadId);

          const isDomainInterruptResume =
            readInterruptOperation({
              command: request.forwardedProps?.command,
              session: options.sessions.getSession(request.threadId),
              domain: options.domain,
            }) !== null;
          if (typeof request.forwardedProps?.command?.resume === 'string' && !isDomainInterruptResume) {
            options.sessions.attached?.resumeFromUserInput?.(request.threadId);
          }

          options.sessions.attached?.startAttachedRun(request.threadId, request.runId);

          return tapAttachedEventSource(
            await runtimeWithDomain.run(request),
            (events) => options.sessions.attached?.appendAttachedRunEvents(request.threadId, request.runId, events),
            () => options.sessions.attached?.finishAttachedRun(request.threadId, request.runId),
          );
        },
        stop: async (request) =>
          tapAttachedEventSource(
            await runtimeWithDomain.stop(request),
            (events) => {
              void options.sessions.attached?.publishAttachedEventSource(request.threadId, events);
            },
            () => options.sessions.attached?.finishAttachedRun(request.threadId, request.runId),
          ),
      }
    : runtimeWithDomain;

  const controlPlane = createCanonicalPiRuntimeGatewayControlPlaneInternal({
    loadInspectionState: options.controlPlane.loadInspectionState,
    retention: options.controlPlane.retention,
    now: options.controlPlane.now,
  });

  return {
    bootstrapPlan: foundation.bootstrapPlan,
    service: createPiRuntimeGatewayServiceInternal({
      runtime: runtimeWithAttachedSessions,
      controlPlane,
    }),
  };
}

export * from '../lib/contracts/dist/index.js';
export {
  buildPiA2UiActivityEvent,
  buildPiRuntimeDirectExecutionRecordIds,
  buildPiRuntimeGatewayConnectEvents,
  buildPiRuntimeGatewayContextMessages,
  buildPiThreadStateSnapshot,
  createPiRuntimeGatewayMockStream,
  convertPiRuntimeGatewayMessagesToLlm,
  createCanonicalPiRuntimeGatewayControlPlane,
  createPiRuntimeGatewayAgUiHandler,
  DEFAULT_PI_RUNTIME_GATEWAY_AG_UI_BASE_PATH,
  DEFAULT_PI_RUNTIME_GATEWAY_RETENTION,
  ensurePiRuntimePostgresReady,
  loadPiRuntimeInspectionState,
  mapPiAgentEventsToAgUiEvents,
  persistPiRuntimeDirectExecution,
  PiRuntimeGatewayHttpAgent,
} from '../lib/pi/dist/index.js';
export {
  buildCancelAutomationStatements,
  buildCompleteAutomationExecutionStatements,
  buildPersistAutomationDispatchStatements,
  buildPersistInterruptCheckpointStatements,
  recoverDueAutomations,
  buildPiRuntimeStableUuid,
  executePostgresStatements,
} from '../lib/postgres/dist/index.js';
export type {
  EnsuredPiRuntimePostgres,
  EnsurePiRuntimePostgresReadyOptions,
  LoadedPiRuntimeInspectionState,
  LoadPiRuntimeInspectionStateOptions,
  PiRuntimeGatewayA2UiMessage,
  PiRuntimeGatewayA2UiPayload,
  PiRuntimeGatewayActivityEvent,
  PiRuntimeGatewayAgUiHandlerOptions,
  PiRuntimeGatewayAgent,
  PiRuntimeGatewayArtifact,
  PiRuntimeGatewayArtifactMessage,
  PiRuntimeGatewayConnectRequest,
  PiRuntimeGatewayContextMessage,
  PiRuntimeGatewayControlPlane,
  PiRuntimeGatewayExecutionStatus,
  PiRuntimeGatewayHttpAgentConfig,
  PiRuntimeGatewayInspectionState,
  PiRuntimeGatewayRunRequest,
  PiRuntimeGatewayRuntimeNoteMessage,
  PiRuntimeGatewayStopRequest,
  PersistPiRuntimeDirectExecutionOptions,
} from '../lib/pi/dist/index.js';
export type { ExecutePostgresStatements } from '../lib/postgres/dist/index.js';

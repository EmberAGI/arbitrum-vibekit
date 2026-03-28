import {
  createCanonicalPiRuntimeGatewayControlPlane as createCanonicalPiRuntimeGatewayControlPlaneInternal,
  createPiRuntimeGatewayFoundation as createPiRuntimeGatewayFoundationInternal,
  createPiRuntimeGatewayRuntime as createPiRuntimeGatewayRuntimeInternal,
  createPiRuntimeGatewayService as createPiRuntimeGatewayServiceInternal,
  type PiRuntimeGatewayInspectionState,
  type PiRuntimeGatewayRuntime,
  type PiRuntimeGatewayService,
  type PiRuntimeGatewaySession,
} from '../lib/pi/dist/index.js';

type AgentRuntimeTransformContext = NonNullable<
  NonNullable<Parameters<typeof createPiRuntimeGatewayFoundationInternal>[0]['agentOptions']>['transformContext']
>;
type AgentRuntimeTransformMessages = Awaited<ReturnType<AgentRuntimeTransformContext>>;
type AgentRuntimeTransformMessage = AgentRuntimeTransformMessages[number];

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
  }) => unknown;
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

type CreateAgentRuntimeOptions = Parameters<typeof createPiRuntimeGatewayFoundationInternal>[0] & {
  sessions: {
    getSession: (threadId: string) => PiRuntimeGatewaySession;
    updateSession?: (
      threadId: string,
      update: (session: PiRuntimeGatewaySession) => PiRuntimeGatewaySession,
    ) => PiRuntimeGatewaySession;
  };
  controlPlane: {
    loadInspectionState: () => Promise<PiRuntimeGatewayInspectionState>;
    retention?: Parameters<typeof createCanonicalPiRuntimeGatewayControlPlaneInternal>[0]['retention'];
    now?: () => Date;
  };
  runtime?: (
    runtime: PiRuntimeGatewayRuntime,
  ) => Partial<PiRuntimeGatewayRuntime>;
  domain?: AgentRuntimeDomainConfig;
};

type AgentRuntimeInstance = {
  bootstrapPlan: ReturnType<typeof createPiRuntimeGatewayFoundationInternal>['bootstrapPlan'];
  service: PiRuntimeGatewayService;
};

export function createAgentRuntime(options: CreateAgentRuntimeOptions): AgentRuntimeInstance {
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
            timestamp: options.now?.() ?? Date.now(),
          }));

          return [...transformedMessages, ...domainContextMessages];
        }
      : undefined;

  const foundation = createPiRuntimeGatewayFoundationInternal({
    model: options.model,
    systemPrompt: options.systemPrompt,
    tools: options.tools,
    databaseUrl: options.databaseUrl,
    agentOptions: {
      ...options.agentOptions,
      ...(transformContext ? { transformContext } : {}),
    },
    getSessionContext: options.getSessionContext,
    now: options.now,
  });

  const runtime = createPiRuntimeGatewayRuntimeInternal({
    agent: foundation.agent,
    getSession: options.sessions.getSession,
    updateSession: options.sessions.updateSession,
    now: options.now,
  });

  const controlPlane = createCanonicalPiRuntimeGatewayControlPlaneInternal({
    loadInspectionState: options.controlPlane.loadInspectionState,
    retention: options.controlPlane.retention,
    now: options.controlPlane.now,
  });

  return {
    bootstrapPlan: foundation.bootstrapPlan,
    service: createPiRuntimeGatewayServiceInternal({
      runtime: {
        ...runtime,
        ...options.runtime?.(runtime),
      },
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

import {
  createCanonicalPiRuntimeGatewayControlPlane,
  createPiRuntimeGatewayAgUiHandler,
  createPiRuntimeGatewayRuntime,
  createPiRuntimeGatewayService,
  type PiRuntimeGatewayAgent,
  type PiRuntimeGatewayInspectionState,
  type PiRuntimeGatewayService,
} from 'agent-runtime';

export const PI_EXAMPLE_AGENT_ID = 'agent-pi-example';
export const PI_EXAMPLE_AG_UI_BASE_PATH = '/ag-ui';
const PI_EXAMPLE_NOW = new Date('2026-03-20T00:00:00.000Z');

type PiExampleAgUiHandlerOptions = {
  agentId: string;
  service: PiRuntimeGatewayService;
  basePath?: string;
};

function buildPiExampleInspectionState(threadId: string): PiRuntimeGatewayInspectionState {
  const activeExecutionId = `pi-example:${threadId}`;

  return {
    threads: [
      {
        threadId,
        threadKey: threadId,
        status: 'active',
        threadState: { threadId },
        createdAt: new Date('2026-03-20T00:00:00.000Z'),
        updatedAt: new Date('2026-03-20T00:00:00.000Z'),
      },
    ],
    executions: [
      {
        executionId: activeExecutionId,
        threadId,
        automationRunId: null,
        status: 'working',
        source: 'user',
        currentInterruptId: null,
        createdAt: new Date('2026-03-20T00:00:00.000Z'),
        updatedAt: new Date('2026-03-20T00:00:00.000Z'),
        completedAt: null,
      },
      {
        executionId: 'exec-automation-1',
        threadId,
        automationRunId: 'run-1',
        status: 'interrupted',
        source: 'automation',
        currentInterruptId: 'interrupt-1',
        createdAt: new Date('2026-03-19T23:58:00.000Z'),
        updatedAt: new Date('2026-03-19T23:59:00.000Z'),
        completedAt: null,
      },
      {
        executionId: 'exec-completed-1',
        threadId,
        automationRunId: null,
        status: 'completed',
        source: 'system',
        currentInterruptId: null,
        createdAt: new Date('2026-03-10T00:00:00.000Z'),
        updatedAt: new Date('2026-03-11T00:00:00.000Z'),
        completedAt: new Date('2026-03-11T00:00:00.000Z'),
      },
    ],
    automations: [
      {
        automationId: 'automation-1',
        threadId,
        commandName: 'sync',
        cadence: '0 * * * *',
        schedulePayload: { command: 'sync' },
        suspended: false,
        nextRunAt: new Date('2026-03-19T23:55:00.000Z'),
        createdAt: new Date('2026-03-19T00:00:00.000Z'),
        updatedAt: new Date('2026-03-19T23:55:00.000Z'),
      },
    ],
    automationRuns: [
      {
        runId: 'run-1',
        automationId: 'automation-1',
        threadId,
        executionId: 'exec-automation-1',
        status: 'scheduled',
        scheduledAt: new Date('2026-03-19T23:55:00.000Z'),
        startedAt: null,
        completedAt: null,
      },
      {
        runId: 'run-completed-1',
        automationId: 'automation-1',
        threadId,
        executionId: 'exec-completed-1',
        status: 'completed',
        scheduledAt: new Date('2026-03-10T00:00:00.000Z'),
        startedAt: new Date('2026-03-10T00:01:00.000Z'),
        completedAt: new Date('2026-03-10T00:10:00.000Z'),
      },
    ],
    interrupts: [
      {
        interruptId: 'interrupt-1',
        executionId: 'exec-automation-1',
        threadId,
        status: 'pending',
        surfacedInThread: true,
      },
    ],
    leases: [
      {
        automationId: 'automation-1',
        ownerId: 'worker-a',
        leaseExpiresAt: new Date('2026-03-19T23:56:00.000Z'),
        lastHeartbeatAt: new Date('2026-03-19T23:55:30.000Z'),
      },
    ],
    outboxIntents: [
      {
        outboxId: 'outbox-1',
        status: 'pending',
        availableAt: new Date('2026-03-19T23:57:00.000Z'),
        deliveredAt: null,
      },
    ],
    executionEvents: [
      {
        eventId: 'event-archive-1',
        executionId: 'exec-completed-1',
        threadId,
        eventKind: 'completed',
        createdAt: new Date('2026-03-10T00:20:00.000Z'),
      },
    ],
    threadActivities: [
      {
        activityId: 'activity-archive-1',
        threadId,
        executionId: 'exec-completed-1',
        activityKind: 'summary',
        createdAt: new Date('2026-03-10T00:30:00.000Z'),
      },
    ],
  };
}

export function createPiExampleGatewayService(): PiRuntimeGatewayService {
  const agent: PiRuntimeGatewayAgent = {
    sessionId: undefined,
    state: {
      systemPrompt: '',
      model: {} as PiRuntimeGatewayAgent['state']['model'],
      thinkingLevel: 'off',
      tools: [],
      messages: [],
      isStreaming: false,
      streamMessage: null,
      pendingToolCalls: new Set<string>(),
    },
    subscribe: () => () => undefined,
    prompt: async () => undefined,
    continue: async () => undefined,
    steer: () => undefined,
    followUp: () => undefined,
    abort: () => undefined,
  };

  const runtime = createPiRuntimeGatewayRuntime({
    agent,
    getSession: () => {
      const threadId = agent.sessionId ?? 'thread-1';
      return {
        thread: { id: threadId },
        execution: {
          id: `pi-example:${threadId}`,
          status: 'working',
        },
      };
    },
  });

  const controlPlane = createCanonicalPiRuntimeGatewayControlPlane({
    loadInspectionState: async () => buildPiExampleInspectionState(agent.sessionId ?? 'thread-1'),
    now: () => PI_EXAMPLE_NOW,
  });

  return createPiRuntimeGatewayService({
    runtime,
    controlPlane,
  });
}

export function createPiExampleAgUiHandler(options: PiExampleAgUiHandlerOptions) {
  return createPiRuntimeGatewayAgUiHandler({
    ...options,
    basePath: options.basePath ?? PI_EXAMPLE_AG_UI_BASE_PATH,
  });
}

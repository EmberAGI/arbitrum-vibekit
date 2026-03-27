import {
  buildPiRuntimeGatewayConnectEvents,
  buildPiA2UiActivityEvent,
  createPiRuntimeGatewayProjectionStore,
  type PiRuntimeGatewayA2UiPayload,
  type PiRuntimeGatewayArtifact,
  type PiRuntimeGatewayActivityEvent,
  type PiRuntimeGatewayProjectionStore,
  type PiRuntimeGatewayThreadProjection,
} from 'agent-runtime';
type BaseEvent = ReturnType<typeof buildPiRuntimeGatewayConnectEvents>[number];

function buildDefaultProjection(threadKey: string): PiRuntimeGatewayThreadProjection {
  return {
    threadId: threadKey,
    execution: {
      id: `pi-example:${threadKey}`,
      status: 'working',
      statusMessage: 'Ready for a live Pi-native conversation.',
    },
    messages: [],
    activityEvents: [],
  };
}

function buildArtifactActivityEvent(
  artifact: PiRuntimeGatewayArtifact,
): PiRuntimeGatewayActivityEvent {
  return {
    type: 'artifact',
    artifact,
    append: true,
  };
}

function appendProjectionActivityEvents(
  projection: PiRuntimeGatewayThreadProjection,
  events: readonly PiRuntimeGatewayActivityEvent[],
): PiRuntimeGatewayThreadProjection {
  if (events.length === 0) {
    return projection;
  }

  return {
    ...projection,
    activityEvents: [...(projection.activityEvents ?? []), ...events],
  };
}

export type PiExampleRuntimeStateStore = PiRuntimeGatewayProjectionStore & {
  resumeFromUserInput: (threadKey: string) => PiRuntimeGatewayThreadProjection;
};

type AutomationStatus = 'scheduled' | 'running' | 'completed' | 'canceled';

function mapAutomationStatusToExecutionStatus(
  status: AutomationStatus,
): PiRuntimeGatewayThreadProjection['execution']['status'] {
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

export function createPiExampleRuntimeStateStore(): PiExampleRuntimeStateStore {
  const store = createPiRuntimeGatewayProjectionStore({
    createInitialProjection: buildDefaultProjection,
  });

  return {
    ...store,
    resumeFromUserInput: (threadKey) => {
      const current = store.getProjection(threadKey);
      if (current.execution.status !== 'interrupted') {
        return current;
      }

      const resolvedArtifact = current.currentArtifact
        ? {
            artifactId: current.currentArtifact.artifactId,
            data: {
              type: 'interrupt-status',
              status: 'resolved',
            },
          }
        : undefined;

      const resumed = {
        ...current,
        execution: {
          ...current.execution,
          status: 'working' as const,
          statusMessage: 'Operator input received. Continuing the Pi loop.',
        },
        currentArtifact: resolvedArtifact,
        activityArtifact: current.activityArtifact,
        a2ui: undefined,
      };
      const nextProjection = resolvedArtifact
        ? appendProjectionActivityEvents(resumed, [buildArtifactActivityEvent(resolvedArtifact)])
        : resumed;
      store.updateProjection(threadKey, () => nextProjection);
      return nextProjection;
    },
  };
}

export function buildAutomationArtifact(params: {
  artifactId: string;
  automationId: string;
  runId: string;
  status: AutomationStatus;
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

export function buildAutomationA2Ui(params: {
  automationId: string;
  runId: string;
  status: AutomationStatus;
  command: string;
  minutes: number;
  detail: string;
}): PiRuntimeGatewayA2UiPayload {
  return {
    kind: 'automation-status',
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

export function buildInterruptArtifact(params: {
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

export function buildInterruptA2Ui(params: {
  artifactId: string;
  message: string;
}): PiRuntimeGatewayA2UiPayload {
  return {
    kind: 'interrupt',
    payload: {
      type: 'operator-config-request',
      artifactId: params.artifactId,
      message: params.message,
      inputLabel: 'Operator note',
      submitLabel: 'Continue agent loop',
    },
  };
}

export function applyAutomationStatusUpdate(params: {
  runtimeState: PiExampleRuntimeStateStore;
  threadKey: string;
  artifactId: string;
  automationId: string;
  executionId?: string;
  activityRunId: string;
  status: AutomationStatus;
  command: string;
  minutes: number;
  detail: string;
  emitConnectUpdate?: boolean;
}): PiRuntimeGatewayThreadProjection {
  const artifact = buildAutomationArtifact({
    artifactId: params.artifactId,
    automationId: params.automationId,
    runId: params.activityRunId,
    status: params.status,
    command: params.command,
    minutes: params.minutes,
    detail: params.detail,
  });

  const applyUpdate = (
    projection: PiRuntimeGatewayThreadProjection,
  ): PiRuntimeGatewayThreadProjection => {
    const executionId = params.executionId ?? projection.execution.id;
    const a2ui = buildAutomationA2Ui({
      automationId: params.automationId,
      runId: params.activityRunId,
      status: params.status,
      command: params.command,
      minutes: params.minutes,
      detail: params.detail,
    });

    return appendProjectionActivityEvents(
      {
        ...projection,
        execution: {
          ...projection.execution,
          id: executionId,
          status: mapAutomationStatusToExecutionStatus(params.status),
          statusMessage: params.detail,
        },
        automation: {
          id: params.automationId,
          runId: params.activityRunId,
        },
        currentArtifact: artifact,
        activityArtifact: artifact,
        a2ui,
      },
      [
        buildArtifactActivityEvent(artifact),
        buildPiA2UiActivityEvent({
          threadId: projection.threadId,
          executionId,
          payload: a2ui,
        }),
      ],
    );
  };

  if (params.emitConnectUpdate) {
    const nextProjection = params.runtimeState.updateProjection(params.threadKey, applyUpdate);
    void params.runtimeState.publishAttachedEventSource(
      params.threadKey,
      buildPiRuntimeGatewayConnectEvents({
        threadId: params.threadKey,
        runId: params.activityRunId,
        projection: nextProjection,
      }),
    );
    return nextProjection;
  }

  return params.runtimeState.updateProjection(params.threadKey, applyUpdate);
}

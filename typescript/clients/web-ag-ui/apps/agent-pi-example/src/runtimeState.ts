import {
  buildPiA2UiActivityEvent,
  type PiRuntimeGatewayA2UiPayload,
  type PiRuntimeGatewayArtifact,
  type PiRuntimeGatewayActivityEvent,
  type PiRuntimeGatewaySession,
} from 'agent-runtime';

const MAX_CONNECT_UPDATES = 100;

function buildDefaultSession(threadKey: string): PiRuntimeGatewaySession {
  return {
    thread: { id: threadKey },
    execution: {
      id: `pi-example:${threadKey}`,
      status: 'working',
      statusMessage: 'Ready for a live Pi-native conversation.',
    },
    messages: [],
    activityEvents: [],
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

export type PiExampleRuntimeConnectUpdate = {
  revision: number;
  runId: string;
  session: PiRuntimeGatewaySession;
};

type PiExampleRuntimeStateEntry = {
  session: PiRuntimeGatewaySession;
  latestConnectRevision: number;
  connectUpdates: PiExampleRuntimeConnectUpdate[];
};

export type PiExampleRuntimeStateStore = {
  getSession: (threadKey: string) => PiRuntimeGatewaySession;
  updateSession: (
    threadKey: string,
    update: (session: PiRuntimeGatewaySession) => PiRuntimeGatewaySession,
  ) => PiRuntimeGatewaySession;
  recordConnectUpdate: (
    threadKey: string,
    runId: string,
    update: (session: PiRuntimeGatewaySession) => PiRuntimeGatewaySession,
  ) => PiRuntimeGatewaySession;
  listConnectUpdates: (threadKey: string, afterRevision: number) => readonly PiExampleRuntimeConnectUpdate[];
  getLatestConnectRevision: (threadKey: string) => number;
  resumeFromUserInput: (threadKey: string) => PiRuntimeGatewaySession;
};

type AutomationStatus = 'scheduled' | 'running' | 'completed';

function mapAutomationStatusToExecutionStatus(
  status: AutomationStatus,
): PiRuntimeGatewaySession['execution']['status'] {
  switch (status) {
    case 'scheduled':
      return 'queued';
    case 'running':
      return 'working';
    case 'completed':
      return 'completed';
  }
}

export function createPiExampleRuntimeStateStore(): PiExampleRuntimeStateStore {
  const sessions = new Map<string, PiExampleRuntimeStateEntry>();

  const getEntry = (threadKey: string): PiExampleRuntimeStateEntry => {
    const existing = sessions.get(threadKey);
    if (existing) {
      return existing;
    }

    const created: PiExampleRuntimeStateEntry = {
      session: buildDefaultSession(threadKey),
      latestConnectRevision: 0,
      connectUpdates: [],
    };
    sessions.set(threadKey, created);
    return created;
  };

  const getSession = (threadKey: string): PiRuntimeGatewaySession => {
    return getEntry(threadKey).session;
  };

  return {
    getSession,
    updateSession: (threadKey, update) => {
      const entry = getEntry(threadKey);
      const nextSession = update(entry.session);
      entry.session = nextSession;
      sessions.set(threadKey, entry);
      return nextSession;
    },
    recordConnectUpdate: (threadKey, runId, update) => {
      const entry = getEntry(threadKey);
      const nextSession = update(entry.session);
      const nextRevision = entry.latestConnectRevision + 1;
      sessions.set(threadKey, {
        session: nextSession,
        latestConnectRevision: nextRevision,
        connectUpdates: [
          ...entry.connectUpdates,
          {
            revision: nextRevision,
            runId,
            session: structuredClone(nextSession),
          },
        ].slice(-MAX_CONNECT_UPDATES),
      });
      return nextSession;
    },
    listConnectUpdates: (threadKey, afterRevision) => {
      return getEntry(threadKey).connectUpdates.filter((update) => update.revision > afterRevision);
    },
    getLatestConnectRevision: (threadKey) => {
      return getEntry(threadKey).latestConnectRevision;
    },
    resumeFromUserInput: (threadKey) => {
      const current = getSession(threadKey);
      if (current.execution.status !== 'interrupted') {
        return current;
      }

      const resolvedArtifact = current.artifacts?.current
        ? {
            artifactId: current.artifacts.current.artifactId,
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
        artifacts: current.artifacts
          ? {
              ...current.artifacts,
              current: resolvedArtifact,
              activity: current.artifacts.activity,
            }
          : undefined,
        a2ui: undefined,
      };
      const nextSession = resolvedArtifact
        ? appendSessionActivityEvents(resumed, [buildArtifactActivityEvent(resolvedArtifact)])
        : resumed;
      const entry = getEntry(threadKey);
      entry.session = nextSession;
      sessions.set(threadKey, entry);
      return nextSession;
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

  const applyUpdate = (session: PiRuntimeGatewaySession): PiRuntimeGatewaySession => {
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
        buildPiA2UiActivityEvent({
          threadId: session.thread.id,
          executionId,
          payload: a2ui,
        }),
      ],
    );
  };

  if (params.emitConnectUpdate) {
    return params.runtimeState.recordConnectUpdate(params.threadKey, params.activityRunId, applyUpdate);
  }

  return params.runtimeState.updateSession(params.threadKey, applyUpdate);
}

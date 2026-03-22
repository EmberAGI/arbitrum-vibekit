import type { PiRuntimeGatewayA2UiPayload, PiRuntimeGatewayArtifact, PiRuntimeGatewaySession } from 'agent-runtime';

function buildDefaultSession(threadKey: string): PiRuntimeGatewaySession {
  return {
    thread: { id: threadKey },
    execution: {
      id: `pi-example:${threadKey}`,
      status: 'working',
      statusMessage: 'Ready for a live Pi-native conversation.',
    },
  };
}

export type PiExampleRuntimeStateStore = {
  getSession: (threadKey: string) => PiRuntimeGatewaySession;
  updateSession: (
    threadKey: string,
    update: (session: PiRuntimeGatewaySession) => PiRuntimeGatewaySession,
  ) => PiRuntimeGatewaySession;
  resumeFromUserInput: (threadKey: string) => PiRuntimeGatewaySession;
};

export function createPiExampleRuntimeStateStore(): PiExampleRuntimeStateStore {
  const sessions = new Map<string, PiRuntimeGatewaySession>();

  const getSession = (threadKey: string): PiRuntimeGatewaySession => {
    const existing = sessions.get(threadKey);
    if (existing) {
      return existing;
    }

    const created = buildDefaultSession(threadKey);
    sessions.set(threadKey, created);
    return created;
  };

  return {
    getSession,
    updateSession: (threadKey, update) => {
      const next = update(getSession(threadKey));
      sessions.set(threadKey, next);
      return next;
    },
    resumeFromUserInput: (threadKey) => {
      const current = getSession(threadKey);
      if (current.execution.status !== 'interrupted') {
        return current;
      }

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
              current: current.artifacts.current
                ? {
                    artifactId: current.artifacts.current.artifactId,
                    data: {
                      type: 'interrupt-status',
                      status: 'resolved',
                    },
                  }
                : undefined,
              activity: current.artifacts.activity,
            }
          : undefined,
        a2ui: undefined,
      };

      sessions.set(threadKey, resumed);
      return resumed;
    },
  };
}

export function buildAutomationArtifact(params: {
  artifactId: string;
  automationId: string;
  runId: string;
  status: 'scheduled' | 'running' | 'completed';
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
  status: 'scheduled' | 'running' | 'completed';
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

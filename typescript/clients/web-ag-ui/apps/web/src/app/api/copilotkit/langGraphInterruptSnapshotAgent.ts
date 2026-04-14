import type { State } from '@ag-ui/langgraph';
import { LangGraphAgent as CopilotKitLangGraphAgent } from '@copilotkit/runtime/langgraph';

type LangGraphAgentConfig = ConstructorParameters<typeof CopilotKitLangGraphAgent>[0];
type LangGraphThreadState = Parameters<CopilotKitLangGraphAgent['getStateSnapshot']>[0];
type LangGraphStateSnapshot = State & { tasks?: LangGraphThreadState['tasks'] };
type PrepareStreamInput = Parameters<CopilotKitLangGraphAgent['prepareStream']>[0];
type PrepareStreamMode = Parameters<CopilotKitLangGraphAgent['prepareStream']>[1];
type PrepareStreamResult = Awaited<ReturnType<CopilotKitLangGraphAgent['prepareStream']>>;

type PendingWorkflowCommandEnvelope = {
  command: string;
  clientMutationId?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readInterruptTypesFromState(state: LangGraphThreadState | undefined): string[] {
  if (!state || !Array.isArray(state.tasks)) return [];
  return state.tasks.flatMap((task) =>
    Array.isArray(task.interrupts)
      ? task.interrupts.flatMap((interrupt) => {
          const value = interrupt?.value;
          if (typeof value === 'string' && value.length > 0) return [value];
          if (isRecord(value) && typeof value.type === 'string' && value.type.length > 0) {
            return [value.type];
          }
          return [];
        })
      : [],
  );
}

function readResumeShape(input: PrepareStreamInput): {
  hasResume: boolean;
  resumeType: string;
  resumePreview?: string;
  commandKeys: string[];
} {
  const command = isRecord(input.forwardedProps?.command) ? input.forwardedProps.command : undefined;
  const resume = command?.resume;

  if (typeof resume === 'string') {
    return {
      hasResume: true,
      resumeType: 'string',
      resumePreview: resume.slice(0, 240),
      commandKeys: command ? Object.keys(command) : [],
    };
  }

  if (isRecord(resume)) {
    return {
      hasResume: true,
      resumeType: 'object',
      resumePreview: JSON.stringify(resume).slice(0, 240),
      commandKeys: command ? Object.keys(command) : [],
    };
  }

  return {
    hasResume: false,
    resumeType: typeof resume,
    commandKeys: command ? Object.keys(command) : [],
  };
}

function translateNamedWorkflowCommand(command: Record<string, unknown>): Record<string, unknown> | null {
  const name = readString(command.name);
  if (!name) {
    return null;
  }

  const pendingCommand: PendingWorkflowCommandEnvelope = {
    command: name,
  };
  const clientMutationId = readString(command.clientMutationId);
  if (clientMutationId) {
    pendingCommand.clientMutationId = clientMutationId;
  }

  return {
    update: {
      private: {
        pendingCommand,
      },
    },
  };
}

function translatePrepareStreamInput(input: PrepareStreamInput): PrepareStreamInput {
  const forwardedProps = isRecord(input.forwardedProps) ? input.forwardedProps : null;
  const command = forwardedProps && isRecord(forwardedProps.command) ? forwardedProps.command : null;
  if (!command) {
    return input;
  }

  if (Object.prototype.hasOwnProperty.call(command, 'resume') || Object.prototype.hasOwnProperty.call(command, 'update')) {
    return input;
  }

  const translatedCommand = translateNamedWorkflowCommand(command);
  if (!translatedCommand) {
    return input;
  }

  return {
    ...input,
    forwardedProps: {
      ...forwardedProps,
      command: translatedCommand,
    },
  };
}

export class LangGraphInterruptSnapshotAgent extends CopilotKitLangGraphAgent {
  constructor(config: LangGraphAgentConfig) {
    super(config);
  }

  override clone(): LangGraphInterruptSnapshotAgent {
    return new LangGraphInterruptSnapshotAgent(this.config);
  }

  override getStateSnapshot(threadState: LangGraphThreadState): LangGraphStateSnapshot {
    const snapshot = super.getStateSnapshot(threadState) as LangGraphStateSnapshot;

    if (!Array.isArray(threadState.tasks) || threadState.tasks.length === 0) {
      return snapshot;
    }

    return {
      ...snapshot,
      tasks: threadState.tasks,
    };
  }

  override async prepareStream(
    input: PrepareStreamInput,
    streamMode: PrepareStreamMode,
  ): Promise<PrepareStreamResult> {
    const translatedInput = translatePrepareStreamInput(input);
    const beforeState = input.threadId ? await this.client.threads.getState(input.threadId).catch(() => undefined) : undefined;
    const resumeShape = readResumeShape(translatedInput);

    console.warn('[langgraph-resume-trace] prepareStream start', {
      agentName: this.agentName,
      graphId: this.graphId,
      threadId: input.threadId,
      runId: input.runId,
      streamMode,
      hasResume: resumeShape.hasResume,
      resumeType: resumeShape.resumeType,
      resumePreview: resumeShape.resumePreview,
      commandKeys: resumeShape.commandKeys,
      persistedInterruptTypes: readInterruptTypesFromState(beforeState),
    });

    const result = await super.prepareStream(translatedInput, streamMode);

    console.warn('[langgraph-resume-trace] prepareStream result', {
      agentName: this.agentName,
      graphId: this.graphId,
      threadId: input.threadId,
      runId: input.runId,
      outcome: result ? 'stream' : 'short-circuit',
      persistedInterruptTypes: readInterruptTypesFromState(beforeState),
    });

    return result;
  }
}

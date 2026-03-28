import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Message,
  type Model,
} from '@mariozechner/pi-ai';
import { describe, expect, it } from 'vitest';

import {
  AGENT_RUNTIME_DOMAIN_COMMAND_TOOL,
  createAgentRuntime,
  type PiRuntimeGatewayInspectionState,
  type PiRuntimeGatewaySession,
  type PiRuntimeGatewayService,
} from './index.js';

type SessionStore = {
  getSession: (threadId: string) => PiRuntimeGatewaySession;
  updateSession: (
    threadId: string,
    update: (session: PiRuntimeGatewaySession) => PiRuntimeGatewaySession,
  ) => PiRuntimeGatewaySession;
};

type GatewayEvent = Awaited<ReturnType<PiRuntimeGatewayService['run']>> extends
  | readonly (infer TEvent)[]
  | AsyncIterable<infer TEvent>
  ? TEvent
  : never;
type StateSnapshotEvent = Extract<GatewayEvent, { snapshot: unknown }>;

type LifecycleState = {
  phase: string;
  onboardingStep: string | null;
  operatorNote: string | null;
};

function createModel(id: string): Model<'openai-responses'> {
  return {
    id,
    name: id,
    api: 'openai-responses',
    provider: 'openai',
    baseUrl: 'https://example.invalid',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 2048,
  };
}

function createUsage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function createAssistantMessage(params: {
  content: AssistantMessage['content'];
  stopReason: 'stop' | 'toolUse';
}): AssistantMessage {
  return {
    role: 'assistant',
    content: params.content,
    api: 'openai-responses',
    provider: 'openai',
    model: 'mock-model',
    usage: createUsage(),
    stopReason: params.stopReason,
    timestamp: Date.now(),
  };
}

function createToolStream(params: {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
}) {
  const stream = createAssistantMessageEventStream();

  queueMicrotask(() => {
    const message = createAssistantMessage({
      content: [
        {
          type: 'toolCall',
          id: params.toolCallId,
          name: params.toolName,
          arguments: params.args,
        },
      ],
      stopReason: 'toolUse',
    });
    const argsJson = JSON.stringify(params.args);

    stream.push({
      type: 'start',
      partial: createAssistantMessage({
        content: [],
        stopReason: 'toolUse',
      }),
    });
    stream.push({ type: 'toolcall_start', contentIndex: 0, partial: message });
    stream.push({ type: 'toolcall_delta', contentIndex: 0, delta: argsJson, partial: message });
    stream.push({
      type: 'toolcall_end',
      contentIndex: 0,
      toolCall: {
        type: 'toolCall',
        id: params.toolCallId,
        name: params.toolName,
        arguments: params.args,
      },
      partial: message,
    });
    stream.push({ type: 'done', reason: 'toolUse', message });
  });

  return stream;
}

function createTextStream(text: string) {
  const stream = createAssistantMessageEventStream();

  queueMicrotask(() => {
    const message = createAssistantMessage({
      content: [{ type: 'text', text }],
      stopReason: 'stop',
    });

    stream.push({
      type: 'start',
      partial: createAssistantMessage({
        content: [],
        stopReason: 'stop',
      }),
    });
    stream.push({ type: 'text_start', contentIndex: 0, partial: message });
    stream.push({ type: 'text_delta', contentIndex: 0, delta: text, partial: message });
    stream.push({ type: 'text_end', contentIndex: 0, content: text, partial: message });
    stream.push({ type: 'done', reason: 'stop', message });
  });

  return stream;
}

async function collectEventSource<T>(source: readonly T[] | AsyncIterable<T>): Promise<T[]> {
  if (Array.isArray(source)) {
    return Array.from(source);
  }

  const events: T[] = [];
  for await (const event of source) {
    events.push(event);
  }
  return events;
}

function isStateSnapshotEvent(event: GatewayEvent): event is StateSnapshotEvent {
  return typeof event === 'object' && event !== null && 'snapshot' in event;
}

function createSessionStore(): SessionStore {
  const sessions = new Map<string, PiRuntimeGatewaySession>();

  const getSession = (threadId: string): PiRuntimeGatewaySession => {
    const existing = sessions.get(threadId);
    if (existing) {
      return existing;
    }

    const created: PiRuntimeGatewaySession = {
      thread: { id: threadId },
      execution: {
        id: `exec:${threadId}`,
        status: 'working',
        statusMessage: 'Ready for integration testing.',
      },
      messages: [],
      activityEvents: [],
    };
    sessions.set(threadId, created);
    return created;
  };

  return {
    getSession,
    updateSession: (threadId, update) => {
      const nextSession = update(getSession(threadId));
      sessions.set(threadId, nextSession);
      return nextSession;
    },
  };
}

function createLifecycleDomain() {
  const phases = new Map<string, LifecycleState>();

  const getState = (threadId: string) =>
    phases.get(threadId) ?? {
      phase: 'prehire',
      onboardingStep: null,
      operatorNote: null,
    };

  return {
    lifecycle: {
      initialPhase: 'prehire',
      phases: ['prehire', 'onboarding', 'hired', 'fired'],
      terminalPhases: ['fired'],
      commands: [
        { name: 'hire', description: 'Start onboarding.' },
        { name: 'continue_onboarding', description: 'Capture onboarding input.' },
        { name: 'complete_onboarding', description: 'Finish onboarding.' },
        { name: 'fire', description: 'End the lifecycle.' },
      ],
      transitions: [
        {
          command: 'hire',
          from: ['prehire'],
          to: 'onboarding',
          description: 'Move into onboarding.',
          interrupt: 'operator-config',
        },
        {
          command: 'continue_onboarding',
          from: ['onboarding'],
          to: 'onboarding',
          description: 'Continue onboarding.',
        },
      ],
      interrupts: [
        {
          type: 'operator-config',
          description: 'Capture an operator note.',
          surfacedInThread: true,
        },
      ],
    },
    systemContext: ({ threadId }: { threadId: string; session: PiRuntimeGatewaySession }) => {
      const state = getState(threadId);
      return [`Lifecycle phase: ${state.phase}.`];
    },
    handleOperation: ({
      operation,
      threadId,
    }: {
      operation: { source: 'command' | 'tool' | 'interrupt'; name: string; input?: unknown };
      threadId: string;
      session: PiRuntimeGatewaySession;
    }) => {
      const current = getState(threadId);

      switch (operation.name) {
        case 'hire': {
          const nextState = {
            phase: 'onboarding',
            onboardingStep: 'operator-profile',
            operatorNote: null,
          };
          phases.set(threadId, nextState);
          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'interrupted' as const,
                statusMessage: 'Please provide a short operator note to continue onboarding.',
              },
              interrupt: {
                type: 'operator-config',
                surfacedInThread: true,
                message: 'Please provide a short operator note to continue onboarding.',
              },
              threadPatch: {
                lifecycle: {
                  phase: nextState.phase,
                  onboardingStep: nextState.onboardingStep,
                },
              },
            },
          };
        }
        case 'operator-config': {
          const operatorNote =
            typeof operation.input === 'object' &&
            operation.input !== null &&
            'operatorNote' in operation.input &&
            typeof operation.input.operatorNote === 'string'
              ? operation.input.operatorNote
              : current.operatorNote;
          const nextState = {
            phase: 'onboarding',
            onboardingStep: 'delegation-note',
            operatorNote: operatorNote ?? null,
          };
          phases.set(threadId, nextState);
          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'working' as const,
                statusMessage: 'Operator note captured. Ready to complete onboarding.',
              },
              artifacts: [
                {
                  data: {
                    type: 'lifecycle-status',
                    phase: nextState.phase,
                    onboardingStep: nextState.onboardingStep,
                    operatorNote: nextState.operatorNote,
                  },
                },
              ],
              threadPatch: {
                lifecycle: {
                  phase: nextState.phase,
                  onboardingStep: nextState.onboardingStep,
                  operatorNote: nextState.operatorNote,
                },
              },
            },
          };
        }
        default:
          return { state: current, outputs: {} };
      }
    },
  };
}

describe('agent-runtime integration', () => {
  it('normalizes tool-driven lifecycle commands and interrupt resumes through the root builder service', async () => {
    const sessions = createSessionStore();
    let currentThreadId = 'thread-1';
    let latestUserText = '';

    const domain = createLifecycleDomain();
    const runtime = createAgentRuntime({
      model: createModel('int-model'),
      systemPrompt: 'You are a lifecycle agent.',
      sessions,
      getSessionContext: () => sessions.getSession(currentThreadId),
      controlPlane: {
        loadInspectionState: (): Promise<PiRuntimeGatewayInspectionState> =>
          Promise.resolve({
          threads: [],
          executions: [],
          automations: [],
          automationRuns: [],
          interrupts: [],
          leases: [],
          outboxIntents: [],
          executionEvents: [],
          threadActivities: [],
          }),
      },
      domain,
      agentOptions: {
        streamFn: (_model, context) => {
          const latestToolResult = [...context.messages]
            .reverse()
            .find((message: Message) => message.role === 'toolResult');

          if (latestToolResult) {
            return createTextStream('Onboarding started.');
          }

          latestUserText = [...context.messages]
            .reverse()
            .map((message: Message) =>
              message.role === 'user'
                ? typeof message.content === 'string'
                  ? message.content
                  : message.content
                      .filter((part) => part.type === 'text')
                      .map((part) => part.text)
                      .join(' ')
                : '',
            )
            .find((value) => value.trim().length > 0 && !value.startsWith('<')) ?? '';

          return createToolStream({
            toolName: AGENT_RUNTIME_DOMAIN_COMMAND_TOOL,
            toolCallId: 'tool-hire',
            args: {
              name: 'hire',
              inputJson: '{}',
            },
          });
        },
      },
    });

    const hireEvents = await collectEventSource(
      await runtime.service.run({
        threadId: 'thread-1',
        runId: 'run-hire',
        messages: [
          {
            id: 'message-1',
            role: 'user',
            content: 'Please hire the agent.',
          },
        ],
      }),
    );

    const hireSnapshot = hireEvents.find(isStateSnapshotEvent);
    expect(latestUserText).toBe('Please hire the agent.');
    expect(hireSnapshot).toBeDefined();
    expect(hireSnapshot!.snapshot.thread.lifecycle).toMatchObject({
      phase: 'onboarding',
      onboardingStep: 'operator-profile',
    });
    expect(hireSnapshot!.snapshot.thread.task?.taskStatus).toMatchObject({
      state: 'input-required',
      message: 'Please provide a short operator note to continue onboarding.',
    });

    currentThreadId = 'thread-1';
    const resumeEvents = await collectEventSource(
      await runtime.service.run({
        threadId: 'thread-1',
        runId: 'run-resume',
        forwardedProps: {
          command: {
            resume: '{"operatorNote":"safe window approved"}',
          },
        },
      }),
    );

    const resumeSnapshot = resumeEvents.find(isStateSnapshotEvent);

    expect(resumeSnapshot).toBeDefined();
    expect(resumeSnapshot!.snapshot.thread.lifecycle).toMatchObject({
      phase: 'onboarding',
      onboardingStep: 'delegation-note',
      operatorNote: 'safe window approved',
    });
    expect(resumeSnapshot!.snapshot.thread.task?.taskStatus).toMatchObject({
      state: 'working',
      message: 'Operator note captured. Ready to complete onboarding.',
    });
    expect(resumeSnapshot!.snapshot.thread.artifacts?.current?.data).toMatchObject({
      type: 'lifecycle-status',
      onboardingStep: 'delegation-note',
      operatorNote: 'safe window approved',
    });
  });
});

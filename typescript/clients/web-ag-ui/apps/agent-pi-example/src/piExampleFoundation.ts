import { createAssistantMessageEventStream, type Message } from '@mariozechner/pi-ai';
import {
  AGENT_RUNTIME_AUTOMATION_CANCEL_TOOL,
  AGENT_RUNTIME_AUTOMATION_LIST_TOOL,
  AGENT_RUNTIME_AUTOMATION_SCHEDULE_TOOL,
  AGENT_RUNTIME_DOMAIN_COMMAND_TOOL,
  AGENT_RUNTIME_REQUEST_OPERATOR_INPUT_TOOL,
  type AgentRuntimeDomainConfig,
  type CreateAgentRuntimeOptions,
} from 'agent-runtime';

const DEFAULT_PI_AGENT_MODEL = 'openai/gpt-5.4-mini';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const PI_EXAMPLE_SYSTEM_PROMPT =
  'You are the golden agent-runtime integration example. Respond clearly, track the current hiring lifecycle, and prefer short direct answers unless the user asks for more depth.';

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
} as const;

type PiExampleGatewayEnv = NodeJS.ProcessEnv & {
  OPENROUTER_API_KEY?: string;
  PI_AGENT_MODEL?: string;
  DATABASE_URL?: string;
  E2E_PROFILE?: string;
  PI_AGENT_EXTERNAL_BOUNDARY_MODE?: string;
};

export type { PiExampleGatewayEnv };

type PiExampleAgentRuntimeOptions = CreateAgentRuntimeOptions<PiExampleLifecycleState>;
export type PiExampleAgentConfig = Pick<
  PiExampleAgentRuntimeOptions,
  'agentOptions' | 'databaseUrl' | 'domain' | 'model' | 'systemPrompt' | 'tools'
>;

type PiExampleGatewayModel = PiExampleAgentConfig['model'];
type PiExampleGatewayStream = NonNullable<NonNullable<PiExampleAgentConfig['agentOptions']>['streamFn']>;
type PiExampleGatewayStreamModel = Parameters<PiExampleGatewayStream>[0];
type PiExampleGatewayStreamContext = Parameters<PiExampleGatewayStream>[1];

const PI_EXAMPLE_PHASES = ['prehire', 'onboarding', 'hired', 'fired'] as const;
const PI_EXAMPLE_COMMANDS = ['hire', 'continue_onboarding', 'complete_onboarding', 'fire'] as const;

type PiExampleLifecyclePhase = (typeof PI_EXAMPLE_PHASES)[number];

type PiExampleLifecycleState = {
  phase: PiExampleLifecyclePhase;
  onboardingStep: 'operator-profile' | 'delegation-note' | null;
  operatorNote: string | null;
};

type PiExampleDomainConfig = AgentRuntimeDomainConfig<PiExampleLifecycleState>;

function buildDefaultLifecycleState(): PiExampleLifecycleState {
  return {
    phase: 'prehire',
    onboardingStep: null,
    operatorNote: null,
  };
}

function describePiExampleLifecycleCommand(
  command: (typeof PI_EXAMPLE_COMMANDS)[number],
): string {
  switch (command) {
    case 'hire':
      return 'Move the agent into onboarding and request the operator note, including after a prior firing.';
    case 'continue_onboarding':
      return 'Keep onboarding active while collecting the remaining operator input.';
    case 'complete_onboarding':
      return 'Finish onboarding and promote the agent into the hired phase.';
    case 'fire':
      return 'Move the agent into fired while keeping the thread available for a later rehire.';
  }
}

function createPiExampleDomain(): PiExampleDomainConfig {
  return {
    lifecycle: {
      initialPhase: 'prehire',
      phases: PI_EXAMPLE_PHASES,
      terminalPhases: [],
      commands: PI_EXAMPLE_COMMANDS.map((name) => ({
        name,
        description: describePiExampleLifecycleCommand(name),
      })),
      transitions: [
        {
          command: 'hire',
          from: ['prehire', 'fired'],
          to: 'onboarding',
          description: 'Start onboarding and request the operator profile note, including rehiring from fired.',
          interrupt: 'operator-config',
        },
        {
          command: 'continue_onboarding',
          from: ['onboarding'],
          to: 'onboarding',
          description: 'Keep onboarding open until the required operator note is supplied.',
        },
        {
          command: 'complete_onboarding',
          from: ['onboarding'],
          to: 'hired',
          description: 'Promote the agent into the hired phase once onboarding is satisfied.',
        },
        {
          command: 'fire',
          from: ['prehire', 'onboarding', 'hired'],
          to: 'fired',
          description: 'Move the golden-example lifecycle into fired without closing the thread permanently.',
        },
      ],
      interrupts: [
        {
          type: 'operator-config',
          description: 'Collect the operator note required during onboarding.',
          surfacedInThread: true,
        },
      ],
    },
    systemContext: ({ state }) => {
      const currentState = state ?? buildDefaultLifecycleState();
      const context = [`Lifecycle phase: ${currentState.phase}.`];

      if (currentState.phase === 'onboarding' && currentState.onboardingStep) {
        context.push(`Onboarding step: ${currentState.onboardingStep}.`);
      }

      if (currentState.operatorNote) {
        context.push(`Operator note captured: ${currentState.operatorNote}.`);
      }

      return context;
    },
    handleOperation: ({ operation, state }) => {
      const current = state ?? buildDefaultLifecycleState();
      const buildLifecycleArtifact = (state: PiExampleLifecycleState) => ({
        data: {
          type: 'lifecycle-status',
          phase: state.phase,
          ...(state.onboardingStep ? { onboardingStep: state.onboardingStep } : {}),
          ...(state.operatorNote ? { operatorNote: state.operatorNote } : {}),
        },
      });

      switch (operation.name) {
        case 'hire': {
          const message = 'Please provide a short operator note to continue onboarding.';
          const nextState: PiExampleLifecycleState = {
            phase: 'onboarding',
            onboardingStep: 'operator-profile',
            operatorNote: null,
          };
          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'interrupted',
                statusMessage: message,
              },
              artifacts: [buildLifecycleArtifact(nextState)],
              interrupt: {
                type: 'operator-config',
                surfacedInThread: true,
                message,
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
          const nextState: PiExampleLifecycleState = {
            phase: 'onboarding',
            onboardingStep: 'delegation-note',
            operatorNote: operatorNote ?? null,
          };
          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'working',
                statusMessage: 'Operator note captured. Ready to complete onboarding.',
              },
              artifacts: [buildLifecycleArtifact(nextState)],
            },
          };
        }
        case 'complete_onboarding': {
          const nextState: PiExampleLifecycleState = {
            phase: 'hired',
            onboardingStep: null,
            operatorNote: current.operatorNote,
          };
          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'completed',
                statusMessage: 'Onboarding complete. Agent is now hired.',
              },
              artifacts: [buildLifecycleArtifact(nextState)],
            },
          };
        }
        case 'fire': {
          const nextState: PiExampleLifecycleState = {
            phase: 'fired',
            onboardingStep: null,
            operatorNote: current.operatorNote,
          };
          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'completed',
                statusMessage: 'Agent moved to fired. Rehire is still available in this thread.',
              },
              artifacts: [buildLifecycleArtifact(nextState)],
            },
          };
        }
        default:
          return {
            state: current,
            outputs: {},
          };
      }
    },
  };
}

function requireEnvValue(value: string | undefined, name: keyof PiExampleGatewayEnv): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return normalized;
}

function createOpenRouterModel(modelId: string): PiExampleGatewayModel {
  return {
    id: modelId,
    name: modelId,
    api: 'openai-responses',
    provider: 'openrouter',
    baseUrl: OPENROUTER_BASE_URL,
    reasoning: true,
    input: ['text'],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 128_000,
    maxTokens: 4_096,
  };
}

function isMockedExternalBoundary(env: PiExampleGatewayEnv): boolean {
  return (
    env.E2E_PROFILE?.trim().toLowerCase() === 'mocked' ||
    env.PI_AGENT_EXTERNAL_BOUNDARY_MODE?.trim().toLowerCase() === 'mocked'
  );
}

function getUserText(message: Message): string {
  if (message.role !== 'user') {
    return '';
  }

  if (typeof message.content === 'string') {
    return message.content;
  }

  return message.content
    .filter((part): part is Extract<Message['content'][number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join(' ');
}

function isPiRuntimeContextText(value: string): boolean {
  return value.startsWith('<pi-runtime-gateway>') && value.endsWith('</pi-runtime-gateway>');
}

function isMeaningfulContextMessage(message: Message): boolean {
  if (message.role === 'toolResult') {
    return true;
  }

  const text = getUserText(message).trim();
  return !isPiRuntimeContextText(text);
}

function splitText(text: string): string[] {
  const midpoint = Math.max(1, Math.floor(text.length / 2));
  return [text.slice(0, midpoint), text.slice(midpoint)].filter((chunk) => chunk.length > 0);
}

function createAssistantMessage(params: {
  model: PiExampleGatewayModel;
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'thinking'; thinking: string }
    | { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> }
  >;
  stopReason: 'stop' | 'toolUse';
}) {
  return {
    role: 'assistant' as const,
    content: params.content,
    api: params.model.api,
    provider: params.model.provider,
    model: params.model.id,
    usage: EMPTY_USAGE,
    stopReason: params.stopReason,
    timestamp: Date.now(),
  };
}

function createMockTextStream(params: {
  model: PiExampleGatewayModel;
  text: string;
  reasoning: string;
}): ReturnType<typeof createAssistantMessageEventStream> {
  const stream = createAssistantMessageEventStream();

  queueMicrotask(() => {
    const message = createAssistantMessage({
      model: params.model,
      content: [{ type: 'text', text: params.text }],
      stopReason: 'stop',
    });

    stream.push({
      type: 'start',
      partial: createAssistantMessage({
        model: params.model,
        content: [],
        stopReason: 'stop',
      }),
    });
    stream.push({ type: 'thinking_start', contentIndex: 0, partial: message });
    stream.push({ type: 'thinking_delta', contentIndex: 0, delta: params.reasoning, partial: message });
    stream.push({ type: 'thinking_end', contentIndex: 0, content: params.reasoning, partial: message });
    stream.push({ type: 'text_start', contentIndex: 0, partial: message });
    for (const chunk of splitText(params.text)) {
      stream.push({ type: 'text_delta', contentIndex: 0, delta: chunk, partial: message });
    }
    stream.push({ type: 'text_end', contentIndex: 0, content: params.text, partial: message });
    stream.push({ type: 'done', reason: 'stop', message });
  });

  return stream;
}

function createMockToolStream(params: {
  model: PiExampleGatewayModel;
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
  reasoning: string;
}): ReturnType<typeof createAssistantMessageEventStream> {
  const stream = createAssistantMessageEventStream();

  queueMicrotask(() => {
    const message = createAssistantMessage({
      model: params.model,
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
        model: params.model,
        content: [],
        stopReason: 'toolUse',
      }),
    });
    stream.push({ type: 'thinking_start', contentIndex: 0, partial: message });
    stream.push({ type: 'thinking_delta', contentIndex: 0, delta: params.reasoning, partial: message });
    stream.push({ type: 'thinking_end', contentIndex: 0, content: params.reasoning, partial: message });
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

function createPiExampleMockStream(): PiExampleGatewayStream {
  return ((model: PiExampleGatewayStreamModel, context: PiExampleGatewayStreamContext) => {
    const latestMessage = [...context.messages].reverse().find(isMeaningfulContextMessage);

    if (latestMessage?.role === 'toolResult') {
      const toolResultText = latestMessage.content
        .filter((part): part is Extract<typeof latestMessage.content[number], { type: 'text' }> => part.type === 'text')
        .map((part) => part.text)
        .join(' ');
      return createMockTextStream({
        model,
        text: `Tool ${latestMessage.toolName} completed. ${toolResultText}`.trim(),
        reasoning: `Summarizing the ${latestMessage.toolName} result for the user.`,
      });
    }

    const latestUserText = [...context.messages]
      .reverse()
      .map(getUserText)
      .find((value) => {
        const trimmed = value.trim();
        return trimmed.length > 0 && !isPiRuntimeContextText(trimmed);
      })
      ?.trim()
      .toLowerCase();

    if (!latestUserText) {
      return createMockTextStream({
        model,
        text: 'Pi example mocked response.',
        reasoning: 'Providing the default mocked Pi response.',
      });
    }

    if (latestUserText.includes('cancel') || latestUserText.includes('stop automation')) {
      return createMockToolStream({
        model,
        toolName: AGENT_RUNTIME_AUTOMATION_CANCEL_TOOL,
        toolCallId: 'pi-example-tool-cancel',
        args: { automationId: 'automation:thread-1' },
        reasoning: 'Canceling the saved automation the user no longer wants running.',
      });
    }

    if (latestUserText.includes('list') && latestUserText.includes('automation')) {
      return createMockToolStream({
        model,
        toolName: AGENT_RUNTIME_AUTOMATION_LIST_TOOL,
        toolCallId: 'pi-example-tool-list',
        args: { state: 'active', limit: 20 },
        reasoning: 'Listing saved automations so the user can inspect the current schedule state.',
      });
    }

    if (latestUserText.includes('schedule') || latestUserText.includes('"command":"sync"')) {
      return createMockToolStream({
        model,
        toolName: AGENT_RUNTIME_AUTOMATION_SCHEDULE_TOOL,
        toolCallId: 'pi-example-tool-schedule',
        args: {
          title: 'Sync every 5 minutes',
          instruction: 'sync',
          schedule: {
            kind: 'every',
            intervalMinutes: 5,
          },
        },
        reasoning: 'Scheduling the requested automation before responding.',
      });
    }

    if (latestUserText.includes('interrupt') || latestUserText.includes('operator input')) {
      return createMockToolStream({
        model,
        toolName: AGENT_RUNTIME_REQUEST_OPERATOR_INPUT_TOOL,
        toolCallId: 'pi-example-tool-interrupt',
        args: { message: 'Please provide a short operator note to continue.' },
        reasoning: 'Requesting operator input through the runtime-owned tool surface.',
      });
    }

    if (latestUserText.includes('hire') || latestUserText.includes('onboarding')) {
      return createMockToolStream({
        model,
        toolName: AGENT_RUNTIME_DOMAIN_COMMAND_TOOL,
        toolCallId: 'pi-example-tool-domain-hire',
        args: {
          name: 'hire',
          inputJson: '{}',
        },
        reasoning: 'Using the runtime-owned lifecycle command surface to start onboarding.',
      });
    }

    return createMockTextStream({
      model,
      text: 'Pi example mocked response. I can stream text, use runtime-owned tools, and walk the lifecycle.',
      reasoning: 'Explaining the mocked Pi example capabilities.',
    });
  }) as unknown as PiExampleGatewayStream;
}

export function createPiExampleAgentConfig(env: PiExampleGatewayEnv = process.env): PiExampleAgentConfig {
  const mockedExternalBoundary = isMockedExternalBoundary(env);
  const openRouterApiKey = mockedExternalBoundary
    ? env.OPENROUTER_API_KEY?.trim()
    : requireEnvValue(env.OPENROUTER_API_KEY, 'OPENROUTER_API_KEY');
  const modelId = env.PI_AGENT_MODEL?.trim() || DEFAULT_PI_AGENT_MODEL;

  return {
    model: createOpenRouterModel(modelId),
    systemPrompt: PI_EXAMPLE_SYSTEM_PROMPT,
    databaseUrl: env.DATABASE_URL,
    tools: [],
    domain: createPiExampleDomain(),
    agentOptions: {
      initialState: {
        thinkingLevel: 'low',
      },
      ...(openRouterApiKey
        ? {
            getApiKey: () => openRouterApiKey,
          }
        : {}),
      ...(mockedExternalBoundary
        ? {
            streamFn: createPiExampleMockStream(),
          }
        : {}),
    },
  };
}

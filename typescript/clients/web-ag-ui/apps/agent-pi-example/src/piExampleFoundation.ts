import {
  createPiRuntimeGatewayFoundation,
  type PiRuntimeGatewayFoundation,
} from 'agent-runtime';
import { Type, createAssistantMessageEventStream, type Message } from '@mariozechner/pi-ai';

import {
  applyAutomationStatusUpdate,
  buildAutomationA2Ui,
  buildAutomationArtifact,
  buildInterruptA2Ui,
  buildInterruptArtifact,
  createPiExampleRuntimeStateStore,
  type PiExampleRuntimeStateStore,
} from './runtimeState.js';

const DEFAULT_PI_AGENT_MODEL = 'openai/gpt-5-mini';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const PI_EXAMPLE_SYSTEM_PROMPT =
  'You are a Pi-native local smoke-test agent. Respond clearly, keep track of the active thread state, use your automation and operator-input tools when appropriate, and prefer short direct answers unless the user asks for more depth.';

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

type PiExampleGatewayModel = Parameters<typeof createPiRuntimeGatewayFoundation>[0]['model'];
type PiExampleGatewayTool = NonNullable<Parameters<typeof createPiRuntimeGatewayFoundation>[0]['tools']>[number];
type PiExampleGatewayStream = NonNullable<NonNullable<Parameters<typeof createPiRuntimeGatewayFoundation>[0]['agentOptions']>['streamFn']>;

export type PiExampleGatewayFoundationOptions = {
  runtimeState?: PiExampleRuntimeStateStore;
  resolveThreadKey?: () => string;
  persistence?: {
    scheduleAutomation?: (params: {
      threadKey: string;
      command: string;
      minutes: number;
    }) => Promise<{
      automationId: string;
      runId: string;
      artifactId: string;
    }>;
    requestInterrupt?: (params: {
      threadKey: string;
      message: string;
    }) => Promise<{
      artifactId: string;
    }>;
  };
};

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
    .filter((part) => part.type === 'text')
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

  return !isPiRuntimeContextText(getUserText(message).trim());
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
  return (model, context) => {
    const latestMessage = [...context.messages].reverse().find(isMeaningfulContextMessage);

    if (latestMessage?.role === 'toolResult') {
      return createMockTextStream({
        model,
        text: `Tool ${latestMessage.toolName} completed. ${latestMessage.content.map((part) => part.text).join(' ')}`.trim(),
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

    if (latestUserText.includes('run automation') || latestUserText.includes('run scheduled')) {
      return createMockToolStream({
        model,
        toolName: 'run_sync_automation',
        toolCallId: 'pi-example-tool-run',
        args: { command: 'sync', minutes: 5 },
        reasoning: 'Running the scheduled automation so the user can inspect live events.',
      });
    }

    if (latestUserText.includes('schedule') || latestUserText.includes('"command":"sync"')) {
      return createMockToolStream({
        model,
        toolName: 'schedule_sync_automation',
        toolCallId: 'pi-example-tool-schedule',
        args: { command: 'sync', minutes: 5 },
        reasoning: 'Scheduling the requested automation before responding.',
      });
    }

    if (latestUserText.includes('interrupt') || latestUserText.includes('operator input')) {
      return createMockToolStream({
        model,
        toolName: 'request_operator_input',
        toolCallId: 'pi-example-tool-interrupt',
        args: { message: 'Please provide a short operator note to continue.' },
        reasoning: 'Requesting operator input through A2UI before proceeding.',
      });
    }

    return createMockTextStream({
      model,
      text:
        'Pi example mocked response. I can stream text, expose reasoning, schedule automations, and request operator input.',
      reasoning: 'Explaining the mocked Pi example capabilities.',
    });
  };
}

function createPiExampleTools(params: {
  resolveThreadKey: () => string;
  runtimeState: PiExampleRuntimeStateStore;
  persistence?: PiExampleGatewayFoundationOptions['persistence'];
}): PiExampleGatewayTool[] {
  return [
    {
      name: 'schedule_sync_automation',
      label: 'Schedule Sync Automation',
      description: 'Schedule a recurring sync automation and surface its current status via AG-UI artifacts and A2UI.',
      parameters: Type.Object({
        command: Type.String({ default: 'sync' }),
        minutes: Type.Number({ minimum: 1, default: 5 }),
      }),
      execute: async (_toolCallId, args) => {
        const threadKey = params.resolveThreadKey();
        const persisted = await params.persistence?.scheduleAutomation?.({
          threadKey,
          command: args.command,
          minutes: args.minutes,
        });
        const automationId = persisted?.automationId ?? `automation:${threadKey}`;
        const runId = persisted?.runId ?? `run:${threadKey}`;
        const artifactId = persisted?.artifactId ?? `artifact:${threadKey}:automation`;
        const detail = `Scheduled ${args.command} every ${args.minutes} minutes.`;
        applyAutomationStatusUpdate({
          runtimeState: params.runtimeState,
          threadKey,
          artifactId,
          automationId,
          activityRunId: runId,
          status: 'scheduled',
          command: args.command,
          minutes: args.minutes,
          detail,
        });

        return {
          content: [{ type: 'text', text: detail }],
          details: {
            automationId,
            runId,
            status: 'scheduled',
          },
        };
      },
    },
    {
      name: 'run_sync_automation',
      label: 'Run Sync Automation',
      description: 'Emit a live automation run status update for the current Pi thread.',
      parameters: Type.Object({
        command: Type.String({ default: 'sync' }),
        minutes: Type.Number({ minimum: 1, default: 5 }),
      }),
      execute: async (_toolCallId, args) => {
        const threadKey = params.resolveThreadKey();
        const session = params.runtimeState.getSession(threadKey);
        const automationId = session.automation?.id ?? `automation:${threadKey}`;
        const runId = session.automation?.runId ?? `run:${threadKey}`;
        const artifactId = session.artifacts?.current?.artifactId ?? `artifact:${threadKey}:automation`;
        const detail = `Automation ${args.command} executed successfully.`;
        applyAutomationStatusUpdate({
          runtimeState: params.runtimeState,
          threadKey,
          artifactId,
          automationId,
          activityRunId: runId,
          status: 'completed',
          command: args.command,
          minutes: args.minutes,
          detail,
        });

        return {
          content: [{ type: 'text', text: detail }],
          details: {
            automationId,
            runId,
            status: 'completed',
          },
        };
      },
    },
    {
      name: 'request_operator_input',
      label: 'Request Operator Input',
      description: 'Pause the Pi thread for operator input and surface a chat-thread A2UI form for resolution.',
      parameters: Type.Object({
        message: Type.String({
          default: 'Please provide a short operator note to continue.',
        }),
      }),
      execute: async (_toolCallId, args) => {
        const threadKey = params.resolveThreadKey();
        const persisted = await params.persistence?.requestInterrupt?.({
          threadKey,
          message: args.message,
        });
        const artifactId = persisted?.artifactId ?? `artifact:${threadKey}:interrupt`;
        const artifact = buildInterruptArtifact({
          artifactId,
          message: args.message,
        });

        params.runtimeState.updateSession(threadKey, (session) => ({
          ...session,
          execution: {
            ...session.execution,
            status: 'interrupted',
            statusMessage: args.message,
          },
          artifacts: {
            current: artifact,
            activity: artifact,
          },
          a2ui: buildInterruptA2Ui({
            artifactId,
            message: args.message,
          }),
        }));

        return {
          content: [{ type: 'text', text: args.message }],
          details: {
            status: 'interrupted',
            artifactId,
          },
        };
      },
    },
  ];
}

export function createPiExampleGatewayFoundation(
  env: PiExampleGatewayEnv = process.env,
  options: PiExampleGatewayFoundationOptions = {},
): PiRuntimeGatewayFoundation {
  const runtimeState = options.runtimeState ?? createPiExampleRuntimeStateStore();
  const mockedExternalBoundary = isMockedExternalBoundary(env);
  const openRouterApiKey = mockedExternalBoundary
    ? env.OPENROUTER_API_KEY?.trim()
    : requireEnvValue(env.OPENROUTER_API_KEY, 'OPENROUTER_API_KEY');
  const modelId = env.PI_AGENT_MODEL?.trim() || DEFAULT_PI_AGENT_MODEL;
  let foundation: PiRuntimeGatewayFoundation | null = null;
  const resolveThreadKey = () => options.resolveThreadKey?.() ?? foundation?.agent.sessionId ?? 'thread-1';

  foundation = createPiRuntimeGatewayFoundation({
    model: createOpenRouterModel(modelId),
    systemPrompt: PI_EXAMPLE_SYSTEM_PROMPT,
    databaseUrl: env.DATABASE_URL,
    tools: createPiExampleTools({
      resolveThreadKey,
      runtimeState,
      persistence: options.persistence,
    }),
    getSessionContext: () => runtimeState.getSession(resolveThreadKey()),
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
  });

  return foundation;
}

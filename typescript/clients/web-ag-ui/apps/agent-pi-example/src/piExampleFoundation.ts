import { Type, createAssistantMessageEventStream, type Message } from '@mariozechner/pi-ai';
import {
  createPiRuntimeGatewayFoundation,
  type PiRuntimeGatewayFoundation,
} from 'agent-runtime';

import {
  applyAutomationStatusUpdate,
  buildInterruptA2Ui,
  buildInterruptArtifact,
  createPiExampleRuntimeStateStore,
  type PiExampleRuntimeStateStore,
} from './runtimeState.js';

const DEFAULT_PI_AGENT_MODEL = 'openai/gpt-5.4-mini';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const AUTOMATION_SCHEDULE_TOOL = 'automation_schedule';
const AUTOMATION_LIST_TOOL = 'automation_list';
const AUTOMATION_CANCEL_TOOL = 'automation_cancel';
const REQUEST_OPERATOR_INPUT_TOOL = 'request_operator_input';
const PI_EXAMPLE_SYSTEM_PROMPT =
  'You are a Pi-native local smoke-test agent. Respond clearly, keep track of the active thread state, use your automation and operator-input tools when appropriate, and prefer short direct answers unless the user asks for more depth. The automation platform supports every-minute schedules; when the user asks for an automation every minute, treat that as valid and do not claim the platform forces a 5-minute minimum.';

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
type PiExampleGatewayToolParameters = PiExampleGatewayTool['parameters'];

export type PiExampleGatewayFoundationOptions = {
  runtimeState?: PiExampleRuntimeStateStore;
  resolveThreadKey?: () => string;
  persistence?: {
    scheduleAutomation?: (params: {
      threadKey: string;
      title: string;
      instruction: string;
      schedule: Record<string, unknown>;
    }) => Promise<{
      automationId: string;
      runId: string;
      executionId: string;
      artifactId: string;
      title: string;
      schedule: Record<string, unknown>;
      nextRunAt: string | null;
    }>;
    listAutomations?: (params: {
      threadKey: string;
      state?: string;
      limit?: number;
    }) => Promise<
      Array<{
        id: string;
        title: string;
        status: 'active' | 'completed' | 'canceled';
        schedule: Record<string, unknown>;
        nextRunAt: string | null;
        lastRunAt: string | null;
        lastRunStatus: string | null;
      }>
    >;
    cancelAutomation?: (params: {
      threadKey: string;
      automationId: string;
    }) => Promise<{
      automationId: string;
      artifactId: string;
      title: string;
      instruction: string;
      schedule: Record<string, unknown>;
    }>;
    requestInterrupt?: (params: {
      threadKey: string;
      message: string;
    }) => Promise<{
      artifactId: string;
    }>;
  };
};

type ScheduleAutomationArgs = {
  title: string;
  instruction: string;
  schedule: {
    kind: string;
    intervalMinutes?: number;
    at?: string;
    cron?: string;
    timezone?: string;
  };
};

type ListAutomationsArgs = {
  state?: 'active' | 'completed' | 'canceled' | 'all';
  limit?: number;
};

type CancelAutomationArgs = {
  automationId: string;
};

type RequestOperatorInputArgs = {
  message: string;
};

function inferAutomationCommand(params: {
  instruction: string;
  title: string;
}): string {
  const instruction = params.instruction.trim();
  if (instruction.length > 0) {
    return instruction;
  }
  return params.title.trim() || 'automation';
}

function getScheduleMinutes(schedule: ScheduleAutomationArgs['schedule']): number {
  return schedule.kind === 'every' && typeof schedule.intervalMinutes === 'number' && schedule.intervalMinutes > 0
    ? schedule.intervalMinutes
    : 5;
}

function describeScheduledAutomation(params: {
  command: string;
  schedule: ScheduleAutomationArgs['schedule'];
}): string {
  if (params.schedule.kind === 'at' && typeof params.schedule.at === 'string') {
    return `Scheduled ${params.command} at ${params.schedule.at}.`;
  }

  if (params.schedule.kind === 'cron' && typeof params.schedule.cron === 'string') {
    return `Scheduled ${params.command} on cron ${params.schedule.cron}.`;
  }

  return `Scheduled ${params.command} every ${getScheduleMinutes(params.schedule)} minutes.`;
}

function describeCanceledAutomation(title: string): string {
  return `Canceled automation ${title}.`;
}

function buildAutomationTitle(params: {
  command: string;
  schedule: ScheduleAutomationArgs['schedule'];
}): string {
  if (params.schedule.kind === 'at' && typeof params.schedule.at === 'string') {
    return `${params.command} at ${params.schedule.at}`;
  }

  if (params.schedule.kind === 'cron' && typeof params.schedule.cron === 'string') {
    return `${params.command} cron ${params.schedule.cron}`;
  }

  return `${params.command} every ${getScheduleMinutes(params.schedule)} minutes`;
}

function readPersistedTitle(title: string | undefined): string | null {
  const normalized = title?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
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
        toolName: AUTOMATION_CANCEL_TOOL,
        toolCallId: 'pi-example-tool-cancel',
        args: { automationId: 'automation:thread-1' },
        reasoning: 'Canceling the saved automation the user no longer wants running.',
      });
    }

    if (latestUserText.includes('list') && latestUserText.includes('automation')) {
      return createMockToolStream({
        model,
        toolName: AUTOMATION_LIST_TOOL,
        toolCallId: 'pi-example-tool-list',
        args: { state: 'active', limit: 20 },
        reasoning: 'Listing saved automations so the user can inspect the current schedule state.',
      });
    }

    if (latestUserText.includes('schedule') || latestUserText.includes('"command":"sync"')) {
      return createMockToolStream({
        model,
        toolName: AUTOMATION_SCHEDULE_TOOL,
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
        toolName: REQUEST_OPERATOR_INPUT_TOOL,
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
      name: AUTOMATION_SCHEDULE_TOOL,
      label: 'Automation Schedule',
      description:
        'Create a new saved automation for this thread and surface its current status via AG-UI artifacts and A2UI. Every-minute schedules are valid when `schedule.intervalMinutes` is 1 or greater.',
      parameters: Type.Object({
        title: Type.String(),
        instruction: Type.String(),
        schedule: Type.Object({
          kind: Type.String(),
          intervalMinutes: Type.Number({ minimum: 1, default: 5 }),
        }),
      }) as unknown as PiExampleGatewayToolParameters,
      execute: async (_toolCallId, args) => {
        const toolArgs = args as ScheduleAutomationArgs;
        const threadKey = params.resolveThreadKey();
        const command = inferAutomationCommand({
          instruction: toolArgs.instruction,
          title: toolArgs.title,
        });
        const minutes = getScheduleMinutes(toolArgs.schedule);
        const persisted = await params.persistence?.scheduleAutomation?.({
          threadKey,
          title: toolArgs.title,
          instruction: toolArgs.instruction,
          schedule: toolArgs.schedule,
        });
        const automationId = persisted?.automationId ?? `automation:${threadKey}`;
        const runId = persisted?.runId ?? `run:${threadKey}`;
        const executionId = persisted?.executionId ?? `execution:${threadKey}`;
        const artifactId = persisted?.artifactId ?? `artifact:${threadKey}:automation`;
        const detail = describeScheduledAutomation({
          command,
          schedule: toolArgs.schedule,
        });
        const title =
          readPersistedTitle(persisted?.title) ??
          buildAutomationTitle({
            command,
            schedule: persisted?.schedule ?? toolArgs.schedule,
          });
        applyAutomationStatusUpdate({
          runtimeState: params.runtimeState,
          threadKey,
          artifactId,
          automationId,
          executionId,
          activityRunId: runId,
          status: 'scheduled',
          command,
          minutes,
          detail,
        });

        return {
          content: [{ type: 'text', text: detail }],
          details: {
            automation: {
              id: automationId,
              title,
              status: 'active',
              schedule: persisted?.schedule ?? toolArgs.schedule,
              nextRunAt: persisted?.nextRunAt ?? null,
            },
          },
        };
      },
    },
    {
      name: AUTOMATION_LIST_TOOL,
      label: 'Automation List',
      description: 'List saved automations visible to the current thread without appending noisy thread activity by default.',
      parameters: Type.Object({
        state: Type.String({ default: 'active' }),
        limit: Type.Number({ minimum: 1, default: 20 }),
      }) as unknown as PiExampleGatewayToolParameters,
      execute: async (_toolCallId, args) => {
        const toolArgs = args as ListAutomationsArgs;
        const threadKey = params.resolveThreadKey();
        const session = params.runtimeState.getSession(threadKey);
        const automations =
          (await params.persistence?.listAutomations?.({
            threadKey,
            state: toolArgs.state,
            limit: toolArgs.limit,
          })) ??
          (session.automation
            ? [
                {
                  id: session.automation.id,
                  title: buildAutomationTitle({
                    command: 'sync',
                    schedule: {
                      kind: 'every',
                      intervalMinutes: session.automation.minutes,
                    },
                  }),
                  status: 'active' as const,
                  schedule: { kind: 'every', intervalMinutes: session.automation.minutes },
                  nextRunAt: null,
                  lastRunAt: null,
                  lastRunStatus: null,
                },
              ]
            : []);
        const detail =
          automations.length === 0
            ? 'No saved automations.'
            : `Found ${automations.length} automation${automations.length === 1 ? '' : 's'}: ${automations
                .map((automation) => `${automation.title} (${automation.status})`)
                .join(', ')}.`;

        return {
          content: [{ type: 'text', text: detail }],
          details: {
            automations,
          },
        };
      },
    },
    {
      name: AUTOMATION_CANCEL_TOOL,
      label: 'Automation Cancel',
      description: 'Cancel a saved automation so it does not fire again and surface the canceled state in AG-UI.',
      parameters: Type.Object({
        automationId: Type.String(),
      }) as unknown as PiExampleGatewayToolParameters,
      execute: async (_toolCallId, args) => {
        const toolArgs = args as CancelAutomationArgs;
        const threadKey = params.resolveThreadKey();
        const session = params.runtimeState.getSession(threadKey);
        const persisted = await params.persistence?.cancelAutomation?.({
          threadKey,
          automationId: toolArgs.automationId,
        });
        const automationId = persisted?.automationId ?? session.automation?.id ?? toolArgs.automationId;
        const artifactId = persisted?.artifactId ?? session.artifacts?.current?.artifactId ?? `artifact:${threadKey}:automation`;
        const schedule = (persisted?.schedule ?? { kind: 'every', intervalMinutes: 5 }) as ScheduleAutomationArgs['schedule'];
        const command = inferAutomationCommand({
          instruction: persisted?.instruction ?? 'sync',
          title: persisted?.title ?? '',
        });
        const title =
          readPersistedTitle(persisted?.title) ??
          buildAutomationTitle({
            command,
            schedule,
          });
        const detail = describeCanceledAutomation(title);
        applyAutomationStatusUpdate({
          runtimeState: params.runtimeState,
          threadKey,
          artifactId,
          automationId,
          executionId: session.execution.id,
          activityRunId: session.automation?.runId ?? `run:${threadKey}`,
          status: 'canceled',
          command,
          minutes: getScheduleMinutes(schedule),
          detail,
        });

        return {
          content: [{ type: 'text', text: detail }],
          details: {
            automation: {
              id: automationId,
              title,
              status: 'canceled',
            },
          },
        };
      },
    },
    {
      name: REQUEST_OPERATOR_INPUT_TOOL,
      label: 'Request Operator Input',
      description: 'Pause the Pi thread for operator input and surface a chat-thread A2UI form for resolution.',
      parameters: Type.Object({
        message: Type.String({
          default: 'Please provide a short operator note to continue.',
        }),
      }) as unknown as PiExampleGatewayToolParameters,
      execute: async (_toolCallId, args) => {
        const toolArgs = args as RequestOperatorInputArgs;
        const threadKey = params.resolveThreadKey();
        const persisted = await params.persistence?.requestInterrupt?.({
          threadKey,
          message: toolArgs.message,
        });
        const artifactId = persisted?.artifactId ?? `artifact:${threadKey}:interrupt`;
        const artifact = buildInterruptArtifact({
          artifactId,
          message: toolArgs.message,
        });

        params.runtimeState.updateSession(threadKey, (session) => ({
          ...session,
          execution: {
            ...session.execution,
            status: 'interrupted',
            statusMessage: toolArgs.message,
          },
          artifacts: {
            current: artifact,
            activity: artifact,
          },
          a2ui: buildInterruptA2Ui({
            artifactId,
            message: toolArgs.message,
          }),
        }));

        return {
          content: [{ type: 'text', text: toolArgs.message }],
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

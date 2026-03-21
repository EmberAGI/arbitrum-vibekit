import {
  createPiRuntimeGatewayAgUiHandler,
  createPiRuntimeGatewayRuntime,
  createPiRuntimeGatewayService,
  type PiRuntimeGatewayAgent,
  type PiRuntimeGatewayControlPlane,
  type PiRuntimeGatewayService,
} from 'agent-runtime';

export const PI_EXAMPLE_AGENT_ID = 'agent-pi-example';
export const PI_EXAMPLE_AG_UI_BASE_PATH = '/ag-ui';

type PiExampleAgUiHandlerOptions = {
  agentId: string;
  service: PiRuntimeGatewayService;
  basePath?: string;
};

export function createPiExampleGatewayService(): PiRuntimeGatewayService {
  const controlPlane: PiRuntimeGatewayControlPlane = {
    inspectHealth: async () => ({ status: 'ok' }),
    listExecutions: async () => [],
  };

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

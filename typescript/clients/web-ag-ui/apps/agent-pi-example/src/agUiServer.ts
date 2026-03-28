import { createAgentRuntime, type AgentRuntimeService } from 'agent-runtime';

import {
  createPiExampleAgentConfig,
  type PiExampleAgentConfig,
  type PiExampleGatewayEnv,
} from './piExampleFoundation.js';

export const PI_EXAMPLE_AGENT_ID = 'agent-pi-example';
export const PI_EXAMPLE_AG_UI_BASE_PATH = '/ag-ui';

type PiExampleAgUiHandlerOptions = {
  agentId: string;
  service: AgentRuntimeService;
  basePath?: string;
};

type PiExampleGatewayServiceOptions = {
  env?: PiExampleGatewayEnv;
  runtimeConfig?: PiExampleAgentConfig;
  now?: () => number;
};

export function createPiExampleGatewayService(options: PiExampleGatewayServiceOptions = {}): AgentRuntimeService {
  const runtimeConfig = options.runtimeConfig ?? createPiExampleAgentConfig(options.env);
  const runtime = createAgentRuntime({
    ...runtimeConfig,
    ...(options.now ? { now: options.now } : {}),
  });

  return runtime.service;
}

export function createPiExampleAgUiHandler(options: PiExampleAgUiHandlerOptions) {
  return options.service.createAgUiHandler({
    agentId: options.agentId,
    basePath: options.basePath ?? PI_EXAMPLE_AG_UI_BASE_PATH,
  });
}

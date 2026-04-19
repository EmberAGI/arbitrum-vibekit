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

type PiExampleGatewayInternalOptions = PiExampleGatewayServiceOptions & {
  __internalPostgres?: {
    ensureReady?: (options?: { env?: { DATABASE_URL?: string } }) => Promise<{
      databaseUrl: string;
    }>;
    loadInspectionState?: (options: { databaseUrl: string }) => Promise<unknown>;
    executeStatements?: (databaseUrl: string, statements: readonly unknown[]) => Promise<void>;
    persistDirectExecution?: (options: unknown) => Promise<void>;
  };
};

export async function createPiExampleGatewayService(
  options?: PiExampleGatewayServiceOptions,
): Promise<AgentRuntimeService>;
export async function createPiExampleGatewayService(
  options: PiExampleGatewayInternalOptions = {},
): Promise<AgentRuntimeService> {
  const runtimeConfig = options.runtimeConfig ?? createPiExampleAgentConfig(options.env);
  const runtime = await createAgentRuntime({
    ...runtimeConfig,
    ...(options.now ? { now: options.now } : {}),
    ...(options.__internalPostgres ? { __internalPostgres: options.__internalPostgres } : {}),
  } as any);

  return runtime.service;
}

export function createPiExampleAgUiHandler(options: PiExampleAgUiHandlerOptions) {
  return options.service.createAgUiHandler({
    agentId: options.agentId,
    basePath: options.basePath ?? PI_EXAMPLE_AG_UI_BASE_PATH,
  });
}

import { createAgentRuntime, type AgentRuntimeService } from 'agent-runtime';

import {
  createEmberLendingAgentConfig,
  type EmberLendingAgentConfig,
  type EmberLendingGatewayEnv,
} from './emberLendingFoundation.js';

export const EMBER_LENDING_AGENT_ID = 'agent-ember-lending';
export const EMBER_LENDING_AG_UI_BASE_PATH = '/ag-ui';
export type EmberLendingGatewayService = AgentRuntimeService;

type EmberLendingAgUiHandlerOptions = {
  agentId: string;
  service: EmberLendingGatewayService;
  basePath?: string;
};

type EmberLendingGatewayServiceOptions = {
  env?: EmberLendingGatewayEnv;
  runtimeConfig?: EmberLendingAgentConfig;
  now?: () => number;
};

type EmberLendingGatewayInternalOptions = EmberLendingGatewayServiceOptions & {
  __internalPostgres?: {
    ensureReady?: (options?: { env?: { DATABASE_URL?: string } }) => Promise<{
      databaseUrl: string;
    }>;
    loadInspectionState?: (options: { databaseUrl: string }) => Promise<unknown>;
    executeStatements?: (databaseUrl: string, statements: readonly unknown[]) => Promise<void>;
    persistDirectExecution?: (options: unknown) => Promise<void>;
  };
};

export async function createEmberLendingGatewayService(
  options?: EmberLendingGatewayServiceOptions,
): Promise<AgentRuntimeService>;
export async function createEmberLendingGatewayService(
  options: EmberLendingGatewayInternalOptions = {},
): Promise<AgentRuntimeService> {
  const runtimeConfig = options.runtimeConfig ?? createEmberLendingAgentConfig(options.env);
  const runtime = await createAgentRuntime({
    ...runtimeConfig,
    ...(options.now ? { now: options.now } : {}),
    ...(options.__internalPostgres ? { __internalPostgres: options.__internalPostgres } : {}),
  } as never);

  return runtime.service;
}

export function createEmberLendingAgUiHandler(options: EmberLendingAgUiHandlerOptions) {
  return options.service.createAgUiHandler({
    agentId: options.agentId,
    basePath: options.basePath ?? EMBER_LENDING_AG_UI_BASE_PATH,
  });
}

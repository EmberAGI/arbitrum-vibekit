import { createAgentRuntime, type AgentRuntimeService } from 'agent-runtime';

import {
  createPortfolioManagerAgentConfig,
  type PortfolioManagerAgentConfig,
  type PortfolioManagerGatewayEnv,
} from './portfolioManagerFoundation.js';

export const PORTFOLIO_MANAGER_AGENT_ID = 'agent-portfolio-manager';
export const PORTFOLIO_MANAGER_AG_UI_BASE_PATH = '/ag-ui';
export type PortfolioManagerGatewayService = AgentRuntimeService;

type PortfolioManagerAgUiHandlerOptions = {
  agentId: string;
  service: PortfolioManagerGatewayService;
  basePath?: string;
};

type PortfolioManagerGatewayServiceOptions = {
  env?: PortfolioManagerGatewayEnv;
  runtimeConfig?: PortfolioManagerAgentConfig;
  now?: () => number;
};

type PortfolioManagerGatewayInternalOptions = PortfolioManagerGatewayServiceOptions & {
  __internalPostgres?: {
    ensureReady?: (options?: { env?: { DATABASE_URL?: string } }) => Promise<{
      databaseUrl: string;
    }>;
    loadInspectionState?: (options: { databaseUrl: string }) => Promise<unknown>;
    executeStatements?: (databaseUrl: string, statements: readonly unknown[]) => Promise<void>;
    persistDirectExecution?: (options: unknown) => Promise<void>;
  };
};

export async function createPortfolioManagerGatewayService(
  options?: PortfolioManagerGatewayServiceOptions,
): Promise<AgentRuntimeService>;
export async function createPortfolioManagerGatewayService(
  options: PortfolioManagerGatewayInternalOptions = {},
): Promise<AgentRuntimeService> {
  const runtimeConfig = options.runtimeConfig ?? createPortfolioManagerAgentConfig(options.env);
  const runtime = await createAgentRuntime({
    ...runtimeConfig,
    ...(options.now ? { now: options.now } : {}),
    ...(options.__internalPostgres ? { __internalPostgres: options.__internalPostgres } : {}),
  } as never);

  return runtime.service;
}

export function createPortfolioManagerAgUiHandler(options: PortfolioManagerAgUiHandlerOptions) {
  return options.service.createAgUiHandler({
    agentId: options.agentId,
    basePath: options.basePath ?? PORTFOLIO_MANAGER_AG_UI_BASE_PATH,
  });
}

import { createAgentRuntime, type AgentRuntimeService } from 'agent-runtime';

import {
  createPortfolioManagerAgentConfig,
  type PortfolioManagerAgentConfig,
  type PortfolioManagerGatewayEnv,
  resolvePortfolioManagerGatewayDependencies,
} from './portfolioManagerFoundation.js';
import { ensurePortfolioManagerServiceIdentity } from './serviceIdentityPreflight.js';

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
  __internalCreateAgentRuntime?: typeof createAgentRuntime;
  __internalEnsureServiceIdentity?: typeof ensurePortfolioManagerServiceIdentity;
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
  const createAgentRuntimeImpl = options.__internalCreateAgentRuntime ?? createAgentRuntime;
  let controllerWalletAddress: `0x${string}` | undefined;

  if (options.runtimeConfig === undefined) {
    const dependencies = resolvePortfolioManagerGatewayDependencies(options.env);
    if (dependencies.protocolHost) {
      const readControllerWalletAddress =
        dependencies.controllerWallet?.readControllerWalletAddress;
      if (!readControllerWalletAddress) {
        throw new Error(
          'Portfolio-manager startup identity preflight requires PORTFOLIO_MANAGER_OWS_BASE_URL to resolve the local controller wallet.',
        );
      }

      const ensuredIdentity = await (
        options.__internalEnsureServiceIdentity ?? ensurePortfolioManagerServiceIdentity
      )({
        protocolHost: dependencies.protocolHost,
        readControllerWalletAddress,
      });
      const walletAddress = ensuredIdentity.identity.wallet_address;
      if (!walletAddress.startsWith('0x')) {
        throw new Error(
          'Portfolio-manager startup identity preflight failed because Shared Ember did not return a confirmed orchestrator wallet address.',
        );
      }

      controllerWalletAddress = walletAddress;
    }
  }

  const runtimeConfig =
    options.runtimeConfig ??
    createPortfolioManagerAgentConfig(options.env, {
      ...(controllerWalletAddress ? { controllerWalletAddress } : {}),
    });
  const runtime = await createAgentRuntimeImpl({
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

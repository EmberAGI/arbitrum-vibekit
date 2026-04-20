import type { AgentRuntimeService } from 'agent-runtime';
import {
  AgentRuntimeSigningError,
  createAgentRuntimeKernel,
  type AgentRuntimeInternalPostgresHooks,
} from 'agent-runtime/internal';

import {
  createPortfolioManagerAgentConfig,
  type PortfolioManagerAgentConfig,
  type PortfolioManagerGatewayEnv,
  resolvePortfolioManagerGatewayDependencies,
} from './portfolioManagerFoundation.js';
import {
  derivePortfolioManagerControllerSmartAccountAddress,
  ensurePortfolioManagerControllerSmartAccountDeployed,
} from './controllerIdentity.js';
import { ensurePortfolioManagerServiceIdentity } from './serviceIdentityPreflight.js';

export const PORTFOLIO_MANAGER_AGENT_ID = 'agent-portfolio-manager';
export const PORTFOLIO_MANAGER_AG_UI_BASE_PATH = '/ag-ui';
export const PORTFOLIO_MANAGER_RUNTIME_SIGNER_REF = 'controller-wallet';
export type PortfolioManagerGatewayService = AgentRuntimeService;
const CONTROLLER_DEPLOYMENT_INSUFFICIENT_FUNDS_PATTERN =
  /insufficient funds for gas \* price \+ value/i;

function maybeWrapControllerDeploymentError(input: {
  error: unknown;
  controllerSignerAddress: `0x${string}`;
  controllerSmartAccountAddress: `0x${string}`;
}): Error | null {
  if (
    input.error instanceof Error &&
    CONTROLLER_DEPLOYMENT_INSUFFICIENT_FUNDS_PATTERN.test(input.error.message)
  ) {
    return new Error(
      `Portfolio-manager startup failed because controller signer ${input.controllerSignerAddress} has no ETH to deploy controller smart account ${input.controllerSmartAccountAddress} on Arbitrum. Fund the controller signer and restart the service.`,
    );
  }

  return null;
}

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
  __internalCreateAgentRuntimeKernel?: typeof createAgentRuntimeKernel;
  __internalEnsureServiceIdentity?: typeof ensurePortfolioManagerServiceIdentity;
  __internalDeriveControllerSmartAccountAddress?: typeof derivePortfolioManagerControllerSmartAccountAddress;
  __internalEnsureControllerSmartAccountDeployed?: typeof ensurePortfolioManagerControllerSmartAccountDeployed;
  __internalPostgres?: AgentRuntimeInternalPostgresHooks;
};

async function readRequiredControllerSignerAddress(input: {
  signing: {
    readAddress(input: { signerRef: string }): Promise<`0x${string}`>;
  };
}): Promise<`0x${string}`> {
  try {
    return await input.signing.readAddress({
      signerRef: PORTFOLIO_MANAGER_RUNTIME_SIGNER_REF,
    });
  } catch (error) {
    if (error instanceof AgentRuntimeSigningError) {
      if (error.code === 'signer_not_declared' || error.code === 'signer_not_configured') {
        throw new Error(
          'Portfolio-manager startup identity preflight requires PORTFOLIO_MANAGER_OWS_WALLET_NAME to resolve the configured controller wallet.',
        );
      }

      if (error.code === 'wallet_lookup_failed' || error.code === 'identity_address_missing') {
        throw new Error(
          'Portfolio-manager startup identity preflight failed because the configured OWS wallet did not resolve an EVM address.',
        );
      }
    }

    throw error;
  }
}

export async function createPortfolioManagerGatewayService(
  options?: PortfolioManagerGatewayServiceOptions,
): Promise<AgentRuntimeService>;
export async function createPortfolioManagerGatewayService(
  options: PortfolioManagerGatewayInternalOptions = {},
): Promise<AgentRuntimeService> {
  const createAgentRuntimeKernelImpl =
    options.__internalCreateAgentRuntimeKernel ?? createAgentRuntimeKernel;

  const kernel = await createAgentRuntimeKernelImpl({
    env: options.env,
    owsSigners: [
      {
        signerRef: PORTFOLIO_MANAGER_RUNTIME_SIGNER_REF,
        walletNameOrIdEnvVar: 'PORTFOLIO_MANAGER_OWS_WALLET_NAME',
        passphraseEnvVar: 'PORTFOLIO_MANAGER_OWS_PASSPHRASE',
        vaultPathEnvVar: 'PORTFOLIO_MANAGER_OWS_VAULT_PATH',
      },
    ],
    createRuntimeOptions: async ({ signing }) => {
      if (options.runtimeConfig) {
        return {
          ...options.runtimeConfig,
          ...(options.now ? { now: options.now } : {}),
          ...(options.__internalPostgres ? { __internalPostgres: options.__internalPostgres } : {}),
        } as never;
      }

      const dependencies = resolvePortfolioManagerGatewayDependencies(options.env);
      let controllerWalletAddress: `0x${string}` | undefined;
      let controllerSignerAddress: `0x${string}` | undefined;

      if (dependencies.protocolHost) {
        controllerSignerAddress = await readRequiredControllerSignerAddress({
          signing,
        });
        const controllerSmartAccountAddress = await (
          options.__internalDeriveControllerSmartAccountAddress ??
          derivePortfolioManagerControllerSmartAccountAddress
        )({
          signerAddress: controllerSignerAddress,
        });
        try {
          await (
            options.__internalEnsureControllerSmartAccountDeployed ??
            ensurePortfolioManagerControllerSmartAccountDeployed
          )({
            signing,
            signerRef: PORTFOLIO_MANAGER_RUNTIME_SIGNER_REF,
            signerAddress: controllerSignerAddress,
          });
        } catch (error) {
          const wrappedError = maybeWrapControllerDeploymentError({
            error,
            controllerSignerAddress,
            controllerSmartAccountAddress,
          });
          if (wrappedError) {
            throw wrappedError;
          }

          throw error;
        }
        const ensuredIdentity = await (
          options.__internalEnsureServiceIdentity ?? ensurePortfolioManagerServiceIdentity
        )({
          protocolHost: dependencies.protocolHost,
          readControllerWalletAddress: async () => controllerSmartAccountAddress,
        });
        const walletAddress = ensuredIdentity.identity.wallet_address;
        if (!walletAddress.startsWith('0x')) {
          throw new Error(
            'Portfolio-manager startup identity preflight failed because Shared Ember did not return a confirmed orchestrator wallet address.',
          );
        }

        controllerWalletAddress = walletAddress;
      }

      return {
        ...createPortfolioManagerAgentConfig(options.env, {
          runtimeSigning: signing,
          runtimeSignerRef: PORTFOLIO_MANAGER_RUNTIME_SIGNER_REF,
          ...(controllerSignerAddress ? { controllerSignerAddress } : {}),
          ...(controllerWalletAddress ? { controllerWalletAddress } : {}),
        }),
        ...(options.now ? { now: options.now } : {}),
        ...(options.__internalPostgres ? { __internalPostgres: options.__internalPostgres } : {}),
      } as never;
    },
  });

  return kernel.service;
}

export function createPortfolioManagerAgUiHandler(options: PortfolioManagerAgUiHandlerOptions) {
  return options.service.createAgUiHandler({
    agentId: options.agentId,
    basePath: options.basePath ?? PORTFOLIO_MANAGER_AG_UI_BASE_PATH,
  });
}

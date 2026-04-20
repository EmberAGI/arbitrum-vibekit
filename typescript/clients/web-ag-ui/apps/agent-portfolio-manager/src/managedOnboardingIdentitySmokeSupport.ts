import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getWallet, importWalletPrivateKey } from '@open-wallet-standard/core';

import { createPortfolioManagerGatewayService } from './agUiServer.js';
import { createEmberLendingGatewayService } from '../../agent-ember-lending/src/agUiServer.js';

type GatewayService = {
  control: {
    inspectHealth: () => Promise<unknown>;
  };
  stop: () => Promise<void>;
};

type GatewayServiceFactory = (options: {
  env: NodeJS.ProcessEnv;
  __internalPostgres: {
    ensureReady: () => Promise<{ databaseUrl: string }>;
    loadInspectionState: () => Promise<{
      threads: unknown[];
      executions: unknown[];
      automations: unknown[];
      automationRuns: unknown[];
      interrupts: unknown[];
      leases: unknown[];
      outboxIntents: unknown[];
      executionEvents: unknown[];
      threadActivities: unknown[];
    }>;
    executeStatements: () => Promise<void>;
    persistDirectExecution: () => Promise<void>;
  };
}) => Promise<GatewayService>;

type JsonRpcResponse<TResult> = {
  result?: TResult;
  error?: {
    message?: string;
  };
};

type OwsWalletFixture = {
  walletAddress: `0x${string}`;
  env: Record<string, string>;
  cleanup: () => void;
};

const DEFAULT_OPENROUTER_API_KEY = 'test-openrouter-key';
const CONTROLLER_TEST_PRIVATE_KEY =
  '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const SUBAGENT_TEST_PRIVATE_KEY =
  '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd';
const EVM_CHAIN_ID_PREFIX = 'eip155:';

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readHexAddress(value: unknown): `0x${string}` | null {
  const normalized = readString(value);
  return normalized?.startsWith('0x') ? (normalized.toLowerCase() as `0x${string}`) : null;
}

function createInternalPostgresHooks() {
  return {
    ensureReady: async () => ({
      databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
    }),
    loadInspectionState: async () => ({
      threads: [],
      executions: [],
      automations: [],
      automationRuns: [],
      interrupts: [],
      leases: [],
      outboxIntents: [],
      executionEvents: [],
      threadActivities: [],
    }),
    executeStatements: async () => undefined,
    persistDirectExecution: async () => undefined,
  };
}

async function postJsonRpc<TResult>(input: {
  baseUrl: string;
  method: string;
  params: Record<string, unknown>;
}): Promise<TResult> {
  const response = await fetch(`${input.baseUrl}/jsonrpc`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `smoke-${input.method}`,
      method: input.method,
      params: input.params,
    }),
  });

  if (!response.ok) {
    throw new Error(`Shared Ember HTTP request failed with status ${response.status}.`);
  }

  const body = (await response.json()) as JsonRpcResponse<TResult>;
  if (body.error?.message) {
    throw new Error(`Shared Ember JSON-RPC error: ${body.error.message}`);
  }
  if (!body.result) {
    throw new Error(`Shared Ember JSON-RPC response for ${input.method} was missing result.`);
  }

  return body.result;
}

async function readManagedServiceWallet(input: {
  sharedEmberBaseUrl: string;
  agentId: 'portfolio-manager' | 'ember-lending';
  role: 'orchestrator' | 'subagent';
}): Promise<`0x${string}` | null> {
  const result = await postJsonRpc<{
    agent_service_identity?: {
      wallet_address?: string;
    } | null;
  }>({
    baseUrl: input.sharedEmberBaseUrl,
    method: 'orchestrator.readAgentServiceIdentity.v1',
    params: {
      agent_id: input.agentId,
      role: input.role,
    },
  });

  return readHexAddress(result.agent_service_identity?.wallet_address);
}

async function stopGatewayService(service: GatewayService | null): Promise<void> {
  await service?.stop().catch(() => undefined);
}

function createOwsWalletFixture(input: {
  tmpDirPrefix: string;
  walletName: string;
  privateKey: string;
  walletNameEnvVar: string;
  vaultPathEnvVar: string;
}): OwsWalletFixture {
  const vaultPath = mkdtempSync(path.join(os.tmpdir(), input.tmpDirPrefix));
  importWalletPrivateKey(input.walletName, input.privateKey, undefined, vaultPath, 'evm');

  const wallet = getWallet(input.walletName, vaultPath);
  const walletAddress = readHexAddress(
    wallet.accounts.find((account) => account.chainId.startsWith(EVM_CHAIN_ID_PREFIX))?.address,
  );

  if (!walletAddress) {
    throw new Error(`Smoke fixture wallet "${input.walletName}" did not resolve an EVM address.`);
  }

  return {
    walletAddress,
    env: {
      [input.walletNameEnvVar]: input.walletName,
      [input.vaultPathEnvVar]: vaultPath,
    },
    cleanup: () => {
      rmSync(vaultPath, {
        recursive: true,
        force: true,
      });
    },
  };
}

export function createManagedIdentitySmokeWalletFixtures(): {
  controller: OwsWalletFixture;
  subagent: OwsWalletFixture;
  cleanup: () => void;
} {
  const controller = createOwsWalletFixture({
    tmpDirPrefix: 'portfolio-manager-ows-',
    walletName: 'portfolio-manager-controller-wallet',
    privateKey: CONTROLLER_TEST_PRIVATE_KEY,
    walletNameEnvVar: 'PORTFOLIO_MANAGER_OWS_WALLET_NAME',
    vaultPathEnvVar: 'PORTFOLIO_MANAGER_OWS_VAULT_PATH',
  });
  const subagent = createOwsWalletFixture({
    tmpDirPrefix: 'ember-lending-ows-',
    walletName: 'ember-lending-service-wallet',
    privateKey: SUBAGENT_TEST_PRIVATE_KEY,
    walletNameEnvVar: 'EMBER_LENDING_OWS_WALLET_NAME',
    vaultPathEnvVar: 'EMBER_LENDING_OWS_VAULT_PATH',
  });

  return {
    controller,
    subagent,
    cleanup: () => {
      subagent.cleanup();
      controller.cleanup();
    },
  };
}

export async function ensureManagedRuntimeOwnedServiceIdentities(input: {
  sharedEmberBaseUrl: string;
  controllerWalletAddress: `0x${string}`;
  subagentWalletAddress: `0x${string}`;
  controllerEnv: Record<string, string>;
  lendingEnv: Record<string, string>;
  createPortfolioManagerGatewayServiceImpl?: GatewayServiceFactory;
  createEmberLendingGatewayServiceImpl?: GatewayServiceFactory;
}): Promise<{
  orchestratorWallet: `0x${string}`;
  subagentWallet: `0x${string}`;
}> {
  const createPortfolioManagerGatewayServiceImpl =
    input.createPortfolioManagerGatewayServiceImpl ??
    (createPortfolioManagerGatewayService as unknown as GatewayServiceFactory);
  const createEmberLendingGatewayServiceImpl =
    input.createEmberLendingGatewayServiceImpl ??
    (createEmberLendingGatewayService as unknown as GatewayServiceFactory);

  let portfolioService: GatewayService | null = null;
  let lendingService: GatewayService | null = null;

  try {
    portfolioService = await createPortfolioManagerGatewayServiceImpl({
      env: {
        OPENROUTER_API_KEY: DEFAULT_OPENROUTER_API_KEY,
        SHARED_EMBER_BASE_URL: input.sharedEmberBaseUrl,
        ...input.controllerEnv,
      },
      __internalPostgres: createInternalPostgresHooks(),
    });
    await portfolioService.control.inspectHealth();

    lendingService = await createEmberLendingGatewayServiceImpl({
      env: {
        OPENROUTER_API_KEY: DEFAULT_OPENROUTER_API_KEY,
        SHARED_EMBER_BASE_URL: input.sharedEmberBaseUrl,
        ...input.lendingEnv,
      },
      __internalPostgres: createInternalPostgresHooks(),
    });
    await lendingService.control.inspectHealth();

    const orchestratorWallet = await readManagedServiceWallet({
      sharedEmberBaseUrl: input.sharedEmberBaseUrl,
      agentId: 'portfolio-manager',
      role: 'orchestrator',
    });
    const subagentWallet = await readManagedServiceWallet({
      sharedEmberBaseUrl: input.sharedEmberBaseUrl,
      agentId: 'ember-lending',
      role: 'subagent',
    });

    if (orchestratorWallet !== input.controllerWalletAddress) {
      throw new Error(
        `Expected portfolio-manager/orchestrator wallet ${input.controllerWalletAddress} but got ${String(orchestratorWallet)}.`,
      );
    }
    if (subagentWallet !== input.subagentWalletAddress) {
      throw new Error(
        `Expected ember-lending/subagent wallet ${input.subagentWalletAddress} but got ${String(subagentWallet)}.`,
      );
    }

    return {
      orchestratorWallet,
      subagentWallet,
    };
  } finally {
    await stopGatewayService(lendingService);
    await stopGatewayService(portfolioService);
  }
}

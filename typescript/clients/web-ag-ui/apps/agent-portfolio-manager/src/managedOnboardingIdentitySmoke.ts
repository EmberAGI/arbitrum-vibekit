import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPortfolioManagerSharedEmberHttpHost } from './sharedEmberHttpHost.js';
import { createPortfolioManagerDomain } from './sharedEmberAdapter.js';
import { derivePortfolioManagerControllerSmartAccountAddress } from './controllerIdentity.js';
import { resolveSharedEmberTarget } from './sharedEmberIntegrationHarness.js';
import {
  createManagedIdentitySmokeWalletFixtures,
  ensureManagedRuntimeOwnedServiceIdentities,
} from './managedOnboardingIdentitySmokeSupport.js';

type JsonRpcResponse<TResult> = {
  result?: TResult;
  error?: {
    message?: string;
  };
};

const USER_WALLET = '0x00000000000000000000000000000000000000a1' as const;
const THREAD_ID = 'smoke-thread-563';

function findForgePrivateRepoRoot(): string | null {
  let current = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

  while (true) {
    const candidate = path.join(current, 'repos', 'ember-orchestration-v1-spec');
    if (existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }

    current = parent;
  }
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

function createPortfolioManagerSetupInput() {
  return {
    walletAddress: USER_WALLET,
    portfolioMandate: {
      approved: true,
      riskLevel: 'medium' as const,
    },
    managedAgentMandates: [
      {
        agentKey: 'ember-lending-primary',
        agentType: 'ember-lending',
        approved: true,
        settings: {
          network: 'arbitrum',
          protocol: 'aave',
          allowedCollateralAssets: ['USDC'],
          allowedBorrowAssets: ['USDC'],
          maxAllocationPct: 35,
          maxLtvBps: 7000,
          minHealthFactor: '1.25',
        },
      },
    ],
  };
}

function createSignedDelegation(delegate: `0x${string}`) {
  return {
    delegate,
    delegator: USER_WALLET,
    authority: '0x0000000000000000000000000000000000000000000000000000000000000000',
    caveats: [],
    salt: '0x1111111111111111111111111111111111111111111111111111111111111111',
    signature: '0x1234',
  };
}

export async function runManagedOnboardingIdentitySmoke() {
  const detectedPrivateRepoRoot = findForgePrivateRepoRoot();
  if (!process.env['EMBER_ORCHESTRATION_V1_SPEC_ROOT'] && detectedPrivateRepoRoot) {
    process.env['EMBER_ORCHESTRATION_V1_SPEC_ROOT'] = detectedPrivateRepoRoot;
  }

  const walletFixtures = createManagedIdentitySmokeWalletFixtures();
  const sharedEmberTarget = await resolveSharedEmberTarget({
    managedAgentId: 'ember-lending',
    managedAgentWalletAddress: walletFixtures.subagent.walletAddress,
  });
  const controllerSmartAccountAddress = await derivePortfolioManagerControllerSmartAccountAddress({
    signerAddress: walletFixtures.controller.walletAddress,
  });

  const portfolioProtocolHost = createPortfolioManagerSharedEmberHttpHost({
    baseUrl: sharedEmberTarget.baseUrl,
  });

  try {
    const { orchestratorWallet, subagentWallet } =
      await ensureManagedRuntimeOwnedServiceIdentities({
        sharedEmberBaseUrl: sharedEmberTarget.baseUrl,
        controllerWalletAddress: controllerSmartAccountAddress,
        subagentWalletAddress: walletFixtures.subagent.walletAddress,
        controllerEnv: walletFixtures.controller.env,
        lendingEnv: walletFixtures.subagent.env,
      });

    const domain = createPortfolioManagerDomain({
      protocolHost: portfolioProtocolHost,
      agentId: 'portfolio-manager',
      controllerWalletAddress: controllerSmartAccountAddress,
    });

    const hireResult = await domain.handleOperation?.({
      threadId: THREAD_ID,
      state: {
        phase: 'prehire',
        lastPortfolioState: null,
        lastSharedEmberRevision: null,
        lastRootDelegation: null,
        lastOnboardingBootstrap: null,
        lastRootedWalletContextId: null,
        activeWalletAddress: null,
        pendingOnboardingWalletAddress: null,
      },
      operation: {
        source: 'command',
        name: 'hire',
      },
    });

    if (!hireResult?.state || !('phase' in hireResult.state) || hireResult.state.phase !== 'onboarding') {
      throw new Error('Portfolio-manager hire did not enter onboarding.');
    }

    const setupResult = await domain.handleOperation?.({
      threadId: THREAD_ID,
      state: hireResult.state,
      operation: {
        source: 'interrupt',
        name: 'portfolio-manager-setup-request',
        input: createPortfolioManagerSetupInput(),
      },
    });

    if (
      !setupResult?.state ||
      !('pendingOnboardingWalletAddress' in setupResult.state) ||
      setupResult.state.pendingOnboardingWalletAddress !== USER_WALLET
    ) {
      throw new Error('Portfolio-manager setup did not persist the expected onboarding wallet.');
    }

    const signingResult = await domain.handleOperation?.({
      threadId: THREAD_ID,
      state: setupResult.state,
      operation: {
        source: 'interrupt',
        name: 'portfolio-manager-delegation-signing-request',
          input: {
            outcome: 'signed',
            signedDelegations: [createSignedDelegation(controllerSmartAccountAddress)],
          },
        },
      });

    if (!signingResult?.state || !('phase' in signingResult.state) || signingResult.state.phase !== 'active') {
      throw new Error('Portfolio-manager rooted bootstrap did not promote the thread to active.');
    }

    const executionContext = await postJsonRpc<{
      revision?: number;
      execution_context?: {
        subagent_wallet_address?: string | null;
      };
    }>({
      baseUrl: sharedEmberTarget.baseUrl,
      method: 'subagent.readExecutionContext.v1',
      params: {
        agent_id: 'ember-lending',
      },
    });
    const hydratedSubagentWallet =
      executionContext.execution_context?.subagent_wallet_address ?? null;
    if (hydratedSubagentWallet !== walletFixtures.subagent.walletAddress) {
      throw new Error(
        `Expected post-bootstrap subagent wallet ${walletFixtures.subagent.walletAddress} but got ${String(hydratedSubagentWallet)}.`,
      );
    }

    console.log('[smoke:managed-identities] portfolio-manager/orchestrator:', orchestratorWallet);
    console.log('[smoke:managed-identities] ember-lending/subagent:', subagentWallet);
    console.log(
      '[smoke:managed-identities] post-bootstrap subagent_wallet_address:',
      hydratedSubagentWallet,
    );
    console.log('[smoke:managed-identities] OK');
  } finally {
    walletFixtures.cleanup();
    await sharedEmberTarget.close();
  }
}

void runManagedOnboardingIdentitySmoke().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[smoke:managed-identities] FAILED:', message);
  process.exitCode = 1;
});

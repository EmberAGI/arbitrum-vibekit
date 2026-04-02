import { existsSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureEmberLendingServiceIdentity } from '../../apps/agent-ember-lending/src/serviceIdentityPreflight.js';
import { createEmberLendingSharedEmberHttpHost } from '../../apps/agent-ember-lending/src/sharedEmberHttpHost.js';
import { ensurePortfolioManagerServiceIdentity } from '../../apps/agent-portfolio-manager/src/serviceIdentityPreflight.js';
import { createPortfolioManagerDomain } from '../../apps/agent-portfolio-manager/src/sharedEmberAdapter.js';
import { resolveSharedEmberTarget } from '../../apps/agent-portfolio-manager/src/sharedEmberIntegrationHarness.js';
import { createPortfolioManagerSharedEmberHttpHost } from '../../apps/agent-portfolio-manager/src/sharedEmberHttpHost.js';

type StubRequest = {
  method: string;
  path: string;
  body: unknown;
};

type StubResponse = {
  status?: number;
  body?: unknown;
};

type JsonRpcResponse<TResult> = {
  result?: TResult;
  error?: {
    message?: string;
  };
};

const CONTROLLER_WALLET = '0x00000000000000000000000000000000000000c1' as const;
const SUBAGENT_WALLET = '0x00000000000000000000000000000000000000b1' as const;
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

async function readRequestBody(request: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function startJsonStubServer(
  handler: (request: StubRequest) => Promise<StubResponse> | StubResponse,
): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const rawBody = await readRequestBody(request);
      const body =
        rawBody.length === 0 ? null : (JSON.parse(Buffer.from(rawBody).toString('utf8')) as unknown);
      const result = await handler({
        method: request.method ?? 'GET',
        path: url.pathname,
        body,
      });

      response.statusCode = result.status ?? 200;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(JSON.stringify(result.body ?? null));
    })().catch((error: unknown) => {
      response.statusCode = 500;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(
        JSON.stringify({
          message: error instanceof Error ? error.message : 'unknown error',
        }),
      );
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.closeAllConnections?.();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
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

function createSignedDelegation() {
  return {
    delegate: '0x2222222222222222222222222222222222222222',
    delegator: USER_WALLET,
    authority: '0x0000000000000000000000000000000000000000000000000000000000000000',
    caveats: [],
    salt: '0x1111111111111111111111111111111111111111111111111111111111111111',
    signature: '0x1234',
  };
}

async function main() {
  const detectedPrivateRepoRoot = findForgePrivateRepoRoot();
  if (!process.env['EMBER_ORCHESTRATION_V1_SPEC_ROOT'] && detectedPrivateRepoRoot) {
    process.env['EMBER_ORCHESTRATION_V1_SPEC_ROOT'] = detectedPrivateRepoRoot;
  }

  const sharedEmberTarget = await resolveSharedEmberTarget({
    managedAgentId: 'ember-lending',
    managedAgentWalletAddress: SUBAGENT_WALLET,
  });
  const controllerOws = await startJsonStubServer(async ({ method, path }) => {
    if (method === 'GET' && path === '/identity') {
      return {
        body: {
          controller_wallet_address: CONTROLLER_WALLET,
        },
      };
    }

    return {
      status: 404,
      body: {
        message: 'not found',
      },
    };
  });
  const lendingOws = await startJsonStubServer(async ({ method, path }) => {
    if (method === 'GET' && path === '/identity') {
      return {
        body: {
          wallet_address: SUBAGENT_WALLET,
        },
      };
    }

    return {
      status: 404,
      body: {
        message: 'not found',
      },
    };
  });

  const portfolioProtocolHost = createPortfolioManagerSharedEmberHttpHost({
    baseUrl: sharedEmberTarget.baseUrl,
  });
  const lendingProtocolHost = createEmberLendingSharedEmberHttpHost({
    baseUrl: sharedEmberTarget.baseUrl,
  });

  try {
    const ensuredPortfolioIdentity = await ensurePortfolioManagerServiceIdentity({
      protocolHost: portfolioProtocolHost,
      readControllerWalletAddress: async () => CONTROLLER_WALLET,
    });
    const ensuredLendingIdentity = await ensureEmberLendingServiceIdentity({
      protocolHost: lendingProtocolHost,
      readSignerWalletAddress: async () => SUBAGENT_WALLET,
    });

    if (ensuredPortfolioIdentity.identity.wallet_address !== CONTROLLER_WALLET) {
      throw new Error('Portfolio-manager startup identity preflight did not confirm the expected wallet.');
    }
    if (ensuredLendingIdentity.identity.wallet_address !== SUBAGENT_WALLET) {
      throw new Error('Ember-lending startup identity preflight did not confirm the expected wallet.');
    }

    const orchestratorIdentity = await postJsonRpc<{
      revision?: number;
      agent_service_identity?: {
        wallet_address?: string;
      } | null;
    }>({
      baseUrl: sharedEmberTarget.baseUrl,
      method: 'orchestrator.readAgentServiceIdentity.v1',
      params: {
        agent_id: 'portfolio-manager',
        role: 'orchestrator',
      },
    });
    const subagentIdentity = await postJsonRpc<{
      revision?: number;
      agent_service_identity?: {
        wallet_address?: string;
      } | null;
    }>({
      baseUrl: sharedEmberTarget.baseUrl,
      method: 'orchestrator.readAgentServiceIdentity.v1',
      params: {
        agent_id: 'ember-lending',
        role: 'subagent',
      },
    });

    const orchestratorWallet = orchestratorIdentity.agent_service_identity?.wallet_address ?? null;
    const subagentWallet = subagentIdentity.agent_service_identity?.wallet_address ?? null;
    if (orchestratorWallet !== CONTROLLER_WALLET) {
      throw new Error(
        `Expected portfolio-manager orchestrator wallet ${CONTROLLER_WALLET} but got ${String(orchestratorWallet)}.`,
      );
    }
    if (subagentWallet !== SUBAGENT_WALLET) {
      throw new Error(
        `Expected ember-lending subagent wallet ${SUBAGENT_WALLET} but got ${String(subagentWallet)}.`,
      );
    }

    const domain = createPortfolioManagerDomain({
      protocolHost: portfolioProtocolHost,
      agentId: 'portfolio-manager',
      controllerWalletAddress: CONTROLLER_WALLET,
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
          signedDelegations: [createSignedDelegation()],
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
    if (hydratedSubagentWallet !== SUBAGENT_WALLET) {
      throw new Error(
        `Expected post-bootstrap subagent wallet ${SUBAGENT_WALLET} but got ${String(hydratedSubagentWallet)}.`,
      );
    }

    console.log('[smoke:managed-identities] portfolio-manager/orchestrator:', orchestratorWallet);
    console.log('[smoke:managed-identities] ember-lending/subagent:', subagentWallet);
    console.log('[smoke:managed-identities] post-bootstrap subagent_wallet_address:', hydratedSubagentWallet);
    console.log('[smoke:managed-identities] OK');
  } finally {
    await lendingOws.close();
    await controllerOws.close();
    await sharedEmberTarget.close();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[smoke:managed-identities] FAILED:', message);
  process.exitCode = 1;
});

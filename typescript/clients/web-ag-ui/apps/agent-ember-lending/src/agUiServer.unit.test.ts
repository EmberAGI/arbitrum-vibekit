import type { PiRuntimeGatewayService } from 'agent-runtime';
import { describe, expect, it, vi } from 'vitest';

import {
  createEmberLendingAgUiHandler,
  createEmberLendingGatewayService,
} from './agUiServer.js';
import type { EmberLendingRuntimeModule } from './privateRuntime.js';

function createRuntimeEnv() {
  return {
    EMBER_LENDING_AGENT_ID: 'agent-ember-lending',
    EMBER_LENDING_RUNTIME_MODULE: '@emberagi/ember-lending-runtime',
    EMBER_LENDING_RUNTIME_CONFIG_JSON: JSON.stringify({
      agentWallet: '0xAGENT000000000000000000000000000000000001',
      network: 'base',
      policySnapshotRef: 'policy-ember-001',
      rpcUrl: 'https://rpc.example.invalid',
      controllerPrivateKey: '0xcontrollerkey',
      redeemerPrivateKey: '0xredeemerkey',
      smartAccounts: {
        chainId: 8453,
        environment: {
          DelegationManager: '0x0000000000000000000000000000000000000001',
          EntryPoint: '0x0000000000000000000000000000000000000002',
          SimpleFactory: '0x0000000000000000000000000000000000000003',
          implementations: {
            Hybrid: '0x0000000000000000000000000000000000000004',
          },
          caveatEnforcers: {
            AllowedTargets: '0x0000000000000000000000000000000000000005',
          },
        },
      },
      planner: {
        url: 'https://planner.example.invalid',
        authHeader: 'Bearer planner-token',
        tokenUids: {
          USDC: {
            chainId: '8453',
            address: '0x00000000000000000000000000000000000000aa',
          },
        },
      },
      rootDelegationHandoff: {
        handoff_id: 'handoff-root-001',
        root_delegation_id: 'root-user-001',
        user_id: 'user_idle',
        user_wallet: '0xUSER000000000000000000000000000000000001',
        orchestrator_wallet: '0xORCH000000000000000000000000000000000001',
        network: 'base',
        artifact_ref: 'artifact-root-001',
        issued_at: '2026-03-22T00:00:00Z',
        activated_at: '2026-03-22T00:00:05Z',
        signer_kind: 'delegation_toolkit',
        metadata: {
          delegation_manager: '0xDELEGATIONMANAGER001',
          authorization_transaction_hash: '0xupgrade001',
        },
      },
    }),
  } as const;
}

function createPrivateRuntimeDependencies() {
  return {
    fetch: vi.fn(async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          transactions: [
            {
              type: 'call',
              to: '0x0000000000000000000000000000000000000abc',
              value: '0',
              data: '0x12345678',
              chainId: '8453',
            },
          ],
        };
      },
    })) as unknown as typeof fetch,
    createControllerBackends: async () => ({
      issuer: {
        async issueDelegation() {
          return {
            delegationId: 'delegation-issued-001',
            artifactRef: 'artifact-issued-001',
            issuedAt: '2026-03-22T00:01:00Z',
            activatedAt: '2026-03-22T00:01:05Z',
            policyHash: 'policy-hash-001',
          };
        },
      },
      revoker: {
        async revokeDelegation() {
          return {
            revokedAt: '2026-03-22T00:02:00Z',
          };
        },
      },
    }),
    createRedemptionClient: async () => ({
      async redeemActiveDelegation({
        delegation,
      }: {
        delegation: { delegation_id: string; artifact_ref: string };
      }) {
        return {
          redeemedDelegationId: delegation.delegation_id,
          delegationArtifactRef: delegation.artifact_ref,
          redeemerAddress: '0xAGENT000000000000000000000000000000000001',
          transactionHash: '0xexecution001',
        };
      },
    }),
    createExecutor: async () => ({
      async signDelegatedPayload() {
        return {
          signedPayloadRef: 'signed-payload-001',
          signerAddress: '0xAGENT000000000000000000000000000000000001',
        };
      },
    }),
    createChainAdapter: async () => ({
      async submitSignedPayload({ request }: { request: { request_id: string } }) {
        return {
          kind: 'confirmed' as const,
          execution_id: `exec-${request.request_id}`,
          occurred_at: '2026-03-22T00:03:00Z',
          transaction_hash: '0xconfirmed001',
          successor_plans: [
            {
              unit_id: `unit-successor-${request.request_id}`,
              root_asset: 'USDC',
              network: 'base',
              wallet_address: '0xAGENT000000000000000000000000000000000001',
              quantity: '100',
              position_kind: 'loan',
              control_path: 'lending.supply',
              benchmark_value: '100',
              valuation_ref: 'val-post-001',
              metadata: {
                protocol_name: 'Aave',
              },
            },
          ],
        };
      },
    }),
  };
}

type InstalledPrivateRuntimeModule = EmberLendingRuntimeModule & {
  createEmberLendingGatewayService: (options: {
    env: Record<string, string | undefined>;
    dependencies?: Record<string, unknown>;
  }) => Promise<PiRuntimeGatewayService>;
};

describe('createEmberLendingGatewayService', () => {
  it('loads the installed private tarball through the thin host and serves AG-UI health plus run flows', async () => {
    const env = createRuntimeEnv();
    const privateRuntimeDependencies = createPrivateRuntimeDependencies();
    const service = await createEmberLendingGatewayService({
      env,
      loadRuntimeModule: async () => {
        const installedRuntime = (await import(
          '@emberagi/ember-lending-runtime'
        )) as InstalledPrivateRuntimeModule;

        return {
          createEmberLendingGatewayService: ({ env: runtimeEnv }) =>
            installedRuntime.createEmberLendingGatewayService({
              env: runtimeEnv,
              dependencies: privateRuntimeDependencies,
            }),
        };
      },
    });
    const handler = createEmberLendingAgUiHandler({
      agentId: 'agent-ember-lending',
      service,
    });

    const healthResponse = await handler(new Request('http://localhost/ag-ui/health'));
    const runResponse = await handler(
      new Request('http://localhost/ag-ui/agent/agent-ember-lending/run', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          threadId: 'thread-ember-1',
          runId: 'run-ember-1',
          messages: [
            {
              id: 'message-ember-1',
              role: 'user',
              content: 'Supply 100 USDC into the lending position.',
            },
          ],
        }),
      }),
    );

    const healthBody = await healthResponse.text();
    const runBody = await runResponse.text();

    expect(healthResponse.status).toBe(200);
    expect(healthBody).toContain('"status":"ok"');
    expect(runResponse.headers.get('content-type')).toContain('text/event-stream');
    expect(runBody).toContain('"execution_completed"');
    expect(runBody).toContain('"lending.supply"');
    expect(privateRuntimeDependencies.fetch).toHaveBeenCalledOnce();
  });
});

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createEmberLendingLocalOwsExecutionSigner } from './localOwsExecutionSigner.js';
import { createEmberLendingDomain } from './sharedEmberAdapter.js';
import {
  resolveSharedEmberTarget,
  TEST_EMBER_LENDING_AGENT_ID,
  TEST_EMBER_LENDING_AGENT_WALLET,
  TEST_EMBER_LENDING_USER_WALLET,
  type StartedSharedEmberTarget,
} from './sharedEmberIntegrationHarness.js';
import { createEmberLendingSharedEmberHttpHost } from './sharedEmberHttpHost.js';

const runSharedEmberIntegration = process.env['RUN_SHARED_EMBER_INT']?.trim() === '1';
const describeSharedEmberIntegration = runSharedEmberIntegration ? describe : describe.skip;

type SignerRequestRecord = {
  path: string;
  body: Record<string, unknown>;
};

function createManagedLifecycleState() {
  return {
    phase: 'active' as const,
    mandateRef: 'mandate-ember-lending-001',
    mandateSummary: 'unwind the managed lending position and return capital',
    mandateContext: {
      network: 'arbitrum',
      protocol: 'aave',
    },
    walletAddress: TEST_EMBER_LENDING_AGENT_WALLET,
    rootUserWalletAddress: TEST_EMBER_LENDING_USER_WALLET,
    rootedWalletContextId: 'rwc-ember-lending-001',
    lastPortfolioState: {
      agent_id: TEST_EMBER_LENDING_AGENT_ID,
      owned_units: [
        {
          unit_id: 'unit-ember-lending-001',
          root_asset: 'USDC',
          quantity: '10',
          reservation_id: 'reservation-ember-lending-001',
        },
      ],
      reservations: [
        {
          reservation_id: 'reservation-ember-lending-001',
          purpose: 'unwind',
          control_path: 'vault.withdraw',
        },
      ],
    },
    lastSharedEmberRevision: 0,
    lastReservationSummary:
      'Reservation reservation-ember-lending-001 unwinds 10 USDC via vault.withdraw.',
    lastCandidatePlan: null,
    lastCandidatePlanSummary: null,
    lastExecutionResult: null,
    lastExecutionTxHash: null,
    lastEscalationRequest: null,
    lastEscalationSummary: null,
  };
}

function createCandidatePlanInput() {
  return {
    idempotencyKey: 'idem-candidate-plan-ember-int-001',
    intent: 'unwind',
    action_summary: 'withdraw the active lending position and return capital',
    candidate_unit_ids: ['unit-ember-lending-001'],
    requested_quantities: [
      {
        unit_id: 'unit-ember-lending-001',
        quantity: '10',
      },
    ],
    decision_context: {
      objective_summary: 'free the reserved capital for the user',
      accounting_state_summary:
        'the reserved unit remains associated with the current delegation',
      why_this_path_is_best:
        'vault.withdraw is the direct path to unwind the managed position',
      consequence_if_delayed: 'the capital remains trapped in the active position',
      alternatives_considered: ['wait for a later retry'],
    },
  };
}

async function readRequestBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

describeSharedEmberIntegration('ember-lending Shared Ember execution integration', () => {
  let target: StartedSharedEmberTarget;
  let signerServer: Server;
  let signerBaseUrl: string;
  let signerRequests: SignerRequestRecord[];

  beforeEach(async () => {
    target = await resolveSharedEmberTarget();
    signerRequests = [];

    signerServer = createServer((request: IncomingMessage, response: ServerResponse) => {
      void (async () => {
        if (request.url !== '/sign/redelegation' && request.url !== '/sign/execution') {
          response.writeHead(404);
          response.end();
          return;
        }

        const body = await readRequestBody(request);
        signerRequests.push({
          path: request.url,
          body,
        });

        if (request.url === '/sign/redelegation') {
          const signingPackage = isRecord(body['redelegationSigningPackage'])
            ? body['redelegationSigningPackage']
            : {};

          response.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
          });
          response.end(
            JSON.stringify({
              signer_wallet_address: body['walletAddress'],
              signed_redelegation: {
                ...signingPackage,
                artifact_ref: 'artifact-ember-lending-int-002',
                issued_at: '2026-04-01T06:16:00Z',
                activated_at: '2026-04-01T06:16:05Z',
                policy_hash: 'hash-ember-lending-int-002',
              },
            }),
          );
          return;
        }

        response.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
        });
        response.end(
          JSON.stringify({
            signer_wallet_address: body['walletAddress'],
            signer_address: body['walletAddress'],
            raw_transaction:
              '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          }),
        );
      })().catch((error: unknown) => {
        response.writeHead(500);
        response.end(error instanceof Error ? error.message : 'unknown error');
      });
    });

    await new Promise<void>((resolve, reject) => {
      signerServer.once('error', reject);
      signerServer.listen(0, '127.0.0.1', () => {
        signerServer.off('error', reject);
        resolve();
      });
    });

    const address = signerServer.address() as AddressInfo;
    signerBaseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    signerServer.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => {
      signerServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    await target?.close();
  });

  it('executes the real Shared Ember request, redelegation registration, and signed-transaction flow through the lending agent service', async () => {
    const protocolHost = createEmberLendingSharedEmberHttpHost({
      baseUrl: target.baseUrl,
    });
    const executionSigner = createEmberLendingLocalOwsExecutionSigner({
      baseUrl: signerBaseUrl,
    });
    const domain = createEmberLendingDomain({
      protocolHost,
      executionSigner,
      agentId: TEST_EMBER_LENDING_AGENT_ID,
    });

    const planResult = await domain.handleOperation?.({
      threadId: 'thread-ember-lending-int-1',
      state: createManagedLifecycleState(),
      operation: {
        source: 'tool',
        name: 'create_transaction_plan',
        input: createCandidatePlanInput(),
      },
    });

    expect(planResult).toMatchObject({
      state: {
        phase: 'active',
        lastCandidatePlan: {
          transaction_plan_id: expect.any(String),
        },
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Candidate lending plan created through the Shared Ember planner.',
        },
      },
    });

    const executeResult = await domain.handleOperation?.({
      threadId: 'thread-ember-lending-int-1',
      state: planResult?.state,
      operation: {
        source: 'tool',
        name: 'request_transaction_execution',
      },
    });

    expect(executeResult).toMatchObject({
      state: {
        phase: 'active',
        lastExecutionResult: {
          phase: 'completed',
          execution: {
            status: 'confirmed',
          },
        },
        lastExecutionTxHash:
          '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Lending transaction execution confirmed through Shared Ember.',
        },
        artifacts: [
          {
            data: {
              type: 'shared-ember-execution-result',
              outcome: 'confirmed',
              transactionHash:
                '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
            },
          },
        ],
      },
    });

    expect(signerRequests.map((entry) => entry.path)).toEqual([
      '/sign/redelegation',
      '/sign/execution',
    ]);

    const transactionPlanId =
      (isRecord(planResult?.state?.lastCandidatePlan)
        ? planResult?.state?.lastCandidatePlan['transaction_plan_id']
        : null) ?? null;

    expect(signerRequests[0]?.body).toMatchObject({
      walletAddress: TEST_EMBER_LENDING_AGENT_WALLET,
      transactionPlanId,
      requestId: expect.any(String),
      redelegationSigningPackage: {
        agent_wallet: TEST_EMBER_LENDING_AGENT_WALLET,
        transaction_plan_id: transactionPlanId,
      },
    });

    expect(signerRequests[1]?.body).toMatchObject({
      walletAddress: TEST_EMBER_LENDING_AGENT_WALLET,
      transactionPlanId,
      requestId: expect.any(String),
      executionSigningPackage: {
        transaction_plan_id: transactionPlanId,
        active_delegation_id: expect.any(String),
        canonical_unsigned_payload_ref: expect.any(String),
      },
    });
  });
});

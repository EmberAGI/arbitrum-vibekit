import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { importWalletPrivateKey } from '@open-wallet-standard/core';
import { createAgentRuntimeSigningService } from 'agent-runtime/internal';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createEmberLendingDomain } from './sharedEmberAdapter.js';
import {
  createSharedEmberExecutionSeed,
  resolveSharedEmberTarget,
  TEST_EMBER_LENDING_AGENT_ID,
  TEST_EMBER_LENDING_AGENT_WALLET,
  TEST_EMBER_LENDING_USER_WALLET,
  type StartedSharedEmberTarget,
} from './sharedEmberIntegrationHarness.js';
import { createEmberLendingSharedEmberHttpHost } from './sharedEmberHttpHost.js';

const runSharedEmberIntegration = process.env['RUN_SHARED_EMBER_INT']?.trim() === '1';
const describeSharedEmberIntegration = runSharedEmberIntegration ? describe : describe.skip;

type SigningRequestRecord = {
  signerRef: string;
  expectedAddress: `0x${string}`;
  payloadKind: string;
  payload: Record<string, unknown>;
};

type ForwardedJsonResponse = {
  status: number;
  rawBody: string;
  parsedBody: unknown;
};

type InterruptedSubmitProxy = {
  baseUrl: string;
  close: () => Promise<void>;
  submitAttempts: Record<string, unknown>[];
  interruptedSubmitResponse: unknown | null;
};

type AuthorityPreparationRecoveryProxy = {
  baseUrl: string;
  close: () => Promise<void>;
  preparationPhases: string[];
};

type WalletRewriteProxy = {
  baseUrl: string;
  close: () => Promise<void>;
  registerSignedRedelegationRequests: Record<string, unknown>[];
};

type RealRuntimeSigningFixture = {
  walletAddress: `0x${string}`;
  runtimeSigning: {
    readAddress: ReturnType<typeof createAgentRuntimeSigningService>['readAddress'];
    signPayload: ReturnType<typeof createAgentRuntimeSigningService>['signPayload'];
  };
  signingRequests: SigningRequestRecord[];
  cleanup: () => void;
};

const TEST_TRANSACTION_SIGNATURE =
  '0x464a27f0b9166323a2d686a053ac34e74c318b59854dcc7de4221837437214870c365e2d8e5060f092656d3bd06f78c324ed296792df9c60f76c68bca5551eb601';
const TEST_REDELEGATION_SIGNATURE =
  '0x464a27f0b9166323a2d686a053ac34e74c318b59854dcc7de4221837437214870c365e2d8e5060f092656d3bd06f78c324ed296792df9c60f76c68bca5551eb601';
const REAL_RUNTIME_PRIVATE_KEY =
  '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function requirePreparedUnsignedTransactionResolver(target: StartedSharedEmberTarget) {
  if (!target.resolvePreparedUnsignedTransaction) {
    throw new Error(
      'Shared Ember execution integration tests require a prepared unsigned transaction resolver.',
    );
  }

  return target.resolvePreparedUnsignedTransaction;
}

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

function rewriteWalletAddressInValue(input: {
  value: unknown;
  fromWalletAddress: string;
  toWalletAddress: string;
}): unknown {
  if (typeof input.value === 'string') {
    return input.value.toLowerCase() === input.fromWalletAddress.toLowerCase()
      ? input.toWalletAddress
      : input.value;
  }

  if (Array.isArray(input.value)) {
    return input.value.map((item) =>
      rewriteWalletAddressInValue({
        value: item,
        fromWalletAddress: input.fromWalletAddress,
        toWalletAddress: input.toWalletAddress,
      }),
    );
  }

  if (isRecord(input.value)) {
    return Object.fromEntries(
      Object.entries(input.value).map(([key, value]) => [
        key,
        rewriteWalletAddressInValue({
          value,
          fromWalletAddress: input.fromWalletAddress,
          toWalletAddress: input.toWalletAddress,
        }),
      ]),
    );
  }

  return input.value;
}

async function closeServer(server: Server): Promise<void> {
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
}

async function forwardJsonRequest(input: {
  targetBaseUrl: string;
  requestPath: string;
  body: Record<string, unknown>;
}): Promise<ForwardedJsonResponse> {
  const response = await fetch(`${input.targetBaseUrl}${input.requestPath}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(input.body),
  });

  const rawBody = await response.text();

  return {
    status: response.status,
    rawBody,
    parsedBody: rawBody.length === 0 ? null : (JSON.parse(rawBody) as unknown),
  };
}

async function startInterruptedSubmitProxy(input: {
  targetBaseUrl: string;
}): Promise<InterruptedSubmitProxy> {
  const submitAttempts: Record<string, unknown>[] = [];
  let interruptedSubmitResponse: unknown | null = null;

  const proxyServer = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      const requestPath = request.url ?? '/jsonrpc';
      const body = await readRequestBody(request);
      const forwarded = await forwardJsonRequest({
        targetBaseUrl: input.targetBaseUrl,
        requestPath,
        body,
      });

      if (requestPath === '/jsonrpc' && body['method'] === 'subagent.submitSignedTransaction.v1') {
        submitAttempts.push(body);

        if (submitAttempts.length === 1) {
          interruptedSubmitResponse = forwarded.parsedBody;
          response.destroy();
          return;
        }
      }

      response.writeHead(forwarded.status, {
        'content-type': 'application/json; charset=utf-8',
      });
      response.end(forwarded.rawBody);
    })().catch((error: unknown) => {
      response.writeHead(500);
      response.end(error instanceof Error ? error.message : 'unknown error');
    });
  });

  await new Promise<void>((resolve, reject) => {
    proxyServer.once('error', reject);
    proxyServer.listen(0, '127.0.0.1', () => {
      proxyServer.off('error', reject);
      resolve();
    });
  });

  const address = proxyServer.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => closeServer(proxyServer),
    submitAttempts,
    get interruptedSubmitResponse() {
      return interruptedSubmitResponse;
    },
  };
}

async function startAuthorityPreparationRecoveryProxy(input: {
  targetBaseUrl: string;
}): Promise<AuthorityPreparationRecoveryProxy> {
  const preparationPhases: string[] = [];
  let repairedAuthority = false;

  const proxyServer = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      const requestPath = request.url ?? '/jsonrpc';
      const body = await readRequestBody(request);
      const forwarded = await forwardJsonRequest({
        targetBaseUrl: input.targetBaseUrl,
        requestPath,
        body,
      });

      if (requestPath === '/jsonrpc' && body['method'] === 'subagent.requestTransactionExecution.v1') {
        const parsedBody = isRecord(forwarded.parsedBody) ? forwarded.parsedBody : null;
        const result = parsedBody && isRecord(parsedBody['result']) ? parsedBody['result'] : null;
        const executionResult = result && isRecord(result['execution_result']) ? result['execution_result'] : null;
        const phase = executionResult ? executionResult['phase'] : null;

        if (typeof phase === 'string') {
          preparationPhases.push(phase);
        }

        if (
          phase === 'authority_preparation_needed' &&
          !repairedAuthority &&
          typeof result?.['revision'] === 'number'
        ) {
          repairedAuthority = true;

          await forwardJsonRequest({
            targetBaseUrl: input.targetBaseUrl,
            requestPath: '/jsonrpc',
            body: {
              jsonrpc: '2.0',
              id: 'authority-preparation-repair-identity',
              method: 'orchestrator.writeAgentServiceIdentity.v1',
              params: {
                idempotency_key: 'idem-authority-preparation-repair-identity',
                expected_revision: result['revision'],
                agent_service_identity: {
                  identity_ref: 'agent-identity-ember-lending-repaired-001',
                  agent_id: TEST_EMBER_LENDING_AGENT_ID,
                  role: 'subagent',
                  wallet_address: TEST_EMBER_LENDING_AGENT_WALLET,
                  wallet_source: 'ember_local_write',
                  capability_metadata: {
                    execution: true,
                    onboarding: true,
                  },
                  registration_version: 2,
                  registered_at: '2026-04-01T06:15:00Z',
                },
              },
            },
          });
        }
      }

      response.writeHead(forwarded.status, {
        'content-type': 'application/json; charset=utf-8',
      });
      response.end(forwarded.rawBody);
    })().catch((error: unknown) => {
      response.writeHead(500);
      response.end(error instanceof Error ? error.message : 'unknown error');
    });
  });

  await new Promise<void>((resolve, reject) => {
    proxyServer.once('error', reject);
    proxyServer.listen(0, '127.0.0.1', () => {
      proxyServer.off('error', reject);
      resolve();
    });
  });

  const address = proxyServer.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => closeServer(proxyServer),
    preparationPhases,
  };
}

async function startWalletRewriteProxy(input: {
  targetBaseUrl: string;
  fromWalletAddress: `0x${string}`;
  toWalletAddress: `0x${string}`;
}): Promise<WalletRewriteProxy> {
  const registerSignedRedelegationRequests: Record<string, unknown>[] = [];

  const proxyServer = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      const requestPath = request.url ?? '/jsonrpc';
      const originalBody = await readRequestBody(request);

      if (
        requestPath === '/jsonrpc' &&
        originalBody['method'] === 'orchestrator.registerSignedRedelegation.v1'
      ) {
        registerSignedRedelegationRequests.push(originalBody);
      }

      const forwarded = await forwardJsonRequest({
        targetBaseUrl: input.targetBaseUrl,
        requestPath,
        body: rewriteWalletAddressInValue({
          value: originalBody,
          fromWalletAddress: input.toWalletAddress,
          toWalletAddress: input.fromWalletAddress,
        }) as Record<string, unknown>,
      });
      const rewrittenResponse = rewriteWalletAddressInValue({
        value: forwarded.parsedBody,
        fromWalletAddress: input.fromWalletAddress,
        toWalletAddress: input.toWalletAddress,
      });

      response.writeHead(forwarded.status, {
        'content-type': 'application/json; charset=utf-8',
      });
      response.end(forwarded.rawBody.length === 0 ? '' : JSON.stringify(rewrittenResponse));
    })().catch((error: unknown) => {
      response.writeHead(500);
      response.end(error instanceof Error ? error.message : 'unknown error');
    });
  });

  await new Promise<void>((resolve, reject) => {
    proxyServer.once('error', reject);
    proxyServer.listen(0, '127.0.0.1', () => {
      proxyServer.off('error', reject);
      resolve();
    });
  });

  const address = proxyServer.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => closeServer(proxyServer),
    registerSignedRedelegationRequests,
  };
}

async function createRealRuntimeSigningFixture(): Promise<RealRuntimeSigningFixture> {
  const vaultPath = mkdtempSync(path.join(os.tmpdir(), 'ember-lending-runtime-ows-'));
  importWalletPrivateKey('service-wallet', REAL_RUNTIME_PRIVATE_KEY, undefined, vaultPath, 'evm');

  const realRuntimeSigning = createAgentRuntimeSigningService({
    env: {
      TEST_RUNTIME_OWS_WALLET_NAME: 'service-wallet',
      TEST_RUNTIME_OWS_VAULT_PATH: vaultPath,
    },
    owsSigners: [
      {
        signerRef: 'service-wallet',
        walletNameOrIdEnvVar: 'TEST_RUNTIME_OWS_WALLET_NAME',
        vaultPathEnvVar: 'TEST_RUNTIME_OWS_VAULT_PATH',
      },
    ],
  });
  const walletAddress = await realRuntimeSigning.readAddress({
    signerRef: 'service-wallet',
  });
  const signingRequests: SigningRequestRecord[] = [];

  return {
    walletAddress,
    signingRequests,
    runtimeSigning: {
      readAddress(input) {
        return realRuntimeSigning.readAddress(input);
      },
      async signPayload(input) {
        signingRequests.push({
          signerRef: input.signerRef,
          expectedAddress: input.expectedAddress,
          payloadKind: input.payloadKind,
          payload: input.payload,
        });

        return realRuntimeSigning.signPayload(input);
      },
    },
    cleanup() {
      rmSync(vaultPath, {
        recursive: true,
        force: true,
      });
    },
  };
}

function createRuntimeSigningHarness() {
  const signingRequests: SigningRequestRecord[] = [];

  return {
    signingRequests,
    runtimeSigning: {
      async readAddress() {
        return TEST_EMBER_LENDING_AGENT_WALLET;
      },
      async signPayload(input: {
        signerRef: string;
        expectedAddress: `0x${string}`;
        payloadKind: string;
        payload: Record<string, unknown>;
      }) {
        signingRequests.push({
          signerRef: input.signerRef,
          expectedAddress: input.expectedAddress,
          payloadKind: input.payloadKind,
          payload: input.payload,
        });

        if (input.payloadKind === 'typed-data') {
          return {
            confirmedAddress: TEST_EMBER_LENDING_AGENT_WALLET,
            signedPayload: {
              signature: TEST_REDELEGATION_SIGNATURE,
            },
          };
        }

        return {
          confirmedAddress: TEST_EMBER_LENDING_AGENT_WALLET,
          signedPayload: {
            signature: TEST_TRANSACTION_SIGNATURE,
            recoveryId: 1,
          },
        };
      },
    },
  };
}

describeSharedEmberIntegration('ember-lending Shared Ember execution integration', () => {
  let target: StartedSharedEmberTarget;

  beforeEach(async () => {
    target = await resolveSharedEmberTarget();
  });

  afterEach(async () => {
    await target?.close().catch(() => undefined);
  });

  it('executes the real Shared Ember request, redelegation registration, and signed-transaction flow through the lending agent service', async () => {
    const { runtimeSigning, signingRequests } = createRuntimeSigningHarness();
    const protocolHost = createEmberLendingSharedEmberHttpHost({
      baseUrl: target.baseUrl,
    });
    const domain = createEmberLendingDomain({
      protocolHost,
      runtimeSigning,
      resolvePreparedUnsignedTransaction: requirePreparedUnsignedTransactionResolver(target),
      runtimeSignerRef: 'service-wallet',
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

    expect(signingRequests.map((entry) => entry.payloadKind)).toEqual([
      'typed-data',
      'transaction',
    ]);

    const transactionPlanId =
      (isRecord(planResult?.state?.lastCandidatePlan)
        ? planResult?.state?.lastCandidatePlan['transaction_plan_id']
        : null) ?? null;

    expect(signingRequests[0]).toMatchObject({
      signerRef: 'service-wallet',
      expectedAddress: TEST_EMBER_LENDING_AGENT_WALLET,
      payloadKind: 'typed-data',
      payload: {
        chain: 'evm',
        typedData: expect.any(Object),
      },
    });

    expect(signingRequests[1]).toMatchObject({
      signerRef: 'service-wallet',
      expectedAddress: TEST_EMBER_LENDING_AGENT_WALLET,
      payloadKind: 'transaction',
      payload: {
        chain: 'evm',
        unsignedTransactionHex: expect.stringMatching(/^0x[0-9a-f]+$/),
      },
    });
  });

  it('executes the redelegation path through the real runtime-owned typed-data signer', async () => {
    const signingFixture = await createRealRuntimeSigningFixture();
    const walletRewriteProxy = await startWalletRewriteProxy({
      targetBaseUrl: target.baseUrl,
      fromWalletAddress: TEST_EMBER_LENDING_AGENT_WALLET,
      toWalletAddress: signingFixture.walletAddress,
    });
    const protocolHost = createEmberLendingSharedEmberHttpHost({
      baseUrl: walletRewriteProxy.baseUrl,
    });
    const domain = createEmberLendingDomain({
      protocolHost,
      runtimeSigning: signingFixture.runtimeSigning,
      resolvePreparedUnsignedTransaction: requirePreparedUnsignedTransactionResolver(target),
      runtimeSignerRef: 'service-wallet',
      agentId: TEST_EMBER_LENDING_AGENT_ID,
    });

    try {
      const planResult = await domain.handleOperation?.({
        threadId: 'thread-ember-lending-int-real-runtime-signing-1',
        state: {
          ...createManagedLifecycleState(),
          walletAddress: signingFixture.walletAddress,
        },
        operation: {
          source: 'tool',
          name: 'create_transaction_plan',
          input: createCandidatePlanInput(),
        },
      });

      const executeResult = await domain.handleOperation?.({
        threadId: 'thread-ember-lending-int-real-runtime-signing-1',
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
        },
        outputs: {
          status: {
            executionStatus: 'completed',
            statusMessage: 'Lending transaction execution confirmed through Shared Ember.',
          },
        },
      });

      expect(signingFixture.signingRequests.map((entry) => entry.payloadKind)).toEqual([
        'typed-data',
        'transaction',
      ]);
      expect(walletRewriteProxy.registerSignedRedelegationRequests).toHaveLength(1);
      expect(walletRewriteProxy.registerSignedRedelegationRequests[0]).toMatchObject({
        method: 'orchestrator.registerSignedRedelegation.v1',
        params: {
          signed_redelegation: {
            agent_wallet: signingFixture.walletAddress,
            artifact_ref: expect.stringMatching(/^metamask-delegation:/),
            issued_at: expect.any(String),
            activated_at: expect.any(String),
            policy_hash: expect.stringMatching(/^policy-/),
          },
        },
      });
    } finally {
      await walletRewriteProxy.close();
      signingFixture.cleanup();
    }
  });

  it('surfaces a repo-backed blocked execution result without signing or submitting', async () => {
    await target.close();
    target = await resolveSharedEmberTarget({
      bootstrap: {
        initialState: createSharedEmberExecutionSeed({
          competingReservation: true,
        }),
      },
    });

    const protocolHost = createEmberLendingSharedEmberHttpHost({
      baseUrl: target.baseUrl,
    });
    const { runtimeSigning, signingRequests } = createRuntimeSigningHarness();
    const domain = createEmberLendingDomain({
      protocolHost,
      runtimeSigning,
      resolvePreparedUnsignedTransaction: requirePreparedUnsignedTransactionResolver(target),
      runtimeSignerRef: 'service-wallet',
      agentId: TEST_EMBER_LENDING_AGENT_ID,
    });

    const planResult = await domain.handleOperation?.({
      threadId: 'thread-ember-lending-int-blocked-1',
      state: createManagedLifecycleState(),
      operation: {
        source: 'tool',
        name: 'create_transaction_plan',
        input: createCandidatePlanInput(),
      },
    });

    const executeResult = await domain.handleOperation?.({
      threadId: 'thread-ember-lending-int-blocked-1',
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
          phase: 'blocked',
          request_result: {
            result: 'needs_release_or_transfer',
            blocking_reason_code: 'reserved_for_other_agent',
          },
        },
        lastExecutionTxHash: null,
      },
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Lending transaction execution request was blocked by Shared Ember: another agent currently holds the controlling reservation.',
        },
        artifacts: [
          {
            data: {
              type: 'shared-ember-execution-result',
              outcome: 'blocked',
            },
          },
        ],
      },
    });

    expect(signingRequests).toEqual([]);
  });

  it('polls through a repo-backed authority-preparation response before reaching local execution signing', async () => {
    await target.close();
    target = await resolveSharedEmberTarget({
      bootstrap: {
        initialState: createSharedEmberExecutionSeed({
          omitAgentServiceIdentity: true,
        }),
      },
    });

    const proxy = await startAuthorityPreparationRecoveryProxy({
      targetBaseUrl: target.baseUrl,
    });

    try {
      const protocolHost = createEmberLendingSharedEmberHttpHost({
        baseUrl: proxy.baseUrl,
      });
      const { runtimeSigning, signingRequests } = createRuntimeSigningHarness();
      const domain = createEmberLendingDomain({
        protocolHost,
        runtimeSigning,
        resolvePreparedUnsignedTransaction: requirePreparedUnsignedTransactionResolver(target),
        runtimeSignerRef: 'service-wallet',
        agentId: TEST_EMBER_LENDING_AGENT_ID,
      });

      const planResult = await domain.handleOperation?.({
        threadId: 'thread-ember-lending-int-authority-prep-1',
        state: createManagedLifecycleState(),
        operation: {
          source: 'tool',
          name: 'create_transaction_plan',
          input: createCandidatePlanInput(),
        },
      });

      const executeResult = await domain.handleOperation?.({
        threadId: 'thread-ember-lending-int-authority-prep-1',
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
        },
      });

      expect(proxy.preparationPhases).toEqual([
        'authority_preparation_needed',
        'ready_for_redelegation',
      ]);
      expect(signingRequests.map((entry) => entry.payloadKind)).toEqual([
        'typed-data',
        'transaction',
      ]);
    } finally {
      await proxy.close();
    }
  });

  it('resumes after a dropped submit response without duplicate runtime-owned signing or duplicate upstream submission', async () => {
    const proxy = await startInterruptedSubmitProxy({
      targetBaseUrl: target.baseUrl,
    });

    try {
      const protocolHost = createEmberLendingSharedEmberHttpHost({
        baseUrl: proxy.baseUrl,
      });
      const { runtimeSigning, signingRequests } = createRuntimeSigningHarness();
      const domain = createEmberLendingDomain({
        protocolHost,
        runtimeSigning,
        resolvePreparedUnsignedTransaction: requirePreparedUnsignedTransactionResolver(target),
        runtimeSignerRef: 'service-wallet',
        agentId: TEST_EMBER_LENDING_AGENT_ID,
      });
      const threadId = 'thread-ember-lending-int-transport-retry';
      const executionInput = {
        idempotencyKey: 'idem-execute-transaction-plan-ember-int-transport-retry',
      };

      const planResult = await domain.handleOperation?.({
        threadId,
        state: createManagedLifecycleState(),
        operation: {
          source: 'tool',
          name: 'create_transaction_plan',
          input: createCandidatePlanInput(),
        },
      });

      const interruptedResult = await domain.handleOperation?.({
        threadId,
        state: planResult?.state,
        operation: {
          source: 'tool',
          name: 'request_transaction_execution',
          input: executionInput,
        },
      });

      expect(interruptedResult).toMatchObject({
        outputs: {
          status: {
            executionStatus: 'failed',
          },
        },
      });

      const resumedResult = await domain.handleOperation?.({
        threadId,
        state: interruptedResult?.state,
        operation: {
          source: 'tool',
          name: 'request_transaction_execution',
          input: executionInput,
        },
      });

      expect(resumedResult).toMatchObject({
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
        },
      });

      expect(proxy.submitAttempts).toHaveLength(1);
      expect(proxy.interruptedSubmitResponse).toMatchObject({
        result: {
          execution_result: {
            execution: {
              status: 'confirmed',
            },
          },
        },
      });
      expect(signingRequests.map((entry) => entry.payloadKind)).toEqual([
        'typed-data',
        'transaction',
      ]);
    } finally {
      await proxy.close();
    }
  });
});

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
} from '../test-support/sharedEmberIntegrationHarness.js';
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

type ReadyForRedelegationWork = {
  revision: number;
  requestId: string;
  transactionPlanId: string;
  redelegationSigningPackage: Record<string, unknown>;
};

type RedelegationCompletionProxy = {
  baseUrl: string;
  close: () => Promise<void>;
  waitRequests: Record<string, unknown>[];
  registrationRequests: Record<string, unknown>[];
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
const REAL_RUNTIME_PRIVATE_KEY =
  '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function requireAnchoredPayloadResolver(target: StartedSharedEmberTarget) {
  if (!target.anchoredPayloadResolver) {
    throw new Error(
      'Shared Ember execution integration tests require an anchored payload resolver.',
    );
  }

  return target.anchoredPayloadResolver;
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
    anchoredPayloadRecords: [],
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

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readCommittedEvent(value: unknown): {
  sequence?: number;
  event_type?: string;
  payload?: Record<string, unknown>;
} | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    sequence: typeof value['sequence'] === 'number' ? value['sequence'] : undefined,
    event_type: readString(value['event_type']) ?? undefined,
    payload: isRecord(value['payload']) ? value['payload'] : undefined,
  };
}

function readReadyForRedelegationWork(input: {
  revision: number | null;
  events: unknown[];
}): ReadyForRedelegationWork | null {
  if (input.revision === null) {
    return null;
  }

  const matchingEvent = input.events
    .map((event) => readCommittedEvent(event))
    .filter((event): event is NonNullable<ReturnType<typeof readCommittedEvent>> => event !== null)
    .filter(
      (event) =>
        event.event_type === 'requestExecution.prepared.v1' &&
        readString(event.payload?.['phase']) === 'ready_for_redelegation',
    )
    .sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0))
    .at(-1);

  const requestId = readString(matchingEvent?.payload?.['request_id']);
  const transactionPlanId = readString(matchingEvent?.payload?.['transaction_plan_id']);
  const redelegationSigningPackage = isRecord(
    matchingEvent?.payload?.['redelegation_signing_package'],
  )
    ? matchingEvent.payload['redelegation_signing_package']
    : null;

  if (!requestId || !transactionPlanId || !redelegationSigningPackage) {
    return null;
  }

  return {
    revision: input.revision,
    requestId,
    transactionPlanId,
    redelegationSigningPackage,
  };
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

async function startRedelegationCompletionProxy(input: {
  targetBaseUrl: string;
}): Promise<RedelegationCompletionProxy> {
  const waitRequests: Record<string, unknown>[] = [];
  const registrationRequests: Record<string, unknown>[] = [];
  let observedRedelegationWork: ReadyForRedelegationWork | null = null;
  let completedRegistration = false;

  const proxyServer = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      const requestPath = request.url ?? '/jsonrpc';
      const body = await readRequestBody(request);

      if (requestPath === '/jsonrpc' && body['method'] === 'readCommittedEventOutbox.v1') {
        const forwarded = await forwardJsonRequest({
          targetBaseUrl: input.targetBaseUrl,
          requestPath,
          body,
        });

        const parsedBody = isRecord(forwarded.parsedBody) ? forwarded.parsedBody : null;
        const result = parsedBody && isRecord(parsedBody['result']) ? parsedBody['result'] : null;
        observedRedelegationWork =
          readReadyForRedelegationWork({
            revision: typeof result?.['revision'] === 'number' ? result['revision'] : null,
            events: Array.isArray(result?.['events']) ? result['events'] : [],
          }) ?? observedRedelegationWork;

        response.writeHead(forwarded.status, {
          'content-type': 'application/json; charset=utf-8',
        });
        response.end(forwarded.rawBody);
        return;
      }

      if (requestPath === '/jsonrpc' && body['method'] === 'waitCommittedEventOutbox.v1') {
        waitRequests.push(body);
        const waitPromise = forwardJsonRequest({
          targetBaseUrl: input.targetBaseUrl,
          requestPath,
          body,
        });

        if (!completedRegistration) {
          if (!observedRedelegationWork) {
            throw new Error(
              'Expected a ready_for_redelegation committed outbox event before waitCommittedEventOutbox.',
            );
          }

          completedRegistration = true;
          const registrationRequest = {
            jsonrpc: '2.0',
            id: `redelegation-completion-${observedRedelegationWork.requestId}`,
            method: 'orchestrator.registerSignedRedelegation.v1',
            params: {
              idempotency_key: `idem-redelegation-completion-${observedRedelegationWork.requestId}`,
              expected_revision: observedRedelegationWork.revision,
              transaction_plan_id: observedRedelegationWork.transactionPlanId,
              signed_redelegation: {
                ...observedRedelegationWork.redelegationSigningPackage,
                artifact_ref: `artifact-redelegation-completion-${observedRedelegationWork.requestId}`,
                issued_at: '2026-04-01T06:17:00Z',
                activated_at: '2026-04-01T06:17:05Z',
                policy_hash: `hash-redelegation-completion-${observedRedelegationWork.requestId}`,
              },
            },
          } satisfies Record<string, unknown>;
          registrationRequests.push(registrationRequest);
          const registrationResponse = await forwardJsonRequest({
            targetBaseUrl: input.targetBaseUrl,
            requestPath: '/jsonrpc',
            body: registrationRequest,
          });

          if (
            isRecord(registrationResponse.parsedBody) &&
            isRecord(registrationResponse.parsedBody['error'])
          ) {
            throw new Error(
              `Redelegation completion proxy failed to register the signed redelegation: ${String(
                registrationResponse.parsedBody['error']['message'],
              )}`,
            );
          }
        }

        const forwarded = await waitPromise;
        response.writeHead(forwarded.status, {
          'content-type': 'application/json; charset=utf-8',
        });
        response.end(forwarded.rawBody);
        return;
      }

      const forwarded = await forwardJsonRequest({
        targetBaseUrl: input.targetBaseUrl,
        requestPath,
        body,
      });

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
    waitRequests,
    registrationRequests,
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

  it('stops at Shared Ember-managed redelegation instead of signing and submitting locally', async () => {
    const { runtimeSigning, signingRequests } = createRuntimeSigningHarness();
    const protocolHost = createEmberLendingSharedEmberHttpHost({
      baseUrl: target.baseUrl,
    });
    const domain = createEmberLendingDomain({
      protocolHost,
      runtimeSigning,
      anchoredPayloadResolver: requireAnchoredPayloadResolver(target),
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
          phase: 'ready_for_redelegation',
        },
        lastExecutionTxHash: null,
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage:
            'Lending transaction execution is waiting for Shared Ember-managed redelegation.',
        },
        artifacts: [
          {
            data: {
              type: 'shared-ember-execution-result',
              outcome: 'ready_for_redelegation',
            },
          },
        ],
      },
    });

    expect(signingRequests).toHaveLength(0);
  });

  it('does not use the real runtime-owned signer for redelegation while Shared Ember owns that control-plane step', async () => {
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
      anchoredPayloadResolver: requireAnchoredPayloadResolver(target),
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
            phase: 'ready_for_redelegation',
          },
        },
        outputs: {
          status: {
            executionStatus: 'completed',
            statusMessage:
              'Lending transaction execution is waiting for Shared Ember-managed redelegation.',
          },
        },
      });

      expect(signingFixture.signingRequests).toHaveLength(0);
      expect(walletRewriteProxy.registerSignedRedelegationRequests).toHaveLength(0);
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
      anchoredPayloadResolver: requireAnchoredPayloadResolver(target),
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

  it('polls through authority preparation and then stops at Shared Ember-managed redelegation', async () => {
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
        anchoredPayloadResolver: requireAnchoredPayloadResolver(target),
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
            phase: 'ready_for_redelegation',
          },
          lastExecutionTxHash: null,
        },
        outputs: {
          status: {
            executionStatus: 'completed',
            statusMessage:
              'Lending transaction execution is waiting for Shared Ember-managed redelegation.',
          },
        },
      });

      expect(proxy.preparationPhases).toEqual([
        'authority_preparation_needed',
        'ready_for_redelegation',
      ]);
      expect(signingRequests).toHaveLength(0);
    } finally {
      await proxy.close();
    }
  });

  it('waits through repo-backed orchestrator progress and completes execution in the same call', async () => {
    const proxy = await startRedelegationCompletionProxy({
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
        anchoredPayloadResolver: requireAnchoredPayloadResolver(target),
        runtimeSignerRef: 'service-wallet',
        agentId: TEST_EMBER_LENDING_AGENT_ID,
      });

      const planResult = await domain.handleOperation?.({
        threadId: 'thread-ember-lending-int-fast-resume-1',
        state: createManagedLifecycleState(),
        operation: {
          source: 'tool',
          name: 'create_transaction_plan',
          input: createCandidatePlanInput(),
        },
      });

      const executeResult = await domain.handleOperation?.({
        threadId: 'thread-ember-lending-int-fast-resume-1',
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
              transaction_hash:
                '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
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

      expect(proxy.waitRequests).toHaveLength(1);
      expect(proxy.registrationRequests).toHaveLength(1);
      expect(proxy.registrationRequests[0]).toMatchObject({
        method: 'orchestrator.registerSignedRedelegation.v1',
        params: {
          transaction_plan_id: expect.stringMatching(/^txplan-/),
          signed_redelegation: expect.objectContaining({
            request_id: expect.stringMatching(/^req-/),
            transaction_plan_id: expect.stringMatching(/^txplan-/),
            agent_id: TEST_EMBER_LENDING_AGENT_ID,
            agent_wallet: TEST_EMBER_LENDING_AGENT_WALLET,
          }),
        },
      });
      expect(signingRequests).toHaveLength(1);
      expect(signingRequests[0]).toMatchObject({
        signerRef: 'service-wallet',
        expectedAddress: TEST_EMBER_LENDING_AGENT_WALLET,
        payloadKind: 'transaction',
      });
    } finally {
      await proxy.close();
    }
  });

  it('does not enter submit-retry handling before Shared Ember-managed redelegation completes', async () => {
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
        anchoredPayloadResolver: requireAnchoredPayloadResolver(target),
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
        state: {
          phase: 'active',
          lastExecutionResult: {
            phase: 'ready_for_redelegation',
          },
          lastExecutionTxHash: null,
        },
        outputs: {
          status: {
            executionStatus: 'completed',
            statusMessage:
              'Lending transaction execution is waiting for Shared Ember-managed redelegation.',
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
            phase: 'ready_for_redelegation',
          },
          lastExecutionTxHash: null,
        },
        outputs: {
          status: {
            executionStatus: 'completed',
            statusMessage:
              'Lending transaction execution is waiting for Shared Ember-managed redelegation.',
          },
        },
      });

      expect(proxy.submitAttempts).toHaveLength(0);
      expect(proxy.interruptedSubmitResponse).toBeNull();
      expect(signingRequests).toHaveLength(0);
    } finally {
      await proxy.close();
    }
  });
});

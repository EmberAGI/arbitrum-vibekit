import type { Server } from 'http';

import type { Artifact, Task, TaskStatusUpdateEvent } from '@a2a-js/sdk';
import { A2AClient } from '@a2a-js/sdk/client';
import {
  Implementation,
  toMetaMaskSmartAccount,
  type MetaMaskSmartAccount,
  getDeleGatorEnvironment,
  signDelegation as signDelegationWithPrivateKey,
  type Delegation,
} from '@metamask/delegation-toolkit';
import { v4 as uuidv4 } from 'uuid';
import type { Hex } from 'viem';
import type { privateKeyToAccount } from 'viem/accounts';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { AgentConfigHandle } from '../../src/config/runtime/init.js';
import { serviceConfig } from '../../src/config.js';
import { WorkflowRuntime } from '../../src/workflow/runtime.js';
import {
  X402_REQUIREMENTS_KEY,
  X402_STATUS_KEY,
  X402_PAYMENT_PAYLOAD_KEY,
  X402_RECEIPTS_KEY,
} from '../../src/workflow/x402-types.js';
import usdaiStrategyWorkflow from '../fixtures/workflows/usdai-strategy.js';
import { createClients } from '../fixtures/workflows/utils/clients.js';
import { verifySuccessScenario } from '../fixtures/workflows/x402-payloads.js';
import { get7702TestAccount, getTestChainId } from '../utils/lifecycle-test-helpers.js';
import {
  cleanupTestServer,
  createTestA2AServerWithStubs,
} from '../utils/test-server-with-stubs.js';
// (moved earlier to satisfy import/order)

// Configure facilitator URL for tests and enable x402 in fixture
beforeAll(() => {
  (serviceConfig as unknown as { x402?: { facilitatorUrl?: string } }).x402 = {
    facilitatorUrl: 'http://localhost:3402',
  };
  process.env['A2A_TEST_REQUIRE_X402_PAYMENT'] = '1';
});

const TEST_AMOUNT = '1000'; // 1000 USDai

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function getTaskResult(client: A2AClient, taskId: string): Promise<Task | undefined> {
  const response = await client.getTask({ id: taskId });
  if ('result' in response) {
    return response.result;
  }
  return undefined;
}

async function waitForTaskState(
  client: A2AClient,
  taskId: string,
  predicate: (task: Task | undefined) => boolean,
  attempts: number = 100,
  delayMs: number = 50,
): Promise<Task | undefined> {
  let task: Task | undefined;
  for (let attempt = 0; attempt < attempts; attempt++) {
    task = await getTaskResult(client, taskId);
    if (predicate(task)) {
      break;
    }
    await wait(delayMs);
  }
  return task;
}

// Type guards and helpers to avoid `any`
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const hasKind = (v: unknown, kind: string): boolean =>
  isObject(v) && (v as { kind?: unknown }).kind === kind;

const getStatusMessage = (
  e: unknown,
): { metadata?: Record<string, unknown>; parts?: unknown[] } | undefined => {
  if (!isObject(e)) return undefined;
  const status = (e as { status?: unknown }).status;
  if (!isObject(status)) return undefined;
  const message = (status as { message?: unknown }).message;
  if (!isObject(message)) return undefined;
  const metadata = (message as { metadata?: unknown }).metadata;
  const parts = (message as { parts?: unknown }).parts;
  return {
    metadata: isObject(metadata) ? metadata : undefined,
    parts: Array.isArray(parts) ? parts : undefined,
  };
};

const findPartMetadata = (parts?: unknown[]): Record<string, unknown> | undefined => {
  if (!parts) return undefined;
  for (const p of parts) {
    if (isObject(p)) {
      const md = (p as { metadata?: unknown }).metadata;
      if (isObject(md)) return md;
    }
  }
  return undefined;
};

const isStatusUpdate = (e: unknown): e is TaskStatusUpdateEvent => hasKind(e, 'status-update');

function omitSignature<T extends { signature?: unknown }>(obj: T): Omit<T, 'signature'> {
  const { signature: _ignored, ...rest } = obj as T & Record<string, unknown>;
  return rest as Omit<T, 'signature'>;
}

describe('USDai Strategy Workflow Integration (x402 enabled) @api @evm', () => {
  let runtime: WorkflowRuntime;
  let client: A2AClient;
  let server: Server;
  let agentConfigHandle: AgentConfigHandle;
  let baseUrl: string;

  // Wallet/delegation setup
  let testAccount: ReturnType<typeof privateKeyToAccount>;
  let userSmartAccount: MetaMaskSmartAccount;

  beforeEach(async () => {
    // Initialize workflow runtime (fixture reads env at execution time)
    runtime = new WorkflowRuntime();
    runtime.register(usdaiStrategyWorkflow);

    // Create test A2A server with workflow runtime
    const result = await createTestA2AServerWithStubs({
      port: 0,
      workflowRuntime: runtime,
    });
    server = result.server;
    agentConfigHandle = result.agentConfigHandle;

    const address = server.address();
    if (address && typeof address === 'object') {
      baseUrl = `http://127.0.0.1:${address.port}`;
    } else {
      throw new Error('Server address not available');
    }

    // Initialize A2A client
    const cardUrl = `${baseUrl}/.well-known/agent.json`;
    client = await A2AClient.fromCardUrl(cardUrl);

    // Load test account env and create user smart account
    testAccount = get7702TestAccount();
    const clients = createClients();
    userSmartAccount = await toMetaMaskSmartAccount({
      client: clients.public,
      implementation: Implementation.Hybrid,
      deployParams: [testAccount.address, [], [], []],
      deploySalt: '0x',
      signer: { account: testAccount },
    });
  }, 10000);

  afterEach(async () => {
    if (server && agentConfigHandle) {
      await cleanupTestServer(server, agentConfigHandle);
    }
  });

  it('should complete workflow with x402 payment, emitting receipts metadata', async () => {
    // Track events
    const workflowEvents: Array<unknown> = [];
    const artifacts: Artifact[] = [];

    // Given an initialized runtime with x402 enabled and a user smart account
    // When the workflow is dispatched
    const messageId = uuidv4();
    const parentStream = client.sendMessageStream({
      message: {
        kind: 'message',
        messageId,
        role: 'user',
        parts: [{ kind: 'text', text: 'Execute USDai strategy workflow (x402)' }],
      },
    });

    let contextId: string | undefined;
    let workflowTaskId: string | undefined;

    const parentEventsPromise = (async () => {
      for await (const event of parentStream) {
        if (event.kind === 'task' && event.contextId) contextId = event.contextId;
        if (event.kind === 'status-update' && event.status.message?.referenceTaskIds) {
          workflowTaskId = event.status.message.referenceTaskIds[0];
        }
        if (event.kind === 'status-update' && event.final) break;
      }
    })();

    await parentEventsPromise;
    expect(workflowTaskId).toBeDefined();
    if (!workflowTaskId) throw new Error('Workflow task ID not found');
    const wfTaskId: string = workflowTaskId;

    // 2) Backfill initial task state and artifacts
    const initialTask = await waitForTaskState(client, wfTaskId, (task) => !!task?.status?.state);
    const workflowContextId = initialTask?.contextId ?? contextId;
    if (!workflowContextId) {
      throw new Error('Workflow context ID not found');
    }
    const ctxId: string = workflowContextId;
    if (initialTask?.artifacts?.length) {
      for (const artifact of initialTask.artifacts) {
        if (!artifacts.some((a) => a.artifactId === artifact.artifactId)) artifacts.push(artifact);
      }
    }

    // 3) Subscribe to workflow stream and handle pauses
    const workflowStream = client.resubscribeTask({ id: wfTaskId }) as AsyncIterable<unknown>;

    let paymentHandled = false;
    let walletInputHandled = false;
    let delegationsHandled = false;
    let sawPaymentRequirements = false;
    let sawPaymentReceipts = false;

    // Defer immediate payment submission until handlers are defined below

    const handlePaymentPause = async (evt: unknown): Promise<void> => {
      const msg = getStatusMessage(evt);
      let messageMetadata = msg?.metadata;
      const partMetadata = findPartMetadata(msg?.parts);
      let taskMetadata = messageMetadata ?? partMetadata;

      // Fallback: fetch latest task status to read metadata if not present on this event
      if (!taskMetadata) {
        const latest = await getTaskResult(client, wfTaskId);
        const latestMessageMd = latest?.status?.message?.metadata as
          | Record<string, unknown>
          | undefined;
        const latestParts = latest?.status?.message?.parts as unknown[] | undefined;
        const latestPartMd = findPartMetadata(latestParts);
        taskMetadata = latestMessageMd ?? latestPartMd;
        messageMetadata = latestMessageMd;
      }
      expect(taskMetadata).toBeDefined();
      expect(taskMetadata?.[X402_REQUIREMENTS_KEY]).toBeDefined();
      sawPaymentRequirements = true;

      // Submit recorded successful payment payload
      await client.sendMessage({
        message: {
          kind: 'message',
          messageId: uuidv4(),
          contextId: ctxId,
          taskId: wfTaskId,
          role: 'user',
          metadata: {
            [X402_STATUS_KEY]: 'payment-submitted',
            [X402_PAYMENT_PAYLOAD_KEY]: verifySuccessScenario.paymentPayload,
          },
          parts: [{ kind: 'text', text: 'Submitting x402 payment payload' }],
        },
        configuration: { blocking: false },
      });
      paymentHandled = true;
    };

    const handleWalletPause = async (): Promise<void> => {
      await client.sendMessage({
        message: {
          kind: 'message',
          messageId: uuidv4(),
          contextId: ctxId,
          taskId: wfTaskId,
          role: 'user',
          parts: [
            {
              kind: 'data',
              data: { walletAddress: userSmartAccount.address, amount: TEST_AMOUNT },
            },
          ],
        },
        configuration: { blocking: false },
      });
      walletInputHandled = true;
    };

    const handleDelegationsPause = async (): Promise<void> => {
      const delegationsArtifact =
        artifacts.find((a) => a.artifactId === 'delegations-data') ??
        initialTask?.artifacts?.find((a) => a.artifactId === 'delegations-data');
      expect(delegationsArtifact).toBeDefined();
      const delegationsData = delegationsArtifact!.parts
        .filter((p) => p.kind === 'data')
        .map((p) => (p.kind === 'data' ? p.data : null))
        .filter(Boolean) as Array<{ id: string; delegation: Delegation }>;

      const rawPrivateKey = process.env['A2A_TEST_7702_PRIVATE_KEY'];
      if (!rawPrivateKey || !rawPrivateKey.startsWith('0x') || rawPrivateKey.length !== 66) {
        throw new Error(
          'A2A_TEST_7702_PRIVATE_KEY not configured. Must be a 0x-prefixed 64-hex-char private key.',
        );
      }
      const testPrivateKey = rawPrivateKey as Hex;
      const chainId = getTestChainId();
      const delegationEnvironment = getDeleGatorEnvironment(chainId);

      const signedDelegations = await Promise.all(
        delegationsData.map(async ({ id, delegation }) => {
          const unsignedDelegation = omitSignature(delegation);
          const signedDelegation = await signDelegationWithPrivateKey({
            privateKey: testPrivateKey,
            delegation: unsignedDelegation,
            delegationManager: delegationEnvironment.DelegationManager,
            chainId,
          });
          return { id, signedDelegation };
        }),
      );

      await client.sendMessage({
        message: {
          kind: 'message',
          messageId: uuidv4(),
          contextId: ctxId,
          taskId: wfTaskId,
          role: 'user',
          parts: [{ kind: 'data', data: { delegations: signedDelegations } }],
        },
        configuration: { blocking: false },
      });
      delegationsHandled = true;
    };

    // If we already have a paused state at subscription time, submit payment immediately
    const initialMd = initialTask?.status?.message?.metadata as Record<string, unknown> | undefined;
    if (initialTask?.status?.state === 'input-required' && initialMd?.[X402_REQUIREMENTS_KEY]) {
      await handlePaymentPause({ status: { message: { metadata: initialMd } } });
      paymentHandled = true;
    }

    const collectEventsPromise = (async () => {
      for await (const event of workflowStream) {
        workflowEvents.push(event);

        // Track artifacts
        if (hasKind(event, 'artifact-update')) {
          const artifactEvent = event as { artifact: Artifact };
          const already = artifacts.some((a) => a.artifactId === artifactEvent.artifact.artifactId);
          if (!already) artifacts.push(artifactEvent.artifact);
        }

        // Look for receipts metadata on status updates
        if (hasKind(event, 'status-update')) {
          const ev = event as TaskStatusUpdateEvent;
          const md = ev.status.message?.metadata as Record<string, unknown> | undefined;
          const topMd = ev.metadata as Record<string, unknown> | undefined;
          if (md?.[X402_RECEIPTS_KEY] || topMd?.[X402_RECEIPTS_KEY]) sawPaymentReceipts = true;
        }

        // Pause handling: first pause is payment-required (emitted as input-required with metadata)
        if (
          hasKind(event, 'status-update') &&
          (event as TaskStatusUpdateEvent).status.state === 'input-required'
        ) {
          const hasRequirements = !!(event as TaskStatusUpdateEvent).status.message?.metadata?.[
            X402_REQUIREMENTS_KEY
          ];
          if (!paymentHandled && hasRequirements) {
            await handlePaymentPause(event);
            continue;
          }

          if (paymentHandled && !walletInputHandled) {
            await handleWalletPause();
            continue;
          }

          if (paymentHandled && walletInputHandled && !delegationsHandled) {
            await handleDelegationsPause();
            continue;
          }
        }

        // Some producers may emit a task event (without full message metadata) when paused
        if (hasKind(event, 'task')) {
          // After payment submission, proceed with wallet input as soon as we see a task event
          if (paymentHandled && !walletInputHandled) {
            await handleWalletPause();
            continue;
          }

          // After wallet input, proceed with delegations as soon as artifact is present
          if (paymentHandled && walletInputHandled && !delegationsHandled) {
            const hasDelegations =
              artifacts.some((a) => a.artifactId === 'delegations-data') ||
              initialTask?.artifacts?.some((a) => a.artifactId === 'delegations-data');
            if (hasDelegations) {
              await handleDelegationsPause();
              continue;
            }
          }
        }

        // Break when final
        if (hasKind(event, 'status-update') && (event as TaskStatusUpdateEvent).final) break;
      }
    })();

    // Timeout guard for the workflow
    await Promise.race([
      collectEventsPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 60s')), 60000)),
    ]);

    // Then the workflow completes after x402 payment and emits receipts metadata
    const streamStatusUpdates = workflowEvents.filter(isStatusUpdate);
    const states = [
      ...(initialTask?.status?.state ? [initialTask.status.state] : []),
      ...streamStatusUpdates.map((u) => u.status.state),
    ];
    expect(states).toContain('working');
    expect(states).toContain('input-required');
    expect(states).toContain('completed');

    const lastUpdate = streamStatusUpdates[streamStatusUpdates.length - 1];
    expect(lastUpdate?.status.state).toBe('completed');
    expect(lastUpdate?.final).toBe(true);

    // Assertions specific to x402 payment flow
    expect(sawPaymentRequirements).toBe(true);

    // Ensure we saw a status-update that carried payment-completed receipts metadata
    // Either via inline message.metadata or via a dedicated status-update entry
    const paymentCompletedUpdate = workflowEvents.find((e): e is TaskStatusUpdateEvent => {
      if (!isStatusUpdate(e)) return false;
      const md = e.metadata as Record<string, unknown> | undefined;
      const messageMd = e.status.message?.metadata as Record<string, unknown> | undefined;
      return (
        md?.[X402_STATUS_KEY] === 'payment-completed' ||
        messageMd?.[X402_STATUS_KEY] === 'payment-completed'
      );
    });
    expect(paymentCompletedUpdate).toBeDefined();

    const receiptsMetadata = (paymentCompletedUpdate?.metadata ||
      paymentCompletedUpdate?.status.message?.metadata) as Record<string, unknown> | undefined;
    expect(receiptsMetadata?.[X402_RECEIPTS_KEY]).toBeDefined();
    expect(sawPaymentReceipts).toBe(true);

    // Basic artifact checks (delegations + at least one tx history)
    expect(artifacts.find((a) => a.artifactId === 'delegations-data')).toBeDefined();
    const txHistoryArtifacts = artifacts.filter(
      (a) => a.artifactId === 'transaction-history-display',
    );
    expect(txHistoryArtifacts.length).toBeGreaterThanOrEqual(1);
  }, 60000);
});

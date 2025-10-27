import type { Server } from 'http';

import type { Artifact, StatusUpdate, Task, TaskEvent } from '@a2a-js/sdk';
import { A2AClient } from '@a2a-js/sdk/client';
import {
  type Delegation,
  Implementation,
  toMetaMaskSmartAccount,
  type MetaMaskSmartAccount,
  getDeleGatorEnvironment,
  signDelegation as signDelegationWithPrivateKey,
} from '@metamask/delegation-toolkit';
import { v4 as uuidv4 } from 'uuid';
import type { Hex } from 'viem';
import type { privateKeyToAccount } from 'viem/accounts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AgentConfigHandle } from '../../src/config/runtime/init.js';
import { WorkflowRuntime } from '../../src/workflows/runtime.js';
import usdaiStrategyWorkflow from '../fixtures/workflows/usdai-strategy.js';
import { createClients } from '../fixtures/workflows/utils/clients.js';
import { get7702TestAccount, getTestChainId } from '../utils/lifecycle-test-helpers.js';
import {
  cleanupTestServer,
  createTestA2AServerWithStubs,
} from '../utils/test-server-with-stubs.js';

// Test constants matching workflow (unused in test, kept for documentation)
const _USDAI_TOKEN = {
  address: '0x0a1a1a107e45b7ced86833863f482bc5f4ed82ef' as const,
  decimals: 18,
};

const _PENDLE_SWAP = {
  address: '0x888888888889758F76e7103c6CbF23ABbF58F946' as const,
  selector: '0x12599ac6' as const,
  usdAiPool: '0x8e101c690390de722163d4dc3f76043bebbbcadd' as const,
};

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

describe('USDai Strategy Workflow Integration', () => {
  let runtime: WorkflowRuntime;
  let client: A2AClient;
  let testAccount: ReturnType<typeof privateKeyToAccount>;
  let userSmartAccount: MetaMaskSmartAccount;
  let server: Server;
  let agentConfigHandle: AgentConfigHandle;
  let baseUrl: string;

  beforeEach(async () => {
    // Initialize workflow runtime
    runtime = new WorkflowRuntime();
    runtime.register(usdaiStrategyWorkflow);

    // Create test A2A server with workflow runtime
    const result = await createTestA2AServerWithStubs({
      port: 0,
      workflowRuntime: runtime,
    });
    server = result.server;
    agentConfigHandle = result.agentConfigHandle;

    // Get the actual server address
    const address = server.address();
    if (address && typeof address === 'object') {
      baseUrl = `http://127.0.0.1:${address.port}`;
    } else {
      throw new Error('Server address not available');
    }

    // Initialize A2A client
    const cardUrl = `${baseUrl}/.well-known/agent.json`;
    client = await A2AClient.fromCardUrl(cardUrl);

    // Load test account from environment
    // NOTE: This wallet must be pre-upgraded to MMDT smart account before running tests
    // Run: pnpm test:upgrade-wallet to perform the one-time upgrade
    testAccount = get7702TestAccount();

    // Initialize MMDT SDK clients (for delegation signing only - no RPC calls)
    const clients = createClients();

    // Create smart account reference (assumes wallet is already upgraded)
    // The upgrade was performed via pnpm test:upgrade-wallet script
    userSmartAccount = await toMetaMaskSmartAccount({
      client: clients.public,
      implementation: Implementation.Hybrid,
      deployParams: [testAccount.address, [], [], []],
      deploySalt: '0x',
      signer: { account: testAccount },
    });

    console.log(`[beforeEach] Using pre-upgraded smart account: ${userSmartAccount.address}`);
  }, 10000); // 10s timeout for setup

  afterEach(async () => {
    if (server && agentConfigHandle) {
      await cleanupTestServer(server, agentConfigHandle);
    }
  });

  it('should complete USDai strategy workflow with EIP-7702 delegation signing', async () => {
    // Track all events for validation
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    const workflowEvents: Array<TaskEvent | StatusUpdate | Artifact> = [];
    const artifacts: Artifact[] = [];

    const messageId = uuidv4();

    // Step 1: Dispatch workflow and get task ID (server creates contextId)
    const message = {
      kind: 'message' as const,
      messageId,
      // No contextId - server creates it
      role: 'user' as const,
      parts: [
        {
          kind: 'text' as const,
          text: 'Execute USDai strategy workflow',
        },
      ],
    };

    const parentStream = client.sendMessageStream({ message });

    let contextId: string | undefined;
    let workflowTaskId: string | undefined;

    // Collect parent stream events to extract contextId and workflow task ID
    const parentEventsPromise = (async () => {
      for await (const event of parentStream) {
        if (event.kind === 'task' && event.contextId) {
          contextId = event.contextId;
        }
        if (event.kind === 'status-update' && event.status.message?.referenceTaskIds) {
          workflowTaskId = event.status.message.referenceTaskIds[0];
        }
        if (event.kind === 'status-update' && event.final) break;
      }
    })();

    // Wait for parent stream to finish dispatching and provide stable child task id
    await parentEventsPromise;

    expect(workflowTaskId).toBeDefined();
    if (!workflowTaskId) {
      throw new Error('Workflow task ID not found');
    }

    // Step 2: Backfill task state before streaming to capture any early events
    const initialTask = await waitForTaskState(
      client,
      workflowTaskId,
      (task) => !!task?.status?.state,
    );

    const workflowContextId = initialTask?.contextId ?? contextId;

    const shouldResumeImmediately = initialTask?.status?.state === 'input-required';
    let firstPauseHandled = false;
    let secondPauseHandled = false;

    if (initialTask?.artifacts?.length) {
      for (const artifact of initialTask.artifacts) {
        if (!artifacts.some((existing) => existing.artifactId === artifact.artifactId)) {
          artifacts.push(artifact);
        }
      }
    }

    // Step 3: Subscribe to workflow task stream
    const workflowStream = client.resubscribeTask({ id: workflowTaskId });

    const handleFirstPause = async (): Promise<void> => {
      console.log('[Test] First pause detected - providing wallet address and amount');
      await client.sendMessage({
        message: {
          kind: 'message',
          messageId: uuidv4(),
          contextId: workflowContextId,
          taskId: workflowTaskId,
          role: 'user',
          parts: [
            {
              kind: 'data',
              data: {
                walletAddress: userSmartAccount.address,
                amount: TEST_AMOUNT,
              },
            },
          ],
        },
        configuration: {
          blocking: false,
        },
      });
    };

    const handleSecondPause = async (): Promise<void> => {
      console.log('[Test] Second pause detected - signing and submitting delegations');

      const delegationsArtifact =
        artifacts.find((a) => a.artifactId === 'delegations-data') ??
        initialTask?.artifacts?.find((a) => a.artifactId === 'delegations-data');
      expect(delegationsArtifact).toBeDefined();

      if (!delegationsArtifact) {
        throw new Error('Delegations artifact not found');
      }

      const delegationsData = delegationsArtifact.parts
        .filter((p) => p.kind === 'data')
        .map((p) => (p.kind === 'data' ? p.data : null))
        .filter(Boolean);

      expect(delegationsData.length).toBe(2); // approve + supply

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
        delegationsData.map(async (data: any) => {
          const delegation = data.delegation as Delegation;
          const { signature: _ignoredSignature, ...unsignedDelegation } = delegation as any;
          const signedDelegation = await signDelegationWithPrivateKey({
            privateKey: testPrivateKey,
            delegation: unsignedDelegation,
            delegationManager: delegationEnvironment.DelegationManager,
            chainId,
          });
          return {
            id: data.id as string,
            signedDelegation,
          };
        }),
      );

      await client.sendMessage({
        message: {
          kind: 'message',
          messageId: uuidv4(),
          contextId: workflowContextId,
          taskId: workflowTaskId,
          role: 'user',
          parts: [
            {
              kind: 'data',
              data: {
                delegations: signedDelegations,
              },
            },
          ],
        },
        configuration: {
          blocking: false,
        },
      });
    };

    // Step 4: Collect workflow events asynchronously
    const collectEventsPromise = (async () => {
      try {
        for await (const event of workflowStream) {
          console.log(`[Test] Received workflow event: ${event.kind}`);
          if (event.kind === 'status-update') {
            console.log(`[Test] Status update: ${event.status.state}`);
          }
          workflowEvents.push(event);

          if (event.kind === 'artifact-update') {
            console.log(`[Test] Artifact received: ${event.artifact.artifactId}`);
            const alreadyRecorded = artifacts.some(
              (existing) => existing.artifactId === event.artifact.artifactId,
            );
            if (!alreadyRecorded) {
              artifacts.push(event.artifact);
            }

            // If we are at the second pause (delegations-data emitted), resume immediately
            if (
              firstPauseHandled &&
              !secondPauseHandled &&
              event.artifact.artifactId === 'delegations-data'
            ) {
              secondPauseHandled = true;
              await handleSecondPause();
            }
          }

          if (event.kind === 'task' && shouldResumeImmediately && !firstPauseHandled) {
            const latestTask = await waitForTaskState(
              client,
              workflowTaskId,
              (task) => !!task?.status?.state,
            );
            if (latestTask?.status?.state === 'input-required') {
              firstPauseHandled = true;
              await handleFirstPause();
            }
            continue;
          }

          // Handle first pause - wallet address + amount input
          if (
            event.kind === 'status-update' &&
            event.status.state === 'input-required' &&
            event.final !== true
          ) {
            if (!firstPauseHandled) {
              firstPauseHandled = true;
              await handleFirstPause();
            } else if (!secondPauseHandled) {
              const hasDelegationsArtifact =
                artifacts.some((a) => a.artifactId === 'delegations-data') ||
                initialTask?.artifacts?.some((a) => a.artifactId === 'delegations-data');
              if (hasDelegationsArtifact) {
                secondPauseHandled = true;
                await handleSecondPause();
              }
            }
          }

          // Break on final status
          if (event.kind === 'status-update' && event.final) {
            console.log('[Test] Workflow completed');
            break;
          }
        }
      } catch (error) {
        console.error('[Test] Error collecting workflow events:', error);
        throw error;
      }
    })();

    // Wait for workflow to complete (with timeout)
    await Promise.race([
      collectEventsPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Workflow timeout after 60s')), 60000),
      ),
    ]);

    // Also wait for parent stream to complete
    await parentEventsPromise;

    // Validate workflow completion
    const streamStatusUpdates = workflowEvents.filter(
      (e): e is StatusUpdate => e.kind === 'status-update',
    );

    const statusUpdates = [
      ...(initialTask?.status ? [{ status: initialTask.status }] : []),
      ...streamStatusUpdates.map((update) => ({ status: update.status, final: update.final })),
    ];

    // Validate status transitions
    const states = statusUpdates.map((s) => s.status.state);
    expect(states).toContain('working');
    expect(states).toContain('input-required');
    expect(states).toContain('completed');

    // Validate final status
    const finalStatus = statusUpdates[statusUpdates.length - 1];
    expect(finalStatus?.status.state).toBe('completed');
    expect(finalStatus?.final).toBe(true);

    // Validate artifacts
    expect(artifacts.length).toBeGreaterThanOrEqual(2); // delegations + at least 1 transaction

    // Validate delegations artifact
    const delegationsArtifact = artifacts.find((a) => a.artifactId === 'delegations-data');
    expect(delegationsArtifact).toBeDefined();
    expect(delegationsArtifact?.parts.length).toBe(2); // approve + supply

    // Validate transaction history artifacts
    const txHistoryArtifacts = artifacts.filter(
      (a) => a.artifactId === 'transaction-history-display',
    );
    expect(txHistoryArtifacts.length).toBeGreaterThanOrEqual(1);

    console.log(`[Test] Workflow completed successfully with ${artifacts.length} artifacts`);
  }, 60000); // 60s timeout for full workflow execution
});

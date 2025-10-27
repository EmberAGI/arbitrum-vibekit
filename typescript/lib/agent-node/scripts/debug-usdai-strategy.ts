import type { Server } from 'http';

import type { Artifact } from '@a2a-js/sdk';
import { A2AClient } from '@a2a-js/sdk/client';
import {
  getDeleGatorEnvironment,
  signDelegation as signDelegationWithPrivateKey,
  type Delegation,
} from '@metamask/delegation-toolkit';
import { v7 as uuidv7 } from 'uuid';
import type { Hex } from 'viem';

import type { AgentConfigHandle } from '../src/config/runtime/init.js';
import { WorkflowRuntime } from '../src/workflows/runtime.js';
import usdaiStrategyWorkflow from '../tests/fixtures/workflows/usdai-strategy.js';
import { get7702TestAccount, getTestChainId } from '../tests/utils/lifecycle-test-helpers.js';
import {
  cleanupTestServer,
  createTestA2AServerWithStubs,
} from '../tests/utils/test-server-with-stubs.js';

type DelegationArtifactEntry = {
  id: string;
  description?: string;
  delegation: Delegation;
};

function isDelegation(value: unknown): value is Delegation {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<Delegation>;
  return (
    typeof candidate.delegate === 'string' &&
    typeof candidate.delegator === 'string' &&
    typeof candidate.authority === 'string' &&
    typeof candidate.salt === 'string' &&
    typeof candidate.signature === 'string' &&
    Array.isArray(candidate.caveats)
  );
}

function isDelegationArtifactEntry(value: unknown): value is DelegationArtifactEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as { id?: unknown; delegation?: unknown };
  return typeof candidate.id === 'string' && isDelegation(candidate.delegation);
}

async function main(): Promise<void> {
  // Load test account from environment for delegation signing
  const testAccount = get7702TestAccount();
  const rawPrivateKey = process.env['A2A_TEST_7702_PRIVATE_KEY'];
  if (!rawPrivateKey || !rawPrivateKey.startsWith('0x') || rawPrivateKey.length !== 66) {
    throw new Error(
      'A2A_TEST_7702_PRIVATE_KEY not configured. Must be a 0x-prefixed 64-hex-char private key.',
    );
  }
  const testPrivateKey = rawPrivateKey as Hex;
  const chainId = getTestChainId();
  const delegationEnvironment = getDeleGatorEnvironment(chainId);
  console.log(`[Setup] Using test account: ${testAccount.address}`);
  console.log(`[Setup] Using DelegationManager: ${delegationEnvironment.DelegationManager}`);

  let server: Server | undefined;
  let agentConfigHandle: AgentConfigHandle | undefined;

  try {
    // Initialize workflow runtime
    console.log('[Setup] Initializing WorkflowRuntime...');
    const runtime = new WorkflowRuntime();
    runtime.register(usdaiStrategyWorkflow);

    // Create test A2A server
    console.log('[Setup] Creating test A2A server with stubs...');
    const started = await createTestA2AServerWithStubs({
      workflowRuntime: runtime,
      port: 0,
    });
    server = started.server;
    agentConfigHandle = started.agentConfigHandle;

    const address = server.address();
    if (!address || typeof address !== 'object') {
      throw new Error('Server has no address');
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    console.log(`[Setup] Server running at ${baseUrl}`);

    // Initialize A2A client
    console.log('[Setup] Initializing A2A client...');
    const client = await A2AClient.fromCardUrl(`${baseUrl}/.well-known/agent.json`);

    // Send initial message to dispatch workflow
    console.log('\n[Client] Dispatching USDAI Strategy Workflow...');
    const parentStream = client.sendMessageStream({
      message: {
        kind: 'message',
        messageId: uuidv7(),
        role: 'user',
        parts: [{ kind: 'text', text: 'Execute USDai strategy workflow' }],
      },
      configuration: {
        blocking: true,
      },
    });

    let contextId: string | undefined;
    let parentTaskId: string | undefined;
    let childTaskId: string | undefined;

    // Process parent stream to get workflow task ID
    for await (const event of parentStream) {
      console.log(
        `[Parent] ${event.kind} ${event.kind === 'status-update' ? event.status.state : ''}`,
      );
      if (event.kind === 'artifact-update' && event.artifact.name !== 'reasoning') {
        console.dir(event, { depth: null });
      }

      if (event.kind === 'task') {
        contextId = event.contextId;
        parentTaskId = event.id;
        console.log(`[Parent] contextId: ${contextId}`);
        console.log(`[Parent] parentTaskId: ${parentTaskId}`);
      }

      if (event.kind === 'status-update' && event.status.message?.referenceTaskIds?.length) {
        childTaskId = event.status.message.referenceTaskIds[0];
        console.log(`[Parent] childTaskId (workflow): ${childTaskId}`);
      }

      if (event.kind === 'status-update' && event.final) {
        break;
      }
    }

    if (!contextId) {
      throw new Error('No context id found');
    }

    if (!childTaskId) {
      throw new Error('No child task id (workflow) found');
    }

    // Track artifacts and pause handling state
    const artifacts: Artifact[] = [];
    let firstPauseHandled = false;
    let secondPauseHandled = false;

    // Subscribe to workflow task stream
    console.log('\n[Client] Subscribing to workflow task stream...');
    const childStream = client.resubscribeTask({ id: childTaskId });

    for await (const event of childStream) {
      console.log('[Client] event:');
      console.dir(event, { depth: null });

      // Collect artifacts
      if (event.kind === 'artifact-update') {
        console.log(`[Client] Artifact received: ${event.artifact.artifactId}`);
        const alreadyRecorded = artifacts.some(
          (existing) => existing.artifactId === event.artifact.artifactId,
        );
        if (!alreadyRecorded) {
          artifacts.push(event.artifact);
          console.log(`[Client] Artifact details:`);
          console.dir(event.artifact, { depth: null });
        }
      }

      // Handle first pause - wallet address + amount input
      if (
        (event.kind === 'task' || event.kind === 'status-update') &&
        event.status.state === 'input-required' &&
        !firstPauseHandled
      ) {
        console.log('[Client] input-required:');
        console.log('\n[Client] First pause: Provide wallet address and amount');
        console.log('Input schema expected:');
        console.log('  - walletAddress: string (0x...format)');
        console.log('  - amount: string (e.g., "1000")');

        const walletAddress = '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d'; // await prompt('Enter wallet address (0x...): ');
        const amount = '1.12'; // await prompt('Enter amount: ');

        firstPauseHandled = true;

        console.log('[Client] Sending wallet address and amount...');
        await client.sendMessage({
          message: {
            kind: 'message',
            messageId: uuidv7(),
            contextId,
            taskId: childTaskId,
            role: 'user',
            parts: [
              {
                kind: 'data',
                data: {
                  walletAddress,
                  amount,
                },
              },
            ],
          },
          configuration: {
            blocking: false,
          },
        });

        continue;
      }

      // Handle second pause - delegation signing
      if (
        (event.kind === 'task' || event.kind === 'status-update') &&
        event.status.state === 'input-required' &&
        firstPauseHandled &&
        !secondPauseHandled
      ) {
        console.log('\n[Client] Second pause: Sign delegations');

        const delegationsArtifact = artifacts.find((a) => a.artifactId === 'delegations-data');
        if (!delegationsArtifact) {
          throw new Error('Delegations artifact not found');
        }

        console.log('[Client] Delegations to sign:');
        console.dir(delegationsArtifact, { depth: null });

        const delegationEntries: DelegationArtifactEntry[] = delegationsArtifact.parts
          .filter(
            (part): part is { kind: 'data'; data: { [k: string]: unknown } } =>
              part.kind === 'data',
          )
          .map((part) => part.data)
          .filter(isDelegationArtifactEntry);

        console.log(`\n[Client] Found ${delegationEntries.length} delegations to sign:`);
        delegationEntries.forEach(({ id, description }, index: number) => {
          const summary = description ? `${description}` : 'No description provided';
          console.log(`  ${index + 1}. ${id}: ${summary}`);
        });

        console.log('\n[Client] Signing delegations automatically...');

        let signedDelegations: Array<{ id: string; signedDelegation: `0x${string}` }>;
        try {
          signedDelegations = await Promise.all(
            delegationEntries.map(async ({ id, delegation }) => {
              const { signature: _ignoredSignature, ...unsignedDelegation } = delegation;
              const signedDelegation = await signDelegationWithPrivateKey({
                privateKey: testPrivateKey,
                delegation: unsignedDelegation,
                delegationManager: delegationEnvironment.DelegationManager,
                chainId,
              });
              console.log(`[Client] Signed delegation: ${id}`);
              return {
                id,
                signedDelegation,
              };
            }),
          );
        } catch (error) {
          console.error('[Client] Failed to sign delegations', error);
          throw error;
        }

        console.log(`[Client] Successfully signed ${signedDelegations.length} delegations`);

        console.log('[Client] Sending signed delegations...');
        await client.sendMessage({
          message: {
            kind: 'message',
            messageId: uuidv7(),
            contextId,
            taskId: childTaskId,
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

        secondPauseHandled = true;
        continue;
      }

      // Break on final status
      if (event.kind === 'status-update' && event.final) {
        console.log('\n[Client] Workflow completed!');
        break;
      }
    }

    console.log('\n[Success] USDAI Strategy Workflow execution completed');
    console.log(`Collected ${artifacts.length} artifacts:`);
    artifacts.forEach((artifact) => {
      console.log(`  - ${artifact.artifactId}: ${artifact.description}`);
    });
  } finally {
    if (server && agentConfigHandle) {
      console.log('\n[Cleanup] Shutting down server...');
      await cleanupTestServer(server, agentConfigHandle);
    } else if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => resolve());
      });
    }
  }
}

main().catch((error) => {
  console.error('[Error]', error);
  process.exitCode = 1;
});

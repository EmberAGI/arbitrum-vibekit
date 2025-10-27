/**
 * E2E test for DeFi Strategy Workflow Lifecycle using A2A Client
 *
 * This test validates the complete client-side lifecycle of a DeFi strategy workflow
 * executed by Agent Node via the A2A protocol, including:
 * - Task creation and streaming events
 * - Pause/resume for input collection
 * - Real delegation signing via Viem with EIP-7702 wallet
 * - Artifact streaming and validation
 * - Status transitions and completion
 *
 * @see /Users/tomdaniel/Desktop/arbitrum-vibekit/.vibecode/test-workflow-lifecycle/prd.md
 */

import type { Server } from 'http';

import type { TaskArtifactUpdateEvent, TaskStatusUpdateEvent } from '@a2a-js/sdk';
import { A2AClient } from '@a2a-js/sdk/client';
import { v4 as uuidv4 } from 'uuid';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { z } from 'zod';

import { createA2AServer } from '../../src/a2a/server.js';
import { initFromConfigWorkspace, type AgentConfigHandle } from '../../src/config/runtime/init.js';
import { serviceConfig } from '../../src/config.js';
import {
  createLifecycleTestConfigWorkspace,
  get7702TestAccount,
  getTestChainId,
  signDelegation,
  extractArtifactData,
  SettingsArtifactSchema,
  DelegationsToSignArtifactSchema,
  SignedDelegationsArtifactSchema,
  TxHistoryEntrySchema,
  PerformanceArtifactSchema,
  TransactionExecutedArtifactSchema,
} from '../utils/lifecycle-test-helpers.js';

/**
 * E2E test suite for workflow lifecycle with A2A streaming
 */
describe('DeFi Strategy Workflow Lifecycle (E2E)', () => {
  let server: Server;
  let client: A2AClient;
  let baseUrl: string;
  let agentConfigHandle: AgentConfigHandle;
  let testConfigDir: string;
  let testAccount: ReturnType<typeof get7702TestAccount>;
  let testChainId: number;

  beforeAll(async () => {
    try {
      // Validate environment configuration
      testAccount = get7702TestAccount();
      testChainId = getTestChainId();

      console.log('[E2E] Test wallet address:', testAccount.address);
      console.log('[E2E] Test chain ID:', testChainId);

      // Create config workspace with lifecycle workflow plugin
      testConfigDir = createLifecycleTestConfigWorkspace({
        agentName: 'Lifecycle Test Agent',
        agentUrl: 'http://localhost:3000/a2a',
      });

      console.log('[E2E] Test config dir:', testConfigDir);

      // Initialize agent config from test workspace
      agentConfigHandle = await initFromConfigWorkspace({
        root: testConfigDir,
        dev: false,
      });

      // Create A2A server with config
      server = await createA2AServer({
        serviceConfig,
        agentConfig: agentConfigHandle,
      });

      // Wait for server to be listening
      await new Promise<void>((resolve) => {
        if (server.listening) {
          resolve();
        } else {
          server.once('listening', () => resolve());
        }
      });

      // Get the actual port
      const address = server.address();
      if (address && typeof address === 'object') {
        baseUrl = `http://localhost:${address.port}`;

        // Verify server is responding
        const cardUrl = `${baseUrl}/.well-known/agent.json`;
        const cardResponse = await fetch(cardUrl);
        if (!cardResponse.ok) {
          throw new Error(
            `Agent card fetch failed: ${cardResponse.status} ${cardResponse.statusText}`,
          );
        }

        // Create A2A client
        client = await A2AClient.fromCardUrl(cardUrl);
        console.log('[E2E] A2A client initialized');
      } else {
        throw new Error('Server address not available');
      }
    } catch (error) {
      console.error('[E2E] Failed to setup test environment:', error);
      throw error;
    }
  }, 60000); // 60s timeout for setup

  afterAll(async () => {
    // Clean up agent config handle
    if (agentConfigHandle) {
      await agentConfigHandle.close();
    }

    // Clean up server
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  it('should complete full workflow lifecycle with pause/resume, delegation signing, and artifact streaming', async () => {
    // Given: A workflow dispatch request targeting the lifecycle mock plugin
    const messageId = uuidv4();

    // Track received events
    const statusUpdates: TaskStatusUpdateEvent[] = [];
    const artifactUpdates: TaskArtifactUpdateEvent[] = [];
    let contextId: string | undefined;
    let taskId: string | undefined;
    let workflowTaskId: string | undefined;
    let workflowContextId: string | undefined;

    // When: Start the workflow via message/stream (server will create contextId)
    const streamGenerator = client.sendMessageStream({
      message: {
        kind: 'message',
        messageId,
        // No contextId - server creates it
        role: 'user',
        parts: [
          {
            kind: 'text',
            text: 'Please call the tool dispatch_workflow_defi_strategy_lifecycle_mock now.',
          },
        ],
      },
    });

    // Collect events from stream
    let pauseCount = 0;
    let handledPause1 = false;
    let handledPause2 = false;
    let workflowStreamComplete: (() => void) | null = null;
    const workflowStreamPromise = new Promise<void>((resolve) => {
      workflowStreamComplete = resolve;
    });

    for await (const event of streamGenerator) {
      console.log('[E2E] Received event:', event.kind);

      if (event.kind === 'task') {
        // Then: Should receive task event with task id and extract contextId from server
        taskId = event.id;
        contextId = event.contextId;
        expect(taskId).toBeDefined();
        expect(contextId).toBeDefined();
        expect(event.status.state).toBe('submitted');
        console.log('[E2E] Task created:', taskId);
        console.log('[E2E] Server-provided contextId:', contextId);
      } else if (event.kind === 'status-update') {
        statusUpdates.push(event);
        console.log('[E2E] Status update:', event.status.state, event.final ? '(final)' : '');

        // Extract workflow task ID from referenceTaskIds when workflow is dispatched
        if (!workflowTaskId && event.status.message?.referenceTaskIds?.length > 0) {
          workflowTaskId = event.status.message.referenceTaskIds[0];
          console.log('[E2E] Workflow Task ID from referenceTaskIds:', workflowTaskId);

          // Subscribe to workflow task stream with race condition handling
          void (async () => {
            try {
              // Subscribe to workflow stream first to avoid missing pause events
              console.log('[E2E] Subscribing to workflow event stream...');
              const workflowStream = client.resubscribeTask({ id: workflowTaskId });

              // Kick off a backfill for current task state and artifacts
              void (async () => {
                try {
                  // Small delay to ensure workflow task is registered on server
                  await new Promise((resolve) => setTimeout(resolve, 100));
                  console.log('[E2E] Fetching workflow task state...');
                  const workflowTaskResponse = await client.getTask({ id: workflowTaskId });
                  if ('error' in workflowTaskResponse) {
                    console.error('[E2E] Failed to get workflow task:', workflowTaskResponse.error);
                    return;
                  }
                  const workflowTask = workflowTaskResponse.result;
                  if (workflowTask) {
                    workflowContextId = workflowTask.contextId ?? workflowContextId ?? contextId;
                    console.log('[E2E] Workflow task state:', workflowTask.status?.state);
                    // Process any artifacts already emitted
                    if (workflowTask.artifacts) {
                      for (const artifact of workflowTask.artifacts) {
                        artifactUpdates.push({
                          kind: 'artifact-update',
                          taskId: workflowTaskId,
                          contextId,
                          artifact,
                        } as TaskArtifactUpdateEvent);
                        console.log('[E2E] Existing artifact:', artifact.artifactId);
                      }
                    }
                    // If already paused and we haven't handled pause 1 yet, handle it now
                    if (workflowTask.status?.state === 'input-required' && !handledPause1) {
                      statusUpdates.push({
                        kind: 'status-update',
                        taskId: workflowTaskId,
                        contextId,
                        status: { state: 'input-required' },
                        final: false,
                      } as TaskStatusUpdateEvent);
                      pauseCount++;
                      handledPause1 = true;
                      console.log('[E2E] Workflow already paused (pause #' + pauseCount + ')');

                      // Pause 1: Provide wallet address and amount
                      console.log('[E2E] Pause 1: Providing wallet address and amount');
                      const resumeMessageId = uuidv4();
                      const targetContextId = workflowContextId ?? contextId;
                      const resumeResponse = await client.sendMessage({
                        message: {
                          kind: 'message',
                          messageId: resumeMessageId,
                          contextId: targetContextId,
                          taskId: workflowTaskId,
                          role: 'user',
                          parts: [
                            {
                              kind: 'text',
                              text: 'Providing wallet details for workflow pause',
                            },
                            {
                              kind: 'data',
                              data: {
                                walletAddress: testAccount.address,
                                amount: '1000',
                              },
                              metadata: { mimeType: 'application/json' },
                            },
                          ],
                        },
                      });
                      if (!('result' in resumeResponse)) {
                        throw new Error('Resume response for pause 1 returned error');
                      }
                    }
                  }
                } catch (err) {
                  console.error('[E2E] Backfill getTask error:', err);
                }
              })();

              for await (const wfEvent of workflowStream) {
                console.log('[E2E] Workflow event:', wfEvent.kind);
                if ('contextId' in wfEvent && typeof wfEvent.contextId === 'string') {
                  workflowContextId = wfEvent.contextId;
                }

                if (wfEvent.kind === 'status-update') {
                  statusUpdates.push(wfEvent);
                  console.log('[E2E] Workflow status:', wfEvent.status.state);

                  // Handle pause for input
                  if (wfEvent.status.state === 'input-required' && !wfEvent.final) {
                    if (!handledPause1) {
                      handledPause1 = true;
                      pauseCount++;
                      console.log('[E2E] Workflow paused (pause #' + pauseCount + ')');
                      // Pause 1: Provide wallet address and amount
                      console.log('[E2E] Pause 1: Providing wallet address and amount');
                      const resumeMessageId = uuidv4();
                      const targetContextId = workflowContextId ?? contextId;
                      const resumeResponse = await client.sendMessage({
                        message: {
                          kind: 'message',
                          messageId: resumeMessageId,
                          contextId: targetContextId,
                          taskId: workflowTaskId,
                          role: 'user',
                          parts: [
                            {
                              kind: 'text',
                              text: 'Providing wallet details for workflow pause',
                            },
                            {
                              kind: 'data',
                              data: {
                                walletAddress: testAccount.address,
                                amount: '1000',
                              },
                              metadata: { mimeType: 'application/json' },
                            },
                          ],
                        },
                      });
                      if (!('result' in resumeResponse)) {
                        throw new Error('Resume response for pause 1 returned error');
                      }
                    } else if (!handledPause2) {
                      handledPause2 = true;
                      pauseCount++;
                      console.log('[E2E] Workflow paused (pause #' + pauseCount + ')');
                      // Pause 2: Sign delegations
                      console.log('[E2E] Pause 2: Signing delegations');

                      // Find the delegations-to-sign artifact
                      const delegationsArtifact = artifactUpdates.find(
                        (a) => a.artifact.artifactId === 'delegations-to-sign',
                      );

                      if (delegationsArtifact) {
                        const delegationsData = extractArtifactData<
                          z.infer<typeof DelegationsToSignArtifactSchema>
                        >(delegationsArtifact.artifact);

                        if (delegationsData) {
                          const validatedDelegations =
                            DelegationsToSignArtifactSchema.parse(delegationsData);

                          // Sign each delegation
                          const signedDelegations = await Promise.all(
                            validatedDelegations.delegations.map(async (delegation) => ({
                              id: delegation.id,
                              signedDelegation: await signDelegation(testAccount, delegation),
                            })),
                          );

                          console.log('[E2E] Signed', signedDelegations.length, 'delegations');

                          // Resume with signed delegations
                          const resumeMessageId = uuidv4();
                          const targetContextId = workflowContextId ?? contextId;
                          const resumeResponse = await client.sendMessage({
                            message: {
                              kind: 'message',
                              messageId: resumeMessageId,
                              contextId: targetContextId,
                              taskId: workflowTaskId,
                              role: 'user',
                              parts: [
                                {
                                  kind: 'text',
                                  text: 'Submitting signed delegations for workflow',
                                },
                                {
                                  kind: 'data',
                                  data: {
                                    delegations: signedDelegations,
                                  },
                                  metadata: { mimeType: 'application/json' },
                                },
                              ],
                            },
                          });
                          if (!('result' in resumeResponse)) {
                            throw new Error('Resume response for pause 2 returned error');
                          }
                        }
                      }
                    }
                  }

                  // Exit on workflow completion
                  if (wfEvent.final && wfEvent.status.state === 'completed') {
                    console.log('[E2E] Workflow stream completed');
                    break;
                  }
                } else if (wfEvent.kind === 'artifact-update') {
                  artifactUpdates.push(wfEvent);
                  console.log('[E2E] Workflow artifact:', wfEvent.artifact.artifactId);
                }
              }

              // Signal that workflow stream is complete
              if (workflowStreamComplete) {
                workflowStreamComplete();
              }
            } catch (error) {
              console.error('[E2E] Workflow subscription error:', error);
              // Still signal completion even on error
              if (workflowStreamComplete) {
                workflowStreamComplete();
              }
            }
          })();
        }

        // Note: Pause handling is now done in the workflow stream subscription above
        // Parent stream does not receive workflow pause events (different taskId)

        // Check for completion
        if (event.final && event.status.state === 'completed') {
          console.log('[E2E] Workflow completed');
          break;
        }
      } else if (event.kind === 'artifact-update') {
        artifactUpdates.push(event);
        console.log(
          '[E2E] Artifact update:',
          event.artifact.artifactId,
          event.artifact.name,
          event.append ? '(append)' : '',
          event.lastChunk ? '(last chunk)' : '',
        );
      }
    }

    // Wait for workflow stream to complete before assertions
    console.log('[E2E] Waiting for workflow stream to complete...');
    await workflowStreamPromise;
    console.log('[E2E] Workflow stream completed, proceeding with assertions');

    // Then: Validate task creation and status transitions
    expect(taskId, 'Task ID should be defined').toBeDefined();
    expect(
      workflowTaskId,
      'Workflow Task ID should be defined (from referenceTaskIds)',
    ).toBeDefined();

    // Note: 'submitted' state is validated in the task event (line 165), not in status-update events
    const states = statusUpdates.map((u) => u.status.state);
    expect(states, 'Should include working state').toContain('working');
    expect(states, 'Should include input-required state for pauses').toContain('input-required');

    // Verify at least 2 pauses occurred
    const inputRequiredCount = states.filter((s) => s === 'input-required').length;
    expect(
      inputRequiredCount,
      'Should have at least 2 input-required pauses',
    ).toBeGreaterThanOrEqual(2);

    // Verify final status
    const finalStatus = statusUpdates.find((u) => u.final);
    expect(finalStatus, 'Should have final status update').toBeDefined();
    expect(finalStatus?.status.state, 'Final state should be completed').toBe('completed');

    // Then: Validate artifact emissions
    const artifactIds = artifactUpdates.map((u) => u.artifact.artifactId);

    // Required artifacts per PRD
    expect(artifactIds, 'Should include strategy-settings artifact').toContain('strategy-settings');
    expect(artifactIds, 'Should include delegations-to-sign artifact').toContain(
      'delegations-to-sign',
    );
    expect(artifactIds, 'Should include signed-delegations artifact').toContain(
      'signed-delegations',
    );
    expect(artifactIds, 'Should include tx-history artifact').toContain('tx-history');
    expect(artifactIds, 'Should include strategy-performance artifact').toContain(
      'strategy-performance',
    );
    expect(artifactIds, 'Should include transaction-executed artifact').toContain(
      'transaction-executed',
    );

    // Then: Validate artifact schemas
    const settingsArtifact = artifactUpdates.find(
      (a) => a.artifact.artifactId === 'strategy-settings',
    );
    if (settingsArtifact) {
      const settingsData = extractArtifactData(settingsArtifact.artifact);
      const validated = SettingsArtifactSchema.parse(settingsData);
      expect(validated.walletAddress).toBe(testAccount.address);
      expect(validated.amount).toBe('1000');
      expect(validated.chainId).toBe(testChainId);
    }

    const signedDelegationsArtifact = artifactUpdates.find(
      (a) => a.artifact.artifactId === 'signed-delegations',
    );
    if (signedDelegationsArtifact) {
      const signedData = extractArtifactData(signedDelegationsArtifact.artifact);
      const validated = SignedDelegationsArtifactSchema.parse(signedData);
      expect(validated.delegations).toHaveLength(2);
    }

    // Then: Validate streamed updates for TX History and Performance
    const txHistoryUpdates = artifactUpdates.filter((a) => a.artifact.artifactId === 'tx-history');
    expect(
      txHistoryUpdates.length,
      'Should have at least 2 TX history updates (initial + update)',
    ).toBeGreaterThanOrEqual(2);

    // Validate TX history entries
    for (const update of txHistoryUpdates) {
      const txData = extractArtifactData(update.artifact);
      const validated = TxHistoryEntrySchema.parse(txData);
      expect(validated.txHash).toBeDefined();
      expect(validated.status).toMatch(/submitted|pending|confirmed|failed/);
    }

    const performanceUpdates = artifactUpdates.filter(
      (a) => a.artifact.artifactId === 'strategy-performance',
    );
    expect(
      performanceUpdates.length,
      'Should have at least 2 performance updates (initial + update)',
    ).toBeGreaterThanOrEqual(2);

    // Validate performance entries
    for (const update of performanceUpdates) {
      const perfData = extractArtifactData(update.artifact);
      const validated = PerformanceArtifactSchema.parse(perfData);
      expect(validated.totalValue).toBeDefined();
      expect(validated.unrealizedPnL).toBeDefined();
      expect(validated.realizedPnL).toBeDefined();
    }

    const transactionExecutedArtifact = artifactUpdates.find(
      (a) => a.artifact.artifactId === 'transaction-executed',
    );
    if (transactionExecutedArtifact) {
      const txData = extractArtifactData(transactionExecutedArtifact.artifact);
      const validated = TransactionExecutedArtifactSchema.parse(txData);
      expect(validated.status).toBe('success');
      expect(validated.chainId).toBe(testChainId);
    }

    console.log('[E2E] ✅ All validations passed');
    console.log('[E2E] Total status updates:', statusUpdates.length);
    console.log('[E2E] Total artifact updates:', artifactUpdates.length);
    console.log('[E2E] Unique artifacts:', new Set(artifactIds).size);
  }, 120000); // 120s timeout: allows for full lifecycle with pauses
});

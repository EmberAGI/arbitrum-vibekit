/**
 * E2E tests for message routing with A2A Client
 *
 * Validates that the A2A server correctly routes messages to AI vs workflow
 * based on the presence/absence of taskId in the message.
 */

import type { Server } from 'http';

import type { TaskStatusUpdateEvent } from '@a2a-js/sdk';
import { A2AClient } from '@a2a-js/sdk/client';
import { v4 as uuidv4 } from 'uuid';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

import type { AgentConfigHandle } from '../../src/config/runtime/init.js';
import { WorkflowRuntime } from '../../src/workflows/runtime.js';
import type { WorkflowPlugin, WorkflowContext, WorkflowState } from '../../src/workflows/types.js';
import {
  createTestA2AServerWithStubs,
  cleanupTestServer,
} from '../utils/test-server-with-stubs.js';

// Removed fixed wait helper to avoid time-based flakiness

/**
 * Create a workflow that pauses for input
 */
function createPausingWorkflow(options: { id: string }): WorkflowPlugin {
  const { id } = options;

  return {
    id,
    name: `Test Workflow ${id}`,
    description: `A workflow that pauses for testing`,
    version: '1.0.0',
    async *execute(_context: WorkflowContext): AsyncGenerator<WorkflowState, unknown, unknown> {
      // Initial dispatch response
      yield {
        type: 'dispatch-response',
        parts: [],
      };

      // Emit artifact before pausing
      yield {
        type: 'artifact',
        artifact: {
          artifactId: 'pre-pause.json',
          name: 'pre-pause.json',
          mimeType: 'application/json',
          parts: [
            {
              kind: 'data',
              data: { stage: 'before-pause' },
              metadata: { mimeType: 'application/json' },
            },
          ],
        },
      };

      // Pause for input
      void (yield {
        type: 'interrupted',
        reason: 'input-required',
        message: 'Need input',
        inputSchema: z.object({
          data: z.string(),
        }),
      });

      return { paused: true };
    },
  };
}

describe('Message Routing E2E', () => {
  let server: Server;
  let agentConfigHandle: AgentConfigHandle;
  let client: A2AClient;
  let baseUrl: string;
  let workflowRuntime: WorkflowRuntime;

  beforeEach(async () => {
    // Create workflow runtime
    workflowRuntime = new WorkflowRuntime();

    // Register test workflow
    const workflow = createPausingWorkflow({
      id: 'e2e_routing_test',
    });
    workflowRuntime.register(workflow);

    // Create test server with workflow runtime
    const result = await createTestA2AServerWithStubs({
      port: 0,
      workflowRuntime,
    });
    server = result.server;
    agentConfigHandle = result.agentConfigHandle;

    // Get server address
    const address = server.address();
    if (address && typeof address === 'object') {
      baseUrl = `http://127.0.0.1:${address.port}`;
    } else {
      throw new Error('Server address not available');
    }

    // Initialize A2A client
    const cardUrl = `${baseUrl}/.well-known/agent.json`;
    client = await A2AClient.fromCardUrl(cardUrl);
  });

  afterEach(async () => {
    if (server && agentConfigHandle) {
      await cleanupTestServer(server, agentConfigHandle);
    }
  });

  it('should route new message to AI while workflow is paused in same context', async () => {
    // Given: Workflow is registered (verified by dispatching it successfully)
    // E2E tests should not access internal runtime - we'll discover if workflow doesn't exist when dispatch fails

    // When: Send first message to dispatch workflow (server creates contextId)
    const message1Id = uuidv4();
    const streamGen1 = client.sendMessageStream({
      message: {
        kind: 'message',
        messageId: message1Id,
        // No contextId - server creates it
        role: 'user',
        parts: [
          {
            kind: 'text',
            text: 'Please execute the e2e-routing-test workflow',
          },
        ],
      },
    });

    let contextId: string | undefined;
    let parentTaskId: string | undefined;
    let workflowTaskId: string | undefined;
    const statusUpdates1: TaskStatusUpdateEvent[] = [];

    // Collect events from first stream
    const stream1Promise = (async () => {
      for await (const event of streamGen1) {
        if (event.kind === 'task') {
          parentTaskId = event.id;
          contextId = event.contextId;
        } else if (event.kind === 'status-update') {
          statusUpdates1.push(event);
          if (event.status.message?.referenceTaskIds?.length) {
            workflowTaskId = event.status.message.referenceTaskIds[0];
          }
        }
      }
    })();

    // Wait for first stream to complete
    await stream1Promise;

    // Verify we got context and workflow task IDs
    expect(contextId).toBeDefined();
    expect(parentTaskId).toBeDefined();
    expect(workflowTaskId).toBeDefined();

    // E2E test verifies observable behavior only; no fixed sleeps needed

    // When: Send second message to SAME context WITHOUT taskId
    // This should route to AI, not resume the workflow
    const message2Id = uuidv4();
    const streamGen2 = client.sendMessageStream({
      message: {
        kind: 'message',
        messageId: message2Id,
        contextId, // Same context as first message
        // NO taskId - should route to AI
        role: 'user',
        parts: [
          {
            kind: 'text',
            text: 'What is the weather today?',
          },
        ],
      },
    });

    let secondTaskId: string | undefined;
    let secondCompleted = false;

    // Collect events from second stream
    for await (const event of streamGen2) {
      if (event.kind === 'task') {
        secondTaskId = event.id;
      } else if (event.kind === 'status-update') {
        if (event.final && event.status.state === 'completed') {
          secondCompleted = true;
        }
      }
    }

    // Then: Second message should create a different task
    expect(secondTaskId).toBeDefined();
    expect(secondTaskId).not.toBe(workflowTaskId); // Not the workflow task
    expect(secondTaskId).not.toBe(parentTaskId); // Not the parent task either

    // And: Second task should complete (AI response)
    expect(secondCompleted).toBe(true);

    // E2E behavior: Second message created a different task (not resume of workflow)
    // The key end-to-end behavior is that two different tasks exist
    // Internal workflow state is tested in integration layer
  }, 30000); // 30s timeout

  it('should route message with taskId to paused workflow (not AI)', async () => {
    // Given: Workflow is registered (verified by dispatching it successfully)
    // E2E tests should not access internal runtime

    // When: Dispatch workflow
    const message1Id = uuidv4();
    const streamGen1 = client.sendMessageStream({
      message: {
        kind: 'message',
        messageId: message1Id,
        role: 'user',
        parts: [
          {
            kind: 'text',
            text: 'Please execute the e2e-routing-test workflow',
          },
        ],
      },
    });

    let contextId: string | undefined;
    let workflowTaskId: string | undefined;
    const statusUpdates: TaskStatusUpdateEvent[] = [];

    for await (const event of streamGen1) {
      if (event.kind === 'task') {
        contextId = event.contextId;
      } else if (event.kind === 'status-update') {
        statusUpdates.push(event);
        if (event.status.message?.referenceTaskIds?.length) {
          workflowTaskId = event.status.message.referenceTaskIds[0];
        }
      }
    }

    expect(contextId).toBeDefined();
    expect(workflowTaskId).toBeDefined();

    // E2E test: no fixed sleep; we proceed based on stream completion

    // When: Send message WITH taskId to resume workflow
    const message2Id = uuidv4();
    const resumeResponse = await client.sendMessage({
      message: {
        kind: 'message',
        messageId: message2Id,
        contextId,
        taskId: workflowTaskId, // Explicit taskId routes to workflow
        role: 'user',
        parts: [
          {
            kind: 'text',
            text: 'Resume workflow',
          },
          {
            kind: 'data',
            data: { data: 'resume-input' },
            metadata: { mimeType: 'application/json' },
          },
        ],
      },
    });

    // Then: Resume should succeed (this is the E2E behavior we're testing)
    expect('result' in resumeResponse).toBe(true);
    // E2E test validates that resume was accepted by the server
    // State transition is validated in integration tests via events
  }, 30000); // 30s timeout

  it('should handle multiple independent messages across different contexts', async () => {
    // When: Send message to context 1
    const msg1Id = uuidv4();
    const stream1 = client.sendMessageStream({
      message: {
        kind: 'message',
        messageId: msg1Id,
        role: 'user',
        parts: [{ kind: 'text', text: 'Hello context 1' }],
      },
    });

    let ctx1: string | undefined;
    let task1: string | undefined;
    for await (const event of stream1) {
      if (event.kind === 'task') {
        task1 = event.id;
        ctx1 = event.contextId;
      }
    }

    expect(ctx1).toBeDefined();
    expect(task1).toBeDefined();

    // When: Send message to context 2 (new context)
    const msg2Id = uuidv4();
    const stream2 = client.sendMessageStream({
      message: {
        kind: 'message',
        messageId: msg2Id,
        role: 'user',
        parts: [{ kind: 'text', text: 'Hello context 2' }],
      },
    });

    let ctx2: string | undefined;
    let task2: string | undefined;
    for await (const event of stream2) {
      if (event.kind === 'task') {
        task2 = event.id;
        ctx2 = event.contextId;
      }
    }

    expect(ctx2).toBeDefined();
    expect(task2).toBeDefined();

    // Then: Different contexts and tasks
    expect(ctx1).not.toBe(ctx2);
    expect(task1).not.toBe(task2);

    // When: Send another message to context 1 (should work)
    const msg3Id = uuidv4();
    const stream3 = client.sendMessageStream({
      message: {
        kind: 'message',
        messageId: msg3Id,
        contextId: ctx1, // Reuse context 1
        role: 'user',
        parts: [{ kind: 'text', text: 'Another message to context 1' }],
      },
    });

    let task3: string | undefined;
    for await (const event of stream3) {
      if (event.kind === 'task') {
        task3 = event.id;
      }
    }

    expect(task3).toBeDefined();
    expect(task3).not.toBe(task1); // Different task in same context
  }, 30000); // 30s timeout
});

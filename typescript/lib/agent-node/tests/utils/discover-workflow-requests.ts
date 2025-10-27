#!/usr/bin/env tsx
/**
 * Discover HTTP requests made by workflow dispatch via AI SDK
 *
 * This script creates a test scenario similar to a2a-client-protocol.int.test.ts
 * but uses a real AI service to identify what HTTP requests are made to OpenRouter.
 *
 * Usage: tsx tests/utils/discover-workflow-requests.ts
 */

import type { Server } from 'http';

import { A2AClient } from '@a2a-js/sdk/client';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import type { AgentConfigHandle } from '../../src/config/runtime/init.js';
import { WorkflowRuntime } from '../../src/workflows/runtime.js';
import type { WorkflowPlugin, WorkflowContext, WorkflowState } from '../../src/workflows/types.js';

import { createTestA2AServer, cleanupTestServer } from './test-server.js';

// Set up request logging
let requestCount = 0;
const capturedRequests: any[] = [];

// Hook into the fetch to log requests (if using Node 18+)
if (typeof global.fetch !== 'undefined') {
  const originalFetch = global.fetch;
  global.fetch = async (input: any, init?: any) => {
    requestCount++;
    const url = typeof input === 'string' ? input : input.url;
    const method = init?.method || 'GET';
    const body = init?.body;

    console.log(`\n=== HTTP Request #${requestCount} ===`);
    console.log(`${method} ${url}`);

    if (init?.headers) {
      const headers = { ...init.headers };
      if (headers['Authorization']) {
        headers['Authorization'] = 'Bearer [REDACTED]';
      }
      console.log('Headers:', JSON.stringify(headers, null, 2));
    }

    if (body) {
      try {
        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
        const parsed = JSON.parse(bodyStr);
        console.log('Body:', JSON.stringify(parsed, null, 2));
        capturedRequests.push({
          method,
          url,
          body: parsed,
        });
      } catch {
        console.log('Body: [Binary or non-JSON data]');
      }
    }
    console.log('=============================\n');

    // Make the actual request
    return originalFetch(input, init);
  };
}

/**
 * Create a simple workflow for testing
 */
function createTestWorkflow(): WorkflowPlugin {
  return {
    id: 'test_workflow',
    name: 'Test Workflow',
    description: 'A workflow for discovery',
    version: '1.0.0',
    async *execute(context: WorkflowContext): AsyncGenerator<WorkflowState, unknown, unknown> {
      // Emit status
      yield {
        type: 'status',
        status: {
          state: 'working',
          message: {
            kind: 'message',
            messageId: 'wf-msg-1',
            contextId: context.contextId,
            role: 'agent',
            parts: [{ kind: 'text', text: 'Starting workflow' }],
          },
        },
      };

      // Emit artifact
      yield {
        type: 'artifact',
        artifact: {
          artifactId: 'test-artifact.json',
          name: 'test-artifact.json',
          mimeType: 'application/json',
          parts: [
            {
              kind: 'data',
              data: { test: 'data' },
              metadata: { mimeType: 'application/json' },
            },
          ],
        },
      };

      // Pause for input
      const input: unknown = yield {
        type: 'pause',
        status: {
          state: 'input-required',
          message: {
            kind: 'message',
            messageId: 'pause-msg',
            contextId: context.contextId,
            role: 'agent',
            parts: [{ kind: 'text', text: 'Need input' }],
          },
        },
        inputSchema: z.object({
          data: z.string(),
        }),
      };

      return { success: true, input };
    },
  };
}

async function main() {
  console.log('=== Workflow Request Discovery ===');
  console.log('Setting up test environment...\n');

  // Set minimal environment
  if (!process.env['OPENROUTER_API_KEY']) {
    process.env['OPENROUTER_API_KEY'] = 'test-discovery-key';
  }

  let server: Server;
  let agentConfigHandle: AgentConfigHandle;
  let client: A2AClient;

  try {
    // Create workflow runtime and register test workflow
    const workflowRuntime = new WorkflowRuntime();
    const workflow = createTestWorkflow();
    workflowRuntime.register(workflow);

    // Create test server with real AI service (not stub)
    const result = await createTestA2AServer({
      port: 0,
      skills: [
        {
          id: 'test-skill',
          name: 'Test Skill',
          mcpServers: [],
        },
      ],
    });

    server = result.server;
    agentConfigHandle = result.agentConfigHandle;

    // Get server address
    const address = server.address();
    if (address && typeof address === 'object') {
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const cardUrl = `${baseUrl}/.well-known/agent.json`;
      client = await A2AClient.fromCardUrl(cardUrl);
    } else {
      throw new Error('Server address not available');
    }

    console.log('Server started successfully');
    console.log('Sending message to trigger workflow dispatch...\n');

    // Send message to trigger workflow dispatch (server creates contextId)
    const messageId = uuidv4();

    const streamGenerator = client.sendMessageStream({
      message: {
        kind: 'message',
        messageId,
        // No contextId - server creates it
        role: 'user',
        parts: [
          {
            kind: 'text',
            text: 'Please dispatch the test_workflow workflow',
          },
        ],
      },
    });

    console.log('Processing stream events...\n');

    let contextId: string | undefined;
    let eventCount = 0;
    for await (const event of streamGenerator) {
      eventCount++;
      console.log(`Event ${eventCount}: ${event.kind}`);

      // Extract contextId from server
      if (event.kind === 'task' && event.contextId) {
        contextId = event.contextId;
        console.log(`Server-provided contextId: ${contextId}`);
      }

      if (event.kind === 'task') {
        console.log('  Task ID:', event.id);
      } else if (event.kind === 'status-update') {
        console.log('  Status:', event.status.state);
      } else if (event.kind === 'text-delta') {
        console.log('  Text:', event.textDelta);
      }

      // Stop after seeing initial events
      if (eventCount >= 10) {
        break;
      }
    }
  } catch (error) {
    console.error('Error during discovery:', error);
  } finally {
    // Clean up
    if (server! && agentConfigHandle!) {
      await cleanupTestServer(server, agentConfigHandle);
    }

    console.log('\n=== Discovery Complete ===');
    console.log(`Total HTTP requests captured: ${capturedRequests.length}`);

    if (capturedRequests.length > 0) {
      console.log('\n=== Summary of Captured Requests ===');
      capturedRequests.forEach((req, index) => {
        console.log(`\n${index + 1}. ${req.method} ${req.url}`);
        if (req.body?.messages) {
          console.log('   Messages:', req.body.messages.length);
        }
        if (req.body?.tools) {
          console.log('   Tools defined:', Object.keys(req.body.tools).length);
        }
        if (req.body?.stream) {
          console.log('   Streaming:', req.body.stream);
        }
      });
    } else {
      console.log('\nNo HTTP requests were captured.');
      console.log('This might mean:');
      console.log('1. The AI service is using a stub/mock');
      console.log('2. The test needs a real OPENROUTER_API_KEY');
      console.log('3. MSW is intercepting requests before they are logged');
    }

    process.exit(0);
  }
}

// Run the discovery
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

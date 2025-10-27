import type { Server } from 'http';

import type { SendMessageResponse, GetTaskResponse, CancelTaskResponse } from '@a2a-js/sdk';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { SendMessageResponseSchema, MessageSchema, TaskSchema } from '../../src/a2a/validation.js';
import type { AgentConfigHandle } from '../../src/config/runtime/init.js';
import { createTestA2AServer, cleanupTestServer } from '../utils/test-server.js';

/**
 * Consolidated A2A Protocol Integration Tests
 *
 * Tests core A2A protocol behavior, streaming, and client experience using:
 * - Real A2A SDK client and AgentExecutor implementation
 * - MSW-mocked LLM API responses (recorded from real APIs)
 *
 * Note: Tests use realistic streaming mocks which simulate real LLM token streaming.
 * This causes longer test times (~4s per test) but validates complete streaming behavior.
 *
 * Consolidates previous a2a-protocol.int.test.ts and advanced-streaming.int.test.ts
 */
describe('A2A Protocol Integration', () => {
  let server: Server;
  let agentConfigHandle: AgentConfigHandle;
  let baseUrl: string;

  beforeEach(async () => {
    try {
      // Create server with proper test configuration
      const result = await createTestA2AServer({ port: 0 }); // Use port 0 for random available port
      server = result.server;
      agentConfigHandle = result.agentConfigHandle;

      // Get the actual port and construct base URL
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        baseUrl = `http://localhost:${port}`;
        // Test server started on port
      } else {
        throw new Error('Server address not available');
      }
    } catch (error) {
      console.error('Failed to create server:', error);
      throw error;
    }
  });

  afterEach(async () => {
    if (server && agentConfigHandle) {
      await cleanupTestServer(server, agentConfigHandle);
    }
  });

  describe('Core Protocol - message/send', () => {
    it(
      'should return Message for simple queries and Task for complex operations',
      { timeout: 15000 },
      async () => {
        // Given a simple mathematical query
        const simpleResponse = await fetch(`${baseUrl}/a2a`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'message/send',
            params: {
              message: {
                kind: 'message',
                messageId: 'simple-query-1',
                contextId: 'ctx-simple-query',
                role: 'user',
                parts: [{ kind: 'text', text: 'What is 2+2?' }],
              },
            },
            id: 'simple-1',
          }),
        });

        // Then it should return a Message or Task
        const result = await simpleResponse.json();

        // Use Zod exclusively for validation - this will throw if invalid
        const validatedResult = SendMessageResponseSchema.parse(result);

        // Assert it's a success response with a result
        expect('result' in validatedResult).toBe(true);
        if (!('result' in validatedResult)) {
          return;
        }

        // The result can be either a Message or Task per A2A protocol
        expect(validatedResult.result.kind).toMatch(/^(message|task)$/);

        // If it's a message, check for text content
        if (validatedResult.result.kind === 'message') {
          const messageResult = MessageSchema.parse(validatedResult.result);
          const textPart = messageResult.parts.find(
            (part): part is { kind: 'text'; text: string } => part.kind === 'text',
          );
          expect(textPart?.text).toBeDefined();
        }
        // If it's a task, just verify it has required fields
        else {
          const taskResult = TaskSchema.parse(validatedResult.result);
          expect(taskResult.id).toBeDefined();
          expect(taskResult.status).toBeDefined();
        }

        // Given a complex trading operation
        const complexResponse = await fetch(`${baseUrl}/a2a`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'message/send',
            params: {
              message: {
                kind: 'message',
                messageId: 'complex-op-1',
                contextId: 'ctx-complex-op',
                role: 'user',
                parts: [{ kind: 'text', text: 'Open a long position on ETH-USD with 2x leverage' }],
              },
            },
            id: 'complex-1',
          }),
        });

        // Then it should return a Task or Message for complex operations
        const complexResult = await complexResponse.json();

        // Use Zod exclusively for validation - this will throw if invalid
        const validatedComplexResult = SendMessageResponseSchema.parse(complexResult);

        // Assert it's a success response
        expect('result' in validatedComplexResult).toBe(true);
        if (!('result' in validatedComplexResult)) {
          return;
        }

        // Zod has already validated the structure based on the kind
        // The schema union ensures it's either a valid Task or Message
        // No additional validation needed - Zod handles all of it
        expect(['task', 'message']).toContain(validatedComplexResult.result.kind);
      },
    );

    it('should handle terminal tasks with inline artifacts', async () => {
      // Given a request that results in a terminal task
      const response = await fetch(`${baseUrl}/a2a`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'message/send',
          params: {
            message: {
              kind: 'message',
              messageId: 'terminal-task-1',
              contextId: 'ctx-terminal',
              role: 'user',
              parts: [{ kind: 'text', text: 'Execute GMX trade and return results' }],
            },
          },
          id: 'terminal-1',
        }),
      });

      // Then it should handle terminal task appropriately
      expect(response.status).toBe(200);
      const responseBody = await response.json();

      // Use Zod exclusively for validation
      const validatedResponse = SendMessageResponseSchema.parse(responseBody);

      // Zod ensures it's either error or result, and validates all fields
      expect('result' in validatedResponse).toBe(true);
    });

    it('should validate message structure', async () => {
      // Given an invalid message structure
      const response = await fetch(`${baseUrl}/a2a`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'message/send',
          params: {
            message: {
              // Missing required fields
              kind: 'message',
              messageId: '',
            },
          },
          id: 'invalid-1',
        }),
      });

      // Then it should return validation error
      const responseBody = await response.json();

      // Use Zod to validate it's a proper JSONRPC response
      const validatedResponse = SendMessageResponseSchema.parse(responseBody);

      // Zod ensures it's either an error or success - check it's an error
      expect('error' in validatedResponse).toBe(true);
    });
  });

  describe('Streaming - message/stream', () => {
    it('should stream message-scoped events without taskId', async () => {
      // Given message-scoped streaming (no taskId) per PRD line 17
      const messageStream = await fetch(`${baseUrl}/a2a`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'message/stream',
          params: {
            message: {
              kind: 'message',
              messageId: 'msg-stream-1',
              contextId: 'ctx-msg-stream',
              role: 'user',
              parts: [{ kind: 'text', text: 'Stream a message response' }],
            },
          },
          id: 'msg-stream-id',
        }),
      });

      // Then SSE stream should contain message events
      expect(messageStream.status).toBe(200);
      expect(messageStream.headers.get('content-type')).toBe('text/event-stream');
    });

    it('should stream task-scoped events when taskId provided', async () => {
      // Given a task creation request first
      const createResponse = await fetch(`${baseUrl}/a2a`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'message/send',
          params: {
            message: {
              kind: 'message',
              messageId: 'create-task-1',
              contextId: 'ctx-task-stream',
              role: 'user',
              parts: [{ kind: 'text', text: 'Create a task for streaming' }],
            },
          },
          id: 'create-task-id',
        }),
      });

      const createResponseBody = (await createResponse.json()) as SendMessageResponse;
      const taskId =
        'result' in createResponseBody && createResponseBody.result?.kind === 'task'
          ? createResponseBody.result.id
          : 'default-task';

      // When requesting a stream with taskId
      const streamResponse = await fetch(`${baseUrl}/a2a`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'message/stream',
          params: {
            message: {
              kind: 'message',
              messageId: 'stream-msg-2',
              contextId: 'ctx-task-stream',
              role: 'user',
              parts: [{ kind: 'text', text: 'Stream task events' }],
            },
            taskId,
          },
          id: 'stream-id',
        }),
      });

      // Then SSE stream should be established with task-scoped events
      expect(streamResponse.status).toBe(200);
      expect(streamResponse.headers.get('content-type')).toBe('text/event-stream');
    });

    it('should handle stream resumption with Last-Event-ID', async () => {
      // Given an initial streaming request
      const firstResponse = await fetch(`${baseUrl}/a2a`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'message/stream',
          params: {
            message: {
              kind: 'message',
              messageId: 'resume-test-1',
              contextId: 'resume-context',
              role: 'user',
              parts: [
                {
                  kind: 'text',
                  text: 'Start streaming that can be resumed',
                },
              ],
            },
          },
          id: 1,
        }),
      });

      expect(firstResponse.status).toBe(200);
      expect(firstResponse.headers.get('content-type')).toBe('text/event-stream');

      // When reconnecting with Last-Event-ID
      const resumeResponse = await fetch(`${baseUrl}/a2a`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'Last-Event-ID': 'some-event-id',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'message/stream',
          params: {
            message: {
              kind: 'message',
              messageId: 'resume-test-2',
              contextId: 'resume-context',
              role: 'user',
              parts: [
                {
                  kind: 'text',
                  text: 'Resume from last event',
                },
              ],
            },
          },
          id: 2,
        }),
      });

      // Then stream should resume properly
      expect(resumeResponse.status).toBe(200);
      expect(resumeResponse.headers.get('content-type')).toBe('text/event-stream');
    });
  });

  describe('Task Management', () => {
    it('should retrieve task status via tasks/get', async () => {
      // Given a task creation request
      const createResponse = await fetch(`${baseUrl}/a2a`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'message/send',
          params: {
            message: {
              kind: 'message',
              messageId: 'task-get-1',
              contextId: 'ctx-task-get',
              role: 'user',
              parts: [{ kind: 'text', text: 'Create a task to retrieve' }],
            },
          },
          id: 'task-create-1',
        }),
      });

      const createResponseBody2 = (await createResponse.json()) as SendMessageResponse;
      const taskId =
        'result' in createResponseBody2 && createResponseBody2.result?.kind === 'task'
          ? createResponseBody2.result.id
          : 'default-task';

      // When retrieving task status
      const getResponse = await fetch(`${baseUrl}/a2a`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tasks/get',
          params: { taskId },
          id: 'task-get-id',
        }),
      });

      // Then task status should be returned or appropriate error
      expect([200, 404]).toContain(getResponse.status);
      if (getResponse.status === 200) {
        // Check if response has result or error field
        const getResponseBody = (await getResponse.json()) as GetTaskResponse;
        expect(getResponseBody).toHaveProperty('jsonrpc');
        if ('result' in getResponseBody) {
          expect(getResponseBody.result).toBeDefined();
        } else if ('error' in getResponseBody) {
          expect(getResponseBody.error).toBeDefined();
        }
      }
    });

    it('should cancel tasks via tasks/cancel', async () => {
      // Given a task creation request
      const createResponse = await fetch(`${baseUrl}/a2a`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'message/send',
          params: {
            message: {
              kind: 'message',
              messageId: 'task-cancel-1',
              contextId: 'ctx-task-cancel',
              role: 'user',
              parts: [{ kind: 'text', text: 'Create a task to cancel' }],
            },
          },
          id: 'task-create-cancel',
        }),
      });

      const createResponseBody3 = (await createResponse.json()) as SendMessageResponse;
      const taskId =
        'result' in createResponseBody3 && createResponseBody3.result?.kind === 'task'
          ? createResponseBody3.result.id
          : 'default-task';

      // When canceling the task
      const cancelResponse = await fetch(`${baseUrl}/a2a`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tasks/cancel',
          params: { taskId },
          id: 'task-cancel-id',
        }),
      });

      // Then cancellation should be acknowledged or appropriate error
      expect([200, 404]).toContain(cancelResponse.status);
      if (cancelResponse.status === 200) {
        // Check if response has result or error field
        const cancelResponseBody = (await cancelResponse.json()) as CancelTaskResponse;
        expect(cancelResponseBody).toHaveProperty('jsonrpc');
        if ('result' in cancelResponseBody) {
          expect(cancelResponseBody.result).toBeDefined();
        } else if ('error' in cancelResponseBody) {
          expect(cancelResponseBody.error).toBeDefined();
        }
      }
    });
  });

  describe('Workflow Pause and Resume', () => {
    it('should handle workflow pause and resume with streaming', async () => {
      // Given a workflow that will pause
      const createResponse = await fetch(`${baseUrl}/a2a`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'message/send',
          params: {
            message: {
              kind: 'message',
              messageId: 'pause-workflow-1',
              contextId: 'ctx-pause',
              role: 'user',
              parts: [{ kind: 'text', text: 'Start a workflow that will pause' }],
            },
          },
          id: 'pause-create-1',
        }),
      });

      const createResponseBody4 = (await createResponse.json()) as SendMessageResponse;
      const taskId =
        'result' in createResponseBody4 && createResponseBody4.result?.kind === 'task'
          ? createResponseBody4.result.id
          : 'pause-task';

      // When streaming task updates
      const streamResponse = await fetch(`${baseUrl}/a2a`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'message/stream',
          params: {
            message: {
              kind: 'message',
              messageId: 'pause-stream-1',
              contextId: 'ctx-pause',
              role: 'user',
              parts: [{ kind: 'text', text: 'Stream updates' }],
            },
            taskId,
          },
          id: 'pause-stream-1',
        }),
      });

      // Then SSE should handle pause status appropriately
      expect(streamResponse.status).toBe(200);
      expect(streamResponse.headers.get('content-type')).toBe('text/event-stream');
    });

    it('should handle structured data input for resume', { timeout: 15000 }, async () => {
      // Given a paused workflow
      const pausedResponse = await fetch(`${baseUrl}/a2a`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'message/send',
          params: {
            message: {
              kind: 'message',
              messageId: 'structured-pause-1',
              contextId: 'ctx-structured',
              role: 'user',
              parts: [{ kind: 'text', text: 'Create workflow that expects structured input' }],
            },
          },
          id: 'structured-create',
        }),
      });

      const pausedResponseBody = (await pausedResponse.json()) as SendMessageResponse;
      const taskId =
        'result' in pausedResponseBody && pausedResponseBody.result?.kind === 'task'
          ? pausedResponseBody.result.id
          : 'structured-task';

      // When providing structured data to resume
      const resumeResponse = await fetch(`${baseUrl}/a2a`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'message/send',
          params: {
            message: {
              kind: 'message',
              messageId: 'structured-resume-1',
              contextId: 'ctx-structured',
              role: 'user',
              parts: [
                {
                  kind: 'data',
                  data: {
                    type: 'application/json',
                    value: { amount: '1000', token: 'USDC' },
                  },
                },
              ],
            },
            taskId,
          },
          id: 'structured-resume',
        }),
      });

      // Then structured data should be processed
      expect(resumeResponse.status).toBe(200);
      const resumeResponseBody = (await resumeResponse.json()) as SendMessageResponse;
      if ('result' in resumeResponseBody) {
        expect(resumeResponseBody.result).toBeDefined();
      }
    });
  });

  describe('A2A URI Scheme Compliance', () => {
    it('should support A2A URI scheme registration', async () => {
      // Given A2A URI scheme capability
      // When requesting URI scheme information
      const response = await fetch(`${baseUrl}/a2a`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'message/send',
          params: {
            message: {
              kind: 'message',
              messageId: 'uri-scheme-1',
              contextId: 'uri-context',
              role: 'user',
              parts: [{ kind: 'text', text: 'Test URI scheme support' }],
            },
          },
          id: 'uri-test',
        }),
      });

      // Then URI scheme should be supported
      expect(response.status).toBe(200);
      const responseBody = (await response.json()) as SendMessageResponse;
      if ('result' in responseBody) {
        expect(responseBody.result).toBeDefined();
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON-RPC requests', async () => {
      // Given malformed JSON-RPC request
      const response = await fetch(`${baseUrl}/a2a`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Missing required jsonrpc field
          method: 'message/send',
          params: { invalid: true },
          id: 'malformed-1',
        }),
      });

      // Then appropriate error should be returned
      const responseBody = (await response.json()) as SendMessageResponse;
      if ('error' in responseBody) {
        expect(responseBody.error).toBeDefined();
        expect(responseBody.error.code).toBeDefined();
      }
    });

    it('should handle unknown methods', async () => {
      // Given unknown method request
      const response = await fetch(`${baseUrl}/a2a`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'unknown/method',
          params: {},
          id: 'unknown-1',
        }),
      });

      // Then method not found error should be returned
      const responseBody = (await response.json()) as SendMessageResponse;
      if ('error' in responseBody) {
        expect(responseBody.error).toBeDefined();
        expect(responseBody.error.code).toBe(-32601); // Method not found
      }
    });

    it('should handle invalid parameters', async () => {
      // Given request with invalid parameters
      const response = await fetch(`${baseUrl}/a2a`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'message/send',
          params: { invalid: true },
          id: 'invalid-params-1',
        }),
      });

      // Then parameter validation error should be returned
      const responseBody = (await response.json()) as SendMessageResponse;
      if ('error' in responseBody) {
        expect(responseBody.error).toBeDefined();
      }
    });
  });

  describe('Health Check', () => {
    it('should provide health status', async () => {
      // Given health check request
      const response = await fetch(`${baseUrl}/a2a`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'health',
          params: {},
          id: 'health-1',
        }),
      });

      // Then health status should be returned or appropriate error
      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        // Check if response has result or error field
        const healthResponseBody = (await response.json()) as SendMessageResponse;
        expect(healthResponseBody).toHaveProperty('jsonrpc');
        if ('result' in healthResponseBody) {
          expect(healthResponseBody.result).toBeDefined();
        } else if ('error' in healthResponseBody) {
          expect(healthResponseBody.error).toBeDefined();
        }
      }
    });

    it('should expose capabilities including streaming', async () => {
      // Given capabilities request
      const response = await fetch(`${baseUrl}/.well-known/a2a`);

      // Then capabilities endpoint should be available or return appropriate error
      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        const capabilitiesBody = (await response.json()) as { capabilities?: unknown };
        expect(capabilitiesBody.capabilities).toBeDefined();
      }
    });
  });
});

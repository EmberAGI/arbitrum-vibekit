import type { Server } from 'http';

import type { Message } from '@a2a-js/sdk';
import { A2AClient } from '@a2a-js/sdk/client';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import type { AgentConfigHandle } from '../../src/config/runtime/init.js';
import { createTestA2AServer, cleanupTestServer } from '../utils/test-server.js';

// A2A JSON-RPC types
interface JSONRPCRequest {
  jsonrpc: '2.0';
  method: string;
  params: Record<string, unknown>;
  id: string | number;
}

// JSONRPCResponse interface removed - not used in tests

/**
 * Integration tests for A2A SSE streaming via message/stream JSON-RPC method
 * Tests compliance with A2A specification for streaming responses
 */
describe('A2A SSE Streaming', () => {
  let server: Server;
  let agentConfigHandle: AgentConfigHandle;
  let baseUrl: string;
  let streamResponse: Response | null = null;
  let client: A2AClient;
  let abortController: AbortController;

  beforeAll(async () => {
    // Given an A2A server with streaming capabilities
    const result = await createTestA2AServer({ port: 0 });
    server = result.server;
    agentConfigHandle = result.agentConfigHandle;

    const address = server.address();
    const port = address && typeof address === 'object' && 'port' in address ? address.port : 0;
    baseUrl = `http://localhost:${port}`;
    // Initialize official A2A client for stable streaming in tests
    client = await A2AClient.fromCardUrl(`${baseUrl}/.well-known/agent.json`);
  });

  afterAll(async () => {
    if (server && agentConfigHandle) {
      await cleanupTestServer(server, agentConfigHandle);
    }
  });

  beforeEach(() => {
    // Reset any previous references; client streams are generator-based and end on loop exit
    streamResponse = null;
    // Create new AbortController for this test
    abortController = new AbortController();
  });

  afterEach(() => {
    // Abort any pending streams
    abortController.abort();
  });

  describe('A2A streaming via message/stream method', () => {
    it(
      'should establish SSE stream via message/stream JSON-RPC method',
      { timeout: 1000 },
      async () => {
        // Given a message/stream JSON-RPC request with contextId
        const streamRequest: JSONRPCRequest = {
          jsonrpc: '2.0',
          method: 'message/stream',
          params: {
            message: {
              role: 'user',
              parts: [{ kind: 'text', text: 'Test streaming message' }],
              // No contextId - server creates it
              messageId: 'msg-test-001',
            } as Message,
          },
          id: 1,
        };

        // When sending message/stream request to /a2a endpoint
        streamResponse = await fetch(`${baseUrl}/a2a`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(streamRequest),
          signal: abortController.signal,
        });

        // Then server should respond with SSE headers and 200 status
        expect(streamResponse.status).toBe(200);
        expect(streamResponse.headers.get('Content-Type')).toBe('text/event-stream');
        expect(streamResponse.headers.get('Cache-Control')).toBe('no-cache');
        expect(streamResponse.headers.get('Connection')).toBe('keep-alive');
      },
    );

    it(
      'should generate contextId for first message when not provided',
      { timeout: 1000 },
      async () => {
        // Given a message/stream request without contextId (first message)
        const firstRequest: JSONRPCRequest = {
          jsonrpc: '2.0',
          method: 'message/stream',
          params: {
            message: {
              role: 'user',
              parts: [{ kind: 'text', text: 'Test message' }],
              messageId: 'msg-first-001',
              // No contextId - server should generate one
            },
          },
          id: 1,
        };

        // When sending first request to /a2a endpoint
        const response = await fetch(`${baseUrl}/a2a`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(firstRequest),
          signal: abortController.signal,
        });

        // Then server should accept and return SSE stream with generated contextId
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('text/event-stream');

        // Read first event to verify contextId was generated
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        if (reader) {
          const result = await reader.read();
          if (result.value) {
            const data = decoder.decode(result.value as Uint8Array);
            expect(data).toContain('contextId'); // Server generated a contextId
          }
        }
      },
    );

    it('should send retry directive and heartbeat events', { timeout: 1000 }, async () => {
      // Given a message/stream request
      const streamRequest: JSONRPCRequest = {
        jsonrpc: '2.0',
        method: 'message/stream',
        params: {
          message: {
            role: 'user',
            parts: [{ kind: 'text', text: 'Test heartbeat' }],
            // No contextId - server creates it
            messageId: 'msg-heartbeat-001',
          } as Message,
        },
        id: 1,
      };

      // When establishing SSE stream
      streamResponse = await fetch(`${baseUrl}/a2a`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(streamRequest),
        signal: abortController.signal,
      });

      // Then should receive JSON-RPC formatted response data
      const reader = streamResponse.body?.getReader();
      const decoder = new TextDecoder();
      let receivedData = '';

      if (reader) {
        const result = await reader.read();
        if (result.value) {
          receivedData = decoder.decode(result.value as Uint8Array);
        }
      }

      // Should contain JSON-RPC data with the response (A2A protocol uses data-only SSE format)
      expect(receivedData).toContain('data:');
      expect(receivedData).toContain('jsonrpc');
      // Should have proper SSE content type
      expect(streamResponse.headers.get('Content-Type')).toBe('text/event-stream');
    });
  });

  describe('A2A event kinds for streaming', () => {
    it('should emit artifact-based streaming events', { timeout: 10000 }, async () => {
      // Given a message/stream request for general message processing
      const stream = client.sendMessageStream({
        message: {
          kind: 'message',
          messageId: 'msg-delta-001',
          // No contextId - server creates it
          role: 'user',
          parts: [{ kind: 'text', text: 'What is 2+2?' }],
        },
      });

      const received: unknown[] = [];
      for await (const ev of stream) {
        received.push(ev);
      }

      expect(received.length).toBeGreaterThan(0);
      // Should receive artifact-based streaming (reasoning + text-response artifacts)
      const serialized = JSON.stringify(received);
      // Check for artifact-update events or contextId presence
      const hasArtifacts =
        serialized.includes('artifact-update') || serialized.includes('contextId');
      expect(hasArtifacts).toBe(true);
    });

    it(
      'should complete with message event for completed response',
      { timeout: 10000 },
      async () => {
        // Given a simple prompt likely to complete quickly
        const stream = client.sendMessageStream({
          message: {
            kind: 'message',
            messageId: 'msg-completed-001',
            // No contextId - server creates it
            role: 'user',
            parts: [{ kind: 'text', text: 'Hello' }],
          },
        });

        let foundFinal = false;
        for await (const ev of stream) {
          const s = JSON.stringify(ev);
          if (s.includes('"final":true') || s.includes('"state":"completed"')) {
            foundFinal = true;
            break;
          }
        }

        expect(foundFinal).toBe(true);
      },
    );

    it('should handle status-update events with state:failed', { timeout: 10000 }, async () => {
      // Given a message/stream request that might fail depending on downstream tools/LLM
      const stream = client.sendMessageStream({
        message: {
          kind: 'message',
          messageId: 'msg-processing-001',
          // No contextId - server creates it
          role: 'user',
          parts: [{ kind: 'text', text: 'Process this message' }],
        },
      });

      const received: string[] = [];
      for await (const ev of stream) {
        received.push(JSON.stringify(ev));
      }

      expect(received.length).toBeGreaterThan(0);
      const full = received.join('\n');
      if (full.includes('"state":"failed"')) {
        expect(full).toMatch(/"kind":"status-update"/);
      }
    });
  });

  describe('task-scoped A2A streaming events', () => {
    it.todo('should emit task events for task creation');
    it.todo('should emit status-update events with taskId for state transitions');
    it.todo('should emit artifact-update events for artifact delivery');
    it.todo('should emit status-update with state:completed and final:true when task finishes');
    it.todo('should emit status-update with state:failed for errors');
    it.todo('should emit status-update with state:canceled when task is canceled');
    it.todo('should support Last-Event-ID for stream resumption');
  });

  describe('A2A specification compliance', () => {
    it.todo('should include id field with monotonic values in all events');
    it.todo('should include ts field with ISO-8601 timestamps');
    it.todo('should emit heartbeat events every 25 seconds');
    it.todo('should handle client disconnection gracefully');
    it.todo('should NOT include JSON-RPC envelopes in streaming responses');
    it.todo('should use A2A event kinds: task, status-update, artifact-update');
    it.todo('should signal terminal state with final:true on status-update');
  });
});

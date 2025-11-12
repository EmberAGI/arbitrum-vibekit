import type { Server } from 'http';

import type { Part } from '@a2a-js/sdk';
import { A2AClient } from '@a2a-js/sdk/client';
import { v4 as uuidv4 } from 'uuid';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createA2AServer } from '../../src/a2a/server.js';
import { initFromConfigWorkspace, type AgentConfigHandle } from '../../src/config/runtime/init.js';
import { serviceConfig } from '../../src/config.js';
import { aggregateArtifacts } from '../utils/artifact-aggregator.js';
import { createTestConfigWorkspace } from '../utils/test-config-workspace.js';

/**
 * Live test for A2A server to verify AI integration is working
 * Tests actual server responses with self-contained server instance using the official A2A client
 */
describe('A2A Server Live Tests', () => {
  let server: Server;
  let client: A2AClient;
  let baseUrl: string;
  let agentConfigHandle: AgentConfigHandle;
  let testConfigDir: string;

  beforeAll(async () => {
    try {
      // Create a minimal test config workspace with Ember MCP server and skill
      testConfigDir = createTestConfigWorkspace({
        agentName: 'E2E Test Agent',
        agentUrl: 'http://localhost:3000/a2a', // Will be updated with actual port
        skills: [
          {
            id: 'swap-skill',
            name: 'Token Swap Skill',
            mcpServers: ['ember-onchain'],
          },
        ],
        mcpServers: {
          'ember-onchain': {
            type: 'http',
            url: 'https://api.emberai.xyz/mcp',
          },
        },
      });

      // Initialize agent config from test workspace
      agentConfigHandle = await initFromConfigWorkspace({
        root: testConfigDir,
        dev: false,
      });

      // Create server with config (same pattern as server.ts)
      server = await createA2AServer({
        serviceConfig,
        agentConfig: agentConfigHandle,
      });

      // Wait for server to be listening (necessary for port: 0)
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

        // Test that server is responding
        const cardUrl = `${baseUrl}/.well-known/agent.json`;
        const cardResponse = await fetch(cardUrl);
        if (!cardResponse.ok) {
          throw new Error(
            `Agent card fetch failed: ${cardResponse.status} ${cardResponse.statusText}`,
          );
        }
        const card = (await cardResponse.json()) as { url?: string };
        console.log('[E2E] Agent card URL from server:', card.url);
        console.log('[E2E] Expected URL:', `${baseUrl}/a2a`);

        // Create A2A client using the server URL
        client = await A2AClient.fromCardUrl(cardUrl);
      } else {
        throw new Error('Server address not available');
      }
    } catch (error) {
      console.error('[E2E] Failed to setup server:', error);
      throw error;
    }
  }, 60000); // 60s timeout: MCP initialization + external LLM warmup can take longer in CI

  afterAll(async () => {
    // Clean up agent config handle first
    if (agentConfigHandle) {
      await agentConfigHandle.close();
    }

    // Then clean up server
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  describe('message/send with AI', () => {
    it('should return an actual AI response for simple queries', async () => {
      // Verify test setup
      if (!client || !baseUrl) {
        throw new Error(`Test setup failed: client=${!!client}, baseUrl=${baseUrl}`);
      }

      // Given a simple query to the A2A server using the client (server creates contextId)
      const response = await client.sendMessage({
        message: {
          kind: 'message',
          messageId: uuidv4(),
          // No contextId - server creates it
          role: 'user',
          parts: [{ kind: 'text', text: 'What is 2+2?' }],
        },
      });

      // Then should have a result, not an error
      if ('error' in response) {
        // If there's an error, fail the test with details
        throw new Error(`Server returned error: ${JSON.stringify(response.error)}`);
      }

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('kind');

      // The response should be either a message or task
      expect(['message', 'task']).toContain(response.result.kind);

      // If it's a message, verify it has content
      if (response.result.kind === 'message') {
        expect(response.result).toHaveProperty('parts');
        expect(Array.isArray(response.result.parts)).toBe(true);
        expect(response.result.parts.length).toBeGreaterThan(0);

        const textPart = response.result.parts.find(
          (p): p is Part & { kind: 'text'; text: string } => p.kind === 'text',
        );
        expect(textPart).toBeDefined();
        if (textPart && 'text' in textPart) {
          expect(textPart.text).toBeDefined();
          expect(textPart.text.length).toBeGreaterThan(0);

          // The response should NOT be the default "No handler available" message
          expect(textPart.text).not.toContain('No handler available');
        }
      }
    }, 10000); // 10s timeout: simple AI query should respond quickly

    it('should handle streaming requests with LLM', async () => {
      // Given a streaming request using the client (server creates contextId)
      const streamGenerator = client.sendMessageStream({
        message: {
          kind: 'message',
          messageId: uuidv4(),
          // No contextId - server creates it
          role: 'user',
          parts: [{ kind: 'text', text: 'Count from 1 to 3' }],
        },
      });

      // When collecting events from the stream
      const events: unknown[] = [];
      let attempts = 0;
      const maxAttempts = 10;

      try {
        for await (const event of streamGenerator) {
          events.push(event);
          attempts++;
          if (attempts >= maxAttempts) {
            break;
          }
        }
      } catch (error) {
        // If streaming is not supported, that's OK for this test
        if ((error as Error).message?.includes('streaming')) {
          return;
        }
        throw error;
      }

      // Then verify we received stream events
      expect(events.length).toBeGreaterThan(0);
    }, 20000); // 20s timeout: allows time for streaming response chunks

    it('should verify LLM configuration is properly loaded', async () => {
      // Given a query that would require LLM to answer properly using the client (server creates contextId)
      const response = await client.sendMessage({
        message: {
          kind: 'message',
          messageId: uuidv4(),
          // No contextId - server creates it
          role: 'user',
          parts: [{ kind: 'text', text: 'Hello, are you working?' }],
        },
      });

      // Check for proper LLM response, not fallback
      if ('result' in response) {
        // These are signs the LLM is NOT configured:
        const fallbackMessages = [
          'No handler available',
          'Handler not configured',
          'LLM service not available',
        ];

        if (response.result.kind === 'message') {
          const textPart = response.result.parts.find(
            (p): p is Part & { kind: 'text'; text: string } => p.kind === 'text',
          );
          expect(textPart).toBeDefined();
          if (textPart) {
            for (const fallback of fallbackMessages) {
              expect(textPart.text).not.toContain(fallback);
            }
          }
        } else if (response.result.kind === 'task') {
          // Aggregate any text parts from artifacts
          const texts: string[] = [];
          for (const artifact of response.result.artifacts ?? []) {
            for (const part of artifact.parts ?? []) {
              if (part.kind === 'text' && 'text' in part) {
                texts.push((part as Part & { kind: 'text'; text: string }).text);
              }
            }
          }
          expect(texts.length).toBeGreaterThan(0);
          const combined = texts.join(' ');
          for (const fallback of fallbackMessages) {
            expect(combined).not.toContain(fallback);
          }
        } else {
          throw new Error('Unexpected result kind');
        }
      } else {
        throw new Error(`Unexpected response structure: ${JSON.stringify(response)}`);
      }
    }, 10000); // 10s timeout: config validation is a simple check

    it('should return tool call artifacts for token swap request', async () => {
      // Given a token swap request via streaming (new session, no contextId)
      const streamGenerator = client.sendMessageStream({
        message: {
          kind: 'message',
          messageId: uuidv4(),
          role: 'user',
          parts: [
            {
              kind: 'text',
              text: 'Swap 0.00005 Wrapped ETH to USDC from Arbitrum One to Arbitrum One using wallet 0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
            },
          ],
        },
      });

      // When collecting and aggregating stream events
      const artifacts = await aggregateArtifacts(streamGenerator);

      // Then verify create_swap tool call artifact is present with complete data
      const swapArtifact = Object.entries(artifacts).find(([id]) => id.includes('create_swap'));
      expect(swapArtifact, 'Expected create_swap tool call artifact in response').toBeDefined();

      if (swapArtifact) {
        const [, artifact] = swapArtifact;
        expect(artifact.parts.length, 'Tool call artifact should have parts').toBeGreaterThan(0);
        expect(artifact.complete, 'Tool call artifact should be marked complete').toBe(true);
      }
    }, 30000); // 30s timeout: includes MCP tool execution + AI reasoning time
  });
});

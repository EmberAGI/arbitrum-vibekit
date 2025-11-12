import type { Server } from 'http';

import { A2AClient } from '@a2a-js/sdk/client';
import { v4 as uuidv4 } from 'uuid';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { AgentConfigHandle } from '../../src/config/runtime/init.js';
import { aggregateArtifacts } from '../utils/artifact-aggregator.js';
import { createTestA2AServer, cleanupTestServer } from '../utils/test-server.js';

/**
 * Integration test that mirrors the E2E token swap streaming scenario
 * Uses MSW recorded mocks (streaming-token-swap) to ensure deterministic output
 */
describe('A2A Token Swap Streaming (MSW)', () => {
  let server: Server;
  let agentConfigHandle: AgentConfigHandle;
  let baseUrl: string;
  let client: A2AClient;

  beforeEach(async () => {
    const result = await createTestA2AServer({ port: 0, host: '127.0.0.1' });
    server = result.server;
    agentConfigHandle = result.agentConfigHandle;

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to determine server address');
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
    client = await A2AClient.fromCardUrl(`${baseUrl}/.well-known/agent.json`);
  });

  afterEach(async () => {
    if (server && agentConfigHandle) {
      await cleanupTestServer(server, agentConfigHandle);
    }
  });

  it('should return streaming artifacts for token swap request using recorded mocks', async () => {
    // Given: seed a context with an initial message to ensure provider mock routes to streaming-with-context
    // Server creates contextId on first message
    const response = await client.sendMessage({
      message: {
        kind: 'message',
        messageId: uuidv4(),
        // No contextId - server creates it
        role: 'user',
        parts: [{ kind: 'text', text: 'Hello' }],
      },
    });

    // Extract contextId from response
    let contextId: string | undefined;
    if ('result' in response && 'contextId' in response.result) {
      contextId = response.result.contextId as string;
    }
    expect(contextId).toBeDefined();

    // And a streaming swap request using server-provided contextId
    const stream = client.sendMessageStream({
      message: {
        kind: 'message',
        messageId: uuidv4(),
        contextId,
        role: 'user',
        parts: [
          {
            kind: 'text',
            text: 'Swap 0.00005 Wrapped ETH to USDC from Arbitrum One to Arbitrum One using wallet 0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
          },
        ],
      },
    });

    // When: aggregating the streaming artifacts
    const artifacts = await aggregateArtifacts(stream);
    const artifactIds = Object.keys(artifacts);

    // Then: artifacts are produced (ring-buffer flushed)
    expect(artifactIds.length).toBeGreaterThan(0);

    // Verify at least one artifact (text-response) has content and is marked complete
    const completedArtifact = Object.entries(artifacts).find(
      ([id, a]) => id.startsWith('text-response-') && a.complete,
    );
    expect(completedArtifact).toBeDefined();
    if (completedArtifact) {
      const [, artifact] = completedArtifact;
      expect(artifact.parts.length).toBeGreaterThan(0);
    }
  }, 10000);
});

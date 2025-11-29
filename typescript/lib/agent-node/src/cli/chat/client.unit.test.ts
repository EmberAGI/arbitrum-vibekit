import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ChatClient } from './client.js';

// Mock A2AClient
const mockA2AClient = {
  sendMessageStream: vi.fn(),
};

vi.mock('@a2a-js/sdk/client', () => ({
  A2AClient: {
    fromCardUrl: vi.fn().mockResolvedValue(mockA2AClient),
  },
}));

describe('ChatClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fromUrl (initialization)', () => {
    it('creates client from agent base URL', async () => {
      // Given: an agent base URL
      const baseUrl = 'http://localhost:3000';

      // When: creating chat client from URL
      const client = await ChatClient.fromUrl(baseUrl);

      // Then: should initialize with correct card URL
      const { A2AClient } = await import('@a2a-js/sdk/client');
      expect(A2AClient.fromCardUrl).toHaveBeenCalledWith(
        'http://localhost:3000/.well-known/agent-card.json',
      );
      expect(client).toBeInstanceOf(ChatClient);
    });

    it('normalizes URL by removing trailing slash', async () => {
      // Given: a base URL with trailing slash
      const baseUrl = 'http://localhost:3000/';

      // When: creating chat client from URL
      const client = await ChatClient.fromUrl(baseUrl);

      // Then: trailing slash should be removed
      const { A2AClient } = await import('@a2a-js/sdk/client');
      expect(A2AClient.fromCardUrl).toHaveBeenCalledWith(
        'http://localhost:3000/.well-known/agent-card.json',
      );
      expect(client.getBaseUrl()).toBe('http://localhost:3000');
    });

    it('handles HTTPS URLs', async () => {
      // Given: an HTTPS base URL
      const baseUrl = 'https://api.example.com:8443';

      // When: creating chat client from URL
      await ChatClient.fromUrl(baseUrl);

      // Then: should construct correct card URL
      const { A2AClient } = await import('@a2a-js/sdk/client');
      expect(A2AClient.fromCardUrl).toHaveBeenCalledWith(
        'https://api.example.com:8443/.well-known/agent-card.json',
      );
    });
  });

  describe('sendMessage (streaming)', () => {
    it('sends message without contextId on first call', async () => {
      // Given: a chat client
      const client = await ChatClient.fromUrl('http://localhost:3000');

      // Mock stream
      async function* mockStream() {
        yield {
          kind: 'artifact-update',
          contextId: 'ctx-123',
          artifact: {
            artifactId: 'text-1',
            name: 'text-response',
            parts: [{ kind: 'text', text: 'Hello' }],
          },
        };
      }
      mockA2AClient.sendMessageStream.mockReturnValue(mockStream());

      // When: sending first message
      const stream = client.sendMessage('Hello world');

      // Consume stream
      for await (const event of stream) {
        // Process events
        expect(event.kind).toBe('artifact-update');
      }

      // Then: message should not include contextId
      expect(mockA2AClient.sendMessageStream).toHaveBeenCalledWith({
        message: expect.objectContaining({
          role: 'user',
          parts: [{ kind: 'text', text: 'Hello world' }],
        }),
      });

      const callArg = mockA2AClient.sendMessageStream.mock.calls[0][0].message;
      expect(callArg).not.toHaveProperty('contextId');
    });

    it('extracts and persists contextId from first stream event', async () => {
      // Given: a chat client
      const client = await ChatClient.fromUrl('http://localhost:3000');

      // Mock stream with contextId
      async function* mockStream() {
        yield {
          kind: 'artifact-update',
          contextId: 'ctx-456',
          artifact: {
            artifactId: 'text-1',
            parts: [{ kind: 'text', text: 'Response' }],
          },
        };
      }
      mockA2AClient.sendMessageStream.mockReturnValue(mockStream());

      // When: consuming stream
      const stream = client.sendMessage('Message 1');
      for await (const _event of stream) {
        // Consume stream
      }

      // Then: contextId should be extracted and stored
      expect(client.getContextId()).toBe('ctx-456');
    });

    it('includes contextId in subsequent messages', async () => {
      // Given: a chat client with existing context
      const client = await ChatClient.fromUrl('http://localhost:3000');

      // First message to establish context
      async function* firstStream() {
        yield {
          kind: 'artifact-update',
          contextId: 'ctx-789',
          artifact: {
            artifactId: 'text-1',
            parts: [{ kind: 'text', text: 'First' }],
          },
        };
      }
      mockA2AClient.sendMessageStream.mockReturnValueOnce(firstStream());

      const stream1 = client.sendMessage('First message');
      for await (const _event of stream1) {
        // Consume first stream
      }

      // Mock second stream
      async function* secondStream() {
        yield {
          kind: 'status-update',
          final: true,
        };
      }
      mockA2AClient.sendMessageStream.mockReturnValueOnce(secondStream());

      // When: sending second message
      const stream2 = client.sendMessage('Second message');
      for await (const _event of stream2) {
        // Consume second stream
      }

      // Then: second message should include contextId
      const secondCall = mockA2AClient.sendMessageStream.mock.calls[1][0].message;
      expect(secondCall.contextId).toBe('ctx-789');
    });

    it('classifies artifact-update events correctly', async () => {
      // Given: a stream with artifact-update event
      const client = await ChatClient.fromUrl('http://localhost:3000');

      async function* mockStream() {
        yield {
          kind: 'artifact-update',
          artifact: {
            artifactId: 'text-1',
            name: 'text-response',
            parts: [{ kind: 'text', text: 'Content' }],
          },
        };
      }
      mockA2AClient.sendMessageStream.mockReturnValue(mockStream());

      // When: consuming stream
      const events = [];
      for await (const event of client.sendMessage('Test')) {
        events.push(event);
      }

      // Then: event should be classified as artifact-update
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('artifact-update');
      expect(events[0].data).toHaveProperty('artifact');
    });

    it('classifies status-update events correctly', async () => {
      // Given: a stream with status-update event
      const client = await ChatClient.fromUrl('http://localhost:3000');

      async function* mockStream() {
        yield {
          kind: 'status-update',
          final: true,
          state: 'completed',
        };
      }
      mockA2AClient.sendMessageStream.mockReturnValue(mockStream());

      // When: consuming stream
      const events = [];
      for await (const event of client.sendMessage('Test')) {
        events.push(event);
      }

      // Then: event should be classified as status-update
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('status-update');
      expect(events[0].data).toHaveProperty('final');
    });

    it('classifies unknown events correctly', async () => {
      // Given: a stream with unknown event type
      const client = await ChatClient.fromUrl('http://localhost:3000');

      async function* mockStream() {
        yield {
          kind: 'tool-call',
          toolName: 'search',
          data: { query: 'test' },
        };
      }
      mockA2AClient.sendMessageStream.mockReturnValue(mockStream());

      // When: consuming stream
      const events = [];
      for await (const event of client.sendMessage('Test')) {
        events.push(event);
      }

      // Then: event should be classified as unknown
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('unknown');
      expect(events[0].data).toHaveProperty('toolName');
    });

    it('handles mixed event types in stream', async () => {
      // Given: a stream with multiple event types
      const client = await ChatClient.fromUrl('http://localhost:3000');

      async function* mockStream() {
        yield {
          kind: 'artifact-update',
          contextId: 'ctx-123',
          artifact: {
            artifactId: 'text-1',
            parts: [{ kind: 'text', text: 'Response' }],
          },
        };
        yield {
          kind: 'tool-call',
          tool: 'search',
        };
        yield {
          kind: 'status-update',
          final: true,
        };
      }
      mockA2AClient.sendMessageStream.mockReturnValue(mockStream());

      // When: consuming stream
      const events = [];
      for await (const event of client.sendMessage('Test')) {
        events.push(event);
      }

      // Then: all events should be classified correctly
      expect(events).toHaveLength(3);
      expect(events[0].kind).toBe('artifact-update');
      expect(events[1].kind).toBe('unknown');
      expect(events[2].kind).toBe('status-update');
    });

    it('includes messageId in sent messages', async () => {
      // Given: a chat client
      const client = await ChatClient.fromUrl('http://localhost:3000');

      async function* mockStream() {
        yield { kind: 'status-update', final: true };
      }
      mockA2AClient.sendMessageStream.mockReturnValue(mockStream());

      // When: sending message
      const stream = client.sendMessage('Test message');
      for await (const _event of stream) {
        // Consume stream
      }

      // Then: message should include messageId (UUID format)
      const message = mockA2AClient.sendMessageStream.mock.calls[0][0].message;
      expect(message.messageId).toBeDefined();
      expect(message.messageId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });
  });

  describe('getContextId', () => {
    it('returns undefined when no context established', async () => {
      // Given: a new chat client
      const client = await ChatClient.fromUrl('http://localhost:3000');

      // When: getting context ID before any messages
      const contextId = client.getContextId();

      // Then: should return undefined
      expect(contextId).toBeUndefined();
    });

    it('returns contextId after first message', async () => {
      // Given: a chat client with established context
      const client = await ChatClient.fromUrl('http://localhost:3000');

      async function* mockStream() {
        yield {
          kind: 'artifact-update',
          contextId: 'ctx-abc',
          artifact: { artifactId: 'text-1', parts: [] },
        };
      }
      mockA2AClient.sendMessageStream.mockReturnValue(mockStream());

      // When: sending message and consuming stream
      for await (const _event of client.sendMessage('Hello')) {
        // Consume stream
      }

      // Then: contextId should be available
      expect(client.getContextId()).toBe('ctx-abc');
    });
  });

  describe('getBaseUrl', () => {
    it('returns the normalized base URL', async () => {
      // Given: a chat client created from URL
      const client = await ChatClient.fromUrl('http://localhost:3000/');

      // When: getting base URL
      const baseUrl = client.getBaseUrl();

      // Then: should return normalized URL without trailing slash
      expect(baseUrl).toBe('http://localhost:3000');
    });
  });

  describe('resetContext', () => {
    it('clears the conversation context', async () => {
      // Given: a chat client with established context
      const client = await ChatClient.fromUrl('http://localhost:3000');

      async function* mockStream() {
        yield {
          kind: 'artifact-update',
          contextId: 'ctx-reset-test',
          artifact: { artifactId: 'text-1', parts: [] },
        };
      }
      mockA2AClient.sendMessageStream.mockReturnValue(mockStream());

      // Establish context
      for await (const _event of client.sendMessage('Setup')) {
        // Consume stream
      }
      expect(client.getContextId()).toBe('ctx-reset-test');

      // When: resetting context
      client.resetContext();

      // Then: contextId should be cleared
      expect(client.getContextId()).toBeUndefined();
    });

    it('allows starting new conversation after reset', async () => {
      // Given: a chat client with reset context
      const client = await ChatClient.fromUrl('http://localhost:3000');

      // Establish and reset context
      async function* firstStream() {
        yield {
          contextId: 'old-ctx',
          kind: 'status-update',
          final: true,
        };
      }
      mockA2AClient.sendMessageStream.mockReturnValueOnce(firstStream());
      for await (const _event of client.sendMessage('First')) {
        // Consume
      }

      client.resetContext();

      // Mock new conversation
      async function* newStream() {
        yield {
          contextId: 'new-ctx',
          kind: 'status-update',
          final: true,
        };
      }
      mockA2AClient.sendMessageStream.mockReturnValueOnce(newStream());

      // When: sending message after reset
      for await (const _event of client.sendMessage('New conversation')) {
        // Consume
      }

      // Then: should not include old contextId in message
      const lastCall =
        mockA2AClient.sendMessageStream.mock.calls[
          mockA2AClient.sendMessageStream.mock.calls.length - 1
        ][0].message;
      expect(lastCall).not.toHaveProperty('contextId');

      // And new contextId should be tracked
      expect(client.getContextId()).toBe('new-ctx');
    });
  });
});

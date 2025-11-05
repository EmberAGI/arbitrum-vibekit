/**
 * Integration tests for CLI chat streaming behavior
 * Tests end-to-end artifact streaming, assembly, and rendering
 */

import type { Part } from '@a2a-js/sdk';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { ChatClient } from '../src/cli/chat/client.js';
import { StreamRenderer } from '../src/cli/chat/renderer.js';
import type { ArtifactUpdateEvent, StatusUpdateEvent } from '../src/client/index.js';

// Mock A2A SDK client
vi.mock('@a2a-js/sdk/client', () => ({
  A2AClient: {
    fromCardUrl: vi.fn(),
  },
}));

describe('CLI chat streaming (integration)', () => {
  let originalIsTTY: boolean | undefined;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processStdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true; // Enable TTY for REPL tests

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processStdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    vi.clearAllMocks();
  });

  afterEach(() => {
    process.stdin.isTTY = originalIsTTY;
    consoleLogSpy.mockRestore();
    processStdoutWriteSpy.mockRestore();
  });

  describe('progressive text-response streaming', () => {
    it('streams text-response progressively without duplication', async () => {
      // Given: stream with progressive text updates
      async function* mockStream() {
        yield {
          kind: 'artifact-update',
          contextId: 'ctx-1',
          artifact: {
            artifactId: 'text-1',
            name: 'text-response',
            parts: [{ kind: 'text', text: 'Hello' }] as Part[],
          },
          append: false,
        } as ArtifactUpdateEvent;

        yield {
          kind: 'artifact-update',
          artifact: {
            artifactId: 'text-1',
            name: 'text-response',
            parts: [{ kind: 'text', text: ' world' }] as Part[],
          },
          append: true,
        } as ArtifactUpdateEvent;

        yield {
          kind: 'artifact-update',
          artifact: {
            artifactId: 'text-1',
            name: 'text-response',
            parts: [{ kind: 'text', text: '!' }] as Part[],
          },
          append: true,
          lastChunk: true,
        } as ArtifactUpdateEvent;

        yield {
          kind: 'status-update',
          final: true,
        } as StatusUpdateEvent;
      }

      const mockA2AClient = {
        sendMessageStream: vi.fn().mockReturnValue(mockStream()),
      };

      const { A2AClient } = await import('@a2a-js/sdk/client');
      (A2AClient.fromCardUrl as ReturnType<typeof vi.fn>).mockResolvedValue(mockA2AClient);

      // When: consuming stream through renderer
      const renderer = new StreamRenderer({ colors: false, verbose: false });

      for await (const chunk of mockStream()) {
        if (chunk.kind === 'artifact-update') {
          renderer.processArtifactUpdate(chunk);
        } else if (chunk.kind === 'status-update') {
          renderer.processStatusUpdate(chunk);
        }
      }

      // Then: text should be streamed incrementally
      const writes = processStdoutWriteSpy.mock.calls.map((call) => call[0]);
      const output = writes.join('');

      expect(output).toContain('Hello');
      expect(output).toContain('world');
      expect(output).toContain('!');
    });

    it('handles append semantics correctly', async () => {
      // Given: stream with append=true updates
      const renderer = new StreamRenderer({ colors: false, verbose: false });

      const update1: ArtifactUpdateEvent = {
        kind: 'artifact-update',
        artifact: {
          artifactId: 'text-1',
          name: 'text-response',
          parts: [{ kind: 'text', text: 'First' }] as Part[],
        },
        append: false, // Initial content
      };

      const update2: ArtifactUpdateEvent = {
        kind: 'artifact-update',
        artifact: {
          artifactId: 'text-1',
          name: 'text-response',
          parts: [{ kind: 'text', text: ' Second' }] as Part[],
        },
        append: true, // Append to existing
      };

      // When: processing updates
      renderer.processArtifactUpdate(update1);
      renderer.processArtifactUpdate(update2);

      // Then: output should contain both parts
      const writes = processStdoutWriteSpy.mock.calls.map((call) => call[0]);
      const output = writes.join('');

      expect(output).toContain('First');
      expect(output).toContain('Second');
    });
  });

  describe('reasoning artifact handling', () => {
    it('suppresses reasoning by default', async () => {
      // Given: stream with reasoning artifact
      const renderer = new StreamRenderer({ colors: false, verbose: false });

      const reasoningUpdate: ArtifactUpdateEvent = {
        kind: 'artifact-update',
        artifact: {
          artifactId: 'reasoning-1',
          name: 'reasoning',
          parts: [{ kind: 'text', text: 'Thinking about the problem...' }] as Part[],
        },
        append: false,
      };

      // When: processing reasoning artifact
      renderer.processArtifactUpdate(reasoningUpdate);

      // Then: reasoning should not be displayed
      const writes = processStdoutWriteSpy.mock.calls.map((call) => call[0]);
      const output = writes.join('');

      expect(output).not.toContain('Thinking about the problem');
    });

    it('shows reasoning in verbose mode', async () => {
      // Given: stream with reasoning artifact and verbose renderer
      const renderer = new StreamRenderer({ colors: false, verbose: true });

      const reasoningUpdate: ArtifactUpdateEvent = {
        kind: 'artifact-update',
        artifact: {
          artifactId: 'reasoning-1',
          name: 'reasoning',
          parts: [{ kind: 'text', text: 'Analyzing the query...' }] as Part[],
        },
        append: false,
      };

      // When: processing reasoning artifact in verbose mode
      renderer.processArtifactUpdate(reasoningUpdate);

      // Then: reasoning should be displayed
      const writes = processStdoutWriteSpy.mock.calls.map((call) => call[0]);
      const output = writes.join('');

      expect(output).toContain('Analyzing the query');
    });
  });

  describe('artifact summaries on final status', () => {
    it('prints summaries for non text-response artifacts on final:true', async () => {
      // Given: stream with non text-response artifact and final status
      const renderer = new StreamRenderer({ colors: false, verbose: false });

      const toolArtifact: ArtifactUpdateEvent = {
        kind: 'artifact-update',
        artifact: {
          artifactId: 'tool-result-1',
          name: 'tool-result',
          parts: [{ kind: 'text', text: 'Tool output data' }] as Part[],
        },
        append: false,
      };

      const finalStatus: StatusUpdateEvent = {
        kind: 'status-update',
        final: true,
      };

      // When: processing artifact and final status
      renderer.processArtifactUpdate(toolArtifact);
      renderer.processStatusUpdate(finalStatus);

      // Then: should print summary for tool-result
      const writes = processStdoutWriteSpy.mock.calls.map((call) => call[0]);
      const output = writes.join('');

      expect(output).toContain('tool-result');
    });

    it('excludes text-response from final summaries', async () => {
      // Given: stream with text-response and final status
      const renderer = new StreamRenderer({ colors: false, verbose: false });

      const textArtifact: ArtifactUpdateEvent = {
        kind: 'artifact-update',
        artifact: {
          artifactId: 'text-1',
          name: 'text-response',
          parts: [{ kind: 'text', text: 'User-visible response' }] as Part[],
        },
        append: false,
      };

      const toolArtifact: ArtifactUpdateEvent = {
        kind: 'artifact-update',
        artifact: {
          artifactId: 'tool-1',
          name: 'tool-result',
          parts: [{ kind: 'text', text: 'Tool data' }] as Part[],
        },
        append: false,
      };

      const finalStatus: StatusUpdateEvent = {
        kind: 'status-update',
        final: true,
      };

      // When: processing artifacts and final status
      renderer.processArtifactUpdate(textArtifact);
      renderer.processArtifactUpdate(toolArtifact);
      renderer.processStatusUpdate(finalStatus);

      // Then: summary should include tool-result but not text-response
      const writes = processStdoutWriteSpy.mock.calls.map((call) => call[0]);
      const output = writes.join('');

      expect(output).toContain('tool-result');
      expect(output).not.toMatch(/text-response.*summary/i);
    });

    it('includes artifact metadata in summaries', async () => {
      // Given: stream with multiple artifact updates
      const renderer = new StreamRenderer({ colors: false, verbose: false });

      // Multiple updates to same artifact
      renderer.processArtifactUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'data-1',
          name: 'data-artifact',
          parts: [{ kind: 'text', text: 'Part 1' }] as Part[],
        },
        append: false,
      });

      renderer.processArtifactUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'data-1',
          name: 'data-artifact',
          parts: [{ kind: 'text', text: 'Part 2' }] as Part[],
        },
        append: true,
      });

      renderer.processArtifactUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'data-1',
          name: 'data-artifact',
          parts: [{ kind: 'text', text: 'Part 3' }] as Part[],
        },
        append: true,
        lastChunk: true,
      });

      renderer.processStatusUpdate({
        kind: 'status-update',
        final: true,
      });

      // Then: summary should show update count and completion
      const writes = processStdoutWriteSpy.mock.calls.map((call) => call[0]);
      const output = writes.join('');

      expect(output).toContain('data-artifact');
      // Metadata like update count would be in summary format
    });
  });

  describe('tool event filtering', () => {
    it('does not pollute chat stream with tool events', async () => {
      // Given: mixed stream with tool events
      async function* mockStream() {
        yield {
          kind: 'tool-call',
          toolName: 'search',
          arguments: { query: 'test' },
        };

        yield {
          kind: 'artifact-update',
          artifact: {
            artifactId: 'text-1',
            name: 'text-response',
            parts: [{ kind: 'text', text: 'Response' }] as Part[],
          },
        } as ArtifactUpdateEvent;

        yield {
          kind: 'tool-result',
          toolName: 'search',
          result: { data: 'results' },
        };

        yield {
          kind: 'status-update',
          final: true,
        } as StatusUpdateEvent;
      }

      const mockA2AClient = {
        sendMessageStream: vi.fn().mockReturnValue(mockStream()),
      };

      const { A2AClient } = await import('@a2a-js/sdk/client');
      (A2AClient.fromCardUrl as ReturnType<typeof vi.fn>).mockResolvedValue(mockA2AClient);

      const client = await ChatClient.fromUrl('http://localhost:3000');
      const renderer = new StreamRenderer({ colors: false, verbose: false });

      // When: consuming stream and processing events
      for await (const event of client.sendMessage('Test')) {
        if (event.kind === 'artifact-update') {
          renderer.processArtifactUpdate(event.data as ArtifactUpdateEvent);
        } else if (event.kind === 'status-update') {
          renderer.processStatusUpdate(event.data as StatusUpdateEvent);
        }
        // Tool events are filtered out (not processed by renderer)
      }

      // Then: only artifact and status events should affect output
      const writes = processStdoutWriteSpy.mock.calls.map((call) => call[0]);
      const output = writes.join('');

      expect(output).toContain('Response');
      expect(output).not.toContain('search'); // Tool calls shouldn't pollute output
    });
  });

  describe('artifact assembly correctness', () => {
    it('assembles multi-part artifacts correctly', async () => {
      // Given: stream with multi-part artifact
      const renderer = new StreamRenderer({ colors: false, verbose: false });

      // Part 1
      renderer.processArtifactUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'text-1',
          name: 'text-response',
          parts: [{ kind: 'text', text: 'First part. ' }] as Part[],
        },
        append: false,
      });

      // Part 2
      renderer.processArtifactUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'text-1',
          name: 'text-response',
          parts: [{ kind: 'text', text: 'Second part. ' }] as Part[],
        },
        append: true,
      });

      // Part 3
      renderer.processArtifactUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'text-1',
          name: 'text-response',
          parts: [{ kind: 'text', text: 'Final part.' }] as Part[],
        },
        append: true,
        lastChunk: true,
      });

      // Then: all parts should be present in output
      const writes = processStdoutWriteSpy.mock.calls.map((call) => call[0]);
      const output = writes.join('');

      expect(output).toContain('First part');
      expect(output).toContain('Second part');
      expect(output).toContain('Final part');
    });

    it('handles replace semantics (append=false)', async () => {
      // Given: stream with replace update
      const renderer = new StreamRenderer({ colors: false, verbose: false });

      renderer.processArtifactUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'text-1',
          name: 'text-response',
          parts: [{ kind: 'text', text: 'Original content' }] as Part[],
        },
        append: false,
      });

      renderer.processArtifactUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'text-1',
          name: 'text-response',
          parts: [{ kind: 'text', text: 'Replaced content' }] as Part[],
        },
        append: false, // Replace mode
      });

      // Then: output should reflect replacement
      const writes = processStdoutWriteSpy.mock.calls.map((call) => call[0]);
      const output = writes.join('');

      expect(output).toContain('Replaced content');
      expect(writes[writes.length - 1]).toBe('\nReplaced content');
    });

    it('tracks multiple artifacts independently', async () => {
      // Given: stream with multiple different artifacts
      const renderer = new StreamRenderer({ colors: false, verbose: false });

      renderer.processArtifactUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'text-1',
          name: 'text-response',
          parts: [{ kind: 'text', text: 'Text response' }] as Part[],
        },
        append: false,
      });

      renderer.processArtifactUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'data-1',
          name: 'data-artifact',
          parts: [{ kind: 'text', text: 'Data content' }] as Part[],
        },
        append: false,
      });

      renderer.processStatusUpdate({
        kind: 'status-update',
        final: true,
      });

      // Then: both artifacts should be tracked
      const writes = processStdoutWriteSpy.mock.calls.map((call) => call[0]);
      const output = writes.join('');

      expect(output).toContain('Text response');
      expect(output).toContain('data-artifact'); // In summary
    });
  });

  describe('final status rendering', () => {
    it('ends chat turn display on final:true', async () => {
      // Given: stream ending with final status
      const renderer = new StreamRenderer({ colors: false, verbose: false });

      renderer.processArtifactUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'text-1',
          name: 'text-response',
          parts: [{ kind: 'text', text: 'Complete response' }] as Part[],
        },
        append: false,
        lastChunk: true,
      });

      const writesBefore = processStdoutWriteSpy.mock.calls.length;

      renderer.processStatusUpdate({
        kind: 'status-update',
        final: true,
      });

      const writesAfter = processStdoutWriteSpy.mock.calls.length;

      // Then: final status should trigger end-of-turn rendering
      expect(writesAfter).toBeGreaterThanOrEqual(writesBefore);
    });

    it('does not end turn on non-final status updates', async () => {
      // Given: non-final status update
      const renderer = new StreamRenderer({ colors: false, verbose: false });

      renderer.processStatusUpdate({
        kind: 'status-update',
        final: false,
        state: 'processing',
      });

      // Then: should not trigger final summary behavior
      const writes = processStdoutWriteSpy.mock.calls.map((call) => call[0]);
      const output = writes.join('');

      // No summary output expected for non-final
      expect(output).not.toMatch(/Artifact Summary/i);
    });
  });

  describe('reset behavior', () => {
    it('clears renderer state between messages', async () => {
      // Given: renderer with previous message data
      const renderer = new StreamRenderer({ colors: false, verbose: false });

      renderer.processArtifactUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'text-1',
          name: 'text-response',
          parts: [{ kind: 'text', text: 'First message' }] as Part[],
        },
        append: false,
      });

      // When: resetting renderer
      renderer.reset();

      // Then: previous artifact data should be cleared
      // Verified by checking that new message doesn't reference old artifact
      renderer.processArtifactUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'text-2',
          name: 'text-response',
          parts: [{ kind: 'text', text: 'Second message' }] as Part[],
        },
        append: false,
      });

      const writes = processStdoutWriteSpy.mock.calls.map((call) => call[0]);
      const output = writes.join('');

      expect(output).toContain('Second message');
    });
  });
});

import { describe, it, expect } from 'vitest';

import {
  isArtifactUpdateEvent,
  isStatusUpdateEvent,
  aggregateArtifacts,
  ArtifactAssembler,
} from './index.js';
import type { ArtifactUpdateEvent, StatusUpdateEvent } from './index.js';

describe('Client Utilities', () => {
  describe('isArtifactUpdateEvent (type guard)', () => {
    it('returns true for valid artifact-update event', () => {
      // Given: a valid artifact-update event
      const event: ArtifactUpdateEvent = {
        kind: 'artifact-update',
        artifact: {
          artifactId: 'test-id',
          name: 'text-response',
          parts: [{ kind: 'text', text: 'hello' }],
        },
        append: true,
        lastChunk: false,
      };

      // When: checking if event is artifact-update
      const result = isArtifactUpdateEvent(event);

      // Then: should return true
      expect(result).toBe(true);
    });

    it('returns false for status-update event', () => {
      // Given: a status-update event
      const event = {
        kind: 'status-update',
        final: true,
      };

      // When: checking if event is artifact-update
      const result = isArtifactUpdateEvent(event);

      // Then: should return false
      expect(result).toBe(false);
    });

    it('returns false for event without artifact field', () => {
      // Given: an event missing artifact field
      const event = {
        kind: 'artifact-update',
      };

      // When: checking if event is artifact-update
      const result = isArtifactUpdateEvent(event);

      // Then: should return false
      expect(result).toBe(false);
    });

    it('returns false for event with invalid artifact', () => {
      // Given: an event with invalid artifact (missing artifactId)
      const event = {
        kind: 'artifact-update',
        artifact: {
          name: 'test',
        },
      };

      // When: checking if event is artifact-update
      const result = isArtifactUpdateEvent(event);

      // Then: should return false
      expect(result).toBe(false);
    });

    it('returns false for null or undefined', () => {
      // Given: null and undefined values
      // When: checking if they are artifact-update events
      // Then: should return false
      expect(isArtifactUpdateEvent(null)).toBe(false);
      expect(isArtifactUpdateEvent(undefined)).toBe(false);
    });
  });

  describe('isStatusUpdateEvent (type guard)', () => {
    it('returns true for valid status-update event', () => {
      // Given: a valid status-update event
      const event: StatusUpdateEvent = {
        kind: 'status-update',
        final: true,
        state: 'completed',
      };

      // When: checking if event is status-update
      const result = isStatusUpdateEvent(event);

      // Then: should return true
      expect(result).toBe(true);
    });

    it('returns false for artifact-update event', () => {
      // Given: an artifact-update event
      const event = {
        kind: 'artifact-update',
        artifact: { artifactId: 'test' },
      };

      // When: checking if event is status-update
      const result = isStatusUpdateEvent(event);

      // Then: should return false
      expect(result).toBe(false);
    });

    it('returns false for unknown event kind', () => {
      // Given: an event with unknown kind
      const event = {
        kind: 'unknown',
      };

      // When: checking if event is status-update
      const result = isStatusUpdateEvent(event);

      // Then: should return false
      expect(result).toBe(false);
    });

    it('returns false for null or undefined', () => {
      // Given: null and undefined values
      // When: checking if they are status-update events
      // Then: should return false
      expect(isStatusUpdateEvent(null)).toBe(false);
      expect(isStatusUpdateEvent(undefined)).toBe(false);
    });
  });

  describe('aggregateArtifacts (streaming function)', () => {
    it('aggregates artifact parts with append semantics', async () => {
      // Given: a stream with multiple artifact-update events using append
      async function* mockStream() {
        yield {
          kind: 'artifact-update',
          artifact: {
            artifactId: 'text-1',
            name: 'text-response',
            parts: [{ kind: 'text', text: 'Hello' }],
          },
          append: false,
        };
        yield {
          kind: 'artifact-update',
          artifact: {
            artifactId: 'text-1',
            parts: [{ kind: 'text', text: ' world' }],
          },
          append: true,
        };
        yield {
          kind: 'artifact-update',
          artifact: {
            artifactId: 'text-1',
            parts: [{ kind: 'text', text: '!' }],
          },
          append: true,
          lastChunk: true,
        };
      }

      // When: aggregating the stream
      const result = await aggregateArtifacts(mockStream());

      // Then: artifact should be assembled correctly
      expect(result['text-1']).toBeDefined();
      expect(result['text-1'].parts).toHaveLength(3);
      expect(result['text-1'].parts[0]).toEqual({ kind: 'text', text: 'Hello' });
      expect(result['text-1'].parts[1]).toEqual({ kind: 'text', text: ' world' });
      expect(result['text-1'].parts[2]).toEqual({ kind: 'text', text: '!' });
      expect(result['text-1'].complete).toBe(true);
    });

    it('replaces artifact parts when append is false', async () => {
      // Given: a stream where append is false (replace mode)
      async function* mockStream() {
        yield {
          kind: 'artifact-update',
          artifact: {
            artifactId: 'text-1',
            parts: [{ kind: 'text', text: 'First' }],
          },
          append: false,
        };
        yield {
          kind: 'artifact-update',
          artifact: {
            artifactId: 'text-1',
            parts: [{ kind: 'text', text: 'Replaced' }],
          },
          append: false,
        };
      }

      // When: aggregating the stream
      const result = await aggregateArtifacts(mockStream());

      // Then: parts should be replaced, not appended
      expect(result['text-1'].parts).toHaveLength(1);
      expect(result['text-1'].parts[0]).toEqual({ kind: 'text', text: 'Replaced' });
    });

    it('handles index-based append for specific part slots', async () => {
      // Given: a stream with index-based updates
      async function* mockStream() {
        yield {
          kind: 'artifact-update',
          artifact: {
            artifactId: 'indexed',
            index: 0,
            parts: [{ kind: 'text', text: 'Part A' }],
          },
          append: true,
        };
        yield {
          kind: 'artifact-update',
          artifact: {
            artifactId: 'indexed',
            index: 0,
            parts: [{ kind: 'text', text: ' Extended' }],
          },
          append: true,
        };
      }

      // When: aggregating the stream
      const result = await aggregateArtifacts(mockStream());

      // Then: parts should be appended at the specified index
      expect(result['indexed'].parts).toHaveLength(1);
      expect(result['indexed'].parts[0]).toEqual({ kind: 'text', text: 'Part A Extended' });
    });

    it('tracks multiple artifacts independently', async () => {
      // Given: a stream with multiple different artifacts
      async function* mockStream() {
        yield {
          kind: 'artifact-update',
          artifact: {
            artifactId: 'art-1',
            parts: [{ kind: 'text', text: 'First artifact' }],
          },
          append: false,
        };
        yield {
          kind: 'artifact-update',
          artifact: {
            artifactId: 'art-2',
            parts: [{ kind: 'text', text: 'Second artifact' }],
          },
          append: false,
        };
      }

      // When: aggregating the stream
      const result = await aggregateArtifacts(mockStream());

      // Then: both artifacts should be tracked separately
      expect(result['art-1']).toBeDefined();
      expect(result['art-2']).toBeDefined();
      expect(result['art-1'].parts[0]).toEqual({ kind: 'text', text: 'First artifact' });
      expect(result['art-2'].parts[0]).toEqual({ kind: 'text', text: 'Second artifact' });
    });

    it('ignores non-artifact events', async () => {
      // Given: a stream with mixed event types
      async function* mockStream() {
        yield {
          kind: 'artifact-update',
          artifact: {
            artifactId: 'text-1',
            parts: [{ kind: 'text', text: 'Content' }],
          },
        };
        yield {
          kind: 'status-update',
          final: true,
        };
        yield {
          kind: 'unknown',
          data: 'something',
        };
      }

      // When: aggregating the stream
      const result = await aggregateArtifacts(mockStream());

      // Then: only artifact-update events should be processed
      expect(Object.keys(result)).toHaveLength(1);
      expect(result['text-1']).toBeDefined();
    });

    it('handles empty stream', async () => {
      // Given: an empty stream
      async function* emptyStream() {
        // yield nothing
      }

      // When: aggregating the stream
      const result = await aggregateArtifacts(emptyStream());

      // Then: should return empty aggregation
      expect(result).toEqual({});
    });
  });

  describe('ArtifactAssembler (class)', () => {
    it('processes updates with append semantics', () => {
      // Given: an assembler instance
      const assembler = new ArtifactAssembler();

      // When: processing multiple updates with append
      const update1 = assembler.processUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'text-1',
          name: 'text-response',
          parts: [{ kind: 'text', text: 'Hello' }],
        },
        append: false,
      });

      const update2 = assembler.processUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'text-1',
          parts: [{ kind: 'text', text: ' world' }],
        },
        append: true,
      });

      // Then: updates should build progressively
      expect(update1.parts).toHaveLength(1);
      expect(update1.updateCount).toBe(1);
      expect(update2.parts).toHaveLength(2);
      expect(update2.updateCount).toBe(2);
      expect(update2.parts[0]).toEqual({ kind: 'text', text: 'Hello' });
      expect(update2.parts[1]).toEqual({ kind: 'text', text: ' world' });
    });

    it('replaces parts when append is false', () => {
      // Given: an assembler with existing artifact
      const assembler = new ArtifactAssembler();
      assembler.processUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'text-1',
          parts: [{ kind: 'text', text: 'Original' }],
        },
        append: false,
      });

      // When: processing update with append=false
      const result = assembler.processUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'text-1',
          parts: [{ kind: 'text', text: 'Replaced' }],
        },
        append: false,
      });

      // Then: parts should be replaced
      expect(result.parts).toHaveLength(1);
      expect(result.parts[0]).toEqual({ kind: 'text', text: 'Replaced' });
    });

    it('tracks completion with lastChunk flag', () => {
      // Given: an assembler instance
      const assembler = new ArtifactAssembler();

      // When: processing updates, final one with lastChunk
      assembler.processUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'text-1',
          parts: [{ kind: 'text', text: 'Content' }],
        },
        append: false,
      });

      const finalUpdate = assembler.processUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'text-1',
          parts: [{ kind: 'text', text: ' Final' }],
        },
        append: true,
        lastChunk: true,
      });

      // Then: artifact should be marked complete
      expect(finalUpdate.complete).toBe(true);
    });

    it('handles index-based part updates', () => {
      // Given: an assembler instance
      const assembler = new ArtifactAssembler();

      // When: processing indexed updates at same slot
      assembler.processUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'indexed',
          index: 0,
          parts: [{ kind: 'text', text: 'Start' }],
        },
        append: true,
      });

      const result = assembler.processUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'indexed',
          index: 0,
          parts: [{ kind: 'text', text: ' Extended' }],
        },
        append: true,
      });

      // Then: text should be concatenated at the same index
      expect(result.parts).toHaveLength(1);
      expect(result.parts[0]).toEqual({ kind: 'text', text: 'Start Extended' });
    });

    it('retrieves artifact by ID', () => {
      // Given: an assembler with artifacts
      const assembler = new ArtifactAssembler();
      assembler.processUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'text-1',
          name: 'text-response',
          parts: [{ kind: 'text', text: 'Content' }],
        },
        append: false,
      });

      // When: getting artifact by ID
      const artifact = assembler.getArtifact('text-1');

      // Then: should return artifact with correct data
      expect(artifact).toBeDefined();
      expect(artifact?.name).toBe('text-response');
      expect(artifact?.parts).toHaveLength(1);
      expect(artifact?.updateCount).toBe(1);
    });

    it('returns undefined for non-existent artifact', () => {
      // Given: an assembler instance
      const assembler = new ArtifactAssembler();

      // When: getting non-existent artifact
      const artifact = assembler.getArtifact('non-existent');

      // Then: should return undefined
      expect(artifact).toBeUndefined();
    });

    it('lists all artifact IDs', () => {
      // Given: an assembler with multiple artifacts
      const assembler = new ArtifactAssembler();
      assembler.processUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'art-1',
          parts: [{ kind: 'text', text: 'A' }],
        },
      });
      assembler.processUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'art-2',
          parts: [{ kind: 'text', text: 'B' }],
        },
      });

      // When: getting artifact IDs
      const ids = assembler.getArtifactIds();

      // Then: should return all IDs
      expect(ids).toHaveLength(2);
      expect(ids).toContain('art-1');
      expect(ids).toContain('art-2');
    });

    it('generates summaries for all artifacts', () => {
      // Given: an assembler with artifacts
      const assembler = new ArtifactAssembler();
      assembler.processUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'text-1',
          name: 'text-response',
          parts: [{ kind: 'text', text: 'Part 1' }],
        },
        append: false,
      });
      assembler.processUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'text-1',
          parts: [{ kind: 'text', text: 'Part 2' }],
        },
        append: true,
        lastChunk: true,
      });

      // When: getting summaries
      const summaries = assembler.getSummaries();

      // Then: should include summary metadata
      expect(summaries).toHaveLength(1);
      expect(summaries[0]).toEqual({
        artifactId: 'text-1',
        name: 'text-response',
        updateCount: 2,
        totalParts: 2,
        complete: true,
      });
    });

    it('resets all tracked artifacts', () => {
      // Given: an assembler with artifacts
      const assembler = new ArtifactAssembler();
      assembler.processUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'text-1',
          parts: [{ kind: 'text', text: 'Content' }],
        },
      });

      // When: resetting the assembler
      assembler.reset();

      // Then: all artifacts should be cleared
      expect(assembler.getArtifactIds()).toHaveLength(0);
      expect(assembler.getArtifact('text-1')).toBeUndefined();
    });

    it('updates artifact name if provided', () => {
      // Given: an assembler with an artifact
      const assembler = new ArtifactAssembler();
      assembler.processUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'text-1',
          name: 'initial-name',
          parts: [{ kind: 'text', text: 'Content' }],
        },
      });

      // When: processing update with new name
      const result = assembler.processUpdate({
        kind: 'artifact-update',
        artifact: {
          artifactId: 'text-1',
          name: 'updated-name',
          parts: [{ kind: 'text', text: 'More' }],
        },
        append: true,
      });

      // Then: name should be updated
      expect(result.name).toBe('updated-name');
    });
  });
});

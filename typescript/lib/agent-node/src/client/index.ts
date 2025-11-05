/**
 * Client utilities for Agent Node
 * Provides artifact assembly and stream processing utilities for building chat clients
 */

import type { Part } from '@a2a-js/sdk';

export type AggregatedArtifact = { parts: Part[]; complete: boolean };
export type ArtifactAggregation = Record<string, AggregatedArtifact>;

export interface ArtifactUpdateEvent {
  kind: 'artifact-update';
  artifact: {
    artifactId: string;
    name?: string;
    parts?: Part[];
    index?: number;
  };
  append?: boolean;
  lastChunk?: boolean;
}

export interface StatusUpdateEvent {
  kind: 'status-update';
  final?: boolean;
  state?: string;
}

/**
 * Type guard to check if an event is an artifact-update event
 */
export function isArtifactUpdateEvent(event: unknown): event is ArtifactUpdateEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'kind' in event &&
    event.kind === 'artifact-update' &&
    'artifact' in event &&
    typeof event.artifact === 'object' &&
    event.artifact !== null &&
    'artifactId' in event.artifact
  );
}

/**
 * Type guard to check if an event is a status-update event
 */
export function isStatusUpdateEvent(event: unknown): event is StatusUpdateEvent {
  return (
    typeof event === 'object' && event !== null && 'kind' in event && event.kind === 'status-update'
  );
}

/**
 * Aggregates artifact-update events from an A2A stream
 *
 * @param streamGenerator - The async generator from client.sendMessageStream()
 * @returns Record of artifact IDs to aggregated artifacts with parts and completion status
 *
 * @example
 * ```typescript
 * const stream = client.sendMessageStream({ message });
 * const artifacts = await aggregateArtifacts(stream);
 * console.log(artifacts['text-response'].parts);
 * ```
 */
export async function aggregateArtifacts(
  streamGenerator: AsyncGenerator<unknown, void, unknown>,
): Promise<ArtifactAggregation> {
  const agg: ArtifactAggregation = {};

  for await (const evt of streamGenerator) {
    if (isArtifactUpdateEvent(evt)) {
      const id = evt.artifact.artifactId;
      const idx = evt.artifact.index;
      const entry = agg[id] ?? { parts: [], complete: false };
      const incoming = evt.artifact.parts ?? [];

      if (evt.append) {
        if (typeof idx === 'number') {
          // append into a specific part "slot"
          entry.parts[idx] = entry.parts[idx] || { kind: 'text', text: '' };
          const incomingText = incoming[0] && 'text' in incoming[0] ? incoming[0].text : '';
          const existingText =
            entry.parts[idx] && 'text' in entry.parts[idx]
              ? ((entry.parts[idx] as { text?: string }).text ?? '')
              : '';
          if (incomingText) {
            entry.parts[idx] = { kind: 'text', text: existingText + incomingText };
          }
        } else {
          // append as new parts
          entry.parts.push(...incoming);
        }
      } else {
        // replace current parts for this artifact
        entry.parts = incoming;
      }

      if (evt.lastChunk) entry.complete = true;
      agg[id] = entry;
    }
  }

  return agg;
}

/**
 * Assembles a single artifact progressively from update events
 * Useful for building custom stream processors
 */
export class ArtifactAssembler {
  private artifacts: Map<
    string,
    {
      parts: Part[];
      complete: boolean;
      name?: string;
      updateCount: number;
    }
  > = new Map();

  /**
   * Process an artifact update event
   * @returns The current state of the artifact after processing this event
   */
  processUpdate(event: ArtifactUpdateEvent): {
    artifactId: string;
    name?: string;
    parts: Part[];
    complete: boolean;
    updateCount: number;
  } {
    const id = event.artifact.artifactId;
    const idx = event.artifact.index;
    const existing = this.artifacts.get(id) ?? {
      parts: [],
      complete: false,
      name: event.artifact.name,
      updateCount: 0,
    };
    const incoming = event.artifact.parts ?? [];

    // Update the name if provided
    if (event.artifact.name) {
      existing.name = event.artifact.name;
    }

    if (event.append) {
      if (typeof idx === 'number') {
        // append into a specific part "slot"
        existing.parts[idx] = existing.parts[idx] || { kind: 'text', text: '' };
        const incomingText = incoming[0] && 'text' in incoming[0] ? incoming[0].text : '';
        const existingText =
          existing.parts[idx] && 'text' in existing.parts[idx]
            ? ((existing.parts[idx] as { text?: string }).text ?? '')
            : '';
        if (incomingText) {
          existing.parts[idx] = { kind: 'text', text: existingText + incomingText };
        }
      } else {
        // append as new parts
        existing.parts.push(...incoming);
      }
    } else {
      // replace current parts for this artifact
      existing.parts = incoming;
    }

    if (event.lastChunk) {
      existing.complete = true;
    }

    existing.updateCount++;
    this.artifacts.set(id, existing);

    return {
      artifactId: id,
      name: existing.name,
      parts: [...existing.parts],
      complete: existing.complete,
      updateCount: existing.updateCount,
    };
  }

  /**
   * Get the current state of an artifact
   */
  getArtifact(artifactId: string):
    | {
        parts: Part[];
        complete: boolean;
        name?: string;
        updateCount: number;
      }
    | undefined {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) return undefined;

    return {
      parts: [...artifact.parts],
      complete: artifact.complete,
      name: artifact.name,
      updateCount: artifact.updateCount,
    };
  }

  /**
   * Get all artifact IDs currently being tracked
   */
  getArtifactIds(): string[] {
    return Array.from(this.artifacts.keys());
  }

  /**
   * Get summary information for all artifacts
   */
  getSummaries(): Array<{
    artifactId: string;
    name?: string;
    updateCount: number;
    totalParts: number;
    complete: boolean;
  }> {
    return Array.from(this.artifacts.entries()).map(([artifactId, artifact]) => ({
      artifactId,
      name: artifact.name,
      updateCount: artifact.updateCount,
      totalParts: artifact.parts.length,
      complete: artifact.complete,
    }));
  }

  /**
   * Clear all tracked artifacts
   */
  reset(): void {
    this.artifacts.clear();
  }
}

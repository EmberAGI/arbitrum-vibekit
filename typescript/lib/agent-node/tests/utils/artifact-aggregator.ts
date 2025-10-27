/**
 * Test utility for aggregating artifact-update events from A2A streams
 * This helper makes it easier to verify streaming artifact behavior in tests
 */

import type { Part } from '@a2a-js/sdk';

export type AggregatedArtifact = { parts: Part[]; complete: boolean };
export type ArtifactAggregation = Record<string, AggregatedArtifact>;

export interface ArtifactUpdateEvent {
  kind: 'artifact-update';
  artifact: {
    artifactId: string;
    parts?: Part[];
    index?: number;
  };
  append?: boolean;
  lastChunk?: boolean;
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
 * console.log(artifacts['tx-summary'].parts);
 * ```
 */
export async function aggregateArtifacts(
  streamGenerator: AsyncGenerator<unknown, void, unknown>,
): Promise<ArtifactAggregation> {
  const agg: ArtifactAggregation = {};

  for await (const evt of streamGenerator) {
    if ((evt as { kind?: string }).kind === 'artifact-update') {
      const artifactEvt = evt as ArtifactUpdateEvent;
      const id = artifactEvt.artifact.artifactId;
      const idx = artifactEvt.artifact.index;
      const entry = agg[id] ?? { parts: [], complete: false };
      const incoming = artifactEvt.artifact.parts ?? [];

      if (artifactEvt.append) {
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

      if (artifactEvt.lastChunk) entry.complete = true;
      agg[id] = entry;
    }
  }

  return agg;
}

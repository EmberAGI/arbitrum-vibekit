import { describe, it, expect, beforeEach, vi } from 'vitest';

import { StreamRenderer } from './renderer.js';
import type { ArtifactUpdateEvent, StatusUpdateEvent } from '../../client/index.js';

function textArtifactUpdate(
  id: string,
  text: string,
  {
    append = true,
    name = 'text-response',
    index,
  }: { append?: boolean; name?: string; index?: number } = {},
): ArtifactUpdateEvent {
  return {
    kind: 'artifact-update',
    artifact: {
      artifactId: id,
      name,
      parts: [{ kind: 'text', text }],
      ...(index !== undefined ? { index } : {}),
    },
    append,
    lastChunk: false,
  };
}

describe('StreamRenderer (behavior)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('streams text-response progressively without duplication', () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string) => {
      writes.push(chunk);
      return true;
    }) as unknown as typeof process.stdout.write);

    const r = new StreamRenderer({ colors: false });
    r.processArtifactUpdate(textArtifactUpdate('t1', 'hello'));
    r.processArtifactUpdate(textArtifactUpdate('t1', 'hello world'));

    // Expect only incremental part to be printed for second update
    expect(writes.join('')).toContain('hello');
    expect(writes.join('')).toContain(' world');
  });

  it('shows reasoning only in verbose mode', () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string) => {
      writes.push(chunk);
      return true;
    }) as unknown as typeof process.stdout.write);

    const r1 = new StreamRenderer({ colors: false, verbose: false });
    r1.processArtifactUpdate(textArtifactUpdate('r1', 'think', { name: 'reasoning' }));
    expect(writes.join('')).not.toContain('think');

    const r2 = new StreamRenderer({ colors: false, verbose: true });
    r2.processArtifactUpdate(textArtifactUpdate('r2', 'reasoning visible', { name: 'reasoning' }));
    expect(writes.join('')).toContain('reasoning visible');
  });

  it('prints compact previews for non-text artifacts in verbose mode', () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string) => {
      writes.push(chunk);
      return true;
    }) as unknown as typeof process.stdout.write);

    const r = new StreamRenderer({ colors: false, verbose: true });
    r.processArtifactUpdate(textArtifactUpdate('a1', 'preview text here', { name: 'tool-result' }));
    expect(writes.join('')).toContain('[tool-result] preview text here');
  });

  it('prints final summaries on status-update final=true excluding text-response', () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string) => {
      writes.push(chunk);
      return true;
    }) as unknown as typeof process.stdout.write);

    const r = new StreamRenderer({ colors: false, verbose: false });
    r.processArtifactUpdate(textArtifactUpdate('t1', 'hello'));
    r.processArtifactUpdate(textArtifactUpdate('n1', 'x', { name: 'tool-result' }));

    const final: StatusUpdateEvent = { kind: 'status-update', final: true };
    r.processStatusUpdate(final);

    const out = writes.join('');
    expect(out).toContain('tool-result');
    expect(out).not.toMatch(/text-response/i);
  });
});

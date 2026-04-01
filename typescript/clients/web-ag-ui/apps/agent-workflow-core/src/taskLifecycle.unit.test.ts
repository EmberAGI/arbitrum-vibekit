import { describe, expect, it } from 'vitest';

import {
  AGENT_COMMANDS,
  extractCommandEnvelopeFromMessages,
  extractCommandFromMessages,
} from './taskLifecycle';

describe('taskLifecycle', () => {
  it('extracts supported commands from last message content', () => {
    const parsed = extractCommandFromMessages([
      {
        content: JSON.stringify({ command: 'sync' }),
      },
    ]);
    expect(parsed).toBe('sync');
  });

  it('extracts command envelope metadata from last message content', () => {
    const parsed = extractCommandEnvelopeFromMessages([
      {
        content: JSON.stringify({ command: 'sync', clientMutationId: 'mutation-1' }),
      },
    ]);
    expect(parsed).toEqual({
      command: 'sync',
      clientMutationId: 'mutation-1',
    });
  });

  it('returns null for unsupported or malformed commands', () => {
    expect(extractCommandFromMessages([{ content: '{"command":"oops"}' }])).toBeNull();
    expect(extractCommandFromMessages([{ content: '{not-json' }])).toBeNull();
  });

  it('exports the canonical command vocabulary', () => {
    expect(AGENT_COMMANDS).toEqual(['hire', 'fire', 'cycle', 'sync']);
  });
});

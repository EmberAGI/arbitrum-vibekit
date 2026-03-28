import { describe, expect, it } from 'vitest';

import { extractCommandEnvelopeFromMessages, extractCommandFromMessages } from './commandEnvelope.js';

const COMMANDS = ['hire', 'fire', 'cycle', 'sync'] as const;
type Command = (typeof COMMANDS)[number];

const isCommand = (value: string): value is Command => COMMANDS.includes(value as Command);

describe('commandEnvelope', () => {
  it('extracts supported commands from last message content', () => {
    const parsed = extractCommandFromMessages({
      messages: [
        {
          content: JSON.stringify({ command: 'sync' }),
        },
      ],
      isCommand,
    });
    expect(parsed).toBe('sync');
  });

  it('extracts command envelope metadata from last message content', () => {
    const parsed = extractCommandEnvelopeFromMessages({
      messages: [
        {
          content: JSON.stringify({ command: 'sync', clientMutationId: 'mutation-1' }),
        },
      ],
      isCommand,
    });
    expect(parsed).toEqual({
      command: 'sync',
      clientMutationId: 'mutation-1',
    });
  });

  it('returns null for unsupported or malformed commands', () => {
    expect(
      extractCommandFromMessages({
        messages: [{ content: '{"command":"oops"}' }],
        isCommand,
      }),
    ).toBeNull();
    expect(
      extractCommandFromMessages({
        messages: [{ content: '{not-json' }],
        isCommand,
      }),
    ).toBeNull();
  });
});

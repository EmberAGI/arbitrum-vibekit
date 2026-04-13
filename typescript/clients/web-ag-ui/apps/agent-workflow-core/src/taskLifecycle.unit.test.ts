import { describe, expect, it } from 'vitest';

import {
  AGENT_COMMANDS,
  buildPendingCommandStateValues,
  buildRunCommandStateUpdate,
  extractCommand,
  extractCommandEnvelope,
} from './taskLifecycle';

describe('taskLifecycle', () => {
  it('extracts supported commands from a normalized workflow command envelope', () => {
    const parsed = extractCommand({
      command: 'refresh',
    });
    expect(parsed).toBe('refresh');
  });

  it('extracts command envelope metadata from a normalized workflow command envelope', () => {
    const parsed = extractCommandEnvelope({
      command: 'refresh',
      clientMutationId: 'mutation-1',
    });
    expect(parsed).toEqual({
      command: 'refresh',
      clientMutationId: 'mutation-1',
    });
  });

  it('returns null for unsupported or malformed normalized command envelopes', () => {
    expect(extractCommand({ command: 'oops' })).toBeNull();
    expect(extractCommand('{"command":"refresh"}')).toBeNull();
  });

  it('builds private pending-command state values for direct workflow command routing', () => {
    expect(
      buildPendingCommandStateValues({
        command: 'cycle',
        clientMutationId: 'cycle-1',
        thread: { lifecycle: { phase: 'active' } },
      }),
    ).toEqual({
      private: {
        pendingCommand: {
          command: 'cycle',
          clientMutationId: 'cycle-1',
        },
      },
      thread: { lifecycle: { phase: 'active' } },
    });
  });

  it('builds runCommand state update payloads without legacy message input', () => {
    expect(
      buildRunCommandStateUpdate({
        command: 'refresh',
        clientMutationId: 'refresh-1',
      }),
    ).toEqual({
      as_node: 'runCommand',
      values: {
        private: {
          pendingCommand: {
            command: 'refresh',
            clientMutationId: 'refresh-1',
          },
        },
      },
    });
  });

  it('exports the canonical command vocabulary', () => {
    expect(AGENT_COMMANDS).toEqual(['hire', 'fire', 'cycle', 'refresh']);
  });
});

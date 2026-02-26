import { describe, expect, it } from 'vitest';

import {
  AGENT_COMMANDS,
  TASK_STATES,
  extractCommandEnvelopeFromMessages,
  extractCommandFromMessages,
  isTaskActiveState,
  isTaskTerminalState,
} from './taskLifecycle';

describe('taskLifecycle', () => {
  it('recognizes terminal and active task states', () => {
    expect(isTaskTerminalState('completed')).toBe(true);
    expect(isTaskTerminalState('failed')).toBe(true);
    expect(isTaskTerminalState('canceled')).toBe(true);
    expect(isTaskTerminalState('not-a-task-state')).toBe(false);
    expect(isTaskTerminalState('rejected')).toBe(false);
    expect(isTaskTerminalState('unknown')).toBe(false);
    expect(isTaskTerminalState('working')).toBe(false);

    expect(isTaskActiveState('submitted')).toBe(true);
    expect(isTaskActiveState('input-required')).toBe(true);
    expect(isTaskActiveState('completed')).toBe(false);
  });

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

  it('exports canonical command and task-state vocabularies', () => {
    expect(AGENT_COMMANDS).toEqual(['hire', 'fire', 'cycle', 'sync']);
    expect(TASK_STATES).toEqual([
      'submitted',
      'working',
      'input-required',
      'completed',
      'canceled',
      'failed',
      'auth-required',
    ]);
  });
});

import { describe, expect, it } from 'vitest';

import {
  extractCommandFromMessages,
  isTaskActiveState,
  isTaskTerminalState,
} from './taskLifecycle';

describe('taskLifecycle', () => {
  it('recognizes terminal and active task states', () => {
    expect(isTaskTerminalState('completed')).toBe(true);
    expect(isTaskTerminalState('failed')).toBe(true);
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

  it('returns null for unsupported or malformed commands', () => {
    expect(extractCommandFromMessages([{ content: '{"command":"oops"}' }])).toBeNull();
    expect(extractCommandFromMessages([{ content: '{not-json' }])).toBeNull();
  });
});

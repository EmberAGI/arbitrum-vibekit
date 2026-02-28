import { describe, expect, it } from 'vitest';

import { createDefaultClmmThreadState, type ClmmState } from '../context.js';

import { runCommandNode } from './runCommand.js';

function createState(messageContent: string): ClmmState {
  return {
    messages: [{ role: 'user', content: messageContent }],
    copilotkit: { actions: [], context: [] },
    settings: {},
    private: {
      mode: undefined,
      pollIntervalMs: 30_000,
      streamLimit: -1,
      cronScheduled: false,
      bootstrapped: true,
    },
    thread: createDefaultClmmThreadState(),
  };
}

describe('runCommandNode', () => {
  it('records sync mutation acknowledgements in thread state envelope', () => {
    const state = createState(JSON.stringify({ command: 'sync', clientMutationId: 'cmid-1' }));

    const result = runCommandNode(state) as unknown as {
      thread?: { lastAppliedClientMutationId?: string };
      view?: { lastAppliedClientMutationId?: string };
    };

    expect(result.thread?.lastAppliedClientMutationId).toBe('cmid-1');
    expect(result.view).toBeUndefined();
  });
});

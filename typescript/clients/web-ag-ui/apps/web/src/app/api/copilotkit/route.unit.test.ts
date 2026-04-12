import { describe, expect, it } from 'vitest';

import { parseCopilotRouteMetadata } from './routeMetadata';

describe('parseCopilotRouteMetadata', () => {
  it('reads named command metadata from forwardedProps.command without inspecting chat messages', () => {
    expect(
      parseCopilotRouteMetadata({
        method: 'agent/run',
        params: {
          agentId: 'agent-clmm',
        },
        body: {
          threadId: 'thread-1',
          messages: [
            {
              role: 'user',
              content: '{"command":"sync","source":"legacy-message"}',
            },
          ],
          forwardedProps: {
            command: {
              name: 'sync',
              source: 'agent-list-poll',
            },
          },
        },
      }),
    ).toMatchObject({
      method: 'agent/run',
      agentId: 'agent-clmm',
      threadId: 'thread-1',
      command: 'sync',
      source: 'agent-list-poll',
      metadataMatched: true,
    });
  });

  it('reads update metadata from forwardedProps.command.update', () => {
    expect(
      parseCopilotRouteMetadata({
        method: 'agent/run',
        params: {
          agentId: 'agent-portfolio-manager',
        },
        body: {
          threadId: 'thread-1',
          forwardedProps: {
            command: {
              update: {
                clientMutationId: 'mutation-1',
                baseRevision: 'shared-rev-1',
                patch: [{ op: 'add', path: '/shared/settings', value: { amount: 250 } }],
              },
            },
          },
        },
      }),
    ).toMatchObject({
      method: 'agent/run',
      agentId: 'agent-portfolio-manager',
      threadId: 'thread-1',
      command: 'update',
      clientMutationId: 'mutation-1',
      metadataMatched: true,
    });
  });
});

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
              content: '{"command":"refresh","source":"legacy-message"}',
            },
          ],
          forwardedProps: {
            command: {
              name: 'refresh',
              source: 'agent-list-poll',
            },
          },
        },
      }),
    ).toMatchObject({
      method: 'agent/run',
      agentId: 'agent-clmm',
      threadId: 'thread-1',
      command: 'refresh',
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

  it('reports full serialized resume payload length while keeping the preview truncated', () => {
    const resume = {
      outcome: 'signed',
      signedDelegations: [
        {
          signature: '0x' + 'a'.repeat(320),
        },
      ],
    };

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
              resume,
            },
          },
        },
      }),
    ).toMatchObject({
      method: 'agent/run',
      agentId: 'agent-portfolio-manager',
      threadId: 'thread-1',
      command: 'resume',
      hasResumePayload: true,
      resumePayloadLength: JSON.stringify(resume).length,
      resumePayloadPreview: JSON.stringify(resume).slice(0, 240),
      metadataMatched: true,
    });
  });
});

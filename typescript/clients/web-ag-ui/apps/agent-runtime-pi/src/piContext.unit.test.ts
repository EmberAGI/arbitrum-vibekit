import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { describe, expect, it } from 'vitest';

import {
  buildPiRuntimeGatewayContextMessages,
  convertPiRuntimeGatewayMessagesToLlm,
} from './index.js';

describe('pi runtime gateway context messages', () => {
  it('builds Pi-native session messages for execution status, artifacts, and A2UI payloads', () => {
    expect(
      buildPiRuntimeGatewayContextMessages({
        now: () => 123,
        session: {
          thread: { id: 'thread-1' },
          execution: {
            id: 'exec-1',
            status: 'working',
            statusMessage: 'Waiting on tool output.',
          },
          artifacts: {
            current: { artifactId: 'artifact-current', data: { phase: 'current' } },
            activity: { artifactId: 'artifact-activity', data: { phase: 'activity' } },
          },
          a2ui: {
            kind: 'status-card',
            payload: { headline: 'Connected' },
          },
        },
      }),
    ).toEqual([
      {
        role: 'pi-runtime-note',
        threadId: 'thread-1',
        executionId: 'exec-1',
        text: 'Thread thread-1 execution exec-1 is working. Waiting on tool output.',
        timestamp: 123,
      },
      {
        role: 'pi-artifact',
        threadId: 'thread-1',
        executionId: 'exec-1',
        channel: 'current',
        artifactId: 'artifact-current',
        data: { phase: 'current' },
        timestamp: 123,
      },
      {
        role: 'pi-artifact',
        threadId: 'thread-1',
        executionId: 'exec-1',
        channel: 'activity',
        artifactId: 'artifact-activity',
        data: { phase: 'activity' },
        timestamp: 123,
      },
      {
        role: 'pi-a2ui',
        threadId: 'thread-1',
        executionId: 'exec-1',
        payload: {
          kind: 'status-card',
          payload: { headline: 'Connected' },
        },
        timestamp: 123,
      },
    ]);
  });

  it('converts runtime notes into user context while filtering UI-only session messages', () => {
    const converted = convertPiRuntimeGatewayMessagesToLlm([
      {
        role: 'user',
        content: 'Hello',
        timestamp: 1,
      },
      {
        role: 'pi-runtime-note',
        threadId: 'thread-1',
        executionId: 'exec-1',
        text: 'Execution is waiting for confirmation.',
        timestamp: 2,
      },
      {
        role: 'pi-artifact',
        threadId: 'thread-1',
        executionId: 'exec-1',
        channel: 'current',
        artifactId: 'artifact-1',
        data: { phase: 'setup' },
        timestamp: 3,
      },
      {
        role: 'pi-a2ui',
        threadId: 'thread-1',
        executionId: 'exec-1',
        payload: {
          kind: 'interrupt',
          payload: { type: 'operator-config-request' },
        },
        timestamp: 4,
      },
    ] satisfies AgentMessage[]);

    expect(converted).toEqual([
      {
        role: 'user',
        content: 'Hello',
        timestamp: 1,
      },
      {
        role: 'user',
        content: '<pi-runtime-gateway>Execution is waiting for confirmation.</pi-runtime-gateway>',
        timestamp: 2,
      },
    ]);
  });
});

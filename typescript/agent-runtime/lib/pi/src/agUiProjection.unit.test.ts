import { EventType } from '@ag-ui/core';
import type { AgentEvent } from '@mariozechner/pi-agent-core';
import { describe, expect, it } from 'vitest';

import {
  buildPiA2UiActivityEvent,
  buildPiThreadStateSnapshot,
  mapPiAgentEventsToAgUiEvents,
} from './index.js';

describe('pi AG-UI projection', () => {
  it('builds a thread snapshot that preserves canonical ids, task projection, artifacts, and activity-renderable A2UI payloads', () => {
    expect(
      buildPiThreadStateSnapshot({
        thread: { id: 'thread-1' },
        execution: {
          id: 'exec-1',
          status: 'interrupted',
          statusMessage: 'Waiting for wallet confirmation.',
        },
        messages: [
          {
            id: 'message-1',
            role: 'user',
            content: 'Please continue.',
          },
        ],
        automation: { id: 'auto-1', runId: 'auto-run-1' },
        artifacts: {
          current: { artifactId: 'current-artifact', data: { phase: 'setup' } },
          activity: { artifactId: 'activity-artifact', data: { entries: 3 } },
        },
        a2ui: {
          kind: 'interrupt',
          payload: { type: 'operator-config-request', artifactId: 'current-artifact' },
        },
        threadPatch: {
          profile: { principalId: 'wallet:0xabc' },
        },
      }),
    ).toEqual({
      thread: {
        id: 'thread-1',
        task: {
          id: 'exec-1',
          taskStatus: {
            state: 'input-required',
            message: {
              content: 'Waiting for wallet confirmation.',
            },
          },
        },
        projection: {
          source: 'pi-runtime-gateway',
          canonicalIds: {
            piThreadId: 'thread-1',
            piExecutionId: 'exec-1',
            piAutomationId: 'auto-1',
            automationRunId: 'auto-run-1',
          },
        },
        activity: {
          telemetry: [],
          events: [
            {
              type: 'artifact',
              append: true,
              artifact: { artifactId: 'activity-artifact', data: { entries: 3 } },
            },
            {
              type: 'dispatch-response',
              parts: [
                {
                  kind: 'a2ui',
                  data: {
                    threadId: 'thread-1',
                    executionId: 'exec-1',
                    payload: {
                      kind: 'interrupt',
                      payload: { type: 'operator-config-request', artifactId: 'current-artifact' },
                    },
                  },
                },
              ],
            },
          ],
        },
        messages: [
          {
            id: 'message-1',
            role: 'user',
            content: 'Please continue.',
          },
        ],
        artifacts: {
          current: { artifactId: 'current-artifact', data: { phase: 'setup' } },
          activity: { artifactId: 'activity-artifact', data: { entries: 3 } },
        },
        profile: { principalId: 'wallet:0xabc' },
      },
    });
  });

  it('maps pi-agent-core stream events into AG-UI run, text, tool, and finish events', () => {
    const assistantMessage = {
      role: 'assistant',
      content: [],
      api: 'responses',
      provider: 'openai',
      model: 'gpt-5.4-mini',
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'toolUse',
      timestamp: 1,
    } as AgentEvent extends { message: infer TMessage } ? TMessage : never;

    const events: AgentEvent[] = [
      { type: 'agent_start' },
      { type: 'turn_start' },
      { type: 'message_start', message: assistantMessage },
      {
        type: 'message_update',
        message: assistantMessage,
        assistantMessageEvent: {
          type: 'text_delta',
          contentIndex: 0,
          delta: 'Hello from Pi.',
          partial: assistantMessage,
        },
      },
      {
        type: 'message_update',
        message: assistantMessage,
        assistantMessageEvent: {
          type: 'toolcall_end',
          contentIndex: 1,
          toolCall: {
            type: 'toolCall',
            id: 'tool-1',
            name: 'sync',
            arguments: { cycle: 1 },
          },
          partial: assistantMessage,
        },
      },
      {
        type: 'tool_execution_end',
        toolCallId: 'tool-1',
        toolName: 'sync',
        result: { ok: true },
        isError: false,
      },
      { type: 'message_end', message: assistantMessage },
      { type: 'turn_end', message: assistantMessage, toolResults: [] },
      { type: 'agent_end', messages: [assistantMessage] },
    ];

    expect(
      mapPiAgentEventsToAgUiEvents({
        executionId: 'exec-1',
        events,
      }),
    ).toEqual([
      { type: EventType.STEP_STARTED, stepName: 'pi-agent' },
      { type: EventType.STEP_STARTED, stepName: 'turn' },
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'pi:exec-1:assistant:1',
        role: 'assistant',
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'pi:exec-1:assistant:1',
        delta: 'Hello from Pi.',
      },
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: 'tool-1',
        toolCallName: 'sync',
        parentMessageId: 'pi:exec-1:assistant:1',
      },
      {
        type: EventType.TOOL_CALL_END,
        toolCallId: 'tool-1',
      },
      {
        type: EventType.TOOL_CALL_RESULT,
        messageId: 'pi:exec-1:tool-result:tool-1',
        toolCallId: 'tool-1',
        content: '{"ok":true}',
        role: 'tool',
      },
      {
        type: EventType.TEXT_MESSAGE_END,
        messageId: 'pi:exec-1:assistant:1',
      },
      { type: EventType.STEP_FINISHED, stepName: 'turn' },
      { type: EventType.STEP_FINISHED, stepName: 'pi-agent' },
    ]);
  });

  it('maps pi thinking stream events into AG-UI reasoning events', () => {
    const assistantMessage = {
      role: 'assistant',
      content: [],
      api: 'responses',
      provider: 'openai',
      model: 'gpt-5.4-mini',
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'stop',
      timestamp: 1,
    } as AgentEvent extends { message: infer TMessage } ? TMessage : never;

    const events: AgentEvent[] = [
      { type: 'message_start', message: assistantMessage },
      {
        type: 'message_update',
        message: assistantMessage,
        assistantMessageEvent: {
          type: 'thinking_start',
          contentIndex: 0,
          partial: assistantMessage,
        },
      },
      {
        type: 'message_update',
        message: assistantMessage,
        assistantMessageEvent: {
          type: 'thinking_delta',
          contentIndex: 0,
          delta: 'Analyzing the request.',
          partial: assistantMessage,
        },
      },
      {
        type: 'message_update',
        message: assistantMessage,
        assistantMessageEvent: {
          type: 'thinking_end',
          contentIndex: 0,
          content: 'Analyzing the request.',
          partial: assistantMessage,
        },
      },
      { type: 'message_end', message: assistantMessage },
    ];

    expect(
      mapPiAgentEventsToAgUiEvents({
        executionId: 'exec-reasoning',
        events,
      }),
    ).toEqual([
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'pi:exec-reasoning:assistant:1',
        role: 'assistant',
      },
      {
        type: EventType.REASONING_START,
        messageId: 'pi:exec-reasoning:reasoning:pi:exec-reasoning:assistant:1:0',
      },
      {
        type: EventType.REASONING_MESSAGE_START,
        messageId: 'pi:exec-reasoning:reasoning:pi:exec-reasoning:assistant:1:0',
        role: 'reasoning',
      },
      {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: 'pi:exec-reasoning:reasoning:pi:exec-reasoning:assistant:1:0',
        delta: 'Analyzing the request.',
      },
      {
        type: EventType.REASONING_MESSAGE_END,
        messageId: 'pi:exec-reasoning:reasoning:pi:exec-reasoning:assistant:1:0',
      },
      {
        type: EventType.REASONING_END,
        messageId: 'pi:exec-reasoning:reasoning:pi:exec-reasoning:assistant:1:0',
      },
      {
        type: EventType.TEXT_MESSAGE_END,
        messageId: 'pi:exec-reasoning:assistant:1',
      },
    ]);
  });

  it('projects A2UI payloads into activity dispatch events', () => {
    expect(
      buildPiA2UiActivityEvent({
        threadId: 'thread-1',
        executionId: 'exec-1',
        payload: { kind: 'setup-form', fields: ['walletAddress'] },
      }),
    ).toEqual({
      type: 'dispatch-response',
      parts: [
        {
          kind: 'a2ui',
          data: {
            threadId: 'thread-1',
            executionId: 'exec-1',
            payload: { kind: 'setup-form', fields: ['walletAddress'] },
          },
        },
      ],
    });
  });
});

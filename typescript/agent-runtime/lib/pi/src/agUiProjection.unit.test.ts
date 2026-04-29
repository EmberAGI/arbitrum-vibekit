import {
  defaultApplyEvents,
  type AbstractAgent,
  type RunAgentInput,
} from '@ag-ui/client';
import { EventType } from '@ag-ui/core';
import type { BaseEvent } from '@ag-ui/core';
import type { AgentEvent } from '@mariozechner/pi-agent-core';
import { lastValueFrom, of, toArray } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import {
  buildPiA2UiActivityEvent,
  buildPiRuntimeGatewayStateRebaselineEvent,
  buildPiRuntimeGatewayStateDeltaEvent,
  buildPiThreadStateSnapshot,
  mapPiAgentEventsToAgUiEvents,
} from './index.js';

const applyEventsWithAgUiClient = async (
  initialState: unknown,
  events: BaseEvent[],
): Promise<unknown[]> => {
  const input = {
    threadId: 'thread-1',
    runId: 'run-1',
    messages: [],
    tools: [],
    context: [],
    state: initialState,
  } satisfies RunAgentInput;
  const agent = {
    messages: [],
    state: initialState,
  } as unknown as AbstractAgent;

  const mutations = await lastValueFrom(
    defaultApplyEvents(input, of(...events), agent, []).pipe(toArray()),
  );
  return mutations as unknown[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readPath = (value: unknown, path: string[]): unknown =>
  path.reduce<unknown>((current, key) => (isRecord(current) ? current[key] : undefined), value);

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
        projectedState: {
          managedMandate: {
            status: 'active',
          },
        },
        threadPatch: {
          profile: { principalId: 'wallet:0xabc' },
        },
      }),
    ).toEqual({
      shared: {},
      projected: {
        managedMandate: {
          status: 'active',
        },
      },
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
        artifacts: {
          current: { artifactId: 'current-artifact', data: { phase: 'setup' } },
          activity: { artifactId: 'activity-artifact', data: { entries: 3 } },
        },
        profile: { principalId: 'wallet:0xabc' },
      },
    });
  });

  it('builds a JSON Patch state delta from the previous public thread snapshot to the next one', () => {
    expect(
      buildPiRuntimeGatewayStateDeltaEvent({
        previousSession: {
          thread: { id: 'thread-1' },
          execution: {
            id: 'exec-1',
            status: 'working',
          },
          projectedState: {
            managedMandate: {
              summary: {
                riskLevel: 'medium',
              },
            },
          },
        },
        session: {
          thread: { id: 'thread-1' },
          execution: {
            id: 'exec-1',
            status: 'completed',
          },
          projectedState: {
            managedMandate: {
              summary: {
                riskLevel: 'medium',
                status: 'active',
              },
            },
          },
        },
      }),
    ).toEqual({
      type: EventType.STATE_DELTA,
      delta: expect.arrayContaining([
        {
          op: 'replace',
          path: '/thread/task/taskStatus/state',
          value: 'completed',
        },
        {
          op: 'add',
          path: '/projected/managedMandate/summary/status',
          value: 'active',
        },
      ]),
    });
  });

  it('builds a snapshot rebaseline for run-completion state when an intervening refresh can stale a delta', async () => {
    const previousSession = {
      thread: { id: 'thread-1' },
      execution: {
        id: 'exec-1',
        status: 'completed' as const,
        statusMessage: 'Portfolio state refreshed.',
      },
      artifacts: {
        current: {
          artifactId: 'refresh-1',
          data: {
            type: 'shared-ember-portfolio-state',
            revision: 1,
          },
        },
        activity: {
          artifactId: 'refresh-1',
          data: {
            type: 'shared-ember-portfolio-state',
            revision: 1,
          },
        },
      },
      threadPatch: {
        lifecycle: {
          phase: 'prehire',
        },
      },
    };
    const interveningClientSession = {
      ...previousSession,
      artifacts: {
        current: {
          artifactId: 'refresh-2',
          data: {
            type: 'shared-ember-portfolio-state',
            revision: 2,
          },
        },
        activity: {
          artifactId: 'refresh-2',
          data: {
            type: 'shared-ember-portfolio-state',
            revision: 2,
          },
        },
      },
    };
    const runCompletionSession = {
      thread: { id: 'thread-1' },
      execution: {
        id: 'exec-1',
        status: 'interrupted' as const,
        statusMessage: 'Connect the wallet you want the portfolio manager to onboard.',
      },
      artifacts: {
        current: {
          artifactId: 'interrupt-1',
          data: {
            type: 'interrupt-status',
            interruptType: 'portfolio-manager-setup-request',
            status: 'pending',
            mirroredToActivity: false,
            message: 'Connect the wallet you want the portfolio manager to onboard.',
          },
        },
        activity: {
          artifactId: 'interrupt-1',
          data: {
            type: 'interrupt-status',
            interruptType: 'portfolio-manager-setup-request',
            status: 'pending',
            mirroredToActivity: false,
            message: 'Connect the wallet you want the portfolio manager to onboard.',
          },
        },
      },
      threadPatch: {
        lifecycle: {
          phase: 'onboarding',
        },
      },
    };

    const staleClientState = buildPiThreadStateSnapshot(interveningClientSession);
    const staleDelta = buildPiRuntimeGatewayStateDeltaEvent({
      previousSession,
      session: runCompletionSession,
    });
    if (!staleDelta) {
      throw new Error('Expected previous run-completion delta to be non-empty');
    }

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await expect(applyEventsWithAgUiClient(staleClientState, [staleDelta])).resolves.toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to apply state patch:'),
      );
    } finally {
      warnSpy.mockRestore();
    }

    const rebaseline = buildPiRuntimeGatewayStateRebaselineEvent({
      previousSession,
      session: runCompletionSession,
    });
    if (!rebaseline) {
      throw new Error('Expected changed run-completion state to produce a rebaseline');
    }

    expect(rebaseline.type).toBe(EventType.STATE_SNAPSHOT);
    const appliedMutations = await applyEventsWithAgUiClient(staleClientState, [rebaseline]);
    expect(appliedMutations).toHaveLength(1);
    expect(readPath(appliedMutations[0], ['state', 'thread', 'lifecycle', 'phase'])).toBe(
      'onboarding',
    );
    expect(
      readPath(appliedMutations[0], ['state', 'thread', 'artifacts', 'current', 'artifactId']),
    ).toBe('interrupt-1');
    expect(readPath(appliedMutations[0], ['state', 'thread', 'task', 'taskStatus', 'state'])).toBe(
      'input-required',
    );
  });

  it('does not surface hidden interrupt checkpoint artifacts into thread activity fallbacks', () => {
    expect(
      buildPiThreadStateSnapshot({
        thread: { id: 'thread-hidden' },
        execution: {
          id: 'exec-hidden',
          status: 'interrupted',
          statusMessage: 'Connect your wallet.',
        },
        artifacts: {
          current: {
            artifactId: 'current-artifact',
            data: {
              type: 'lifecycle-status',
              phase: 'onboarding',
            },
          },
          activity: {
            artifactId: 'hidden-interrupt-artifact',
            data: {
              type: 'interrupt-status',
              interruptType: 'portfolio-manager-setup-request',
              status: 'pending',
              mirroredToActivity: false,
              message: 'Connect your wallet.',
            },
          },
        },
      }),
    ).toEqual({
      shared: {},
      projected: {},
      thread: {
        id: 'thread-hidden',
        task: {
          id: 'exec-hidden',
          taskStatus: {
            state: 'input-required',
            message: {
              content: 'Connect your wallet.',
            },
          },
        },
        projection: {
          source: 'pi-runtime-gateway',
          canonicalIds: {
            piThreadId: 'thread-hidden',
            piExecutionId: 'exec-hidden',
          },
        },
        artifacts: {
          current: {
            artifactId: 'current-artifact',
            data: {
              type: 'lifecycle-status',
              phase: 'onboarding',
            },
          },
          activity: {
            artifactId: 'hidden-interrupt-artifact',
            data: {
              type: 'interrupt-status',
              interruptType: 'portfolio-manager-setup-request',
              status: 'pending',
              mirroredToActivity: false,
              message: 'Connect your wallet.',
            },
          },
        },
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

  it('backfills final assistant text from message_end when no text delta was streamed', () => {
    const startedAssistantMessage = {
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
      timestamp: 2,
    } as AgentEvent extends { message: infer TMessage } ? TMessage : never;

    const completedAssistantMessage = {
      ...startedAssistantMessage,
      content: [{ type: 'text', text: 'Final assistant reply.' }],
    } as AgentEvent extends { message: infer TMessage } ? TMessage : never;

    expect(
      mapPiAgentEventsToAgUiEvents({
        executionId: 'exec-2',
        events: [
          { type: 'message_start', message: startedAssistantMessage },
          { type: 'message_end', message: completedAssistantMessage },
        ],
      }),
    ).toEqual([
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'pi:exec-2:assistant:2',
        role: 'assistant',
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'pi:exec-2:assistant:2',
        delta: 'Final assistant reply.',
      },
      {
        type: EventType.TEXT_MESSAGE_END,
        messageId: 'pi:exec-2:assistant:2',
      },
    ]);
  });

  it('surfaces assistant error text from message_end when provider output failed before any text delta', () => {
    const failedAssistantMessage = {
      role: 'assistant',
      content: [],
      api: 'responses',
      provider: 'openrouter',
      model: 'openai/gpt-5.4',
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'error',
      errorMessage: 'Key limit exceeded (monthly limit).',
      timestamp: 4,
    } as AgentEvent extends { message: infer TMessage } ? TMessage : never;

    expect(
      mapPiAgentEventsToAgUiEvents({
        executionId: 'exec-4',
        events: [
          { type: 'message_start', message: failedAssistantMessage },
          { type: 'message_end', message: failedAssistantMessage },
        ],
      }),
    ).toEqual([
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'pi:exec-4:assistant:4',
        role: 'assistant',
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'pi:exec-4:assistant:4',
        delta: 'Key limit exceeded (monthly limit).',
      },
      {
        type: EventType.TEXT_MESSAGE_END,
        messageId: 'pi:exec-4:assistant:4',
      },
    ]);
  });

  it('backfills final user text from message_end when no text delta was streamed', () => {
    const startedUserMessage = {
      role: 'user',
      content: '',
      timestamp: 3,
    } as AgentEvent extends { message: infer TMessage } ? TMessage : never;

    const completedUserMessage = {
      ...startedUserMessage,
      content: 'Refresh your runtime state and tell me what you see.',
    } as AgentEvent extends { message: infer TMessage } ? TMessage : never;

    expect(
      mapPiAgentEventsToAgUiEvents({
        executionId: 'exec-3',
        events: [
          { type: 'message_start', message: startedUserMessage },
          { type: 'message_end', message: completedUserMessage },
        ],
      }),
    ).toEqual([
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'pi:exec-3:user:3',
        role: 'user',
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'pi:exec-3:user:3',
        delta: 'Refresh your runtime state and tell me what you see.',
      },
      {
        type: EventType.TEXT_MESSAGE_END,
        messageId: 'pi:exec-3:user:3',
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

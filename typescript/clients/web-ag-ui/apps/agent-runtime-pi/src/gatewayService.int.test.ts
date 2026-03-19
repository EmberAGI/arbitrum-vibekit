import { EventType } from '@ag-ui/core';
import type { AgentEvent } from '@mariozechner/pi-agent-core';
import { describe, expect, it } from 'vitest';

import { createPiRuntimeGatewayRuntime, createPiRuntimeGatewayService } from './index.js';

type Listener = (event: AgentEvent) => void;

class ScriptedPiAgent {
  private readonly listeners = new Set<Listener>();
  private readonly runEvents: AgentEvent[];

  public readonly state = {
    messages: [],
  };

  public abortCalled = false;
  public promptCalls: unknown[] = [];
  public continueCalls = 0;

  constructor(runEvents: AgentEvent[]) {
    this.runEvents = runEvents;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async prompt(messages: unknown): Promise<void> {
    this.promptCalls.push(messages);
    this.emitAll();
  }

  async continue(): Promise<void> {
    this.continueCalls += 1;
    this.emitAll();
  }

  abort(): void {
    this.abortCalled = true;
  }

  private emitAll(): void {
    for (const event of this.runEvents) {
      for (const listener of this.listeners) {
        listener(event);
      }
    }
  }
}

describe('pi gateway service integration', () => {
  it('supports AG-UI connect/run/stop semantics and keeps A2UI on the adapter boundary', async () => {
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

    const agent = new ScriptedPiAgent([
      { type: 'agent_start' },
      { type: 'turn_start' },
      { type: 'message_start', message: assistantMessage },
      {
        type: 'message_update',
        message: assistantMessage,
        assistantMessageEvent: {
          type: 'text_delta',
          contentIndex: 0,
          delta: 'Pi is connected.',
          partial: assistantMessage,
        },
      },
      { type: 'message_end', message: assistantMessage },
      { type: 'turn_end', message: assistantMessage, toolResults: [] },
      { type: 'agent_end', messages: [assistantMessage] },
    ]);

    const service = createPiRuntimeGatewayService({
      runtime: createPiRuntimeGatewayRuntime({
        agent,
        getSession: () => ({
          thread: { id: 'thread-1' },
          execution: { id: 'exec-1', status: 'working', statusMessage: 'Pi is connected.' },
          artifacts: {
            current: { artifactId: 'current-artifact', data: { phase: 'connected' } },
          },
          a2ui: {
            kind: 'status-card',
            payload: { headline: 'Connected' },
          },
        }),
      }),
      controlPlane: {
        inspectHealth: async () => ({ status: 'ok' as const }),
        listExecutions: async () => ['exec-1'],
      },
    });

    await expect(service.connect({ threadId: 'thread-1' })).resolves.toEqual([
      {
        type: EventType.STATE_SNAPSHOT,
        snapshot: {
          thread: {
            id: 'thread-1',
            task: {
              id: 'exec-1',
              taskStatus: {
                state: 'working',
                message: 'Pi is connected.',
              },
            },
            projection: {
              source: 'pi-runtime-gateway',
              canonicalIds: {
                piThreadId: 'thread-1',
                piExecutionId: 'exec-1',
              },
            },
            activity: {
              telemetry: [],
              events: [
                {
                  type: 'dispatch-response',
                  parts: [
                    {
                      kind: 'a2ui',
                      data: {
                        threadId: 'thread-1',
                        executionId: 'exec-1',
                        payload: {
                          kind: 'status-card',
                          payload: { headline: 'Connected' },
                        },
                      },
                    },
                  ],
                },
              ],
            },
            artifacts: {
              current: { artifactId: 'current-artifact', data: { phase: 'connected' } },
            },
          },
        },
      },
    ]);

    const runEvents = await service.run({
      threadId: 'thread-1',
      runId: 'run-1',
      messages: [{ id: 'msg-1', role: 'user', content: 'Connect now' }],
    });

    expect(agent.promptCalls).toHaveLength(1);
    expect(runEvents).toContainEqual({
      type: EventType.RUN_STARTED,
      threadId: 'thread-1',
      runId: 'run-1',
    });
    expect(runEvents).toContainEqual({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'pi:exec-1:assistant:1',
      delta: 'Pi is connected.',
    });
    expect(runEvents).toContainEqual({
      type: EventType.STATE_SNAPSHOT,
      snapshot: {
        thread: {
          id: 'thread-1',
          task: {
            id: 'exec-1',
            taskStatus: {
              state: 'working',
              message: 'Pi is connected.',
            },
          },
          projection: {
            source: 'pi-runtime-gateway',
            canonicalIds: {
              piThreadId: 'thread-1',
              piExecutionId: 'exec-1',
            },
          },
          activity: {
            telemetry: [],
            events: [
              {
                type: 'dispatch-response',
                parts: [
                  {
                    kind: 'a2ui',
                    data: {
                      threadId: 'thread-1',
                      executionId: 'exec-1',
                      payload: {
                        kind: 'status-card',
                        payload: { headline: 'Connected' },
                      },
                    },
                  },
                ],
              },
            ],
          },
          artifacts: {
            current: { artifactId: 'current-artifact', data: { phase: 'connected' } },
          },
        },
      },
    });
    expect(runEvents).toContainEqual({
      type: EventType.RUN_FINISHED,
      threadId: 'thread-1',
      runId: 'run-1',
      result: {
        executionId: 'exec-1',
        status: 'working',
      },
    });

    await expect(service.stop({ threadId: 'thread-1', runId: 'run-1' })).resolves.toEqual([
      {
        type: EventType.RUN_FINISHED,
        threadId: 'thread-1',
        runId: 'run-1',
        result: {
          status: 'aborted',
        },
      },
    ]);
    expect(agent.abortCalled).toBe(true);
    await expect(service.control.inspectHealth()).resolves.toEqual({ status: 'ok' });
    await expect(service.control.listExecutions()).resolves.toEqual(['exec-1']);
  });
});

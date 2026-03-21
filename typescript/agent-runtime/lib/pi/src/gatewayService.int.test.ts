import { EventType } from '@ag-ui/core';
import type { AgentEvent } from '@mariozechner/pi-agent-core';
import { describe, expect, it } from 'vitest';

import type { PiRuntimeGatewayAgent } from './index.js';
import { createPiRuntimeGatewayRuntime, createPiRuntimeGatewayService } from './index.js';

type Listener = (event: AgentEvent) => void;

class ScriptedPiAgent {
  private readonly listeners = new Set<Listener>();
  private readonly runEvents: AgentEvent[];

  public readonly state = {
    messages: [],
    isStreaming: false,
  };

  public abortCalled = false;
  public promptCalls: unknown[] = [];
  public continueCalls = 0;
  public steerCalls: unknown[] = [];
  public followUpCalls: unknown[] = [];
  public sessionId: string | undefined;

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

  steer(message: unknown): void {
    this.steerCalls.push(message);
  }

  followUp(message: unknown): void {
    this.followUpCalls.push(message);
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
        listThreads: async () => ['thread-1'],
        listExecutions: async () => ['exec-1'],
        listAutomations: async () => ['automation-1'],
        listAutomationRuns: async () => ['run-1'],
        inspectScheduler: async () => ({ dueAutomationIds: ['automation-1'], leases: [] }),
        inspectOutbox: async () => ({ dueOutboxIds: ['outbox-1'], intents: [] }),
        inspectMaintenance: async () => ({
          recovery: { automationIdsToResume: ['automation-1'] },
          archival: { executionIds: [] },
        }),
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
    expect(agent.sessionId).toBe('thread-1');

    const runEvents = await service.run({
      threadId: 'thread-1',
      runId: 'run-1',
      messages: [{ id: 'msg-1', role: 'user', content: 'Connect now' }],
    });

    expect(agent.sessionId).toBe('thread-1');
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
    await expect(service.control.listThreads()).resolves.toEqual(['thread-1']);
    await expect(service.control.listExecutions()).resolves.toEqual(['exec-1']);
    await expect(service.control.listAutomations()).resolves.toEqual(['automation-1']);
    await expect(service.control.listAutomationRuns()).resolves.toEqual(['run-1']);
    await expect(service.control.inspectScheduler()).resolves.toEqual({
      dueAutomationIds: ['automation-1'],
      leases: [],
    });
    await expect(service.control.inspectOutbox()).resolves.toEqual({
      dueOutboxIds: ['outbox-1'],
      intents: [],
    });
    await expect(service.control.inspectMaintenance()).resolves.toEqual({
      recovery: { automationIdsToResume: ['automation-1'] },
      archival: { executionIds: [] },
    });
  });

  it('queues active-run user input through Pi steering instead of re-prompting the agent', async () => {
    const agent = new ScriptedPiAgent([]);
    agent.state.isStreaming = true;

    const runtime = createPiRuntimeGatewayRuntime({
      agent,
      now: () => 123,
      getSession: () => ({
        thread: { id: 'thread-2' },
        execution: { id: 'exec-2', status: 'working', statusMessage: 'Awaiting steering' },
      }),
    });

    const events = await runtime.run({
      threadId: 'thread-2',
      runId: 'run-2',
      messages: [{ id: 'msg-2', role: 'user', content: 'Adjust course' }],
    });

    expect(agent.sessionId).toBe('thread-2');
    expect(agent.promptCalls).toEqual([]);
    expect(agent.continueCalls).toBe(0);
    expect(agent.steerCalls).toEqual([
      {
        role: 'user',
        content: 'Adjust course',
        timestamp: 123,
      },
    ]);
    expect(events).toEqual([
      {
        type: EventType.RUN_STARTED,
        threadId: 'thread-2',
        runId: 'run-2',
      },
      {
        type: EventType.STATE_SNAPSHOT,
        snapshot: {
          thread: {
            id: 'thread-2',
            task: {
              id: 'exec-2',
              taskStatus: {
                state: 'working',
                message: 'Awaiting steering',
              },
            },
            projection: {
              source: 'pi-runtime-gateway',
              canonicalIds: {
                piThreadId: 'thread-2',
                piExecutionId: 'exec-2',
              },
            },
          },
        },
      },
      {
        type: EventType.RUN_FINISHED,
        threadId: 'thread-2',
        runId: 'run-2',
        result: {
          executionId: 'exec-2',
          status: 'working',
        },
      },
    ]);
  });

  it('queues active-run user input through Pi follow-up when steering is unavailable', async () => {
    const followUpCalls: unknown[] = [];
    const agent: PiRuntimeGatewayAgent & { followUp: (message: unknown) => void } = {
      state: {
        messages: [],
        isStreaming: true,
      },
      sessionId: undefined,
      subscribe: () => () => undefined,
      prompt: async () => {
        throw new Error('prompt should not run while follow-up queueing is available');
      },
      continue: async () => undefined,
      abort: () => undefined,
      followUp: (message: unknown) => {
        followUpCalls.push(message);
      },
    };

    const runtime = createPiRuntimeGatewayRuntime({
      agent,
      now: () => 321,
      getSession: () => ({
        thread: { id: 'thread-3' },
        execution: { id: 'exec-3', status: 'working', statusMessage: 'Awaiting follow-up' },
      }),
    });

    const events = await runtime.run({
      threadId: 'thread-3',
      runId: 'run-3',
      messages: [{ id: 'msg-3', role: 'user', content: 'Queue this next' }],
    });

    expect(agent.sessionId).toBe('thread-3');
    expect(followUpCalls).toEqual([
      {
        role: 'user',
        content: 'Queue this next',
        timestamp: 321,
      },
    ]);
    expect(events).toEqual([
      {
        type: EventType.RUN_STARTED,
        threadId: 'thread-3',
        runId: 'run-3',
      },
      {
        type: EventType.STATE_SNAPSHOT,
        snapshot: {
          thread: {
            id: 'thread-3',
            task: {
              id: 'exec-3',
              taskStatus: {
                state: 'working',
                message: 'Awaiting follow-up',
              },
            },
            projection: {
              source: 'pi-runtime-gateway',
              canonicalIds: {
                piThreadId: 'thread-3',
                piExecutionId: 'exec-3',
              },
            },
          },
        },
      },
      {
        type: EventType.RUN_FINISHED,
        threadId: 'thread-3',
        runId: 'run-3',
        result: {
          executionId: 'exec-3',
          status: 'working',
        },
      },
    ]);
  });
});

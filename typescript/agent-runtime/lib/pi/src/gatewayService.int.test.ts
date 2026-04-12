import { EventType } from '@ag-ui/core';
import type { AgentEvent } from '@mariozechner/pi-agent-core';
import { describe, expect, it } from 'vitest';

import type { PiRuntimeGatewayAgent } from './index.js';
import { createPiRuntimeGatewayRuntime, createPiRuntimeGatewayService } from './index.js';

type Listener = (event: AgentEvent) => void;

class ScriptedPiAgent {
  protected readonly listeners = new Set<Listener>();
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

  protected emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private emitAll(): void {
    for (const event of this.runEvents) {
      this.emit(event);
    }
  }
}

async function collectEventSource<T>(source: readonly T[] | AsyncIterable<T>): Promise<T[]> {
  if (Array.isArray(source)) {
    return [...source];
  }

  const events: T[] = [];
  for await (const event of source) {
    events.push(event);
  }
  return events;
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
          messages: [
            {
              id: 'user-msg-1',
              role: 'user',
              content: 'Connect now',
            },
            {
              id: 'assistant-msg-1',
              role: 'assistant',
              content: 'Pi is connected.',
            },
          ],
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
        type: EventType.RUN_STARTED,
        threadId: 'thread-1',
        runId: 'connect:thread-1',
      },
      {
        type: EventType.STATE_SNAPSHOT,
        snapshot: {
          shared: {},
          projected: {},
          thread: {
            id: 'thread-1',
            task: {
              id: 'exec-1',
              taskStatus: {
                state: 'working',
                message: {
                  content: 'Pi is connected.',
                },
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
            messages: [
              {
                id: 'user-msg-1',
                role: 'user',
                content: 'Connect now',
              },
              {
                id: 'assistant-msg-1',
                role: 'assistant',
                content: 'Pi is connected.',
              },
            ],
            artifacts: {
              current: { artifactId: 'current-artifact', data: { phase: 'connected' } },
            },
          },
        },
      },
      {
        type: EventType.CUSTOM,
        name: 'shared-state.control',
        value: {
          kind: 'hydration',
          reason: 'bootstrap',
          revision: 'shared-rev-0',
        },
      },
      {
        type: EventType.MESSAGES_SNAPSHOT,
        messages: [
          {
            id: 'user-msg-1',
            role: 'user',
            content: 'Connect now',
          },
          {
            id: 'assistant-msg-1',
            role: 'assistant',
            content: 'Pi is connected.',
          },
        ],
      },
      {
        type: EventType.RUN_FINISHED,
        threadId: 'thread-1',
        runId: 'connect:thread-1',
        result: {
          executionId: 'exec-1',
          status: 'working',
        },
      },
    ]);
    expect(agent.sessionId).toBe('thread-1');

    const runEvents = await collectEventSource(await service.run({
      threadId: 'thread-1',
      runId: 'run-1',
      messages: [{ id: 'msg-1', role: 'user', content: 'Connect now' }],
    }));

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
    expect(
      runEvents.filter(
        (event) => event.type === EventType.STATE_SNAPSHOT || event.type === EventType.STATE_DELTA,
      ),
    ).toEqual([]);
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

  it('persists the current run transcript from request messages and projected events instead of stale agent state', async () => {
    const staleAssistantMessage = {
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello again.' }],
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
    const freshAssistantMessage = {
      ...staleAssistantMessage,
      content: [],
      timestamp: 2,
    };
    const agent = new ScriptedPiAgent([
      { type: 'agent_start' },
      { type: 'turn_start' },
      { type: 'message_start', message: freshAssistantMessage },
      {
        type: 'message_update',
        message: freshAssistantMessage,
        assistantMessageEvent: {
          type: 'text_delta',
          contentIndex: 0,
          delta: 'Scheduled sync every minute.',
          partial: freshAssistantMessage,
        },
      },
      { type: 'message_end', message: freshAssistantMessage },
      { type: 'turn_end', message: freshAssistantMessage, toolResults: [] },
      { type: 'agent_end', messages: [freshAssistantMessage] },
    ]);
    agent.state.messages = [
      {
        role: 'user',
        content: 'hi',
        timestamp: 0,
      },
      staleAssistantMessage,
    ];

    let session = {
      thread: { id: 'thread-1' },
      execution: { id: 'exec-1', status: 'working' as const },
      messages: [
        {
          id: 'user-hi',
          role: 'user' as const,
          content: 'hi',
        },
      ],
    };

    const runtime = createPiRuntimeGatewayRuntime({
      agent,
      getSession: () => session,
      updateSession: (_threadId, update) => {
        session = update(session);
        return session;
      },
    });

    await collectEventSource(
      await runtime.run({
        threadId: 'thread-1',
        runId: 'run-2',
        messages: [
          {
            id: 'user-schedule',
            role: 'user',
            content: 'Schedule a sync every minute.',
          },
        ],
      }),
    );

    expect(session.messages).toEqual([
      {
        id: 'user-hi',
        role: 'user',
        content: 'hi',
      },
      {
        id: 'user-schedule',
        role: 'user',
        content: 'Schedule a sync every minute.',
      },
      {
        id: 'pi:exec-1:assistant:2',
        role: 'assistant',
        content: 'Scheduled sync every minute.',
      },
    ]);
  });

  it('preserves assistant tool calls when AG-UI history is converted back into agent messages', async () => {
    const agent = new ScriptedPiAgent([
      { type: 'agent_start' },
      { type: 'turn_start' },
      { type: 'agent_end', messages: [] },
    ]);

    const runtime = createPiRuntimeGatewayRuntime({
      agent,
      now: () => 123,
      getSession: () => ({
        thread: { id: 'thread-tool-history' },
        execution: { id: 'exec-tool-history', status: 'working' },
        messages: [],
      }),
      updateSession: (_threadId, update) =>
        update({
          thread: { id: 'thread-tool-history' },
          execution: { id: 'exec-tool-history', status: 'working' },
          messages: [],
        }),
    });

    await collectEventSource(
      await runtime.run({
        threadId: 'thread-tool-history',
        runId: 'run-tool-history',
        messages: [
          {
            id: 'user-msg',
            role: 'user',
            content: 'what is my account status?',
          },
          {
            id: 'assistant-msg',
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'tool-call-1',
                type: 'function',
                function: {
                  name: 'read_wallet_accounting_state',
                  arguments: '{"walletAddress":"0xabc"}',
                },
              },
            ],
          },
          {
            id: 'tool-msg',
            role: 'tool',
            toolCallId: 'tool-call-1',
            content: '{"summary":"ok"}',
          },
        ],
      }),
    );

    expect(agent.promptCalls).toEqual([
      [
        {
          role: 'user',
          content: 'what is my account status?',
          timestamp: 123,
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              id: 'tool-call-1',
              name: 'read_wallet_accounting_state',
              arguments: {
                walletAddress: '0xabc',
              },
            },
          ],
          api: 'responses',
          provider: 'openai',
          model: 'ag-ui-projected',
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: 'stop',
          timestamp: 123,
        },
        {
          role: 'toolResult',
          toolCallId: 'tool-call-1',
          toolName: 'ag-ui-tool',
          content: [{ type: 'text', text: '{"summary":"ok"}' }],
          isError: false,
          timestamp: 123,
        },
      ],
    ]);
  });

  it('emits a canonical request-message snapshot before streamed assistant output on run', async () => {
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

    const runtime = createPiRuntimeGatewayRuntime({
      agent,
      getSession: () => ({
        thread: { id: 'thread-1' },
        execution: { id: 'exec-1', status: 'working', statusMessage: 'Pi is connected.' },
        messages: [],
      }),
      updateSession: (_threadId, update) =>
        update({
          thread: { id: 'thread-1' },
          execution: { id: 'exec-1', status: 'working', statusMessage: 'Pi is connected.' },
          messages: [],
        }),
    });

    const runEvents = await collectEventSource(
      await runtime.run({
        threadId: 'thread-1',
        runId: 'run-1',
        messages: [{ id: 'user-msg-1', role: 'user', content: 'Connect now' }],
      }),
    );

    const firstRequestSnapshotIndex = runEvents.findIndex(
      (event) =>
        event.type === EventType.MESSAGES_SNAPSHOT &&
        event.messages.length === 1 &&
        event.messages[0]?.id === 'user-msg-1',
    );
    const firstAssistantDeltaIndex = runEvents.findIndex(
      (event) => event.type === EventType.TEXT_MESSAGE_CONTENT && event.delta === 'Pi is connected.',
    );

    expect(firstRequestSnapshotIndex).toBeGreaterThan(-1);
    expect(firstAssistantDeltaIndex).toBeGreaterThan(-1);
    expect(firstRequestSnapshotIndex).toBeLessThan(firstAssistantDeltaIndex);
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

    const events = await collectEventSource(await runtime.run({
      threadId: 'thread-2',
      runId: 'run-2',
      messages: [{ id: 'msg-2', role: 'user', content: 'Adjust course' }],
    }));

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

    const events = await collectEventSource(await runtime.run({
      threadId: 'thread-3',
      runId: 'run-3',
      messages: [{ id: 'msg-3', role: 'user', content: 'Queue this next' }],
    }));

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

  it('routes explicit object resume payloads through Pi prompt instead of continue()', async () => {
    const agent = new ScriptedPiAgent([]);

    const runtime = createPiRuntimeGatewayRuntime({
      agent,
      now: () => 456,
      getSession: () => ({
        thread: { id: 'thread-5' },
        execution: { id: 'exec-5', status: 'interrupted', statusMessage: 'Awaiting explicit resume' },
      }),
    });

    const events = await collectEventSource(
      await runtime.run({
        threadId: 'thread-5',
        runId: 'run-5',
        forwardedProps: {
          command: {
            resume: {
              operatorNote: 'safe window approved',
            },
          },
        },
      }),
    );

    expect(agent.promptCalls).toEqual([
      [
        {
          role: 'user',
          content: '{"operatorNote":"safe window approved"}',
          timestamp: 456,
        },
      ],
    ]);
    expect(agent.continueCalls).toBe(0);
    expect(events).toEqual([
      {
        type: EventType.RUN_STARTED,
        threadId: 'thread-5',
        runId: 'run-5',
      },
      {
        type: EventType.RUN_FINISHED,
        threadId: 'thread-5',
        runId: 'run-5',
        result: {
          executionId: 'exec-5',
          status: 'interrupted',
        },
      },
    ]);
  });

  it('emits shared-state hydration metadata after the snapshot on connect', async () => {
    const agent = new ScriptedPiAgent([]);
    let session = {
      thread: { id: 'thread-hydration' },
      execution: { id: 'exec-hydration', status: 'working' as const, statusMessage: 'Hydrated.' },
      sharedState: {
        settings: {
          amount: 250,
        },
      },
      sharedStateVersion: 1,
      sharedStateRevision: 'shared-rev-1',
      sharedStateHydrated: false,
    };

    const runtime = createPiRuntimeGatewayRuntime({
      agent,
      getSession: () => session,
      updateSession: (_threadId, update) => {
        session = update(session);
        return session;
      },
    });

    const bootstrapEvents = await collectEventSource(
      await runtime.connect({
        threadId: 'thread-hydration',
      }),
    );

    expect(bootstrapEvents).toContainEqual({
      type: EventType.STATE_SNAPSHOT,
      snapshot: expect.objectContaining({
        shared: {
          settings: {
            amount: 250,
          },
        },
        projected: {},
      }),
    });
    expect(bootstrapEvents).toContainEqual({
      type: EventType.CUSTOM,
      name: 'shared-state.control',
      value: {
        kind: 'hydration',
        reason: 'bootstrap',
        revision: 'shared-rev-1',
      },
    });
    expect(
      bootstrapEvents.findIndex((event) => event.type === EventType.STATE_SNAPSHOT),
    ).toBeLessThan(
      bootstrapEvents.findIndex(
        (event) =>
          event.type === EventType.CUSTOM &&
          'name' in event &&
          event.name === 'shared-state.control',
      ),
    );

    const reconnectEvents = await collectEventSource(
      await runtime.connect({
        threadId: 'thread-hydration',
      }),
    );

    expect(reconnectEvents).toContainEqual({
      type: EventType.CUSTOM,
      name: 'shared-state.control',
      value: {
        kind: 'hydration',
        reason: 'reconnect',
        revision: 'shared-rev-1',
      },
    });
  });

  it('accepts canonical shared-state updates and acknowledges them after the state delta', async () => {
    const agent = new ScriptedPiAgent([]);
    let session = {
      thread: { id: 'thread-update' },
      execution: { id: 'exec-update', status: 'working' as const, statusMessage: 'Ready.' },
      sharedState: {
        settings: {
          amount: 100,
        },
      },
      sharedStateVersion: 1,
      sharedStateRevision: 'shared-rev-1',
      sharedStateHydrated: true,
    };

    const runtime = createPiRuntimeGatewayRuntime({
      agent,
      getSession: () => session,
      updateSession: (_threadId, update) => {
        session = update(session);
        return session;
      },
    });

    const events = await collectEventSource(
      await runtime.run({
        threadId: 'thread-update',
        runId: 'run-update',
        forwardedProps: {
          command: {
            update: {
              clientMutationId: 'mutation-1',
              baseRevision: 'shared-rev-1',
              patch: [
                {
                  op: 'add',
                  path: '/shared/settings',
                  value: {
                    amount: 250,
                  },
                },
              ],
            },
          },
        },
      }),
    );

    expect(agent.promptCalls).toEqual([]);
    expect(agent.continueCalls).toBe(0);
    expect(events).toContainEqual({
      type: EventType.STATE_DELTA,
      delta: expect.arrayContaining([
        {
          op: 'replace',
          path: '/shared/settings/amount',
          value: 250,
        },
      ]),
    });
    expect(events).toContainEqual({
      type: EventType.CUSTOM,
      name: 'shared-state.control',
      value: {
        kind: 'update-ack',
        clientMutationId: 'mutation-1',
        status: 'accepted',
        resultingRevision: 'shared-rev-2',
        baseRevision: 'shared-rev-1',
      },
    });
    expect(
      events.findIndex((event) => event.type === EventType.STATE_DELTA),
    ).toBeLessThan(
      events.findIndex(
        (event) =>
          event.type === EventType.CUSTOM &&
          'name' in event &&
          event.name === 'shared-state.control',
      ),
    );
    expect(session.sharedState).toEqual({
      settings: {
        amount: 250,
      },
    });
    expect(session.sharedStateRevision).toBe('shared-rev-2');
    expect(session.sharedStateVersion).toBe(2);
  });

  it('acknowledges noop shared-state updates without emitting a state delta', async () => {
    const agent = new ScriptedPiAgent([]);

    const runtime = createPiRuntimeGatewayRuntime({
      agent,
      getSession: () => ({
        thread: { id: 'thread-update-noop' },
        execution: { id: 'exec-update-noop', status: 'working' as const, statusMessage: 'Ready.' },
        sharedState: {
          settings: {
            amount: 250,
          },
        },
        sharedStateVersion: 2,
        sharedStateRevision: 'shared-rev-2',
        sharedStateHydrated: true,
      }),
    });

    const events = await collectEventSource(
      await runtime.run({
        threadId: 'thread-update-noop',
        runId: 'run-update-noop',
        forwardedProps: {
          command: {
            update: {
              clientMutationId: 'mutation-noop',
              baseRevision: 'shared-rev-2',
              patch: [
                {
                  op: 'add',
                  path: '/shared/settings',
                  value: {
                    amount: 250,
                  },
                },
              ],
            },
          },
        },
      }),
    );

    expect(events.filter((event) => event.type === EventType.STATE_DELTA)).toEqual([]);
    expect(events).toContainEqual({
      type: EventType.CUSTOM,
      name: 'shared-state.control',
      value: {
        kind: 'update-ack',
        clientMutationId: 'mutation-noop',
        status: 'noop',
        resultingRevision: 'shared-rev-2',
        baseRevision: 'shared-rev-2',
      },
    });
  });

  it('rejects shared-state updates without a base revision on hydrated threads', async () => {
    const agent = new ScriptedPiAgent([]);

    const runtime = createPiRuntimeGatewayRuntime({
      agent,
      getSession: () => ({
        thread: { id: 'thread-update-missing-base' },
        execution: { id: 'exec-update-missing-base', status: 'working' as const, statusMessage: 'Ready.' },
        sharedState: {
          settings: {
            amount: 100,
          },
        },
        sharedStateVersion: 1,
        sharedStateRevision: 'shared-rev-1',
        sharedStateHydrated: true,
      }),
    });

    const events = await collectEventSource(
      await runtime.run({
        threadId: 'thread-update-missing-base',
        runId: 'run-update-missing-base',
        forwardedProps: {
          command: {
            update: {
              clientMutationId: 'mutation-missing-base',
              patch: [
                {
                  op: 'add',
                  path: '/shared/settings',
                  value: {
                    amount: 250,
                  },
                },
              ],
            },
          },
        },
      }),
    );

    expect(events.filter((event) => event.type === EventType.STATE_DELTA)).toEqual([]);
    expect(events).toContainEqual({
      type: EventType.CUSTOM,
      name: 'shared-state.control',
      value: {
        kind: 'update-ack',
        clientMutationId: 'mutation-missing-base',
        status: 'rejected',
        resultingRevision: 'shared-rev-1',
        code: 'missing_base_revision',
      },
    });
  });

  it('rejects shared-state updates that patch outside the writable shared surface', async () => {
    const agent = new ScriptedPiAgent([]);

    const runtime = createPiRuntimeGatewayRuntime({
      agent,
      getSession: () => ({
        thread: { id: 'thread-update-forbidden' },
        execution: { id: 'exec-update-forbidden', status: 'working' as const, statusMessage: 'Ready.' },
        sharedState: {
          settings: {
            amount: 100,
          },
        },
        sharedStateVersion: 1,
        sharedStateRevision: 'shared-rev-1',
        sharedStateHydrated: true,
      }),
    });

    const events = await collectEventSource(
      await runtime.run({
        threadId: 'thread-update-forbidden',
        runId: 'run-update-forbidden',
        forwardedProps: {
          command: {
            update: {
              clientMutationId: 'mutation-forbidden',
              baseRevision: 'shared-rev-1',
              patch: [
                {
                  op: 'add',
                  path: '/projected/managedMandate',
                  value: {
                    status: 'active',
                  },
                },
              ],
            },
          },
        },
      }),
    );

    expect(events.filter((event) => event.type === EventType.STATE_DELTA)).toEqual([]);
    expect(events).toContainEqual({
      type: EventType.CUSTOM,
      name: 'shared-state.control',
      value: {
        kind: 'update-ack',
        clientMutationId: 'mutation-forbidden',
        status: 'rejected',
        resultingRevision: 'shared-rev-1',
        baseRevision: 'shared-rev-1',
        code: 'forbidden_path',
      },
    });
  });

  it('streams text events before the Pi prompt fully completes', async () => {
    let releasePrompt: (() => void) | null = null;
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

    class StreamingPiAgent extends ScriptedPiAgent {
      override async prompt(messages: unknown): Promise<void> {
        this.promptCalls.push(messages);
        this.emit({ type: 'message_start', message: assistantMessage });
        this.emit({
          type: 'message_update',
          message: assistantMessage,
          assistantMessageEvent: {
            type: 'text_delta',
            contentIndex: 0,
            delta: 'Streaming from Pi.',
            partial: assistantMessage,
          },
        });

        await new Promise<void>((resolve) => {
          releasePrompt = resolve;
        });

        this.emit({ type: 'message_end', message: assistantMessage });
      }
    }

    const runtime = createPiRuntimeGatewayRuntime({
      agent: new StreamingPiAgent([]),
      getSession: () => ({
        thread: { id: 'thread-4' },
        execution: { id: 'exec-4', status: 'working', statusMessage: 'Streaming from Pi.' },
      }),
    });

    const eventSource = await runtime.run({
      threadId: 'thread-4',
      runId: 'run-4',
      messages: [{ id: 'msg-4', role: 'user', content: 'Stream now' }],
    });
    expect(Array.isArray(eventSource)).toBe(false);
    const iterator = (eventSource as AsyncIterable<{ type: EventType }>)[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        type: EventType.RUN_STARTED,
        threadId: 'thread-4',
        runId: 'run-4',
      },
    });
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'pi:exec-4:assistant:1',
        role: 'assistant',
      },
    });
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'pi:exec-4:assistant:1',
        delta: 'Streaming from Pi.',
      },
    });

    releasePrompt?.();

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        type: EventType.TEXT_MESSAGE_END,
        messageId: 'pi:exec-4:assistant:1',
      },
    });
  });
});

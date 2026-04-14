import type { State } from '@ag-ui/langgraph';
import { EventType, verifyEvents, type RunAgentInput } from '@ag-ui/client';
import { Subject, lastValueFrom, toArray } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { LangGraphInterruptSnapshotAgent } from './langGraphInterruptSnapshotAgent';
import { assertSharedThreadSnapshotContract } from './sharedThreadSnapshotContract.test-support';

type LangGraphThreadState = Parameters<LangGraphInterruptSnapshotAgent['getStateSnapshot']>[0];

describe('LangGraphInterruptSnapshotAgent', () => {
  it('translates named workflow commands into native LangGraph command updates before streaming', async () => {
    const streamMock = vi.fn(async function* () {});
    const agent = new LangGraphInterruptSnapshotAgent({
      deploymentUrl: 'http://langgraph-gmx:8126',
      graphId: 'agent-gmx-allora',
    });

    Reflect.set(agent, 'assistant', {
      assistant_id: 'assistant-1',
    });
    Reflect.set(agent, 'activeRun', {
      id: 'run-1',
      threadId: 'thread-1',
      hasFunctionStreaming: false,
      hasPredictState: false,
      manuallyEmittedState: null,
    });
    Reflect.set(agent, 'client', {
      threads: {
        getState: async () =>
          ({
            values: {
              messages: [],
              thread: {},
              private: {},
            },
            tasks: [],
            next: [],
            metadata: { writes: {} },
          }) as LangGraphThreadState,
      },
      assistants: {
        getGraph: async () => ({ edges: [] }),
      },
      runs: {
        stream: streamMock,
      },
    });

    Reflect.set(agent, 'getOrCreateThread', vi.fn(async () => ({ thread_id: 'thread-1' })));
    Reflect.set(agent, 'getSchemaKeys', vi.fn(async () => ({
      config: [],
      context: [],
      input: ['thread', 'messages', 'copilotkit', 'tools'],
      output: ['thread', 'messages', 'copilotkit', 'tools'],
    })));

    await agent.prepareStream(
      {
        threadId: 'thread-1',
        runId: 'run-1',
        messages: [],
        state: {},
        tools: [],
        context: [],
        forwardedProps: {
          command: {
            name: 'hire',
            clientMutationId: 'hire-1',
            source: 'detail-page',
          },
        },
      },
      ['events'],
    );

    expect(streamMock).toHaveBeenCalledWith(
      'thread-1',
      'assistant-1',
      expect.objectContaining({
        command: {
          update: {
            private: {
              pendingCommand: {
                command: 'hire',
                clientMutationId: 'hire-1',
              },
            },
          },
        },
      }),
    );
  });

  it('preserves top-level persisted task interrupts in projected snapshots', () => {
    const agent = new LangGraphInterruptSnapshotAgent({
      deploymentUrl: 'http://langgraph-gmx:8126',
      graphId: 'agent-gmx-allora',
    });

    Reflect.set(agent, 'activeRun', {
      id: 'run-1',
      schemaKeys: {
        config: [],
        context: [],
        input: ['thread', 'copilotkit', 'messages', 'tools'],
        output: ['thread', 'copilotkit', 'messages', 'tools'],
      },
    });

    const snapshot = agent.getStateSnapshot({
      values: {
        thread: {
          task: {
            id: 'task-1',
            taskStatus: { state: 'input-required' },
          },
        },
        copilotkit: {
          actions: [],
          context: [],
        },
        droppedField: true,
      },
      tasks: [
        {
          interrupts: [
            {
              value: {
                type: 'gmx-setup-request',
                message: 'Provide strategy config',
              },
            },
          ],
        },
      ],
    } as unknown as LangGraphThreadState);

    expect(snapshot).toMatchObject({
      thread: {
        task: {
          id: 'task-1',
          taskStatus: { state: 'input-required' },
        },
      },
      tasks: [
        {
          interrupts: [
            {
              value: {
                type: 'gmx-setup-request',
                message: 'Provide strategy config',
              },
            },
          ],
        },
      ],
    });
    expect(snapshot).not.toHaveProperty('droppedField');
  });

  it('preserves the shared web-facing lifecycle and task status snapshot contract', () => {
    const agent = new LangGraphInterruptSnapshotAgent({
      deploymentUrl: 'http://langgraph-gmx:8126',
      graphId: 'agent-gmx-allora',
    });

    Reflect.set(agent, 'activeRun', {
      id: 'run-1',
      schemaKeys: {
        config: [],
        context: [],
        input: ['thread', 'copilotkit', 'messages', 'tools'],
        output: ['thread', 'copilotkit', 'messages', 'tools'],
      },
    });

    const snapshot = agent.getStateSnapshot({
      values: {
        thread: {
          id: 'thread-1',
          lifecycle: {
            phase: 'onboarding',
          },
          task: {
            id: 'task-1',
            taskStatus: {
              state: 'input-required',
              message: {
                content: 'Provide strategy config',
              },
            },
          },
        },
        copilotkit: {
          actions: [],
          context: [],
        },
      },
      tasks: [],
    } as unknown as LangGraphThreadState);

    assertSharedThreadSnapshotContract(snapshot);
  });

  it('completes the raw run observable when runAgentStream returns after emitting run finished', async () => {
    class CompletingOnReturnAgent extends LangGraphInterruptSnapshotAgent {
      override async runAgentStream(input: RunAgentInput, subscriber: { next: (event: unknown) => void }) {
        subscriber.next({
          type: EventType.RUN_STARTED,
          threadId: input.threadId,
          runId: input.runId,
        });
        subscriber.next({
          type: EventType.RUN_FINISHED,
          threadId: input.threadId,
          runId: input.runId,
        });
      }
    }

    const agent = new CompletingOnReturnAgent({
      deploymentUrl: 'http://langgraph-gmx:8126',
      graphId: 'agent-gmx-allora',
    });

    const completionResult = await Promise.race([
      lastValueFrom(
        agent
          .run({
            threadId: 'thread-1',
            runId: 'run-1',
            messages: [],
            state: {},
            tools: [],
            context: [],
            forwardedProps: {},
          })
          .pipe(toArray()),
      ).then((events) => ({
        kind: 'completed' as const,
        eventTypes: events.map((event) => event.type),
      })),
      new Promise<{ kind: 'timeout' }>((resolve) => {
        setTimeout(() => resolve({ kind: 'timeout' }), 50);
      }),
    ]);

    expect(completionResult).toEqual({
      kind: 'completed',
      eventTypes: [EventType.RUN_STARTED, EventType.RUN_FINISHED],
    });
  });

  it('starts a new run before streaming live step events after a finished connect snapshot', async () => {
    const agent = new LangGraphInterruptSnapshotAgent({
      deploymentUrl: 'http://langgraph-gmx:8126',
      graphId: 'agent-gmx-allora',
    });

    Reflect.set(agent, 'client', {
      threads: {
        getState: async () =>
          ({
            values: {
              messages: [],
              thread: {},
            },
            tasks: [],
            next: ['collectDelegations'],
            metadata: { writes: {} },
          }) as LangGraphThreadState,
      },
    });

    Reflect.set(agent, 'activeRun', {
      id: 'run-live',
      threadId: 'thread-1',
      nodeName: undefined,
      prevNodeName: null,
      graphInfo: {
        nodes: [{ id: 'collectDelegations' }],
      },
      schemaKeys: {
        config: [],
        context: [],
        input: ['thread', 'copilotkit', 'messages', 'tools'],
        output: ['thread', 'copilotkit', 'messages', 'tools'],
      },
      hasFunctionStreaming: false,
      hasPredictState: false,
      connectRunStarted: true,
      threadStream: true,
    });

    const eventSource = new Subject<{
      type: EventType;
      threadId?: string;
      runId?: string;
      stepName?: string;
      snapshot?: unknown;
      messages?: unknown[];
    }>();
    const verifiedEventsPromise = lastValueFrom(verifyEvents(false)(eventSource).pipe(toArray()));

    eventSource.next({
      type: EventType.RUN_STARTED,
      threadId: 'thread-1',
      runId: 'connect-snapshot',
    });
    eventSource.next({
      type: EventType.RUN_FINISHED,
      threadId: 'thread-1',
      runId: 'connect-snapshot',
    });

    const handleStreamEvents = Reflect.get(agent, 'handleStreamEvents') as (
      stream: {
        streamResponse: AsyncGenerator<{
          event: string;
          data: {
            event: string;
            metadata: { langgraph_node: string; run_id: string };
            data: Record<string, never>;
          };
        }>;
        state: ThreadState<State>;
      },
      threadId: string,
      subscriber: {
        next: (event: {
          type: EventType;
          threadId?: string;
          runId?: string;
          stepName?: string;
          snapshot?: unknown;
          messages?: unknown[];
        }) => void;
        error: (error: unknown) => void;
        complete: () => void;
      },
      input: RunAgentInput,
      streamModes: string[],
    ) => Promise<void>;

    await handleStreamEvents.call(
      agent,
      {
        streamResponse: (async function* () {
          yield {
            event: 'events',
            data: {
              event: 'on_chain_start',
              metadata: {
                langgraph_node: 'collectDelegations',
                run_id: 'run-live',
              },
              data: {},
            },
          };
        })(),
        state: {
          values: {
            messages: [],
            thread: {},
          },
          tasks: [],
          next: ['collectDelegations'],
          metadata: { writes: {} },
        } as LangGraphThreadState,
      },
      'thread-1',
      {
        next: (event) => eventSource.next(event),
        error: (error) => eventSource.error(error),
        complete: () => eventSource.complete(),
      },
      {
        threadId: 'thread-1',
        runId: 'run-live',
        messages: [],
        state: {},
        tools: [],
        context: [],
        forwardedProps: {},
      },
      ['events'],
    );

    eventSource.complete();

    const events = await verifiedEventsPromise;
    const liveRunStartIndex = events.findIndex(
      (event) => event.type === EventType.RUN_STARTED && event.runId === 'run-live',
    );
    const liveStepStartIndex = events.findIndex(
      (event) => event.type === EventType.STEP_STARTED && event.stepName === 'collectDelegations',
    );

    expect(liveRunStartIndex).toBeGreaterThanOrEqual(0);
    expect(liveStepStartIndex).toBeGreaterThan(liveRunStartIndex);
  });
});

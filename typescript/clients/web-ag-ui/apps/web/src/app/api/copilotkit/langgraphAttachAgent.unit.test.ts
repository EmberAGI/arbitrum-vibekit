import { EventType, type BaseEvent, type RunAgentInput } from '@ag-ui/client';
import type { ThreadState } from '@langchain/langgraph-sdk';
import { Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MockClient = {
  assistants: {
    getGraph: ReturnType<typeof vi.fn>;
  };
  threads: {
    getState: ReturnType<typeof vi.fn>;
    joinStream: ReturnType<typeof vi.fn>;
  };
  runs: {
    create: ReturnType<typeof vi.fn>;
  };
};

const clientMocks = vi.hoisted(() => {
  const client: MockClient = {
    assistants: {
      getGraph: vi.fn().mockResolvedValue({ id: 'graph' }),
    },
    threads: {
      getState: vi.fn(),
      joinStream: vi.fn(),
    },
    runs: {
      create: vi.fn(),
    },
  };

  return {
    client,
    getGraph: client.assistants.getGraph,
    getState: client.threads.getState,
    joinStream: client.threads.joinStream,
    runsCreate: client.runs.create,
  };
});

vi.mock('@copilotkit/runtime/langgraph', () => {
  class LangGraphAgent {
    public config: unknown;
    public client: MockClient;
    public assistant?: { assistant_id: string };
    public activeRun?: {
      id: string;
      threadId: string;
      hasFunctionStreaming: boolean;
      serverRunIdKnown: boolean;
      schemaKeys?: string[];
      graphInfo?: unknown;
      nodeName?: string;
    };
    public subscriber?: { next: (event: BaseEvent) => void };

    constructor(config: unknown) {
      this.config = config;
      this.client = clientMocks.client;
      if (config && typeof config === 'object' && 'client' in config) {
        this.client = (config as { client: MockClient }).client;
      }
    }

    async getAssistant() {
      return { assistant_id: 'assistant-1' };
    }

    async getSchemaKeys() {
      return [];
    }

    dispatchEvent(event: BaseEvent) {
      this.subscriber?.next(event);
    }

    handleSingleEvent() {
      // no-op for unit tests
    }

    handleNodeChange() {
      // no-op for unit tests
    }

    getStateSnapshot(state: ThreadState) {
      return { state };
    }
  }

  return { LangGraphAgent };
});

const emptyStream = () =>
  (async function* () {
    // intentionally empty
  })();

const collectEvents = (observable: Observable<BaseEvent>) =>
  new Promise<BaseEvent[]>((resolve, reject) => {
    const events: BaseEvent[] = [];
    const subscription = observable.subscribe({
      next: (event) => events.push(event),
      error: (error: unknown) => {
        subscription.unsubscribe();
        reject(error);
      },
      complete: () => resolve(events),
    });
  });

const makeState = (messages: ThreadState['values'] | undefined): ThreadState =>
  ({
    values: messages,
  }) as ThreadState;

beforeEach(() => {
  clientMocks.getState.mockReset();
  clientMocks.joinStream.mockReset();
  clientMocks.getGraph.mockReset();
  clientMocks.runsCreate.mockReset();
  clientMocks.getGraph.mockResolvedValue({ id: 'graph' });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('LangGraphAttachAgent.connect', () => {
  it('emits message + state snapshots before tailing the stream', async () => {
    // Given a thread state with a single human message
    const state = makeState({
      messages: [{ id: 'msg-1', type: 'human', content: 'Hello' }],
    });
    clientMocks.getState.mockResolvedValue(state);
    clientMocks.joinStream.mockImplementation(() => emptyStream());

    // When connecting to the thread stream
    const { LangGraphAttachAgent } = await import('./langgraphAttachAgent.js');
    const agent = new LangGraphAttachAgent({ client: clientMocks.client } as unknown);
    const events = await collectEvents(
      agent.connect({ threadId: 'thread-1' } as RunAgentInput),
    );

    // Then snapshots are emitted first and no new run is started
    expect(events[0]?.type).toBe(EventType.MESSAGES_SNAPSHOT);
    expect(events[1]?.type).toBe(EventType.STATE_SNAPSHOT);
    const messageEvent = events[0] as { messages?: Array<{ role: string; content: string }> };
    expect(messageEvent.messages?.[0]).toMatchObject({ role: 'user', content: 'Hello' });
    expect(clientMocks.runsCreate).not.toHaveBeenCalled();
  });

  it('retries joinStream without lastEventId after a resume failure', async () => {
    // Given a resumable connect that fails on the first stream attempt
    const state = makeState({ messages: [] });
    clientMocks.getState.mockResolvedValue(state);
    clientMocks.joinStream.mockImplementation((_threadId: string, options?: { lastEventId?: string }) => {
      if (options?.lastEventId) {
        throw new Error('cursor invalid');
      }
      return emptyStream();
    });

    // When connecting with a lastEventId cursor
    const { LangGraphAttachAgent } = await import('./langgraphAttachAgent.js');
    const agent = new LangGraphAttachAgent({ client: clientMocks.client } as unknown);
    const events = await collectEvents(
      agent.connect({
        threadId: 'thread-2',
        forwardedProps: { lastEventId: 'evt-1' },
      } as RunAgentInput),
    );

    // Then it refreshes snapshots and retries without the cursor
    expect(clientMocks.getState).toHaveBeenCalledTimes(2);
    expect(clientMocks.joinStream).toHaveBeenCalledTimes(2);
    const secondOptions = clientMocks.joinStream.mock.calls[1]?.[1] as { lastEventId?: string };
    expect(secondOptions?.lastEventId).toBeUndefined();
    const snapshotEvents = events.filter((event) => event.type === EventType.MESSAGES_SNAPSHOT);
    expect(snapshotEvents).toHaveLength(2);
  });

  it('emits run boundaries from lifecycle events', async () => {
    // Given lifecycle events for a run
    const state = makeState({ messages: [] });
    clientMocks.getState.mockResolvedValue(state);
    clientMocks.joinStream.mockImplementation(() =>
      (async function* () {
        yield { event: 'lifecycle', data: { status: 'started', run_id: 'run-1' } };
        yield { event: 'lifecycle', data: { status: 'completed', run_id: 'run-1' } };
      })(),
    );

    // When connecting to the stream
    const { LangGraphAttachAgent } = await import('./langgraphAttachAgent.js');
    const agent = new LangGraphAttachAgent({ client: clientMocks.client } as unknown);
    const events = await collectEvents(
      agent.connect({ threadId: 'thread-3' } as RunAgentInput),
    );

    // Then RUN_STARTED and RUN_FINISHED are emitted
    const runEvents = events.filter(
      (event) =>
        event.type === EventType.RUN_STARTED || event.type === EventType.RUN_FINISHED,
    );
    expect(runEvents.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.RUN_FINISHED,
    ]);
  });
});

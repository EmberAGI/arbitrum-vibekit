import { EventType, type BaseEvent, type Message, type RunAgentInput } from '@ag-ui/client';
import { LangGraphAgent } from '@copilotkit/runtime/langgraph';
import type { Message as LangGraphMessage, ThreadState } from '@langchain/langgraph-sdk';
import { Observable, type Subscriber } from 'rxjs';
import { v7 as uuidv7 } from 'uuid';

type LangGraphAgentConfig = ConstructorParameters<typeof LangGraphAgent>[0];
type ThreadStreamMode = 'run_modes' | 'lifecycle' | 'state_update';

const SNAPSHOT_INTERVAL_MS = 1000;
const POLL_INTERVAL_MS = 250;
const FALLBACK_FAST_POLL_MS = 10;
const FALLBACK_FAST_WINDOW_MS = 5000;
const THREAD_STREAM_MODES: ReadonlyArray<ThreadStreamMode> = [
  'run_modes',
  'lifecycle',
  'state_update',
];

function isThreadStreamMode(value: unknown): value is ThreadStreamMode {
  return THREAD_STREAM_MODES.includes(value as ThreadStreamMode);
}

function toTextContent(content: LangGraphMessage['content']): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('');
  }
  return '';
}

function toAgUiMessages(messages: LangGraphMessage[]): Message[] {
  const converted: Message[] = [];
  for (const message of messages) {
    const id = message.id ?? uuidv7();
    switch (message.type) {
      case 'human':
        converted.push({
          id,
          role: 'user',
          content: toTextContent(message.content),
        });
        break;
      case 'ai': {
        const toolCalls = message.tool_calls?.map((toolCall) => ({
          id: toolCall.id ?? uuidv7(),
          type: 'function' as const,
          function: {
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.args ?? {}),
          },
        }));
        converted.push({
          id,
          role: 'assistant',
          content: toTextContent(message.content),
          ...(toolCalls ? { toolCalls } : {}),
        });
        break;
      }
      case 'system':
        converted.push({
          id,
          role: 'system',
          content: toTextContent(message.content),
        });
        break;
      case 'tool':
        converted.push({
          id,
          role: 'tool',
          content: toTextContent(message.content),
          toolCallId: message.tool_call_id ?? uuidv7(),
        });
        break;
      case 'function':
      case 'remove':
        break;
      default:
        break;
    }
  }
  return converted;
}

function extractMessages(state: ThreadState): LangGraphMessage[] {
  const values = state.values;
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return [];
  }
  const raw = (values as { messages?: unknown }).messages;
  return Array.isArray(raw) ? (raw as LangGraphMessage[]) : [];
}

const sanitizeForJson = <T>(value: T): T => {
  const serialized = JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item,
  );
  if (serialized === undefined) {
    return value;
  }
  return JSON.parse(serialized) as T;
};

function resolveLastEventId(input: RunAgentInput): string | undefined {
  const forwarded = input.forwardedProps as { lastEventId?: unknown; lastEventID?: unknown } | null;
  if (!forwarded) {
    return undefined;
  }
  if (typeof forwarded.lastEventId === 'string' && forwarded.lastEventId.length > 0) {
    return forwarded.lastEventId;
  }
  if (typeof forwarded.lastEventID === 'string' && forwarded.lastEventID.length > 0) {
    return forwarded.lastEventID;
  }
  return undefined;
}

function resolveStreamMode(input: RunAgentInput): ThreadStreamMode | ThreadStreamMode[] | undefined {
  const forwarded = input.forwardedProps as { streamMode?: unknown } | null;
  if (!forwarded) {
    return undefined;
  }
  const { streamMode } = forwarded;
  if (typeof streamMode === 'string' && isThreadStreamMode(streamMode)) {
    return streamMode;
  }
  if (Array.isArray(streamMode) && streamMode.every(isThreadStreamMode)) {
    return streamMode;
  }
  return undefined;
}

type HttpErrorLike = {
  status?: number;
  response?: { status?: number };
};

const isNotFoundError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as HttpErrorLike;
  const status = candidate.status ?? candidate.response?.status;
  return status === 404;
};

const isTerminalRunStatus = (status: string | undefined) =>
  status === 'completed' ||
  status === 'failed' ||
  status === 'canceled' ||
  status === 'interrupted' ||
  status === 'success' ||
  status === 'error' ||
  status === 'timeout';

export class LangGraphAttachAgent extends LangGraphAgent {
  constructor(config: LangGraphAgentConfig) {
    super(config);
  }

  public clone() {
    return new LangGraphAttachAgent(this.config);
  }

  public connect(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable((subscriber) => {
      let aborted = false;
      void this.connectStream(input, subscriber, () => aborted).catch((error) => {
        if (!aborted) {
          subscriber.error(error as Error);
        }
      });
      return () => {
        aborted = true;
      };
    });
  }

  private async connectStream(
    input: RunAgentInput,
    subscriber: Subscriber<BaseEvent>,
    isAborted: () => boolean,
  ): Promise<void> {
    const threadId = input.threadId;

    this.subscriber = subscriber;
    this.activeRun = {
      id: input.runId ?? uuidv7(),
      threadId,
      hasFunctionStreaming: false,
      serverRunIdKnown: false,
    };

    const assistantPromise = Promise.resolve(this.assistant ?? this.getAssistant());
    const schemaKeysPromise = assistantPromise.then(() => this.getSchemaKeys());
    const graphInfoPromise = assistantPromise.then((assistant) =>
      this.client.assistants.getGraph(assistant.assistant_id),
    );
    const metadataPromise = (async () => {
      this.assistant = await assistantPromise;
      if (!this.activeRun) {
        return;
      }
      this.activeRun.schemaKeys = await schemaKeysPromise;
      this.activeRun.graphInfo = await graphInfoPromise;
    })().catch((error) => {
      console.warn('[connect] Failed to load LangGraph metadata', error);
    });

    const snapshot = await this.client.threads.getState(threadId);
    this.dispatchSnapshot(snapshot, subscriber);

    let lastSnapshotAt = Date.now();
    let snapshotTimer: NodeJS.Timeout | null = null;
    let currentRunId: string | null = null;

    const scheduleSnapshot = () => {
      if (snapshotTimer) {
        return;
      }
      const elapsed = Date.now() - lastSnapshotAt;
      const delay = elapsed >= SNAPSHOT_INTERVAL_MS ? 0 : SNAPSHOT_INTERVAL_MS - elapsed;
      snapshotTimer = setTimeout(() => {
        snapshotTimer = null;
        void this.refreshSnapshot(threadId, subscriber)
          .then(() => {
            lastSnapshotAt = Date.now();
          })
          .catch((error) => {
            console.warn('[connect] Failed to refresh snapshot', error);
          });
      }, delay);
    };

    const updateRunId = (nextRunId: string | undefined) => {
      if (!nextRunId || currentRunId === nextRunId) {
        return;
      }
      if (currentRunId) {
        this.emitEvent(
          {
            type: EventType.RUN_FINISHED,
            threadId,
            runId: currentRunId,
          },
          subscriber,
        );
      }
      currentRunId = nextRunId;
      if (this.activeRun) {
        this.activeRun.id = nextRunId;
        this.activeRun.serverRunIdKnown = true;
      }
      this.emitEvent(
        {
          type: EventType.RUN_STARTED,
          threadId,
          runId: nextRunId,
        },
        subscriber,
      );
    };

    const handleLifecycle = (event: { status?: unknown; run_id?: unknown }) => {
      const status = typeof event.status === 'string' ? event.status : undefined;
      const runId = typeof event.run_id === 'string' ? event.run_id : undefined;
      if (!status) {
        return;
      }
      if (status === 'started' && runId) {
        updateRunId(runId);
        return;
      }
      if (
        status === 'completed' ||
        status === 'failed' ||
        status === 'canceled' ||
        status === 'interrupted'
      ) {
        const resolvedRunId = runId ?? currentRunId;
        if (resolvedRunId) {
          this.emitEvent(
            {
              type: EventType.RUN_FINISHED,
              threadId,
              runId: resolvedRunId,
            },
            subscriber,
          );
          if (currentRunId === resolvedRunId) {
            currentRunId = null;
          }
        }
      }
    };

    const lastEventId = resolveLastEventId(input);
    const streamMode = resolveStreamMode(input);

    const baseStreamOptions = {
      ...(streamMode ? { streamMode } : {}),
    };
    const streamOptions = {
      ...baseStreamOptions,
      ...(lastEventId ? { lastEventId } : {}),
    };

    const consumeStream = async (streamIterator: AsyncIterable<{ event: string; data: unknown }>) => {
      for await (const streamEvent of streamIterator) {
        if (isAborted()) {
          break;
        }

        const eventName = streamEvent.event;
        if (eventName === 'error') {
          const data = streamEvent.data as { error?: string; message?: string } | undefined;
          this.emitEvent(
            {
              type: EventType.RUN_ERROR,
              message: data?.message ?? 'Unknown error',
              code: data?.error ?? 'unknown',
            },
            subscriber,
          );
          continue;
        }

        if (eventName === 'metadata') {
          const data = streamEvent.data as { run_id?: string } | undefined;
          updateRunId(data?.run_id);
          continue;
        }

        if (eventName === 'lifecycle' || eventName === 'run_modes') {
          handleLifecycle(streamEvent.data as { status?: unknown; run_id?: unknown });
          continue;
        }

        if (eventName === 'events') {
          await metadataPromise;
          const raw = streamEvent.data as { event?: unknown; metadata?: { run_id?: string } };
          if (typeof raw?.metadata?.run_id === 'string') {
            updateRunId(raw.metadata.run_id);
          }
          if (raw && typeof raw.event === 'string') {
            const nodeName =
              typeof (raw as { metadata?: { langgraph_node?: unknown } }).metadata
                ?.langgraph_node === 'string'
                ? (raw as { metadata: { langgraph_node: string } }).metadata.langgraph_node
                : undefined;
            if (nodeName && this.activeRun?.nodeName !== nodeName) {
              this.handleNodeChange(nodeName);
            }
            this.handleSingleEvent(raw);
            scheduleSnapshot();
          }
          continue;
        }

        if (eventName === 'values' || eventName === 'updates' || eventName === 'state_update') {
          scheduleSnapshot();
        }
      }
    };

    const runPollingFallback = async () => {
      const startedRuns = new Set<string>();
      const finishedRuns = new Set<string>();
      const seenSnapshotKeys = new Set<string>();
      const snapshotOrder: string[] = [];
      const MAX_SNAPSHOT_CACHE = 50;

      let fastUntil = Date.now() + FALLBACK_FAST_WINDOW_MS;
      const bumpFastWindow = () => {
        fastUntil = Date.now() + FALLBACK_FAST_WINDOW_MS;
      };

      while (!isAborted()) {
        try {
          const runs = await this.client.runs.list(threadId, { limit: 10 });
          const sortedRuns = [...runs].sort((a, b) => a.created_at.localeCompare(b.created_at));
          let refreshRequested = false;
          for (const run of sortedRuns) {
            if (!startedRuns.has(run.run_id)) {
              startedRuns.add(run.run_id);
              this.emitEvent(
                {
                  type: EventType.RUN_STARTED,
                  threadId,
                  runId: run.run_id,
                },
                subscriber,
              );
              refreshRequested = true;
              bumpFastWindow();
            }
            if (isTerminalRunStatus(run.status) && !finishedRuns.has(run.run_id)) {
              finishedRuns.add(run.run_id);
              this.emitEvent(
                {
                  type: EventType.RUN_FINISHED,
                  threadId,
                  runId: run.run_id,
                },
                subscriber,
              );
              refreshRequested = true;
              bumpFastWindow();
            }
          }
          if (refreshRequested) {
            await this.refreshSnapshot(threadId, subscriber);
          }
          const history = await this.client.threads.getHistory(threadId, { limit: 25 });
          const sortedHistory = [...history].sort((a, b) =>
            (a.created_at ?? '').localeCompare(b.created_at ?? ''),
          );
          let emittedSnapshot = false;
          for (const state of sortedHistory) {
            const createdAt = state.created_at ?? '';
            const checkpointId = state.checkpoint?.checkpoint_id ?? '';
            const snapshotKey = checkpointId
              ? `${checkpointId}:${createdAt}`
              : createdAt
                ? `created:${createdAt}`
                : '';
            if (!snapshotKey || seenSnapshotKeys.has(snapshotKey)) {
              continue;
            }
            this.dispatchSnapshot(state, subscriber);
            seenSnapshotKeys.add(snapshotKey);
            snapshotOrder.push(snapshotKey);
            if (snapshotOrder.length > MAX_SNAPSHOT_CACHE) {
              const removed = snapshotOrder.shift();
              if (removed) {
                seenSnapshotKeys.delete(removed);
              }
            }
            emittedSnapshot = true;
          }
          if (!emittedSnapshot) {
            await this.refreshSnapshot(threadId, subscriber);
          } else {
            bumpFastWindow();
          }
        } catch (pollError) {
          console.warn('[connect] polling fallback failed', pollError);
        }
        const interval = Date.now() < fastUntil ? FALLBACK_FAST_POLL_MS : POLL_INTERVAL_MS;
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    };

    try {
      await consumeStream(this.client.threads.joinStream(threadId, streamOptions));
      subscriber.complete();
    } catch (error) {
      if (isNotFoundError(error)) {
        await runPollingFallback();
        return;
      }
      if (!lastEventId) {
        subscriber.error(error as Error);
      } else {
        console.warn('[connect] joinStream resume failed; retrying from latest snapshot.', error);
        await this.refreshSnapshot(threadId, subscriber);
        try {
          await consumeStream(this.client.threads.joinStream(threadId, baseStreamOptions));
          subscriber.complete();
        } catch (retryError) {
          if (isNotFoundError(retryError)) {
            await runPollingFallback();
            return;
          }
          subscriber.error(retryError as Error);
        }
      }
    } finally {
      if (snapshotTimer) {
        clearTimeout(snapshotTimer);
      }
      if (this.activeRun) {
        this.activeRun = undefined;
      }
    }
  }

  private emitEvent(event: BaseEvent, subscriber: Subscriber<BaseEvent>): void {
    subscriber.next(event);
  }

  private dispatchSnapshot(state: ThreadState, subscriber: Subscriber<BaseEvent>): void {
    const rawSnapshot = { values: sanitizeForJson(state.values) };
    const messages = toAgUiMessages(extractMessages(state));
    this.emitEvent(
      {
        type: EventType.MESSAGES_SNAPSHOT,
        messages,
        rawEvent: rawSnapshot,
      },
      subscriber,
    );
    this.emitEvent(
      {
        type: EventType.STATE_SNAPSHOT,
        snapshot: sanitizeForJson(this.getStateSnapshot(state)),
        rawEvent: rawSnapshot,
      },
      subscriber,
    );
  }

  private async refreshSnapshot(threadId: string, subscriber: Subscriber<BaseEvent>): Promise<void> {
    const snapshot = await this.client.threads.getState(threadId);
    this.dispatchSnapshot(snapshot, subscriber);
  }
}

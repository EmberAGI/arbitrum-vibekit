import type { ExecutionEventBus } from '@a2a-js/sdk/server';
import type { Tool, TextStreamPart } from 'ai';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { StreamEventHandler } from './StreamEventHandler.js';

type MockedFn<T extends (...args: unknown[]) => unknown> = ReturnType<typeof vi.fn<T>>;

type EventBusDouble = {
  publish: MockedFn<(event: unknown) => void>;
  finished: MockedFn<() => void>;
  on: MockedFn<() => EventBusDouble>;
  off: MockedFn<() => EventBusDouble>;
  once: MockedFn<() => EventBusDouble>;
  removeAllListeners: MockedFn<() => EventBusDouble>;
};

type LoggerDouble = {
  debug: MockedFn<() => void>;
  info: MockedFn<() => void>;
  error: MockedFn<() => void>;
};

type LoggerModuleDouble = {
  Logger: {
    getInstance: MockedFn<(...args: unknown[]) => LoggerDouble>;
  };
};

type ArtifactManagerDouble = {
  createStreamingArtifact: MockedFn<(...args: unknown[]) => { kind: string; lastChunk: boolean }>;
  createToolCallArtifact: MockedFn<(...args: unknown[]) => { kind: string }>;
  createToolResultArtifact: MockedFn<(...args: unknown[]) => { kind: string }>;
};

type StreamEventHandlerDouble = {
  handleStreamEvent: MockedFn<(...args: unknown[]) => void>;
};

type SetupOverrides = {
  artifactManager?: ArtifactManagerDouble;
  streamEventHandler?: StreamEventHandlerDouble;
};

type SetupOptions = SetupOverrides & {
  useRealStreamEventHandler?: boolean;
};

function loggerMockFactory(): LoggerModuleDouble {
  return {
    Logger: {
      getInstance: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
      })),
    },
  };
}

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type StreamProcessorModule = typeof import('./StreamProcessor.js');

type StreamProcessorInstance = InstanceType<StreamProcessorModule['StreamProcessor']>;

type ArtifactEvent = {
  kind: string;
  lastChunk?: boolean;
};

type StatusMessagePart = {
  kind: string;
  text: string;
};

type StatusUpdateEvent = {
  kind: 'status-update';
  taskId?: string;
  contextId?: string;
  status: {
    state: string;
    timestamp?: string;
    message?: {
      kind: string;
      role?: string;
      parts: StatusMessagePart[];
      referenceTaskIds?: string[];
      metadata?: Record<string, unknown>;
    };
  };
  final?: boolean;
};

vi.mock('../../../utils/logger.js', loggerMockFactory);
vi.mock('./ArtifactManager.js', () => ({
  ArtifactManager: vi.fn(),
}));
vi.mock('./StreamEventHandler.js', () => ({
  StreamEventHandler: vi.fn(),
}));

const createEventBus = (): EventBusDouble => {
  const eventBus: EventBusDouble = {
    publish: vi.fn(),
    finished: vi.fn(),
    on: vi.fn<() => EventBusDouble>(() => eventBus),
    off: vi.fn<() => EventBusDouble>(() => eventBus),
    once: vi.fn<() => EventBusDouble>(() => eventBus),
    removeAllListeners: vi.fn<() => EventBusDouble>(() => eventBus),
  };
  return eventBus;
};

async function setupProcessor(options: SetupOptions = {}): Promise<{
  processor: StreamProcessorInstance;
  artifactManager: ArtifactManagerDouble;
  streamEventHandler: StreamEventHandlerDouble | StreamEventHandler;
}> {
  const [{ ArtifactManager }, { StreamEventHandler }] = await Promise.all([
    import('./ArtifactManager.js'),
    import('./StreamEventHandler.js'),
  ]);

  const artifactManagerDouble: ArtifactManagerDouble = options.artifactManager ?? {
    createStreamingArtifact: vi.fn(() => ({ kind: 'artifact-update', lastChunk: false })),
    createToolCallArtifact: vi.fn(() => ({ kind: 'artifact-update' })),
    createToolResultArtifact: vi.fn(() => ({ kind: 'artifact-update' })),
  };

  const artifactManagerCtor = vi.mocked(ArtifactManager);
  artifactManagerCtor.mockReset();
  artifactManagerCtor.mockImplementation(() => artifactManagerDouble as never);

  const streamEventHandlerCtor = vi.mocked(StreamEventHandler);
  streamEventHandlerCtor.mockReset();
  let streamEventHandlerInstance: StreamEventHandlerDouble | StreamEventHandler;

  if (options.useRealStreamEventHandler) {
    const actualStreamEventHandlerModule = await vi.importActual<{
      StreamEventHandler: typeof StreamEventHandler;
    }>('./StreamEventHandler.js');

    streamEventHandlerCtor.mockImplementation(() => {
      const instance = new actualStreamEventHandlerModule.StreamEventHandler();
      streamEventHandlerInstance = instance;
      return instance as never;
    });
  } else {
    const streamEventHandlerDouble: StreamEventHandlerDouble = options.streamEventHandler ?? {
      handleStreamEvent: vi.fn(),
    };

    streamEventHandlerCtor.mockImplementation(() => {
      streamEventHandlerInstance = streamEventHandlerDouble;
      return streamEventHandlerDouble as never;
    });
  }

  const module = await import('./StreamProcessor.js');
  const processor = new module.StreamProcessor();

  return {
    processor,
    artifactManager: artifactManagerDouble,
    streamEventHandler: streamEventHandlerInstance!,
  };
}

describe('StreamProcessor (unit)', () => {
  let eventBus: EventBusDouble;

  beforeEach(() => {
    vi.clearAllMocks();
    eventBus = createEventBus();
  });

  it('processes text-delta events through the stream', async () => {
    const { processor } = await setupProcessor();

    async function* mockStream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
      await Promise.resolve();
      yield { type: 'text-delta', text: 'Hello' } as TextStreamPart<Record<string, Tool>>;
      yield { type: 'text-delta', text: ' world' } as TextStreamPart<Record<string, Tool>>;
    }

    await processor.processStream(mockStream(), {
      taskId: 'task-123',
      contextId: 'ctx-1',
      eventBus: eventBus as unknown as ExecutionEventBus,
    });

    expect(eventBus.publish).toHaveBeenCalled();
    expect(eventBus.finished).toHaveBeenCalledOnce();
  });

  it('handles empty streams gracefully', async () => {
    const { processor } = await setupProcessor();

    async function* emptyStream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
      await Promise.resolve();
      for (const event of [] as TextStreamPart<Record<string, Tool>>[]) {
        yield event;
      }
    }

    await processor.processStream(emptyStream(), {
      taskId: 'task-empty',
      contextId: 'ctx-empty',
      eventBus: eventBus as unknown as ExecutionEventBus,
    });

    const statusEvent = eventBus.publish.mock.calls
      .map(([event]) => event as StatusUpdateEvent)
      .find((event) => event.kind === 'status-update');

    expect(statusEvent).toBeDefined();
    const resolvedStatusEvent = statusEvent as StatusUpdateEvent;
    expect(resolvedStatusEvent.status.state).toBe('completed');
    expect(eventBus.finished).toHaveBeenCalledOnce();
  });

  it('publishes completion status after successful stream processing', async () => {
    const { processor } = await setupProcessor();

    async function* successStream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
      await Promise.resolve();
      yield { type: 'text-delta', text: 'Success' } as TextStreamPart<Record<string, Tool>>;
    }

    await processor.processStream(successStream(), {
      taskId: 'task-complete',
      contextId: 'ctx-complete',
      eventBus: eventBus as unknown as ExecutionEventBus,
    });

    const statusEvent = eventBus.publish.mock.calls
      .map(([event]) => event as StatusUpdateEvent)
      .find((event) => event.kind === 'status-update');

    expect(statusEvent).toBeDefined();
    const resolvedStatusEvent = statusEvent as StatusUpdateEvent;
    expect(resolvedStatusEvent.taskId).toBe('task-complete');
    expect(resolvedStatusEvent.contextId).toBe('ctx-complete');
    expect(resolvedStatusEvent.status.state).toBe('completed');
    expect(resolvedStatusEvent.status.timestamp).toEqual(expect.any(String));
    expect(resolvedStatusEvent.final).toBe(true);
  });

  it('handles stream errors and publishes failure status', async () => {
    const { processor } = await setupProcessor();

    async function* errorStream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
      await Promise.resolve();
      yield { type: 'text-delta', text: 'Starting...' } as TextStreamPart<Record<string, Tool>>;
      throw new Error('Stream processing failed');
    }

    await processor.processStream(errorStream(), {
      taskId: 'task-error',
      contextId: 'ctx-error',
      eventBus: eventBus as unknown as ExecutionEventBus,
    });

    const statusEvent = eventBus.publish.mock.calls
      .map(([event]) => event as StatusUpdateEvent)
      .find((event) => event.kind === 'status-update');

    expect(statusEvent).toBeDefined();
    const resolvedStatusEvent = statusEvent as StatusUpdateEvent;
    expect(resolvedStatusEvent.taskId).toBe('task-error');
    expect(resolvedStatusEvent.contextId).toBe('ctx-error');
    expect(resolvedStatusEvent.status.state).toBe('failed');
    const firstStatusPart = resolvedStatusEvent.status.message?.parts?.[0];
    expect(firstStatusPart?.kind).toBe('text');
    expect(firstStatusPart?.text).toContain('Stream processing failed');
    expect(resolvedStatusEvent.final).toBe(true);
    expect(eventBus.finished).toHaveBeenCalledOnce();
  });

  it('handles non-Error exceptions gracefully', async () => {
    const { processor } = await setupProcessor();

    async function* nonErrorStream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
      await Promise.resolve();
      yield { type: 'text-delta', text: 'Starting...' } as TextStreamPart<Record<string, Tool>>;
      throw 'String error' as unknown as Error;
    }

    await processor.processStream(nonErrorStream(), {
      taskId: 'task-string-error',
      contextId: 'ctx-string-error',
      eventBus: eventBus as unknown as ExecutionEventBus,
    });

    const statusEvent = eventBus.publish.mock.calls
      .map(([event]) => event as StatusUpdateEvent)
      .find((event) => event.kind === 'status-update');

    expect(statusEvent).toBeDefined();
    const resolvedStatusEvent = statusEvent as StatusUpdateEvent;
    expect(resolvedStatusEvent.status.state).toBe('failed');
    const firstStatusPart = resolvedStatusEvent.status.message?.parts?.[0];
    expect(firstStatusPart?.kind).toBe('text');
    expect(firstStatusPart?.text).toContain('String error');
  });

  describe('workflow dispatch handling (inline execution)', () => {
    it('workflow tools execute inline and parent status updates contain unique referenceTaskIds', async () => {
      // Given: A processor with real StreamEventHandler (not mocked) to test workflow status updates
      const { processor } = await setupProcessor({
        useRealStreamEventHandler: true,
      });

      // Simulate workflow tool-result events that would come from SDK after inline execution
      const workflowToolResult1 = {
        type: 'tool-result' as const,
        toolCallId: 'call-wf-1',
        toolName: 'dispatch_workflow_trading',
        output: {
          result: [{ kind: 'text' as const, text: 'Trading workflow dispatched' }],
          taskId: 'task-child-trading',
          metadata: {
            workflowName: 'Token Trading',
            description: 'Execute token trades on DEXs',
            pluginId: 'trading',
          },
        },
      };

      async function* workflowStream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
        await Promise.resolve();
        // Tool call event (workflow tool)
        yield { type: 'tool-call', toolName: 'dispatch_workflow_trading' } as TextStreamPart<
          Record<string, Tool>
        >;
        // Tool result event (simulating SDK returning workflow dispatch result)
        yield workflowToolResult1 as unknown as TextStreamPart<Record<string, Tool>>;
      }

      // When: The stream is processed
      await processor.processStream(workflowStream(), {
        taskId: 'task-parent',
        contextId: 'ctx-workflow',
        eventBus: eventBus as unknown as ExecutionEventBus,
      });

      // Then: Status update with referenceTaskIds should be emitted by StreamEventHandler
      const statusUpdates = eventBus.publish.mock.calls
        .map(([event]) => event as StatusUpdateEvent)
        .filter(
          (event) => event.kind === 'status-update' && event.status.message?.referenceTaskIds,
        );

      expect(statusUpdates.length).toBeGreaterThanOrEqual(1);
      const firstUpdate = statusUpdates[0];
      expect(firstUpdate?.status.message?.referenceTaskIds).toEqual(['task-child-trading']);
    });

    it('sequential workflow dispatches produce independent referenceTaskIds (no accumulation)', async () => {
      // Given: A processor with real StreamEventHandler
      const { processor } = await setupProcessor({
        useRealStreamEventHandler: true,
      });

      // First workflow dispatch
      const workflowToolResult1 = {
        type: 'tool-result' as const,
        toolCallId: 'call-wf-1',
        toolName: 'dispatch_workflow_trading',
        output: {
          result: [{ kind: 'text' as const, text: 'Trading workflow dispatched' }],
          taskId: 'task-child-1',
          metadata: {
            workflowName: 'Token Trading',
            description: 'Execute trades',
            pluginId: 'trading',
          },
        },
      };

      // Second workflow dispatch
      const workflowToolResult2 = {
        type: 'tool-result' as const,
        toolCallId: 'call-wf-2',
        toolName: 'dispatch_workflow_lending',
        output: {
          result: [{ kind: 'text' as const, text: 'Lending workflow dispatched' }],
          taskId: 'task-child-2',
          metadata: {
            workflowName: 'Lending Protocol',
            description: 'Manage lending',
            pluginId: 'lending',
          },
        },
      };

      async function* sequentialWorkflowStream(): AsyncIterable<
        TextStreamPart<Record<string, Tool>>
      > {
        await Promise.resolve();
        // First workflow
        yield { type: 'tool-call', toolName: 'dispatch_workflow_trading' } as TextStreamPart<
          Record<string, Tool>
        >;
        yield workflowToolResult1 as unknown as TextStreamPart<Record<string, Tool>>;

        // Second workflow
        yield { type: 'tool-call', toolName: 'dispatch_workflow_lending' } as TextStreamPart<
          Record<string, Tool>
        >;
        yield workflowToolResult2 as unknown as TextStreamPart<Record<string, Tool>>;
      }

      // When: The stream with sequential workflows is processed
      await processor.processStream(sequentialWorkflowStream(), {
        taskId: 'task-parent',
        contextId: 'ctx-sequential',
        eventBus: eventBus as unknown as ExecutionEventBus,
      });

      // Then: Each workflow dispatch should get its own unique referenceTaskIds (NO ACCUMULATION)
      const statusUpdates = eventBus.publish.mock.calls
        .map(([event]) => event as StatusUpdateEvent)
        .filter(
          (event) => event.kind === 'status-update' && event.status.message?.referenceTaskIds,
        );

      expect(statusUpdates.length).toBeGreaterThanOrEqual(2);

      // Critical assertion: Each status update must contain ONLY the new child task ID
      const firstUpdate = statusUpdates.find((u) =>
        u.status.message?.referenceTaskIds?.includes('task-child-1'),
      );
      const secondUpdate = statusUpdates.find((u) =>
        u.status.message?.referenceTaskIds?.includes('task-child-2'),
      );

      expect(firstUpdate?.status.message?.referenceTaskIds).toEqual(['task-child-1']);
      expect(secondUpdate?.status.message?.referenceTaskIds).toEqual(['task-child-2']);

      // Verify NO accumulation: second update should NOT contain first child ID
      expect(secondUpdate?.status.message?.referenceTaskIds).not.toContain('task-child-1');
    });

    it('non-workflow tool calls do not trigger parent status updates', async () => {
      // Given: A processor with real StreamEventHandler
      const { processor } = await setupProcessor({
        useRealStreamEventHandler: true,
      });

      const regularToolResult = {
        type: 'tool-result' as const,
        toolCallId: 'call-tool-1',
        toolName: 'get_price',
        output: { price: '1234.56', symbol: 'ETH' },
      };

      async function* regularToolStream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
        await Promise.resolve();
        yield { type: 'tool-call', toolName: 'get_price' } as TextStreamPart<Record<string, Tool>>;
        yield regularToolResult as unknown as TextStreamPart<Record<string, Tool>>;
      }

      // When: The stream with regular tool is processed
      await processor.processStream(regularToolStream(), {
        taskId: 'task-regular',
        contextId: 'ctx-regular',
        eventBus: eventBus as unknown as ExecutionEventBus,
      });

      // Then: No status update with referenceTaskIds should be emitted
      const statusUpdatesWithRefs = eventBus.publish.mock.calls
        .map(([event]) => event as StatusUpdateEvent)
        .filter(
          (event) => event.kind === 'status-update' && event.status.message?.referenceTaskIds,
        );

      expect(statusUpdatesWithRefs).toHaveLength(0);
    });
  });

  it('calls finished() exactly once for each scenario', async () => {
    const scenarios: Array<() => AsyncIterable<TextStreamPart<Record<string, Tool>>>> = [
      async function* success(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
        await Promise.resolve();
        yield { type: 'text-delta', text: 'test' } as TextStreamPart<Record<string, Tool>>;
      },
      async function* error(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
        await Promise.resolve();
        yield { type: 'text-delta', text: 'Starting...' } as TextStreamPart<Record<string, Tool>>;
        throw new Error('test error');
      },
      async function* empty(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
        await Promise.resolve();
        for (const event of [] as TextStreamPart<Record<string, Tool>>[]) {
          yield event;
        }
      },
    ];

    for (const createStream of scenarios) {
      const localEventBus = createEventBus();
      const { processor } = await setupProcessor();

      await processor.processStream(createStream(), {
        taskId: 'task-test',
        contextId: 'ctx-test',
        eventBus: localEventBus as unknown as ExecutionEventBus,
      });

      expect(localEventBus.finished).toHaveBeenCalledOnce();
    }
  });
});

describe('StreamProcessor artifact flushing', () => {
  const createRealProcessor = async (): Promise<StreamProcessorInstance> => {
    vi.resetModules();
    vi.doMock('../../../utils/logger.js', loggerMockFactory);
    vi.doUnmock('./StreamEventHandler.js');
    vi.doUnmock('./ArtifactManager.js');

    const module = await import('./StreamProcessor.js');
    return new module.StreamProcessor();
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flushes buffered artifacts when stream ends without explicit end events', async () => {
    const processor = await createRealProcessor();
    const eventBus = createEventBus();

    async function* stream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
      await Promise.resolve();
      yield { type: 'text-delta', text: 'Hello' } as TextStreamPart<Record<string, Tool>>;
      yield { type: 'text-delta', text: ' world' } as TextStreamPart<Record<string, Tool>>;
    }

    await processor.processStream(stream(), {
      taskId: 'task-flush',
      contextId: 'ctx-flush',
      eventBus: eventBus as unknown as ExecutionEventBus,
    });

    const artifactEvents = eventBus.publish.mock.calls
      .map(([event]) => event as ArtifactEvent)
      .filter((event) => event.kind === 'artifact-update');

    expect(artifactEvents).not.toHaveLength(0);
    expect(artifactEvents[artifactEvents.length - 1]).toEqual(
      expect.objectContaining({ lastChunk: true }),
    );
  });

  it('does not publish artifact updates when no buffered artifacts exist', async () => {
    const processor = await createRealProcessor();
    const eventBus = createEventBus();

    async function* emptyStream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
      await Promise.resolve();
      for (const event of [] as TextStreamPart<Record<string, Tool>>[]) {
        yield event;
      }
    }

    await processor.processStream(emptyStream(), {
      taskId: 'task-no-buffer',
      contextId: 'ctx-no-buffer',
      eventBus: eventBus as unknown as ExecutionEventBus,
    });

    const artifactEvents = eventBus.publish.mock.calls
      .map(([event]) => event as ArtifactEvent)
      .filter((event) => event.kind === 'artifact-update');

    expect(artifactEvents).toHaveLength(0);
  });
});

describe('StreamProcessor reasoning block ordering', () => {
  let eventBus: EventBusDouble;

  const createRealProcessor = async (): Promise<StreamProcessorInstance> => {
    vi.resetModules();
    vi.doMock('../../../utils/logger.js', loggerMockFactory);
    vi.doUnmock('./StreamEventHandler.js');
    vi.doUnmock('./ArtifactManager.js');

    const module = await import('./StreamProcessor.js');
    return new module.StreamProcessor();
  };

  beforeEach(() => {
    vi.clearAllMocks();
    eventBus = createEventBus();
  });

  it('builds AssistantModelMessage with reasoning before text content', async () => {
    // Given: A stream with both reasoning and text content
    const processor = await createRealProcessor();

    async function* streamWithReasoning(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
      await Promise.resolve();
      yield {
        type: 'reasoning-delta',
        id: 'reasoning-1',
        text: 'Let me think about this...',
      } as TextStreamPart<Record<string, Tool>>;
      yield {
        type: 'reasoning-delta',
        id: 'reasoning-2',
        text: ' Step by step.',
      } as TextStreamPart<Record<string, Tool>>;
      yield { type: 'reasoning-end' } as TextStreamPart<Record<string, Tool>>;
      yield { type: 'text-delta', text: 'Here is my response' } as TextStreamPart<
        Record<string, Tool>
      >;
      yield { type: 'text-end' } as TextStreamPart<Record<string, Tool>>;
    }

    // When: The stream is processed
    const assistantMessage = await processor.processStream(streamWithReasoning(), {
      taskId: 'task-reasoning',
      contextId: 'ctx-reasoning',
      eventBus: eventBus as unknown as ExecutionEventBus,
    });

    // Then: AssistantModelMessage should have reasoning first, then text
    expect(assistantMessage).not.toBeNull();
    expect(assistantMessage?.role).toBe('assistant');
    expect(Array.isArray(assistantMessage?.content)).toBe(true);

    const content = assistantMessage?.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(2);

    // Reasoning block must come first (required by Anthropic)
    expect(content[0]).toEqual({
      type: 'text',
      text: 'Let me think about this... Step by step.',
    });

    // Text content comes second
    expect(content[1]).toEqual({
      type: 'text',
      text: 'Here is my response',
    });
  });

  it('returns null when stream has no content', async () => {
    // Given: An empty stream
    const processor = await createRealProcessor();

    async function* emptyStream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
      await Promise.resolve();
      for (const event of [] as TextStreamPart<Record<string, Tool>>[]) {
        yield event;
      }
    }

    // When: The stream is processed
    const assistantMessage = await processor.processStream(emptyStream(), {
      taskId: 'task-empty',
      contextId: 'ctx-empty',
      eventBus: eventBus as unknown as ExecutionEventBus,
    });

    // Then: Should return null (no message to store)
    expect(assistantMessage).toBeNull();
  });

  it('builds message with only text when no reasoning present', async () => {
    // Given: A stream with only text (no reasoning)
    const processor = await createRealProcessor();

    async function* textOnlyStream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
      await Promise.resolve();
      yield { type: 'text-delta', text: 'Simple response' } as TextStreamPart<Record<string, Tool>>;
      yield { type: 'text-end' } as TextStreamPart<Record<string, Tool>>;
    }

    // When: The stream is processed
    const assistantMessage = await processor.processStream(textOnlyStream(), {
      taskId: 'task-text-only',
      contextId: 'ctx-text-only',
      eventBus: eventBus as unknown as ExecutionEventBus,
    });

    // Then: Should have only one content block
    expect(assistantMessage).not.toBeNull();
    const content = assistantMessage?.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    expect(content[0]).toEqual({
      type: 'text',
      text: 'Simple response',
    });
  });

  it('builds message with only reasoning when no text present', async () => {
    // Given: A stream with only reasoning (no text)
    const processor = await createRealProcessor();

    async function* reasoningOnlyStream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
      await Promise.resolve();
      yield { type: 'reasoning-delta', id: 'reasoning-3', text: 'Just thinking' } as TextStreamPart<
        Record<string, Tool>
      >;
      yield { type: 'reasoning-end' } as TextStreamPart<Record<string, Tool>>;
    }

    // When: The stream is processed
    const assistantMessage = await processor.processStream(reasoningOnlyStream(), {
      taskId: 'task-reasoning-only',
      contextId: 'ctx-reasoning-only',
      eventBus: eventBus as unknown as ExecutionEventBus,
    });

    // Then: Should have only one content block
    expect(assistantMessage).not.toBeNull();
    const content = assistantMessage?.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    expect(content[0]).toEqual({
      type: 'text',
      text: 'Just thinking',
    });
  });
});

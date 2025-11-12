/**
 * Unit tests for AIHandler
 * Tests the streaming fix that ensures:
 * 1. No throwing on unknown session context IDs
 * 2. History only read/written if session exists
 * 3. No duplicate user messages in provider input
 */

import type { TextStreamPart, Tool } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MockContextManager } from '../../../tests/utils/mocks/context-manager.mock.js';
import { RecordingEventBus } from '../../../tests/utils/mocks/event-bus.mock.js';
import type { AIService } from '../../ai/service.js';
import type { ContextManager } from '../sessions/manager.js';

import { AIHandler } from './aiHandler.js';
import type { WorkflowHandler } from './workflowHandler.js';

type AIServiceDouble = {
  streamMessage: ReturnType<
    typeof vi.fn<
      (
        context: { message: string; contextId: string; history: unknown[] },
        options: { tools: unknown },
      ) => AsyncIterable<TextStreamPart<Record<string, Tool>>>
    >
  >;
};

type WorkflowHandlerDouble = {
  dispatchWorkflow: ReturnType<
    typeof vi.fn<
      (name: string, args: unknown, contextId: string, eventBus: unknown) => Promise<unknown>
    >
  >;
};

describe('AIHandler - streaming fix', () => {
  let aiHandler: AIHandler;
  let mockAIService: AIServiceDouble;
  let mockContextManager: MockContextManager;
  let mockWorkflowHandler: WorkflowHandlerDouble;
  let eventBus: RecordingEventBus;

  beforeEach(() => {
    // Clear all mocks first
    vi.clearAllMocks();

    // Create mock AI service with streaming support
    mockAIService = {
      streamMessage: vi.fn(async function* () {
        await Promise.resolve();
        yield { type: 'text-delta', text: 'Test response' } as TextStreamPart<Record<string, Tool>>;
      }),
    };

    // Create mock session manager and reset it
    mockContextManager = new MockContextManager();
    mockContextManager.reset();

    // Create mock workflow handler
    mockWorkflowHandler = {
      dispatchWorkflow: vi.fn(() => Promise.resolve({})),
    };

    // Create event bus
    eventBus = new RecordingEventBus();

    // Create AIHandler instance
    aiHandler = new AIHandler(
      mockAIService as unknown as AIService,
      mockWorkflowHandler as unknown as WorkflowHandler,
      mockContextManager as unknown as ContextManager,
    );
  });

  describe('handleStreamingAIProcessing - session handling', () => {
    it('starts streaming when session does not exist (no throw)', async () => {
      // Given: Unknown contextId (no session)
      const contextId = 'unknown-ctx';
      const taskId = 'task-1';
      const message = 'Hello';

      // When: handleStreamingAIProcessing is called
      aiHandler.handleStreamingAIProcessing(message, contextId, taskId, eventBus, undefined);

      // Wait for async stream to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Then: Stream starts successfully with empty history, no error
      expect(mockAIService.streamMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          message,
          contextId,
          history: [],
        }),
        expect.objectContaining({
          tools: expect.anything(),
        }),
      );
    });

    it('retrieves existing conversation history when session exists', async () => {
      // Given: Session with 2 previous messages in history
      const contextId = 'existing-ctx-isolated';
      const taskId = 'task-2';
      const message = 'Follow-up question';

      // Create fresh session with history
      const freshContextManager = new MockContextManager();
      freshContextManager.getOrCreateContext(contextId);
      freshContextManager.addToHistory(contextId, {
        role: 'user',
        content: 'Previous user message',
      });
      freshContextManager.addToHistory(contextId, {
        role: 'assistant',
        content: 'Previous assistant response',
      });

      // Create AIHandler with this specific session manager
      const isolatedHandler = new AIHandler(
        mockAIService as unknown as AIService,
        mockWorkflowHandler as unknown as WorkflowHandler,
        freshContextManager as unknown as ContextManager,
      );

      // When: handleStreamingAIProcessing is called
      isolatedHandler.handleStreamingAIProcessing(message, contextId, taskId, eventBus, undefined);

      // Then: AI service receives history array with the prior messages
      expect(mockAIService.streamMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          message,
          contextId,
          history: expect.arrayContaining([
            expect.objectContaining({ role: 'user', content: 'Previous user message' }),
            expect.objectContaining({ role: 'assistant', content: 'Previous assistant response' }),
          ]),
        }),
        expect.objectContaining({
          tools: expect.anything(),
        }),
      );

      const [context] = mockAIService.streamMessage.mock.calls[0] ?? [];
      if (context) {
        const typedContext = context as { history?: Array<{ role: string; content: string }> };
        const historySnapshot = [...(typedContext.history ?? [])];
        expect(historySnapshot).toHaveLength(2);
        expect(historySnapshot[0]).toEqual(
          expect.objectContaining({ role: 'user', content: 'Previous user message' }),
        );
        expect(historySnapshot[1]).toEqual(
          expect.objectContaining({ role: 'assistant', content: 'Previous assistant response' }),
        );
      }
    });

    it('uses empty history when session does not exist', async () => {
      // Given: Unknown contextId (no session)
      const contextId = 'new-ctx';
      const taskId = 'task-3';
      const message = 'First message';

      // When: handleStreamingAIProcessing is called
      aiHandler.handleStreamingAIProcessing(message, contextId, taskId, eventBus, undefined);

      // Wait for async stream to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Then: AI service receives empty history array
      expect(mockAIService.streamMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          message,
          contextId,
          history: [],
        }),
        expect.objectContaining({
          tools: expect.anything(),
        }),
      );
    });
  });

  describe('handleStreamingAIProcessing - history writes', () => {
    it('adds user and assistant messages to history after successful stream completion', async () => {
      // Given: Existing session, successful stream
      const contextId = 'ctx-success';
      const taskId = 'task-4';
      const message = 'User question';

      // Create session
      mockContextManager.getOrCreateContext(contextId);

      // Mock stream that completes successfully
      mockAIService.streamMessage = vi.fn(async function* () {
        await Promise.resolve();
        yield { type: 'text-delta', text: 'AI response text' } as TextStreamPart<
          Record<string, Tool>
        >;
      });

      // When: Stream completes
      aiHandler.handleStreamingAIProcessing(message, contextId, taskId, eventBus, undefined);

      // Wait for stream processing to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then: Session history contains new user message + assistant response
      const history = mockContextManager.getHistory(contextId);
      expect(history.length).toBeGreaterThanOrEqual(2);

      // User message was added
      const userMessage = history.find((msg) => msg.role === 'user' && msg.content === message);
      expect(userMessage).toBeDefined();

      // Assistant message was added
      const assistantMessage = history.find((msg) => msg.role === 'assistant');
      expect(assistantMessage).toBeDefined();
    });

    it('does not write to history when session does not exist', async () => {
      // Given: Unknown contextId (no session), successful stream
      const contextId = 'unknown-ctx-no-write';
      const taskId = 'task-5';
      const message = 'Message without session';

      // Mock stream that completes successfully
      mockAIService.streamMessage = vi.fn(async function* () {
        await Promise.resolve();
        yield { type: 'text-delta', text: 'Response' } as TextStreamPart<Record<string, Tool>>;
      });

      // When: Stream completes
      aiHandler.handleStreamingAIProcessing(message, contextId, taskId, eventBus, undefined);

      // Wait for stream processing to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then: No history exists for this context
      const history = mockContextManager.getHistory(contextId);
      expect(history).toHaveLength(0);
    });

    it('does not write to history when stream fails', async () => {
      // Given: Existing session, stream that throws error
      const contextId = 'ctx-error-isolated';
      const taskId = 'task-6';
      const message = 'This will fail';

      // Create fresh session manager for this test
      const freshContextManager = new MockContextManager();
      freshContextManager.getOrCreateContext(contextId);

      // Mock stream that fails
      const failingAIService = {
        streamMessage: vi.fn(async function* () {
          await Promise.resolve();
          yield { type: 'text-delta', text: 'Starting...' } as TextStreamPart<Record<string, Tool>>;
          throw new Error('Stream processing failed');
        }),
      };

      // Create isolated AIHandler
      const isolatedHandler = new AIHandler(
        failingAIService as unknown as AIService,
        mockWorkflowHandler as unknown as WorkflowHandler,
        freshContextManager as unknown as ContextManager,
      );

      // When: Stream fails
      isolatedHandler.handleStreamingAIProcessing(message, contextId, taskId, eventBus, undefined);

      // Wait for stream processing to complete/fail
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then: Session history retains only the original user message and no assistant content
      const history = freshContextManager.getHistory(contextId);
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(expect.objectContaining({ role: 'user', content: message }));
    });
  });

  describe('handleStreamingAIProcessing - no duplicate messages', () => {
    it('AI service input does not contain duplicate user content', async () => {
      // Given: New user message
      const contextId = 'ctx-no-dup-isolated';
      const taskId = 'task-7';
      const message = 'Unique message';

      // Create fresh session manager with empty history
      const freshContextManager = new MockContextManager();
      freshContextManager.getOrCreateContext(contextId);

      // Create fresh AI service mock
      const freshAIService = {
        streamMessage: vi.fn(async function* () {
          await Promise.resolve();
          yield { type: 'text-delta', text: 'Response' } as TextStreamPart<Record<string, Tool>>;
        }),
      };

      // Create isolated AIHandler
      const isolatedHandler = new AIHandler(
        freshAIService as unknown as AIService,
        mockWorkflowHandler as unknown as WorkflowHandler,
        freshContextManager as unknown as ContextManager,
      );

      // When: handleStreamingAIProcessing is called
      isolatedHandler.handleStreamingAIProcessing(message, contextId, taskId, eventBus, undefined);

      // Then: AI service receives message exactly once (not duplicated in history at call time)
      type CallArgs = [
        { message: string; contextId: string; history: unknown[] },
        { tools: unknown },
      ];
      const callArgs = freshAIService.streamMessage.mock.calls[0] as CallArgs | undefined;
      expect(callArgs).toBeDefined();

      if (callArgs) {
        const [context] = callArgs;

        // Current message should be in the message field
        expect(context.message).toBe(message);

        // History should not contain the current message (it's not added until after stream completes)
        const historySnapshot = [...(context.history as Array<{ role: string; content: string }>)];
        const duplicateInHistory = historySnapshot.some((msg) => msg.content === message);
        expect(duplicateInHistory).toBe(false);

        // Total occurrences of the message should be exactly 1 (in the message field only)
        const messageCount =
          (context.message === message ? 1 : 0) +
          historySnapshot.filter((msg) => msg.content === message).length;
        expect(messageCount).toBe(1);
      }
    });
  });
});

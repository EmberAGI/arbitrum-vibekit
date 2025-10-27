/**
 * Integration tests for AI Handler conversation history management
 *
 * Tests that AIHandler correctly manages conversation history through the ContextManager
 * after streaming AI processing completes. Uses real ContextManager to validate behavior.
 *
 * @id TEST-CTX-HIST-001
 */

import type { Task, TaskStatusUpdateEvent } from '@a2a-js/sdk';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { AIHandler } from '../../src/a2a/handlers/aiHandler.js';
import { ContextManager } from '../../src/a2a/sessions/manager.js';
import type { AIService } from '../../src/ai/service.js';
import { WorkflowRuntime } from '../../src/workflows/runtime.js';
import { waitForWorkflowState } from '../utils/lifecycle.js';
import { StubAIService } from '../utils/mocks/ai-service.mock.js';
import { RecordingEventBusManager } from '../utils/mocks/event-bus.mock.js';

function getStatusUpdates(bus: unknown): TaskStatusUpdateEvent[] {
  const b = bus as { findEventsByKind?: (kind: 'status-update') => unknown[] } | undefined;
  return (b?.findEventsByKind?.('status-update') as TaskStatusUpdateEvent[]) ?? [];
}

function getTasks(bus: unknown): Task[] {
  const b = bus as { findEventsByKind?: (kind: 'task') => unknown[] } | undefined;
  return (b?.findEventsByKind?.('task') as Task[]) ?? [];
}

describe('AIHandler Context History Integration', () => {
  let aiHandler: AIHandler;
  let aiService: StubAIService;
  let contextManager: ContextManager;
  let eventBusManager: RecordingEventBusManager;
  let workflowRuntime: WorkflowRuntime;

  beforeEach(async () => {
    // Use real ContextManager for history management
    contextManager = new ContextManager();
    aiService = new StubAIService();
    eventBusManager = new RecordingEventBusManager();
    workflowRuntime = new WorkflowRuntime();

    // Dynamically import AIHandler and its dependencies to avoid module resolution issues
    const { AIHandler: AIHandlerClass } = await import('../../src/a2a/handlers/aiHandler.js');
    const { WorkflowHandler } = await import('../../src/a2a/handlers/workflowHandler.js');
    const { InMemoryTaskStore } = await import('@a2a-js/sdk/server');

    const workflowHandler = new WorkflowHandler(
      workflowRuntime,
      contextManager,
      eventBusManager,
      new InMemoryTaskStore(),
    );

    aiHandler = new AIHandlerClass(
      aiService as unknown as AIService,
      workflowHandler,
      contextManager,
    );
  });

  it('should append user and assistant messages to history after streaming completes', async () => {
    // Given: A context exists with empty history
    const contextId = 'ctx-history-test-1';
    contextManager.createContextWithId(contextId);
    const initialHistory = contextManager.getHistory(contextId);
    expect(initialHistory).toEqual([]);

    // Given: AI service will return a simple text response
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'Hello! How can I help you today?',
      },
    ]);

    const taskId = 'task-history-1';
    const messageContent = 'Hello, AI!';
    const eventBus = eventBusManager.createOrGetByTaskId(taskId);

    // When: Handle streaming AI processing
    aiHandler.handleStreamingAIProcessing(messageContent, contextId, taskId, eventBus);

    // Then: Wait for streaming to complete
    const recordingBus = eventBusManager.getRecordingBus(taskId);
    await waitForWorkflowState(() => getStatusUpdates(recordingBus), taskId, ['completed']);

    // Wait a bit more for the promise to resolve and append to history
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Then: History should contain both user and assistant messages
    const history = contextManager.getHistory(contextId);
    expect(history).toHaveLength(2);

    // Then: First message should be from user
    expect(history[0]).toMatchObject({
      role: 'user',
      content: messageContent,
    });

    // Then: Second message should be from assistant
    expect(history[1]).toMatchObject({
      role: 'assistant',
    });
    expect(history[1]?.content).toBeDefined();
  });

  it('should preserve message ordering across multiple turns', async () => {
    // Given: A context exists
    const contextId = 'ctx-history-order';
    contextManager.createContextWithId(contextId);

    // Given: First AI response
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'First response',
      },
    ]);

    const task1Id = 'task-order-1';
    const eventBus1 = eventBusManager.createOrGetByTaskId(task1Id);

    // When: First turn
    aiHandler.handleStreamingAIProcessing('First message', contextId, task1Id, eventBus1);
    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(task1Id)),
      task1Id,
      ['completed'],
    );

    // Given: Second AI response
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'Second response',
      },
    ]);

    const task2Id = 'task-order-2';
    const eventBus2 = eventBusManager.createOrGetByTaskId(task2Id);

    // When: Second turn
    aiHandler.handleStreamingAIProcessing('Second message', contextId, task2Id, eventBus2);
    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(task2Id)),
      task2Id,
      ['completed'],
    );

    // Wait for promises to resolve
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Then: History should preserve ordering: [user1, assistant1, user2, assistant2]
    const history = contextManager.getHistory(contextId);
    expect(history).toHaveLength(4);

    expect(history[0]?.role).toBe('user');
    expect(history[0]?.content).toBe('First message');

    expect(history[1]?.role).toBe('assistant');

    expect(history[2]?.role).toBe('user');
    expect(history[2]?.content).toBe('Second message');

    expect(history[3]?.role).toBe('assistant');
  });

  it('should update lastActivity timestamp after appending to history', async () => {
    // Given: A context exists
    const contextId = 'ctx-last-activity';
    const context = contextManager.createContextWithId(contextId);
    const initialActivity = context.lastActivity;

    // Wait to ensure timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Given: AI service response
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'Response',
      },
    ]);

    const taskId = 'task-activity-1';
    const eventBus = eventBusManager.createOrGetByTaskId(taskId);

    // When: Handle streaming
    aiHandler.handleStreamingAIProcessing('Message', contextId, taskId, eventBus);
    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(taskId)),
      taskId,
      ['completed'],
    );

    // Then: lastActivity should be updated
    const updatedContext = contextManager.getContext(contextId);
    expect(updatedContext?.lastActivity.getTime()).toBeGreaterThan(initialActivity.getTime());
  });

  it('should feed prior history to AI on subsequent turns', async () => {
    // Given: A context with existing history from first turn
    const contextId = 'ctx-history-feedback';
    contextManager.createContextWithId(contextId);

    // Given: First turn
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'I remember that.',
      },
    ]);

    const task1Id = 'task-feedback-1';
    const eventBus1 = eventBusManager.createOrGetByTaskId(task1Id);

    aiHandler.handleStreamingAIProcessing('Remember this', contextId, task1Id, eventBus1);
    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(task1Id)),
      task1Id,
      ['completed'],
    );

    // Spy on AI service to verify history is passed
    const streamMessageSpy = vi.spyOn(aiService, 'streamMessage');

    // Given: Second turn response
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'Based on what you told me...',
      },
    ]);

    const task2Id = 'task-feedback-2';
    const eventBus2 = eventBusManager.createOrGetByTaskId(task2Id);

    // When: Second turn
    aiHandler.handleStreamingAIProcessing('What did I say?', contextId, task2Id, eventBus2);
    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(task2Id)),
      task2Id,
      ['completed'],
    );

    // Then: AI should have been called with history from first turn
    expect(streamMessageSpy).toHaveBeenCalled();
    const lastCall = streamMessageSpy.mock.calls[streamMessageSpy.mock.calls.length - 1];
    expect(lastCall).toBeDefined();

    const [messageOptions] = lastCall ?? [];
    expect(messageOptions?.history).toBeDefined();
    expect(messageOptions?.history?.length).toBeGreaterThanOrEqual(2);
  });

  it('should not append to history if context is deleted before stream completes', async () => {
    // Given: A context exists
    const contextId = 'ctx-delete-before-complete';
    contextManager.createContextWithId(contextId);

    // Given: AI service with delayed response
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'This should not be saved',
      },
    ]);

    const taskId = 'task-delete-1';
    const eventBus = eventBusManager.createOrGetByTaskId(taskId);

    // When: Start streaming
    aiHandler.handleStreamingAIProcessing('Message', contextId, taskId, eventBus);

    // When: Delete context immediately (before stream completes)
    contextManager.deleteContext(contextId);

    // Wait for stream to complete
    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(taskId)),
      taskId,
      ['completed'],
    );

    // Then: Context should not exist
    const context = contextManager.getContext(contextId);
    expect(context).toBeNull();
  });

  it('should handle empty history on first turn for unknown context', async () => {
    // Given: A context that doesn't exist yet
    const contextId = 'ctx-unknown-first-turn';

    // Note: AIHandler fetches history gracefully - returns empty array for unknown context
    // This tests the guard in aiHandler.ts:59-60

    // Given: AI service response
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'Hello!',
      },
    ]);

    const taskId = 'task-unknown-1';
    const eventBus = eventBusManager.createOrGetByTaskId(taskId);

    // When: Handle streaming for unknown context (should not throw)
    expect(() => {
      aiHandler.handleStreamingAIProcessing('First message', contextId, taskId, eventBus);
    }).not.toThrow();

    // Then: Task should be created and published
    const recordingBus = eventBusManager.getRecordingBus(taskId);
    const tasks = getTasks(recordingBus);
    expect(tasks.some((t) => t.id === taskId)).toBe(true);

    // And: AIHandler should NOT create a context implicitly
    expect(contextManager.getContext(contextId)).toBeNull();
  });

  it('should publish task event before working status update', async () => {
    // Given: A context
    const contextId = 'ctx-event-ordering';
    contextManager.createContextWithId(contextId);

    // Given: AI service with simple response
    aiService.setSimpleResponse([{ type: 'text-delta', text: 'ok' }]);

    const taskId = 'task-event-order-1';
    const eventBus = eventBusManager.createOrGetByTaskId(taskId);

    // When: Start streaming
    aiHandler.handleStreamingAIProcessing('hi', contextId, taskId, eventBus);

    // Wait for completion
    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(taskId)),
      taskId,
      ['completed'],
    );

    // Then: First published event is task, followed by working status-update
    const recordingBus = eventBusManager.getRecordingBus(taskId) as {
      published: Array<{ kind: string }>;
    };
    const kinds = (recordingBus.published || []).map((e) => e.kind);
    expect(kinds[0]).toBe('task');
    const firstStatusIndex = kinds.indexOf('status-update');
    expect(firstStatusIndex).toBeGreaterThan(0);
  });

  it('should isolate conversation history between different contexts', async () => {
    // Given: Two separate contexts
    const context1Id = 'ctx-isolation-1';
    const context2Id = 'ctx-isolation-2';
    contextManager.createContextWithId(context1Id);
    contextManager.createContextWithId(context2Id);

    // Given: First context - AI turn
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'Response for context 1',
      },
    ]);

    const task1Id = 'task-iso-1';
    const eventBus1 = eventBusManager.createOrGetByTaskId(task1Id);

    // When: First context processes message
    aiHandler.handleStreamingAIProcessing('Message to context 1', context1Id, task1Id, eventBus1);
    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(task1Id)),
      task1Id,
      ['completed'],
    );

    // Given: Second context - AI turn
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'Response for context 2',
      },
    ]);

    const task2Id = 'task-iso-2';
    const eventBus2 = eventBusManager.createOrGetByTaskId(task2Id);

    // When: Second context processes message
    aiHandler.handleStreamingAIProcessing('Message to context 2', context2Id, task2Id, eventBus2);
    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(task2Id)),
      task2Id,
      ['completed'],
    );

    // Wait for promises to resolve
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Then: Contexts should have independent histories
    const history1 = contextManager.getHistory(context1Id);
    const history2 = contextManager.getHistory(context2Id);

    expect(history1).toHaveLength(2);
    expect(history2).toHaveLength(2);

    expect(history1[0]?.content).toBe('Message to context 1');
    expect(history2[0]?.content).toBe('Message to context 2');
  });

  it('should handle assistant messages with reasoning and text content', async () => {
    // Given: A context exists
    const contextId = 'ctx-reasoning-test';
    contextManager.createContextWithId(contextId);

    // Given: AI service returns both reasoning and text
    aiService.setSimpleResponse([
      {
        type: 'reasoning-delta',
        text: 'Let me think about this...',
      },
      {
        type: 'text-delta',
        text: 'Here is my answer.',
      },
    ]);

    const taskId = 'task-reasoning-1';
    const eventBus = eventBusManager.createOrGetByTaskId(taskId);

    // When: Handle streaming
    aiHandler.handleStreamingAIProcessing('Complex question', contextId, taskId, eventBus);
    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(taskId)),
      taskId,
      ['completed'],
    );

    // Wait for promise to resolve
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Then: History should contain both messages
    const history = contextManager.getHistory(contextId);
    expect(history).toHaveLength(2);

    // Then: Assistant message should have content array with both reasoning and text
    const assistantMessage = history[1];
    expect(assistantMessage?.role).toBe('assistant');
    expect(Array.isArray(assistantMessage?.content)).toBe(true);
  });
});

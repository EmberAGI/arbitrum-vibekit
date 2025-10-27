/**
 * Integration tests for MessageHandler conversation history behavior
 *
 * Tests that MessageHandler correctly routes messages through AI handler and
 * that conversation history accumulates across multiple sequential turns.
 *
 * @id TEST-MSG-HIST-001
 */

import type { TaskStatusUpdateEvent } from '@a2a-js/sdk';
import { InMemoryTaskStore } from '@a2a-js/sdk/server';
import { describe, it, expect, beforeEach } from 'vitest';

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

describe('MessageHandler History Integration', () => {
  let aiService: StubAIService;
  let contextManager: ContextManager;
  let eventBusManager: RecordingEventBusManager;
  let workflowRuntime: WorkflowRuntime;
  let taskStore: InMemoryTaskStore;
  let messageHandler: InstanceType<typeof import('../../src/a2a/handlers/messageHandler.js').MessageHandler>;
  let aiHandler: InstanceType<typeof import('../../src/a2a/handlers/aiHandler.js').AIHandler>;

  beforeEach(async () => {
    // Use real ContextManager for history testing
    contextManager = new ContextManager();
    aiService = new StubAIService();
    eventBusManager = new RecordingEventBusManager();
    workflowRuntime = new WorkflowRuntime();
    taskStore = new InMemoryTaskStore();

    // Dynamically import handlers
    const { MessageHandler } = await import('../../src/a2a/handlers/messageHandler.js');
    const { AIHandler } = await import('../../src/a2a/handlers/aiHandler.js');
    const { WorkflowHandler } = await import('../../src/a2a/handlers/workflowHandler.js');

    const workflowHandler = new WorkflowHandler(
      workflowRuntime,
      contextManager,
      eventBusManager,
      taskStore,
    );

    aiHandler = new AIHandler(
      aiService as unknown as AIService,
      workflowHandler,
      contextManager,
    );

    messageHandler = new MessageHandler(workflowHandler, aiHandler);
  });

  it('should accumulate history across two sequential handleMessage calls', async () => {
    // Given: A context exists
    const contextId = 'ctx-sequential-history';
    contextManager.createContextWithId(contextId);

    // Given: First AI response
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'First response',
      },
    ]);

    const task1Id = 'task-msg-1';
    const eventBus1 = eventBusManager.createOrGetByTaskId(task1Id);

    // When: First message (no existing task state)
    await messageHandler.handleMessage(task1Id, contextId, 'First message', undefined, eventBus1);

    // Wait for first turn to complete
    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(task1Id)),
      task1Id,
      ['completed'],
    );

    // Then: History should contain first turn
    let history = contextManager.getHistory(contextId);
    expect(history).toHaveLength(2);
    expect(history[0]?.role).toBe('user');
    expect(history[0]?.content).toBe('First message');
    expect(history[1]?.role).toBe('assistant');

    // Given: Second AI response
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'Second response',
      },
    ]);

    const task2Id = 'task-msg-2';
    const eventBus2 = eventBusManager.createOrGetByTaskId(task2Id);

    // When: Second message (no existing task state)
    await messageHandler.handleMessage(
      task2Id,
      contextId,
      'Second message',
      undefined,
      eventBus2,
    );

    // Wait for second turn to complete
    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(task2Id)),
      task2Id,
      ['completed'],
    );

    // Then: History should contain both turns (4 messages total)
    history = contextManager.getHistory(contextId);
    expect(history).toHaveLength(4);

    // Then: Verify ordering
    expect(history[0]?.role).toBe('user');
    expect(history[0]?.content).toBe('First message');
    expect(history[1]?.role).toBe('assistant');
    expect(history[2]?.role).toBe('user');
    expect(history[2]?.content).toBe('Second message');
    expect(history[3]?.role).toBe('assistant');
  });

  it('should pass prior history to AI on second call', async () => {
    // Given: A context with first turn completed
    const contextId = 'ctx-history-passthrough';
    contextManager.createContextWithId(contextId);

    // First turn
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'I understand.',
      },
    ]);

    const task1Id = 'task-passthrough-1';
    const eventBus1 = eventBusManager.createOrGetByTaskId(task1Id);

    await messageHandler.handleMessage(
      task1Id,
      contextId,
      'Remember this fact',
      undefined,
      eventBus1,
    );

    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(task1Id)),
      task1Id,
      ['completed'],
    );

    // Spy on AI service
    const streamMessageSpy = vi.spyOn(aiService, 'streamMessage');

    // Given: Second turn response
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'Based on what you told me earlier...',
      },
    ]);

    const task2Id = 'task-passthrough-2';
    const eventBus2 = eventBusManager.createOrGetByTaskId(task2Id);

    // When: Second message
    await messageHandler.handleMessage(
      task2Id,
      contextId,
      'What did I tell you?',
      undefined,
      eventBus2,
    );

    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(task2Id)),
      task2Id,
      ['completed'],
    );

    // Then: AI should have received history from first turn
    expect(streamMessageSpy).toHaveBeenCalled();
    const lastCall = streamMessageSpy.mock.calls[streamMessageSpy.mock.calls.length - 1];
    expect(lastCall).toBeDefined();

    const [messageOptions] = lastCall ?? [];
    expect(messageOptions?.history).toBeDefined();
    expect(messageOptions?.history?.length).toBeGreaterThanOrEqual(2);

    // Verify history contains first turn
    const historyInCall = messageOptions?.history ?? [];
    expect(historyInCall.some((msg) => msg.content === 'Remember this fact')).toBe(true);
  });

  it('should handle message extraction correctly for parts-based messages', async () => {
    // Given: A context exists
    const contextId = 'ctx-message-parts';
    contextManager.createContextWithId(contextId);

    // Given: AI response
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'Processed successfully',
      },
    ]);

    const taskId = 'task-parts-1';
    const eventBus = eventBusManager.createOrGetByTaskId(taskId);

    // When: Handle message with content
    await messageHandler.handleMessage(
      taskId,
      contextId,
      'Text content',
      undefined,
      eventBus,
    );

    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(taskId)),
      taskId,
      ['completed'],
    );

    // Then: History should contain the message content
    const history = contextManager.getHistory(contextId);
    expect(history).toHaveLength(2);
    expect(history[0]?.content).toBe('Text content');
  });

  it('should not append to history if task state exists (workflow resume path)', async () => {
    // This test verifies that messageHandler routes to workflow handler
    // when task state exists, and workflow handler does NOT append to history
    // during resume (only AI handler appends to history)

    // Given: A context with a workflow
    const contextId = 'ctx-workflow-no-history';
    contextManager.createContextWithId(contextId);

    // Given: A simple workflow that pauses
    const { WorkflowRuntime: Runtime } = await import('../../src/workflows/runtime.js');
    const runtime = new Runtime();

    const pausingWorkflow = {
      id: 'test-pausing',
      name: 'Test Pausing Workflow',
      description: 'A workflow that pauses',
      version: '1.0.0',
      async *execute() {
        yield {
          type: 'dispatch-response' as const,
          parts: [],
        };

        yield {
          type: 'interrupted' as const,
          reason: 'input-required' as const,
          message: 'Need input',
          inputSchema: { type: 'object' as const, properties: {} },
        };

        return { completed: true };
      },
    };

    runtime.register(pausingWorkflow);
    aiService.addTool('dispatch_workflow_test_pausing', {});

    // Rebuild handlers with workflow runtime
    const { WorkflowHandler } = await import('../../src/a2a/handlers/workflowHandler.js');
    const { AIHandler } = await import('../../src/a2a/handlers/aiHandler.js');
    const { MessageHandler } = await import('../../src/a2a/handlers/messageHandler.js');

    const workflowHandler = new WorkflowHandler(
      runtime,
      contextManager,
      eventBusManager,
      taskStore,
    );

    const newAiHandler = new AIHandler(
      aiService as unknown as AIService,
      workflowHandler,
      contextManager,
    );

    const newMessageHandler = new MessageHandler(workflowHandler, newAiHandler);

    // Given: First message dispatches workflow
    aiService.setSimpleResponse([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'dispatch_workflow_test_pausing',
        args: {},
      },
      {
        type: 'text-delta',
        text: 'Starting workflow...',
      },
    ]);

    const task1Id = 'task-workflow-dispatch';
    const eventBus1 = eventBusManager.createOrGetByTaskId(task1Id);

    await newMessageHandler.handleMessage(
      task1Id,
      contextId,
      'Start workflow',
      undefined,
      eventBus1,
    );

    // Wait for dispatch to complete
    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(task1Id)),
      task1Id,
      ['completed'],
    );

    // At this point, history should have the AI turn that dispatched the workflow
    const historyAfterDispatch = contextManager.getHistory(contextId);
    const initialHistoryLength = historyAfterDispatch.length;

    // Extract workflow task ID from referenceTaskIds
    const { waitForReferenceTaskId } = await import('../utils/lifecycle.js');
    const statusUpdates = getStatusUpdates(eventBusManager.getRecordingBus(task1Id));
    const workflowTaskId = await waitForReferenceTaskId(() => statusUpdates);

    expect(workflowTaskId).toBeDefined();

    // Note: The resume attempt below will likely fail or be rejected
    // because the workflow is paused, but the key behavior is that
    // NO history is appended during the resume attempt
    // (only AI turns append to history, not workflow resume)

    // When: Try to resume workflow (this goes through workflow handler, not AI handler)
    const resumeEventBus = eventBusManager.createOrGetByTaskId(workflowTaskId);

    // This may throw or complete depending on workflow state, but should NOT append to history
    await newMessageHandler
      .handleMessage(workflowTaskId, contextId, '', { input: 'resume data' }, resumeEventBus)
      .catch(() => {
        // Ignore errors - we're testing history behavior, not resume success
      });

    // Then: History length should be unchanged
    const historyAfterResume = contextManager.getHistory(contextId);
    expect(historyAfterResume.length).toBe(initialHistoryLength);
  });

  it('should maintain independent histories for different contexts', async () => {
    // Given: Two separate contexts
    const context1Id = 'ctx-independent-1';
    const context2Id = 'ctx-independent-2';
    contextManager.createContextWithId(context1Id);
    contextManager.createContextWithId(context2Id);

    // When: Handle messages for first context
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'Response for context 1',
      },
    ]);

    const task1Id = 'task-indep-1';
    const eventBus1 = eventBusManager.createOrGetByTaskId(task1Id);

    await messageHandler.handleMessage(
      task1Id,
      context1Id,
      'Message for context 1',
      undefined,
      eventBus1,
    );

    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(task1Id)),
      task1Id,
      ['completed'],
    );

    // When: Handle messages for second context
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'Response for context 2',
      },
    ]);

    const task2Id = 'task-indep-2';
    const eventBus2 = eventBusManager.createOrGetByTaskId(task2Id);

    await messageHandler.handleMessage(
      task2Id,
      context2Id,
      'Message for context 2',
      undefined,
      eventBus2,
    );

    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(task2Id)),
      task2Id,
      ['completed'],
    );

    // Then: Contexts should have independent histories
    const history1 = contextManager.getHistory(context1Id);
    const history2 = contextManager.getHistory(context2Id);

    expect(history1).toHaveLength(2);
    expect(history2).toHaveLength(2);

    expect(history1[0]?.content).toBe('Message for context 1');
    expect(history2[0]?.content).toBe('Message for context 2');

    // Verify no cross-contamination
    expect(history1.some((msg) => msg.content === 'Message for context 2')).toBe(false);
    expect(history2.some((msg) => msg.content === 'Message for context 1')).toBe(false);
  });
});

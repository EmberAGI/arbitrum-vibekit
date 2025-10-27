/**
 * Integration tests for AgentExecutor context lifecycle management
 *
 * Tests that AgentExecutor correctly creates contexts on-demand and manages
 * conversation history throughout the execution lifecycle.
 *
 * @id TEST-CTX-LIFE-001
 */

import type { TaskStatusUpdateEvent } from '@a2a-js/sdk';
import { InMemoryTaskStore } from '@a2a-js/sdk/server';
import { describe, it, expect, beforeEach } from 'vitest';

import { createAgentExecutor } from '../../src/a2a/agentExecutor.js';
import { ContextManager } from '../../src/a2a/sessions/manager.js';
import type { AIService } from '../../src/ai/service.js';
import { WorkflowRuntime } from '../../src/workflows/runtime.js';
import { createSimpleRequestContext } from '../utils/factories/index.js';
import { waitForWorkflowState } from '../utils/lifecycle.js';
import { StubAIService } from '../utils/mocks/ai-service.mock.js';
import { RecordingEventBusManager } from '../utils/mocks/event-bus.mock.js';

function getStatusUpdates(bus: unknown): TaskStatusUpdateEvent[] {
  const b = bus as { findEventsByKind?: (kind: 'status-update') => unknown[] } | undefined;
  return (b?.findEventsByKind?.('status-update') as TaskStatusUpdateEvent[]) ?? [];
}

describe('AgentExecutor Context Lifecycle Integration', () => {
  let aiService: StubAIService;
  let contextManager: ContextManager;
  let eventBusManager: RecordingEventBusManager;
  let workflowRuntime: WorkflowRuntime;
  let taskStore: InMemoryTaskStore;

  beforeEach(() => {
    // Use real ContextManager for lifecycle testing
    contextManager = new ContextManager();
    aiService = new StubAIService();
    eventBusManager = new RecordingEventBusManager();
    workflowRuntime = new WorkflowRuntime();
    taskStore = new InMemoryTaskStore();
  });

  it('should auto-create context when contextId is unknown', async () => {
    // Given: An executor with no existing contexts
    const executor = createAgentExecutor(
      workflowRuntime,
      aiService as unknown as AIService,
      contextManager,
      eventBusManager,
      taskStore,
    );

    // Given: AI service response
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'Context created successfully!',
      },
    ]);

    const contextId = 'ctx-auto-create-1';
    const taskId = 'task-auto-1';

    // Verify context doesn't exist yet
    expect(contextManager.getContext(contextId)).toBeNull();

    // When: Execute with unknown contextId
    const requestContext = createSimpleRequestContext('Hello', taskId, contextId);
    const eventBus = eventBusManager.createOrGetByTaskId(taskId);

    await executor.execute(requestContext, eventBus);

    // Wait for completion
    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(taskId)),
      taskId,
      ['completed'],
    );

    // Then: Context should be created automatically
    const context = contextManager.getContext(contextId);
    expect(context).toBeDefined();
    expect(context?.contextId).toBe(contextId);
  });

  it('should populate history after auto-creating context and completing AI turn', async () => {
    // Given: An executor
    const executor = createAgentExecutor(
      workflowRuntime,
      aiService as unknown as AIService,
      contextManager,
      eventBusManager,
      taskStore,
    );

    // Given: AI service response
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'First turn response',
      },
    ]);

    const contextId = 'ctx-history-populate';
    const taskId = 'task-populate-1';

    // When: Execute with new contextId
    const requestContext = createSimpleRequestContext('First message', taskId, contextId);
    const eventBus = eventBusManager.createOrGetByTaskId(taskId);

    await executor.execute(requestContext, eventBus);

    // Wait for completion
    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(taskId)),
      taskId,
      ['completed'],
    );

    // Then: Context should have conversation history
    const history = contextManager.getHistory(contextId);
    expect(history).toHaveLength(2);

    // Then: History should contain user message and assistant response
    expect(history[0]).toMatchObject({
      role: 'user',
      content: 'First message',
    });

    expect(history[1]).toMatchObject({
      role: 'assistant',
    });
  });

  it('should reuse existing context on subsequent executions', async () => {
    // Given: An executor with an existing context
    const contextId = 'ctx-reuse-1';
    contextManager.createContextWithId(contextId);

    const executor = createAgentExecutor(
      workflowRuntime,
      aiService as unknown as AIService,
      contextManager,
      eventBusManager,
      taskStore,
    );

    // Given: First turn
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'First response',
      },
    ]);

    const task1Id = 'task-reuse-1';
    const request1 = createSimpleRequestContext('First message', task1Id, contextId);
    const eventBus1 = eventBusManager.createOrGetByTaskId(task1Id);

    await executor.execute(request1, eventBus1);
    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(task1Id)),
      task1Id,
      ['completed'],
    );

    // Given: Second turn
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'Second response',
      },
    ]);

    const task2Id = 'task-reuse-2';
    const request2 = createSimpleRequestContext('Second message', task2Id, contextId);
    const eventBus2 = eventBusManager.createOrGetByTaskId(task2Id);

    // When: Execute second time with same contextId
    await executor.execute(request2, eventBus2);
    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(task2Id)),
      task2Id,
      ['completed'],
    );

    // Then: Context should be reused (not duplicated)
    const contexts = contextManager.listContexts();
    const matchingContexts = contexts.filter((c) => c.contextId === contextId);
    expect(matchingContexts).toHaveLength(1);

    // Then: History should accumulate across turns
    const history = contextManager.getHistory(contextId);
    expect(history).toHaveLength(4); // user1, assistant1, user2, assistant2
  });

  it('should isolate tasks and history across concurrent contexts', async () => {
    // Given: An executor
    const executor = createAgentExecutor(
      workflowRuntime,
      aiService as unknown as AIService,
      contextManager,
      eventBusManager,
      taskStore,
    );

    const context1Id = 'ctx-concurrent-1';
    const context2Id = 'ctx-concurrent-2';

    // Given: First context execution
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'Response for context 1',
      },
    ]);

    const task1Id = 'task-concurrent-1';
    const request1 = createSimpleRequestContext('Message to context 1', task1Id, context1Id);
    const eventBus1 = eventBusManager.createOrGetByTaskId(task1Id);

    await executor.execute(request1, eventBus1);

    // Given: Second context execution (concurrent)
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'Response for context 2',
      },
    ]);

    const task2Id = 'task-concurrent-2';
    const request2 = createSimpleRequestContext('Message to context 2', task2Id, context2Id);
    const eventBus2 = eventBusManager.createOrGetByTaskId(task2Id);

    await executor.execute(request2, eventBus2);

    // Wait for both to complete
    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(task1Id)),
      task1Id,
      ['completed'],
    );
    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(task2Id)),
      task2Id,
      ['completed'],
    );

    // Then: Contexts should be isolated
    const context1 = contextManager.getContext(context1Id);
    const context2 = contextManager.getContext(context2Id);

    expect(context1).toBeDefined();
    expect(context2).toBeDefined();
    expect(context1?.contextId).not.toBe(context2?.contextId);

    // Then: Each context should have its own history
    const history1 = contextManager.getHistory(context1Id);
    const history2 = contextManager.getHistory(context2Id);

    expect(history1).toHaveLength(2);
    expect(history2).toHaveLength(2);

    expect(history1[0]?.content).toBe('Message to context 1');
    expect(history2[0]?.content).toBe('Message to context 2');

    // Note: Task tracking in contexts is not automatically done by the executor
    // The executor creates contexts and manages history, but task association
    // is managed by the workflow handler when workflows are involved
  });

  it('should emit contextCreated event on auto-creation', async () => {
    // Given: An executor with event listener
    const executor = createAgentExecutor(
      workflowRuntime,
      aiService as unknown as AIService,
      contextManager,
      eventBusManager,
      taskStore,
    );

    const eventListener = vi.fn();
    contextManager.on('contextCreated', eventListener);

    // Given: AI service response
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'Created!',
      },
    ]);

    const contextId = 'ctx-event-test';
    const taskId = 'task-event-1';

    // When: Execute with new contextId
    const requestContext = createSimpleRequestContext('Message', taskId, contextId);
    const eventBus = eventBusManager.createOrGetByTaskId(taskId);

    await executor.execute(requestContext, eventBus);

    // Wait for completion
    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(taskId)),
      taskId,
      ['completed'],
    );

    // Then: contextCreated event should have been emitted
    expect(eventListener).toHaveBeenCalledWith(
      expect.objectContaining({
        contextId,
        context: expect.objectContaining({
          contextId,
        }),
      }),
    );
  });

  it('should handle message extraction and delegate to message handler', async () => {
    // Given: An executor
    const executor = createAgentExecutor(
      workflowRuntime,
      aiService as unknown as AIService,
      contextManager,
      eventBusManager,
      taskStore,
    );

    // Given: AI service response
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        text: 'Processed message successfully',
      },
    ]);

    const contextId = 'ctx-message-extract';
    const taskId = 'task-extract-1';

    // When: Execute with message parts
    const requestContext = createSimpleRequestContext('Extract this', taskId, contextId);
    const eventBus = eventBusManager.createOrGetByTaskId(taskId);

    // Should not throw
    await expect(executor.execute(requestContext, eventBus)).resolves.not.toThrow();

    // Wait for completion
    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(taskId)),
      taskId,
      ['completed'],
    );

    // Then: Context should be created and history populated
    const context = contextManager.getContext(contextId);
    expect(context).toBeDefined();

    const history = contextManager.getHistory(contextId);
    expect(history.length).toBeGreaterThan(0);
  });

  it('should maintain context state across multiple sequential turns', async () => {
    // Given: An executor with a context
    const contextId = 'ctx-sequential-turns';
    const executor = createAgentExecutor(
      workflowRuntime,
      aiService as unknown as AIService,
      contextManager,
      eventBusManager,
      taskStore,
    );

    // When: Execute 3 sequential turns
    for (let i = 1; i <= 3; i++) {
      aiService.setSimpleResponse([
        {
          type: 'text-delta',
          text: `Response ${i}`,
        },
      ]);

      const taskId = `task-seq-${i}`;
      const requestContext = createSimpleRequestContext(`Message ${i}`, taskId, contextId);
      const eventBus = eventBusManager.createOrGetByTaskId(taskId);

      await executor.execute(requestContext, eventBus);
      await waitForWorkflowState(
        () => getStatusUpdates(eventBusManager.getRecordingBus(taskId)),
        taskId,
        ['completed'],
      );
    }

    // Then: Context should have accumulated all history
    const history = contextManager.getHistory(contextId);
    expect(history).toHaveLength(6); // 3 turns × 2 messages (user + assistant)

    // Then: Context should have only one instance
    const contexts = contextManager.listContexts();
    const matchingContexts = contexts.filter((c) => c.contextId === contextId);
    expect(matchingContexts).toHaveLength(1);
  });
});

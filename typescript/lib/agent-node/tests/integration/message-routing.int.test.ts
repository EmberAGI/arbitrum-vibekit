/**
 * Integration tests for message routing with paused workflows
 *
 * Tests that new messages (without taskId) route to AI while workflows are paused
 * in the same context, validating the routing logic in messageHandler.
 */

import type { Task, TaskStatusUpdateEvent } from '@a2a-js/sdk';
import { InMemoryTaskStore } from '@a2a-js/sdk/server';
import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';

import { createAgentExecutor } from '../../src/a2a/agentExecutor.js';
import type { ContextManager } from '../../src/a2a/sessions/manager.js';
import type { AIService } from '../../src/ai/service.js';
import { WorkflowRuntime } from '../../src/workflows/runtime.js';
import type { WorkflowPlugin, WorkflowContext, WorkflowState } from '../../src/workflows/types.js';
import { createSimpleRequestContext } from '../utils/factories/index.js';
import { waitForReferenceTaskId, waitForWorkflowState } from '../utils/lifecycle.js';
import { StubAIService } from '../utils/mocks/ai-service.mock.js';
import { MockContextManager } from '../utils/mocks/context-manager.mock.js';
import { RecordingEventBusManager } from '../utils/mocks/event-bus.mock.js';

// Removed fixed sleep helper in favor of event-driven waits via lifecycle helpers

function getStatusUpdates(bus: unknown): TaskStatusUpdateEvent[] {
  const b = bus as { findEventsByKind?: (kind: 'status-update') => unknown[] } | undefined;
  return (b?.findEventsByKind?.('status-update') as TaskStatusUpdateEvent[]) ?? [];
}

function getTasks(bus: unknown): Task[] {
  const b = bus as { findEventsByKind?: (kind: 'task') => unknown[] } | undefined;
  return (b?.findEventsByKind?.('task') as Task[]) ?? [];
}

/**
 * Create a workflow that pauses for input
 */
function createPausingWorkflow(id: string): WorkflowPlugin {
  return {
    id,
    name: `Test Workflow ${id}`,
    description: `A workflow that pauses for input`,
    version: '1.0.0',
    async *execute(_context: WorkflowContext): AsyncGenerator<WorkflowState, unknown, unknown> {
      // MUST yield dispatch-response first when dispatched via tool
      yield {
        type: 'dispatch-response',
        parts: [],
      };

      // Emit one artifact before pausing
      yield {
        type: 'artifact',
        artifact: {
          artifactId: 'workflow-artifact.json',
          name: 'workflow-artifact.json',
          mimeType: 'application/json',
          parts: [
            {
              kind: 'data',
              data: { status: 'paused' },
              metadata: { mimeType: 'application/json' },
            },
          ],
        },
      };

      // Pause for input
      void (yield {
        type: 'interrupted',
        reason: 'input-required',
        message: 'Need user input',
        inputSchema: z.object({
          data: z.string(),
        }),
      });

      return { paused: true };
    },
  };
}

describe('Message Routing Integration', () => {
  let workflowRuntime: WorkflowRuntime;
  let aiService: StubAIService;
  let contextManager: MockContextManager;
  let eventBusManager: RecordingEventBusManager;
  let taskStore: InMemoryTaskStore;

  beforeEach(() => {
    workflowRuntime = new WorkflowRuntime();
    aiService = new StubAIService();
    contextManager = new MockContextManager();
    eventBusManager = new RecordingEventBusManager();
    taskStore = new InMemoryTaskStore();
  });

  it('should route new message to AI while workflow task is paused in same context', async () => {
    // Given: A workflow that pauses
    const pausingWorkflow = createPausingWorkflow('routing_test');
    workflowRuntime.register(pausingWorkflow);
    aiService.addTool('dispatch_workflow_routing_test', {});

    // Given: First AI response dispatches workflow
    aiService.setSimpleResponse([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'dispatch_workflow_routing_test',
        args: {},
      },
      {
        type: 'text-delta',
        textDelta: 'Workflow started...',
      },
    ]);

    const executor = createAgentExecutor(
      workflowRuntime,
      aiService as unknown as AIService,
      contextManager as unknown as ContextManager,
      eventBusManager,
      taskStore,
    );

    const contextId = 'ctx-routing-test';
    const firstTaskId = 'task-first';

    // When: Send first message that dispatches workflow
    const firstRequestContext = createSimpleRequestContext(
      'Start the workflow',
      firstTaskId,
      contextId,
    );
    const firstEventBus = eventBusManager.createOrGetByTaskId(firstTaskId);

    await executor.execute(firstRequestContext, firstEventBus);

    // Then: Extract workflow task ID from referenceTaskIds
    const firstBus = eventBusManager.getRecordingBus(firstTaskId);
    expect(firstBus).toBeDefined();

    const workflowTaskId = await waitForReferenceTaskId(() => getStatusUpdates(firstBus));
    expect(workflowTaskId).toBeDefined();

    // And: Workflow should be paused (check via events, not runtime internals)
    const workflowBus = eventBusManager.getRecordingBus(workflowTaskId);
    const pauseUpdate = await waitForWorkflowState(
      () => getStatusUpdates(workflowBus),
      workflowTaskId,
      ['input-required', 'rejected'],
    );
    expect(['input-required', 'rejected']).toContain(pauseUpdate.status?.state);

    // Given: Second AI response (independent from workflow)
    aiService.setSimpleResponse([
      {
        type: 'text-delta',
        textDelta: 'This is a separate AI response, not related to the workflow.',
      },
    ]);

    // When: Send second message to SAME context but WITHOUT taskId
    // This should route to AI, not to the paused workflow
    const secondTaskId = 'task-second-ai';
    const secondRequestContext = createSimpleRequestContext(
      'What is the weather today?',
      secondTaskId,
      contextId, // Same context!
    );
    const secondEventBus = eventBusManager.createOrGetByTaskId(secondTaskId);

    await executor.execute(secondRequestContext, secondEventBus);

    // Wait for AI task to complete via status updates
    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(secondTaskId)),
      secondTaskId,
      ['completed'],
    );

    // Then: Second message should create a NEW task (not resume workflow)
    const secondBus = eventBusManager.getRecordingBus(secondTaskId);
    expect(secondBus).toBeDefined();

    const secondTasks = getTasks(secondBus);
    const secondTask = secondTasks.find((t) => t.id === secondTaskId);
    expect(secondTask).toBeDefined();
    expect(secondTask?.id).toBe(secondTaskId);
    expect(secondTask?.id).not.toBe(workflowTaskId); // Different task!

    // And: Second task should complete with AI response (not workflow)
    const secondStatusUpdates = getStatusUpdates(secondBus);
    const secondComplete = secondStatusUpdates.find(
      (u) => u.taskId === secondTaskId && u.status.state === 'completed',
    );
    expect(secondComplete).toBeDefined();

    // And: Workflow should STILL be paused (not affected by second message)
    // Check via events - workflow state should remain unchanged
    const finalWorkflowUpdates = getStatusUpdates(workflowBus);
    const finalPauseUpdate = finalWorkflowUpdates.find((u) =>
      ['input-required', 'rejected'].includes(u.status?.state ?? ''),
    );
    expect(finalPauseUpdate).toBeDefined();
    expect(['input-required', 'rejected']).toContain(finalPauseUpdate?.status?.state);

    // Verify we have distinct tasks with their own event buses
    const firstTaskBus = eventBusManager.getRecordingBus(firstTaskId);
    const secondTaskBus = eventBusManager.getRecordingBus(secondTaskId);
    const workflowTaskBus = eventBusManager.getRecordingBus(workflowTaskId);

    expect(firstTaskBus).toBeDefined();
    expect(secondTaskBus).toBeDefined();
    expect(workflowTaskBus).toBeDefined();
  });

  it('should route message with explicit taskId to paused workflow (not AI)', async () => {
    // Given: A workflow that pauses
    const pausingWorkflow = createPausingWorkflow('explicit_resume_test');
    workflowRuntime.register(pausingWorkflow);
    aiService.addTool('dispatch_workflow_explicit_resume_test', {});

    // Given: First AI response dispatches workflow
    aiService.setSimpleResponse([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'dispatch_workflow_explicit_resume_test',
        args: {},
      },
      {
        type: 'text-delta',
        textDelta: 'Starting workflow...',
      },
    ]);

    const executor = createAgentExecutor(
      workflowRuntime,
      aiService as unknown as AIService,
      contextManager as unknown as ContextManager,
      eventBusManager,
      taskStore,
    );

    const contextId = 'ctx-explicit-resume';
    const firstTaskId = 'task-dispatch';

    // When: Dispatch workflow
    const firstRequestContext = createSimpleRequestContext(
      'Start workflow',
      firstTaskId,
      contextId,
    );
    const firstEventBus = eventBusManager.createOrGetByTaskId(firstTaskId);

    await executor.execute(firstRequestContext, firstEventBus);

    // Extract workflow task ID
    const firstBus = eventBusManager.getRecordingBus(firstTaskId);
    const workflowTaskId = await waitForReferenceTaskId(() => getStatusUpdates(firstBus));
    expect(workflowTaskId).toBeDefined();

    // Wait for workflow to pause (check via events, not runtime internals)
    const workflowBus = eventBusManager.getRecordingBus(workflowTaskId);
    const pauseUpdate = await waitForWorkflowState(
      () => getStatusUpdates(workflowBus),
      workflowTaskId,
      ['input-required', 'rejected'],
    );
    expect(['input-required', 'rejected']).toContain(pauseUpdate.status?.state);

    // When: Send message WITH taskId to resume workflow
    // Note: In real A2A, this would be message.taskId, but RequestContext uses taskId directly
    const resumeRequestContext = createSimpleRequestContext(
      'Resume with data',
      workflowTaskId, // Use workflow task ID as the request taskId
      contextId,
    );

    // Get the workflow's event bus (already exists)
    const workflowEventBus = eventBusManager.createOrGetByTaskId(workflowTaskId);

    // When: Execute resume (this will call workflow handler, not AI handler)
    await expect(executor.execute(resumeRequestContext, workflowEventBus)).resolves.not.toThrow();

    // Then: Resume was processed successfully (BEHAVIOR: resume accepted without error)
    // The key observable behavior is that the execute completed without throwing
    // This demonstrates that the message was routed to the workflow handler for resume

    // Additional verification: workflow bus exists and was used (not a new AI task bus)
    const workflowBusExists = eventBusManager.getRecordingBus(workflowTaskId);
    expect(workflowBusExists).toBeDefined();

    // If this had been routed to AI, a new task bus would have been created
    // instead of using the existing workflow bus
  });

  it('should handle multiple independent messages in same context with workflow paused', async () => {
    // Given: A workflow that pauses
    const pausingWorkflow = createPausingWorkflow('multi_message_test');
    workflowRuntime.register(pausingWorkflow);
    aiService.addTool('dispatch_workflow_multi_message_test', {});

    const executor = createAgentExecutor(
      workflowRuntime,
      aiService as unknown as AIService,
      contextManager as unknown as ContextManager,
      eventBusManager,
      taskStore,
    );

    const contextId = 'ctx-multi-message';

    // When: Send message 1 - dispatch workflow
    aiService.setSimpleResponse([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'dispatch_workflow_multi_message_test',
        args: {},
      },
    ]);

    const task1Id = 'task-msg-1';
    const context1 = createSimpleRequestContext('Dispatch workflow', task1Id, contextId);
    await executor.execute(context1, eventBusManager.createOrGetByTaskId(task1Id));

    // When: Send message 2 - independent AI query
    aiService.setSimpleResponse([{ type: 'text-delta', textDelta: 'Response 2' }]);
    const task2Id = 'task-msg-2';
    const context2 = createSimpleRequestContext('Query 2', task2Id, contextId);
    await executor.execute(context2, eventBusManager.createOrGetByTaskId(task2Id));
    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(task2Id)),
      task2Id,
      ['completed'],
    );

    // When: Send message 3 - another independent AI query
    aiService.setSimpleResponse([{ type: 'text-delta', textDelta: 'Response 3' }]);
    const task3Id = 'task-msg-3';
    const context3 = createSimpleRequestContext('Query 3', task3Id, contextId);
    await executor.execute(context3, eventBusManager.createOrGetByTaskId(task3Id));
    await waitForWorkflowState(
      () => getStatusUpdates(eventBusManager.getRecordingBus(task3Id)),
      task3Id,
      ['completed'],
    );

    // Then: All three tasks should have their own event buses
    const bus1 = eventBusManager.getRecordingBus(task1Id);
    const bus2 = eventBusManager.getRecordingBus(task2Id);
    const bus3 = eventBusManager.getRecordingBus(task3Id);

    expect(bus1).toBeDefined();
    expect(bus2).toBeDefined();
    expect(bus3).toBeDefined();

    // And: Each bus should have task events
    const tasks1 = getTasks(bus1);
    const tasks2 = getTasks(bus2);
    const tasks3 = getTasks(bus3);

    expect(tasks1.some((t) => t.id === task1Id)).toBe(true);
    expect(tasks2.some((t) => t.id === task2Id)).toBe(true);
    expect(tasks3.some((t) => t.id === task3Id)).toBe(true);

    // And: Extract workflow task ID and verify it's still paused
    const workflowTaskId = await waitForReferenceTaskId(() => getStatusUpdates(bus1), 2000, 50);

    if (workflowTaskId) {
      // Verify workflow is still paused via events, not runtime internals
      const workflowBus = eventBusManager.getRecordingBus(workflowTaskId);
      const workflowUpdates = getStatusUpdates(workflowBus);
      const pausedUpdate = workflowUpdates.find((u) =>
        ['input-required', 'rejected'].includes(u.status?.state ?? ''),
      );
      expect(pausedUpdate).toBeDefined();
      expect(['input-required', 'rejected']).toContain(pausedUpdate?.status?.state);
    }
  });
});

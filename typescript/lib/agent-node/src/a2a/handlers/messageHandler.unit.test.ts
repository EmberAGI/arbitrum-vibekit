/**
 * Unit tests for MessageHandler
 * Tests message routing logic between AI and Workflow handlers
 *
 * These tests focus on BEHAVIOR (what happens) not IMPLEMENTATION (how it happens)
 * by using test doubles that record observable outcomes rather than mock call assertions.
 */

import type { ExecutionEventBus } from '@a2a-js/sdk/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIHandler } from './aiHandler.js';
import { MessageHandler } from './messageHandler.js';
import type { WorkflowHandler } from './workflowHandler.js';

/**
 * Test double for AIHandler that records what messages it processes
 * This allows us to test the OUTCOME of routing (AI processed a message)
 * rather than the IMPLEMENTATION (handleStreamingAIProcessing was called)
 */
class RecordingAIHandler implements Pick<AIHandler, 'handleStreamingAIProcessing'> {
  processedMessages: Array<{
    content: string;
    contextId: string;
    taskId: string;
    messageData: unknown;
  }> = [];

  handleStreamingAIProcessing(
    messageContent: string,
    contextId: string,
    taskId: string,
    _eventBus: ExecutionEventBus,
    messageData: unknown,
  ): void {
    this.processedMessages.push({
      content: messageContent,
      contextId,
      taskId,
      messageData,
    });
  }
}

/**
 * Test double for WorkflowHandler that records workflow resume attempts
 * This allows us to test the OUTCOME of routing (workflow was resumed)
 * rather than the IMPLEMENTATION (resumeWorkflow was called)
 */
class RecordingWorkflowHandler
  implements
    Pick<
      WorkflowHandler,
      'getTaskState' | 'resolveTaskIdForContext' | 'getEventBusByTaskId' | 'resumeWorkflow'
    >
{
  private taskStates = new Map<string, unknown>();
  private contextToTaskMap = new Map<string, string>();
  private eventBuses = new Map<string, ExecutionEventBus>();

  resumedWorkflows: Array<{
    taskId: string;
    contextId: string;
    content: string;
    data: unknown;
  }> = [];

  // Configuration methods for test setup
  setTaskState(taskId: string, state: unknown): void {
    this.taskStates.set(taskId, state);
  }

  setContextMapping(contextId: string, taskId: string): void {
    this.contextToTaskMap.set(contextId, taskId);
  }

  setEventBus(taskId: string, eventBus: ExecutionEventBus): void {
    this.eventBuses.set(taskId, eventBus);
  }

  // WorkflowHandler implementation
  getTaskState(taskId: string): unknown {
    return this.taskStates.get(taskId);
  }

  resolveTaskIdForContext(contextId: string): string | undefined {
    return this.contextToTaskMap.get(contextId);
  }

  getEventBusByTaskId(taskId: string): ExecutionEventBus | undefined {
    return this.eventBuses.get(taskId);
  }

  async resumeWorkflow(
    taskId: string,
    contextId: string,
    messageContent: string,
    messageData: unknown,
    _taskState: unknown,
    _eventBus: ExecutionEventBus,
  ): Promise<void> {
    this.resumedWorkflows.push({
      taskId,
      contextId,
      content: messageContent,
      data: messageData,
    });
  }
}

describe('MessageHandler', () => {
  let messageHandler: MessageHandler;
  let recordingWorkflowHandler: RecordingWorkflowHandler;
  let recordingAIHandler: RecordingAIHandler;
  let mockEventBus: { finished: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    recordingWorkflowHandler = new RecordingWorkflowHandler();
    recordingAIHandler = new RecordingAIHandler();
    mockEventBus = {
      finished: vi.fn(),
    };

    messageHandler = new MessageHandler(
      recordingWorkflowHandler as unknown as WorkflowHandler,
      recordingAIHandler as unknown as AIHandler,
    );
  });

  describe('handleMessage - routing logic', () => {
    it('should route message to AI when no workflow task exists', async () => {
      // Given: No workflow task exists for this taskId or context
      const taskId = 'task-new';
      const contextId = 'ctx-1';
      const messageContent = 'Hello, agent';
      const messageData = undefined;

      // (No task state or context mapping set)

      // When: Message is handled
      await messageHandler.handleMessage(
        taskId,
        contextId,
        messageContent,
        messageData,
        mockEventBus as unknown as ExecutionEventBus,
      );

      // Then: AI handler should have processed the message (BEHAVIOR)
      expect(recordingAIHandler.processedMessages).toHaveLength(1);
      expect(recordingAIHandler.processedMessages[0]).toMatchObject({
        content: messageContent,
        contextId,
        taskId,
        messageData,
      });

      // And: Workflow should not have been resumed (BEHAVIOR)
      expect(recordingWorkflowHandler.resumedWorkflows).toHaveLength(0);
    });

    it('should route message to AI when workflow is paused in same context but message has different taskId', async () => {
      // Given: A paused workflow task exists but message doesn't target it
      const newTaskId = 'task-new-ai';
      const workflowTaskId = 'task-workflow';
      const contextId = 'ctx-with-paused-workflow';
      const messageContent = 'What is the weather?';
      const messageData = undefined;

      // Workflow exists with paused state, but we're sending a message with different taskId
      recordingWorkflowHandler.setTaskState(workflowTaskId, {
        state: 'input-required',
        pauseInfo: {},
      });
      // Context doesn't map to the workflow (simulates new message, not resume)
      // (No context mapping set)

      // When: Message is handled with different taskId
      await messageHandler.handleMessage(
        newTaskId,
        contextId,
        messageContent,
        messageData,
        mockEventBus as unknown as ExecutionEventBus,
      );

      // Then: AI handler should have processed the message (BEHAVIOR)
      expect(recordingAIHandler.processedMessages).toHaveLength(1);
      expect(recordingAIHandler.processedMessages[0]).toMatchObject({
        content: messageContent,
        contextId,
        taskId: newTaskId,
      });

      // And: Workflow should not have been resumed (BEHAVIOR)
      expect(recordingWorkflowHandler.resumedWorkflows).toHaveLength(0);
    });

    it('should resume workflow when message targets paused workflow task', async () => {
      // Given: A paused workflow task
      const workflowTaskId = 'task-workflow-paused';
      const contextId = 'ctx-workflow';
      const messageContent = 'Resume data';
      const messageData = { input: 'user-input' };
      const taskState = {
        state: 'input-required',
        pauseInfo: { inputSchema: {} },
      };

      recordingWorkflowHandler.setTaskState(workflowTaskId, taskState);

      // When: Message targets the paused workflow task
      await messageHandler.handleMessage(
        workflowTaskId,
        contextId,
        messageContent,
        messageData,
        mockEventBus as unknown as ExecutionEventBus,
      );

      // Then: Workflow should have been resumed (BEHAVIOR)
      expect(recordingWorkflowHandler.resumedWorkflows).toHaveLength(1);
      expect(recordingWorkflowHandler.resumedWorkflows[0]).toMatchObject({
        taskId: workflowTaskId,
        contextId,
        content: messageContent,
        data: messageData,
      });

      // And: AI handler should not have processed the message (BEHAVIOR)
      expect(recordingAIHandler.processedMessages).toHaveLength(0);
    });

    it('should resume workflow via context resolution when taskId not directly found', async () => {
      // Given: Message taskId doesn't match, but context resolves to a paused workflow
      const requestTaskId = 'task-from-client';
      const workflowTaskId = 'task-workflow-mapped';
      const contextId = 'ctx-mapped';
      const messageContent = '';
      const messageData = { value: 'test' };
      const taskState = {
        state: 'input-required',
        pauseInfo: { inputSchema: {} },
      };
      const mappedEventBus = { finished: vi.fn() };

      // Set up workflow task state
      recordingWorkflowHandler.setTaskState(workflowTaskId, taskState);
      // Set up context mapping so contextId resolves to workflowTaskId
      recordingWorkflowHandler.setContextMapping(contextId, workflowTaskId);
      recordingWorkflowHandler.setEventBus(
        workflowTaskId,
        mappedEventBus as unknown as ExecutionEventBus,
      );

      // When: Message is handled (with different taskId than workflow)
      await messageHandler.handleMessage(
        requestTaskId,
        contextId,
        messageContent,
        messageData,
        mockEventBus as unknown as ExecutionEventBus,
      );

      // Then: Workflow should have been resumed with the mapped taskId (BEHAVIOR)
      expect(recordingWorkflowHandler.resumedWorkflows).toHaveLength(1);
      expect(recordingWorkflowHandler.resumedWorkflows[0]).toMatchObject({
        taskId: workflowTaskId, // Resolved via context mapping
        contextId,
        content: messageContent,
        data: messageData,
      });

      // And: AI handler should not have processed the message (BEHAVIOR)
      expect(recordingAIHandler.processedMessages).toHaveLength(0);
    });

    it('should reject message for terminal workflow task', async () => {
      // Given: A completed workflow task
      const workflowTaskId = 'task-completed';
      const contextId = 'ctx-completed';
      const taskState = {
        state: 'completed',
        result: { success: true },
      };

      recordingWorkflowHandler.setTaskState(workflowTaskId, taskState);

      // When/Then: Message should be rejected with error (BEHAVIOR)
      await expect(
        messageHandler.handleMessage(
          workflowTaskId,
          contextId,
          'Cannot resume',
          undefined,
          mockEventBus as unknown as ExecutionEventBus,
        ),
      ).rejects.toThrow();

      // And: Event bus should be finished (BEHAVIOR)
      expect(mockEventBus.finished).toHaveBeenCalled();
    });
  });

  describe('extractMessageParts', () => {
    it('should extract text and data parts from message', () => {
      // Given: Message with parts
      const message = {
        kind: 'message' as const,
        messageId: 'msg-1',
        role: 'user' as const,
        parts: [
          { kind: 'text' as const, text: 'Hello' },
          { kind: 'data' as const, data: { value: 123 }, metadata: {} },
        ],
      };

      // When: Parts are extracted
      const { content, data } = messageHandler.extractMessageParts(message);

      // Then: Both should be extracted correctly (BEHAVIOR)
      expect(content).toBe('Hello');
      expect(data).toEqual({ value: 123 });
    });

    it('should handle message with only text part', () => {
      // Given: Message with only text
      const message = {
        kind: 'message' as const,
        messageId: 'msg-2',
        role: 'user' as const,
        parts: [{ kind: 'text' as const, text: 'Just text' }],
      };

      // When: Parts are extracted
      const { content, data } = messageHandler.extractMessageParts(message);

      // Then: Text extracted, data undefined (BEHAVIOR)
      expect(content).toBe('Just text');
      expect(data).toBeUndefined();
    });

    it('should handle legacy message format', () => {
      // Given: Message with content property (legacy format)
      const message = {
        kind: 'message' as const,
        messageId: 'msg-3',
        role: 'user' as const,
        content: 'Legacy format',
      } as unknown as { kind: string; messageId: string; role: string; content: string };

      // When: Parts are extracted
      const { content, data } = messageHandler.extractMessageParts(message);

      // Then: Content extracted from content property (BEHAVIOR)
      expect(content).toBe('Legacy format');
      expect(data).toBeUndefined();
    });
  });
});

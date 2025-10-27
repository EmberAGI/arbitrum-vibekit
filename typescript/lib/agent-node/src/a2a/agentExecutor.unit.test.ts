import type { TaskStatusUpdateEvent } from '@a2a-js/sdk';
import { DefaultExecutionEventBusManager, InMemoryTaskStore } from '@a2a-js/sdk/server';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createSimpleRequestContext,
  createTaskMessage,
  createUserMessage,
  createWorkflowExecutionStub,
} from '../../tests/utils/factories/index.js';
import { StubAIService } from '../../tests/utils/mocks/ai-service.mock.js';
import { MockContextManager } from '../../tests/utils/mocks/context-manager.mock.js';
import { RecordingEventBus } from '../../tests/utils/mocks/event-bus.mock.js';
import { StubWorkflowRuntime } from '../../tests/utils/mocks/workflow-runtime.mock.js';
import type { AIService } from '../ai/service.js';

import { createAgentExecutor } from './agentExecutor.js';
import type { ContextManager } from './sessions/manager.js';

describe('AgentExecutor', () => {
  let eventBus: RecordingEventBus;
  let workflowRuntime: StubWorkflowRuntime;
  let llm: StubAIService;
  let contextManager: MockContextManager;
  let eventBusManager: DefaultExecutionEventBusManager;
  let taskStore: InMemoryTaskStore;

  beforeEach(() => {
    eventBus = new RecordingEventBus();
    workflowRuntime = new StubWorkflowRuntime();
    llm = new StubAIService();
    contextManager = new MockContextManager();
    eventBusManager = new DefaultExecutionEventBusManager();
    taskStore = new InMemoryTaskStore();
  });

  it('routes messages with taskId to existing paused workflows', async () => {
    // Given: A paused workflow waiting for user input
    const taskId = 'task-123';
    const contextId = 'ctx-1';

    workflowRuntime.setTaskState(taskId, {
      state: 'input-required',
      workflowGenerator: (async function* () {
        await Promise.resolve(); // Ensure async context
        yield {
          type: 'status',
          status: { state: 'working' },
        };
      })(),
    });
    workflowRuntime.setResumeWorkflowHandler(() => Promise.resolve({ valid: true }));

    const executor = createAgentExecutor(
      workflowRuntime,
      llm as unknown as AIService,
      contextManager as unknown as ContextManager,
      eventBusManager,
      taskStore,
    );

    // When: A message with taskId is received
    const requestContext = createSimpleRequestContext(
      'Here is the requested information',
      taskId,
      contextId,
    );

    await executor.execute(requestContext, eventBus);

    // Then: The workflow should be resumed with the user input, not routed to AI
    expect(workflowRuntime.getTaskStateCalls).toContain(taskId);
    expect(workflowRuntime.resumeCalls).toContainEqual({
      taskId,
      input: 'Here is the requested information',
    });

    const statusUpdate = eventBus.findFirstEventByKind('status-update') as
      | TaskStatusUpdateEvent
      | undefined;
    expect(statusUpdate).toBeDefined();
    expect(statusUpdate?.status?.state).toBe('working');
    expect(llm.processCalls).toHaveLength(0);
  });

  it('routes messages without taskId to the AI service', async () => {
    // Given: A new user message without an associated task
    const contextId = 'ctx-2';

    const executor = createAgentExecutor(
      workflowRuntime,
      llm as unknown as AIService,
      contextManager as unknown as ContextManager,
      eventBusManager,
      taskStore,
    );

    createUserMessage(contextId, 'Open a long position on ETH-USD');
    const requestContext = createSimpleRequestContext(
      'Open a long position on ETH-USD',
      '',
      contextId,
    );

    llm.processHandler = async function* () {
      await Promise.resolve(); // Ensure async context
      yield {
        type: 'text-delta',
        text: 'Sure, preparing the trade',
      };
    };

    // When: The message is processed
    await executor.execute(requestContext, eventBus);

    // Then: The AI service should handle the request with available tools
    expect(llm.processCalls).toHaveLength(1);
    expect(llm.processCalls[0]?.context).toMatchObject({
      message: 'Open a long position on ETH-USD',
      contextId,
    });
    expect(llm.processCalls[0]?.options?.tools).toBeDefined();
  });

  it('responds with an error message when task is in terminal state', async () => {
    // Given: A task that has already been completed
    const taskId = 'task-terminated';
    const contextId = 'ctx-3';

    workflowRuntime.setTaskState(taskId, {
      state: 'completed',
      final: true,
    });

    const executor = createAgentExecutor(
      workflowRuntime,
      llm as unknown as AIService,
      contextManager as unknown as ContextManager,
      eventBusManager,
      taskStore,
    );

    createTaskMessage(contextId, taskId, 'Update the order');
    const requestContext = createSimpleRequestContext('Update the order', taskId, contextId);

    // When: A message is sent to the completed task
    // Then: An error should be thrown and no AI call should be made
    await expect(executor.execute(requestContext, eventBus)).rejects.toThrow(
      /Task task-terminated is in a terminal state/,
    );

    const agentMessage = eventBus
      .findEventsByKind('message')
      .find((event) => 'role' in event && event.role === 'agent');

    expect(agentMessage).toBeUndefined();
    expect(eventBus.finishedCount).toBeGreaterThan(0);
    expect(llm.processCalls).toHaveLength(0);
  });

  it('dispatches workflow tool calls returned by the AI', async () => {
    // Given: AI has workflow dispatch tools available
    const contextId = 'ctx-4';
    const taskId = 'task-tools';

    const workflowExecution = createWorkflowExecutionStub(taskId, contextId, 'working');
    workflowRuntime.setDispatchHandler(() => workflowExecution);
    workflowRuntime.setPlugin({
      id: 'complex_flow',
      name: 'Complex Flow',
      description: 'Execute complex workflow',
      version: '1.0.0',
      execute: async function* () {
        await Promise.resolve(); // Ensure async context
        yield { type: 'status-update', message: 'Working' };
      },
    });
    llm.availableTools.set('dispatch_workflow_complex_flow', { description: 'Test tool' });
    llm.processHandler = async function* (_context, options) {
      await Promise.resolve(); // Ensure async context
      // Emit tool call event for streaming
      yield {
        type: 'tool-call',
        toolName: 'dispatch_workflow_complex_flow',
        input: { leverage: 3 },
      };

      const tool = options?.tools?.['dispatch_workflow_complex_flow'];
      const toolResult = tool?.execute
        ? await tool.execute({ leverage: 3 })
        : { result: { success: true } };

      // Emit tool result
      yield {
        type: 'tool-result',
        result: toolResult,
      };
      // Emit text response
      yield {
        type: 'text-delta',
        text: 'Executing workflow',
      };
    };

    const executor = createAgentExecutor(
      workflowRuntime,
      llm as unknown as AIService,
      contextManager as unknown as ContextManager,
      eventBusManager,
      taskStore,
    );

    createUserMessage(contextId, 'Execute complex workflow request');
    const requestContext = createSimpleRequestContext(
      'Execute complex workflow request',
      taskId,
      contextId,
    );

    // When: AI decides to call a workflow dispatch tool
    await executor.execute(requestContext, eventBus);

    // Wait for stream processing to complete (handleStreamingAIProcessing doesn't await)
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Then: The workflow should be dispatched via the runtime
    expect(workflowRuntime.dispatchCalls).toHaveLength(1);
    expect(workflowRuntime.dispatchCalls[0]?.pluginId).toBe('complex_flow');

    const taskEvent = eventBus.findFirstEventByKind('task');
    expect(taskEvent).toBeDefined();
    if (taskEvent && 'id' in taskEvent) {
      expect(taskEvent.id).toBe(taskId);
    }
  });

  it('cancels active tasks via the workflow runtime', async () => {
    // Given: A long-running workflow is active
    const contextId = 'ctx-5';
    const taskId = 'task-cancel';

    const workflowExecution = createWorkflowExecutionStub(taskId, contextId, 'working');
    workflowRuntime.setDispatchHandler(() => ({
      ...workflowExecution,
      waitForCompletion: () => new Promise(() => {}),
    }));

    llm.availableTools.set('dispatch_workflow_complex_flow', {});
    llm.processHandler = async function* () {
      await Promise.resolve(); // Ensure async context
      // Emit tool call event for streaming
      yield {
        type: 'tool-call',
        toolName: 'dispatch_workflow_complex_flow',
        input: {},
      };
      // Emit tool result
      yield {
        type: 'tool-result',
        result: { success: true },
      };
      // Emit text response
      yield {
        type: 'text-delta',
        text: 'Starting workflow',
      };
    };

    const executor = createAgentExecutor(
      workflowRuntime,
      llm as unknown as AIService,
      contextManager as unknown as ContextManager,
      eventBusManager,
      taskStore,
    );

    createUserMessage(contextId, 'Start long running workflow');
    const requestContext = createSimpleRequestContext(
      'Start long running workflow',
      taskId,
      contextId,
    );

    await executor.execute(requestContext, eventBus);

    // Wait for stream processing to complete (handleStreamingAIProcessing doesn't await)
    await new Promise((resolve) => setTimeout(resolve, 10));

    // When: The task is cancelled
    await executor.cancelTask(taskId, eventBus);

    // Then: The workflow runtime should handle the cancellation
    expect(workflowRuntime.cancelCalls).toContain(taskId);
  });
});

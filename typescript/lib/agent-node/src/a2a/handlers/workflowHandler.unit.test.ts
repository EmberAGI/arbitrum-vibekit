/**
 * Unit tests for WorkflowHandler
 */

import type { ExecutionEventBus } from '@a2a-js/sdk/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { RecordingEventBus } from '../../../tests/utils/mocks/event-bus.mock.js';
import type { WorkflowRuntime } from '../../workflows/runtime.js';
import { ContextManager } from '../sessions/manager.js';

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

vi.mock('../../utils/logger.js', loggerMockFactory);

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

describe('WorkflowHandler.dispatchWorkflow (unit)', () => {
  let eventBus: EventBusDouble;

  beforeEach(() => {
    vi.clearAllMocks();
    eventBus = createEventBus();
  });

  it('returns task ID, metadata, and result parts when workflow is successfully dispatched', async () => {
    // Given: A workflow runtime with a registered plugin
    const mockExecution = {
      id: 'task-wf-123',
      pluginId: 'token_swap',
      state: 'working',
      metadata: { source: 'test' },
      waitForCompletion: vi.fn().mockResolvedValue(undefined),
      on: vi.fn().mockReturnThis(),
      getArtifacts: vi.fn().mockReturnValue([]),
      getError: vi.fn().mockReturnValue(undefined),
      getPauseInfo: vi.fn().mockReturnValue(undefined),
      resume: vi.fn(),
    };

    const mockPlugin = {
      id: 'token_swap',
      name: 'Token Swap',
      description: 'Execute token swaps on DEXs',
      version: '1.0.0',
      execute: vi.fn(),
      dispatchResponseTimeout: 500,
    };

    const dispatchResponseParts = [
      { kind: 'text', text: 'Swap initiated' },
      { kind: 'data', data: { swapId: '12345' } },
    ];

    const mockRuntime: Partial<WorkflowRuntime> = {
      getPlugin: vi.fn().mockReturnValue(mockPlugin),
      dispatch: vi.fn().mockReturnValue(mockExecution),
      waitForFirstYield: vi.fn().mockResolvedValue({
        type: 'dispatch-response',
        parts: dispatchResponseParts,
      }),
      cancelExecution: vi.fn(),
    };

    const { WorkflowHandler } = await import('./workflowHandler.js');
    const handler = new WorkflowHandler(mockRuntime as WorkflowRuntime, new ContextManager());

    // When: A workflow is dispatched
    const result = await handler.dispatchWorkflow(
      'dispatch_workflow_token_swap',
      { fromToken: 'ETH', toToken: 'USDC' },
      eventBus as unknown as ExecutionEventBus,
    );

    // Then: Should return task ID, metadata, and result parts
    expect(result).toEqual({
      result: dispatchResponseParts,
      taskId: 'task-wf-123',
      metadata: {
        workflowName: 'Token Swap',
        description: 'Execute token swaps on DEXs',
        pluginId: 'token_swap',
      },
    });

    // And: Should have called getPlugin with correct plugin ID
    expect(mockRuntime.getPlugin).toHaveBeenCalledWith('token_swap');

    // And: Should have dispatched the workflow with its own contextId
    const dispatchArgs = (mockRuntime.dispatch as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[1] as { contextId?: string; fromToken?: string; toToken?: string };
    expect(dispatchArgs.fromToken).toBe('ETH');
    expect(dispatchArgs.toToken).toBe('USDC');
    expect(typeof dispatchArgs.contextId).toBe('string');
    expect(dispatchArgs.contextId).not.toBe('ctx-test');

    // And: Should have waited for first yield
    expect(mockRuntime.waitForFirstYield).toHaveBeenCalledWith('task-wf-123', 500);
  });

  it('returns empty result array when workflow has no dispatch-response', async () => {
    // Given: A workflow that yields no dispatch-response
    const mockExecution = {
      id: 'task-wf-456',
      pluginId: 'background_task',
      state: 'working',
      metadata: {},
      waitForCompletion: vi.fn().mockResolvedValue(undefined),
      on: vi.fn().mockReturnThis(),
      getArtifacts: vi.fn().mockReturnValue([]),
      getError: vi.fn().mockReturnValue(undefined),
      getPauseInfo: vi.fn().mockReturnValue(undefined),
      resume: vi.fn(),
    };

    const mockPlugin = {
      id: 'background_task',
      name: 'Background Task',
      description: 'Run background tasks',
      version: '1.0.0',
      execute: vi.fn(),
    };

    const mockRuntime: Partial<WorkflowRuntime> = {
      getPlugin: vi.fn().mockReturnValue(mockPlugin),
      dispatch: vi.fn().mockReturnValue(mockExecution),
      waitForFirstYield: vi.fn().mockResolvedValue(null), // No first yield
      cancelExecution: vi.fn(),
    };

    const { WorkflowHandler } = await import('./workflowHandler.js');
    const handler = new WorkflowHandler(mockRuntime as WorkflowRuntime, new ContextManager());

    // When: A workflow is dispatched
    const result = await handler.dispatchWorkflow(
      'dispatch_workflow_background_task',
      {},
      eventBus as unknown as ExecutionEventBus,
    );

    // Then: Should return empty result array
    expect(result.result).toEqual([]);
    expect(result.taskId).toBe('task-wf-456');
    expect(result.metadata).toEqual({
      workflowName: 'Background Task',
      description: 'Run background tasks',
      pluginId: 'background_task',
    });
  });

  it('uses default description when plugin has no description', async () => {
    // Given: A plugin without a description field
    const mockExecution = {
      id: 'task-wf-456',
      pluginId: 'simple_plugin',
      state: 'working',
      metadata: {},
      waitForCompletion: vi.fn().mockResolvedValue(undefined),
      on: vi.fn().mockReturnThis(),
      getArtifacts: vi.fn().mockReturnValue([]),
      getError: vi.fn().mockReturnValue(undefined),
      getPauseInfo: vi.fn().mockReturnValue(undefined),
      resume: vi.fn(),
    };

    const mockPlugin = {
      id: 'simple_plugin',
      name: 'Simple Plugin',
      version: '1.0.0',
      execute: vi.fn(),
    };

    const mockRuntime: Partial<WorkflowRuntime> = {
      getPlugin: vi.fn().mockReturnValue(mockPlugin),
      dispatch: vi.fn().mockReturnValue(mockExecution),
      waitForFirstYield: vi.fn().mockResolvedValue(null),
      cancelExecution: vi.fn(),
    };

    const { WorkflowHandler } = await import('./workflowHandler.js');
    const handler = new WorkflowHandler(mockRuntime as WorkflowRuntime, new ContextManager());

    // When: Workflow is dispatched
    const result = await handler.dispatchWorkflow(
      'dispatch_workflow_simple_plugin',
      {},
      eventBus as unknown as ExecutionEventBus,
    );

    // Then: Should use default description format
    expect(result.metadata.description).toBe('Dispatch Simple Plugin workflow');
  });

  it('throws error when workflow runtime is not available', async () => {
    // Given: A handler without workflow runtime
    const { WorkflowHandler } = await import('./workflowHandler.js');
    const handler = new WorkflowHandler(undefined, new ContextManager());

    // When/Then: Dispatching should throw
    await expect(
      handler.dispatchWorkflow(
        'dispatch_workflow_test',
        {},
        eventBus as unknown as ExecutionEventBus,
      ),
    ).rejects.toThrow('Workflow runtime not available');
  });

  it('throws error when plugin is not found', async () => {
    // Given: A runtime that returns undefined for getPlugin
    const mockRuntime: Partial<WorkflowRuntime> = {
      getPlugin: vi.fn().mockReturnValue(undefined),
    };

    const { WorkflowHandler } = await import('./workflowHandler.js');
    const handler = new WorkflowHandler(mockRuntime as WorkflowRuntime, new ContextManager());

    // When/Then: Dispatching should throw
    await expect(
      handler.dispatchWorkflow(
        'dispatch_workflow_nonexistent',
        {},
        eventBus as unknown as ExecutionEventBus,
      ),
    ).rejects.toThrow('Plugin nonexistent not found');
  });

  it('publishes task and status events to event bus', async () => {
    // Given: A recording event bus to capture events
    const recordingBus = new RecordingEventBus();

    // Given: A workflow runtime with a registered plugin
    const mockExecution = {
      id: 'task-wf-789',
      pluginId: 'lending',
      state: 'working',
      metadata: { protocol: 'aave' },
      waitForCompletion: vi.fn().mockResolvedValue(undefined),
      on: vi.fn().mockReturnThis(),
      getArtifacts: vi.fn().mockReturnValue([]),
      getError: vi.fn().mockReturnValue(undefined),
      getPauseInfo: vi.fn().mockReturnValue(undefined),
      resume: vi.fn(),
    };

    const mockPlugin = {
      id: 'lending',
      name: 'Lending Protocol',
      description: 'Manage lending positions',
      version: '1.0.0',
      execute: vi.fn(),
    };

    const mockRuntime: Partial<WorkflowRuntime> = {
      getPlugin: vi.fn().mockReturnValue(mockPlugin),
      dispatch: vi.fn().mockReturnValue(mockExecution),
      waitForFirstYield: vi.fn().mockResolvedValue(null),
      cancelExecution: vi.fn(),
    };

    const { WorkflowHandler } = await import('./workflowHandler.js');
    const handler = new WorkflowHandler(mockRuntime as WorkflowRuntime, new ContextManager());

    // When: A workflow is dispatched
    await handler.dispatchWorkflow(
      'dispatch_workflow_lending',
      { amount: 1000 },
      recordingBus as unknown as ExecutionEventBus,
    );

    // Then: Should publish task event with submitted state
    const taskEvents = recordingBus.findEventsByKind('task');
    expect(taskEvents.length).toBeGreaterThan(0);

    const taskEvent = taskEvents.find((event) => 'id' in event && event.id === 'task-wf-789');
    expect(taskEvent).toBeDefined();
    if (taskEvent && 'status' in taskEvent) {
      expect(taskEvent.status.state).toBe('submitted');
    }

    // And: Should publish working status update
    const statusUpdates = recordingBus.findEventsByKind('status-update');
    const workingUpdate = statusUpdates.find(
      (event) =>
        'taskId' in event &&
        event.taskId === 'task-wf-789' &&
        'status' in event &&
        event.status.state === 'working',
    );

    expect(workingUpdate).toBeDefined();
  });
});

describe('WorkflowHandler - pause and artifact streaming', () => {
  let eventBus: RecordingEventBus;

  beforeEach(() => {
    vi.clearAllMocks();
    eventBus = new RecordingEventBus();
  });

  it('should publish artifact-update events from workflow execution', async () => {
    // Given: A workflow that emits artifacts
    const mockExecution = {
      id: 'task-artifacts',
      pluginId: 'artifact_workflow',
      state: 'working',
      metadata: { workflow: 'test' },
      waitForCompletion: vi.fn().mockResolvedValue({ success: true }),
      on: vi.fn((event, handler) => {
        if (event === 'artifact') {
          // Simulate artifact emission
          setTimeout(() => {
            handler({
              artifact: {
                artifactId: 'artifact-data',
                name: 'data.json',
                mimeType: 'application/json',
                data: { value: 42 },
              },
            });
            handler({
              artifact: {
                artifactId: 'artifact-report',
                name: 'report.txt',
                mimeType: 'text/plain',
                data: 'Report content',
              },
            });
          }, 10);
        }
        return mockExecution;
      }),
      getArtifacts: vi.fn().mockReturnValue([]),
      getError: vi.fn().mockReturnValue(undefined),
      getPauseInfo: vi.fn().mockReturnValue(undefined),
      resume: vi.fn(),
    };

    const mockPlugin = {
      id: 'artifact_workflow',
      name: 'Artifact Workflow',
      description: 'Workflow that emits artifacts',
      version: '1.0.0',
      execute: vi.fn(),
    };

    const mockRuntime: Partial<WorkflowRuntime> = {
      getPlugin: vi.fn().mockReturnValue(mockPlugin),
      dispatch: vi.fn().mockReturnValue(mockExecution),
      waitForFirstYield: vi.fn().mockResolvedValue(null),
      cancelExecution: vi.fn(),
    };

    const { WorkflowHandler } = await import('./workflowHandler.js');
    const handler = new WorkflowHandler(mockRuntime as WorkflowRuntime, new ContextManager());

    // When: Workflow executes and emits artifacts
    await handler.dispatchWorkflow(
      'dispatch_workflow_artifact_workflow',
      {},
      eventBus as unknown as ExecutionEventBus,
    );

    // Wait for artifacts to be emitted
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Then: Should publish artifact-update events (not message events)
    const artifactUpdates = eventBus.findEventsByKind('artifact-update');
    expect(artifactUpdates.length).toBe(2);

    // Verify each artifact-update has proper structure with taskId
    artifactUpdates.forEach((event) => {
      expect(event).toMatchObject({
        kind: 'artifact-update',
        taskId: 'task-artifacts',
        artifact: expect.objectContaining({
          name: expect.any(String),
          mimeType: expect.any(String),
        }),
        lastChunk: false,
      });
      expect(typeof (event as { contextId?: string }).contextId).toBe('string');
      expect((event as { contextId?: string }).contextId).not.toBe('ctx-test');
    });
  });

  it('should publish status-update with input-required when workflow pauses', async () => {
    // Given: Workflow that pauses
    const mockExecution = {
      id: 'task-paused',
      pluginId: 'pausing_workflow',
      state: 'input-required',
      metadata: {},
      waitForCompletion: vi.fn().mockImplementation(() => new Promise(() => {})), // Never resolves
      on: vi.fn((event, handler) => {
        if (event === 'pause') {
          // Simulate pause event
          setTimeout(() => handler({ state: 'input-required', message: 'Need input' }), 10);
        }
        return mockExecution;
      }),
      getArtifacts: vi.fn().mockReturnValue([]),
      getError: vi.fn().mockReturnValue(undefined),
      getPauseInfo: vi.fn().mockReturnValue(undefined),
      resume: vi.fn(),
    };

    const mockPlugin = {
      id: 'pausing_workflow',
      name: 'Pausing Workflow',
      version: '1.0.0',
      execute: vi.fn(),
    };

    const mockRuntime: Partial<WorkflowRuntime> = {
      getPlugin: vi.fn().mockReturnValue(mockPlugin),
      dispatch: vi.fn().mockReturnValue(mockExecution),
      waitForFirstYield: vi.fn().mockResolvedValue(null),
      cancelExecution: vi.fn(),
    };

    const { WorkflowHandler } = await import('./workflowHandler.js');
    const handler = new WorkflowHandler(mockRuntime as WorkflowRuntime, new ContextManager());

    // When: Workflow is dispatched and pauses
    await handler.dispatchWorkflow(
      'dispatch_workflow_pausing_workflow',
      {},
      eventBus as unknown as ExecutionEventBus,
    );

    // Wait for pause event
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Then: Should publish input-required status update
    const statusUpdates = eventBus.findEventsByKind('status-update');
    const pausedUpdate = statusUpdates.find((u) => u.status.state === 'input-required');
    expect(pausedUpdate).toBeDefined();
    expect(pausedUpdate?.taskId).toBe('task-paused');
  });

  it('should publish artifacts after workflow resumes', async () => {
    // Given: A paused workflow that will emit artifacts after resume
    const mockExecution = {
      id: 'task-resume-artifacts',
      pluginId: 'resume_artifact_workflow',
      state: 'input-required',
      metadata: {},
      waitForCompletion: vi.fn().mockResolvedValue({ success: true }),
      on: vi.fn((event, handler) => {
        // Store artifact handler for later use
        if (event === 'artifact') {
          mockExecution._artifactHandler = handler;
        }
        return mockExecution;
      }),
      resume: vi.fn(async (input) => {
        // Simulate execution.resume() emitting artifacts
        if (mockExecution._artifactHandler) {
          setTimeout(() => {
            mockExecution._artifactHandler({
              artifact: {
                artifactId: 'artifact-post-resume',
                name: 'post-resume.json',
                mimeType: 'application/json',
                data: { resumed: true, input },
              },
            });
          }, 10);
        }
        return { valid: true };
      }),
      getArtifacts: vi.fn().mockReturnValue([]),
      getError: vi.fn().mockReturnValue(undefined),
      getPauseInfo: vi.fn().mockReturnValue(undefined),
      _artifactHandler: undefined as ((artifact: unknown) => void) | undefined,
    };

    const mockPlugin = {
      id: 'resume_artifact_workflow',
      name: 'Resume Artifact Workflow',
      version: '1.0.0',
      execute: vi.fn(),
    };

    const mockGenerator = {
      next: vi.fn().mockResolvedValue({
        value: { type: 'status-update', message: 'Working' },
        done: false,
      }),
    };

    const mockRuntime: Partial<WorkflowRuntime> = {
      getPlugin: vi.fn().mockReturnValue(mockPlugin),
      dispatch: vi.fn().mockReturnValue(mockExecution),
      waitForFirstYield: vi.fn().mockResolvedValue(null),
      cancelExecution: vi.fn(),
      getExecution: vi.fn().mockReturnValue(mockExecution),
      getTaskState: vi.fn().mockReturnValue({
        state: 'input-required',
        pauseInfo: { inputSchema: { type: 'object', properties: {} } },
        workflowGenerator: mockGenerator,
      }),
    };

    const { WorkflowHandler } = await import('./workflowHandler.js');
    const handler = new WorkflowHandler(mockRuntime as WorkflowRuntime, new ContextManager());

    // When: Workflow is dispatched
    await handler.dispatchWorkflow(
      'dispatch_workflow_resume_artifact_workflow',
      {},
      eventBus as unknown as ExecutionEventBus,
    );

    // Clear events from dispatch
    await new Promise((resolve) => setTimeout(resolve, 50));
    const artifactsBeforeResume = eventBus.findEventsByKind('artifact-update');

    // When: Workflow resumes
    const taskState = mockRuntime.getTaskState!('task-resume-artifacts');
    await handler.resumeWorkflow(
      'task-resume-artifacts',
      'ctx-test',
      '',
      { data: 'test' },
      taskState!,
      eventBus as unknown as ExecutionEventBus,
    );

    // Wait for artifacts to be emitted
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Then: Should publish artifact-update events after resume
    const artifactsAfterResume = eventBus.findEventsByKind('artifact-update');

    // Verify we got new artifacts after resume
    expect(artifactsAfterResume.length).toBeGreaterThan(artifactsBeforeResume.length);

    // Verify the post-resume artifact contains expected data
    const postResumeArtifact = artifactsAfterResume.find(
      (event) =>
        event.taskId === 'task-resume-artifacts' &&
        'artifact' in event &&
        typeof event.artifact === 'object' &&
        event.artifact !== null &&
        'name' in event.artifact &&
        event.artifact.name === 'post-resume.json',
    );
    expect(postResumeArtifact).toBeDefined();
    expect(postResumeArtifact).toMatchObject({
      kind: 'artifact-update',
      taskId: 'task-resume-artifacts',
      lastChunk: false,
    });
    expect(typeof (postResumeArtifact as { contextId?: string }).contextId).toBe('string');
    expect((postResumeArtifact as { contextId?: string }).contextId).not.toBe('ctx-test');
  });
});

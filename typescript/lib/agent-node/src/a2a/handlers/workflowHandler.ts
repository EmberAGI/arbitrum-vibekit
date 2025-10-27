/**
 * Workflow handling for A2A Agent Executor
 */

import type {
  Artifact,
  DataPart,
  Message,
  Task,
  TaskArtifactUpdateEvent,
  TaskStatus,
  TaskStatusUpdateEvent,
  TextPart,
  Part,
} from '@a2a-js/sdk';
import {
  type ExecutionEventBus,
  type ExecutionEventBusManager,
  ExecutionEventQueue,
  ResultManager,
  type TaskStore,
} from '@a2a-js/sdk/server';
import { v7 as uuidv7 } from 'uuid';
import z from 'zod';

import { canonicalizeName } from '../../config/validators/tool-validator.js';
import { Logger } from '../../utils/logger.js';
import type { WorkflowRuntime } from '../../workflows/runtime.js';
import type { ContextManager } from '../sessions/manager.js';
import type { ActiveTask, TaskState, WorkflowEvent } from '../types.js';

/**
 * Type guards
 */
function hasEventEmitter(
  obj: unknown,
): obj is { on: (event: string, handler: (...args: unknown[]) => void) => void } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'on' in obj &&
    typeof (obj as { on: unknown }).on === 'function'
  );
}

/**
 * Extract error details for A2A protocol status updates
 * Returns both human-readable text and machine-readable structured data
 */
function extractErrorDetails(error: unknown): {
  text: string;
  data: {
    errorType: string;
    errorCode?: string;
    stack?: string;
    context?: Record<string, unknown>;
  };
} {
  const includeStack = (process.env['LOG_LEVEL'] || 'info').toUpperCase() === 'DEBUG';

  if (error instanceof Error) {
    return {
      text: error.message || 'Workflow execution failed',
      data: {
        errorType: error.name || 'Error',
        errorCode: (error as { code?: string }).code,
        ...(includeStack && error.stack ? { stack: error.stack } : {}),
        ...(typeof error === 'object' && 'context' in error && typeof error.context === 'object'
          ? { context: error.context as Record<string, unknown> }
          : {}),
      },
    };
  }

  // Handle non-Error objects
  const errorString = String(error);
  return {
    text: errorString || 'Unknown workflow error',
    data: {
      errorType: 'Unknown',
      context: {
        rawError: typeof error === 'object' && error !== null ? { ...error } : errorString,
      },
    },
  };
}

/**
 * Handles workflow-related operations for the agent executor
 */
export class WorkflowHandler {
  private activeTasks = new Map<string, ActiveTask>();
  private pendingCancels = new Set<string>();
  private logger: Logger;
  private contextTaskMap = new Map<string, string>();

  constructor(
    private workflowRuntime: WorkflowRuntime | undefined,
    private contextManager: ContextManager,
    private eventBusManager?: ExecutionEventBusManager,
    private taskStore?: TaskStore,
  ) {
    this.logger = Logger.getInstance('WorkflowHandler');
    if (this.taskStore) {
      const originalLoad = this.taskStore.load.bind(this.taskStore);
      this.taskStore.load = async (taskId: string): Promise<Task | undefined> => {
        const task = await originalLoad(taskId);
        this.logger.debug('taskStore.load', {
          taskId,
          found: !!task,
          state: task?.status?.state,
        });
        return task;
      };
    }
  }

  registerContextTask(contextId: string, taskId: string): void {
    this.contextTaskMap.set(contextId, taskId);
  }

  resolveTaskIdForContext(contextId: string): string | undefined {
    return this.contextTaskMap.get(contextId);
  }

  getEventBusByTaskId(taskId: string): ExecutionEventBus | undefined {
    return this.eventBusManager?.getByTaskId(taskId);
  }

  /**
   * Resumes a paused workflow
   */
  async resumeWorkflow(
    taskId: string,
    contextId: string,
    messageContent: string,
    messageData: unknown,
    taskState: TaskState,
    eventBus: ExecutionEventBus,
  ): Promise<void> {
    this.logger.debug('resumeWorkflow called', {
      taskId,
      contextId,
      taskState: taskState.state,
      hasMessageData: messageData !== undefined,
    });

    // Get the execution object - this has the event listeners set up in dispatchWorkflow()
    const execution = this.workflowRuntime?.getExecution(taskId);

    if (!execution) {
      // No execution available - can't resume
      const errorMessage: Message = {
        kind: 'message',
        messageId: uuidv7(),
        contextId,
        role: 'agent',
        parts: [
          {
            kind: 'text',
            text: `Cannot resume task ${taskId}. Workflow execution not available.`,
          } as TextPart,
        ],
      };

      eventBus.publish(errorMessage);
      eventBus.finished();
      return;
    }

    try {
      // Resume the workflow with the input
      const input = messageData ?? messageContent;

      // Use execution.resume() instead of calling generator.next() directly
      // This ensures event listeners (set up in dispatchWorkflow) are triggered
      this.logger.debug('[RESUME] About to call execution.resume()', { taskId, input });
      const resumeResult = await execution.resume(input);
      this.logger.debug('[RESUME] execution.resume() returned', {
        taskId,
        valid: resumeResult.valid,
      });

      let responseMetadata: Record<string, unknown> | undefined;
      if (resumeResult && typeof resumeResult === 'object' && 'metadata' in resumeResult) {
        const metadataCandidate = (resumeResult as { metadata?: unknown }).metadata;
        if (metadataCandidate && typeof metadataCandidate === 'object') {
          responseMetadata = metadataCandidate as Record<string, unknown>;
        }
      }

      // Handle resume result
      if (!resumeResult.valid) {
        // Validation failed - publish error and keep task paused
        const errors = Array.isArray(resumeResult.errors) ? resumeResult.errors : [];
        const messageText = errors.length
          ? errors
              .map((err: unknown) => (typeof err === 'string' ? err : JSON.stringify(err)))
              .join('\n')
          : 'Input validation failed.';

        const statusUpdate: TaskStatusUpdateEvent = {
          kind: 'status-update',
          taskId,
          contextId,
          status: {
            state: taskState.state,
            message: {
              kind: 'message',
              messageId: uuidv7(),
              contextId,
              role: 'agent',
              parts: [{ kind: 'text', text: messageText } as TextPart],
            },
          },
          final: false,
        };
        eventBus.publish(statusUpdate);
        eventBus.finished();
        return;
      }

      // Validation succeeded - publish working status with metadata
      const metadata = responseMetadata ?? execution.metadata;
      if (metadata) {
        const task: Task = {
          kind: 'task',
          id: taskId,
          contextId,
          status: {
            state: 'working',
          },
          metadata,
        };
        eventBus.publish(task);
      }

      const statusUpdate: TaskStatusUpdateEvent = {
        kind: 'status-update',
        taskId,
        contextId,
        status: {
          state: 'working',
        },
        final: false,
      };
      eventBus.publish(statusUpdate);

      // Event listeners (set up in dispatchWorkflow) will handle:
      // - Artifacts emitted after resume
      // - Status updates
      // - Pause events
      // - Completion/error events
    } catch (error: unknown) {
      // Error resuming workflow
      const errorMessage: Message = {
        kind: 'message',
        messageId: uuidv7(),
        contextId,
        role: 'agent',
        parts: [
          {
            kind: 'text',
            text: `Failed to resume workflow: ${error instanceof Error ? error.message : String(error)}`,
          } as TextPart,
        ],
      };

      eventBus.publish(errorMessage);
    }

    this.logger.debug('resumeWorkflow finished', { taskId, contextId });
  }

  /**
   * Dispatches a new workflow
   */
  async dispatchWorkflow(
    workflowName: string,
    params: unknown,
    eventBus: ExecutionEventBus,
  ): Promise<{
    result: Part[];
    taskId: string;
    metadata: { workflowName: string; description: string; pluginId: string };
  }> {
    this.logger.debug('dispatchWorkflow called', { workflowName, params });
    if (!this.workflowRuntime) {
      this.logger.error('Workflow runtime not available');
      throw new Error('Workflow runtime not available');
    }

    try {
      // Extract plugin ID from workflow name
      const rawPluginId = workflowName.replace('dispatch_workflow_', '');
      // Canonicalize the plugin ID to match how it's stored in the runtime
      const pluginId = canonicalizeName(rawPluginId);
      this.logger.debug('Extracted plugin ID', { rawPluginId, pluginId });

      // Get plugin metadata
      const registeredPlugins = this.workflowRuntime.listPlugins
        ? this.workflowRuntime.listPlugins()
        : [];
      this.logger.debug('Registered plugins in runtime', { registeredPlugins });

      const plugin = this.workflowRuntime.getPlugin(pluginId);
      if (!plugin) {
        this.logger.error('Plugin not found', {
          pluginId,
          rawPluginId,
          registeredPlugins,
          hasGetPlugin: typeof this.workflowRuntime.getPlugin === 'function',
        });
        throw new Error(`Plugin ${pluginId} not found`);
      }

      // Create a dedicated workflow context independent of parent
      const context = this.contextManager.createContext();
      const workflowContextId = context.contextId;
      this.logger.debug('Created new context for workflow', { workflowContextId });

      // Dispatch workflow - this creates a task via the runtime
      const workflowParams =
        typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : {};
      this.logger.debug('Workflow params', { workflowParams });
      const execution = this.workflowRuntime.dispatch(pluginId, {
        ...workflowParams,
        contextId: workflowContextId,
      });

      // Create a child-specific event bus for this workflow task
      const childEventBus = this.eventBusManager?.createOrGetByTaskId(execution.id) ?? eventBus;

      // Start persistence loop for child bus events BEFORE setting up handlers
      let persistenceLoopPromise: Promise<void> | undefined;
      let persistenceQueue: ExecutionEventQueue | undefined;
      let resolveFirstEvent: (() => void) | undefined;
      let firstEventProcessed: Promise<void> = Promise.resolve();
      let firstEventResolved = false;
      let hasStatusEvent = false;
      const pendingChildEvents: Array<Message | TaskStatusUpdateEvent | TaskArtifactUpdateEvent> =
        [];

      this.logger.debug('Checking persistence requirements', {
        hasTaskStore: !!this.taskStore,
        hasEventBusManager: !!this.eventBusManager,
        childTaskId: execution.id,
      });

      if (this.taskStore && this.eventBusManager) {
        const taskStore = this.taskStore; // Capture for closure

        persistenceQueue = new ExecutionEventQueue(childEventBus);
        const childResultManager = new ResultManager(taskStore);

        // Track when the first event has been fully processed
        firstEventProcessed = new Promise<void>((resolve) => {
          resolveFirstEvent = resolve;
        });

        persistenceLoopPromise = (async () => {
          this.logger.debug('Started persistence loop for child task', { taskId: execution.id });

          try {
            let isFirstEvent = true;
            for await (const event of persistenceQueue.events()) {
              await childResultManager.processEvent(event);
              const currentTask = childResultManager.getCurrentTask();
              this.logger.debug('Persisted child event', {
                taskId: execution.id,
                eventKind: event.kind,
                persistedState: currentTask?.status?.state,
                artifactCount: currentTask?.artifacts?.length ?? 0,
              });

              // Signal that first event has been processed and stored
              if (isFirstEvent) {
                this.logger.debug('First event processed for child task', {
                  taskId: execution.id,
                  eventKind: event.kind,
                });
                resolveFirstEvent?.();
                firstEventResolved = true;
                if (pendingChildEvents.length > 0) {
                  this.logger.debug('Flushing buffered child events', {
                    taskId: execution.id,
                    count: pendingChildEvents.length,
                  });
                  while (pendingChildEvents.length > 0) {
                    const bufferedEvent = pendingChildEvents.shift();
                    if (bufferedEvent) {
                      childEventBus.publish(bufferedEvent);
                    }
                  }
                }
                isFirstEvent = false;
              }
            }
          } catch (error) {
            this.logger.error('Error in child persistence loop', error, { taskId: execution.id });
          } finally {
            this.logger.debug('Persistence loop ended for child task', { taskId: execution.id });
          }
        })();
      } else {
        firstEventResolved = true;
      }

      const executionId = execution.id;

      const publishChildEvent = (
        event: Message | TaskStatusUpdateEvent | TaskArtifactUpdateEvent,
      ): void => {
        if (firstEventResolved) {
          this.logger.debug('Publishing child event', {
            taskId: executionId,
            eventKind: event.kind,
          });
          childEventBus.publish(event);
        } else {
          pendingChildEvents.push(event);
        }
      };

      // Set up event handlers immediately; publish after first task persistence completes
      if (hasEventEmitter(execution)) {
        this.logger.debug('Setting up event handlers for workflow', { taskId: execution.id });

        execution.on('artifact', (data: unknown) => {
          const { artifact, append, lastChunk, metadata } = data as {
            artifact: Artifact;
            append?: boolean;
            lastChunk?: boolean;
            metadata?: Record<string, unknown>;
          };
          this.logger.debug('[EVENT] Workflow emitted artifact', {
            taskId: execution.id,
            artifactId: artifact.artifactId,
            append,
            lastChunk,
          });
          const artifactUpdate: TaskArtifactUpdateEvent = {
            kind: 'artifact-update',
            taskId: execution.id,
            contextId: workflowContextId,
            artifact,
            append,
            lastChunk: lastChunk ?? false,
            metadata,
          };

          publishChildEvent(artifactUpdate);
        });

        execution.on('update', (update: unknown) => {
          const workflowUpdate = update as WorkflowEvent & {
            message?: Message;
            status?: TaskStatus;
          };
          if (workflowUpdate?.type === 'status' && workflowUpdate?.status) {
            const statusUpdate: TaskStatusUpdateEvent = {
              kind: 'status-update',
              taskId: execution.id,
              contextId: workflowContextId,
              status: workflowUpdate.status,
              final: false,
            };

            hasStatusEvent = true;

            publishChildEvent(statusUpdate);
          } else if (workflowUpdate?.type === 'status-update' && workflowUpdate?.message) {
            const statusUpdate: TaskStatusUpdateEvent = {
              kind: 'status-update',
              taskId: execution.id,
              contextId: workflowContextId,
              status: {
                state: execution.state as TaskStatus['state'],
                message: workflowUpdate.message,
              } as TaskStatus,
              final: false,
            };

            hasStatusEvent = true;

            publishChildEvent(statusUpdate);
          }
        });

        execution.on('pause', (pauseInfo: unknown) => {
          this.logger.debug('[EVENT] Workflow emitting pause event', {
            taskId: execution.id,
            pauseInfo,
          });
          const workflowPauseInfo = pauseInfo as WorkflowEvent;
          const parts: Part[] = [];
          if (
            workflowPauseInfo?.message &&
            workflowPauseInfo?.inputSchema &&
            typeof workflowPauseInfo.inputSchema === 'object'
          ) {
            const jsonSchema = z.toJSONSchema(
              workflowPauseInfo.inputSchema as z.ZodObject<Record<string, z.ZodTypeAny>>,
              { target: 'draft-7' },
            );
            parts.push({
              kind: 'text',
              text: workflowPauseInfo.message,
              metadata: { schema: jsonSchema, mimeType: 'application/json' },
            });
          }

          const statusUpdate: TaskStatusUpdateEvent = {
            kind: 'status-update',
            taskId: execution.id,
            contextId: workflowContextId,
            status: {
              state:
                (workflowPauseInfo?.state as TaskStatus['state']) ||
                ('input-required' as TaskStatus['state']),
              message: {
                kind: 'message',
                messageId: uuidv7(),
                contextId: workflowContextId,
                role: 'agent',
                parts,
              },
            },
            final: false,
          };

          hasStatusEvent = true;

          publishChildEvent(statusUpdate);
        });

        execution.on('error', (err: unknown) => {
          const errorDetails = extractErrorDetails(err);

          const failedUpdate: TaskStatusUpdateEvent = {
            kind: 'status-update',
            taskId: execution.id,
            contextId: workflowContextId,
            status: {
              state: 'failed',
              message: {
                kind: 'message',
                messageId: uuidv7(),
                contextId: workflowContextId,
                role: 'agent',
                parts: [
                  { kind: 'text', text: errorDetails.text } as TextPart,
                  { kind: 'data', data: errorDetails.data } as DataPart,
                ],
              },
            },
            final: true,
          };

          hasStatusEvent = true;

          publishChildEvent(failedUpdate);
        });

        execution.on('reject', (rejectInfo: unknown) => {
          this.logger.debug('Workflow rejected', { taskId: execution.id, rejectInfo });
          const workflowRejectInfo = rejectInfo as { reason: string };

          const rejectedUpdate: TaskStatusUpdateEvent = {
            kind: 'status-update',
            taskId: execution.id,
            contextId: workflowContextId,
            status: {
              state: 'rejected',
              message: {
                kind: 'message',
                messageId: uuidv7(),
                contextId: workflowContextId,
                role: 'agent',
                parts: [
                  {
                    kind: 'text',
                    text: workflowRejectInfo.reason,
                  } as TextPart,
                ],
              },
            },
            final: true,
          };

          hasStatusEvent = true;

          publishChildEvent(rejectedUpdate);
        });
      }

      // Create task event for the new workflow
      const task: Task = {
        kind: 'task',
        id: execution.id,
        contextId: workflowContextId,
        status: {
          state: 'submitted',
        },
        metadata: execution.metadata,
      };

      this.logger.debug('Created task', { task });
      // Publish task creation on the child bus (queue will buffer it)
      childEventBus.publish(task);
      this.registerContextTask(workflowContextId, execution.id);
      // Track task in the new workflow session
      this.contextManager?.addTask?.(workflowContextId, execution.id);

      // Wait for the Task event to be fully processed and stored
      await firstEventProcessed;
      this.logger.debug('Task event processed and stored, continuing with workflow', {
        taskId: execution.id,
      });

      // Verify task is actually in the store
      if (this.taskStore) {
        const storedTask = await this.taskStore.load(execution.id);
        this.logger.debug('Verified task in store', {
          taskId: execution.id,
          taskFound: !!storedTask,
          taskState: storedTask?.status?.state,
        });
      }

      // NOW set up event handlers AFTER task is persisted to avoid race conditions
      // Event handlers publish via first-event gating to avoid race conditions

      // Create abort controller
      const abortController = new AbortController();

      let aborted = false;
      const completionPromise = Promise.resolve(execution.waitForCompletion());
      const abortPromise = new Promise<void>((resolve) => {
        const onAbort = (): void => {
          aborted = true;
          if (typeof this.workflowRuntime?.cancelExecution === 'function') {
            try {
              this.workflowRuntime.cancelExecution(execution.id);
            } catch {
              // Ignore cancellation errors
            }
          }
          resolve();
        };

        if (abortController.signal.aborted) {
          void onAbort();
        } else {
          abortController.signal.addEventListener(
            'abort',
            () => {
              void onAbort();
            },
            { once: true },
          );
        }
      });

      this.activeTasks.set(execution.id, {
        controller: abortController,
        contextId: workflowContextId,
      });

      if (this.pendingCancels.has(execution.id)) {
        this.pendingCancels.delete(execution.id);
        abortController.abort();
      }

      // Update to working state AFTER handlers are set up to ensure proper event ordering
      if (!hasStatusEvent) {
        const workingUpdate: TaskStatusUpdateEvent = {
          kind: 'status-update',
          taskId: execution.id,
          contextId: workflowContextId,
          status: {
            state: 'working',
          },
          final: false,
        };
        // Publish working state on child bus
        childEventBus.publish(workingUpdate);
      }

      // Event handlers have been set up above to avoid race conditions

      const monitorExecution = async (): Promise<void> => {
        try {
          await Promise.race([completionPromise, abortPromise]);

          this.activeTasks.delete(execution.id);

          if (aborted) {
            const canceledUpdate: TaskStatusUpdateEvent = {
              kind: 'status-update',
              taskId: execution.id,
              contextId: workflowContextId,
              status: {
                state: 'canceled',
              },
              final: true,
            };
            // Publish cancellation on child bus
            childEventBus.publish(canceledUpdate);
            return;
          }

          await completionPromise;

          // Check final state
          if (execution.state === 'completed') {
            const completedUpdate: TaskStatusUpdateEvent = {
              kind: 'status-update',
              taskId: execution.id,
              contextId: workflowContextId,
              status: {
                state: 'completed',
              },
              final: true,
            };
            // Publish completion on child bus
            childEventBus.publish(completedUpdate);
          } else if (execution.state === 'failed') {
            // Extract error details if available
            const error = execution.error;
            const errorDetails = extractErrorDetails(error);

            const failedUpdate: TaskStatusUpdateEvent = {
              kind: 'status-update',
              taskId: execution.id,
              contextId: workflowContextId,
              status: {
                state: 'failed',
                message: {
                  kind: 'message',
                  messageId: uuidv7(),
                  contextId: workflowContextId,
                  role: 'agent',
                  parts: [
                    { kind: 'text', text: errorDetails.text } as TextPart,
                    { kind: 'data', data: errorDetails.data } as DataPart,
                  ],
                },
              },
              final: true,
            };
            // Publish failure on child bus
            childEventBus.publish(failedUpdate);
          } else if (execution.state === 'canceled') {
            const canceledUpdate: TaskStatusUpdateEvent = {
              kind: 'status-update',
              taskId: execution.id,
              contextId: workflowContextId,
              status: {
                state: 'canceled',
              },
              final: true,
            };
            // Publish cancellation on child bus
            childEventBus.publish(canceledUpdate);
          } else if (execution.state === 'rejected') {
            // Note: reject event handler should have already published this,
            // but include fallback for completeness
            const rejectedUpdate: TaskStatusUpdateEvent = {
              kind: 'status-update',
              taskId: execution.id,
              contextId: workflowContextId,
              status: {
                state: 'rejected',
              },
              final: true,
            };
            // Publish rejection on child bus
            childEventBus.publish(rejectedUpdate);
          }
        } catch (error: unknown) {
          const errorMessage: Message = {
            kind: 'message',
            messageId: uuidv7(),
            contextId: workflowContextId,
            role: 'agent',
            parts: [
              {
                kind: 'text',
                text: `Failed to dispatch workflow: ${error instanceof Error ? error.message : String(error)}`,
              } as TextPart,
            ],
          };
          // Publish error message on child bus
          childEventBus.publish(errorMessage);
        } finally {
          // Allow time for final events to be processed by the persistence loop
          // This ensures final status updates are stored before cleanup
          await new Promise((resolve) => setTimeout(resolve, 100));

          // Call finished on child bus to complete the child stream
          childEventBus.finished();

          // Clean up persistence loop after workflow completes
          if (persistenceQueue) {
            this.logger.debug('Stopping persistence queue for child task', {
              taskId: execution.id,
            });
            persistenceQueue.stop();
          }

          if (persistenceLoopPromise) {
            this.logger.debug('Waiting for persistence loop to complete', { taskId: execution.id });
            await persistenceLoopPromise;
          }

          if (this.eventBusManager) {
            this.eventBusManager.cleanupByTaskId(execution.id);
            this.logger.debug('Cleaned up persistence loop for child task', {
              taskId: execution.id,
            });
            if (this.contextTaskMap.get(workflowContextId) === execution.id) {
              this.contextTaskMap.delete(workflowContextId);
            }
          }
        }
      };

      this.logger.debug('Starting execution monitor');
      void monitorExecution();
      await Promise.resolve();

      // Try to get dispatch response from first yield
      const timeout = plugin.dispatchResponseTimeout ?? 500;
      this.logger.debug('Waiting for first yield', { taskId: execution.id, timeout });
      const firstYield = await this.workflowRuntime.waitForFirstYield(execution.id, timeout);

      let result: Part[] = [];
      if (firstYield && firstYield.type === 'dispatch-response') {
        this.logger.debug('Got dispatch-response from workflow', {
          taskId: execution.id,
          partsCount: firstYield.parts.length,
        });
        result = firstYield.parts as Part[];
      }

      // Return task ID, workflow metadata, and result parts for SDK
      return {
        result,
        taskId: execution.id,
        metadata: {
          workflowName: plugin.name,
          description: plugin.description || `Dispatch ${plugin.name} workflow`,
          pluginId: plugin.id,
        },
      };
    } catch (error: unknown) {
      this.logger.error('Error in dispatchWorkflow', error);
      throw error;
    }
  }

  /**
   * Cancels a task
   */
  cancelTask(taskId: string): void {
    const active = this.activeTasks.get(taskId);
    if (active) {
      this.activeTasks.delete(taskId);
      active.controller.abort();

      if (typeof this.workflowRuntime?.cancelExecution === 'function') {
        try {
          this.workflowRuntime.cancelExecution(taskId);
        } catch {
          // Ignore cancellation errors
        }
      }
      return;
    }

    this.pendingCancels.add(taskId);

    if (typeof this.workflowRuntime?.cancelExecution === 'function') {
      try {
        this.workflowRuntime.cancelExecution(taskId);
      } catch {
        // Ignore cancellation errors
      }
    }
  }

  /**
   * Gets task state from the workflow runtime
   */
  getTaskState(taskId: string): TaskState | undefined {
    const state = this.workflowRuntime?.getTaskState?.(taskId) as TaskState | undefined;
    this.logger.debug('getTaskState', {
      taskId,
      state: state?.state,
      found: !!state,
    });
    return state;
  }
}

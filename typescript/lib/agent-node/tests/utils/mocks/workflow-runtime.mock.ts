import { WorkflowRuntime } from '../../../src/workflows/runtime.js';
import type {
  ResumeResult,
  WorkflowExecution,
  WorkflowPlugin,
  PauseInfo,
} from '../../../src/workflows/types.js';

type TaskStateRecord = {
  state: string;
  workflowGenerator?: AsyncGenerator<unknown, unknown, unknown>;
  pauseInfo?: PauseInfo;
  final?: boolean;
  error?: unknown;
  validationErrors?: unknown[];
};

type ResumeWorkflowHandler = (taskId: string, input: unknown) => Promise<ResumeResult>;

type DispatchHandler = (pluginId: string, context: unknown) => WorkflowExecution;

/**
 * Stub implementation of WorkflowRuntime for testing
 * Tracks all method calls and allows configurable behavior
 */
export class StubWorkflowRuntime extends WorkflowRuntime {
  public readonly getTaskStateCalls: string[] = [];
  public readonly resumeCalls: Array<{ taskId: string; input: unknown }> = [];
  public readonly dispatchCalls: Array<{ pluginId: string; context: unknown }> = [];
  public readonly cancelCalls: string[] = [];

  // Use different names to avoid conflicts with base class private members
  private testTaskStates = new Map<string, TaskStateRecord>();
  private testPlugins = new Map<string, WorkflowPlugin>();
  private testExecutions = new Map<string, WorkflowExecution>();
  private resumeHandler?: ResumeWorkflowHandler;
  private dispatchHandler?: DispatchHandler;
  private pluginList: string[] = [];

  setTaskState(taskId: string, state: TaskStateRecord): void {
    this.testTaskStates.set(taskId, state);

    // Auto-create a mock execution for this task
    if (!this.testExecutions.has(taskId)) {
      const mockExecution: WorkflowExecution = {
        id: taskId,
        pluginId: 'test-plugin',
        state: state.state as any,
        context: { contextId: 'test-ctx', taskId },
        startedAt: new Date(),
        waitForCompletion: async () => Promise.resolve({}),
        on: () => mockExecution,
        getArtifacts: () => [],
        getError: () => undefined,
        getPauseInfo: () => state.pauseInfo,
        resume: async (input: unknown) => {
          // Track the resume call
          this.resumeCalls.push({ taskId, input });
          // Use the handler if configured
          if (this.resumeHandler) {
            return this.resumeHandler(taskId, input);
          }
          return { valid: true };
        },
      };
      this.testExecutions.set(taskId, mockExecution);
    }
  }

  setResumeWorkflowHandler(handler: ResumeWorkflowHandler): void {
    this.resumeHandler = handler;
  }

  setDispatchHandler(handler: DispatchHandler): void {
    this.dispatchHandler = handler;
  }

  setPluginList(plugins: string[]): void {
    this.pluginList = plugins;
  }

  setPlugin(plugin: WorkflowPlugin): void {
    this.testPlugins.set(plugin.id, plugin);
  }

  override getTaskState(taskId: string): TaskStateRecord | undefined {
    this.getTaskStateCalls.push(taskId);
    return this.testTaskStates.get(taskId);
  }

  override getPlugin(pluginId: string): WorkflowPlugin | undefined {
    return this.testPlugins.get(pluginId);
  }

  override getExecution(executionId: string): WorkflowExecution | undefined {
    return this.testExecutions.get(executionId);
  }

  override async resumeWorkflow(taskId: string, input: unknown): Promise<ResumeResult> {
    this.resumeCalls.push({ taskId, input });
    if (this.resumeHandler) {
      return this.resumeHandler(taskId, input);
    }
    return Promise.resolve({ valid: true } satisfies ResumeResult);
  }

  override dispatch(pluginId: string, context: unknown): WorkflowExecution {
    this.dispatchCalls.push({ pluginId, context });
    if (!this.dispatchHandler) {
      throw new Error('Dispatch handler not configured');
    }
    return this.dispatchHandler(pluginId, context);
  }

  override cancelExecution(executionId: string): boolean {
    this.cancelCalls.push(executionId);
    return true;
  }

  override listPlugins(): string[] {
    return this.pluginList;
  }

  /**
   * Clear all tracked calls
   */
  clearCalls(): void {
    this.getTaskStateCalls.length = 0;
    this.resumeCalls.length = 0;
    this.dispatchCalls.length = 0;
    this.cancelCalls.length = 0;
  }

  /**
   * Reset all state and handlers
   */
  reset(): void {
    this.clearCalls();
    this.testTaskStates.clear();
    this.testExecutions.clear();
    this.resumeHandler = undefined;
    this.dispatchHandler = undefined;
    this.pluginList = [];
    this.testPlugins.clear();
  }
}

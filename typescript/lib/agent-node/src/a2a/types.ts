/**
 * Internal types for the A2A Agent Executor system
 */

import type { TaskStatus } from '@a2a-js/sdk';

/**
 * Internal task state interface (uses SDK TaskStatus type)
 */
export interface TaskState {
  state: TaskStatus['state'];
  workflowGenerator?: {
    next: (input: unknown) => Promise<IteratorResult<unknown, unknown>>;
  };
  [key: string]: unknown;
}

/**
 * Workflow result interfaces
 */
export interface WorkflowResult {
  valid?: boolean;
  errors?: unknown[];
  value?: IteratorResult<unknown, unknown>;
  type?: string;
  error?: {
    message: string;
    [key: string]: unknown;
  };
  status?: unknown;
  message?: unknown;
  done?: boolean;
  [key: string]: unknown;
}

/**
 * Internal workflow event interface
 */
export interface WorkflowEvent {
  type?: string;
  status?: unknown;
  message?: string;
  state?: string;
  inputSchema?: unknown;
}

/**
 * Active task tracking
 */
export interface ActiveTask {
  controller: AbortController;
  contextId: string;
}

/**
 * Common error message extraction
 */
export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Unknown error';
}

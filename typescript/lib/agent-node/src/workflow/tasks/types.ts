import type { TaskState } from '@a2a-js/sdk';

export interface WorkflowTask {
  id: string;
  contextId: string;
  state: TaskState;
  metadata?: Record<string, unknown>;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  canceledAt?: string;
  result?: unknown;
  error?: {
    message: string;
    code?: string;
  };
  pauseInfo?: {
    inputSpec?: Record<string, unknown>;
    message?: string;
    action?: string;
  };
}

export interface WorkflowTaskHistoryEntry {
  state: TaskState;
  timestamp: string;
  details?: Record<string, unknown>;
}

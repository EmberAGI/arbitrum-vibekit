import type { TaskState } from '@a2a-js/sdk';

export const validTransitions: Record<TaskState, readonly TaskState[]> = {
  submitted: ['working', 'failed', 'canceled', 'rejected'],
  working: ['input-required', 'auth-required', 'completed', 'failed', 'canceled', 'rejected'],
  'input-required': ['working', 'canceled', 'rejected'], // Can reject instead of resuming
  'auth-required': ['working', 'canceled', 'rejected'], // Can reject instead of resuming
  completed: [],
  failed: [],
  canceled: [],
  rejected: [], // Terminal state
  unknown: [], // Never transition to this
} as const;

export function canTransition(from: TaskState, to: TaskState): boolean {
  return validTransitions[from].includes(to);
}

export function ensureTransition(taskId: string, from: TaskState, to: TaskState): void {
  if (!canTransition(from, to)) {
    const message = `Invalid task transition ${from} -> ${to} for ${taskId}`;
    throw new Error(message);
  }
}

import type { TaskState as A2ATaskState } from '@a2a-js/sdk';

export const TASK_STATES = [
  'submitted',
  'working',
  'input-required',
  'completed',
  'canceled',
  'failed',
  'rejected',
  'auth-required',
  'unknown',
] as const;

export type TaskState = A2ATaskState;

const TERMINAL_TASK_STATES = new Set<TaskState>(['completed', 'failed', 'canceled', 'rejected']);
const ACTIVE_TASK_STATES = new Set<TaskState>(['submitted', 'working', 'input-required', 'auth-required']);

export function isTaskTerminalState(state: string | TaskState): boolean {
  return TERMINAL_TASK_STATES.has(state as TaskState);
}

export function isTaskActiveState(state: string | TaskState): boolean {
  return ACTIVE_TASK_STATES.has(state as TaskState);
}

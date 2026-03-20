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
] as const satisfies readonly A2ATaskState[];

export type TaskState = (typeof TASK_STATES)[number];

const TERMINAL_TASK_STATES = new Set<string>(['completed', 'failed', 'canceled', 'rejected']);
const ACTIVE_TASK_STATES = new Set<string>(['submitted', 'working', 'input-required', 'auth-required']);

export function isTaskTerminalState(state: string): boolean {
  return TERMINAL_TASK_STATES.has(state);
}

export function isTaskActiveState(state: string): boolean {
  return ACTIVE_TASK_STATES.has(state);
}

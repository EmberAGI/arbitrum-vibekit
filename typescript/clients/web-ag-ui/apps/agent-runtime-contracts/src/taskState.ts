export const TASK_STATES = [
  'submitted',
  'working',
  'input-required',
  'completed',
  'canceled',
  'failed',
  'auth-required',
] as const;

export type TaskState = (typeof TASK_STATES)[number];

const TERMINAL_TASK_STATES = new Set<TaskState>(['completed', 'failed', 'canceled']);
const ACTIVE_TASK_STATES = new Set<TaskState>(['submitted', 'working', 'input-required', 'auth-required']);

export function isTaskTerminalState(state: string | TaskState): boolean {
  return TERMINAL_TASK_STATES.has(state as TaskState);
}

export function isTaskActiveState(state: string | TaskState): boolean {
  return ACTIVE_TASK_STATES.has(state as TaskState);
}

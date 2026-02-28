import type { ThreadState, TaskState } from '../types/agent';
import type { AgentListEntry } from './agentListTypes';

type TaskLike = {
  id?: string;
  taskStatus?: {
    state?: TaskState;
    message?: unknown;
  };
};

function extractTaskMessage(task: TaskLike | null | undefined): string | undefined {
  const message = task?.taskStatus?.message;
  if (typeof message !== 'object' || message === null) return undefined;
  if (!('content' in message)) return undefined;
  const content = (message as { content?: unknown }).content;
  return typeof content === 'string' ? content : undefined;
}

export function projectAgentListUpdate(params: {
  profile?: ThreadState['profile'] | null;
  metrics?: ThreadState['metrics'] | null;
  task?: TaskLike;
  haltReason?: string | null;
  executionError?: string | null;
}): Partial<AgentListEntry> {
  const hasTask = Boolean(params.task?.id);
  const taskState = hasTask ? params.task?.taskStatus?.state : undefined;

  return {
    synced: true,
    profile: params.profile ?? undefined,
    metrics: params.metrics ?? undefined,
    taskId: hasTask ? params.task?.id : undefined,
    taskState,
    taskMessage: hasTask ? extractTaskMessage(params.task) : undefined,
    haltReason: hasTask ? (params.haltReason ?? undefined) : undefined,
    executionError: hasTask ? (params.executionError ?? undefined) : undefined,
  };
}

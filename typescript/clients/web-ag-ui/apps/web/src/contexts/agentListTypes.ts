import type { ThreadMetrics, ThreadProfile, TaskState } from '../types/agent';

export type AgentListEntry = {
  profile?: ThreadProfile;
  metrics?: ThreadMetrics;
  taskId?: string;
  taskState?: TaskState;
  taskMessage?: string;
  haltReason?: string;
  executionError?: string;
  synced: boolean;
  error?: string;
};

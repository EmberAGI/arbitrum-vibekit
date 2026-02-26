import type { AgentViewMetrics, AgentViewProfile, TaskState } from '../types/agent';

export type AgentListEntry = {
  profile?: AgentViewProfile;
  metrics?: AgentViewMetrics;
  taskId?: string;
  taskState?: TaskState;
  command?: string;
  taskMessage?: string;
  haltReason?: string;
  executionError?: string;
  synced: boolean;
  error?: string;
};

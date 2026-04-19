import type {
  OnboardingStatus,
  ThreadLifecyclePhase,
  ThreadMetrics,
  ThreadProfile,
  TaskState,
} from '../types/agent';

export type AgentListEntry = {
  profile?: ThreadProfile;
  metrics?: ThreadMetrics;
  taskId?: string;
  taskState?: TaskState;
  taskMessage?: string;
  lifecyclePhase?: ThreadLifecyclePhase | null;
  onboardingStatus?: OnboardingStatus;
  haltReason?: string;
  executionError?: string;
  synced: boolean;
  error?: string;
};

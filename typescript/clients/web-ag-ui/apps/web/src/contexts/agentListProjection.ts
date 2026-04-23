import type { OnboardingFlow, ThreadLifecycle, ThreadState, TaskState } from '../types/agent';
import { extractTaskStatusMessage } from '../utils/extractTaskStatusMessage';
import { deriveTaskStateForUi } from '../utils/deriveTaskStateForUi';
import type { AgentListEntry } from './agentListTypes';

type TaskLike = {
  id?: string;
  taskStatus?: {
    state?: TaskState;
    message?: unknown;
  };
};

function extractTaskMessage(task: TaskLike | null | undefined): string | undefined {
  return extractTaskStatusMessage(task?.taskStatus?.message);
}

function resolveProjectedIsHired(params: {
  lifecycle?: ThreadLifecycle | null;
  onboardingFlow?: OnboardingFlow | null;
  task?: TaskLike;
}): boolean {
  const lifecyclePhase = params.lifecycle?.phase ?? null;
  const onboardingStatus = params.onboardingFlow?.status;
  const effectiveTaskState =
    deriveTaskStateForUi({
      lifecyclePhase,
      taskState: params.task?.taskStatus?.state ?? null,
      taskMessage: extractTaskMessage(params.task) ?? null,
    }) ?? null;

  const taskProgressIndicatesHired =
    onboardingStatus === 'in_progress' ||
    (lifecyclePhase !== 'prehire' &&
      (effectiveTaskState === 'input-required' ||
        effectiveTaskState === 'working' ||
        effectiveTaskState === 'submitted'));

  return (
    lifecyclePhase === 'onboarding' ||
    lifecyclePhase === 'active' ||
    lifecyclePhase === 'firing' ||
    taskProgressIndicatesHired
  );
}

export function projectAgentListUpdate(params: {
  lifecycle?: ThreadLifecycle | null;
  onboardingFlow?: OnboardingFlow | null;
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
    lifecyclePhase: params.lifecycle?.phase ?? null,
    onboardingStatus: params.onboardingFlow?.status ?? undefined,
    isHired: resolveProjectedIsHired(params),
    haltReason: hasTask ? (params.haltReason ?? undefined) : undefined,
    executionError: hasTask ? (params.executionError ?? undefined) : undefined,
  };
}

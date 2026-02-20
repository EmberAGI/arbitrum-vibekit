import type { TaskState } from './taskLifecycle.js';

type ViewRecord = Record<string, unknown>;

const isPlainRecord = (value: unknown): value is ViewRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const resolveTaskState = (taskStatus: unknown): string | null => {
  if (!isPlainRecord(taskStatus)) {
    return null;
  }
  const state = taskStatus['state'];
  return typeof state === 'string' ? state : null;
};

const resolveTaskMessageContent = (taskStatus: unknown): string | null => {
  if (!isPlainRecord(taskStatus)) {
    return null;
  }
  const message = taskStatus['message'];
  if (!isPlainRecord(message)) {
    return null;
  }
  const content = message['content'];
  return typeof content === 'string' ? content : null;
};

const hasCompletedOnboardingFlow = (view: ViewRecord): boolean => {
  const onboardingFlow = view['onboardingFlow'];
  if (!isPlainRecord(onboardingFlow)) {
    return false;
  }
  return onboardingFlow['status'] === 'completed';
};

const isLikelyOnboardingWaitMessage = (message: string | null): boolean => {
  const normalized = `${message ?? ''}`.toLowerCase();
  return normalized.includes('continue onboarding') || normalized.includes('delegation approval');
};

export function shouldPersistInputRequiredCheckpoint(input: {
  currentTaskState?: TaskState | string | null;
  currentTaskMessage?: string | null;
  currentOnboardingKey?: string | null;
  nextOnboardingKey?: string | null;
  nextTaskMessage?: string | null;
}): boolean {
  if (input.currentTaskState !== 'input-required') {
    return true;
  }

  const currentMessage = input.currentTaskMessage ?? null;
  const nextMessage = input.nextTaskMessage ?? null;
  if (currentMessage !== nextMessage) {
    return true;
  }

  const nextOnboardingKey = input.nextOnboardingKey;
  if (
    typeof nextOnboardingKey === 'string' &&
    nextOnboardingKey.length > 0 &&
    input.currentOnboardingKey !== nextOnboardingKey
  ) {
    return true;
  }

  return false;
}

export function projectCycleCommandView(currentView: ViewRecord | null): ViewRecord {
  if (!isPlainRecord(currentView)) {
    return { command: 'cycle' };
  }

  const nextView: ViewRecord = { ...currentView, command: 'cycle' };
  const task = currentView['task'];
  if (!isPlainRecord(task)) {
    return nextView;
  }

  const taskStatus = task['taskStatus'];
  if (!isPlainRecord(taskStatus)) {
    return nextView;
  }

  const taskState = resolveTaskState(taskStatus);
  if (taskState !== 'input-required') {
    return nextView;
  }

  const taskMessage = resolveTaskMessageContent(taskStatus);
  const shouldNormalize =
    hasCompletedOnboardingFlow(currentView) || isLikelyOnboardingWaitMessage(taskMessage);

  if (!shouldNormalize) {
    return nextView;
  }

  const normalizedTaskStatus: ViewRecord = {
    ...taskStatus,
    state: 'working' as TaskState,
  };

  return {
    ...nextView,
    task: {
      ...task,
      taskStatus: normalizedTaskStatus,
    },
  };
}

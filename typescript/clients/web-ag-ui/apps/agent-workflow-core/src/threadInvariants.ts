import type { TaskState } from './taskLifecycle.js';

type ThreadRecord = Record<string, unknown>;

const isPlainRecord = (value: unknown): value is ThreadRecord =>
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

const hasCompletedOnboardingFlow = (thread: ThreadRecord): boolean => {
  const onboardingFlow = thread['onboardingFlow'];
  if (!isPlainRecord(onboardingFlow)) {
    return false;
  }
  return onboardingFlow['status'] === 'completed';
};

const hasCompletedSetupSignals = (thread: ThreadRecord): boolean =>
  Boolean(thread['setupComplete']) || Boolean(thread['operatorConfig']) || Boolean(thread['delegationBundle']);

const isLikelyOnboardingWaitMessage = (message: string | null): boolean => {
  const normalized = `${message ?? ''}`.toLowerCase();
  return (
    normalized.includes('continue setup') ||
    normalized.includes('continue onboarding') ||
    normalized.includes('required permissions') ||
    normalized.includes('delegation approval') ||
    normalized.includes('onboarding input') ||
    normalized.includes('onboarding prerequisite') ||
    normalized.includes('cycle paused until onboarding input is complete')
  );
};

const resolveNormalizedThreadTask = (input: {
  thread: ThreadRecord;
  completedMessage?: string;
}): ThreadRecord => {
  const task = input.thread['task'];
  if (!isPlainRecord(task)) {
    return input.thread;
  }

  const taskStatus = task['taskStatus'];
  if (!isPlainRecord(taskStatus)) {
    return input.thread;
  }

  const taskState = resolveTaskState(taskStatus);
  if (taskState !== 'input-required') {
    return input.thread;
  }

  const taskMessage = resolveTaskMessageContent(taskStatus);
  const hasCompletionSignals =
    hasCompletedOnboardingFlow(input.thread) || hasCompletedSetupSignals(input.thread);
  if (!hasCompletionSignals || !isLikelyOnboardingWaitMessage(taskMessage)) {
    return input.thread;
  }

  const normalizedTaskStatus: ThreadRecord = {
    ...taskStatus,
    state: 'working' as TaskState,
  };
  if (typeof input.completedMessage === 'string') {
    const message = taskStatus['message'];
    if (isPlainRecord(message) && typeof message['content'] === 'string') {
      normalizedTaskStatus['message'] = {
        ...message,
        content: input.completedMessage,
      };
    }
  }

  return {
    ...input.thread,
    task: {
      ...task,
      taskStatus: normalizedTaskStatus,
    },
  };
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

export function normalizeStaleOnboardingTask(input: {
  thread: ThreadRecord;
  completedMessage?: string;
}): ThreadRecord {
  return resolveNormalizedThreadTask(input);
}

export function projectCycleCommandThread(currentThread: ThreadRecord | null): ThreadRecord {
  if (!isPlainRecord(currentThread)) {
    return {};
  }

  const { command: _droppedCommand, ...nextThread } = currentThread;
  return resolveNormalizedThreadTask({
    thread: nextThread,
  });
}

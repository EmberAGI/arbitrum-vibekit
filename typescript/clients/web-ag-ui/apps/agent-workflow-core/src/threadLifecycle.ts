import { isTaskTerminalState, type TaskState } from './taskLifecycle.js';

export type ThreadLifecyclePhase = 'prehire' | 'onboarding' | 'active' | 'firing' | 'inactive';

export const resolveThreadLifecyclePhase = (input: {
  previousPhase?: ThreadLifecyclePhase;
  taskState?: string | TaskState | null;
  onboardingFlowStatus?: string | null;
  onboardingStep?: number | null;
  explicitLifecyclePhase?: ThreadLifecyclePhase;
  setupComplete?: boolean;
  hasOperatorConfig?: boolean;
  hasDelegationBundle?: boolean;
  fireRequested?: boolean;
}): ThreadLifecyclePhase => {
  const taskState = input.taskState ?? null;
  const hasTerminalTask = typeof taskState === 'string' && isTaskTerminalState(taskState);
  const fireRequested =
    input.fireRequested === true || input.explicitLifecyclePhase === 'firing';

  if (fireRequested && !hasTerminalTask) {
    return 'firing';
  }

  if (input.previousPhase === 'firing' && hasTerminalTask) {
    return 'inactive';
  }

  const setupComplete =
    input.setupComplete === true ||
    input.hasOperatorConfig === true ||
    input.hasDelegationBundle === true;
  if (setupComplete || input.onboardingFlowStatus === 'completed') {
    return 'active';
  }

  const hasOnboardingStep =
    typeof input.onboardingStep === 'number' && Number.isFinite(input.onboardingStep);
  const phaseFromSignals =
    input.onboardingFlowStatus === 'in_progress' || hasOnboardingStep
      ? 'onboarding'
      : input.previousPhase === 'inactive'
        ? 'inactive'
        : 'prehire';

  const candidate = input.explicitLifecyclePhase ?? phaseFromSignals;

  if (input.previousPhase === 'active' && (candidate === 'onboarding' || candidate === 'prehire')) {
    return 'active';
  }

  if (input.previousPhase === 'onboarding' && candidate === 'prehire') {
    return 'onboarding';
  }

  if (input.previousPhase === 'inactive' && candidate === 'prehire') {
    return 'inactive';
  }

  if (input.previousPhase === 'firing' && !hasTerminalTask && candidate !== 'firing') {
    return 'firing';
  }

  return candidate;
};

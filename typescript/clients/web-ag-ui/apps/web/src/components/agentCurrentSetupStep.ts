import type { OnboardingFlow } from '../types/agent';

const clampStep = (step: number, maxSetupStep: number): number => {
  const upperBound = Math.max(1, maxSetupStep);
  return Math.max(1, Math.min(step, upperBound));
};

export function resolveCurrentSetupStep(input: {
  maxSetupStep: number;
  onboardingFlow?: OnboardingFlow;
}): number {
  const onboardingFlow = input.onboardingFlow;
  if (onboardingFlow && Array.isArray(onboardingFlow.steps) && onboardingFlow.steps.length > 0) {
    const activeIndex =
      onboardingFlow.activeStepId !== undefined
        ? onboardingFlow.steps.findIndex((step) => step.id === onboardingFlow.activeStepId)
        : onboardingFlow.steps.findIndex((step) => step.status === 'active');
    if (activeIndex >= 0) {
      return clampStep(activeIndex + 1, input.maxSetupStep);
    }
  }

  return 1;
}

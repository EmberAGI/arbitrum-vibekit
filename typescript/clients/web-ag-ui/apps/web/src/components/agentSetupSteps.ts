import type { OnboardingFlow } from '../types/agent';

export type SetupStep = {
  id: number;
  name: string;
  description: string;
};

export function resolveSetupSteps(params: { onboardingFlow?: OnboardingFlow }): SetupStep[] {
  const onboardingFlowSteps = params.onboardingFlow?.steps;
  if (!Array.isArray(onboardingFlowSteps) || onboardingFlowSteps.length === 0) {
    return [];
  }

  return onboardingFlowSteps.map((step, index) => ({
    id: index + 1,
    name: step.title,
    description: step.description ?? 'Follow the next agent prompt to continue onboarding.',
  }));
}

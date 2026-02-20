export type OnboardingStatus = 'in_progress' | 'completed' | 'failed' | 'canceled';

export type OnboardingStepStatus = 'pending' | 'active' | 'completed' | 'skipped' | 'failed';

export type OnboardingStepDefinition = {
  id: string;
  title: string;
  description?: string;
};

export type OnboardingStepState = OnboardingStepDefinition & {
  status: OnboardingStepStatus;
};

export type OnboardingContract = {
  status: OnboardingStatus;
  revision: number;
  key?: string;
  activeStepId?: string;
  steps: OnboardingStepState[];
};

const assertUniqueStepIds = (definitions: readonly OnboardingStepDefinition[]): void => {
  const uniqueIds = new Set<string>();
  for (const definition of definitions) {
    if (uniqueIds.has(definition.id)) {
      throw new Error(`Duplicate onboarding step id: ${definition.id}`);
    }
    uniqueIds.add(definition.id);
  }
};

const clampStepIndex = (step: number, stepsLength: number): number => {
  if (stepsLength <= 0) return 0;
  if (!Number.isFinite(step) || step <= 1) return 0;
  if (step > stepsLength) return stepsLength - 1;
  return Math.floor(step - 1);
};

export const buildOnboardingContractFromLegacyStep = (params: {
  status: OnboardingStatus;
  step: number;
  key?: string;
  stepDefinitions: readonly OnboardingStepDefinition[];
  revision?: number;
}): OnboardingContract => {
  assertUniqueStepIds(params.stepDefinitions);
  const activeStepIndex =
    params.status === 'in_progress' ? clampStepIndex(params.step, params.stepDefinitions.length) : -1;

  const steps = params.stepDefinitions.map((definition, index): OnboardingStepState => {
    if (params.status !== 'in_progress') {
      return { ...definition, status: params.status === 'completed' ? 'completed' : 'pending' };
    }
    if (index < activeStepIndex) return { ...definition, status: 'completed' };
    if (index === activeStepIndex) return { ...definition, status: 'active' };
    return { ...definition, status: 'pending' };
  });

  return {
    status: params.status,
    revision: params.revision ?? 1,
    key: params.key,
    activeStepId: params.status === 'in_progress' ? steps[activeStepIndex]?.id : undefined,
    steps,
  };
};

export const finalizeOnboardingContract = (
  contract: OnboardingContract,
  status: Exclude<OnboardingStatus, 'in_progress'> = 'completed',
): OnboardingContract => ({
  ...contract,
  status,
  revision: contract.revision + 1,
  activeStepId: undefined,
  steps: contract.steps.map((step): OnboardingStepState => ({
    ...step,
    status: status === 'completed' ? 'completed' : step.status === 'failed' ? 'failed' : 'pending',
  })),
});

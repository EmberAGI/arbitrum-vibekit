import {
  buildOnboardingContractFromLegacyStep,
  finalizeOnboardingContract,
  type OnboardingContract,
  type OnboardingStepDefinition,
  type TaskState,
} from 'agent-workflow-core';

type LegacyOnboardingState = {
  step: number;
  key?: string;
};

const FULL_STEPS: readonly OnboardingStepDefinition[] = [
  { id: 'funding-amount', title: 'Funding Amount' },
  { id: 'funding-token', title: 'Funding Token' },
  { id: 'delegation-signing', title: 'Delegation Signing' },
];

const REDUCED_WITH_DELEGATION: readonly OnboardingStepDefinition[] = [
  { id: 'funding-amount', title: 'Funding Amount' },
  { id: 'delegation-signing', title: 'Delegation Signing' },
];

const REDUCED_WITH_FUNDING: readonly OnboardingStepDefinition[] = [
  { id: 'funding-amount', title: 'Funding Amount' },
  { id: 'funding-token', title: 'Funding Token' },
];

const resolveStepDefinitions = (params: {
  onboarding?: LegacyOnboardingState;
  delegationsBypassActive: boolean;
}): readonly OnboardingStepDefinition[] => {
  const onboardingKey = params.onboarding?.key;
  const onboardingStep = params.onboarding?.step ?? 1;
  if (params.delegationsBypassActive) {
    return REDUCED_WITH_FUNDING;
  }
  if (onboardingKey === 'delegation-signing' && onboardingStep <= 2) {
    return REDUCED_WITH_DELEGATION;
  }
  return FULL_STEPS;
};

const finalizeForTaskState = (params: {
  flow: OnboardingContract;
  setupComplete: boolean;
  taskState?: TaskState;
}): OnboardingContract => {
  if (params.setupComplete) {
    return finalizeOnboardingContract(params.flow, 'completed');
  }
  if (params.taskState === 'failed') {
    return finalizeOnboardingContract(params.flow, 'failed');
  }
  if (params.taskState === 'canceled') {
    return finalizeOnboardingContract(params.flow, 'canceled');
  }
  return params.flow;
};

export const derivePendleOnboardingFlow = (params: {
  onboarding?: LegacyOnboardingState;
  previous?: OnboardingContract;
  setupComplete: boolean;
  taskState?: TaskState;
  delegationsBypassActive: boolean;
}): OnboardingContract | undefined => {
  if (!params.onboarding) {
    if (!params.previous) {
      return undefined;
    }
    return finalizeForTaskState({
      flow: params.previous,
      setupComplete: params.setupComplete,
      taskState: params.taskState,
    });
  }

  const flow = buildOnboardingContractFromLegacyStep({
    status: 'in_progress',
    step: params.onboarding.step,
    key: params.onboarding.key,
    stepDefinitions: resolveStepDefinitions({
      onboarding: params.onboarding,
      delegationsBypassActive: params.delegationsBypassActive,
    }),
    revision: (params.previous?.revision ?? 0) + 1,
  });

  return finalizeForTaskState({
    flow,
    setupComplete: params.setupComplete,
    taskState: params.taskState,
  });
};

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

const BASE_STEPS: readonly OnboardingStepDefinition[] = [
  { id: 'setup', title: 'Agent Preferences' },
  { id: 'funding-token', title: 'Funding Token' },
  { id: 'delegation-signing', title: 'Delegation Signing' },
];

const REDUCED_WITH_DELEGATION: readonly OnboardingStepDefinition[] = [
  { id: 'setup', title: 'Agent Preferences' },
  { id: 'delegation-signing', title: 'Delegation Signing' },
];

const REDUCED_WITH_FUNDING: readonly OnboardingStepDefinition[] = [
  { id: 'setup', title: 'Agent Preferences' },
  { id: 'funding-token', title: 'Funding Token' },
];

const resolveStepDefinitions = (params: {
  onboarding?: LegacyOnboardingState;
  onboardingKey?: string;
  onboardingStep: number;
  delegationsBypassActive: boolean;
}): readonly OnboardingStepDefinition[] => {
  const steps: OnboardingStepDefinition[] = (
    params.delegationsBypassActive
      ? REDUCED_WITH_FUNDING
      : params.onboardingKey === 'delegation-signing' && params.onboardingStep <= 2
        ? REDUCED_WITH_DELEGATION
        : BASE_STEPS
  ).map((step) => ({ ...step }));

  if (
    params.onboardingKey === 'fund-wallet' &&
    params.onboardingStep >= 1 &&
    params.onboardingStep <= steps.length
  ) {
    steps[params.onboardingStep - 1] = { id: 'fund-wallet', title: 'Fund Wallet' };
  }
  return steps;
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

export const deriveStarterOnboardingFlow = (params: {
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
      onboardingKey: params.onboarding.key,
      onboardingStep: params.onboarding.step,
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

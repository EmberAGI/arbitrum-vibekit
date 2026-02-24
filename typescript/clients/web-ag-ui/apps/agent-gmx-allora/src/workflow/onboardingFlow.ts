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
  { id: 'setup', title: 'Strategy Config' },
  { id: 'funding-token', title: 'Funding Token' },
  { id: 'delegation-signing', title: 'Delegation Signing' },
];

const REDUCED_WITH_DELEGATION: readonly OnboardingStepDefinition[] = [
  { id: 'setup', title: 'Strategy Config' },
  { id: 'delegation-signing', title: 'Delegation Signing' },
];

const REDUCED_WITH_FUNDING: readonly OnboardingStepDefinition[] = [
  { id: 'setup', title: 'Strategy Config' },
  { id: 'funding-token', title: 'Funding Token' },
];

const resolveStepDefinitions = (params: {
  onboardingKey?: string;
  onboardingStep: number;
  delegationsBypassActive: boolean;
}): readonly OnboardingStepDefinition[] => {
  if (params.delegationsBypassActive) {
    return REDUCED_WITH_FUNDING;
  }
  if (params.onboardingKey === 'delegation-signing' && params.onboardingStep <= 2) {
    return REDUCED_WITH_DELEGATION;
  }
  return BASE_STEPS;
};

const resolveCanonicalOnboardingKey = (params: {
  onboarding: LegacyOnboardingState;
  stepDefinitions: readonly OnboardingStepDefinition[];
}): string | undefined => {
  const { key } = params.onboarding;
  if (!key || params.stepDefinitions.length === 0) {
    return key;
  }
  if (params.stepDefinitions.some((definition) => definition.id === key)) {
    return key;
  }

  const clampedIndex = Math.max(
    0,
    Math.min(params.stepDefinitions.length - 1, Math.floor(Math.max(params.onboarding.step, 1)) - 1),
  );
  return params.stepDefinitions[clampedIndex]?.id;
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

export const deriveGmxOnboardingFlow = (params: {
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

  const stepDefinitions = resolveStepDefinitions({
    onboardingKey: params.onboarding.key,
    onboardingStep: params.onboarding.step,
    delegationsBypassActive: params.delegationsBypassActive,
  });

  const flow = buildOnboardingContractFromLegacyStep({
    status: 'in_progress',
    step: params.onboarding.step,
    key: resolveCanonicalOnboardingKey({
      onboarding: params.onboarding,
      stepDefinitions,
    }),
    stepDefinitions,
    revision: (params.previous?.revision ?? 0) + 1,
  });

  return finalizeForTaskState({
    flow,
    setupComplete: params.setupComplete,
    taskState: params.taskState,
  });
};

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
  let steps: readonly OnboardingStepDefinition[] = FULL_STEPS;
  if (params.delegationsBypassActive) {
    steps = REDUCED_WITH_FUNDING;
  } else if (
    params.onboardingKey === 'delegation-signing' &&
    params.onboardingStep <= 2 &&
    params.onboarding?.step !== undefined
  ) {
    steps = REDUCED_WITH_DELEGATION;
  }

  if (
    params.onboardingKey === 'fund-wallet' &&
    params.onboardingStep >= 1 &&
    params.onboardingStep <= steps.length
  ) {
    steps = steps.map((step, index) =>
      index === params.onboardingStep - 1 ? { id: 'fund-wallet', title: 'Fund Wallet' } : step,
    );
  }
  return steps;
};

const finalizeForTaskState = (params: {
  flow: OnboardingContract;
  setupComplete: boolean;
  taskState?: TaskState;
}): OnboardingContract => {
  if (params.setupComplete) {
    if (params.flow.status === 'completed') {
      return params.flow;
    }
    return finalizeOnboardingContract(params.flow, 'completed');
  }
  if (params.taskState === 'failed') {
    if (params.flow.status === 'failed') {
      return params.flow;
    }
    return finalizeOnboardingContract(params.flow, 'failed');
  }
  if (params.taskState === 'canceled') {
    if (params.flow.status === 'canceled') {
      return params.flow;
    }
    return finalizeOnboardingContract(params.flow, 'canceled');
  }
  return params.flow;
};

const areStepStatesEqual = (left: OnboardingContract['steps'], right: OnboardingContract['steps']): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftStep = left[index];
    const rightStep = right[index];
    if (
      !leftStep ||
      !rightStep ||
      leftStep.id !== rightStep.id ||
      leftStep.title !== rightStep.title ||
      leftStep.description !== rightStep.description ||
      leftStep.status !== rightStep.status
    ) {
      return false;
    }
  }
  return true;
};

const areSemanticallyEqualOnboardingFlows = (
  left: OnboardingContract,
  right: OnboardingContract,
): boolean =>
  left.status === right.status &&
  left.key === right.key &&
  left.activeStepId === right.activeStepId &&
  areStepStatesEqual(left.steps, right.steps);

export const deriveClmmOnboardingFlow = (params: {
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

  const finalizedFlow = finalizeForTaskState({
    flow,
    setupComplete: params.setupComplete,
    taskState: params.taskState,
  });
  if (
    params.previous &&
    areSemanticallyEqualOnboardingFlows(params.previous, finalizedFlow)
  ) {
    return params.previous;
  }
  return finalizedFlow;
};

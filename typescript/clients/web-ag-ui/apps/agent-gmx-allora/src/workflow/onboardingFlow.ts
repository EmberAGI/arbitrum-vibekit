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

const FUND_WALLET_STEP: OnboardingStepDefinition = { id: 'fund-wallet', title: 'Fund Wallet' };

const resolveStepDefinitions = (params: {
  onboarding?: LegacyOnboardingState;
  onboardingKey?: string;
  onboardingStep: number;
  delegationsBypassActive: boolean;
}): readonly OnboardingStepDefinition[] => {
  const steps: OnboardingStepDefinition[] =
    params.delegationsBypassActive
      ? [...REDUCED_WITH_FUNDING]
      : params.onboardingKey === 'delegation-signing' && params.onboardingStep <= 2
        ? [...REDUCED_WITH_DELEGATION]
      : [...BASE_STEPS];

  const needsFundWalletStep =
    params.onboardingKey === 'fund-wallet' || params.onboardingStep >= 4;
  if (needsFundWalletStep && params.onboardingStep > steps.length) {
    const extrasNeeded = params.onboardingStep - steps.length;
    for (let index = 0; index < extrasNeeded; index += 1) {
      steps.push({ id: `extra-${index + 1}`, title: `Step ${steps.length + 1}` });
    }
  }

  if (needsFundWalletStep) {
    const walletStepIndex = Math.max(0, Math.min(steps.length - 1, params.onboardingStep - 1));
    steps[walletStepIndex] = FUND_WALLET_STEP;
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

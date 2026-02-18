import type { AgentInterrupt } from '../types/agent';

export type SetupStep = {
  id: number;
  name: string;
  description: string;
};

type SetupStepKind = 'setup' | 'funding' | 'delegation' | 'fund-wallet';

const isDelegationInterruptType = (type: AgentInterrupt['type'] | undefined): boolean =>
  type === 'clmm-delegation-signing-request' ||
  type === 'pendle-delegation-signing-request' ||
  type === 'gmx-delegation-signing-request';

const resolveSetupStepKinds = (params: {
  totalSteps?: number;
  interruptType?: AgentInterrupt['type'];
  delegationsBypassActive?: boolean;
  onboardingStep?: number;
  onboardingKey?: string;
}): SetupStepKind[] => {
  const resolvedTotalSteps =
    typeof params.totalSteps === 'number' && Number.isFinite(params.totalSteps)
      ? Math.max(1, Math.floor(params.totalSteps))
      : params.interruptType === 'gmx-fund-wallet-request'
        ? 4
        : 3;

  const stepKinds: SetupStepKind[] = (() => {
    if (resolvedTotalSteps === 1) {
      return ['setup'];
    }

    if (resolvedTotalSteps === 2) {
      if (params.delegationsBypassActive === true) {
        return ['setup', 'funding'];
      }
      if (isDelegationInterruptType(params.interruptType)) {
        return ['setup', 'delegation'];
      }
      return ['setup', 'funding'];
    }

    if (resolvedTotalSteps === 3) {
      return ['setup', 'funding', 'delegation'];
    }

    return [
      'setup',
      'funding',
      'delegation',
      ...Array.from({ length: resolvedTotalSteps - 3 }, (): SetupStepKind => 'fund-wallet'),
    ];
  })();

  if (
    typeof params.onboardingStep === 'number' &&
    Number.isFinite(params.onboardingStep) &&
    params.onboardingStep > 0 &&
    params.onboardingStep <= resolvedTotalSteps &&
    params.onboardingKey === 'fund-wallet'
  ) {
    stepKinds[params.onboardingStep - 1] = 'fund-wallet';
  }

  return stepKinds;
};

const BASE_SETUP_STEP_COPY: Record<'default' | 'pendle' | 'gmx', Record<SetupStepKind, Omit<SetupStep, 'id'>>> =
  {
    default: {
      setup: {
        name: 'Agent Preferences',
        description: 'Provide strategy inputs so the agent can initialize your configuration.',
      },
      funding: {
        name: 'Funding Token',
        description: 'Choose the starting asset used to fund agent actions.',
      },
      delegation: {
        name: 'Signing Policies',
        description: 'Review and sign delegations required for execution.',
      },
      'fund-wallet': {
        name: 'Fund Wallet',
        description: 'Add required funds, then continue to retry execution.',
      },
    },
    pendle: {
      setup: {
        name: 'Funding Amount',
        description: 'Set deployment amount and wallet context for Pendle.',
      },
      funding: {
        name: 'Funding Token',
        description: 'Select the starting stablecoin (may be auto-selected from existing position).',
      },
      delegation: {
        name: 'Delegation Signing',
        description: 'Approve permissions needed to manage the Pendle position.',
      },
      'fund-wallet': {
        name: 'Fund Wallet',
        description: 'Fund the wallet with an eligible stablecoin before continuing.',
      },
    },
    gmx: {
      setup: {
        name: 'Strategy Config',
        description: 'Select market and allocation for the GMX strategy.',
      },
      funding: {
        name: 'Funding Token',
        description: 'Choose the funding token used for position management.',
      },
      delegation: {
        name: 'Delegation Signing',
        description: 'Approve execution permissions for GMX operations.',
      },
      'fund-wallet': {
        name: 'Fund Wallet',
        description: 'Add GMX collateral + Arbitrum ETH gas before retrying.',
      },
    },
  };

export function resolveSetupSteps(params: {
  agentId: string;
  totalSteps?: number;
  onboardingStep?: number;
  onboardingKey?: string;
  interruptType?: AgentInterrupt['type'];
  delegationsBypassActive?: boolean;
}): SetupStep[] {
  const copyKey =
    params.agentId === 'agent-pendle'
      ? 'pendle'
      : params.agentId === 'agent-gmx-allora'
        ? 'gmx'
        : 'default';
  const baseSteps = BASE_SETUP_STEP_COPY[copyKey];
  const resolvedTotalSteps =
    typeof params.totalSteps === 'number' && Number.isFinite(params.totalSteps)
      ? Math.max(1, Math.floor(params.totalSteps))
      : params.interruptType === 'gmx-fund-wallet-request'
        ? 4
        : 3;
  const resolvedStepKinds = resolveSetupStepKinds({
    totalSteps: resolvedTotalSteps,
    onboardingStep: params.onboardingStep,
    onboardingKey: params.onboardingKey,
    interruptType: params.interruptType,
    delegationsBypassActive: params.delegationsBypassActive,
  });

  return Array.from({ length: resolvedTotalSteps }, (_, index) => {
    const stepNumber = index + 1;
    const stepKind = resolvedStepKinds[index];
    const baseStep = stepKind ? baseSteps[stepKind] : undefined;
    return {
      id: stepNumber,
      name: baseStep?.name ?? `Step ${stepNumber}`,
      description: baseStep?.description ?? 'Follow the next agent prompt to continue onboarding.',
    };
  });
}

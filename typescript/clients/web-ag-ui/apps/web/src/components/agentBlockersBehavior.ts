const ONBOARDING_RUN_BEHAVIOR: Record<string, { hireRunIsOnboardingWhileSetupIncomplete: boolean }> = {
  'agent-pendle': { hireRunIsOnboardingWhileSetupIncomplete: true },
  'agent-clmm': { hireRunIsOnboardingWhileSetupIncomplete: false },
  'agent-gmx-allora': { hireRunIsOnboardingWhileSetupIncomplete: false },
};

const DELEGATION_CONTEXT_LABELS: Record<string, string> = {
  'agent-pendle': 'Pendle execution',
  'agent-gmx-allora': 'GMX perps execution',
};

const TERMINAL_TASK_STATES = new Set(['completed', 'failed', 'canceled', 'rejected']);

export function resolveDelegationContextLabel(agentId: string): string {
  return DELEGATION_CONTEXT_LABELS[agentId] ?? 'liquidity management';
}

export function resolveOnboardingActive(input: {
  agentId: string;
  activeInterruptPresent: boolean;
  taskStatus?: string;
  currentCommand?: string;
  setupComplete?: boolean;
}): boolean {
  const profile = ONBOARDING_RUN_BEHAVIOR[input.agentId] ?? {
    hireRunIsOnboardingWhileSetupIncomplete: false,
  };

  const isTaskTerminal = TERMINAL_TASK_STATES.has(input.taskStatus ?? '');
  const isConfiguredOnboardingRun =
    profile.hireRunIsOnboardingWhileSetupIncomplete &&
    input.currentCommand === 'hire' &&
    input.setupComplete !== true &&
    !isTaskTerminal;

  return input.activeInterruptPresent || input.taskStatus === 'input-required' || isConfiguredOnboardingRun;
}

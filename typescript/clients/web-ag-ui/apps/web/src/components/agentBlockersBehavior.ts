const DELEGATION_CONTEXT_LABELS: Record<string, string> = {
  'agent-pendle': 'Pendle execution',
  'agent-gmx-allora': 'GMX perps execution',
};

export function resolveDelegationContextLabel(agentId: string): string {
  return DELEGATION_CONTEXT_LABELS[agentId] ?? 'liquidity management';
}

export function resolveOnboardingActive(input: {
  activeInterruptPresent: boolean;
  taskStatus?: string;
  onboardingStatus?: 'in_progress' | 'completed' | 'failed' | 'canceled';
}): boolean {
  if (input.onboardingStatus === 'in_progress') {
    return true;
  }
  if (
    input.onboardingStatus === 'completed' ||
    input.onboardingStatus === 'failed' ||
    input.onboardingStatus === 'canceled'
  ) {
    return false;
  }

  return input.activeInterruptPresent || input.taskStatus === 'input-required';
}

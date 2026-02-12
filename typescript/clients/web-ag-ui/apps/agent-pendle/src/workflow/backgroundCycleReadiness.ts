type ThreadView = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type BackgroundCycleReadiness = {
  hasView: boolean;
  hasOperatorInput: boolean;
  hasFundingTokenInput: boolean;
  hasDelegationAccess: boolean;
  hasOperatorConfig: boolean;
  isSetupComplete: boolean;
};

export function getBackgroundCycleReadiness(view: ThreadView | null): BackgroundCycleReadiness {
  if (!isRecord(view)) {
    return {
      hasView: false,
      hasOperatorInput: false,
      hasFundingTokenInput: false,
      hasDelegationAccess: false,
      hasOperatorConfig: false,
      isSetupComplete: false,
    };
  }

  const hasOperatorInput = isRecord(view['operatorInput']);
  const hasFundingTokenInput = isRecord(view['fundingTokenInput']);
  const hasDelegationAccess =
    view['delegationsBypassActive'] === true || isRecord(view['delegationBundle']);
  const hasOperatorConfig = isRecord(view['operatorConfig']);
  const isSetupComplete = view['setupComplete'] === true;

  return {
    hasView: true,
    hasOperatorInput,
    hasFundingTokenInput,
    hasDelegationAccess,
    hasOperatorConfig,
    isSetupComplete,
  };
}

export function canStartBackgroundCycle(view: ThreadView | null): boolean {
  const readiness = getBackgroundCycleReadiness(view);
  return (
    readiness.hasView &&
    readiness.hasOperatorInput &&
    readiness.hasFundingTokenInput &&
    readiness.hasDelegationAccess &&
    readiness.hasOperatorConfig &&
    readiness.isSetupComplete
  );
}

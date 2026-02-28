type ThreadRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type BackgroundCycleReadiness = {
  hasThread: boolean;
  hasOperatorInput: boolean;
  hasFundingTokenInput: boolean;
  hasDelegationAccess: boolean;
  hasOperatorConfig: boolean;
  isSetupComplete: boolean;
};

export function getBackgroundCycleReadiness(thread: ThreadRecord | null): BackgroundCycleReadiness {
  if (!isRecord(thread)) {
    return {
      hasThread: false,
      hasOperatorInput: false,
      hasFundingTokenInput: false,
      hasDelegationAccess: false,
      hasOperatorConfig: false,
      isSetupComplete: false,
    };
  }

  const hasOperatorInput = isRecord(thread['operatorInput']);
  const hasFundingTokenInput = isRecord(thread['fundingTokenInput']);
  const hasDelegationAccess =
    thread['delegationsBypassActive'] === true || isRecord(thread['delegationBundle']);
  const hasOperatorConfig = isRecord(thread['operatorConfig']);
  const isSetupComplete = thread['setupComplete'] === true;

  return {
    hasThread: true,
    hasOperatorInput,
    hasFundingTokenInput,
    hasDelegationAccess,
    hasOperatorConfig,
    isSetupComplete,
  };
}

export function canStartBackgroundCycle(thread: ThreadRecord | null): boolean {
  const readiness = getBackgroundCycleReadiness(thread);
  return (
    readiness.hasThread &&
    readiness.hasOperatorInput &&
    readiness.hasFundingTokenInput &&
    readiness.hasDelegationAccess &&
    readiness.hasOperatorConfig &&
    readiness.isSetupComplete
  );
}

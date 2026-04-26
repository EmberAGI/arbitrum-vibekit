import type { EmberOnboardingSeed } from '@/types/agent';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isManagedLendingMandate(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.lending_policy)) {
    return false;
  }

  const { collateral_policy, borrow_policy, risk_policy } = value.lending_policy;
  if (
    !isRecord(collateral_policy) ||
    !Array.isArray(collateral_policy.assets) ||
    !isRecord(borrow_policy) ||
    !isStringArray(borrow_policy.allowed_assets) ||
    !isRecord(risk_policy)
  ) {
    return false;
  }

  return (
    collateral_policy.assets.every(
      (asset) =>
        isRecord(asset) &&
        typeof asset.asset === 'string' &&
        typeof asset.max_allocation_pct === 'number',
    ) &&
    typeof risk_policy.max_ltv_bps === 'number' &&
    typeof risk_policy.min_health_factor === 'string'
  );
}

export function isEmberOnboardingSeed(value: unknown): value is EmberOnboardingSeed {
  if (!isRecord(value)) {
    return false;
  }

  const { pm_setup, first_managed_mandate, future_subagent_plan } = value;
  if (
    !isRecord(pm_setup) ||
    !isRecord(first_managed_mandate) ||
    !isRecord(future_subagent_plan)
  ) {
    return false;
  }

  return (
    (pm_setup.risk_level === 'low' ||
      pm_setup.risk_level === 'medium' ||
      pm_setup.risk_level === 'high') &&
    typeof pm_setup.diagnosis_summary === 'string' &&
    typeof pm_setup.portfolio_intent_summary === 'string' &&
    isStringArray(pm_setup.operator_caveats) &&
    first_managed_mandate.target_agent_id === 'ember-lending' &&
    typeof first_managed_mandate.target_agent_key === 'string' &&
    isManagedLendingMandate(first_managed_mandate.managed_mandate) &&
    future_subagent_plan.status === 'exploratory_not_persisted' &&
    typeof future_subagent_plan.summary === 'string'
  );
}

export function parseWalletProfilerSeedParam(value: string | null): EmberOnboardingSeed | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as unknown;
    return isEmberOnboardingSeed(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

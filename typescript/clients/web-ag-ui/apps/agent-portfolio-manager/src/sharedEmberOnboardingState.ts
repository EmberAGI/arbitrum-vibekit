import type { PortfolioManagerSharedEmberProtocolHost } from './sharedEmberAdapter.js';

export const PORTFOLIO_MANAGER_SHARED_EMBER_NETWORK = 'arbitrum';
export const PORTFOLIO_MANAGER_DEFAULT_ACCOUNTING_AGENT_ID = 'ember-lending';

export type OnboardingProofs = {
  rooted_wallet_context_registered: boolean;
  root_delegation_registered: boolean;
  root_authority_active: boolean;
  wallet_baseline_observed: boolean;
  accounting_units_seeded: boolean;
  mandate_inputs_configured: boolean;
  reserve_policy_configured: boolean;
  capital_reserved_for_agent: boolean;
  policy_snapshot_recorded: boolean;
  agent_active: boolean;
};

export type OnboardingOwnedUnit = {
  unit_id: string;
  root_asset: string;
  quantity: string;
  status: string;
  control_path: string;
  reservation_id: string | null;
};

export type OnboardingReservation = {
  reservation_id: string;
  agent_id: string;
  purpose: string;
  status: string;
  control_path: string;
  unit_allocations: Array<{
    unit_id: string;
    quantity: string;
  }>;
};

export type OnboardingState = {
  wallet_address: string;
  network: string;
  phase: string;
  proofs: OnboardingProofs;
  rooted_wallet_context?: {
    rooted_wallet_context_id?: string;
  } | null;
  root_delegation?: {
    root_delegation_id?: string;
  } | null;
  owned_units?: OnboardingOwnedUnit[];
  reservations?: OnboardingReservation[];
} | null;

type OnboardingStateResponse = {
  result?: {
    revision?: number;
    onboarding_state?: OnboardingState;
  };
};

type OnboardingBootstrapMandate = {
  mandate_ref?: string;
  agent_id?: string;
  managed_onboarding?: unknown;
};

export type PortfolioManagerWalletAccountingDetails = {
  wallet: {
    address: string;
    network: string;
  };
  onboarding: {
    phase: string;
    revision: number;
    active: boolean;
    proofs: OnboardingProofs;
    rootedWalletContextId: string | null;
    rootDelegationId: string | null;
  };
  assets: Array<{
    unitId: string;
    asset: string;
    quantity: string;
    status: string;
    controlPath: string;
    reservationId: string | null;
  }>;
  reservations: Array<{
    reservationId: string;
    agentId: string;
    purpose: string;
    status: string;
    controlPath: string;
    allocations: Array<{
      unitId: string;
      asset: string;
      quantity: string;
    }>;
  }>;
};

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function resolvePortfolioManagerAccountingAgentId(onboardingBootstrap: unknown): string {
  if (typeof onboardingBootstrap !== 'object' || onboardingBootstrap === null) {
    return PORTFOLIO_MANAGER_DEFAULT_ACCOUNTING_AGENT_ID;
  }

  const onboardingBootstrapRecord = onboardingBootstrap as Record<string, unknown>;
  const mandates = Array.isArray(onboardingBootstrapRecord['mandates'])
    ? (onboardingBootstrapRecord['mandates'] as OnboardingBootstrapMandate[])
    : [];
  const activation =
    typeof onboardingBootstrapRecord['activation'] === 'object' &&
    onboardingBootstrapRecord['activation'] !== null
      ? onboardingBootstrapRecord['activation']
      : null;
  const activatedMandateRef =
    activation && 'mandateRef' in activation && typeof activation.mandateRef === 'string'
      ? activation.mandateRef
      : null;
  const activatedAgentId =
    activation && 'agentId' in activation && typeof activation.agentId === 'string'
      ? activation.agentId
      : null;

  const managedMandates = mandates.filter(
    (mandate) =>
      typeof mandate.agent_id === 'string' &&
      'managed_onboarding' in mandate &&
      mandate.managed_onboarding !== null,
  );
  const activatedManagedMandate = managedMandates.find(
    (mandate) => mandate.mandate_ref === activatedMandateRef,
  );
  const legacyActivatedManagedMandate =
    activatedAgentId === null
      ? null
      : mandates.find(
          (mandate) =>
            mandate.agent_id === activatedAgentId &&
            mandate.agent_id !== 'portfolio-manager',
        );

  return (
    activatedManagedMandate?.agent_id ??
    legacyActivatedManagedMandate?.agent_id ??
    managedMandates[0]?.agent_id ??
    PORTFOLIO_MANAGER_DEFAULT_ACCOUNTING_AGENT_ID
  );
}

export async function readPortfolioManagerOnboardingState(input: {
  protocolHost: PortfolioManagerSharedEmberProtocolHost;
  agentId: string;
  walletAddress: `0x${string}`;
  network?: string;
}): Promise<{
  revision: number;
  onboardingState: NonNullable<OnboardingState>;
}> {
  const response = (await input.protocolHost.handleJsonRpc({
    jsonrpc: '2.0',
    id: `shared-ember-wallet-accounting-${input.agentId}-${input.walletAddress}`,
    method: 'orchestrator.readOnboardingState.v1',
    params: {
      agent_id: input.agentId,
      wallet_address: input.walletAddress,
      network: input.network ?? PORTFOLIO_MANAGER_SHARED_EMBER_NETWORK,
    },
  })) as OnboardingStateResponse;

  const onboardingState = response.result?.onboarding_state;
  if (!onboardingState) {
    throw new Error('Shared Ember onboarding state response was missing onboarding_state.');
  }

  return {
    revision: response.result?.revision ?? 0,
    onboardingState,
  };
}

export function buildPortfolioManagerWalletAccountingDetails(input: {
  revision: number;
  onboardingState: NonNullable<OnboardingState>;
}): PortfolioManagerWalletAccountingDetails {
  const unitsById = new Map(
    (input.onboardingState.owned_units ?? []).map((ownedUnit) => [ownedUnit.unit_id, ownedUnit] as const),
  );
  const assets = (input.onboardingState.owned_units ?? []).map((ownedUnit) => ({
    unitId: ownedUnit.unit_id,
    asset: ownedUnit.root_asset,
    quantity: ownedUnit.quantity,
    status: ownedUnit.status,
    controlPath: ownedUnit.control_path,
    reservationId: ownedUnit.reservation_id,
  }));
  const reservations = (input.onboardingState.reservations ?? []).map((reservation) => ({
    reservationId: reservation.reservation_id,
    agentId: reservation.agent_id,
    purpose: reservation.purpose,
    status: reservation.status,
    controlPath: reservation.control_path,
    allocations: reservation.unit_allocations.map((allocation) => ({
      unitId: allocation.unit_id,
      asset: unitsById.get(allocation.unit_id)?.root_asset ?? 'unknown',
      quantity: allocation.quantity,
    })),
  }));

  return {
    wallet: {
      address: input.onboardingState.wallet_address,
      network: input.onboardingState.network,
    },
    onboarding: {
      phase: input.onboardingState.phase,
      revision: input.revision,
      active: input.onboardingState.proofs.agent_active,
      proofs: input.onboardingState.proofs,
      rootedWalletContextId:
        input.onboardingState.rooted_wallet_context?.rooted_wallet_context_id ?? null,
      rootDelegationId: input.onboardingState.root_delegation?.root_delegation_id ?? null,
    },
    assets,
    reservations,
  };
}

export function buildSharedEmberAccountingContextXml(input:
  | {
      status: 'live';
      details: PortfolioManagerWalletAccountingDetails;
    }
  | {
      status: 'unavailable';
      walletAddress: `0x${string}`;
      network?: string;
      error: string;
    }): string[] {
  const generatedAt = new Date().toISOString();

  if (input.status === 'unavailable') {
    return [
      '<shared_ember_accounting_context status="unavailable">',
      `  <generated_at>${escapeXml(generatedAt)}</generated_at>`,
      `  <wallet_address>${escapeXml(input.walletAddress)}</wallet_address>`,
      `  <network>${escapeXml(input.network ?? PORTFOLIO_MANAGER_SHARED_EMBER_NETWORK)}</network>`,
      `  <error>${escapeXml(input.error)}</error>`,
      '</shared_ember_accounting_context>',
    ];
  }

  const lines = ['<shared_ember_accounting_context freshness="live">'];
  lines.push(`  <generated_at>${escapeXml(generatedAt)}</generated_at>`);
  lines.push(`  <wallet_address>${escapeXml(input.details.wallet.address)}</wallet_address>`);
  lines.push(`  <network>${escapeXml(input.details.wallet.network)}</network>`);
  lines.push(`  <revision>${input.details.onboarding.revision}</revision>`);
  lines.push(`  <phase>${escapeXml(input.details.onboarding.phase)}</phase>`);
  lines.push('  <proofs>');
  for (const [name, value] of Object.entries(input.details.onboarding.proofs)) {
    lines.push(`    <${name}>${value}</${name}>`);
  }
  lines.push('  </proofs>');
  lines.push('  <assets>');
  for (const asset of input.details.assets) {
    lines.push(
      `    <asset unit_id="${escapeXml(asset.unitId)}"${
        asset.reservationId ? ` reservation_id="${escapeXml(asset.reservationId)}"` : ''
      }>`,
    );
    lines.push(`      <root_asset>${escapeXml(asset.asset)}</root_asset>`);
    lines.push(`      <quantity>${escapeXml(asset.quantity)}</quantity>`);
    lines.push(`      <status>${escapeXml(asset.status)}</status>`);
    lines.push(`      <control_path>${escapeXml(asset.controlPath)}</control_path>`);
    lines.push('    </asset>');
  }
  lines.push('  </assets>');
  lines.push('  <reservations>');
  for (const reservation of input.details.reservations) {
    lines.push(
      `    <reservation reservation_id="${escapeXml(reservation.reservationId)}" agent_id="${escapeXml(reservation.agentId)}">`,
    );
    lines.push(`      <purpose>${escapeXml(reservation.purpose)}</purpose>`);
    lines.push(`      <status>${escapeXml(reservation.status)}</status>`);
    lines.push(`      <control_path>${escapeXml(reservation.controlPath)}</control_path>`);
    lines.push('      <allocations>');
    for (const allocation of reservation.allocations) {
      lines.push(`        <allocation unit_id="${escapeXml(allocation.unitId)}">`);
      lines.push(`          <asset>${escapeXml(allocation.asset)}</asset>`);
      lines.push(`          <quantity>${escapeXml(allocation.quantity)}</quantity>`);
      lines.push('        </allocation>');
    }
    lines.push('      </allocations>');
    lines.push('    </reservation>');
  }
  lines.push('  </reservations>');
  lines.push('</shared_ember_accounting_context>');
  return lines;
}

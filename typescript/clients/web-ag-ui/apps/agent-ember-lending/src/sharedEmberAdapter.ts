import crypto from 'node:crypto';

import type { AgentRuntimeDomainConfig } from 'agent-runtime';
import {
  AgentRuntimeSigningError,
  signPreparedEvmTransaction,
  type AgentRuntimeSigningService,
} from 'agent-runtime/internal';
import type {
  EmberLendingAnchoredPayloadResolver,
  EmberLendingAnchoredPayloadRecord,
  EmberLendingCompactPlanSummary,
  EmberLendingPayloadBuilderOutput,
} from './onchainActionsPayloadResolver.js';

export type {
  EmberLendingAnchoredPayloadResolver,
  EmberLendingAnchoredPayloadRecord,
  EmberLendingCompactPlanSummary,
  EmberLendingPayloadBuilderOutput,
} from './onchainActionsPayloadResolver.js';

export type EmberLendingSharedEmberProtocolHost = {
  handleJsonRpc: (input: unknown) => Promise<unknown>;
  readCommittedEventOutbox: (input: unknown) => Promise<unknown>;
  acknowledgeCommittedEventOutbox: (input: unknown) => Promise<unknown>;
};

export const EMBER_LENDING_INTERNAL_HYDRATE_COMMAND = 'hydrate_runtime_projection';
export const EMBER_LENDING_SHARED_EMBER_AGENT_ID = 'ember-lending';
const PORTFOLIO_MANAGER_ROUTE_AGENT_ID = 'agent-portfolio-manager';
const EMBER_LENDING_ROUTE_AGENT_ID = 'agent-ember-lending';
const EMBER_LENDING_ROUTE_AGENT_KEY = 'ember-lending-primary';
const EMBER_LENDING_ROUTE_AGENT_TITLE = 'Ember Lending';

const PLANNING_PM_ONBOARDING_BLOCKED_MESSAGE =
  'Portfolio Manager onboarding must complete before lending can plan transactions for this thread.';
const PLANNING_PM_ADMISSION_BLOCKED_MESSAGE =
  'Portfolio Manager must admit a lending unit before lending can plan transactions for this thread.';
const PLANNING_PM_UNIT_SCOPE_BLOCKED_MESSAGE =
  'Lending can only plan with Portfolio Manager-admitted units for this thread.';
const PLANNING_PM_REQUESTED_QUANTITIES_BLOCKED_MESSAGE =
  'Lending requested_quantities must be JSON using Portfolio Manager-admitted unit ids and base-unit quantity strings.';

export type EmberLendingLifecycleState = {
  phase: 'prehire' | 'onboarding' | 'active' | 'firing' | 'inactive';
  mandateRef: string | null;
  mandateSummary: string | null;
  mandateContext: Record<string, unknown> | null;
  walletAddress: `0x${string}` | null;
  rootUserWalletAddress: `0x${string}` | null;
  rootedWalletContextId: string | null;
  lastPortfolioState: unknown;
  lastSharedEmberRevision: number | null;
  lastReservationSummary: string | null;
  lastCandidatePlan: unknown;
  lastCandidatePlanSummary: string | null;
  anchoredPayloadRecords: EmberLendingAnchoredPayloadRecord[];
  lastExecutionResult: unknown;
  lastExecutionTxHash: `0x${string}` | null;
  pendingExecutionSubmission?: PendingExecutionSubmission | null;
  lastEscalationRequest: unknown;
  lastEscalationSummary: string | null;
};

type CreateEmberLendingDomainOptions = {
  protocolHost?: EmberLendingSharedEmberProtocolHost;
  runtimeSigning?: AgentRuntimeSigningService;
  anchoredPayloadResolver?: EmberLendingAnchoredPayloadResolver;
  runtimeSignerRef?: string;
  agentId?: string;
};

type RequestTransactionExecutionResponse = {
  result?: {
    revision?: number;
    committed_event_ids?: string[];
    execution_result?: unknown;
  };
};

type SharedEmberRevisionResponse = {
  result?: {
    revision?: number;
  };
};

type SharedEmberExecutionContext = {
  generated_at?: string;
  network?: string;
  mandate_ref?: string;
  mandate_summary?: string;
  mandate_context?: Record<string, unknown> | null;
  subagent_wallet_address?: string;
  root_user_wallet_address?: string;
  rooted_wallet_context_id?: string;
  owned_units?: Array<{
    unit_id?: string;
    root_asset?: string;
    amount?: string;
    status?: string;
    control_path?: string;
    position_kind?: string;
    protocol_family?: string | null;
    protocol_position_ref?: string | null;
    benchmark_value_usd?: string;
  }>;
  reservations?: Array<{
    reservation_id?: string;
    control_path?: string;
    purpose?: string;
    unit_allocations?: Array<{
      unit_id?: string;
      quantity?: string;
    }>;
  }>;
  wallet_contents?: Array<{
    asset?: string;
    amount?: string;
    benchmark_value_usd?: string;
  }>;
} | null;

type ExecutionContextResponse = {
  result?: {
    revision?: number;
    execution_context?: SharedEmberExecutionContext;
  };
};

type SharedEmberExecutionContextEnvelope = {
  revision: number | null;
  executionContext: NonNullable<SharedEmberExecutionContext>;
};

type PendingExecutionSubmission = {
  transactionPlanId: string;
  requestId: string;
  idempotencyKey: string;
  signedTransaction: Record<string, unknown>;
  revision: number | null;
};

type RequestedQuantity = {
  unit_id: string;
  quantity: string;
};

type ManagedPlanningReadiness =
  | {
      status: 'ready';
      candidateUnitIds: string[];
      requestedQuantities: RequestedQuantity[];
    }
  | {
      status: 'blocked';
      statusMessage: string;
    };

type ParsedRequestedQuantitiesInput =
  | {
      status: 'absent';
    }
  | {
      status: 'valid';
      requestedQuantities: RequestedQuantity[];
    }
  | {
      status: 'invalid';
    };

type SharedEmberCommittedEvent = {
  sequence?: number;
  aggregate?: string;
  aggregate_id?: string;
  event_type?: string;
  payload?: Record<string, unknown>;
};

type PortfolioProjection = Pick<
  EmberLendingLifecycleState,
  | 'mandateRef'
  | 'mandateSummary'
  | 'mandateContext'
  | 'walletAddress'
  | 'rootUserWalletAddress'
  | 'rootedWalletContextId'
  | 'lastReservationSummary'
>;

type ManagedMandateEditorProjection = {
  ownerAgentId: typeof PORTFOLIO_MANAGER_ROUTE_AGENT_ID;
  targetAgentId: typeof EMBER_LENDING_SHARED_EMBER_AGENT_ID;
  targetAgentRouteId: typeof EMBER_LENDING_ROUTE_AGENT_ID;
  targetAgentKey: typeof EMBER_LENDING_ROUTE_AGENT_KEY;
  targetAgentTitle: typeof EMBER_LENDING_ROUTE_AGENT_TITLE;
  mandateRef: string;
  mandateSummary: string;
  managedMandate: {
    allocation_basis: string;
    allowed_assets: string[];
    asset_intent: {
      root_asset: string;
      network: string;
      benchmark_asset: string;
      intent: string;
      control_path: string;
    };
  };
  agentWallet: `0x${string}` | null;
  rootUserWallet: `0x${string}` | null;
  rootedWalletContextId: string | null;
  reservation: {
    reservationId: string;
    purpose: string | null;
    controlPath: string | null;
    rootAsset: string | null;
    quantity: string | null;
  } | null;
};

const DIRECT_HIRE_MESSAGE =
  'Use the portfolio manager to onboard and activate the managed lending agent.';
const DIRECT_FIRE_MESSAGE =
  'Use the portfolio manager to deactivate the managed lending agent.';
const SHARED_EMBER_NETWORK = 'arbitrum';
const OWS_SIGNING_CHAIN = 'evm';
const MAX_PREPARE_TRANSACTION_ATTEMPTS = 3;
const MAX_SIGNED_TRANSACTION_SUBMISSIONS = 8;
const DEFAULT_RUNTIME_SIGNER_REF = 'service-wallet';
const REDELEGATION_WAIT_TIMEOUT_MS = 1_000;

class LocalExecutionFailureError extends Error {
  revision: number | null;

  constructor(message: string, revision: number | null) {
    super(message);
    this.name = 'LocalExecutionFailureError';
    this.revision = revision;
  }
}

class PendingExecutionSubmissionError extends Error {
  revision: number | null;
  pendingSubmission: PendingExecutionSubmission;

  constructor(message: string, revision: number | null, pendingSubmission: PendingExecutionSubmission) {
    super(message);
    this.name = 'PendingExecutionSubmissionError';
    this.revision = revision;
    this.pendingSubmission = pendingSubmission;
  }
}

function buildDefaultLifecycleState(): EmberLendingLifecycleState {
  return {
    phase: 'prehire',
    mandateRef: null,
    mandateSummary: null,
    mandateContext: null,
    walletAddress: null,
    rootUserWalletAddress: null,
    rootedWalletContextId: null,
    lastPortfolioState: null,
    lastSharedEmberRevision: null,
    lastReservationSummary: null,
    lastCandidatePlan: null,
    lastCandidatePlanSummary: null,
    anchoredPayloadRecords: [],
    lastExecutionResult: null,
    lastExecutionTxHash: null,
    pendingExecutionSubmission: null,
    lastEscalationRequest: null,
    lastEscalationSummary: null,
  };
}

function normalizeLifecycleState(
  state: Partial<EmberLendingLifecycleState> | null | undefined,
): EmberLendingLifecycleState {
  return {
    ...buildDefaultLifecycleState(),
    ...(state ?? {}),
    anchoredPayloadRecords: Array.isArray(state?.anchoredPayloadRecords)
      ? state.anchoredPayloadRecords
      : [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readHexAddress(value: unknown): `0x${string}` | null {
  const normalized = readString(value);
  if (!normalized?.startsWith('0x')) {
    return null;
  }

  return normalized as `0x${string}`;
}

function readHexValue(value: unknown): `0x${string}` | null {
  const normalized = readString(value);
  return normalized?.startsWith('0x') ? (normalized as `0x${string}`) : null;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function isSharedEmberRevisionConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('Shared Ember Domain Service JSON-RPC error: protocol_conflict') &&
    error.message.includes('expected_revision')
  );
}

async function readSharedEmberExecutionContext(input: {
  protocolHost: EmberLendingSharedEmberProtocolHost;
  threadId: string;
  agentId: string;
}): Promise<SharedEmberExecutionContextEnvelope> {
  const response = (await input.protocolHost.handleJsonRpc({
    jsonrpc: '2.0',
    id: `shared-ember-${input.threadId}-read-execution-context`,
    method: 'subagent.readExecutionContext.v1',
    params: {
      agent_id: input.agentId,
    },
  })) as ExecutionContextResponse;

  const executionContext = response.result?.execution_context;
  if (!executionContext || !isRecord(executionContext)) {
    throw new Error('Shared Ember execution context response was missing execution_context.');
  }

  return {
    revision: response.result?.revision ?? null,
    executionContext,
  };
}

async function readCurrentSharedEmberRevision(input: {
  protocolHost: EmberLendingSharedEmberProtocolHost;
  threadId: string;
  agentId: string;
}): Promise<number> {
  const response = (await input.protocolHost.handleJsonRpc({
    jsonrpc: '2.0',
    id: `shared-ember-${input.threadId}-read-current-revision`,
    method: 'subagent.readPortfolioState.v1',
    params: {
      agent_id: input.agentId,
    },
  })) as SharedEmberRevisionResponse;

  return response.result?.revision ?? 0;
}

function mergeKnownRevision(...revisions: Array<number | null | undefined>): number | null {
  let highest: number | null = null;

  for (const revision of revisions) {
    if (typeof revision !== 'number') {
      continue;
    }
    if (highest === null || revision > highest) {
      highest = revision;
    }
  }

  return highest;
}

async function runSharedEmberCommandWithResolvedRevision<T>(input: {
  protocolHost: EmberLendingSharedEmberProtocolHost;
  threadId: string;
  agentId: string;
  currentRevision: number | null;
  buildRequest: (expectedRevision: number) => unknown;
}): Promise<T> {
  let expectedRevision =
    input.currentRevision ?? (await readCurrentSharedEmberRevision(input));

  try {
    return (await input.protocolHost.handleJsonRpc(input.buildRequest(expectedRevision))) as T;
  } catch (error) {
    if (!isSharedEmberRevisionConflict(error)) {
      throw error;
    }

    const refreshedRevision = await readCurrentSharedEmberRevision(input);
    if (refreshedRevision === expectedRevision) {
      throw error;
    }

    expectedRevision = refreshedRevision;
    return (await input.protocolHost.handleJsonRpc(input.buildRequest(expectedRevision))) as T;
  }
}

function readFirstRecordFromArray(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value)) {
    return null;
  }

  for (const entry of value) {
    if (isRecord(entry)) {
      return entry;
    }
  }

  return null;
}

function summarizeReservation(portfolioState: unknown): string | null {
  if (!isRecord(portfolioState)) {
    return null;
  }

  const reservation = readFirstRecordFromArray(portfolioState['reservations']);
  if (!reservation) {
    return null;
  }

  const reservationId = readString(reservation['reservation_id']);
  const purpose = readString(reservation['purpose']);
  const controlPath = readString(reservation['control_path']);

  let rootAsset: string | null = null;
  let quantity: string | null = null;
  if (Array.isArray(portfolioState['owned_units'])) {
    const matchingOwnedUnit =
      portfolioState['owned_units'].find(
        (candidate) =>
          isRecord(candidate) &&
          readString(candidate['reservation_id']) === reservationId,
      ) ?? readFirstRecordFromArray(portfolioState['owned_units']);

    if (isRecord(matchingOwnedUnit)) {
      rootAsset = readString(matchingOwnedUnit['root_asset']);
      quantity = readString(matchingOwnedUnit['quantity']);
    }
  }

  if (!reservationId) {
    return null;
  }

  const reservationAction =
    purpose === 'deploy' ? 'deploys' : purpose ? `${purpose}s` : 'moves';
  const quantitySummary = quantity && rootAsset ? ` ${quantity} ${rootAsset}` : ' capital';
  const controlPathSummary = controlPath ? ` via ${controlPath}` : '';

  return `Reservation ${reservationId} ${reservationAction}${quantitySummary}${controlPathSummary}.`;
}

function readPortfolioOwnedUnit(portfolioState: Record<string, unknown>): Record<string, unknown> | null {
  if (!Array.isArray(portfolioState['owned_units'])) {
    return null;
  }

  for (const candidate of portfolioState['owned_units']) {
    if (isRecord(candidate)) {
      return candidate;
    }
  }

  return null;
}

function readPortfolioOwnedUnits(portfolioState: unknown): Record<string, unknown>[] {
  if (!isRecord(portfolioState) || !Array.isArray(portfolioState['owned_units'])) {
    return [];
  }

  return portfolioState['owned_units'].filter(
    (candidate): candidate is Record<string, unknown> => isRecord(candidate),
  );
}

function readLaneContextFallback(portfolioState: Record<string, unknown>): Record<string, unknown> | null {
  const ownedUnit = readPortfolioOwnedUnit(portfolioState);
  const reservation = readFirstRecordFromArray(portfolioState['reservations']);
  const network = readString(ownedUnit?.['network']) ?? readString(reservation?.['network']);
  const controlPath = readString(reservation?.['control_path']);
  const [protocolFamily] = (controlPath ?? '').split('.', 1);
  const protocol = protocolFamily.trim().length > 0 ? protocolFamily : null;

  if (!network && !protocol) {
    return null;
  }

  return {
    ...(network ? { network } : {}),
    ...(protocol ? { protocol } : {}),
  };
}

function readMandateProjection(portfolioState: Record<string, unknown>): PortfolioProjection {
  const mandateRecord =
    'mandate' in portfolioState && isRecord(portfolioState['mandate'])
      ? portfolioState['mandate']
      : null;

  const mandateRef =
    readString(portfolioState['mandate_ref']) ?? readString(mandateRecord?.['mandate_ref']);
  const mandateSummary =
    readString(portfolioState['mandate_summary']) ?? readString(mandateRecord?.['summary']);
  const mandateContext =
    ('mandate_context' in portfolioState && isRecord(portfolioState['mandate_context'])
      ? portfolioState['mandate_context']
      : null) ??
    (mandateRecord && isRecord(mandateRecord['context']) ? mandateRecord['context'] : null) ??
    readLaneContextFallback(portfolioState);

  return {
    mandateRef,
    mandateSummary,
    mandateContext,
    walletAddress: readHexAddress(portfolioState['agent_wallet']),
    rootUserWalletAddress: readHexAddress(portfolioState['root_user_wallet']),
    rootedWalletContextId: readString(portfolioState['rooted_wallet_context_id']),
    lastReservationSummary: summarizeReservation(portfolioState),
  };
}

function mergePortfolioProjection(
  state: EmberLendingLifecycleState,
  portfolioState: unknown,
): Pick<
  EmberLendingLifecycleState,
  | 'mandateRef'
  | 'mandateSummary'
  | 'mandateContext'
  | 'walletAddress'
  | 'rootUserWalletAddress'
  | 'rootedWalletContextId'
  | 'lastReservationSummary'
> {
  if (!isRecord(portfolioState)) {
    return {
      mandateRef: state.mandateRef,
      mandateSummary: state.mandateSummary,
      mandateContext: state.mandateContext,
      walletAddress: state.walletAddress,
      rootUserWalletAddress: state.rootUserWalletAddress,
      rootedWalletContextId: state.rootedWalletContextId,
      lastReservationSummary: state.lastReservationSummary,
    };
  }

  const projection = readMandateProjection(portfolioState);

  return {
    mandateRef: projection.mandateRef,
    mandateSummary: projection.mandateSummary,
    mandateContext: projection.mandateContext,
    walletAddress: projection.walletAddress,
    rootUserWalletAddress: projection.rootUserWalletAddress,
    rootedWalletContextId: projection.rootedWalletContextId,
    lastReservationSummary: projection.lastReservationSummary,
  };
}

function readExecutionContextProjection(
  executionContext: NonNullable<SharedEmberExecutionContext>,
): Pick<
  EmberLendingLifecycleState,
  | 'mandateRef'
  | 'mandateSummary'
  | 'mandateContext'
  | 'walletAddress'
  | 'rootUserWalletAddress'
  | 'rootedWalletContextId'
  | 'lastReservationSummary'
> {
  const mandateContext =
    (isRecord(executionContext.mandate_context) ? executionContext.mandate_context : null) ??
    (() => {
      const network = readString(executionContext.network);
      return network ? { network } : null;
    })();

  return {
    mandateRef: readString(executionContext.mandate_ref),
    mandateSummary: readString(executionContext.mandate_summary),
    mandateContext,
    walletAddress: readHexAddress(executionContext.subagent_wallet_address),
    rootUserWalletAddress: readHexAddress(executionContext.root_user_wallet_address),
    rootedWalletContextId: readString(executionContext.rooted_wallet_context_id),
    lastReservationSummary: null,
  };
}

function mergeExecutionContextProjection(
  state: EmberLendingLifecycleState,
  executionContext: SharedEmberExecutionContext | null,
): Pick<
  EmberLendingLifecycleState,
  | 'mandateRef'
  | 'mandateSummary'
  | 'mandateContext'
  | 'walletAddress'
  | 'rootUserWalletAddress'
  | 'rootedWalletContextId'
  | 'lastReservationSummary'
> {
  if (!executionContext || !isRecord(executionContext)) {
    return {
      mandateRef: state.mandateRef,
      mandateSummary: state.mandateSummary,
      mandateContext: state.mandateContext,
      walletAddress: state.walletAddress,
      rootUserWalletAddress: state.rootUserWalletAddress,
      rootedWalletContextId: state.rootedWalletContextId,
      lastReservationSummary: state.lastReservationSummary,
    };
  }

  const projection = readExecutionContextProjection(executionContext);

  return {
    mandateRef: projection.mandateRef ?? state.mandateRef,
    mandateSummary: projection.mandateSummary ?? state.mandateSummary,
    mandateContext: projection.mandateContext ?? state.mandateContext,
    walletAddress: projection.walletAddress ?? state.walletAddress,
    rootUserWalletAddress: projection.rootUserWalletAddress ?? state.rootUserWalletAddress,
    rootedWalletContextId: projection.rootedWalletContextId ?? state.rootedWalletContextId,
    lastReservationSummary: projection.lastReservationSummary ?? state.lastReservationSummary,
  };
}

function readManagedMandate(
  mandateContext: Record<string, unknown> | null,
): ManagedMandateEditorProjection['managedMandate'] | null {
  if (!mandateContext) {
    return null;
  }

  const allocationBasis = readString(mandateContext['allocation_basis']);
  const allowedAssets = mandateContext['allowed_assets'];
  const assetIntent = isRecord(mandateContext['asset_intent']) ? mandateContext['asset_intent'] : null;
  const rootAsset = readString(assetIntent?.['root_asset']);
  const network = readString(assetIntent?.['network']);
  const benchmarkAsset = readString(assetIntent?.['benchmark_asset']);
  const intent = readString(assetIntent?.['intent']);
  const controlPath = readString(assetIntent?.['control_path']);

  if (
    allocationBasis === null ||
    !Array.isArray(allowedAssets) ||
    !allowedAssets.every((value) => typeof value === 'string' && value.trim().length > 0) ||
    rootAsset === null ||
    network === null ||
    benchmarkAsset === null ||
    intent === null ||
    controlPath === null
  ) {
    return null;
  }

  return {
    allocation_basis: allocationBasis,
    allowed_assets: allowedAssets,
    asset_intent: {
      root_asset: rootAsset,
      network,
      benchmark_asset: benchmarkAsset,
      intent,
      control_path: controlPath,
    },
  };
}

function buildManagedMandateEditorProjection(
  state: EmberLendingLifecycleState,
): ManagedMandateEditorProjection | null {
  const managedMandate = isRecord(state.mandateContext) ? readManagedMandate(state.mandateContext) : null;
  if (!state.mandateRef || !state.mandateSummary || !managedMandate) {
    return null;
  }

  const portfolioState = isRecord(state.lastPortfolioState) ? state.lastPortfolioState : null;
  const firstReservation = portfolioState ? readFirstRecordFromArray(portfolioState['reservations']) : null;
  const reservationId = readString(firstReservation?.['reservation_id']);
  const ownedUnits = portfolioState && Array.isArray(portfolioState['owned_units']) ? portfolioState['owned_units'] : [];
  const reservedUnit =
    ownedUnits.find(
      (candidate) =>
        isRecord(candidate) && readString(candidate['reservation_id']) === reservationId,
    ) ?? readFirstRecordFromArray(ownedUnits);

  return {
    ownerAgentId: PORTFOLIO_MANAGER_ROUTE_AGENT_ID,
    targetAgentId: EMBER_LENDING_SHARED_EMBER_AGENT_ID,
    targetAgentRouteId: EMBER_LENDING_ROUTE_AGENT_ID,
    targetAgentKey: EMBER_LENDING_ROUTE_AGENT_KEY,
    targetAgentTitle: EMBER_LENDING_ROUTE_AGENT_TITLE,
    mandateRef: state.mandateRef,
    mandateSummary: state.mandateSummary,
    managedMandate,
    agentWallet: state.walletAddress,
    rootUserWallet: state.rootUserWalletAddress,
    rootedWalletContextId: state.rootedWalletContextId,
    reservation:
      reservationId !== null
        ? {
            reservationId,
            purpose: readString(firstReservation?.['purpose']),
            controlPath: readString(firstReservation?.['control_path']),
            rootAsset: isRecord(reservedUnit) ? readString(reservedUnit['root_asset']) : null,
            quantity: isRecord(reservedUnit) ? readString(reservedUnit['quantity']) : null,
          }
        : null,
  };
}

function mergePortfolioStateWithExecutionContext(input: {
  portfolioState: unknown;
  executionContext: SharedEmberExecutionContext | null;
  fallbackPortfolioState: unknown;
}): unknown {
  const baseState = isRecord(input.portfolioState)
    ? { ...input.portfolioState }
    : isRecord(input.fallbackPortfolioState)
      ? { ...input.fallbackPortfolioState }
      : null;
  const fallbackOwnedUnits = readPortfolioOwnedUnits(input.fallbackPortfolioState);
  const portfolioOwnedUnits = readPortfolioOwnedUnits(input.portfolioState);
  const executionContextOwnedUnits = Array.isArray(input.executionContext?.owned_units)
    ? input.executionContext.owned_units.filter(
        (candidate): candidate is Record<string, unknown> => isRecord(candidate),
      )
    : [];
  const fallbackReservations = readPortfolioReservations(input.fallbackPortfolioState);
  const portfolioReservations = readPortfolioReservations(input.portfolioState);
  const executionContextReservations = Array.isArray(input.executionContext?.reservations)
    ? input.executionContext.reservations.filter(
        (candidate): candidate is Record<string, unknown> => isRecord(candidate),
      )
    : [];

  const ownedUnits = mergeContextRecords({
    primary: portfolioOwnedUnits.length > 0 ? portfolioOwnedUnits : executionContextOwnedUnits,
    fallback:
      portfolioOwnedUnits.length > 0
        ? mergeContextRecords({
            primary: executionContextOwnedUnits,
            fallback: fallbackOwnedUnits,
            idKey: 'unit_id',
          })
        : fallbackOwnedUnits,
    idKey: 'unit_id',
  });
  const reservations = mergeContextRecords({
    primary:
      portfolioReservations.length > 0 ? portfolioReservations : executionContextReservations,
    fallback:
      portfolioReservations.length > 0
        ? mergeContextRecords({
            primary: executionContextReservations,
            fallback: fallbackReservations,
            idKey: 'reservation_id',
          })
        : fallbackReservations,
    idKey: 'reservation_id',
  });

  if (baseState === null) {
    return ownedUnits.length > 0 || reservations.length > 0
      ? {
          owned_units: ownedUnits,
          reservations,
        }
      : input.portfolioState;
  }

  return {
    ...baseState,
    ...(ownedUnits.length > 0 || Array.isArray(baseState['owned_units'])
      ? { owned_units: ownedUnits }
      : {}),
    ...(reservations.length > 0 || Array.isArray(baseState['reservations'])
      ? { reservations }
      : {}),
  };
}

async function hydrateManagedProjectionFromSharedEmber(input: {
  protocolHost: EmberLendingSharedEmberProtocolHost;
  state: EmberLendingLifecycleState;
  threadId: string;
  agentId: string;
}): Promise<EmberLendingLifecycleState> {
  const response = (await input.protocolHost.handleJsonRpc({
    jsonrpc: '2.0',
    id: `shared-ember-${input.threadId}-hydrate-runtime-projection`,
    method: 'subagent.readPortfolioState.v1',
    params: {
      agent_id: input.agentId,
    },
  })) as {
    result?: {
      revision?: number;
      portfolio_state?: unknown;
    };
  };

  const portfolioState = response.result?.portfolio_state ?? null;
  let executionContextEnvelope: SharedEmberExecutionContextEnvelope | null = null;
  try {
    executionContextEnvelope = await readSharedEmberExecutionContext({
      protocolHost: input.protocolHost,
      threadId: input.threadId,
      agentId: input.agentId,
    });
  } catch {
    executionContextEnvelope = null;
  }
  const mergedPortfolioState = mergePortfolioStateWithExecutionContext({
    portfolioState,
    executionContext: executionContextEnvelope?.executionContext ?? null,
    fallbackPortfolioState: input.state.lastPortfolioState,
  });

  const portfolioProjection = mergePortfolioProjection(input.state, mergedPortfolioState);
  const stateWithPortfolioProjection: EmberLendingLifecycleState = {
    ...input.state,
    mandateRef: portfolioProjection.mandateRef ?? input.state.mandateRef,
    mandateSummary: portfolioProjection.mandateSummary ?? input.state.mandateSummary,
    mandateContext: portfolioProjection.mandateContext ?? input.state.mandateContext,
    walletAddress: portfolioProjection.walletAddress ?? input.state.walletAddress,
    rootUserWalletAddress:
      portfolioProjection.rootUserWalletAddress ?? input.state.rootUserWalletAddress,
    rootedWalletContextId:
      portfolioProjection.rootedWalletContextId ?? input.state.rootedWalletContextId,
    lastReservationSummary:
      portfolioProjection.lastReservationSummary ?? input.state.lastReservationSummary,
  };
  const projection = mergeExecutionContextProjection(
    stateWithPortfolioProjection,
    executionContextEnvelope?.executionContext ?? null,
  );

  return {
    ...stateWithPortfolioProjection,
    ...projection,
    phase:
      hasManagedPortfolioProjection(mergedPortfolioState) ||
      hasManagedExecutionContextProjection(executionContextEnvelope?.executionContext ?? null)
        ? 'active'
        : input.state.phase,
    lastPortfolioState: mergedPortfolioState,
    lastSharedEmberRevision: mergeKnownRevision(
      response.result?.revision ?? null,
      executionContextEnvelope?.revision ?? null,
    ),
  };
}

function hasManagedPortfolioProjection(portfolioState: unknown): boolean {
  if (!isRecord(portfolioState)) {
    return false;
  }

  if (Array.isArray(portfolioState['owned_units']) && portfolioState['owned_units'].length > 0) {
    return true;
  }

  if (Array.isArray(portfolioState['reservations']) && portfolioState['reservations'].length > 0) {
    return true;
  }

  return (
    readString(portfolioState['mandate_ref']) !== null ||
    readHexAddress(portfolioState['agent_wallet']) !== null ||
    readHexAddress(portfolioState['root_user_wallet']) !== null ||
    readString(portfolioState['rooted_wallet_context_id']) !== null
  );
}

function hasManagedExecutionContextProjection(executionContext: SharedEmberExecutionContext | null): boolean {
  if (!executionContext || !isRecord(executionContext)) {
    return false;
  }

  return (
    readString(executionContext.mandate_ref) !== null ||
    readString(executionContext.mandate_summary) !== null ||
    isRecord(executionContext.mandate_context) ||
    readHexAddress(executionContext.subagent_wallet_address) !== null ||
    readHexAddress(executionContext.root_user_wallet_address) !== null
  );
}

export function hasConnectReadyEmberLendingRuntimeProjection(state: unknown): boolean {
  if (!isRecord(state)) {
    return false;
  }

  if (hasManagedPortfolioProjection(state['lastPortfolioState'])) {
    return true;
  }

  return (
    readString(state['mandateRef']) !== null &&
    readHexAddress(state['walletAddress']) !== null &&
    readHexAddress(state['rootUserWalletAddress']) !== null &&
    readString(state['rootedWalletContextId']) !== null
  );
}

function readStateNetwork(state: EmberLendingLifecycleState): string | null {
  const managedMandate = isRecord(state.mandateContext)
    ? readManagedMandate(state.mandateContext)
    : null;
  if (managedMandate) {
    return managedMandate.asset_intent.network;
  }

  return isRecord(state.mandateContext) ? readString(state.mandateContext['network']) : null;
}

function shouldReadSharedEmberExecutionContext(state: EmberLendingLifecycleState): boolean {
  return Boolean(
    state.mandateRef ||
      state.walletAddress ||
      state.rootUserWalletAddress ||
      state.lastSharedEmberRevision !== null ||
      state.phase === 'active',
  );
}

function buildFallbackExecutionContextXml(state: EmberLendingLifecycleState): string[] {
  const lines = ['<ember_lending_execution_context freshness="cached">'];
  lines.push(`  <generated_at>${escapeXml(new Date().toISOString())}</generated_at>`);
  lines.push(`  <network>${escapeXml(readStateNetwork(state) ?? SHARED_EMBER_NETWORK)}</network>`);

  if (state.mandateRef) {
    lines.push(`  <mandate_ref>${escapeXml(state.mandateRef)}</mandate_ref>`);
  }

  if (state.mandateSummary) {
    lines.push(`  <mandate_summary>${escapeXml(state.mandateSummary)}</mandate_summary>`);
  }

  if (state.mandateContext) {
    lines.push(
      `  <mandate_context_json>${escapeXml(JSON.stringify(state.mandateContext))}</mandate_context_json>`,
    );
  }

  if (state.walletAddress) {
    lines.push(`  <subagent_wallet_address>${state.walletAddress}</subagent_wallet_address>`);
  }

  if (state.rootUserWalletAddress) {
    lines.push(
      `  <root_user_wallet_address>${state.rootUserWalletAddress}</root_user_wallet_address>`,
    );
  }

  lines.push('</ember_lending_execution_context>');
  return lines;
}

function buildSharedEmberExecutionContextXml(
  input:
    | {
        status: 'live';
        state: EmberLendingLifecycleState;
        executionContext: NonNullable<SharedEmberExecutionContext>;
      }
    | {
        status: 'unavailable';
        state: EmberLendingLifecycleState;
        error: string;
      },
): string[] {
  if (input.status === 'unavailable') {
    const lines = buildFallbackExecutionContextXml(input.state);
    lines[0] = '<ember_lending_execution_context status="unavailable">';
    lines.splice(lines.length - 1, 0, `  <error>${escapeXml(input.error)}</error>`);
    return lines;
  }

  const generatedAt = readString(input.executionContext.generated_at) ?? new Date().toISOString();
  const network = readString(input.executionContext.network) ?? SHARED_EMBER_NETWORK;
  const lines = ['<ember_lending_execution_context freshness="live">'];
  lines.push(`  <generated_at>${escapeXml(generatedAt)}</generated_at>`);

  const mandateRef = readString(input.executionContext.mandate_ref);
  if (mandateRef) {
    lines.push(`  <mandate_ref>${escapeXml(mandateRef)}</mandate_ref>`);
  }

  const mandateSummary = readString(input.executionContext.mandate_summary);
  if (mandateSummary) {
    lines.push(`  <mandate_summary>${escapeXml(mandateSummary)}</mandate_summary>`);
  }

  if (isRecord(input.executionContext.mandate_context)) {
    lines.push(
      `  <mandate_context_json>${escapeXml(
        JSON.stringify(input.executionContext.mandate_context),
      )}</mandate_context_json>`,
    );
  }

  const subagentWalletAddress = readHexAddress(input.executionContext.subagent_wallet_address);
  if (subagentWalletAddress) {
    lines.push(`  <subagent_wallet_address>${subagentWalletAddress}</subagent_wallet_address>`);
  }

  const rootUserWalletAddress = readHexAddress(input.executionContext.root_user_wallet_address);
  if (rootUserWalletAddress) {
    lines.push(
      `  <root_user_wallet_address>${rootUserWalletAddress}</root_user_wallet_address>`,
    );
  }

  lines.push(`  <network>${escapeXml(network)}</network>`);

  const ownedUnits = mergeContextRecords({
    primary: input.executionContext.owned_units,
    fallback: readPortfolioOwnedUnits(input.state.lastPortfolioState),
    idKey: 'unit_id',
  });
  if (ownedUnits.length > 0) {
    lines.push('  <owned_units>');
    for (const ownedUnit of ownedUnits) {
      const unitId = readString(ownedUnit.unit_id);
      lines.push(`    <owned_unit${unitId ? ` unit_id="${escapeXml(unitId)}"` : ''}>`);

      const rootAsset = readString(ownedUnit.root_asset);
      if (rootAsset) {
        lines.push(`      <root_asset>${escapeXml(rootAsset)}</root_asset>`);
      }

      const status = readString(ownedUnit.status);
      if (status) {
        lines.push(`      <status>${escapeXml(status)}</status>`);
      }

      const controlPath = readString(ownedUnit.control_path);
      if (controlPath) {
        lines.push(`      <control_path>${escapeXml(controlPath)}</control_path>`);
      }

      const positionKind = readString(ownedUnit.position_kind);
      if (positionKind) {
        lines.push(`      <position_kind>${escapeXml(positionKind)}</position_kind>`);
      }

      const protocolFamily = readString(ownedUnit.protocol_family);
      if (protocolFamily) {
        lines.push(`      <protocol_family>${escapeXml(protocolFamily)}</protocol_family>`);
      }

      const protocolPositionRef = readString(ownedUnit.protocol_position_ref);
      if (protocolPositionRef) {
        lines.push(
          `      <protocol_position_ref>${escapeXml(protocolPositionRef)}</protocol_position_ref>`,
        );
      }

      const amount = readString(ownedUnit.amount);
      if (amount) {
        lines.push(`      <amount>${escapeXml(amount)}</amount>`);
      }

      const benchmarkValueUsd = readString(ownedUnit.benchmark_value_usd);
      if (benchmarkValueUsd) {
        lines.push(`      <benchmark_value_usd>${escapeXml(benchmarkValueUsd)}</benchmark_value_usd>`);
      }

      lines.push('    </owned_unit>');
    }
    lines.push('  </owned_units>');
  }

  const reservations = mergeContextRecords({
    primary: input.executionContext.reservations,
    fallback: readPortfolioReservations(input.state.lastPortfolioState),
    idKey: 'reservation_id',
  });
  if (reservations.length > 0) {
    lines.push('  <active_reservations>');
    for (const reservation of reservations) {
      const reservationId = readString(reservation.reservation_id);
      lines.push(
        `    <reservation${reservationId ? ` reservation_id="${escapeXml(reservationId)}"` : ''}>`,
      );

      const controlPath = readString(reservation.control_path);
      if (controlPath) {
        lines.push(`      <control_path>${escapeXml(controlPath)}</control_path>`);
      }

      const purpose = readString(reservation.purpose);
      if (purpose) {
        lines.push(`      <purpose>${escapeXml(purpose)}</purpose>`);
      }

      if (Array.isArray(reservation.unit_allocations) && reservation.unit_allocations.length > 0) {
        lines.push('      <unit_allocations>');
        for (const allocation of reservation.unit_allocations) {
          const unitId = readString(allocation.unit_id);
          lines.push(
            `        <unit_allocation${unitId ? ` unit_id="${escapeXml(unitId)}"` : ''}>`,
          );
          const quantity = readString(allocation.quantity);
          if (quantity) {
            lines.push(`          <quantity>${escapeXml(quantity)}</quantity>`);
          }
          lines.push('        </unit_allocation>');
        }
        lines.push('      </unit_allocations>');
      }

      lines.push('    </reservation>');
    }
    lines.push('  </active_reservations>');
  }

  if (
    Array.isArray(input.executionContext.wallet_contents) &&
    input.executionContext.wallet_contents.length > 0
  ) {
    lines.push('  <wallet_contents>');
    for (const walletBalance of input.executionContext.wallet_contents) {
      const asset = readString(walletBalance.asset);
      lines.push(`    <wallet_balance${asset ? ` asset="${escapeXml(asset)}"` : ''}>`);

      const amount = readString(walletBalance.amount);
      if (amount) {
        lines.push(`      <amount>${escapeXml(amount)}</amount>`);
      }

      const benchmarkValueUsd = readString(walletBalance.benchmark_value_usd);
      if (benchmarkValueUsd) {
        lines.push(`      <benchmark_value_usd>${escapeXml(benchmarkValueUsd)}</benchmark_value_usd>`);
      }

      lines.push('    </wallet_balance>');
    }
    lines.push('  </wallet_contents>');
  }

  lines.push('</ember_lending_execution_context>');
  return lines;
}

function readCandidatePlanSummary(candidatePlan: unknown): string | null {
  if (!isRecord(candidatePlan)) {
    return null;
  }

  const compactPlanSummary =
    'compact_plan_summary' in candidatePlan && isRecord(candidatePlan['compact_plan_summary'])
      ? candidatePlan['compact_plan_summary']
      : null;

  return readString(compactPlanSummary?.['summary']) ?? readString(candidatePlan['transaction_plan_id']);
}

function readCandidatePlanTransactionPlanId(candidatePlan: unknown): string | null {
  return readStringKey(candidatePlan, 'transaction_plan_id');
}

function readCandidatePlanPayloadBuilderOutput(
  candidatePlan: unknown,
): EmberLendingPayloadBuilderOutput | null {
  const payloadBuilderOutput = readRecordKey(
    readRecordKey(candidatePlan, 'handoff'),
    'payload_builder_output',
  );
  const transactionPayloadRef = readString(payloadBuilderOutput?.['transaction_payload_ref']);
  const requiredControlPath = readString(payloadBuilderOutput?.['required_control_path']);
  const network = readString(payloadBuilderOutput?.['network']);

  if (!transactionPayloadRef || !requiredControlPath || !network) {
    return null;
  }

  return {
    transaction_payload_ref: transactionPayloadRef,
    required_control_path: requiredControlPath,
    network,
  };
}

function readCandidatePlanCompactPlanSummary(
  candidatePlan: unknown,
): EmberLendingCompactPlanSummary | null {
  const compactPlanSummary = readRecordKey(candidatePlan, 'compact_plan_summary');
  const controlPath = readString(compactPlanSummary?.['control_path']);
  const asset = readString(compactPlanSummary?.['asset']);
  const amount = readString(compactPlanSummary?.['amount']);
  const summary = readString(compactPlanSummary?.['summary']);

  if (!controlPath || !asset || !amount || !summary) {
    return null;
  }

  return {
    control_path: controlPath,
    asset,
    amount,
    summary,
    ...(readString(compactPlanSummary?.['protocol_summary'])
      ? {
          protocol_summary: readString(compactPlanSummary?.['protocol_summary'])!,
        }
      : {}),
  };
}

function resolveCandidatePlanAnchoringFailureMessage(input: {
  candidatePlan: unknown;
  anchoredPayloadResolver?: EmberLendingAnchoredPayloadResolver;
  walletAddress: `0x${string}` | null;
  rootUserWalletAddress: `0x${string}` | null;
  transactionPlanId: string | null;
  payloadBuilderOutput: EmberLendingPayloadBuilderOutput | null;
  compactPlanSummary: EmberLendingCompactPlanSummary | null;
}): string | null {
  if (!input.candidatePlan) {
    return null;
  }

  if (!input.transactionPlanId || !input.payloadBuilderOutput || !input.compactPlanSummary) {
    return 'Candidate lending plan could not be anchored behind the lending service boundary because Shared Ember omitted the planner payload metadata required for anchoring.';
  }

  if (!input.walletAddress || !input.rootUserWalletAddress) {
    return 'Candidate lending plan could not be anchored behind the lending service boundary because the managed wallet context is incomplete.';
  }

  if (!input.anchoredPayloadResolver) {
    return 'Candidate lending plan could not be anchored behind the lending service boundary because the anchored payload resolver is unavailable.';
  }

  return null;
}

function readExecutionTxHash(executionResult: unknown): `0x${string}` | null {
  if (!isRecord(executionResult)) {
    return null;
  }

  const topLevel = readHexAddress(executionResult['transaction_hash']);
  if (topLevel) {
    return topLevel;
  }

  if (!isRecord(executionResult['execution'])) {
    return null;
  }

  return readHexAddress(executionResult['execution']['transaction_hash']);
}

function upsertAnchoredPayloadRecord(
  records: EmberLendingAnchoredPayloadRecord[],
  nextRecord: EmberLendingAnchoredPayloadRecord | null,
): EmberLendingAnchoredPayloadRecord[] {
  if (!nextRecord) {
    return records;
  }

  const remainingRecords = records.filter(
    (record) => record.anchoredPayloadRef !== nextRecord.anchoredPayloadRef,
  );
  return [...remainingRecords, nextRecord];
}

function readExecutionPortfolioState(executionResult: unknown): unknown {
  return isRecord(executionResult) ? executionResult['portfolio_state'] : null;
}

function readExecutionRequestResult(executionResult: unknown): Record<string, unknown> | null {
  if (!isRecord(executionResult) || !isRecord(executionResult['request_result'])) {
    return null;
  }

  return executionResult['request_result'];
}

function readCommittedEvent(value: unknown): SharedEmberCommittedEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    sequence: typeof value['sequence'] === 'number' ? value['sequence'] : undefined,
    aggregate: readString(value['aggregate']) ?? undefined,
    aggregate_id: readString(value['aggregate_id']) ?? undefined,
    event_type: readString(value['event_type']) ?? undefined,
    payload: isRecord(value['payload']) ? value['payload'] : undefined,
  };
}

function readCommittedExecutionProgressEvent(input: {
  events: unknown[];
  requestId: string;
}): {
  sequence: number;
  executionResult: unknown;
} | null {
  const matchingEvent = input.events
    .map((event) => readCommittedEvent(event))
    .filter((event): event is SharedEmberCommittedEvent => event !== null)
    .filter(
      (event) =>
        event.aggregate === 'request' &&
        event.aggregate_id === input.requestId &&
        typeof event.sequence === 'number' &&
        (event.event_type === 'requestExecution.prepared.v1' ||
          event.event_type === 'requestExecution.blocked.v1' ||
          event.event_type === 'requestExecution.submitted.v1' ||
          event.event_type === 'requestExecution.completed.v1'),
    )
    .sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0))
    .at(-1);

  if (!matchingEvent || typeof matchingEvent.sequence !== 'number') {
    return null;
  }

  const requestId = readString(matchingEvent.payload?.['request_id']);
  const transactionPlanId = readString(matchingEvent.payload?.['transaction_plan_id']);
  if (!requestId || !transactionPlanId) {
    return null;
  }

  if (
    matchingEvent.event_type === 'requestExecution.submitted.v1' ||
    matchingEvent.event_type === 'requestExecution.completed.v1'
  ) {
    const status = readString(matchingEvent.payload?.['status']);
    const executionId = readString(matchingEvent.payload?.['execution_id']);
    const transactionHash = readHexAddress(matchingEvent.payload?.['transaction_hash']);

    if (!status) {
      return null;
    }

    return {
      sequence: matchingEvent.sequence,
      executionResult: {
        phase: 'completed',
        request_id: requestId,
        transaction_plan_id: transactionPlanId,
        execution: {
          status,
          ...(executionId ? { execution_id: executionId } : {}),
          ...(transactionHash ? { transaction_hash: transactionHash } : {}),
        },
      },
    };
  }

  const phase = readString(matchingEvent.payload?.['phase']);
  if (!phase) {
    return null;
  }

  return {
    sequence: matchingEvent.sequence,
    executionResult: {
      phase,
      request_id: requestId,
      transaction_plan_id: transactionPlanId,
    },
  };
}

function ensureSentence(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function readExecutionStatusMessage(executionResult: unknown): {
  executionStatus: 'completed' | 'failed';
  statusMessage: string;
} {
  const phase = isRecord(executionResult) ? readString(executionResult['phase']) : null;
  const execution = readRecordKey(executionResult, 'execution');
  const status = readString(execution?.['status']);
  const executionMessage =
    readString(execution?.['message']) ??
    (isRecord(executionResult) ? readString(executionResult['message']) : null);
  const withExecutionDetail = (prefix: string): string =>
    executionMessage
      ? `${prefix.replace(/[.!?]$/, '')}: ${ensureSentence(executionMessage)}`
      : prefix;

  if (phase === 'completed' && status === 'confirmed') {
    return {
      executionStatus: 'completed',
      statusMessage: withExecutionDetail(
        'Lending transaction execution confirmed through Shared Ember.',
      ),
    };
  }

  if (phase === 'completed' && status === 'submitted') {
    return {
      executionStatus: 'completed',
      statusMessage: withExecutionDetail('Lending transaction submitted through Shared Ember.'),
    };
  }

  if (phase === 'completed' && status === 'failed_before_submission') {
    return {
      executionStatus: 'failed',
      statusMessage: withExecutionDetail(
        'Lending transaction failed before submission through Shared Ember.',
      ),
    };
  }

  if (phase === 'completed' && status === 'failed_after_submission') {
    return {
      executionStatus: 'failed',
      statusMessage: withExecutionDetail(
        'Lending transaction failed after submission through Shared Ember.',
      ),
    };
  }

  if (phase === 'completed' && status === 'partial_settlement') {
    return {
      executionStatus: 'failed',
      statusMessage: withExecutionDetail(
        'Lending transaction reached partial settlement through Shared Ember.',
      ),
    };
  }

  if (phase === 'ready_for_redelegation') {
    return {
      executionStatus: 'completed',
      statusMessage:
        'Lending transaction execution is waiting for Shared Ember-managed redelegation.',
    };
  }

  if (phase === 'ready_for_execution_signing') {
    return {
      executionStatus: 'failed',
      statusMessage:
        'Lending transaction execution did not finish because Shared Ember still requires an additional signing step.',
    };
  }

  if (phase !== 'blocked') {
    return {
      executionStatus: 'completed',
      statusMessage: 'Lending transaction plan admitted and executed through Shared Ember.',
    };
  }

  const requestResult = readExecutionRequestResult(executionResult);
  const requestOutcome = readString(requestResult?.['result']);
  const requestMessage = readString(requestResult?.['message']);
  const prefix =
    requestOutcome === 'denied'
      ? 'Lending transaction execution request was denied by Shared Ember'
      : 'Lending transaction execution request was blocked by Shared Ember';

  return {
    executionStatus: 'failed',
    statusMessage: requestMessage ? `${prefix}: ${ensureSentence(requestMessage)}` : `${prefix}.`,
  };
}

function readEscalationSummary(escalationRequest: unknown): string | null {
  if (!isRecord(escalationRequest)) {
    return null;
  }

  const requestKind = readString(escalationRequest['request_kind']);
  const requestId = readString(escalationRequest['request_id']);
  if (!requestKind || !requestId) {
    return null;
  }

  return `${requestKind} escalation ${requestId} created from blocked lending execution.`;
}

function readExecutionOutcome(executionResult: unknown): string | null {
  const phase = readStringKey(executionResult, 'phase');
  const execution = readRecordKey(executionResult, 'execution');
  const status = readString(execution?.['status']);

  if (phase === 'completed' && status) {
    return status;
  }

  if (phase && phase !== 'blocked') {
    return phase;
  }

  const requestOutcome = readString(readExecutionRequestResult(executionResult)?.['result']);
  return requestOutcome === 'denied' ? 'denied' : 'blocked';
}

function buildExecutionArtifactData(input: {
  revision: number | null;
  executionResult: unknown;
  executionStatus: 'completed' | 'failed';
  statusMessage: string;
}) {
  return {
    type: 'shared-ember-execution-result',
    revision: input.revision,
    ...(readExecutionOutcome(input.executionResult)
      ? {
          outcome: readExecutionOutcome(input.executionResult),
        }
      : {}),
    ...(readExecutionTxHash(input.executionResult)
      ? {
          transactionHash: readExecutionTxHash(input.executionResult),
        }
      : {}),
    ...(input.executionStatus === 'failed'
      ? {
          message: input.statusMessage,
        }
      : {}),
  };
}

function readStringKey(
  input: unknown,
  key: string,
): string | null {
  return isRecord(input) ? readString(input[key]) : null;
}

function readRecordKey(input: unknown, key: string): Record<string, unknown> | null {
  return isRecord(input) && isRecord(input[key]) ? input[key] : null;
}

function readExecutionSigningPackage(
  preparationResult: unknown,
): Record<string, unknown> | null {
  return readRecordKey(preparationResult, 'execution_signing_package');
}

function readExecutionPreparation(
  executionResult: unknown,
): Record<string, unknown> | null {
  return readRecordKey(executionResult, 'execution_preparation');
}

function readExecutionPreparationMetadata(
  executionResult: unknown,
): Record<string, unknown> | null {
  return readRecordKey(readExecutionPreparation(executionResult), 'metadata');
}

function readExecutionUnsignedTransactionHex(
  preparationResult: unknown,
): `0x${string}` | null {
  const executionSigningPackage = readExecutionSigningPackage(preparationResult);

  return (
    readHexValue(executionSigningPackage?.['unsigned_transaction_hex']) ??
    readHexValue(executionSigningPackage?.['unsignedTransactionHex'])
  );
}

function readPreparedExecutionId(
  executionResult: unknown,
): string | null {
  return readString(readExecutionPreparation(executionResult)?.['execution_preparation_id']);
}

function readPreparedExecutionNetwork(
  executionResult: unknown,
): string | null {
  return readString(readExecutionPreparation(executionResult)?.['network']);
}

function readPreparedExecutionRequiredControlPath(
  executionResult: unknown,
): string | null {
  return readString(readExecutionPreparation(executionResult)?.['required_control_path']);
}

function readPreparedExecutionPlannedTransactionPayloadRef(
  executionResult: unknown,
): string | null {
  const metadata = readExecutionPreparationMetadata(executionResult);

  return (
    readString(metadata?.['planned_transaction_payload_ref']) ??
    readString(metadata?.['plannedTransactionPayloadRef'])
  );
}

function readExecutionSigningPackageCanonicalUnsignedPayloadRef(
  executionResult: unknown,
): string | null {
  return readString(readExecutionSigningPackage(executionResult)?.['canonical_unsigned_payload_ref']);
}

function readExecutionSigningPackageDelegationArtifactRef(
  executionResult: unknown,
): string | null {
  const executionSigningPackage = readExecutionSigningPackage(executionResult);
  return (
    readString(executionSigningPackage?.['delegation_artifact_ref']) ??
    readString(executionSigningPackage?.['delegationArtifactRef'])
  );
}

function readExecutionSigningPackageRootDelegationArtifactRef(
  executionResult: unknown,
): string | null {
  const executionSigningPackage = readExecutionSigningPackage(executionResult);
  return (
    readString(executionSigningPackage?.['root_delegation_artifact_ref']) ??
    readString(executionSigningPackage?.['rootDelegationArtifactRef'])
  );
}

function readPreparedExecutionWalletAddress(
  executionResult: unknown,
): `0x${string}` | null {
  const executionPreparation = readExecutionPreparation(executionResult);
  return readHexAddress(executionPreparation?.['agent_wallet']);
}

function hasExecutionSigningPreparation(
  executionResult: unknown,
): executionResult is Record<string, unknown> {
  return (
    isRecord(executionResult) &&
    readString(executionResult['phase']) === 'ready_for_execution_signing' &&
    readString(executionResult['request_id']) !== null &&
    readString(executionResult['transaction_plan_id']) !== null &&
    readExecutionPreparation(executionResult) !== null &&
    readExecutionSigningPackage(executionResult) !== null
  );
}

async function submitSignedTransaction(input: {
  protocolHost: EmberLendingSharedEmberProtocolHost;
  threadId: string;
  agentId: string;
  currentRevision: number | null;
  transactionPlanId: string;
  requestId: string;
  idempotencyKey: string;
  signedTransaction: Record<string, unknown>;
}): Promise<{
  revision: number | null;
  committedEventIds: string[];
  executionResult: unknown;
}> {
  const executionPreparationId =
    readString(input.signedTransaction['execution_preparation_id']) ??
    readString(input.signedTransaction['executionPreparationId']) ??
    input.transactionPlanId;
  const signedTransactionFingerprint = buildStableCommandSuffix(input.signedTransaction);
  const response = await runSharedEmberCommandWithResolvedRevision<{
    result?: {
      revision?: number;
      committed_event_ids?: string[];
      execution_result?: unknown;
    };
  }>({
    protocolHost: input.protocolHost,
    threadId: input.threadId,
    agentId: input.agentId,
    currentRevision: input.currentRevision,
    buildRequest: (expectedRevision) => ({
      jsonrpc: '2.0',
      id: `shared-ember-${input.threadId}-submit-signed-transaction`,
      method: 'subagent.submitSignedTransaction.v1',
      params: {
        idempotency_key: `${input.idempotencyKey}:submit-transaction:${input.requestId}:${executionPreparationId}:${signedTransactionFingerprint}`,
        expected_revision: expectedRevision,
        transaction_plan_id: input.transactionPlanId,
        signed_transaction: input.signedTransaction,
      },
    }),
  });

  return {
    revision: response.result?.revision ?? null,
    committedEventIds: response.result?.committed_event_ids ?? [],
    executionResult: response.result?.execution_result ?? null,
  };
}

async function readRecoveredExecutionResultFromOutbox(input: {
  protocolHost: EmberLendingSharedEmberProtocolHost;
  agentId: string;
  requestId: string;
}): Promise<{
  revision: number | null;
  executionResult: unknown;
} | null> {
  const outboxPage = (await input.protocolHost.readCommittedEventOutbox({
    protocol_version: 'v1',
    consumer_id: `${input.agentId}-${input.requestId}`,
    after_sequence: 0,
    limit: 100,
  })) as {
    revision?: number;
    events?: unknown[];
  };

  const matchingEvent = readCommittedExecutionProgressEvent({
    events: outboxPage.events ?? [],
    requestId: input.requestId,
  });

  if (
    matchingEvent === null ||
    !isRecord(matchingEvent.executionResult) ||
    readString(matchingEvent.executionResult['phase']) !== 'completed'
  ) {
    return null;
  }

  return {
    revision: outboxPage.revision ?? null,
    executionResult: matchingEvent.executionResult,
  };
}

async function readCommittedExecutionProgressFromOutbox(input: {
  protocolHost: EmberLendingSharedEmberProtocolHost;
  agentId: string;
  requestId: string;
}): Promise<{
  revision: number | null;
  latestSequence: number;
  executionResult: unknown;
} | null> {
  const outboxPage = (await input.protocolHost.readCommittedEventOutbox({
    protocol_version: 'v1',
    consumer_id: `${input.agentId}-${input.requestId}`,
    after_sequence: 0,
    limit: 100,
  })) as {
    revision?: number;
    events?: unknown[];
  };

  const latestEvent = readCommittedExecutionProgressEvent({
    events: outboxPage.events ?? [],
    requestId: input.requestId,
  });
  if (!latestEvent) {
    return null;
  }

  return {
    revision: outboxPage.revision ?? null,
    latestSequence: latestEvent.sequence,
    executionResult: latestEvent.executionResult,
  };
}

async function waitForCommittedExecutionProgress(input: {
  protocolHost: EmberLendingSharedEmberProtocolHost;
  threadId: string;
  requestId: string;
  afterSequence: number;
}): Promise<{
  revision: number | null;
  latestSequence: number;
  executionResult: unknown;
} | null> {
  const response = (await input.protocolHost.handleJsonRpc({
    jsonrpc: '2.0',
    id: `shared-ember-${input.threadId}-wait-committed-event-outbox`,
    method: 'waitCommittedEventOutbox.v1',
    params: {
      consumer_id: `${EMBER_LENDING_SHARED_EMBER_AGENT_ID}-${input.requestId}`,
      after_sequence: input.afterSequence,
      limit: 100,
      timeout_ms: REDELEGATION_WAIT_TIMEOUT_MS,
    },
  })) as {
    result?: {
      revision?: number;
      events?: unknown[];
    };
  };

  const latestEvent = readCommittedExecutionProgressEvent({
    events: response.result?.events ?? [],
    requestId: input.requestId,
  });
  if (!latestEvent) {
    return null;
  }

  return {
    revision: response.result?.revision ?? null,
    latestSequence: latestEvent.sequence,
    executionResult: latestEvent.executionResult,
  };
}

function buildManagedSubagentHandoffBase(input: {
  state: EmberLendingLifecycleState;
  agentId: string;
}): Record<string, unknown> | null {
  if (!input.state.walletAddress || !input.state.rootUserWalletAddress || !input.state.mandateRef) {
    return null;
  }

  if (input.state.walletAddress === input.state.rootUserWalletAddress) {
    return null;
  }

  return {
    agent_id: input.agentId,
    root_user_wallet: input.state.rootUserWalletAddress,
    mandate_ref: input.state.mandateRef,
  };
}

const REQUEST_INTENTS = new Set([
  'deploy',
  'rebalance',
  'increase',
  'decrease',
  'unwind',
  'transfer',
]);

function normalizeRequestIntent(intent: string | null): string | null {
  if (intent === 'unwind') {
    return 'decrease';
  }

  return intent;
}

function readIntent(value: unknown): string | null {
  const normalized = readString(value)?.toLowerCase();
  return normalized && REQUEST_INTENTS.has(normalized)
    ? normalizeRequestIntent(normalized)
    : null;
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((entry) => readString(entry))
    .filter((entry): entry is string => entry !== null);

  return normalized.length > 0 ? normalized : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function readPortfolioReservation(portfolioState: unknown): Record<string, unknown> | null {
  return isRecord(portfolioState) ? readFirstRecordFromArray(portfolioState['reservations']) : null;
}

function readPortfolioReservations(portfolioState: unknown): Record<string, unknown>[] {
  if (!isRecord(portfolioState) || !Array.isArray(portfolioState['reservations'])) {
    return [];
  }

  return portfolioState['reservations'].filter(
    (candidate): candidate is Record<string, unknown> =>
      isRecord(candidate) &&
      (() => {
        const status = readString(candidate['status']);
        return status === null || status === 'active';
      })(),
  );
}

function mergeContextRecords(input: {
  primary: unknown;
  fallback: Record<string, unknown>[];
  idKey: string;
}): Record<string, unknown>[] {
  const merged: Record<string, unknown>[] = [];
  const seenIds = new Set<string>();

  const pushRecord = (candidate: unknown) => {
    if (!isRecord(candidate)) {
      return;
    }

    const recordId = readString(candidate[input.idKey]);
    if (recordId) {
      if (seenIds.has(recordId)) {
        return;
      }
      seenIds.add(recordId);
    }

    merged.push(candidate);
  };

  if (Array.isArray(input.primary)) {
    for (const candidate of input.primary) {
      pushRecord(candidate);
    }
  }

  for (const candidate of input.fallback) {
    pushRecord(candidate);
  }

  return merged;
}

function inferPreferredControlPathFromActionSummary(value: unknown): string | null {
  const normalized = readString(value)?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.includes('repay')) {
    return 'lending.repay';
  }

  if (normalized.includes('withdraw') || normalized.includes('unwind')) {
    return 'lending.withdraw';
  }

  if (normalized.includes('borrow') || normalized.includes('increase')) {
    return 'lending.borrow';
  }

  if (
    normalized.includes('supply') ||
    normalized.includes('deposit') ||
    normalized.includes('deploy')
  ) {
    return 'lending.supply';
  }

  return null;
}

function readPreferredControlPath(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  return (
    readString(value['required_control_path']) ??
    readString(value['control_path']) ??
    inferPreferredControlPathFromActionSummary(value['action_summary'])
  );
}

function readPortfolioReservationForSource(
  portfolioState: unknown,
  source: unknown,
): Record<string, unknown> | null {
  const reservations = readPortfolioReservations(portfolioState);
  const preferredControlPath = readPreferredControlPath(source);
  if (preferredControlPath) {
    const matchingReservation = reservations.find(
      (reservation) => readString(reservation['control_path']) === preferredControlPath,
    );
    if (matchingReservation) {
      return matchingReservation;
    }
  }

  const sourceUnitIds = readManagedPlanningSourceUnitIds(source);
  if (sourceUnitIds.length > 0) {
    const exactMatchingReservation = reservations.find((reservation) => {
      const reservationUnitIds = new Set(readReservationUnitIds(reservation));
      return sourceUnitIds.every((unitId) => reservationUnitIds.has(unitId));
    });
    if (exactMatchingReservation) {
      return exactMatchingReservation;
    }

    const overlappingReservation = reservations.find((reservation) =>
      readReservationUnitIds(reservation).some((unitId) => sourceUnitIds.includes(unitId)),
    );
    if (overlappingReservation) {
      return overlappingReservation;
    }
  }

  return reservations.length === 1 ? reservations[0] ?? null : null;
}

function readReservationUnitIds(reservation: Record<string, unknown>): string[] {
  if (!Array.isArray(reservation['unit_allocations'])) {
    return [];
  }

  return reservation['unit_allocations']
    .map((candidate) => (isRecord(candidate) ? readString(candidate['unit_id']) : null))
    .filter((unitId): unitId is string => unitId !== null);
}

function readManagedPlanningSourceUnitIds(source: unknown): string[] {
  if (!isRecord(source)) {
    return [];
  }

  const unitIds = new Set<string>(readStringArray(source['candidate_unit_ids']) ?? []);
  const requestedQuantities = readRequestedQuantitiesInput(source['requested_quantities']);
  if (requestedQuantities.status === 'valid') {
    for (const requestedQuantity of requestedQuantities.requestedQuantities) {
      unitIds.add(requestedQuantity.unit_id);
    }
  }

  return [...unitIds];
}

function resolveManagedPlanningControlPath(
  source: Record<string, unknown>,
  portfolioState: unknown,
): string | null {
  return (
    readPreferredControlPath(source) ??
    readString(readPortfolioReservationForSource(portfolioState, source)?.['control_path'])
  );
}

function inferIntentFromActionSummary(value: unknown): string | null {
  const normalized = readString(value)?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (
    normalized.includes('withdraw') ||
    normalized.includes('repay') ||
    normalized.includes('decrease') ||
    normalized.includes('reduce') ||
    normalized.includes('unwind')
  ) {
    return 'decrease';
  }

  if (normalized.includes('borrow') || normalized.includes('increase')) {
    return 'increase';
  }

  if (normalized.includes('rebalance')) {
    return 'rebalance';
  }

  if (normalized.includes('transfer')) {
    return 'transfer';
  }

  if (
    normalized.includes('supply') ||
    normalized.includes('deposit') ||
    normalized.includes('deploy')
  ) {
    return 'deploy';
  }

  return null;
}

function inferIntentFromControlPath(controlPath: string | null): string | null {
  switch (controlPath) {
    case 'lending.withdraw':
    case 'vault.withdraw':
    case 'lending.repay':
      return 'decrease';
    case 'lending.borrow':
      return 'increase';
    case 'lending.supply':
    case 'vault.deposit':
      return 'deploy';
    default:
      return null;
  }
}

function resolveManagedPlanningIntent(source: Record<string, unknown>, portfolioState: unknown): string {
  const preferredControlPath = resolveManagedPlanningControlPath(source, portfolioState);
  if (preferredControlPath) {
    const controlPathIntent = inferIntentFromControlPath(preferredControlPath);
    if (controlPathIntent) {
      return controlPathIntent;
    }
  }

  const explicitIntent = readIntent(source['intent']);
  if (explicitIntent) {
    return explicitIntent;
  }

  const summarizedIntent = inferIntentFromActionSummary(source['action_summary']);
  if (summarizedIntent) {
    return summarizedIntent;
  }

  for (const reservation of readPortfolioReservations(portfolioState)) {
    const reservationIntent =
      readIntent(reservation['purpose']) ??
      inferIntentFromControlPath(readString(reservation['control_path']));
    if (reservationIntent) {
      return reservationIntent;
    }
  }

  return 'deploy';
}

function readManagedRequestedQuantities(
  portfolioState: unknown,
  source?: unknown,
): Array<{ unit_id: string; quantity: string }> | null {
  if (!isRecord(portfolioState)) {
    return null;
  }

  const reservation =
    typeof source === 'undefined'
      ? readPortfolioReservation(portfolioState)
      : readPortfolioReservationForSource(portfolioState, source);
  if (reservation && Array.isArray(reservation['unit_allocations'])) {
    const allocations = reservation['unit_allocations']
      .map((candidate) => {
        if (!isRecord(candidate)) {
          return null;
        }

        const unitId = readString(candidate['unit_id']);
        const quantity = readString(candidate['quantity']);
        return unitId && quantity ? { unit_id: unitId, quantity } : null;
      })
      .filter((candidate): candidate is { unit_id: string; quantity: string } => candidate !== null);
    if (allocations.length > 0) {
      return allocations;
    }
  }

  if (!Array.isArray(portfolioState['owned_units'])) {
    return null;
  }

  const reservationId = readString(reservation?.['reservation_id']);
  const requestedQuantities = portfolioState['owned_units']
    .map((candidate) => {
      if (!isRecord(candidate)) {
        return null;
      }

      if (reservationId && readString(candidate['reservation_id']) !== reservationId) {
        return null;
      }

      const unitId = readString(candidate['unit_id']);
      const quantity = readString(candidate['quantity']);
      return unitId && quantity ? { unit_id: unitId, quantity } : null;
    })
    .filter((candidate): candidate is { unit_id: string; quantity: string } => candidate !== null);

  if (requestedQuantities.length > 0) {
    return requestedQuantities;
  }

  const fallbackOwnedUnit = readPortfolioOwnedUnit(portfolioState);
  const unitId = readString(fallbackOwnedUnit?.['unit_id']);
  const quantity = readString(fallbackOwnedUnit?.['quantity']);
  return unitId && quantity ? [{ unit_id: unitId, quantity }] : null;
}

function readManagedCandidateUnitIds(portfolioState: unknown, source?: unknown): string[] | null {
  const requestedQuantities = readManagedRequestedQuantities(portfolioState, source);
  return requestedQuantities?.map((candidate) => candidate.unit_id) ?? null;
}

function buildManagedPlanningUnitAliasIndex(input: {
  portfolioState: unknown;
  managedCandidateUnitIds: string[];
}): Map<string, string[]> {
  const aliasIndex = new Map<string, string[]>();
  const managedUnitIds = new Set(input.managedCandidateUnitIds);

  const registerAlias = (alias: string, managedUnitId: string) => {
    const existing = aliasIndex.get(alias);
    if (!existing) {
      aliasIndex.set(alias, [managedUnitId]);
      return;
    }

    if (!existing.includes(managedUnitId)) {
      existing.push(managedUnitId);
    }
  };

  for (const managedUnitId of input.managedCandidateUnitIds) {
    registerAlias(managedUnitId, managedUnitId);
  }

  if (!isRecord(input.portfolioState) || !Array.isArray(input.portfolioState['owned_units'])) {
    return aliasIndex;
  }

  for (const candidate of input.portfolioState['owned_units']) {
    if (!isRecord(candidate)) {
      continue;
    }

    const unitId = readString(candidate['unit_id']);
    if (!unitId || !managedUnitIds.has(unitId)) {
      continue;
    }

    registerAlias(unitId, unitId);

    const rootAsset = readString(candidate['root_asset']);
    if (rootAsset) {
      registerAlias(rootAsset, unitId);
      registerAlias(rootAsset.toLowerCase(), unitId);
    }

    const metadata = isRecord(candidate['metadata']) ? candidate['metadata'] : null;
    const underlyingAsset = readString(metadata?.['underlying_asset']);
    if (underlyingAsset) {
      registerAlias(underlyingAsset, unitId);
      registerAlias(underlyingAsset.toLowerCase(), unitId);
    }

    const underlyingAssetSymbol = readString(metadata?.['underlying_asset_symbol']);
    if (underlyingAssetSymbol) {
      registerAlias(underlyingAssetSymbol, unitId);
      registerAlias(underlyingAssetSymbol.toLowerCase(), unitId);
    }

    const sourceUnitId = readString(metadata?.['source_unit_id']);
    if (sourceUnitId) {
      registerAlias(sourceUnitId, unitId);
    }

    for (const parentUnitId of readStringArray(candidate['parent_unit_ids']) ?? []) {
      registerAlias(parentUnitId, unitId);
    }
  }

  return aliasIndex;
}

function readManagedPlanningAliasUnitIds(
  unitId: string,
  aliasIndex: Map<string, string[]>,
): string[] {
  return [...(aliasIndex.get(unitId) ?? [])];
}

function parseBaseUnitQuantity(quantity: string): bigint | null {
  if (!/^\d+$/.test(quantity)) {
    return null;
  }

  try {
    return BigInt(quantity);
  } catch {
    return null;
  }
}

function expandManagedRequestedQuantityAcrossAliases(input: {
  requestedQuantity: RequestedQuantity;
  aliasIndex: Map<string, string[]>;
  managedRequestedQuantities: RequestedQuantity[];
}): RequestedQuantity[] | null {
  const matchingUnitIds = readManagedPlanningAliasUnitIds(
    input.requestedQuantity.unit_id,
    input.aliasIndex,
  );
  if (matchingUnitIds.length === 0) {
    return null;
  }

  if (matchingUnitIds.length === 1) {
    return [
      {
        unit_id: matchingUnitIds[0]!,
        quantity: input.requestedQuantity.quantity,
      },
    ];
  }

  const remainingQuantity = parseBaseUnitQuantity(input.requestedQuantity.quantity);
  if (remainingQuantity === null) {
    return null;
  }

  let remaining = remainingQuantity;
  const matchingUnitIdsSet = new Set(matchingUnitIds);
  const distributedRequestedQuantities: RequestedQuantity[] = [];

  for (const managedRequestedQuantity of input.managedRequestedQuantities) {
    if (!matchingUnitIdsSet.has(managedRequestedQuantity.unit_id)) {
      continue;
    }

    const availableQuantity = parseBaseUnitQuantity(managedRequestedQuantity.quantity);
    if (availableQuantity === null) {
      return null;
    }

    if (availableQuantity <= 0n) {
      continue;
    }

    const allocatedQuantity = remaining < availableQuantity ? remaining : availableQuantity;
    if (allocatedQuantity > 0n) {
      distributedRequestedQuantities.push({
        unit_id: managedRequestedQuantity.unit_id,
        quantity: allocatedQuantity.toString(),
      });
      remaining -= allocatedQuantity;
    }

    if (remaining === 0n) {
      return distributedRequestedQuantities;
    }
  }

  return null;
}

function hasPortfolioManagerPlanningIdentity(state: EmberLendingLifecycleState): boolean {
  return Boolean(
    state.mandateRef &&
      state.walletAddress &&
      state.rootUserWalletAddress &&
      state.walletAddress !== state.rootUserWalletAddress,
  );
}

function readManagedMandateCollateralAsset(state: EmberLendingLifecycleState): string | null {
  const managedMandate = isRecord(state.mandateContext)
    ? readManagedMandate(state.mandateContext)
    : null;
  return managedMandate?.asset_intent.root_asset ?? managedMandate?.allowed_assets[0] ?? null;
}

async function readManagedOnboardingState(input: {
  protocolHost: EmberLendingSharedEmberProtocolHost;
  threadId: string;
  agentId: string;
  state: EmberLendingLifecycleState;
}): Promise<Record<string, unknown> | null> {
  const walletAddress = input.state.rootUserWalletAddress;
  const network = readStateNetwork(input.state);
  if (!walletAddress || !network) {
    return null;
  }

  const response = await input.protocolHost.handleJsonRpc({
    jsonrpc: '2.0',
    id: `shared-ember-${input.threadId}-read-onboarding-state`,
    method: 'orchestrator.readOnboardingState.v1',
    params: {
      agent_id: input.agentId,
      wallet_address: walletAddress,
      network,
    },
  });

  return readRecordKey(readRecordKey(response, 'result'), 'onboarding_state');
}

function buildManagedPlanningBlockedMessageFromOnboardingState(input: {
  state: EmberLendingLifecycleState;
  onboardingState: Record<string, unknown>;
  fallbackStatusMessage: string;
}): string {
  const proofs = readRecordKey(input.onboardingState, 'proofs');
  if (!proofs) {
    return input.fallbackStatusMessage;
  }

  const targetAsset = readManagedMandateCollateralAsset(input.state);
  const accountedAssets = [
    ...new Set(
      (Array.isArray(input.onboardingState['owned_units']) ? input.onboardingState['owned_units'] : [])
        .map((candidate) => (isRecord(candidate) ? readString(candidate['root_asset']) : null))
        .filter((asset): asset is string => asset !== null),
    ),
  ];
  const capitalReservedForAgent = readBoolean(proofs['capital_reserved_for_agent']);
  const policySnapshotRecorded = readBoolean(proofs['policy_snapshot_recorded']);
  const initialSubagentDelegationIssued = readBoolean(
    proofs['initial_subagent_delegation_issued'],
  );
  const phase = readString(input.onboardingState['phase']) ?? 'unknown';

  if (capitalReservedForAgent === false) {
    if (targetAsset && !accountedAssets.includes(targetAsset)) {
      const assetSummary =
        accountedAssets.length > 0
          ? ` Wallet accounting currently shows ${accountedAssets.join(', ')}.`
          : ' Wallet accounting does not yet show any admitted idle assets.';

      return `Portfolio Manager onboarding is not complete for this thread because Shared Ember could not admit any ${targetAsset} for lending.${assetSummary}`;
    }

    return 'Portfolio Manager onboarding is not complete for this thread because Shared Ember has not reserved capital for the lending lane yet.';
  }

  if (policySnapshotRecorded === false) {
    return 'Portfolio Manager onboarding is not complete for this thread because Shared Ember has not recorded a lending policy snapshot yet.';
  }

  if (initialSubagentDelegationIssued === false) {
    return 'Portfolio Manager onboarding is not complete for this thread because Shared Ember has not issued the initial lending delegation yet.';
  }

  const missingProofs = [
    capitalReservedForAgent === true ? null : 'capital_reserved_for_agent',
    policySnapshotRecorded === true ? null : 'policy_snapshot_recorded',
    initialSubagentDelegationIssued === true ? null : 'initial_subagent_delegation_issued',
  ].filter((proof): proof is string => proof !== null);

  return `Portfolio Manager onboarding is not complete for this thread. Shared Ember onboarding phase is ${phase}.${missingProofs.length > 0 ? ` Missing proofs: ${missingProofs.join(', ')}.` : ''}`;
}

async function resolveManagedPlanningBlockedMessage(input: {
  protocolHost: EmberLendingSharedEmberProtocolHost;
  threadId: string;
  agentId: string;
  state: EmberLendingLifecycleState;
  fallbackStatusMessage: string;
}): Promise<string> {
  if (
    input.fallbackStatusMessage !== PLANNING_PM_ONBOARDING_BLOCKED_MESSAGE &&
    input.fallbackStatusMessage !== PLANNING_PM_ADMISSION_BLOCKED_MESSAGE
  ) {
    return input.fallbackStatusMessage;
  }

  if (
    !input.state.walletAddress ||
    !input.state.rootUserWalletAddress ||
    input.state.walletAddress === input.state.rootUserWalletAddress
  ) {
    return input.fallbackStatusMessage;
  }

  const onboardingState = await readManagedOnboardingState(input).catch(() => null);

  if (onboardingState === null) {
    return input.fallbackStatusMessage;
  }

  return buildManagedPlanningBlockedMessageFromOnboardingState({
    state: input.state,
    onboardingState,
    fallbackStatusMessage: input.fallbackStatusMessage,
  });
}

function resolveManagedPlanningReadiness(input: {
  state: EmberLendingLifecycleState;
  operationInput: unknown;
}): ManagedPlanningReadiness {
  if (!hasPortfolioManagerPlanningIdentity(input.state)) {
    return {
      status: 'blocked',
      statusMessage: PLANNING_PM_ONBOARDING_BLOCKED_MESSAGE,
    };
  }

  const managedRequestedQuantities = readManagedRequestedQuantities(
    input.state.lastPortfolioState,
    input.operationInput,
  );
  const managedCandidateUnitIds = readManagedCandidateUnitIds(
    input.state.lastPortfolioState,
    input.operationInput,
  );
  if (!managedRequestedQuantities || !managedCandidateUnitIds) {
    return {
      status: 'blocked',
      statusMessage: PLANNING_PM_ADMISSION_BLOCKED_MESSAGE,
    };
  }

  const managedUnitAliases = buildManagedPlanningUnitAliasIndex({
    portfolioState: input.state.lastPortfolioState,
    managedCandidateUnitIds,
  });
  const commandInput = isRecord(input.operationInput) ? input.operationInput : {};
  const candidateUnitIdsInput =
    readStringArray(commandInput['candidate_unit_ids']) ?? managedCandidateUnitIds;
  const requestedQuantitiesInput = Object.prototype.hasOwnProperty.call(
    commandInput,
    'requested_quantities',
  )
    ? readRequestedQuantitiesInput(commandInput['requested_quantities'])
    : { status: 'absent' as const };
  if (requestedQuantitiesInput.status === 'invalid') {
    return {
      status: 'blocked',
      statusMessage: PLANNING_PM_REQUESTED_QUANTITIES_BLOCKED_MESSAGE,
    };
  }
  const candidateUnitIds = [...new Set(candidateUnitIdsInput.flatMap((unitId) => {
    const normalizedUnitIds = readManagedPlanningAliasUnitIds(unitId, managedUnitAliases);
    return normalizedUnitIds.length > 0 ? normalizedUnitIds : [null];
  }))];
  if (candidateUnitIds.some((unitId) => unitId === null)) {
    return {
      status: 'blocked',
      statusMessage: PLANNING_PM_UNIT_SCOPE_BLOCKED_MESSAGE,
    };
  }

  const requestedQuantitiesByUnitId = new Map<string, string>();
  for (const requestedQuantity of
    requestedQuantitiesInput.status === 'valid'
      ? requestedQuantitiesInput.requestedQuantities
      : managedRequestedQuantities) {
    const normalizedRequestedQuantities =
      requestedQuantitiesInput.status === 'valid'
        ? expandManagedRequestedQuantityAcrossAliases({
            requestedQuantity,
            aliasIndex: managedUnitAliases,
            managedRequestedQuantities,
          })
        : [
            {
              unit_id: requestedQuantity.unit_id,
              quantity: requestedQuantity.quantity,
            },
          ];
    if (!normalizedRequestedQuantities) {
      return {
        status: 'blocked',
        statusMessage: PLANNING_PM_UNIT_SCOPE_BLOCKED_MESSAGE,
      };
    }

    for (const normalizedRequestedQuantity of normalizedRequestedQuantities) {
      requestedQuantitiesByUnitId.set(
        normalizedRequestedQuantity.unit_id,
        normalizedRequestedQuantity.quantity,
      );
    }
  }

  return {
    status: 'ready',
    candidateUnitIds: candidateUnitIds.filter((unitId): unitId is string => unitId !== null),
    requestedQuantities: [...requestedQuantitiesByUnitId].map(([unit_id, quantity]) => ({
      unit_id,
      quantity,
    })),
  };
}

function readRequestedQuantitiesInput(
  value: unknown,
): ParsedRequestedQuantitiesInput {
  if (value === null || typeof value === 'undefined') {
    return { status: 'absent' };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { status: 'invalid' };
    }

    const requestedQuantities: RequestedQuantity[] = [];
    for (const candidate of value) {
      if (!isRecord(candidate)) {
        return { status: 'invalid' };
      }

      const requestedQuantity = readRequestedQuantityEntry(candidate['unit_id'], candidate['quantity']);
      if (!requestedQuantity) {
        return { status: 'invalid' };
      }
      requestedQuantities.push(requestedQuantity);
    }

    return {
      status: 'valid',
      requestedQuantities,
    };
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return { status: 'invalid' };
    }

    const requestedQuantities: RequestedQuantity[] = [];
    for (const [unitId, quantity] of entries) {
      const requestedQuantity = readRequestedQuantityEntry(unitId, quantity);
      if (!requestedQuantity) {
        return { status: 'invalid' };
      }
      requestedQuantities.push(requestedQuantity);
    }

    return {
      status: 'valid',
      requestedQuantities,
    };
  }

  return { status: 'invalid' };
}

function readRequestedQuantityEntry(unitId: unknown, quantity: unknown): RequestedQuantity | null {
  const parsedUnitId = readString(unitId);
  const parsedQuantity = readString(quantity);
  return parsedUnitId && parsedQuantity
    ? { unit_id: parsedUnitId, quantity: parsedQuantity }
    : null;
}

function readManagedActionVerb(controlPath: string | null, intent: string): string {
  const pathAction = controlPath?.split('.').at(-1)?.trim().toLowerCase();
  if (pathAction) {
    return pathAction;
  }

  return intent === 'deploy' ? 'deploy' : intent;
}

function formatDisplayLabel(value: string): string {
  return value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function buildFallbackActionSummary(input: {
  source: Record<string, unknown>;
  state: EmberLendingLifecycleState;
  intent: string;
}): string {
  const portfolioState = isRecord(input.state.lastPortfolioState) ? input.state.lastPortfolioState : null;
  const reservation = readPortfolioReservationForSource(portfolioState, input.source);
  const ownedUnit = portfolioState ? readPortfolioOwnedUnit(portfolioState) : null;
  const requestedQuantities = readManagedRequestedQuantities(portfolioState, input.source);
  const quantity = readString(input.source['amount']) ?? requestedQuantities?.[0]?.quantity ?? null;
  const asset = readString(input.source['asset']) ?? readString(ownedUnit?.['root_asset']) ?? 'capital';
  const protocol =
    readString(input.source['protocol']) ??
    (isRecord(input.state.mandateContext) ? readString(input.state.mandateContext['protocol']) : null);
  const controlPath = readString(reservation?.['control_path']);
  const verb = readManagedActionVerb(controlPath, input.intent);

  if (quantity && protocol) {
    return `${verb} reserved ${quantity} ${asset} on ${formatDisplayLabel(protocol)}`;
  }

  if (protocol) {
    return `${verb} reserved ${asset} on ${formatDisplayLabel(protocol)}`;
  }

  if (quantity) {
    return `${verb} reserved ${quantity} ${asset}`;
  }

  return input.state.lastReservationSummary ?? 'execute the approved lending action';
}

function buildFallbackObjectiveSummary(intent: string): string {
  switch (intent) {
    case 'rebalance':
      return 'rebalance reserved capital within the approved lending lane';
    case 'increase':
      return 'increase the current lending position within the approved lane';
    case 'decrease':
      return 'decrease the current lending position within the approved lane';
    case 'transfer':
      return 'transfer reserved capital within the approved managed flow';
    default:
      return 'deploy reserved capital into the approved lending lane';
  }
}

function buildManagedSubagentDecisionContext(input: {
  source: Record<string, unknown>;
  state: EmberLendingLifecycleState;
  mandateSummary: string | null;
  intent: string;
}): Record<string, unknown> {
  const sourceDecisionContext =
    'decision_context' in input.source && isRecord(input.source['decision_context'])
      ? input.source['decision_context']
      : null;

  return {
    mandate_summary:
      input.mandateSummary ??
      'operate within the current managed lending mandate and bounded guardrails',
    objective_summary:
      readString(sourceDecisionContext?.['objective_summary']) ??
      buildFallbackObjectiveSummary(input.intent),
    accounting_state_summary:
      readString(sourceDecisionContext?.['accounting_state_summary']) ??
      input.state.lastReservationSummary ??
      'Reserved capital is hydrated for the managed lending lane.',
    why_this_path_is_best:
      readString(sourceDecisionContext?.['why_this_path_is_best']) ??
      'This matches the current lending mandate and reserved control path.',
    consequence_if_delayed:
      readString(sourceDecisionContext?.['consequence_if_delayed']) ?? 'Reserved capital remains idle.',
    alternatives_considered:
      readStringArray(sourceDecisionContext?.['alternatives_considered']) ?? [
        'wait and keep the capital idle',
      ],
  };
}

function stableSerializeCommandInput(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerializeCommandInput(entry)).join(',')}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => `${JSON.stringify(key)}:${stableSerializeCommandInput(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function buildStableCommandSuffix(value: unknown): string {
  return crypto
    .createHash('sha256')
    .update(stableSerializeCommandInput(value))
    .digest('hex')
    .slice(0, 12);
}

function resolveOperationIdempotencyKey(input: {
  provided: string | null;
  fallback: string;
  expectedPrefix: string;
  stableBinding?: string | null;
}): string {
  if (!input.provided) {
    return input.fallback;
  }

  const normalized = input.provided.trim();
  if (normalized.length === 0) {
    return input.fallback;
  }

  if (!normalized.startsWith(input.expectedPrefix)) {
    return `${input.fallback}:caller:${normalized}`;
  }

  const stableBinding = input.stableBinding?.trim();
  if (!stableBinding) {
    return normalized;
  }

  const bindingSuffix = `:binding:${stableBinding}`;
  return normalized.endsWith(bindingSuffix) ? normalized : `${normalized}${bindingSuffix}`;
}

function buildTransactionPlanningHandoff(input: {
  state: EmberLendingLifecycleState;
  threadId: string;
  agentId: string;
  operationInput: unknown;
}): Record<string, unknown> | null {
  const base = buildManagedSubagentHandoffBase(input);
  if (!base) {
    return null;
  }

  const commandInput = isRecord(input.operationInput) ? input.operationInput : {};
  const planningReadiness = resolveManagedPlanningReadiness({
    state: input.state,
    operationInput: input.operationInput,
  });
  if (planningReadiness.status === 'blocked') {
    return null;
  }
  const intent = resolveManagedPlanningIntent(commandInput, input.state.lastPortfolioState);
  const actionSummary =
    readString(commandInput['action_summary']) ??
    buildFallbackActionSummary({
      source: commandInput,
      state: input.state,
      intent,
    });
  const controlPath = resolveManagedPlanningControlPath(
    commandInput,
    input.state.lastPortfolioState,
  );

  const handoffPayload: Record<string, unknown> = {
    ...base,
    intent,
    action_summary: actionSummary,
    candidate_unit_ids: planningReadiness.candidateUnitIds,
    requested_quantities: planningReadiness.requestedQuantities,
    ...(controlPath === null ? {} : { control_path: controlPath }),
    decision_context: buildManagedSubagentDecisionContext({
      source: commandInput,
      state: input.state,
      mandateSummary: input.state.mandateSummary,
      intent,
    }),
  };
  const handoff: Record<string, unknown> = {
    handoff_id:
      readString(commandInput['handoff_id']) ??
      `handoff-${input.threadId}-${buildStableCommandSuffix(handoffPayload)}`,
    ...handoffPayload,
  };

  return handoff;
}

function buildEscalationHandoff(input: {
  state: EmberLendingLifecycleState;
  threadId: string;
  agentId: string;
  operationInput: unknown;
}): Record<string, unknown> | null {
  const base = buildManagedSubagentHandoffBase(input);
  if (!base) {
    return null;
  }

  const commandInput = isRecord(input.operationInput) ? input.operationInput : {};
  const source =
    'handoff' in commandInput && isRecord(commandInput['handoff']) ? commandInput['handoff'] : commandInput;
  const intent = resolveManagedPlanningIntent(source, input.state.lastPortfolioState);
  const actionSummary =
    readString(source['action_summary']) ??
    buildFallbackActionSummary({
      source,
      state: input.state,
      intent,
    });

  const handoff: Record<string, unknown> = {
    handoff_id: readString(source['handoff_id']) ?? `handoff-${input.threadId}`,
    ...base,
    intent,
    action_summary: actionSummary,
  };
  for (const key of [
    'candidate_unit_ids',
    'requested_quantities',
    'payload_builder_output',
  ] as const) {
    if (key in source) {
      handoff[key] = source[key];
    }
  }

  handoff['decision_context'] = buildManagedSubagentDecisionContext({
    source,
    state: input.state,
    mandateSummary: input.state.mandateSummary,
    intent,
  });

  return handoff;
}

function mergePortfolioProjectionPreservingKnownContext(
  state: EmberLendingLifecycleState,
  portfolioState: unknown,
): Pick<
  EmberLendingLifecycleState,
  | 'mandateRef'
  | 'mandateSummary'
  | 'mandateContext'
  | 'walletAddress'
  | 'rootUserWalletAddress'
  | 'rootedWalletContextId'
  | 'lastReservationSummary'
> {
  const projection = mergePortfolioProjection(state, portfolioState);

  return {
    mandateRef: projection.mandateRef ?? state.mandateRef,
    mandateSummary: projection.mandateSummary ?? state.mandateSummary,
    mandateContext: projection.mandateContext ?? state.mandateContext,
    walletAddress: projection.walletAddress ?? state.walletAddress,
    rootUserWalletAddress: projection.rootUserWalletAddress ?? state.rootUserWalletAddress,
    rootedWalletContextId: projection.rootedWalletContextId ?? state.rootedWalletContextId,
    lastReservationSummary: projection.lastReservationSummary ?? state.lastReservationSummary,
  };
}

function readTransactionPlanId(
  operationInput: unknown,
  currentState: EmberLendingLifecycleState,
): string | null {
  if (isRecord(operationInput)) {
    const direct =
      readString(operationInput['transactionPlanId']) ??
      readString(operationInput['transaction_plan_id']);
    if (direct) {
      return direct;
    }
  }

  if (isRecord(currentState.lastCandidatePlan)) {
    return readString(currentState.lastCandidatePlan['transaction_plan_id']);
  }

  return null;
}

function buildExecutionPreparationContinuationIdempotencyKey(input: {
  baseIdempotencyKey: string;
  attempt: number;
  priorRevision: number | null;
}): string {
  if (input.attempt <= 1) {
    return input.baseIdempotencyKey;
  }

  return `${input.baseIdempotencyKey}:await-execution-progress:${input.priorRevision ?? input.attempt - 1}`;
}

async function signPreparedExecutionTransactionWithRuntimeService(input: {
  runtimeSigning?: AgentRuntimeSigningService;
  runtimeSignerRef?: string;
  revision: number | null;
  expectedAddress: `0x${string}`;
  unsignedTransactionHex: `0x${string}`;
  notConfiguredMessage: string;
  addressMismatchMessage: string;
}): Promise<{
  confirmedAddress: `0x${string}`;
  rawTransaction: `0x${string}`;
}> {
  if (!input.runtimeSigning) {
    throw new LocalExecutionFailureError(input.notConfiguredMessage, input.revision);
  }

  try {
    const signedTransaction = await signPreparedEvmTransaction({
      signing: input.runtimeSigning,
      signerRef: input.runtimeSignerRef ?? DEFAULT_RUNTIME_SIGNER_REF,
      expectedAddress: input.expectedAddress,
      chain: OWS_SIGNING_CHAIN,
      unsignedTransactionHex: input.unsignedTransactionHex,
    });

    return {
      confirmedAddress: signedTransaction.confirmedAddress,
      rawTransaction: signedTransaction.rawTransaction,
    };
  } catch (error) {
    if (
      error instanceof AgentRuntimeSigningError &&
      (error.code === 'signer_not_declared' || error.code === 'signer_not_configured')
    ) {
      throw new LocalExecutionFailureError(input.notConfiguredMessage, input.revision);
    }

    if (
      error instanceof AgentRuntimeSigningError &&
      (error.code === 'address_mismatch' || error.code === 'confirmed_address_missing')
    ) {
      throw new LocalExecutionFailureError(input.addressMismatchMessage, input.revision);
    }

    if (error instanceof AgentRuntimeSigningError && error.code === 'invalid_signed_artifact') {
      throw new LocalExecutionFailureError(
        'Lending execution signing could not continue because the prepared unsigned transaction could not be serialized with the returned signature.',
        input.revision,
      );
    }

    throw error;
  }
}

async function runPreparedExecutionFlow(input: {
  protocolHost: EmberLendingSharedEmberProtocolHost;
  runtimeSigning?: AgentRuntimeSigningService;
  anchoredPayloadResolver?: EmberLendingAnchoredPayloadResolver;
  runtimeSignerRef?: string;
  threadId: string;
  agentId: string;
  currentState: EmberLendingLifecycleState;
  transactionPlanId: string;
  idempotencyKey: string;
}): Promise<{
  revision: number | null;
  committedEventIds: string[];
  executionResult: unknown;
}> {
  let requestResponse = await runSharedEmberCommandWithResolvedRevision<RequestTransactionExecutionResponse>({
    protocolHost: input.protocolHost,
    threadId: input.threadId,
    agentId: input.agentId,
    currentRevision: input.currentState.lastSharedEmberRevision,
    buildRequest: (expectedRevision) => ({
      jsonrpc: '2.0',
      id: `shared-ember-${input.threadId}-request-transaction-execution`,
      method: 'subagent.requestTransactionExecution.v1',
      params: {
        idempotency_key: buildExecutionPreparationContinuationIdempotencyKey({
          baseIdempotencyKey: input.idempotencyKey,
          attempt: 1,
          priorRevision: input.currentState.lastSharedEmberRevision,
        }),
        expected_revision: expectedRevision,
        transaction_plan_id: input.transactionPlanId,
      },
    }),
  });
  let committedEventIds = [...(requestResponse.result?.committed_event_ids ?? [])];
  let executionResult: unknown = requestResponse.result?.execution_result ?? null;
  let requestAttempts = 1;

  while (
    isRecord(executionResult) &&
    readString(executionResult['phase']) === 'authority_preparation_needed'
  ) {
    if (requestAttempts >= MAX_PREPARE_TRANSACTION_ATTEMPTS) {
      throw new LocalExecutionFailureError(
        'Lending transaction execution could not continue because Shared Ember did not complete authority preparation.',
        requestResponse.result?.revision ?? null,
      );
    }

    requestAttempts += 1;
    requestResponse = await runSharedEmberCommandWithResolvedRevision<RequestTransactionExecutionResponse>({
      protocolHost: input.protocolHost,
      threadId: input.threadId,
      agentId: input.agentId,
      currentRevision: requestResponse.result?.revision ?? null,
      buildRequest: (expectedRevision) => ({
        jsonrpc: '2.0',
        id: `shared-ember-${input.threadId}-request-transaction-execution`,
        method: 'subagent.requestTransactionExecution.v1',
        params: {
          idempotency_key: buildExecutionPreparationContinuationIdempotencyKey({
            baseIdempotencyKey: input.idempotencyKey,
            attempt: requestAttempts,
            priorRevision: requestResponse.result?.revision ?? null,
          }),
          expected_revision: expectedRevision,
          transaction_plan_id: input.transactionPlanId,
        },
      }),
    });
    committedEventIds.push(...(requestResponse.result?.committed_event_ids ?? []));
    executionResult = requestResponse.result?.execution_result ?? null;
  }

  if (isRecord(executionResult) && readString(executionResult['phase']) === 'ready_for_redelegation') {
    const requestId = readString(executionResult['request_id']);

    if (requestId) {
      const currentProgress = await readCommittedExecutionProgressFromOutbox({
        protocolHost: input.protocolHost,
        agentId: input.agentId,
        requestId,
      });
      const latestProgress =
        currentProgress === null
          ? null
          : await waitForCommittedExecutionProgress({
              protocolHost: input.protocolHost,
              threadId: input.threadId,
              requestId,
              afterSequence: currentProgress.latestSequence,
            });
      const latestPhase = isRecord(latestProgress?.executionResult)
        ? readString(latestProgress.executionResult['phase'])
        : null;

      if (latestPhase === 'completed') {
        return {
          revision: latestProgress?.revision ?? requestResponse.result?.revision ?? null,
          committedEventIds,
          executionResult: latestProgress?.executionResult ?? executionResult,
        };
      }

      if (latestPhase && latestPhase !== 'ready_for_redelegation') {
        requestAttempts += 1;
        requestResponse =
          await runSharedEmberCommandWithResolvedRevision<RequestTransactionExecutionResponse>({
            protocolHost: input.protocolHost,
            threadId: input.threadId,
            agentId: input.agentId,
            currentRevision: latestProgress?.revision ?? requestResponse.result?.revision ?? null,
            buildRequest: (expectedRevision) => ({
              jsonrpc: '2.0',
              id: `shared-ember-${input.threadId}-request-transaction-execution`,
              method: 'subagent.requestTransactionExecution.v1',
              params: {
                idempotency_key: buildExecutionPreparationContinuationIdempotencyKey({
                  baseIdempotencyKey: input.idempotencyKey,
                  attempt: requestAttempts,
                  priorRevision:
                    latestProgress?.revision ?? requestResponse.result?.revision ?? null,
                }),
                expected_revision: expectedRevision,
                transaction_plan_id: input.transactionPlanId,
              },
            }),
          });
        committedEventIds.push(...(requestResponse.result?.committed_event_ids ?? []));
        executionResult = requestResponse.result?.execution_result ?? null;
      }
    }
  }

  let currentRevision = requestResponse.result?.revision ?? null;
  if (!hasExecutionSigningPreparation(executionResult)) {
    return {
      revision: currentRevision,
      committedEventIds,
      executionResult,
    };
  }

  let submissionAttempts = 0;
  while (hasExecutionSigningPreparation(executionResult)) {
    if (submissionAttempts >= MAX_SIGNED_TRANSACTION_SUBMISSIONS) {
      throw new LocalExecutionFailureError(
        'Lending transaction execution could not continue because Shared Ember kept requesting additional signing steps.',
        currentRevision,
      );
    }
    submissionAttempts += 1;

    const preparedWalletAddress = readPreparedExecutionWalletAddress(executionResult);
    if (!input.currentState.walletAddress || !preparedWalletAddress) {
      throw new LocalExecutionFailureError(
        'Lending execution signing could not continue because the dedicated subagent wallet identity is incomplete.',
        currentRevision,
      );
    }
    if (preparedWalletAddress !== input.currentState.walletAddress) {
      throw new LocalExecutionFailureError(
        'Lending execution signing could not continue because the prepared signing package does not match the dedicated subagent wallet.',
        currentRevision,
      );
    }

    const requestId = readString(executionResult['request_id']);
    const executionSigningPackage = readExecutionSigningPackage(executionResult)!;
    if (!input.runtimeSigning) {
      throw new LocalExecutionFailureError(
        'Runtime-owned signing service is not configured for lending transaction execution.',
        currentRevision,
      );
    }

    const executionPreparationId = readPreparedExecutionId(executionResult);
    const canonicalUnsignedPayloadRef =
      readExecutionSigningPackageCanonicalUnsignedPayloadRef(executionResult);
    const delegationArtifactRef =
      readExecutionSigningPackageDelegationArtifactRef(executionResult);
    const rootDelegationArtifactRef =
      readExecutionSigningPackageRootDelegationArtifactRef(executionResult);
    const plannedTransactionPayloadRef = readPreparedExecutionPlannedTransactionPayloadRef(
      executionResult,
    );
    const network = readPreparedExecutionNetwork(executionResult);
    const requiredControlPath = readPreparedExecutionRequiredControlPath(executionResult);
    let resolvedUnsignedTransactionHex: `0x${string}` | null = null;
    if (executionPreparationId && canonicalUnsignedPayloadRef) {
      try {
        resolvedUnsignedTransactionHex =
          (await input.anchoredPayloadResolver?.resolvePreparedUnsignedTransaction({
            agentId: input.agentId,
            executionPreparationId,
            transactionPlanId: input.transactionPlanId,
            requestId: requestId!,
            canonicalUnsignedPayloadRef,
            delegationArtifactRef,
            rootDelegationArtifactRef,
            plannedTransactionPayloadRef,
            walletAddress: input.currentState.walletAddress,
            network,
            requiredControlPath,
            anchoredPayloadRecords: input.currentState.anchoredPayloadRecords,
          })) ?? null;
      } catch (error) {
        if (!(error instanceof Error)) {
          throw error;
        }

        throw new LocalExecutionFailureError(error.message, currentRevision);
      }
    }
    const unsignedTransactionHex =
      readExecutionUnsignedTransactionHex(executionResult) ?? resolvedUnsignedTransactionHex;
    if (!unsignedTransactionHex) {
      throw new LocalExecutionFailureError(
        'Lending execution signing could not continue because the concrete service integration layer did not resolve the prepared unsigned transaction.',
        currentRevision,
      );
    }

    const signedExecution = await signPreparedExecutionTransactionWithRuntimeService({
      runtimeSigning: input.runtimeSigning,
      runtimeSignerRef: input.runtimeSignerRef,
      revision: currentRevision,
      expectedAddress: input.currentState.walletAddress,
      unsignedTransactionHex,
      notConfiguredMessage:
        'Runtime-owned signing service is not configured for lending transaction execution.',
      addressMismatchMessage:
        'Lending execution signing could not continue because the runtime signer did not confirm the dedicated subagent wallet identity.',
    });

    const signedTransaction = {
      execution_preparation_id: executionPreparationId,
      transaction_plan_id: input.transactionPlanId,
      request_id: requestId,
      active_delegation_id: readString(executionSigningPackage['active_delegation_id']),
      canonical_unsigned_payload_ref: canonicalUnsignedPayloadRef,
      signer_address: signedExecution.confirmedAddress,
      raw_transaction: signedExecution.rawTransaction,
    };

    const submitResponse = await submitSignedTransaction({
      protocolHost: input.protocolHost,
      threadId: input.threadId,
      agentId: input.agentId,
      currentRevision,
      transactionPlanId: input.transactionPlanId,
      requestId: requestId!,
      idempotencyKey: input.idempotencyKey,
      signedTransaction,
    }).catch((error: unknown) => {
      if (!(error instanceof Error)) {
        throw error;
      }

      throw new PendingExecutionSubmissionError(error.message, currentRevision, {
        transactionPlanId: input.transactionPlanId,
        requestId: requestId!,
        idempotencyKey: input.idempotencyKey,
        signedTransaction,
        revision: currentRevision,
      });
    });

    currentRevision = submitResponse.revision;
    committedEventIds.push(...submitResponse.committedEventIds);
    executionResult = submitResponse.executionResult ?? null;
  }

  return {
    revision: currentRevision,
    committedEventIds,
    executionResult,
  };
}

async function resumePendingExecutionSubmission(input: {
  protocolHost: EmberLendingSharedEmberProtocolHost;
  threadId: string;
  agentId: string;
  pendingSubmission: PendingExecutionSubmission;
}): Promise<{
  revision: number | null;
  committedEventIds: string[];
  executionResult: unknown;
}> {
  const recoveredResult = await readRecoveredExecutionResultFromOutbox({
    protocolHost: input.protocolHost,
    agentId: input.agentId,
    requestId: input.pendingSubmission.requestId,
  });

  if (recoveredResult) {
    return {
      revision: recoveredResult.revision,
      committedEventIds: [],
      executionResult: recoveredResult.executionResult,
    };
  }

  try {
    const submitResponse = await submitSignedTransaction({
      protocolHost: input.protocolHost,
      threadId: input.threadId,
      agentId: input.agentId,
      currentRevision: input.pendingSubmission.revision,
      transactionPlanId: input.pendingSubmission.transactionPlanId,
      requestId: input.pendingSubmission.requestId,
      idempotencyKey: input.pendingSubmission.idempotencyKey,
      signedTransaction: input.pendingSubmission.signedTransaction,
    });

    return {
      revision: submitResponse.revision,
      committedEventIds: submitResponse.committedEventIds,
      executionResult: submitResponse.executionResult,
    };
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }

    throw new PendingExecutionSubmissionError(
      error.message,
      input.pendingSubmission.revision,
      input.pendingSubmission,
    );
  }
}

function readEscalationResult(operationInput: unknown): unknown {
  if (isRecord(operationInput) && 'result' in operationInput) {
    return operationInput['result'];
  }

  return operationInput;
}

export function createEmberLendingDomain(
  options: CreateEmberLendingDomainOptions = {},
): AgentRuntimeDomainConfig<EmberLendingLifecycleState> {
  const agentId = options.agentId ?? EMBER_LENDING_SHARED_EMBER_AGENT_ID;

  return {
    lifecycle: {
      initialPhase: 'prehire',
      phases: ['prehire', 'onboarding', 'active', 'firing', 'inactive'],
      terminalPhases: [],
      commands: [
        {
          name: 'hire',
          description: 'Route managed-agent activation back to the portfolio manager.',
        },
        {
          name: 'fire',
          description: 'Route managed-agent deactivation back to the portfolio manager.',
        },
        {
          name: 'create_transaction_plan',
          description:
            'Create or refresh a candidate transaction plan for the managed lending lane. Treat the current live Shared Ember execution context as authoritative: if active reservations or owned units expose lending.borrow, lending.withdraw, or lending.repay after an earlier transaction, those follow-up actions are in scope for the current mandate and should be planned directly from this thread without involving the portfolio manager. Keep the action families distinct: lending.supply adds collateral, lending.withdraw removes collateral, lending.borrow increases debt, and lending.repay pays down debt. Do not answer a repay request with a supply plan, do not answer a withdraw request with a repay or supply plan, and do not answer a borrow request with a collateral-add plan. When the user asks to create, refresh, or retry a plan, call this tool in the current turn instead of only describing the last plan. Pass JSON with action_summary, optional control_path, optional intent, optional candidate_unit_ids, and optional requested_quantities as either an array of { unit_id, quantity } objects or an object map of unit_id to quantity. When a specific follow-up reservation is active, prefer setting control_path to the exact admitted path such as lending.repay or lending.withdraw so planning binds to the right reservation. If you provide intent, use one of deploy, increase, decrease, rebalance, or transfer. Every requested_quantities quantity must use base-unit quantity strings. When the user asks for an exact amount or any partial amount such as half, you must include requested_quantities with the exact base-unit quantity strings; a partial or exact plan without requested_quantities is invalid. Omit requested_quantities only when the user clearly wants the full or max-possible amount.',
        },
        {
          name: 'request_transaction_execution',
          description:
            'Request admission and execution for the current lending transaction plan through the bounded Shared Ember surface. When the user asks to execute the current plan, call this tool in the current turn instead of only describing the plan or speculating about the outcome. If the current thread already has a lastCandidatePlan plus an active reservation summary or active reservation for the same control path, treat that as enough context to attempt execution now. Do not refuse execution by claiming the reservation is inactive unless the current thread state explicitly shows no matching active reservation for the plan.',
        },
        {
          name: 'create_escalation_request',
          description: 'Create a bounded escalation request when the lending lane cannot proceed locally.',
        },
      ],
      transitions: [],
      interrupts: [],
    },
    systemContext: async ({ state, threadId }) => {
      const currentState = normalizeLifecycleState(state);
      if (!options.protocolHost || !shouldReadSharedEmberExecutionContext(currentState)) {
        return buildFallbackExecutionContextXml(currentState);
      }

      try {
        const executionContext = await readSharedEmberExecutionContext({
          protocolHost: options.protocolHost,
          threadId,
          agentId,
        });
        return buildSharedEmberExecutionContextXml({
          status: 'live',
          state: currentState,
          executionContext: executionContext.executionContext,
        });
      } catch (error) {
        return buildSharedEmberExecutionContextXml({
          status: 'unavailable',
          state: currentState,
          error: error instanceof Error ? error.message : 'Unknown Shared Ember error.',
        });
      }
    },
    handleOperation: async ({ operation, state, threadId }) => {
      const currentState = normalizeLifecycleState(state);

      switch (operation.name) {
        case EMBER_LENDING_INTERNAL_HYDRATE_COMMAND: {
          if (!options.protocolHost) {
            return {
              state: currentState,
              outputs: {},
            };
          }

          const nextState = await hydrateManagedProjectionFromSharedEmber({
            protocolHost: options.protocolHost,
            state: currentState,
            threadId,
            agentId,
          });
          const managedMandateProjection = buildManagedMandateEditorProjection(nextState);

          return {
            state: nextState,
            ...(managedMandateProjection
              ? {
                  domainProjectionUpdate: {
                    managedMandateEditor: managedMandateProjection,
                  },
                }
              : {}),
            outputs: {
              status: {
                executionStatus: 'completed',
                statusMessage: 'Lending runtime projection hydrated from Shared Ember Domain Service.',
              },
              artifacts: [
                {
                  data: {
                    type: 'shared-ember-portfolio-state',
                    revision: nextState.lastSharedEmberRevision,
                    portfolioState: nextState.lastPortfolioState,
                  },
                },
              ],
            },
          };
        }
        case 'hire':
          return {
            state: currentState,
            outputs: {
              status: {
                executionStatus: 'failed',
                statusMessage: DIRECT_HIRE_MESSAGE,
              },
            },
          };
        case 'fire':
          return {
            state: currentState,
            outputs: {
              status: {
                executionStatus: 'failed',
                statusMessage: DIRECT_FIRE_MESSAGE,
              },
            },
          };
        case 'create_transaction_plan': {
          if (!options.protocolHost) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage: 'Shared Ember Domain Service host is not configured.',
                },
              },
            };
          }

          let planningState = currentState;
          let planningReadiness = resolveManagedPlanningReadiness({
            state: planningState,
            operationInput: operation.input,
          });
          let handoff = buildTransactionPlanningHandoff({
            state: planningState,
            threadId,
            agentId,
            operationInput: operation.input,
          });
          if (planningReadiness.status === 'blocked' || !handoff) {
            planningState = await hydrateManagedProjectionFromSharedEmber({
              protocolHost: options.protocolHost,
              state: currentState,
              threadId,
              agentId,
            });
            planningReadiness = resolveManagedPlanningReadiness({
              state: planningState,
              operationInput: operation.input,
            });
            handoff = buildTransactionPlanningHandoff({
              state: planningState,
              threadId,
              agentId,
              operationInput: operation.input,
            });
          }
          if (planningReadiness.status === 'blocked') {
            const statusMessage = await resolveManagedPlanningBlockedMessage({
              protocolHost: options.protocolHost,
              threadId,
              agentId,
              state: planningState,
              fallbackStatusMessage: planningReadiness.statusMessage,
            });

            return {
              state: planningState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage,
                },
              },
            };
          }
          if (!handoff) {
            return {
              state: planningState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Lending runtime context could not be hydrated from Shared Ember for planning.',
                },
              },
            };
          }

          const fallbackIdempotencyKey =
            `idem-create-transaction-plan-${threadId}-${buildStableCommandSuffix(handoff)}`;
          const idempotencyKey = resolveOperationIdempotencyKey({
            provided: readStringKey(operation.input, 'idempotencyKey'),
            fallback: fallbackIdempotencyKey,
            expectedPrefix: 'idem-create-transaction-plan-',
            stableBinding: buildStableCommandSuffix(handoff),
          });
          let response: {
            result?: {
              revision?: number;
              committed_event_ids?: string[];
              candidate_plan?: unknown;
            };
          };
          try {
            response = await runSharedEmberCommandWithResolvedRevision<{
              result?: {
                revision?: number;
                committed_event_ids?: string[];
                candidate_plan?: unknown;
              };
            }>({
              protocolHost: options.protocolHost,
              threadId,
              agentId,
              currentRevision: planningState.lastSharedEmberRevision,
              buildRequest: (expectedRevision) => ({
                jsonrpc: '2.0',
                id: `shared-ember-${threadId}-create-transaction-plan`,
                method: 'subagent.createTransactionPlan.v1',
                params: {
                  idempotency_key: idempotencyKey,
                  expected_revision: expectedRevision,
                  handoff,
                },
              }),
            });
          } catch (error) {
            if (!(error instanceof Error)) {
              throw error;
            }

            return {
              state: {
                ...planningState,
                phase: 'active',
              },
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage: error.message,
                },
              },
            };
          }

          const candidatePlan = response.result?.candidate_plan ?? null;
          const candidatePlanTransactionPlanId = readCandidatePlanTransactionPlanId(candidatePlan);
          const payloadBuilderOutput = readCandidatePlanPayloadBuilderOutput(candidatePlan);
          const compactPlanSummary = readCandidatePlanCompactPlanSummary(candidatePlan);
          const anchoringFailureMessage = resolveCandidatePlanAnchoringFailureMessage({
            candidatePlan,
            anchoredPayloadResolver: options.anchoredPayloadResolver,
            walletAddress: planningState.walletAddress,
            rootUserWalletAddress: planningState.rootUserWalletAddress,
            transactionPlanId: candidatePlanTransactionPlanId,
            payloadBuilderOutput,
            compactPlanSummary,
          });
          if (anchoringFailureMessage) {
            return {
              state: {
                ...planningState,
                phase: 'active',
                lastSharedEmberRevision: response.result?.revision ?? null,
              },
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage: anchoringFailureMessage,
                },
              },
            };
          }

          const anchoredPayloadRecord = await options.anchoredPayloadResolver!.anchorCandidatePlanPayload({
            agentId,
            threadId,
            transactionPlanId: candidatePlanTransactionPlanId!,
            walletAddress: planningState.walletAddress!,
            rootUserWalletAddress: planningState.rootUserWalletAddress!,
            payloadBuilderOutput: payloadBuilderOutput!,
            compactPlanSummary: compactPlanSummary!,
            useMaxRepayAmount:
              payloadBuilderOutput?.required_control_path === 'lending.repay' &&
              !Object.prototype.hasOwnProperty.call(
                isRecord(operation.input) ? operation.input : {},
                'requested_quantities',
              ),
          });
          if (!anchoredPayloadRecord) {
            return {
              state: {
                ...planningState,
                phase: 'active',
                lastSharedEmberRevision: response.result?.revision ?? null,
              },
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Candidate lending plan could not be anchored behind the lending service boundary because the anchored payload resolver did not persist the payload.',
                },
              },
            };
          }

          const nextState: EmberLendingLifecycleState = {
            ...planningState,
            phase: 'active',
            lastSharedEmberRevision: response.result?.revision ?? null,
            lastCandidatePlan: candidatePlan,
            lastCandidatePlanSummary: readCandidatePlanSummary(candidatePlan),
            anchoredPayloadRecords: upsertAnchoredPayloadRecord(
              planningState.anchoredPayloadRecords,
              anchoredPayloadRecord,
            ),
          };

          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'completed',
                statusMessage: 'Candidate lending plan created through the Shared Ember planner.',
              },
              artifacts: [
                {
                  data: {
                    type: 'shared-ember-candidate-plan',
                    revision: nextState.lastSharedEmberRevision,
                    committedEventIds: response.result?.committed_event_ids ?? [],
                    candidatePlan,
                  },
                },
              ],
            },
          };
        }
        case 'request_transaction_execution': {
          if (!options.protocolHost) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage: 'Shared Ember Domain Service host is not configured.',
                },
              },
            };
          }

          const transactionPlanId = readTransactionPlanId(operation.input, currentState);
          if (!transactionPlanId) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'No lending transaction plan is available to execute. Create a candidate plan first.',
                },
              },
            };
          }

          const fallbackIdempotencyKey =
            `idem-execute-transaction-plan-${threadId}-${buildStableCommandSuffix({
              transactionPlanId,
            })}`;
          const idempotencyKey = resolveOperationIdempotencyKey({
            provided: readStringKey(operation.input, 'idempotencyKey'),
            fallback: fallbackIdempotencyKey,
            expectedPrefix: 'idem-execute-transaction-plan-',
            stableBinding: buildStableCommandSuffix({ transactionPlanId }),
          });
          let preparedExecutionResult: Awaited<ReturnType<typeof runPreparedExecutionFlow>>;
          try {
            preparedExecutionResult =
              currentState.pendingExecutionSubmission?.transactionPlanId === transactionPlanId &&
              currentState.pendingExecutionSubmission?.idempotencyKey === idempotencyKey
                ? await resumePendingExecutionSubmission({
                    protocolHost: options.protocolHost,
                    threadId,
                    agentId,
                    pendingSubmission: currentState.pendingExecutionSubmission,
                  })
                : await runPreparedExecutionFlow({
                    protocolHost: options.protocolHost,
                    runtimeSigning: options.runtimeSigning,
                    anchoredPayloadResolver: options.anchoredPayloadResolver,
                    runtimeSignerRef: options.runtimeSignerRef,
                    threadId,
                    agentId,
                    currentState,
                    transactionPlanId,
                    idempotencyKey,
                  });
          } catch (error) {
            if (!(error instanceof Error)) {
              throw error;
            }

            return {
              state: {
                ...currentState,
                phase: 'active',
                lastSharedEmberRevision:
                  error instanceof LocalExecutionFailureError ||
                  error instanceof PendingExecutionSubmissionError
                    ? error.revision ?? currentState.lastSharedEmberRevision
                    : currentState.lastSharedEmberRevision,
                lastExecutionResult: currentState.lastExecutionResult,
                lastExecutionTxHash: null,
                pendingExecutionSubmission:
                  error instanceof PendingExecutionSubmissionError
                    ? error.pendingSubmission
                    : null,
              },
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage: error.message,
                },
              },
            };
          }

          const executionResult = preparedExecutionResult.executionResult ?? null;
          const executionPortfolioState =
            readExecutionPortfolioState(executionResult) ?? null;
          const shouldHydrateManagedProjection =
            !hasManagedPortfolioProjection(executionPortfolioState);
          const mergedExecutionPortfolioState = mergePortfolioStateWithExecutionContext({
            portfolioState: executionPortfolioState,
            executionContext: null,
            fallbackPortfolioState: currentState.lastPortfolioState,
          });
          const projection = mergePortfolioProjectionPreservingKnownContext(
            currentState,
            mergedExecutionPortfolioState,
          );
          const executionStatus = readExecutionStatusMessage(executionResult);
          let nextState: EmberLendingLifecycleState = {
            ...currentState,
            ...projection,
            phase: 'active',
            lastPortfolioState: mergedExecutionPortfolioState ?? currentState.lastPortfolioState,
            lastSharedEmberRevision: preparedExecutionResult.revision,
            lastExecutionResult: executionResult,
            lastExecutionTxHash: readExecutionTxHash(executionResult),
            pendingExecutionSubmission: null,
          };

          if (shouldHydrateManagedProjection && options.protocolHost) {
            try {
              nextState = await hydrateManagedProjectionFromSharedEmber({
                protocolHost: options.protocolHost,
                state: nextState,
                threadId,
                agentId,
              });
            } catch {
              nextState = {
                ...nextState,
              };
            }
          }

          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: executionStatus.executionStatus,
                statusMessage: executionStatus.statusMessage,
              },
              artifacts: [
                {
                  data: buildExecutionArtifactData({
                    revision: nextState.lastSharedEmberRevision,
                    executionResult,
                    executionStatus: executionStatus.executionStatus,
                    statusMessage: executionStatus.statusMessage,
                  }),
                },
              ],
            },
          };
        }
        case 'create_escalation_request': {
          if (!options.protocolHost) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage: 'Shared Ember Domain Service host is not configured.',
                },
              },
            };
          }

          let escalationState = currentState;
          let handoff = buildEscalationHandoff({
            state: escalationState,
            threadId,
            agentId,
            operationInput: operation.input,
          });
          if (!handoff) {
            escalationState = await hydrateManagedProjectionFromSharedEmber({
              protocolHost: options.protocolHost,
              state: currentState,
              threadId,
              agentId,
            });
            handoff = buildEscalationHandoff({
              state: escalationState,
              threadId,
              agentId,
              operationInput: operation.input,
            });
          }
          if (!handoff) {
            return {
              state: escalationState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Lending runtime context is incomplete. Wait for execution-context hydration before escalating.',
                },
              },
            };
          }

          const result = readEscalationResult(operation.input);
          const response = (await options.protocolHost.handleJsonRpc({
            jsonrpc: '2.0',
            id: `shared-ember-${threadId}-create-escalation-request`,
            method: 'subagent.createEscalationRequest.v1',
            params: {
              handoff,
              result,
            },
          })) as {
            result?: {
              revision?: number;
              escalation_request?: unknown;
            };
          };

          const escalationRequest = response.result?.escalation_request ?? null;
          const nextState: EmberLendingLifecycleState = {
            ...escalationState,
            phase: 'active',
            lastSharedEmberRevision:
              response.result?.revision ?? escalationState.lastSharedEmberRevision,
            lastEscalationRequest: escalationRequest,
            lastEscalationSummary: readEscalationSummary(escalationRequest),
          };

          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'completed',
                statusMessage: 'Lending escalation request created through Shared Ember.',
              },
              artifacts: [
                {
                  data: {
                    type: 'shared-ember-escalation-request',
                    revision: nextState.lastSharedEmberRevision,
                    escalationRequest,
                  },
                },
              ],
            },
          };
        }
        default:
          return {
            state: currentState,
            outputs: {},
          };
      }
    },
  };
}

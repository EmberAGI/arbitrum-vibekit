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
const CREATE_TRANSACTION_INPUT_BLOCKED_MESSAGE =
  'create_transaction requires JSON with control_path, asset, protocol_system, network, and quantity. quantity must be {"kind":"exact","value":"1.25"} or {"kind":"percent","value":50}.';
const CREATE_TRANSACTION_CONTROL_PATH_BLOCKED_MESSAGE =
  'create_transaction control_path must be one of "lending.supply", "lending.withdraw", "lending.borrow", or "lending.repay". Do not pass a position-scope id like "position-scope-aave-arbitrum-...". Exact quantity strings like {"kind":"exact","value":"3"} are valid.';

export type EmberLendingLifecycleState = {
  phase: 'prehire' | 'onboarding' | 'active' | 'firing' | 'inactive';
  mandateRef: string | null;
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
  requestRedelegationRefresh?: (input: {
    rootWalletAddress: string;
    threadId: string;
    transactionPlanId: string;
    requestId: string;
  }) => Promise<void>;
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
    network?: string;
    quantity?: string;
    value_usd?: string;
    economic_exposures?: Array<{
      asset?: string;
      quantity?: string;
    }>;
  }>;
  active_position_scopes?: Array<{
    scope_id?: string;
    kind?: string;
    scope_type_id?: string;
    root_user_wallet?: string;
    network?: string;
    protocol_system?: string;
    container_ref?: string;
    status?: string;
    market_state?: Record<string, unknown> | null;
    members?: Record<string, unknown>[];
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

type SemanticQuantity =
  | {
      kind: 'exact';
      value: string;
    }
  | {
      kind: 'percent';
      value: number;
    };

type SemanticTransactionRequest = {
  control_path: 'lending.supply' | 'lending.withdraw' | 'lending.borrow' | 'lending.repay';
  asset: string;
  protocol_system: string;
  network: string;
  quantity: SemanticQuantity;
};

type ManagedPlanningReadiness =
  | {
      status: 'ready';
      request: SemanticTransactionRequest;
    }
  | {
      status: 'blocked';
      statusMessage: string;
      reason: 'onboarding' | 'invalid_request';
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
  managedMandate: Record<string, unknown> & {
    lending_policy: Record<string, unknown> & {
      collateral_policy: Record<string, unknown> & {
        assets: Array<
          Record<string, unknown> & {
            asset: string;
            max_allocation_pct: number;
          }
        >;
      };
      borrow_policy: Record<string, unknown> & {
        allowed_assets: string[];
      };
      risk_policy: Record<string, unknown> & {
        max_ltv_bps: number;
        min_health_factor: string;
      };
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
  rootedWalletContextId?: string | null;
}): Promise<SharedEmberExecutionContextEnvelope> {
  const response = (await input.protocolHost.handleJsonRpc({
    jsonrpc: '2.0',
    id: `shared-ember-${input.threadId}-read-execution-context`,
    method: 'subagent.readExecutionContext.v1',
    params: {
      agent_id: input.agentId,
      ...(input.rootedWalletContextId
        ? {
            rooted_wallet_context_id: input.rootedWalletContextId,
          }
        : {}),
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
    purpose === 'position.enter' ? 'supplies' : purpose ? `${purpose}s` : 'moves';
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

function readPortfolioActivePositionScopes(portfolioState: unknown): Record<string, unknown>[] {
  if (!isRecord(portfolioState) || !Array.isArray(portfolioState['active_position_scopes'])) {
    return [];
  }

  return portfolioState['active_position_scopes'].filter(
    (candidate): candidate is Record<string, unknown> => isRecord(candidate),
  );
}

function scoreActivePositionScopeVisibility(scope: Record<string, unknown>): number {
  let score = 0;

  const marketState = readRecordKey(scope, 'market_state');
  if (marketState) {
    if (readString(marketState['available_borrows_usd'])) {
      score += 1;
    }
    if (readString(marketState['borrowable_headroom_usd'])) {
      score += 1;
    }
    if (readFiniteNumber(marketState['current_ltv_bps']) !== null) {
      score += 1;
    }
    if (readFiniteNumber(marketState['liquidation_threshold_bps']) !== null) {
      score += 1;
    }
    if (readString(marketState['health_factor'])) {
      score += 1;
    }

    const freshness = readRecordKey(marketState, 'freshness');
    if (freshness) {
      if (readString(freshness['derived_at'])) {
        score += 1;
      }
      if (readString(freshness['latest_observed_at'])) {
        score += 1;
      }
      if (readString(freshness['source_kind'])) {
        score += 1;
      }
    }
  }

  const members = Array.isArray(scope['members'])
    ? scope['members'].filter((candidate): candidate is Record<string, unknown> => isRecord(candidate))
    : [];
  score += members.length * 2;

  for (const member of members) {
    if (Array.isArray(member['economic_exposures'])) {
      score += member['economic_exposures'].filter((candidate) => isRecord(candidate)).length;
    }
    if (isRecord(member['state'])) {
      const memberState = member['state'];
      if (readString(memberState['withdrawable_quantity'])) {
        score += 1;
      }
      if (readString(memberState['supply_apr'])) {
        score += 1;
      }
      if (readString(memberState['borrow_apr'])) {
        score += 1;
      }
    }
  }

  return score;
}

function readActivePositionScopeObservedAt(scope: Record<string, unknown>): number | null {
  const freshness = readRecordKey(readRecordKey(scope, 'market_state'), 'freshness');
  const timestampSource =
    readString(freshness?.['latest_observed_at']) ?? readString(freshness?.['derived_at']);
  if (!timestampSource) {
    return null;
  }

  const timestamp = Date.parse(timestampSource);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function selectPreferredActivePositionScope(input: {
  rawScope: Record<string, unknown>;
  hydratedScope: Record<string, unknown>;
}): Record<string, unknown> {
  const rawObservedAt = readActivePositionScopeObservedAt(input.rawScope);
  const hydratedObservedAt = readActivePositionScopeObservedAt(input.hydratedScope);
  if (rawObservedAt !== null && hydratedObservedAt !== null && rawObservedAt !== hydratedObservedAt) {
    return hydratedObservedAt > rawObservedAt ? input.hydratedScope : input.rawScope;
  }

  return scoreActivePositionScopeVisibility(input.hydratedScope) >
    scoreActivePositionScopeVisibility(input.rawScope)
    ? input.hydratedScope
    : input.rawScope;
}

function selectPreferredActivePositionScopesForContext(input: {
  rawPortfolioState: unknown;
  hydratedPortfolioState: unknown;
}): Record<string, unknown>[] {
  const rawScopes = readPortfolioActivePositionScopes(input.rawPortfolioState);
  const hydratedScopes = readPortfolioActivePositionScopes(input.hydratedPortfolioState);
  if (rawScopes.length === 0) {
    return hydratedScopes;
  }
  if (hydratedScopes.length === 0) {
    return rawScopes;
  }

  const hydratedScopesById = new Map<string, Record<string, unknown>>();
  for (const scope of hydratedScopes) {
    const scopeId = readString(scope['scope_id']);
    if (scopeId) {
      hydratedScopesById.set(scopeId, scope);
    }
  }

  const mergedScopes = rawScopes.map((rawScope) => {
    const scopeId = readString(rawScope['scope_id']);
    if (!scopeId) {
      return rawScope;
    }

    const hydratedScope = hydratedScopesById.get(scopeId);
    if (!hydratedScope) {
      return rawScope;
    }

    hydratedScopesById.delete(scopeId);
    return selectPreferredActivePositionScope({
      rawScope,
      hydratedScope,
    });
  });

  return [...mergedScopes, ...hydratedScopesById.values()];
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
  const mandateContext =
    ('mandate_context' in portfolioState && isRecord(portfolioState['mandate_context'])
      ? portfolioState['mandate_context']
      : null) ??
    (mandateRecord && isRecord(mandateRecord['context']) ? mandateRecord['context'] : null) ??
    readLaneContextFallback(portfolioState);

  return {
    mandateRef,
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
  | 'mandateContext'
  | 'walletAddress'
  | 'rootUserWalletAddress'
  | 'rootedWalletContextId'
  | 'lastReservationSummary'
> {
  if (!isRecord(portfolioState)) {
    return {
      mandateRef: state.mandateRef,
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
  | 'mandateContext'
  | 'walletAddress'
  | 'rootUserWalletAddress'
  | 'rootedWalletContextId'
  | 'lastReservationSummary'
> {
  if (!executionContext || !isRecord(executionContext)) {
    return {
      mandateRef: state.mandateRef,
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

  const lendingPolicy = isRecord(mandateContext['lending_policy']) ? mandateContext['lending_policy'] : null;
  const collateralPolicy = isRecord(lendingPolicy?.['collateral_policy'])
    ? lendingPolicy['collateral_policy']
    : null;
  const borrowPolicy = isRecord(lendingPolicy?.['borrow_policy'])
    ? lendingPolicy['borrow_policy']
    : null;
  const riskPolicy = isRecord(lendingPolicy?.['risk_policy']) ? lendingPolicy['risk_policy'] : null;
  const collateralAssets = Array.isArray(collateralPolicy?.['assets']) ? collateralPolicy['assets'] : null;
  const allowedBorrowAssets = Array.isArray(borrowPolicy?.['allowed_assets'])
    ? borrowPolicy['allowed_assets']
    : null;
  const maxLtvBps = readFiniteNumber(riskPolicy?.['max_ltv_bps']);
  const minHealthFactor = readString(riskPolicy?.['min_health_factor']);

  if (
    !collateralAssets ||
    collateralAssets.length === 0 ||
    !collateralAssets.every(
      (value) =>
        isRecord(value) &&
        readString(value['asset']) !== null &&
        readFiniteNumber(value['max_allocation_pct']) !== null,
    ) ||
    !Array.isArray(allowedBorrowAssets) ||
    !allowedBorrowAssets.every((value) => readString(value) !== null) ||
    maxLtvBps === null ||
    minHealthFactor === null
  ) {
    return null;
  }

  return {
    lending_policy: {
      collateral_policy: {
        ...(collateralPolicy ?? {}),
        assets: collateralAssets.map((value) => ({
          ...(isRecord(value) ? value : {}),
          asset: readString(isRecord(value) ? value['asset'] : null) ?? '',
          max_allocation_pct:
            readFiniteNumber(isRecord(value) ? value['max_allocation_pct'] : null) ?? 0,
        })),
      },
      borrow_policy: {
        ...(borrowPolicy ?? {}),
        allowed_assets: allowedBorrowAssets
          .map((value) => readString(value))
          .filter((value): value is string => value !== null),
      },
      risk_policy: {
        ...(riskPolicy ?? {}),
        max_ltv_bps: maxLtvBps,
        min_health_factor: minHealthFactor,
      },
    },
  };
}

function buildManagedMandateEditorProjection(
  state: EmberLendingLifecycleState,
): ManagedMandateEditorProjection | null {
  const managedMandate = isRecord(state.mandateContext) ? readManagedMandate(state.mandateContext) : null;
  if (!state.mandateRef || !managedMandate) {
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
  const executionContextOwnedUnits = readExplicitContextRecords({
    context: input.executionContext,
    key: 'owned_units',
  });
  const fallbackReservations = readPortfolioReservations(input.fallbackPortfolioState);
  const portfolioReservations = readPortfolioReservations(input.portfolioState);
  const executionContextReservations = readExplicitContextRecords({
    context: input.executionContext,
    key: 'reservations',
  });
  const fallbackActivePositionScopes = readPortfolioActivePositionScopes(input.fallbackPortfolioState);
  const portfolioActivePositionScopes = readPortfolioActivePositionScopes(input.portfolioState);
  const executionContextActivePositionScopes = readExplicitContextRecords({
    context: input.executionContext,
    key: 'active_position_scopes',
  });
  const fallbackWalletContents =
    isRecord(input.fallbackPortfolioState) && Array.isArray(input.fallbackPortfolioState['wallet_contents'])
      ? input.fallbackPortfolioState['wallet_contents']
      : [];
  const portfolioWalletContents =
    isRecord(input.portfolioState) && Array.isArray(input.portfolioState['wallet_contents'])
      ? input.portfolioState['wallet_contents']
      : [];
  const walletContents =
    Array.isArray(input.executionContext?.wallet_contents) && input.executionContext.wallet_contents.length > 0
      ? input.executionContext.wallet_contents
      : portfolioWalletContents.length > 0
        ? portfolioWalletContents
        : fallbackWalletContents;

  const ownedUnits = portfolioOwnedUnits.length > 0
    ? portfolioOwnedUnits
    : executionContextOwnedUnits.status === 'present'
      ? executionContextOwnedUnits.records
      : fallbackOwnedUnits;
  const reservations = portfolioReservations.length > 0
    ? portfolioReservations
    : executionContextReservations.status === 'present'
      ? executionContextReservations.records
      : fallbackReservations;
  const activePositionScopes =
    executionContextActivePositionScopes.status === 'present'
      ? executionContextActivePositionScopes.records.length > 0
        ? mergeContextRecords({
            primary: executionContextActivePositionScopes.records,
            fallback:
              portfolioActivePositionScopes.length > 0
                ? portfolioActivePositionScopes
                : fallbackActivePositionScopes,
            idKey: 'scope_id',
          })
        : portfolioActivePositionScopes.length > 0
          ? portfolioActivePositionScopes
          : []
      : portfolioActivePositionScopes.length > 0
        ? portfolioActivePositionScopes
        : fallbackActivePositionScopes;
  const hasExplicitActivePositionScopes = executionContextActivePositionScopes.status === 'present';

  if (baseState === null) {
    return ownedUnits.length > 0 ||
      reservations.length > 0 ||
      activePositionScopes.length > 0 ||
      walletContents.length > 0 ||
      hasExplicitActivePositionScopes
      ? {
          ...(ownedUnits.length > 0 ? { owned_units: ownedUnits } : {}),
          ...(reservations.length > 0 ? { reservations } : {}),
          ...(activePositionScopes.length > 0 || hasExplicitActivePositionScopes
            ? { active_position_scopes: activePositionScopes }
            : {}),
          ...(walletContents.length > 0 ? { wallet_contents: walletContents } : {}),
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
    ...(activePositionScopes.length > 0 ||
    hasExplicitActivePositionScopes ||
    Array.isArray(baseState['active_position_scopes'])
      ? { active_position_scopes: activePositionScopes }
      : {}),
    ...(walletContents.length > 0 || Array.isArray(baseState['wallet_contents'])
      ? { wallet_contents: walletContents }
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
      rootedWalletContextId: input.state.rootedWalletContextId,
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

  if (
    Array.isArray(portfolioState['wallet_contents']) &&
    portfolioState['wallet_contents'].length > 0
  ) {
    return true;
  }

  if (
    Array.isArray(portfolioState['active_position_scopes']) &&
    portfolioState['active_position_scopes'].length > 0
  ) {
    return true;
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
    isRecord(executionContext.mandate_context) ||
    (Array.isArray(executionContext.wallet_contents) && executionContext.wallet_contents.length > 0) ||
    (Array.isArray(executionContext.active_position_scopes) &&
      executionContext.active_position_scopes.length > 0) ||
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
    return SHARED_EMBER_NETWORK;
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

function appendEconomicExposuresXml(input: {
  lines: string[];
  economicExposures: unknown;
  indent: string;
}): void {
  if (!Array.isArray(input.economicExposures) || input.economicExposures.length === 0) {
    return;
  }

  const exposures = input.economicExposures.filter(
    (candidate): candidate is Record<string, unknown> => isRecord(candidate),
  );
  if (exposures.length === 0) {
    return;
  }

  input.lines.push(`${input.indent}<economic_exposures>`);
  for (const exposure of exposures) {
    const asset = readString(exposure['asset']);
    input.lines.push(
      `${input.indent}  <economic_exposure${asset ? ` asset="${escapeXml(asset)}"` : ''}>`,
    );
    const quantity = readString(exposure['quantity']);
    if (quantity) {
      input.lines.push(`${input.indent}    <quantity>${escapeXml(quantity)}</quantity>`);
    }
    input.lines.push(`${input.indent}  </economic_exposure>`);
  }
  input.lines.push(`${input.indent}</economic_exposures>`);
}

function appendWalletContentsXml(input: {
  lines: string[];
  walletContents: unknown;
}): void {
  if (!Array.isArray(input.walletContents) || input.walletContents.length === 0) {
    return;
  }

  const walletContents = input.walletContents.filter(
    (candidate): candidate is Record<string, unknown> => isRecord(candidate),
  );
  if (walletContents.length === 0) {
    return;
  }

  input.lines.push('  <wallet_contents>');
  for (const walletBalance of walletContents) {
    const asset = readString(walletBalance['asset']);
    const network = readString(walletBalance['network']);
    const attributes = [
      asset ? `asset="${escapeXml(asset)}"` : null,
      network ? `network="${escapeXml(network)}"` : null,
    ]
      .filter((value): value is string => value !== null)
      .join(' ');
    input.lines.push(`    <wallet_balance${attributes ? ` ${attributes}` : ''}>`);

    const quantity = readString(walletBalance['quantity']);
    if (quantity) {
      input.lines.push(`      <quantity>${escapeXml(quantity)}</quantity>`);
    }

    const valueUsd = readString(walletBalance['value_usd']);
    if (valueUsd) {
      input.lines.push(`      <value_usd>${escapeXml(valueUsd)}</value_usd>`);
    }

    appendEconomicExposuresXml({
      lines: input.lines,
      economicExposures: walletBalance['economic_exposures'],
      indent: '      ',
    });

    input.lines.push('    </wallet_balance>');
  }
  input.lines.push('  </wallet_contents>');
}

function appendActivePositionScopesXml(input: {
  lines: string[];
  scopes: Record<string, unknown>[];
}): void {
  if (input.scopes.length === 0) {
    return;
  }

  input.lines.push('  <active_position_scopes>');
  for (const scope of input.scopes) {
    const scopeId = readString(scope['scope_id']);
    input.lines.push(
      `    <active_position_scope${scopeId ? ` scope_id="${escapeXml(scopeId)}"` : ''}>`,
    );

    const kind = readString(scope['kind']);
    if (kind) {
      input.lines.push(`      <kind>${escapeXml(kind)}</kind>`);
    }

    const scopeTypeId = readString(scope['scope_type_id']);
    if (scopeTypeId) {
      input.lines.push(`      <scope_type_id>${escapeXml(scopeTypeId)}</scope_type_id>`);
    }

    const protocolSystem = readString(scope['protocol_system']);
    if (protocolSystem) {
      input.lines.push(`      <protocol_system>${escapeXml(protocolSystem)}</protocol_system>`);
    }

    const network = readString(scope['network']);
    if (network) {
      input.lines.push(`      <network>${escapeXml(network)}</network>`);
    }

    const containerRef = readString(scope['container_ref']);
    if (containerRef) {
      input.lines.push(`      <container_ref>${escapeXml(containerRef)}</container_ref>`);
    }

    const status = readString(scope['status']);
    if (status) {
      input.lines.push(`      <status>${escapeXml(status)}</status>`);
    }

    const marketState = readRecordKey(scope, 'market_state');
    if (marketState) {
      input.lines.push('      <market_state>');

      const availableBorrowsUsd = readString(marketState['available_borrows_usd']);
      if (availableBorrowsUsd) {
        input.lines.push(
          `        <available_borrows_usd>${escapeXml(availableBorrowsUsd)}</available_borrows_usd>`,
        );
      }
      const borrowableHeadroomUsd = readString(marketState['borrowable_headroom_usd']);
      if (borrowableHeadroomUsd) {
        input.lines.push(
          `        <borrowable_headroom_usd>${escapeXml(borrowableHeadroomUsd)}</borrowable_headroom_usd>`,
        );
      }
      const currentLtvBps = readFiniteNumber(marketState['current_ltv_bps']);
      if (currentLtvBps !== null) {
        input.lines.push(`        <current_ltv_bps>${currentLtvBps}</current_ltv_bps>`);
      }
      const liquidationThresholdBps = readFiniteNumber(marketState['liquidation_threshold_bps']);
      if (liquidationThresholdBps !== null) {
        input.lines.push(
          `        <liquidation_threshold_bps>${liquidationThresholdBps}</liquidation_threshold_bps>`,
        );
      }
      const healthFactor = readString(marketState['health_factor']);
      if (healthFactor) {
        input.lines.push(`        <health_factor>${escapeXml(healthFactor)}</health_factor>`);
      }

      const freshness = readRecordKey(marketState, 'freshness');
      if (freshness) {
        input.lines.push('        <freshness>');
        const derivedAt = readString(freshness['derived_at']);
        if (derivedAt) {
          input.lines.push(`          <derived_at>${escapeXml(derivedAt)}</derived_at>`);
        }
        const sourceKind = readString(freshness['source_kind']);
        if (sourceKind) {
          input.lines.push(`          <source_kind>${escapeXml(sourceKind)}</source_kind>`);
        }
        const oldestObservedAt = readString(freshness['oldest_observed_at']);
        if (oldestObservedAt) {
          input.lines.push(
            `          <oldest_observed_at>${escapeXml(oldestObservedAt)}</oldest_observed_at>`,
          );
        }
        const latestObservedAt = readString(freshness['latest_observed_at']);
        if (latestObservedAt) {
          input.lines.push(
            `          <latest_observed_at>${escapeXml(latestObservedAt)}</latest_observed_at>`,
          );
        }
        input.lines.push('        </freshness>');
      }

      input.lines.push('      </market_state>');
    }

    const members = Array.isArray(scope['members'])
      ? scope['members'].filter((candidate): candidate is Record<string, unknown> => isRecord(candidate))
      : [];
    if (members.length > 0) {
      input.lines.push('      <members>');
      for (const member of members) {
        const memberId = readString(member['member_id']);
        const role = readString(member['role']);
        const asset = readString(member['asset']);
        const attributes = [
          memberId ? `member_id="${escapeXml(memberId)}"` : null,
          role ? `role="${escapeXml(role)}"` : null,
          asset ? `asset="${escapeXml(asset)}"` : null,
        ]
          .filter((value): value is string => value !== null)
          .join(' ');
        input.lines.push(`        <member${attributes ? ` ${attributes}` : ''}>`);

        const quantity = readString(member['quantity']);
        if (quantity) {
          input.lines.push(`          <quantity>${escapeXml(quantity)}</quantity>`);
        }

        const valueUsd = readString(member['value_usd']);
        if (valueUsd) {
          input.lines.push(`          <value_usd>${escapeXml(valueUsd)}</value_usd>`);
        }

        appendEconomicExposuresXml({
          lines: input.lines,
          economicExposures: member['economic_exposures'],
          indent: '          ',
        });

        const memberState = readRecordKey(member, 'state');
        if (memberState) {
          input.lines.push('          <state>');
          const withdrawableQuantity = readString(memberState['withdrawable_quantity']);
          if (withdrawableQuantity) {
            input.lines.push(
              `            <withdrawable_quantity>${escapeXml(withdrawableQuantity)}</withdrawable_quantity>`,
            );
          }
          const supplyApr = readString(memberState['supply_apr']);
          if (supplyApr) {
            input.lines.push(`            <supply_apr>${escapeXml(supplyApr)}</supply_apr>`);
          }
          const borrowApr = readString(memberState['borrow_apr']);
          if (borrowApr) {
            input.lines.push(`            <borrow_apr>${escapeXml(borrowApr)}</borrow_apr>`);
          }
          input.lines.push('          </state>');
        }

        input.lines.push('        </member>');
      }
      input.lines.push('      </members>');
    }

    input.lines.push('    </active_position_scope>');
  }
  input.lines.push('  </active_position_scopes>');
}

function appendCurrentCandidatePlanXml(input: {
  lines: string[];
  state: EmberLendingLifecycleState;
}): void {
  const transactionPlanId = readCandidatePlanTransactionPlanId(input.state.lastCandidatePlan);
  const compactPlanSummary = readCandidatePlanCompactPlanSummary(input.state.lastCandidatePlan);
  const payloadBuilderOutput = readCandidatePlanPayloadBuilderOutput(input.state.lastCandidatePlan);
  const summary =
    input.state.lastCandidatePlanSummary ?? readCandidatePlanSummary(input.state.lastCandidatePlan);
  const controlPath =
    compactPlanSummary?.control_path ?? payloadBuilderOutput?.required_control_path ?? null;

  if (!transactionPlanId && !summary && !controlPath) {
    return;
  }

  input.lines.push('  <current_candidate_plan>');
  if (transactionPlanId) {
    input.lines.push(`    <transaction_plan_id>${escapeXml(transactionPlanId)}</transaction_plan_id>`);
  }
  if (controlPath) {
    input.lines.push(`    <control_path>${escapeXml(controlPath)}</control_path>`);
  }
  if (compactPlanSummary?.asset) {
    input.lines.push(`    <asset>${escapeXml(compactPlanSummary.asset)}</asset>`);
  }
  if (compactPlanSummary?.amount) {
    input.lines.push(`    <amount>${escapeXml(compactPlanSummary.amount)}</amount>`);
  }
  if (summary) {
    input.lines.push(`    <summary>${escapeXml(summary)}</summary>`);
  }
  input.lines.push(
    '    <execute_now_rule>While current_candidate_plan exists, execute, submit, send, or run requests must call request_execution instead of create_transaction.</execute_now_rule>',
  );
  input.lines.push('  </current_candidate_plan>');
}

function appendWalletOwnershipGuidanceXml(lines: string[]): void {
  lines.push(
    '  <portfolio_scope_guidance>wallet_contents and active_position_scopes describe rooted user wallet context, not balances held in subagent_wallet_address.</portfolio_scope_guidance>',
  );
  lines.push(
    '  <subagent_wallet_guidance>subagent_wallet_address is the dedicated execution wallet and only reflects balances explicitly surfaced for that wallet.</subagent_wallet_guidance>',
  );
}

function appendStructuredXmlNode(input: {
  lines: string[];
  indent: string;
  tag: string;
  value: unknown;
}): void {
  if (input.value === null || input.value === undefined) {
    return;
  }

  if (Array.isArray(input.value)) {
    if (input.value.length === 0) {
      return;
    }

    input.lines.push(`${input.indent}<${input.tag}>`);
    for (const entry of input.value) {
      appendStructuredXmlNode({
        lines: input.lines,
        indent: `${input.indent}  `,
        tag: 'item',
        value: entry,
      });
    }
    input.lines.push(`${input.indent}</${input.tag}>`);
    return;
  }

  if (isRecord(input.value)) {
    const entries = Object.entries(input.value).filter(
      ([, nestedValue]) => nestedValue !== null && nestedValue !== undefined,
    );
    if (entries.length === 0) {
      return;
    }

    input.lines.push(`${input.indent}<${input.tag}>`);
    for (const [key, nestedValue] of entries) {
      appendStructuredXmlNode({
        lines: input.lines,
        indent: `${input.indent}  `,
        tag: key,
        value: nestedValue,
      });
    }
    input.lines.push(`${input.indent}</${input.tag}>`);
    return;
  }

  if (
    typeof input.value === 'string' ||
    typeof input.value === 'number' ||
    typeof input.value === 'boolean' ||
    typeof input.value === 'bigint'
  ) {
    input.lines.push(
      `${input.indent}<${input.tag}>${escapeXml(String(input.value))}</${input.tag}>`,
    );
  }
}

function appendMandateContextXml(
  lines: string[],
  mandateContext: Record<string, unknown> | null,
): void {
  if (!mandateContext) {
    return;
  }

  appendStructuredXmlNode({
    lines,
    indent: '  ',
    tag: 'mandate_context',
    value: mandateContext,
  });
  lines.push(
    '  <mandate_quantity_guidance>mandate_context is policy-only. Use wallet_contents, active_position_scopes, active_reservations, reservation summaries, and current_candidate_plan for live quantities and values.</mandate_quantity_guidance>',
  );
}

function readReservationOwnedUnit(input: {
  portfolioState: unknown;
  reservationId: string | null;
}): Record<string, unknown> | null {
  if (!isRecord(input.portfolioState) || !Array.isArray(input.portfolioState['owned_units'])) {
    return null;
  }

  const ownedUnits = input.portfolioState['owned_units'];
  return (
    ownedUnits.find(
      (candidate) =>
        isRecord(candidate) &&
        input.reservationId !== null &&
        readString(candidate['reservation_id']) === input.reservationId,
    ) ?? readFirstRecordFromArray(ownedUnits)
  );
}

function appendActiveReservationsXml(input: {
  lines: string[];
  portfolioState: unknown;
}): void {
  const reservations = readPortfolioReservations(input.portfolioState);
  if (reservations.length === 0) {
    return;
  }

  input.lines.push('  <active_reservations>');
  for (const reservation of reservations) {
    const reservationId = readString(reservation['reservation_id']);
    const ownedUnit = readReservationOwnedUnit({
      portfolioState: input.portfolioState,
      reservationId,
    });
    input.lines.push(
      `    <reservation${reservationId ? ` reservation_id="${escapeXml(reservationId)}"` : ''}>`,
    );
    const purpose = readString(reservation['purpose']);
    if (purpose) {
      input.lines.push(`      <purpose>${escapeXml(purpose)}</purpose>`);
    }
    const controlPath = readString(reservation['control_path']);
    if (controlPath) {
      input.lines.push(`      <control_path>${escapeXml(controlPath)}</control_path>`);
    }
    const rootAsset = isRecord(ownedUnit) ? readString(ownedUnit['root_asset']) : null;
    if (rootAsset) {
      input.lines.push(`      <root_asset>${escapeXml(rootAsset)}</root_asset>`);
    }
    const quantity = isRecord(ownedUnit) ? readString(ownedUnit['quantity']) : null;
    if (quantity) {
      input.lines.push(`      <quantity>${escapeXml(quantity)}</quantity>`);
    }
    input.lines.push('    </reservation>');
  }
  input.lines.push('  </active_reservations>');
  input.lines.push(
    '  <reservation_planning_guidance>When active_reservations are surfaced for lending.supply, they define the maximum reservation-backed supply quantity even if wallet_contents is larger.</reservation_planning_guidance>',
  );
}

function buildFallbackExecutionContextXml(state: EmberLendingLifecycleState): string[] {
  const lines = ['<ember_lending_execution_context freshness="cached">'];
  lines.push(`  <generated_at>${escapeXml(new Date().toISOString())}</generated_at>`);
  if (state.lastSharedEmberRevision !== null) {
    lines.push(
      `  <shared_ember_revision>${escapeXml(state.lastSharedEmberRevision.toString())}</shared_ember_revision>`,
    );
  }
  lines.push(`  <network>${escapeXml(readStateNetwork(state) ?? SHARED_EMBER_NETWORK)}</network>`);

  if (state.mandateRef) {
    lines.push(`  <mandate_ref>${escapeXml(state.mandateRef)}</mandate_ref>`);
  }

  appendMandateContextXml(lines, state.mandateContext);

  if (state.walletAddress) {
    lines.push(`  <subagent_wallet_address>${state.walletAddress}</subagent_wallet_address>`);
  }

  if (state.rootUserWalletAddress) {
    lines.push(
      `  <root_user_wallet_address>${state.rootUserWalletAddress}</root_user_wallet_address>`,
    );
  }
  appendWalletOwnershipGuidanceXml(lines);
  appendActiveReservationsXml({
    lines,
    portfolioState: state.lastPortfolioState,
  });

  appendCurrentCandidatePlanXml({
    lines,
    state,
  });
  appendActivePositionScopesXml({
    lines,
    scopes: readPortfolioActivePositionScopes(state.lastPortfolioState),
  });
  appendWalletContentsXml({
    lines,
    walletContents:
      isRecord(state.lastPortfolioState) && Array.isArray(state.lastPortfolioState['wallet_contents'])
        ? state.lastPortfolioState['wallet_contents']
        : [],
  });

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
  const mergedExecutionPortfolioState = mergePortfolioStateWithExecutionContext({
    portfolioState: input.executionContext,
    executionContext: input.executionContext,
    fallbackPortfolioState: input.state.lastPortfolioState,
  });
  const lines = ['<ember_lending_execution_context freshness="live">'];
  lines.push(`  <generated_at>${escapeXml(generatedAt)}</generated_at>`);
  if (input.state.lastSharedEmberRevision !== null) {
    lines.push(
      `  <shared_ember_revision>${escapeXml(input.state.lastSharedEmberRevision.toString())}</shared_ember_revision>`,
    );
  }

  const mandateRef = readString(input.executionContext.mandate_ref);
  if (mandateRef) {
    lines.push(`  <mandate_ref>${escapeXml(mandateRef)}</mandate_ref>`);
  }

  appendMandateContextXml(
    lines,
    (isRecord(input.executionContext.mandate_context)
      ? input.executionContext.mandate_context
      : null) ?? input.state.mandateContext,
  );

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
  appendWalletOwnershipGuidanceXml(lines);

  lines.push(`  <network>${escapeXml(network)}</network>`);
  appendActiveReservationsXml({
    lines,
    portfolioState: mergedExecutionPortfolioState,
  });
  appendCurrentCandidatePlanXml({
    lines,
    state: input.state,
  });
  appendActivePositionScopesXml({
    lines,
    scopes: selectPreferredActivePositionScopesForContext({
      rawPortfolioState: input.executionContext,
      hydratedPortfolioState: input.state.lastPortfolioState,
    }),
  });
  appendWalletContentsXml({
    lines,
    walletContents:
      input.executionContext.wallet_contents ??
      (isRecord(input.state.lastPortfolioState) ? input.state.lastPortfolioState['wallet_contents'] : []),
  });

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
  const payloadBuilderOutput = readRecordKey(candidatePlan, 'payload_builder_output');
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
  'position.enter',
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

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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

function mergeRecordWithFallback(input: {
  primary: Record<string, unknown>;
  fallback: Record<string, unknown>;
}): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...input.fallback,
    ...input.primary,
  };

  for (const [key, fallbackValue] of Object.entries(input.fallback)) {
    const primaryValue = input.primary[key];
    if (isRecord(fallbackValue) && isRecord(primaryValue)) {
      merged[key] = {
        ...fallbackValue,
        ...primaryValue,
      };
    }
  }

  return merged;
}

function mergeContextRecords(input: {
  primary: unknown;
  fallback: Record<string, unknown>[];
  idKey: string;
}): Record<string, unknown>[] {
  if (!Array.isArray(input.primary)) {
    return [];
  }

  const fallbackById = new Map<string, Record<string, unknown>>();
  for (const candidate of input.fallback) {
    const recordId = readString(candidate[input.idKey]);
    if (recordId) {
      fallbackById.set(recordId, candidate);
    }
  }

  return input.primary
    .filter((candidate): candidate is Record<string, unknown> => isRecord(candidate))
    .map((candidate) => {
      const recordId = readString(candidate[input.idKey]);
      if (!recordId) {
        return candidate;
      }

      const fallbackCandidate = fallbackById.get(recordId);
      return fallbackCandidate
        ? mergeRecordWithFallback({
            primary: candidate,
            fallback: fallbackCandidate,
          })
        : candidate;
    });
}

function readExplicitContextRecords(input: {
  context: unknown;
  key: string;
}):
  | {
      status: 'missing';
    }
  | {
      status: 'present';
      records: Record<string, unknown>[];
    } {
  if (!isRecord(input.context) || !Object.prototype.hasOwnProperty.call(input.context, input.key)) {
    return {
      status: 'missing',
    };
  }

  const value = input.context[input.key];
  if (!Array.isArray(value)) {
    return {
      status: 'present',
      records: [],
    };
  }

  return {
    status: 'present',
    records: value.filter((candidate): candidate is Record<string, unknown> => isRecord(candidate)),
  };
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

  return reservations.length === 1 ? reservations[0] ?? null : null;
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
    return 'position.enter';
  }

  return null;
}

function inferIntentFromControlPath(controlPath: string | null): string | null {
  switch (controlPath) {
    case 'lending.withdraw':
    case 'lending.repay':
      return 'decrease';
    case 'lending.borrow':
      return 'increase';
    case 'lending.supply':
      return 'position.enter';
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

  return 'position.enter';
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
  return managedMandate?.lending_policy.collateral_policy.assets[0]?.asset ?? null;
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

    return 'Portfolio Manager onboarding is not complete for this thread because Shared Ember has not reserved capital for the managed lending position yet.';
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
  if (input.fallbackStatusMessage !== PLANNING_PM_ONBOARDING_BLOCKED_MESSAGE) {
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

function readSemanticQuantityInput(value: unknown): SemanticQuantity | null {
  if (!isRecord(value)) {
    return null;
  }

  const kind = readString(value['kind']);
  if (kind === 'exact') {
    const exactValue = readString(value['value']);
    return exactValue ? { kind: 'exact', value: exactValue } : null;
  }

  if (kind === 'percent') {
    const percentValue = readFiniteNumber(value['value']);
    return percentValue && percentValue > 0 && percentValue <= 100
      ? {
          kind: 'percent',
          value: percentValue,
        }
      : null;
  }

  return null;
}

function readJsonObjectInput(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) {
    return value;
  }

  const serialized = readString(value)?.trim();
  if (!serialized) {
    return null;
  }

  const parseCandidates = [serialized];
  const fencedJsonMatch = serialized.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedJsonMatch?.[1]) {
    parseCandidates.unshift(fencedJsonMatch[1].trim());
  }

  for (const candidate of parseCandidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (isRecord(parsed)) {
        return parsed;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function isSemanticTransactionControlPath(
  value: string,
): value is SemanticTransactionRequest['control_path'] {
  return (
    value === 'lending.supply' ||
    value === 'lending.withdraw' ||
    value === 'lending.borrow' ||
    value === 'lending.repay'
  );
}

function readSemanticTransactionRequestBlockedMessage(value: unknown): string {
  const input = readJsonObjectInput(value);
  if (!input) {
    return CREATE_TRANSACTION_INPUT_BLOCKED_MESSAGE;
  }

  const controlPath = readString(input['control_path']);
  if (controlPath && !isSemanticTransactionControlPath(controlPath)) {
    return CREATE_TRANSACTION_CONTROL_PATH_BLOCKED_MESSAGE;
  }

  return CREATE_TRANSACTION_INPUT_BLOCKED_MESSAGE;
}

function readSemanticTransactionRequestInput(value: unknown): SemanticTransactionRequest | null {
  const input = readJsonObjectInput(value);
  if (!input) {
    return null;
  }

  const controlPath = readString(input['control_path']);
  const asset = readString(input['asset']);
  const protocolSystem = readString(input['protocol_system']);
  const network = readString(input['network']);
  const quantity = readSemanticQuantityInput(input['quantity']);

  if (
    !controlPath ||
    !isSemanticTransactionControlPath(controlPath) ||
    !asset ||
    !protocolSystem ||
    !network ||
    !quantity
  ) {
    return null;
  }

  return {
    control_path: controlPath,
    asset,
    protocol_system: protocolSystem,
    network,
    quantity,
  };
}

function resolveManagedPlanningReadiness(input: {
  state: EmberLendingLifecycleState;
  operationInput: unknown;
}): ManagedPlanningReadiness {
  if (
    !hasPortfolioManagerPlanningIdentity(input.state) ||
    !hasConnectReadyEmberLendingRuntimeProjection(input.state)
  ) {
    return {
      status: 'blocked',
      statusMessage: PLANNING_PM_ONBOARDING_BLOCKED_MESSAGE,
      reason: 'onboarding',
    };
  }

  const request = readSemanticTransactionRequestInput(input.operationInput);
  if (!request) {
    return {
      status: 'blocked',
      statusMessage: readSemanticTransactionRequestBlockedMessage(input.operationInput),
      reason: 'invalid_request',
    };
  }

  return {
    status: 'ready',
    request,
  };
}

function readManagedActionVerb(controlPath: string | null, intent: string): string {
  const pathAction = controlPath?.split('.').at(-1)?.trim().toLowerCase();
  if (pathAction) {
    return pathAction;
  }

  return intent === 'position.enter' ? 'enter' : intent;
}

function formatDisplayLabel(value: string): string {
  return value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function formatSemanticQuantitySummary(quantity: unknown): string | null {
  const semanticQuantity = readSemanticQuantityInput(quantity);
  if (!semanticQuantity) {
    return null;
  }

  return semanticQuantity.kind === 'percent'
    ? `${semanticQuantity.value}%`
    : semanticQuantity.value;
}

function buildFallbackActionSummary(input: {
  source: Record<string, unknown>;
  state: EmberLendingLifecycleState;
  intent: string;
}): string {
  const portfolioState = isRecord(input.state.lastPortfolioState) ? input.state.lastPortfolioState : null;
  const reservation = readPortfolioReservationForSource(portfolioState, input.source);
  const ownedUnit = portfolioState ? readPortfolioOwnedUnit(portfolioState) : null;
  const quantity =
    formatSemanticQuantitySummary(input.source['quantity']) ?? readString(input.source['amount']) ?? null;
  const asset = readString(input.source['asset']) ?? readString(ownedUnit?.['root_asset']) ?? 'capital';
  const protocol =
    readString(input.source['protocol_system']) ??
    readString(input.source['protocol']) ??
    (isRecord(input.state.mandateContext) ? readString(input.state.mandateContext['protocol']) : null);
  const controlPath = readString(input.source['control_path']) ?? readString(reservation?.['control_path']);
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
      return 'rebalance reserved capital within the approved lending position';
    case 'increase':
      return 'increase the current lending position within the approved lending position';
    case 'decrease':
      return 'decrease the current lending position within the approved lending position';
    case 'transfer':
      return 'transfer reserved capital within the approved managed flow';
    default:
      return 'supply reserved capital into the approved lending position';
  }
}

function buildManagedSubagentDecisionContext(input: {
  source: Record<string, unknown>;
  state: EmberLendingLifecycleState;
  intent: string;
}): Record<string, unknown> {
  const sourceDecisionContext =
    'decision_context' in input.source && isRecord(input.source['decision_context'])
      ? input.source['decision_context']
      : null;

  return {
    objective_summary:
      readString(sourceDecisionContext?.['objective_summary']) ??
      buildFallbackObjectiveSummary(input.intent),
    accounting_state_summary:
      readString(sourceDecisionContext?.['accounting_state_summary']) ??
      input.state.lastReservationSummary ??
      'Reserved capital is hydrated for the managed lending position.',
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

function buildCreateTransactionIdempotencyKey(input: {
  threadId: string;
  semanticRequest: SemanticTransactionRequest;
}): string {
  return `idem-create-transaction-${input.threadId}-${buildStableCommandSuffix(input.semanticRequest)}:${crypto.randomUUID()}`;
}

function buildRequestExecutionIdempotencyKey(input: {
  threadId: string;
  transactionPlanId: string;
}): string {
  return `idem-request-execution-${input.threadId}-${buildStableCommandSuffix({
    transactionPlanId: input.transactionPlanId,
  })}`;
}

function buildCreateTransactionRequest(input: {
  state: EmberLendingLifecycleState;
  operationInput: unknown;
}): SemanticTransactionRequest | null {
  const planningReadiness = resolveManagedPlanningReadiness({
    state: input.state,
    operationInput: input.operationInput,
  });

  return planningReadiness.status === 'ready' ? planningReadiness.request : null;
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

  const commandInput = readJsonObjectInput(input.operationInput) ?? {};
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
    'semantic_request',
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
  | 'mandateContext'
  | 'walletAddress'
  | 'rootUserWalletAddress'
  | 'rootedWalletContextId'
  | 'lastReservationSummary'
> {
  const projection = mergePortfolioProjection(state, portfolioState);

  return {
    mandateRef: projection.mandateRef ?? state.mandateRef,
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
  requestRedelegationRefresh?: (input: {
    rootWalletAddress: string;
    threadId: string;
    transactionPlanId: string;
    requestId: string;
  }) => Promise<void>;
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
      id: `shared-ember-${input.threadId}-request-execution`,
      method: 'subagent.requestExecution.v1',
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
        id: `shared-ember-${input.threadId}-request-execution`,
        method: 'subagent.requestExecution.v1',
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
      if (currentProgress !== null && input.currentState.rootUserWalletAddress) {
        try {
          await input.requestRedelegationRefresh?.({
            rootWalletAddress: input.currentState.rootUserWalletAddress,
            threadId: input.threadId,
            transactionPlanId: input.transactionPlanId,
            requestId,
          });
        } catch {
          // Best-effort PM-side redelegation should not block the existing wait path.
        }
      }
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
              id: `shared-ember-${input.threadId}-request-execution`,
              method: 'subagent.requestExecution.v1',
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
  const commandInput = readJsonObjectInput(operationInput);
  if (commandInput && 'result' in commandInput) {
    return commandInput['result'];
  }

  return commandInput ?? operationInput;
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
          name: 'create_transaction',
          description:
            'Create or refresh a candidate transaction plan for the managed lending position. Reason from mandate_context, wallet_contents, active_position_scopes, active_reservations, and the current candidate plan. mandate_context is the exact managed mandate policy envelope; use wallet_contents, active_position_scopes, active_reservations, and the current candidate plan for live quantities and values. wallet_contents and active_position_scopes describe rooted user wallet context, not balances held in subagent_wallet_address. active_reservations surface the current reservation-backed execution envelope. When active_reservations are surfaced for lending.supply, use that reservation-backed quantity instead of the full idle wallet amount. subagent_wallet_address is the dedicated execution wallet and only reflects balances explicitly surfaced for that wallet. Keep the action families distinct: lending.supply adds collateral, lending.withdraw removes collateral, lending.borrow increases debt, and lending.repay pays down debt. Do not answer a repay request with a supply plan, do not answer a withdraw request with a repay or supply plan, and do not answer a borrow request with a collateral-add plan. When the user asks to create, refresh, or retry a plan, call this tool in the current turn instead of only describing the last plan. Pass JSON with control_path, asset, protocol_system, network, and quantity. control_path must be one of lending.supply, lending.withdraw, lending.borrow, or lending.repay; never pass a position-scope id there. quantity must be either { "kind": "exact", "value": "3" } or { "kind": "exact", "value": "1.25" } using asset-unit decimal strings, or { "kind": "percent", "value": 50 } using percent of the relevant base for that action. asset is the actionable observed asset; active_position_scopes expose economic_exposures when the asset is a wrapper or synthetic token.',
        },
        {
          name: 'request_execution',
          description:
            'Request admission and execution for the current lending transaction plan through the bounded Shared Ember surface. When the user asks to execute the current plan, call this tool in the current turn instead of only describing the plan or speculating about the outcome. If current_candidate_plan is present, treat that as enough context to attempt execution now.',
        },
        {
          name: 'create_escalation_request',
          description: 'Create a bounded escalation request when the managed lending position cannot proceed locally.',
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
          rootedWalletContextId: currentState.rootedWalletContextId,
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
        case 'create_transaction': {
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
          let semanticRequest = buildCreateTransactionRequest({
            state: planningState,
            operationInput: operation.input,
          });
          if (planningReadiness.status === 'blocked' && planningReadiness.reason === 'onboarding') {
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
            semanticRequest = buildCreateTransactionRequest({
              state: planningState,
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
          if (!semanticRequest) {
            return {
              state: planningState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    readSemanticTransactionRequestBlockedMessage(operation.input),
                },
              },
            };
          }

          const idempotencyKey = buildCreateTransactionIdempotencyKey({
            threadId,
            semanticRequest,
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
                id: `shared-ember-${threadId}-create-transaction`,
                method: 'subagent.createTransaction.v1',
                params: {
                  idempotency_key: idempotencyKey,
                  expected_revision: expectedRevision,
                  agent_id: agentId,
                  ...(planningState.rootedWalletContextId
                    ? {
                        rooted_wallet_context_id: planningState.rootedWalletContextId,
                      }
                    : {}),
                  request: semanticRequest,
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
              semanticRequest.quantity.kind === 'percent' &&
              semanticRequest.quantity.value === 100,
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
        case 'request_execution': {
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

          const idempotencyKey = buildRequestExecutionIdempotencyKey({
            threadId,
            transactionPlanId,
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
                    requestRedelegationRefresh: options.requestRedelegationRefresh,
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

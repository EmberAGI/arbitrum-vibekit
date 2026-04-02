import type { AgentRuntimeDomainConfig } from 'agent-runtime';

export type EmberLendingSharedEmberProtocolHost = {
  handleJsonRpc: (input: unknown) => Promise<unknown>;
  readCommittedEventOutbox: (input: unknown) => Promise<unknown>;
  acknowledgeCommittedEventOutbox: (input: unknown) => Promise<unknown>;
};

export type EmberLendingExecutionSigner = {
  signRedelegationPackage?: (input: {
    walletAddress: `0x${string}`;
    transactionPlanId: string;
    requestId: string;
    redelegationSigningPackage: Record<string, unknown>;
  }) => Promise<{
    signer_wallet_address?: string;
    signed_redelegation?: Record<string, unknown>;
  }>;
  signExecutionPackage: (input: {
    walletAddress: `0x${string}`;
    transactionPlanId: string;
    requestId: string;
    executionSigningPackage: Record<string, unknown>;
  }) => Promise<{
    signer_wallet_address?: string;
    signer_address?: string;
    raw_transaction?: string;
  }>;
};

export const EMBER_LENDING_INTERNAL_HYDRATE_COMMAND = 'hydrate_runtime_projection';

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
  lastExecutionResult: unknown;
  lastExecutionTxHash: `0x${string}` | null;
  pendingExecutionSubmission?: PendingExecutionSubmission | null;
  lastEscalationRequest: unknown;
  lastEscalationSummary: string | null;
};

type CreateEmberLendingDomainOptions = {
  protocolHost?: EmberLendingSharedEmberProtocolHost;
  executionSigner?: EmberLendingExecutionSigner;
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
  owned_units?: Array<{
    unit_id?: string;
    root_asset?: string;
    amount?: string;
    benchmark_value_usd?: string;
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

const DIRECT_HIRE_MESSAGE =
  'Use the portfolio manager to onboard and activate the managed lending agent.';
const DIRECT_FIRE_MESSAGE =
  'Use the portfolio manager to deactivate the managed lending agent.';
const SHARED_EMBER_NETWORK = 'arbitrum';
const MAX_PREPARE_TRANSACTION_ATTEMPTS = 3;

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
    lastExecutionResult: null,
    lastExecutionTxHash: null,
    pendingExecutionSubmission: null,
    lastEscalationRequest: null,
    lastEscalationSummary: null,
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
    rootedWalletContextId: null,
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

export function hasEmberLendingRuntimeProjection(state: unknown): boolean {
  if (!isRecord(state)) {
    return false;
  }

  return (
    readString(state['mandateRef']) !== null ||
    readHexAddress(state['walletAddress']) !== null ||
    readHexAddress(state['rootUserWalletAddress']) !== null ||
    readString(state['rootedWalletContextId']) !== null ||
    readString(state['lastReservationSummary']) !== null ||
    hasManagedPortfolioProjection(state['lastPortfolioState'])
  );
}

function readStateNetwork(state: EmberLendingLifecycleState): string | null {
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

  if (Array.isArray(input.executionContext.owned_units) && input.executionContext.owned_units.length > 0) {
    lines.push('  <owned_units>');
    for (const ownedUnit of input.executionContext.owned_units) {
      const unitId = readString(ownedUnit.unit_id);
      lines.push(`    <owned_unit${unitId ? ` unit_id="${escapeXml(unitId)}"` : ''}>`);

      const rootAsset = readString(ownedUnit.root_asset);
      if (rootAsset) {
        lines.push(`      <root_asset>${escapeXml(rootAsset)}</root_asset>`);
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

  if (phase === 'completed' && status === 'confirmed') {
    return {
      executionStatus: 'completed',
      statusMessage: 'Lending transaction execution confirmed through Shared Ember.',
    };
  }

  if (phase === 'completed' && status === 'submitted') {
    return {
      executionStatus: 'completed',
      statusMessage: 'Lending transaction submitted through Shared Ember.',
    };
  }

  if (phase === 'completed' && status === 'failed_before_submission') {
    return {
      executionStatus: 'failed',
      statusMessage: 'Lending transaction failed before submission through Shared Ember.',
    };
  }

  if (phase === 'completed' && status === 'failed_after_submission') {
    return {
      executionStatus: 'failed',
      statusMessage: 'Lending transaction failed after submission through Shared Ember.',
    };
  }

  if (phase === 'completed' && status === 'partial_settlement') {
    return {
      executionStatus: 'failed',
      statusMessage: 'Lending transaction reached partial settlement through Shared Ember.',
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

function readRedelegationSigningPackage(
  preparationResult: unknown,
): Record<string, unknown> | null {
  return readRecordKey(preparationResult, 'redelegation_signing_package');
}

function readPreparedExecutionWalletAddress(
  executionResult: unknown,
): `0x${string}` | null {
  const executionPreparation = readExecutionPreparation(executionResult);
  return readHexAddress(executionPreparation?.['agent_wallet']);
}

function readPreparedRedelegationWalletAddress(
  executionResult: unknown,
): `0x${string}` | null {
  const redelegationSigningPackage = readRedelegationSigningPackage(executionResult);
  return (
    readHexAddress(redelegationSigningPackage?.['agent_wallet']) ??
    readPreparedExecutionWalletAddress(executionResult)
  );
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

function hasRedelegationSigningPreparation(
  executionResult: unknown,
): executionResult is Record<string, unknown> {
  return (
    isRecord(executionResult) &&
    readString(executionResult['phase']) === 'ready_for_redelegation' &&
    readString(executionResult['request_id']) !== null &&
    readString(executionResult['transaction_plan_id']) !== null &&
    readExecutionPreparation(executionResult) !== null &&
    readRedelegationSigningPackage(executionResult) !== null
  );
}

function readSignerWalletAddress(result: unknown): `0x${string}` | null {
  if (!isRecord(result)) {
    return null;
  }

  return readHexAddress(result['signer_wallet_address']) ?? readHexAddress(result['signer_address']);
}

async function registerSignedRedelegation(input: {
  protocolHost: EmberLendingSharedEmberProtocolHost;
  threadId: string;
  agentId: string;
  currentRevision: number | null;
  transactionPlanId: string;
  requestId: string;
  idempotencyKey: string;
  signedRedelegation: Record<string, unknown>;
}): Promise<{
  revision: number | null;
  committedEventIds: string[];
  executionResult: unknown;
}> {
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
      id: `shared-ember-${input.threadId}-register-signed-redelegation`,
      method: 'orchestrator.registerSignedRedelegation.v1',
      params: {
        idempotency_key: `${input.idempotencyKey}:register-redelegation:${input.requestId}`,
        expected_revision: expectedRevision,
        transaction_plan_id: input.transactionPlanId,
        signed_redelegation: input.signedRedelegation,
      },
    }),
  });

  return {
    revision: response.result?.revision ?? null,
    committedEventIds: response.result?.committed_event_ids ?? [],
    executionResult: response.result?.execution_result ?? null,
  };
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
        idempotency_key: `${input.idempotencyKey}:submit-transaction:${input.requestId}`,
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

  const matchingEvent = (outboxPage.events ?? [])
    .map((event) => readCommittedEvent(event))
    .filter((event): event is SharedEmberCommittedEvent => event !== null)
    .filter(
      (event) =>
        event.aggregate === 'request' &&
        event.aggregate_id === input.requestId &&
        (event.event_type === 'requestExecution.submitted.v1' ||
          event.event_type === 'requestExecution.completed.v1'),
    )
    .sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0))
    .at(-1);

  if (!matchingEvent) {
    return null;
  }

  const status = readString(matchingEvent.payload?.['status']);
  const executionId = readString(matchingEvent.payload?.['execution_id']);
  const transactionHash = readHexAddress(matchingEvent.payload?.['transaction_hash']);
  const transactionPlanId = readString(matchingEvent.payload?.['transaction_plan_id']);
  const requestId = readString(matchingEvent.payload?.['request_id']);

  if (!status || !transactionPlanId || !requestId) {
    return null;
  }

  return {
    revision: outboxPage.revision ?? null,
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

function buildManagedSubagentDecisionContext(input: {
  source: Record<string, unknown>;
  mandateSummary: string | null;
}): Record<string, unknown> | null {
  const decisionContext =
    'decision_context' in input.source && isRecord(input.source['decision_context'])
      ? {
          ...input.source['decision_context'],
        }
      : {};
  if (input.mandateSummary) {
    decisionContext['mandate_summary'] = input.mandateSummary;
  }

  return Object.keys(decisionContext).length > 0 ? decisionContext : null;
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
  const handoff: Record<string, unknown> = {
    handoff_id: readString(commandInput['handoff_id']) ?? `handoff-${input.threadId}`,
    ...base,
  };
  for (const key of [
    'intent',
    'action_summary',
    'candidate_unit_ids',
    'requested_quantities',
  ] as const) {
    if (key in commandInput) {
      handoff[key] = commandInput[key];
    }
  }

  const decisionContext = buildManagedSubagentDecisionContext({
    source: commandInput,
    mandateSummary: input.state.mandateSummary,
  });
  if (decisionContext) {
    handoff['decision_context'] = decisionContext;
  }

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

  const handoff: Record<string, unknown> = {
    handoff_id: readString(source['handoff_id']) ?? `handoff-${input.threadId}`,
    ...base,
  };
  for (const key of [
    'intent',
    'action_summary',
    'candidate_unit_ids',
    'requested_quantities',
    'payload_builder_output',
  ] as const) {
    if (key in source) {
      handoff[key] = source[key];
    }
  }

  const decisionContext = buildManagedSubagentDecisionContext({
    source,
    mandateSummary: input.state.mandateSummary,
  });
  if (decisionContext) {
    handoff['decision_context'] = decisionContext;
  }

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

async function runPreparedExecutionFlow(input: {
  protocolHost: EmberLendingSharedEmberProtocolHost;
  executionSigner?: EmberLendingExecutionSigner;
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
        idempotency_key: input.idempotencyKey,
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
          idempotency_key: input.idempotencyKey,
          expected_revision: expectedRevision,
          transaction_plan_id: input.transactionPlanId,
        },
      }),
    });
    committedEventIds.push(...(requestResponse.result?.committed_event_ids ?? []));
    executionResult = requestResponse.result?.execution_result ?? null;
  }

  if (hasRedelegationSigningPreparation(executionResult)) {
    const preparedWalletAddress = readPreparedRedelegationWalletAddress(executionResult);
    if (!input.currentState.walletAddress || !preparedWalletAddress) {
      throw new LocalExecutionFailureError(
        'Lending redelegation signing could not continue because the dedicated subagent wallet identity is incomplete.',
        requestResponse.result?.revision ?? null,
      );
    }
    if (preparedWalletAddress !== input.currentState.walletAddress) {
      throw new LocalExecutionFailureError(
        'Lending redelegation signing could not continue because the prepared signing package does not match the dedicated subagent wallet.',
        requestResponse.result?.revision ?? null,
      );
    }
    if (!input.executionSigner?.signRedelegationPackage) {
      throw new LocalExecutionFailureError(
        'Local OWS signer is not configured for lending transaction execution.',
        requestResponse.result?.revision ?? null,
      );
    }

    const requestId = readString(executionResult['request_id']);
    const signedRedelegation = await input.executionSigner.signRedelegationPackage({
      walletAddress: input.currentState.walletAddress,
      transactionPlanId: input.transactionPlanId,
      requestId: requestId!,
      redelegationSigningPackage: readRedelegationSigningPackage(executionResult)!,
    });

    const signerWalletAddress = readSignerWalletAddress(signedRedelegation);
    if (!signerWalletAddress || signerWalletAddress !== input.currentState.walletAddress) {
      throw new LocalExecutionFailureError(
        'Lending redelegation signing could not continue because the local signer did not confirm the dedicated subagent wallet identity.',
        requestResponse.result?.revision ?? null,
      );
    }

    const signedRedelegationRecord = readRecordKey(signedRedelegation, 'signed_redelegation');
    if (!signedRedelegationRecord) {
      throw new LocalExecutionFailureError(
        'Lending redelegation signing could not continue because the local signer did not return a signed redelegation payload.',
        requestResponse.result?.revision ?? null,
      );
    }

    const redelegationResponse = await registerSignedRedelegation({
      protocolHost: input.protocolHost,
      threadId: input.threadId,
      agentId: input.agentId,
      currentRevision: requestResponse.result?.revision ?? null,
      transactionPlanId: input.transactionPlanId,
      requestId: requestId!,
      idempotencyKey: input.idempotencyKey,
      signedRedelegation: signedRedelegationRecord,
    });

    committedEventIds.push(...redelegationResponse.committedEventIds);
    executionResult = redelegationResponse.executionResult;
    requestResponse = {
      result: {
        revision: redelegationResponse.revision ?? undefined,
      },
    };
  }

  if (!hasExecutionSigningPreparation(executionResult)) {
    return {
      revision: requestResponse.result?.revision ?? null,
      committedEventIds,
      executionResult,
    };
  }

  const preparedWalletAddress = readPreparedExecutionWalletAddress(executionResult);
  if (!input.currentState.walletAddress || !preparedWalletAddress) {
    throw new LocalExecutionFailureError(
      'Lending execution signing could not continue because the dedicated subagent wallet identity is incomplete.',
      requestResponse.result?.revision ?? null,
    );
  }
  if (preparedWalletAddress !== input.currentState.walletAddress) {
    throw new LocalExecutionFailureError(
      'Lending execution signing could not continue because the prepared signing package does not match the dedicated subagent wallet.',
      requestResponse.result?.revision ?? null,
    );
  }

  const requestId = readString(executionResult['request_id']);
  if (!input.executionSigner) {
    throw new LocalExecutionFailureError(
      'Local OWS signer is not configured for lending transaction execution.',
      requestResponse.result?.revision ?? null,
    );
  }
  const signedExecution = await input.executionSigner.signExecutionPackage({
    walletAddress: input.currentState.walletAddress,
    transactionPlanId: input.transactionPlanId,
    requestId: requestId!,
    executionSigningPackage: readExecutionSigningPackage(executionResult)!,
  });

  const signerWalletAddress = readSignerWalletAddress(signedExecution);
  if (!signerWalletAddress || signerWalletAddress !== input.currentState.walletAddress) {
    throw new LocalExecutionFailureError(
      'Lending execution signing could not continue because the local signer did not confirm the dedicated subagent wallet identity.',
      requestResponse.result?.revision ?? null,
    );
  }

  const signerAddress = readHexAddress(signedExecution.signer_address) ?? signerWalletAddress;
  const rawTransaction = readString(signedExecution.raw_transaction);
  if (!signerAddress || !rawTransaction) {
    throw new LocalExecutionFailureError(
      'Lending execution signing could not continue because the local signer did not return a signed transaction payload.',
      requestResponse.result?.revision ?? null,
    );
  }

  const signedTransaction = {
    ...readExecutionSigningPackage(executionResult)!,
    signer_address: signerAddress,
    raw_transaction: rawTransaction,
  };

  const submitResponse = await submitSignedTransaction({
    protocolHost: input.protocolHost,
    threadId: input.threadId,
    agentId: input.agentId,
    currentRevision: requestResponse.result?.revision ?? null,
    transactionPlanId: input.transactionPlanId,
    requestId: requestId!,
    idempotencyKey: input.idempotencyKey,
    signedTransaction,
  }).catch((error: unknown) => {
    if (!(error instanceof Error)) {
      throw error;
    }

    throw new PendingExecutionSubmissionError(error.message, requestResponse.result?.revision ?? null, {
      transactionPlanId: input.transactionPlanId,
      requestId: requestId!,
      idempotencyKey: input.idempotencyKey,
      signedTransaction,
      revision: requestResponse.result?.revision ?? null,
    });
  });

  return {
    revision: submitResponse.revision,
    committedEventIds: [
      ...committedEventIds,
      ...submitResponse.committedEventIds,
    ],
    executionResult: submitResponse.executionResult,
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
  const agentId = options.agentId ?? 'ember-lending';

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
          description: 'Create or refresh a candidate transaction plan for the managed lending lane.',
        },
        {
          name: 'request_transaction_execution',
          description:
            'Request admission and execution for the current lending transaction plan through the bounded Shared Ember surface.',
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
      const currentState = state ?? buildDefaultLifecycleState();
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
      const currentState = state ?? buildDefaultLifecycleState();

      switch (operation.name) {
        case EMBER_LENDING_INTERNAL_HYDRATE_COMMAND: {
          if (!options.protocolHost) {
            return {
              state: currentState,
              outputs: {},
            };
          }

          const response = (await options.protocolHost.handleJsonRpc({
            jsonrpc: '2.0',
            id: `shared-ember-${threadId}-hydrate-runtime-projection`,
            method: 'subagent.readPortfolioState.v1',
            params: {
              agent_id: agentId,
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
              protocolHost: options.protocolHost,
              threadId,
              agentId,
            });
          } catch {
            executionContextEnvelope = null;
          }

          const portfolioProjection = mergePortfolioProjection(currentState, portfolioState);
          const stateWithPortfolioProjection: EmberLendingLifecycleState = {
            ...currentState,
            ...portfolioProjection,
          };
          const projection = mergeExecutionContextProjection(
            stateWithPortfolioProjection,
            executionContextEnvelope?.executionContext ?? null,
          );
          const nextState: EmberLendingLifecycleState = {
            ...currentState,
            ...projection,
            phase:
              hasManagedPortfolioProjection(portfolioState) ||
              hasManagedExecutionContextProjection(executionContextEnvelope?.executionContext ?? null)
                ? 'active'
                : currentState.phase,
            lastPortfolioState: portfolioState,
            lastSharedEmberRevision: mergeKnownRevision(
              response.result?.revision ?? null,
              executionContextEnvelope?.revision ?? null,
            ),
          };

          return {
            state: nextState,
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
                    portfolioState,
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

          const handoff = buildTransactionPlanningHandoff({
            state: currentState,
            threadId,
            agentId,
            operationInput: operation.input,
          });
          if (!handoff) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Lending runtime context is incomplete. Wait for execution-context hydration before planning.',
                },
              },
            };
          }

          const idempotencyKey =
            readStringKey(operation.input, 'idempotencyKey') ??
            `idem-create-transaction-plan-${threadId}`;
          const response = await runSharedEmberCommandWithResolvedRevision<{
            result?: {
              revision?: number;
              committed_event_ids?: string[];
              candidate_plan?: unknown;
            };
          }>({
            protocolHost: options.protocolHost,
            threadId,
            agentId,
            currentRevision: currentState.lastSharedEmberRevision,
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

          const candidatePlan = response.result?.candidate_plan ?? null;
          const nextState: EmberLendingLifecycleState = {
            ...currentState,
            phase: 'active',
            lastSharedEmberRevision: response.result?.revision ?? null,
            lastCandidatePlan: candidatePlan,
            lastCandidatePlanSummary: readCandidatePlanSummary(candidatePlan),
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

          const idempotencyKey =
            readStringKey(operation.input, 'idempotencyKey') ??
            `idem-execute-transaction-plan-${threadId}`;
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
                    executionSigner: options.executionSigner,
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
          const executionPortfolioState = readExecutionPortfolioState(executionResult);
          const projection = mergePortfolioProjectionPreservingKnownContext(
            currentState,
            executionPortfolioState,
          );
          const executionStatus = readExecutionStatusMessage(executionResult);
          const nextState: EmberLendingLifecycleState = {
            ...currentState,
            ...projection,
            phase: 'active',
            lastPortfolioState: executionPortfolioState ?? currentState.lastPortfolioState,
            lastSharedEmberRevision: preparedExecutionResult.revision,
            lastExecutionResult: executionResult,
            lastExecutionTxHash: readExecutionTxHash(executionResult),
            pendingExecutionSubmission: null,
          };

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

          const handoff = buildEscalationHandoff({
            state: currentState,
            threadId,
            agentId,
            operationInput: operation.input,
          });
          if (!handoff) {
            return {
              state: currentState,
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
            ...currentState,
            phase: 'active',
            lastSharedEmberRevision: response.result?.revision ?? currentState.lastSharedEmberRevision,
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

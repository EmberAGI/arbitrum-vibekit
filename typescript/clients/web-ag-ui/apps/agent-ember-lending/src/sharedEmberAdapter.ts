import type { AgentRuntimeDomainConfig } from 'agent-runtime';

export type EmberLendingSharedEmberProtocolHost = {
  handleJsonRpc: (input: unknown) => Promise<unknown>;
  readCommittedEventOutbox: (input: unknown) => Promise<unknown>;
  acknowledgeCommittedEventOutbox: (input: unknown) => Promise<unknown>;
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
  lastEscalationRequest: unknown;
  lastEscalationSummary: string | null;
};

type CreateEmberLendingDomainOptions = {
  protocolHost?: EmberLendingSharedEmberProtocolHost;
  agentId?: string;
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
}): Promise<NonNullable<SharedEmberExecutionContext>> {
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

  return executionContext;
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
  if (!isRecord(executionResult) || !isRecord(executionResult['execution'])) {
    return null;
  }

  return readHexAddress(executionResult['execution']['transaction_hash']);
}

function readExecutionPortfolioState(executionResult: unknown): unknown {
  return isRecord(executionResult) ? executionResult['portfolio_state'] : null;
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

function readStringKey(
  input: unknown,
  key: string,
): string | null {
  return isRecord(input) ? readString(input[key]) : null;
}

function buildManagedSubagentHandoff(input: {
  state: EmberLendingLifecycleState;
  threadId: string;
  agentId: string;
  operationInput: unknown;
}): Record<string, unknown> | null {
  if (!input.state.walletAddress || !input.state.rootUserWalletAddress || !input.state.mandateRef) {
    return null;
  }

  if (input.state.walletAddress === input.state.rootUserWalletAddress) {
    return null;
  }

  const commandInput = isRecord(input.operationInput) ? input.operationInput : {};
  const explicitHandoff =
    'handoff' in commandInput && isRecord(commandInput['handoff']) ? commandInput['handoff'] : null;
  const source =
    explicitHandoff ??
    Object.fromEntries(
      Object.entries(commandInput).filter(
        ([key]) => key !== 'idempotencyKey' && key !== 'result' && key !== 'transactionPlanId',
      ),
    );

  const decisionContext =
    'decision_context' in source && isRecord(source['decision_context'])
      ? {
          ...source['decision_context'],
        }
      : {};
  if (input.state.mandateSummary) {
    decisionContext['mandate_summary'] = input.state.mandateSummary;
  }

  const handoff: Record<string, unknown> = {
    ...source,
    handoff_id: readString(source['handoff_id']) ?? `handoff-${input.threadId}`,
    agent_id: input.agentId,
    agent_wallet: input.state.walletAddress,
    root_user_wallet: input.state.rootUserWalletAddress,
    mandate_ref: input.state.mandateRef,
  };

  if (Object.keys(decisionContext).length > 0) {
    handoff['decision_context'] = decisionContext;
  }

  return handoff;
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
          executionContext,
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
          const projection = mergePortfolioProjection(currentState, portfolioState);
          const nextState: EmberLendingLifecycleState = {
            ...currentState,
            phase: hasManagedPortfolioProjection(portfolioState) ? 'active' : currentState.phase,
            ...projection,
            lastPortfolioState: portfolioState,
            lastSharedEmberRevision: response.result?.revision ?? null,
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

          const handoff = buildManagedSubagentHandoff({
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
            `idem-materialize-candidate-plan-${threadId}`;
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
              id: `shared-ember-${threadId}-materialize-candidate-plan`,
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
                statusMessage: 'Candidate lending plan materialized through Shared Ember.',
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
                    'No lending transaction plan is available to execute. Materialize a candidate plan first.',
                },
              },
            };
          }

          const idempotencyKey =
            readStringKey(operation.input, 'idempotencyKey') ??
            `idem-execute-transaction-plan-${threadId}`;
          const response = await runSharedEmberCommandWithResolvedRevision<{
            result?: {
              revision?: number;
              committed_event_ids?: string[];
              execution_result?: unknown;
            };
          }>({
            protocolHost: options.protocolHost,
            threadId,
            agentId,
            currentRevision: currentState.lastSharedEmberRevision,
            buildRequest: (expectedRevision) => ({
              jsonrpc: '2.0',
              id: `shared-ember-${threadId}-execute-transaction-plan`,
              method: 'subagent.requestTransactionExecution.v1',
              params: {
                idempotency_key: idempotencyKey,
                expected_revision: expectedRevision,
                transaction_plan_id: transactionPlanId,
              },
            }),
          });

          const executionResult = response.result?.execution_result ?? null;
          const executionPortfolioState = readExecutionPortfolioState(executionResult);
          const projection = mergePortfolioProjection(currentState, executionPortfolioState);
          const nextState: EmberLendingLifecycleState = {
            ...currentState,
            ...projection,
            phase: 'active',
            lastPortfolioState: executionPortfolioState ?? currentState.lastPortfolioState,
            lastSharedEmberRevision: response.result?.revision ?? null,
            lastExecutionResult: executionResult,
            lastExecutionTxHash: readExecutionTxHash(executionResult),
          };

          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'completed',
                statusMessage: 'Lending transaction plan executed through Shared Ember.',
              },
              artifacts: [
                {
                  data: {
                    type: 'shared-ember-execution-result',
                    revision: nextState.lastSharedEmberRevision,
                    committedEventIds: response.result?.committed_event_ids ?? [],
                    executionResult,
                  },
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

          const handoff = buildManagedSubagentHandoff({
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

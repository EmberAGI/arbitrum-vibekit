import type { AgentRuntimeDomainConfig } from 'agent-runtime';

export type EmberLendingSharedEmberProtocolHost = {
  handleJsonRpc: (input: unknown) => Promise<unknown>;
  readCommittedEventOutbox: (input: unknown) => Promise<unknown>;
  acknowledgeCommittedEventOutbox: (input: unknown) => Promise<unknown>;
};

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
    (mandateRecord && isRecord(mandateRecord['context']) ? mandateRecord['context'] : null);

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
    mandateRef: projection.mandateRef ?? state.mandateRef,
    mandateSummary: projection.mandateSummary ?? state.mandateSummary,
    mandateContext: projection.mandateContext ?? state.mandateContext,
    walletAddress: projection.walletAddress ?? state.walletAddress,
    rootUserWalletAddress: projection.rootUserWalletAddress ?? state.rootUserWalletAddress,
    rootedWalletContextId: projection.rootedWalletContextId ?? state.rootedWalletContextId,
    lastReservationSummary: projection.lastReservationSummary ?? state.lastReservationSummary,
  };
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
          name: 'read_portfolio_state',
          description: 'Read the current Shared Ember portfolio state for this managed lending lane.',
        },
        {
          name: 'materialize_candidate_plan',
          description: 'Ask Shared Ember to materialize a candidate transaction plan for the lending lane.',
        },
        {
          name: 'execute_transaction_plan',
          description: 'Execute the admitted lending transaction plan through the bounded Shared Ember surface.',
        },
        {
          name: 'create_escalation_request',
          description: 'Create a bounded escalation request when the lending lane cannot proceed locally.',
        },
      ],
      transitions: [],
      interrupts: [],
    },
    systemContext: ({ state }) => {
      const currentState = state ?? buildDefaultLifecycleState();
      const context = ['<ember_lending_context>'];

      context.push(`  <lifecycle_phase>${currentState.phase}</lifecycle_phase>`);

      if (currentState.mandateRef) {
        context.push(`  <mandate_ref>${escapeXml(currentState.mandateRef)}</mandate_ref>`);
      }

      if (currentState.mandateSummary) {
        context.push(`  <mandate_summary>${escapeXml(currentState.mandateSummary)}</mandate_summary>`);
      }

      if (currentState.walletAddress) {
        context.push(
          `  <subagent_wallet_address>${currentState.walletAddress}</subagent_wallet_address>`,
        );
      }

      if (currentState.rootUserWalletAddress) {
        context.push(
          `  <root_user_wallet_address>${currentState.rootUserWalletAddress}</root_user_wallet_address>`,
        );
      }

      if (currentState.rootedWalletContextId) {
        context.push(
          `  <rooted_wallet_context_id>${escapeXml(currentState.rootedWalletContextId)}</rooted_wallet_context_id>`,
        );
      }

      if (currentState.mandateContext) {
        context.push(
          `  <mandate_context_json>${escapeXml(
            JSON.stringify(currentState.mandateContext),
          )}</mandate_context_json>`,
        );
      }

      if (currentState.lastReservationSummary) {
        context.push(
          `  <last_reservation_summary>${escapeXml(
            currentState.lastReservationSummary,
          )}</last_reservation_summary>`,
        );
      }

      if (currentState.lastCandidatePlanSummary) {
        context.push(
          `  <last_candidate_plan_summary>${escapeXml(
            currentState.lastCandidatePlanSummary,
          )}</last_candidate_plan_summary>`,
        );
      }

      if (currentState.lastExecutionTxHash) {
        context.push(
          `  <last_execution_tx_hash>${currentState.lastExecutionTxHash}</last_execution_tx_hash>`,
        );
      }

      if (currentState.lastEscalationSummary) {
        context.push(
          `  <last_escalation_summary>${escapeXml(
            currentState.lastEscalationSummary,
          )}</last_escalation_summary>`,
        );
      }

      context.push('</ember_lending_context>');

      return context;
    },
    handleOperation: async ({ operation, state, threadId }) => {
      const currentState = state ?? buildDefaultLifecycleState();

      switch (operation.name) {
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
        case 'read_portfolio_state': {
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

          const response = (await options.protocolHost.handleJsonRpc({
            jsonrpc: '2.0',
            id: `shared-ember-${threadId}-read-portfolio-state`,
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
            phase: portfolioState ? 'active' : currentState.phase,
            ...projection,
            lastPortfolioState: portfolioState,
            lastSharedEmberRevision: response.result?.revision ?? null,
          };

          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'completed',
                statusMessage: 'Lending portfolio state refreshed from Shared Ember Domain Service.',
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
        case 'materialize_candidate_plan': {
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
                    'Lending runtime context is incomplete. Refresh portfolio state before planning.',
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
              method: 'subagent.materializeCandidatePlan.v1',
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
        case 'execute_transaction_plan': {
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
              method: 'subagent.executeTransactionPlan.v1',
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
                    'Lending runtime context is incomplete. Refresh portfolio state before escalating.',
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

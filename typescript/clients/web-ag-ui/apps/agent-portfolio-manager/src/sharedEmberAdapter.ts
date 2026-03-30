import type { AgentRuntimeDomainConfig } from 'agent-runtime';

export type PortfolioManagerSharedEmberProtocolHost = {
  handleJsonRpc: (input: unknown) => Promise<unknown>;
  readCommittedEventOutbox: (input: unknown) => Promise<unknown>;
  acknowledgeCommittedEventOutbox: (input: unknown) => Promise<unknown>;
};

export type PortfolioManagerLifecycleState = {
  phase: 'prehire' | 'onboarding' | 'active';
  lastPortfolioState: unknown;
  lastSharedEmberRevision: number | null;
  lastRootDelegation: unknown;
  lastOnboardingBootstrap: unknown;
  lastRootedWalletContextId: string | null;
  pendingUserWalletAddress: `0x${string}` | null;
  pendingBaseContributionUsd: number | null;
};

type CreatePortfolioManagerDomainOptions = {
  protocolHost?: PortfolioManagerSharedEmberProtocolHost;
  agentId?: string;
};

function buildDefaultLifecycleState(): PortfolioManagerLifecycleState {
  return {
    phase: 'prehire',
    lastPortfolioState: null,
    lastSharedEmberRevision: null,
    lastRootDelegation: null,
    lastOnboardingBootstrap: null,
    lastRootedWalletContextId: null,
    pendingUserWalletAddress: null,
    pendingBaseContributionUsd: null,
  };
}

const PORTFOLIO_MANAGER_SETUP_INTERRUPT_TYPE = 'portfolio-manager-setup-request';
const PORTFOLIO_MANAGER_SETUP_MESSAGE =
  'Connect the wallet allocation you want the portfolio manager to onboard.';
const PORTFOLIO_MANAGER_SIGNING_INTERRUPT_TYPE = 'portfolio-manager-delegation-signing-request';
const PORTFOLIO_MANAGER_SIGNING_MESSAGE =
  'Review and sign the delegation needed to activate your portfolio manager.';
const PORTFOLIO_MANAGER_CHAIN_ID = 42161;
const PORTFOLIO_MANAGER_NETWORK = 'arbitrum';
const PORTFOLIO_MANAGER_DELEGATION_MANAGER = '0x1111111111111111111111111111111111111111';
const PORTFOLIO_MANAGER_ORCHESTRATOR_WALLET = '0x2222222222222222222222222222222222222222';
const PORTFOLIO_MANAGER_ROOT_ASSET = 'USDC';
const PORTFOLIO_MANAGER_BOOTSTRAP_TIMESTAMP = '2026-03-30T00:00:00.000Z';

type PortfolioManagerSetupInput = {
  walletAddress: `0x${string}`;
  baseContributionUsd: number;
};

type PortfolioManagerUnsignedDelegation = {
  delegate: `0x${string}`;
  delegator: `0x${string}`;
  authority: `0x${string}`;
  caveats: Array<{
    enforcer: `0x${string}`;
    terms: `0x${string}`;
    args: `0x${string}`;
  }>;
  salt: `0x${string}`;
};

type PortfolioManagerSignedDelegation = PortfolioManagerUnsignedDelegation & {
  signature: `0x${string}`;
};

function sanitizeIdentitySegment(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized.length > 0 ? normalized : 'portfolio-manager';
}

function toUsdQuantityString(value: number): string {
  const normalized = Number.isFinite(value) ? value : 0;
  const rounded = Math.max(0, Math.round(normalized * 100) / 100);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function parsePortfolioManagerSetupInput(input: unknown): PortfolioManagerSetupInput | null {
  if (typeof input !== 'object' || input === null) {
    return null;
  }

  const walletAddress =
    'walletAddress' in input && typeof input.walletAddress === 'string'
      ? input.walletAddress
      : null;
  const baseContributionUsd =
    'baseContributionUsd' in input && typeof input.baseContributionUsd === 'number'
      ? input.baseContributionUsd
      : null;

  if (!walletAddress?.startsWith('0x') || walletAddress.length < 4) {
    return null;
  }

  if (baseContributionUsd === null || !Number.isFinite(baseContributionUsd) || baseContributionUsd <= 0) {
    return null;
  }

  return {
    walletAddress: walletAddress as `0x${string}`,
    baseContributionUsd,
  };
}

function parsePortfolioManagerSignedDelegations(input: unknown): PortfolioManagerSignedDelegation[] | null {
  if (typeof input !== 'object' || input === null) {
    return null;
  }

  if (!('outcome' in input) || input.outcome !== 'signed') {
    return null;
  }

  if (!('signedDelegations' in input) || !Array.isArray(input.signedDelegations)) {
    return null;
  }

  return input.signedDelegations as PortfolioManagerSignedDelegation[];
}

function isPortfolioManagerSigningRejected(input: unknown): boolean {
  return typeof input === 'object' && input !== null && 'outcome' in input && input.outcome === 'rejected';
}

function buildPortfolioManagerUnsignedDelegation(
  walletAddress: `0x${string}`,
): PortfolioManagerUnsignedDelegation {
  return {
    delegate: PORTFOLIO_MANAGER_ORCHESTRATOR_WALLET,
    delegator: walletAddress,
    authority: '0x',
    caveats: [],
    salt: '0x01',
  };
}

function buildPortfolioManagerSigningInterrupt(setup: PortfolioManagerSetupInput) {
  const allocation = toUsdQuantityString(setup.baseContributionUsd);

  return {
    type: PORTFOLIO_MANAGER_SIGNING_INTERRUPT_TYPE,
    surfacedInThread: true,
    message: PORTFOLIO_MANAGER_SIGNING_MESSAGE,
    payload: {
      chainId: PORTFOLIO_MANAGER_CHAIN_ID,
      delegationManager: PORTFOLIO_MANAGER_DELEGATION_MANAGER,
      delegatorAddress: setup.walletAddress,
      delegateeAddress: PORTFOLIO_MANAGER_ORCHESTRATOR_WALLET,
      delegationsToSign: [buildPortfolioManagerUnsignedDelegation(setup.walletAddress)],
      descriptions: [`Authorize the portfolio manager to operate up to ${allocation} ${PORTFOLIO_MANAGER_ROOT_ASSET}.`],
      warnings: ['Only continue if you trust this portfolio-manager session.'],
    },
  };
}

function buildPortfolioManagerOnboardingBootstrap(params: {
  agentId: string;
  threadId: string;
  walletAddress: `0x${string}`;
  baseContributionUsd: number;
}) {
  const allocation = toUsdQuantityString(params.baseContributionUsd);
  const identity = sanitizeIdentitySegment(`${params.threadId}-${params.walletAddress}`);
  const userId = `user-${identity}`;
  const rootedWalletContextId = `rwc-${identity}`;
  const valuationRef = `valuation-${identity}`;
  const unitId = `unit-${identity}`;
  const reservationId = `reservation-${identity}`;
  const mandateRef = `mandate-${identity}`;
  const policySnapshotRef = `policy-${identity}`;
  const observationId = `observation-${identity}`;

  return {
    occurredAt: PORTFOLIO_MANAGER_BOOTSTRAP_TIMESTAMP,
    rootedWalletContext: {
      rooted_wallet_context_id: rootedWalletContextId,
      user_id: userId,
      wallet_address: params.walletAddress,
      network: PORTFOLIO_MANAGER_NETWORK,
      registered_at: PORTFOLIO_MANAGER_BOOTSTRAP_TIMESTAMP,
      metadata: {
        source: 'portfolio_manager_web_onboarding',
      },
    },
    mandates: [
      {
        mandate_ref: mandateRef,
        agent_id: params.agentId,
        mandate_summary: 'activate portfolio manager reserves',
      },
    ],
    capitalObservation: {
      observation_id: observationId,
      kind: 'portfolio_manager_bootstrap',
      wallet_address: params.walletAddress,
      network: PORTFOLIO_MANAGER_NETWORK,
      observed_at: PORTFOLIO_MANAGER_BOOTSTRAP_TIMESTAMP,
      benchmark_asset: 'USD',
      valuation_ref: valuationRef,
      asset_deltas: [{ root_asset: PORTFOLIO_MANAGER_ROOT_ASSET, quantity_delta: allocation }],
      affected_unit_ids: [unitId],
    },
    userReservePolicies: [
      {
        reserve_policy_ref: `reserve-policy-${identity}`,
        summary: `reserve ${allocation} ${PORTFOLIO_MANAGER_ROOT_ASSET} for portfolio manager`,
        user_reserve_rules: [
          {
            root_asset: PORTFOLIO_MANAGER_ROOT_ASSET,
            network: PORTFOLIO_MANAGER_NETWORK,
            benchmark_asset: 'USD',
            reserved_quantity: allocation,
            reason: 'portfolio manager bootstrap reserve',
          },
        ],
      },
    ],
    ownedUnits: [
      {
        unit_id: unitId,
        root_asset: PORTFOLIO_MANAGER_ROOT_ASSET,
        network: PORTFOLIO_MANAGER_NETWORK,
        wallet_address: params.walletAddress,
        quantity: allocation,
        owner_type: 'user_idle',
        owner_id: userId,
        status: 'reserved',
        reservation_id: reservationId,
        delegation_id: null,
        control_path: 'portfolio_manager.allocate',
        position_kind: 'unassigned',
        benchmark_asset: 'USD',
        benchmark_value: allocation,
        valuation_ref: valuationRef,
        cost_basis: allocation,
        opened_at: PORTFOLIO_MANAGER_BOOTSTRAP_TIMESTAMP,
        closed_at: null,
        parent_unit_ids: [],
        metadata: {
          source: 'portfolio_manager_web_onboarding',
        },
      },
    ],
    reservations: [
      {
        reservation_id: reservationId,
        agent_id: params.agentId,
        owner_id: userId,
        purpose: 'deploy',
        control_path: 'portfolio_manager.allocate',
        unit_allocations: [{ unit_id: unitId, quantity: allocation }],
        status: 'active',
        created_at: PORTFOLIO_MANAGER_BOOTSTRAP_TIMESTAMP,
        released_at: null,
        superseded_by: null,
      },
    ],
    policySnapshots: [
      {
        policy_snapshot_ref: policySnapshotRef,
        agent_id: params.agentId,
        network: PORTFOLIO_MANAGER_NETWORK,
        control_paths: ['portfolio_manager.allocate'],
        unit_bounds: [{ unit_id: unitId, quantity: allocation }],
        created_at: PORTFOLIO_MANAGER_BOOTSTRAP_TIMESTAMP,
      },
    ],
  };
}

function buildPortfolioManagerRootDelegationHandoff(params: {
  threadId: string;
  walletAddress: `0x${string}`;
  signedDelegation: PortfolioManagerSignedDelegation;
}) {
  const identity = sanitizeIdentitySegment(`${params.threadId}-${params.walletAddress}`);

  return {
    handoff_id: `handoff-${identity}`,
    root_delegation_id: `root-delegation-${identity}`,
    user_id: `user-${identity}`,
    user_wallet: params.walletAddress,
    orchestrator_wallet: params.signedDelegation.delegate,
    network: PORTFOLIO_MANAGER_NETWORK,
    artifact_ref: `artifact-root-${identity}`,
    issued_at: PORTFOLIO_MANAGER_BOOTSTRAP_TIMESTAMP,
    activated_at: PORTFOLIO_MANAGER_BOOTSTRAP_TIMESTAMP,
    signer_kind: 'wallet_user',
    metadata: {
      delegation_manager: PORTFOLIO_MANAGER_DELEGATION_MANAGER,
      signed_delegation_count: 1,
    },
  };
}

export function createPortfolioManagerDomain(
  options: CreatePortfolioManagerDomainOptions = {},
): AgentRuntimeDomainConfig<PortfolioManagerLifecycleState> {
  const agentId = options.agentId ?? 'portfolio-manager';

  return {
    lifecycle: {
      initialPhase: 'prehire',
      phases: ['prehire', 'onboarding', 'active'],
      terminalPhases: [],
      commands: [
        {
          name: 'hire',
          description:
            'Start onboarding for the portfolio manager and request the initial wallet allocation.',
        },
        {
          name: 'register_root_delegation_from_user_signing',
          description:
            'Register the rooted-wallet signing handoff with the Shared Ember orchestrator.',
        },
        {
          name: 'refresh_portfolio_state',
          description:
            'Read the current Shared Ember portfolio state for the portfolio-manager subagent.',
        },
        {
          name: 'complete_onboarding_bootstrap',
          description:
            'Complete the Shared Ember onboarding bootstrap after rooted-wallet registration.',
        },
        {
          name: 'complete_rooted_bootstrap_from_user_signing',
          description:
            'Complete the rooted bootstrap in one Shared Ember command using onboarding data and the signing handoff.',
        },
      ],
      transitions: [],
      interrupts: [
        {
          type: PORTFOLIO_MANAGER_SETUP_INTERRUPT_TYPE,
          description:
            'Collect the initial connected-wallet allocation before rooted delegation signing.',
          surfacedInThread: true,
        },
        {
          type: 'portfolio-manager-delegation-signing-request',
          description: 'Request delegation signatures needed to complete portfolio-manager onboarding.',
          surfacedInThread: true,
        },
      ],
    },
    systemContext: ({ state }) => {
      const currentState = state ?? buildDefaultLifecycleState();
      const context = [`Lifecycle phase: ${currentState.phase}.`];

      if (currentState.lastSharedEmberRevision !== null) {
        context.push(`Shared Ember revision: ${currentState.lastSharedEmberRevision}.`);
      }

      if (currentState.lastRootDelegation) {
        context.push('Root delegation registered with Shared Ember Domain Service.');
      }

      if (currentState.lastOnboardingBootstrap) {
        context.push('Onboarding bootstrap completed with Shared Ember Domain Service.');
      }

      if (currentState.lastRootedWalletContextId) {
        context.push(`Rooted wallet context: ${currentState.lastRootedWalletContextId}.`);
      }

      if (currentState.pendingUserWalletAddress) {
        context.push(`Pending onboarding wallet: ${currentState.pendingUserWalletAddress}.`);
      }

      if (currentState.pendingBaseContributionUsd !== null) {
        context.push(`Pending onboarding allocation: ${currentState.pendingBaseContributionUsd} USD.`);
      }

      return context;
    },
    handleOperation: async ({ operation, state, threadId }) => {
      const currentState = state ?? buildDefaultLifecycleState();

      switch (operation.name) {
        case 'hire': {
          const nextState: PortfolioManagerLifecycleState = {
            ...currentState,
            phase: 'onboarding',
          };

          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'interrupted',
                statusMessage: PORTFOLIO_MANAGER_SETUP_MESSAGE,
              },
              interrupt: {
                type: PORTFOLIO_MANAGER_SETUP_INTERRUPT_TYPE,
                surfacedInThread: true,
                message: PORTFOLIO_MANAGER_SETUP_MESSAGE,
              },
            },
          };
        }
        case PORTFOLIO_MANAGER_SETUP_INTERRUPT_TYPE: {
          const setupInput = parsePortfolioManagerSetupInput(operation.input);
          if (!setupInput) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage: 'Portfolio manager setup input is incomplete.',
                },
              },
            };
          }

          const nextState: PortfolioManagerLifecycleState = {
            ...currentState,
            phase: 'onboarding',
            pendingUserWalletAddress: setupInput.walletAddress,
            pendingBaseContributionUsd: setupInput.baseContributionUsd,
          };

          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'interrupted',
                statusMessage: PORTFOLIO_MANAGER_SIGNING_MESSAGE,
              },
              interrupt: buildPortfolioManagerSigningInterrupt(setupInput),
            },
          };
        }
        case PORTFOLIO_MANAGER_SIGNING_INTERRUPT_TYPE: {
          if (isPortfolioManagerSigningRejected(operation.input)) {
            return {
              state: {
                ...currentState,
                phase: 'prehire',
                pendingUserWalletAddress: null,
                pendingBaseContributionUsd: null,
              },
              outputs: {
                status: {
                  executionStatus: 'canceled',
                  statusMessage:
                    'Portfolio manager onboarding was canceled because delegation signing was rejected.',
                },
              },
            };
          }

          const walletAddress = currentState.pendingUserWalletAddress;
          const baseContributionUsd = currentState.pendingBaseContributionUsd;
          const signedDelegations = parsePortfolioManagerSignedDelegations(operation.input);
          const signedDelegation = signedDelegations?.[0];

          if (!walletAddress || baseContributionUsd === null || !signedDelegation) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Portfolio manager signing input is incomplete. Restart onboarding and try again.',
                },
              },
            };
          }

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

          const onboarding = buildPortfolioManagerOnboardingBootstrap({
            agentId,
            threadId,
            walletAddress,
            baseContributionUsd,
          });
          const handoff = buildPortfolioManagerRootDelegationHandoff({
            threadId,
            walletAddress,
            signedDelegation,
          });
          const response = (await options.protocolHost.handleJsonRpc({
            jsonrpc: '2.0',
            id: `shared-ember-${threadId}-complete-rooted-bootstrap`,
            method: 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
            params: {
              idempotency_key: `idem-portfolio-manager-rooted-bootstrap-${threadId}`,
              expected_revision: currentState.lastSharedEmberRevision ?? 0,
              onboarding,
              handoff,
            },
          })) as {
            result?: {
              revision?: number;
              committed_event_ids?: string[];
              rooted_wallet_context_id?: string;
              root_delegation?: unknown;
            };
          };

          const nextState: PortfolioManagerLifecycleState = {
            phase: 'active',
            lastPortfolioState: currentState.lastPortfolioState,
            lastSharedEmberRevision: response.result?.revision ?? null,
            lastRootDelegation: response.result?.root_delegation ?? currentState.lastRootDelegation,
            lastOnboardingBootstrap: onboarding,
            lastRootedWalletContextId: response.result?.rooted_wallet_context_id ?? null,
            pendingUserWalletAddress: null,
            pendingBaseContributionUsd: null,
          };

          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'completed',
                statusMessage: 'Portfolio manager onboarding complete. Agent is active.',
              },
              artifacts: [
                {
                  data: {
                    type: 'shared-ember-rooted-bootstrap',
                    revision: nextState.lastSharedEmberRevision,
                    committedEventIds: response.result?.committed_event_ids ?? [],
                    rootedWalletContextId: nextState.lastRootedWalletContextId,
                    rootDelegation: nextState.lastRootDelegation,
                  },
                },
              ],
            },
          };
        }
        case 'register_root_delegation_from_user_signing': {
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
          const commandInput =
            typeof operation.input === 'object' && operation.input !== null ? operation.input : {};
          const idempotencyKey =
            'idempotencyKey' in commandInput && typeof commandInput.idempotencyKey === 'string'
              ? commandInput.idempotencyKey
              : `idem-root-delegation-${threadId}`;
          const handoff = 'handoff' in commandInput ? commandInput.handoff : undefined;
          const response = (await options.protocolHost.handleJsonRpc({
            jsonrpc: '2.0',
            id: `shared-ember-${threadId}-register-root-delegation`,
            method: 'orchestrator.registerRootDelegationFromUserSigning.v1',
            params: {
              idempotency_key: idempotencyKey,
              expected_revision: currentState.lastSharedEmberRevision ?? 0,
              handoff,
            },
          })) as {
            result?: {
              revision?: number;
              committed_event_ids?: string[];
              root_delegation?: unknown;
            };
          };

          const nextState: PortfolioManagerLifecycleState = {
            phase: 'onboarding',
            lastPortfolioState: currentState.lastPortfolioState,
            lastSharedEmberRevision: response.result?.revision ?? null,
            lastRootDelegation: response.result?.root_delegation ?? null,
            lastOnboardingBootstrap: currentState.lastOnboardingBootstrap,
            lastRootedWalletContextId: currentState.lastRootedWalletContextId,
            pendingUserWalletAddress: currentState.pendingUserWalletAddress,
            pendingBaseContributionUsd: currentState.pendingBaseContributionUsd,
          };

          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'completed',
                statusMessage: 'Root delegation registered with Shared Ember Domain Service.',
              },
              artifacts: [
                {
                  data: {
                    type: 'shared-ember-root-delegation',
                    revision: nextState.lastSharedEmberRevision,
                    committedEventIds: response.result?.committed_event_ids ?? [],
                    rootDelegation: nextState.lastRootDelegation,
                  },
                },
              ],
            },
          };
        }
        case 'refresh_portfolio_state': {
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

          const nextState: PortfolioManagerLifecycleState = {
            phase: currentState.phase,
            lastPortfolioState: response.result?.portfolio_state ?? null,
            lastSharedEmberRevision: response.result?.revision ?? null,
            lastRootDelegation: currentState.lastRootDelegation,
            lastOnboardingBootstrap: currentState.lastOnboardingBootstrap,
            lastRootedWalletContextId: currentState.lastRootedWalletContextId,
            pendingUserWalletAddress: currentState.pendingUserWalletAddress,
            pendingBaseContributionUsd: currentState.pendingBaseContributionUsd,
          };

          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'completed',
                statusMessage: 'Portfolio state refreshed from Shared Ember Domain Service.',
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
        case 'complete_onboarding_bootstrap': {
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
          const commandInput =
            typeof operation.input === 'object' && operation.input !== null ? operation.input : {};
          const idempotencyKey =
            'idempotencyKey' in commandInput && typeof commandInput.idempotencyKey === 'string'
              ? commandInput.idempotencyKey
              : `idem-onboarding-bootstrap-${threadId}`;
          const onboarding = 'onboarding' in commandInput ? commandInput.onboarding : undefined;
          const response = (await options.protocolHost.handleJsonRpc({
            jsonrpc: '2.0',
            id: `shared-ember-${threadId}-complete-onboarding-bootstrap`,
            method: 'orchestrator.completeOnboardingBootstrap.v1',
            params: {
              idempotency_key: idempotencyKey,
              expected_revision: currentState.lastSharedEmberRevision ?? 0,
              onboarding,
            },
          })) as {
            result?: {
              revision?: number;
              committed_event_ids?: string[];
              onboarding_bootstrap?: unknown;
            };
          };

          const nextState: PortfolioManagerLifecycleState = {
            phase: 'onboarding',
            lastPortfolioState: currentState.lastPortfolioState,
            lastSharedEmberRevision: response.result?.revision ?? null,
            lastRootDelegation: currentState.lastRootDelegation,
            lastOnboardingBootstrap: response.result?.onboarding_bootstrap ?? null,
            lastRootedWalletContextId: currentState.lastRootedWalletContextId,
            pendingUserWalletAddress: currentState.pendingUserWalletAddress,
            pendingBaseContributionUsd: currentState.pendingBaseContributionUsd,
          };

          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'completed',
                statusMessage: 'Onboarding bootstrap completed with Shared Ember Domain Service.',
              },
              artifacts: [
                {
                  data: {
                    type: 'shared-ember-onboarding-bootstrap',
                    revision: nextState.lastSharedEmberRevision,
                    committedEventIds: response.result?.committed_event_ids ?? [],
                    onboardingBootstrap: nextState.lastOnboardingBootstrap,
                  },
                },
              ],
            },
          };
        }
        case 'complete_rooted_bootstrap_from_user_signing': {
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
          const commandInput =
            typeof operation.input === 'object' && operation.input !== null ? operation.input : {};
          const idempotencyKey =
            'idempotencyKey' in commandInput && typeof commandInput.idempotencyKey === 'string'
              ? commandInput.idempotencyKey
              : `idem-rooted-bootstrap-${threadId}`;
          const onboarding = 'onboarding' in commandInput ? commandInput.onboarding : undefined;
          const handoff = 'handoff' in commandInput ? commandInput.handoff : undefined;
          const response = (await options.protocolHost.handleJsonRpc({
            jsonrpc: '2.0',
            id: `shared-ember-${threadId}-complete-rooted-bootstrap`,
            method: 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
            params: {
              idempotency_key: idempotencyKey,
              expected_revision: currentState.lastSharedEmberRevision ?? 0,
              onboarding,
              handoff,
            },
          })) as {
            result?: {
              revision?: number;
              committed_event_ids?: string[];
              rooted_wallet_context_id?: string;
              root_delegation?: unknown;
            };
          };

          const nextState: PortfolioManagerLifecycleState = {
            phase: 'onboarding',
            lastPortfolioState: currentState.lastPortfolioState,
            lastSharedEmberRevision: response.result?.revision ?? null,
            lastRootDelegation: response.result?.root_delegation ?? currentState.lastRootDelegation,
            lastOnboardingBootstrap: currentState.lastOnboardingBootstrap,
            lastRootedWalletContextId: response.result?.rooted_wallet_context_id ?? null,
            pendingUserWalletAddress: currentState.pendingUserWalletAddress,
            pendingBaseContributionUsd: currentState.pendingBaseContributionUsd,
          };

          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'completed',
                statusMessage: 'Rooted bootstrap completed with Shared Ember Domain Service.',
              },
              artifacts: [
                {
                  data: {
                    type: 'shared-ember-rooted-bootstrap',
                    revision: nextState.lastSharedEmberRevision,
                    committedEventIds: response.result?.committed_event_ids ?? [],
                    rootedWalletContextId: nextState.lastRootedWalletContextId,
                    rootDelegation: nextState.lastRootDelegation,
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

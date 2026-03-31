import type { AgentRuntimeDomainConfig } from 'agent-runtime';
import {
  buildPortfolioManagerWalletAccountingDetails,
  buildSharedEmberAccountingContextXml,
  readPortfolioManagerOnboardingState,
} from './sharedEmberOnboardingState.js';

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
  activeWalletAddress: `0x${string}` | null;
  pendingOnboardingWalletAddress: `0x${string}` | null;
};

type CreatePortfolioManagerDomainOptions = {
  protocolHost?: PortfolioManagerSharedEmberProtocolHost;
  agentId?: string;
};

type SharedEmberRevisionResponse = {
  result?: {
    revision?: number;
  };
};

function buildDefaultLifecycleState(): PortfolioManagerLifecycleState {
  return {
    phase: 'prehire',
    lastPortfolioState: null,
    lastSharedEmberRevision: null,
    lastRootDelegation: null,
    lastOnboardingBootstrap: null,
    lastRootedWalletContextId: null,
    activeWalletAddress: null,
    pendingOnboardingWalletAddress: null,
  };
}

function readOnboardingBootstrapWalletAddress(value: unknown): `0x${string}` | null {
  if (typeof value !== 'object' || value === null || !('rootedWalletContext' in value)) {
    return null;
  }

  const rootedWalletContext = value.rootedWalletContext;
  if (
    typeof rootedWalletContext !== 'object' ||
    rootedWalletContext === null ||
    !('wallet_address' in rootedWalletContext) ||
    typeof rootedWalletContext.wallet_address !== 'string'
  ) {
    return null;
  }

  return rootedWalletContext.wallet_address.startsWith('0x')
    ? (rootedWalletContext.wallet_address as `0x${string}`)
    : null;
}

function readPortfolioManagerContextWalletAddress(
  state: PortfolioManagerLifecycleState,
): `0x${string}` | null {
  return state.activeWalletAddress ?? readOnboardingBootstrapWalletAddress(state.lastOnboardingBootstrap);
}

function isSharedEmberRevisionConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('Shared Ember Domain Service JSON-RPC error: protocol_conflict') &&
    error.message.includes('expected_revision')
  );
}

async function readCurrentSharedEmberRevision(input: {
  protocolHost: PortfolioManagerSharedEmberProtocolHost;
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
  protocolHost: PortfolioManagerSharedEmberProtocolHost;
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

const PORTFOLIO_MANAGER_SETUP_INTERRUPT_TYPE = 'portfolio-manager-setup-request';
const PORTFOLIO_MANAGER_SETUP_MESSAGE =
  'Connect the wallet you want the portfolio manager to onboard.';
const PORTFOLIO_MANAGER_SIGNING_INTERRUPT_TYPE = 'portfolio-manager-delegation-signing-request';
const PORTFOLIO_MANAGER_SIGNING_MESSAGE =
  'Review and sign the delegation needed to activate your portfolio manager.';
const PORTFOLIO_MANAGER_CHAIN_ID = 42161;
const PORTFOLIO_MANAGER_NETWORK = 'arbitrum';
const PORTFOLIO_MANAGER_DELEGATION_MANAGER = '0x1111111111111111111111111111111111111111';
const PORTFOLIO_MANAGER_ORCHESTRATOR_WALLET = '0x2222222222222222222222222222222222222222';
const PORTFOLIO_MANAGER_ROOT_AUTHORITY =
  '0x0000000000000000000000000000000000000000000000000000000000000000';
const PORTFOLIO_MANAGER_DELEGATION_SALT =
  '0x1111111111111111111111111111111111111111111111111111111111111111';
const PORTFOLIO_MANAGER_BOOTSTRAP_TIMESTAMP = '2026-03-30T00:00:00.000Z';
const PORTFOLIO_MANAGER_PROTOCOL_SOURCE = 'onboarding_scan';
const PORTFOLIO_MANAGER_ONBOARDING_CONTROL_PATH = 'unassigned';

type PortfolioManagerSetupInput = {
  walletAddress: `0x${string}`;
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

function parsePortfolioManagerSetupInput(input: unknown): PortfolioManagerSetupInput | null {
  if (typeof input !== 'object' || input === null) {
    return null;
  }

  const walletAddress =
    'walletAddress' in input && typeof input.walletAddress === 'string'
      ? input.walletAddress
      : null;
  if (!walletAddress?.startsWith('0x') || walletAddress.length < 4) {
    return null;
  }

  return {
    walletAddress: walletAddress as `0x${string}`,
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
    authority: PORTFOLIO_MANAGER_ROOT_AUTHORITY,
    caveats: [],
    salt: PORTFOLIO_MANAGER_DELEGATION_SALT,
  };
}

function buildPortfolioManagerSigningInterrupt(setup: PortfolioManagerSetupInput) {
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
      descriptions: ['Authorize the portfolio manager to operate through your root delegation.'],
      warnings: ['Only continue if you trust this portfolio-manager session.'],
    },
  };
}

function buildPortfolioManagerOnboardingBootstrap(params: {
  agentId: string;
  threadId: string;
  walletAddress: `0x${string}`;
}) {
  const identity = sanitizeIdentitySegment(`${params.threadId}-${params.walletAddress}`);
  const userId = `user-${identity}`;
  const rootedWalletContextId = `rwc-${identity}`;
  const mandateRef = `mandate-${identity}`;

  return {
    occurredAt: PORTFOLIO_MANAGER_BOOTSTRAP_TIMESTAMP,
    rootedWalletContext: {
      rooted_wallet_context_id: rootedWalletContextId,
      user_id: userId,
      wallet_address: params.walletAddress,
      network: PORTFOLIO_MANAGER_NETWORK,
      registered_at: PORTFOLIO_MANAGER_BOOTSTRAP_TIMESTAMP,
      metadata: {
        source: PORTFOLIO_MANAGER_PROTOCOL_SOURCE,
      },
    },
    mandates: [
      {
        mandate_ref: mandateRef,
        agent_id: params.agentId,
        mandate_summary: 'activate portfolio manager reserves',
      },
    ],
    userReservePolicies: [],
    activation: {
      agentId: params.agentId,
      purpose: 'deploy',
      controlPath: PORTFOLIO_MANAGER_ONBOARDING_CONTROL_PATH,
    },
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
    signer_kind: 'delegation_toolkit',
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
            'Start onboarding for the portfolio manager and request the connected wallet.',
        },
        {
          name: 'fire',
          description:
            'Return the portfolio manager to a rehirable prehire state and mark the current task complete.',
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
          name: 'complete_rooted_bootstrap_from_user_signing',
          description:
            'Complete the rooted bootstrap in one Shared Ember command using onboarding data and the signing handoff.',
        },
      ],
      transitions: [],
      interrupts: [
        {
          type: PORTFOLIO_MANAGER_SETUP_INTERRUPT_TYPE,
          description: 'Collect the connected wallet before rooted delegation signing.',
          surfacedInThread: true,
        },
        {
          type: 'portfolio-manager-delegation-signing-request',
          description: 'Request delegation signatures needed to complete portfolio-manager onboarding.',
          surfacedInThread: true,
        },
      ],
    },
    systemContext: async ({ state }) => {
      const currentState = state ?? buildDefaultLifecycleState();
      const context = ['<portfolio_manager_context>'];

      context.push(`  <lifecycle_phase>${currentState.phase}</lifecycle_phase>`);

      if (currentState.lastSharedEmberRevision !== null) {
        context.push(
          `  <shared_ember_revision>${currentState.lastSharedEmberRevision}</shared_ember_revision>`,
        );
      }

      if (currentState.lastRootDelegation) {
        context.push('  <root_delegation_registered>true</root_delegation_registered>');
      }

      if (currentState.lastOnboardingBootstrap) {
        context.push('  <onboarding_bootstrap_completed>true</onboarding_bootstrap_completed>');
      }

      const rootedWalletAddress = readOnboardingBootstrapWalletAddress(
        currentState.lastOnboardingBootstrap,
      );
      if (rootedWalletAddress) {
        context.push(
          `  <user_portfolio_wallet_address source="rooted_wallet_context">${rootedWalletAddress}</user_portfolio_wallet_address>`,
        );
      }

      if (currentState.lastRootedWalletContextId) {
        context.push(
          `  <rooted_wallet_context_id>${currentState.lastRootedWalletContextId}</rooted_wallet_context_id>`,
        );
      }

      if (currentState.activeWalletAddress) {
        context.push(
          `  <active_portfolio_wallet_address>${currentState.activeWalletAddress}</active_portfolio_wallet_address>`,
        );
      }

      if (currentState.pendingOnboardingWalletAddress) {
        context.push(
          `  <pending_onboarding_wallet_address source="onboarding_setup">${currentState.pendingOnboardingWalletAddress}</pending_onboarding_wallet_address>`,
        );
      }

      context.push('</portfolio_manager_context>');

      const walletAddress = readPortfolioManagerContextWalletAddress(currentState);
      if (walletAddress && options.protocolHost) {
        try {
          const { revision, onboardingState } = await readPortfolioManagerOnboardingState({
            protocolHost: options.protocolHost,
            agentId,
            walletAddress,
          });
          context.push(
            ...buildSharedEmberAccountingContextXml({
              status: 'live',
              details: buildPortfolioManagerWalletAccountingDetails({
                revision,
                onboardingState,
              }),
            }),
          );
        } catch (error) {
          context.push(
            ...buildSharedEmberAccountingContextXml({
              status: 'unavailable',
              walletAddress,
              error: error instanceof Error ? error.message : 'Unknown Shared Ember read failure.',
            }),
          );
        }
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
        case 'fire': {
          const nextState: PortfolioManagerLifecycleState = {
            ...currentState,
            phase: 'prehire',
            lastRootDelegation: null,
            lastOnboardingBootstrap: null,
            lastRootedWalletContextId: null,
            activeWalletAddress: null,
            pendingOnboardingWalletAddress: null,
          };

          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'completed',
                statusMessage: 'Portfolio manager fired. Ready to hire again.',
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
            activeWalletAddress: setupInput.walletAddress,
            pendingOnboardingWalletAddress: setupInput.walletAddress,
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
                activeWalletAddress: null,
                pendingOnboardingWalletAddress: null,
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

          const walletAddress = currentState.pendingOnboardingWalletAddress;
          const signedDelegations = parsePortfolioManagerSignedDelegations(operation.input);
          const signedDelegation = signedDelegations?.[0];

          if (!walletAddress || !signedDelegation) {
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
          });
          const handoff = buildPortfolioManagerRootDelegationHandoff({
            threadId,
            walletAddress,
            signedDelegation,
          });
          const response = await runSharedEmberCommandWithResolvedRevision<{
            result?: {
              revision?: number;
              committed_event_ids?: string[];
              rooted_wallet_context_id?: string;
              root_delegation?: unknown;
            };
          }>({
            protocolHost: options.protocolHost,
            threadId,
            agentId,
            currentRevision: currentState.lastSharedEmberRevision,
            buildRequest: (expectedRevision) => ({
              jsonrpc: '2.0',
              id: `shared-ember-${threadId}-complete-rooted-bootstrap`,
              method: 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
              params: {
                idempotency_key: `idem-portfolio-manager-rooted-bootstrap-${threadId}`,
                expected_revision: expectedRevision,
                onboarding,
                handoff,
              },
            }),
          });

          const nextState: PortfolioManagerLifecycleState = {
            phase: 'active',
            lastPortfolioState: currentState.lastPortfolioState,
            lastSharedEmberRevision: response.result?.revision ?? null,
            lastRootDelegation: response.result?.root_delegation ?? currentState.lastRootDelegation,
            lastOnboardingBootstrap: onboarding,
            lastRootedWalletContextId: response.result?.rooted_wallet_context_id ?? null,
            activeWalletAddress: walletAddress,
            pendingOnboardingWalletAddress: null,
          };

          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'working',
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
          const response = await runSharedEmberCommandWithResolvedRevision<{
            result?: {
              revision?: number;
              committed_event_ids?: string[];
              root_delegation?: unknown;
            };
          }>({
            protocolHost: options.protocolHost,
            threadId,
            agentId,
            currentRevision: currentState.lastSharedEmberRevision,
            buildRequest: (expectedRevision) => ({
              jsonrpc: '2.0',
              id: `shared-ember-${threadId}-register-root-delegation`,
              method: 'orchestrator.registerRootDelegationFromUserSigning.v1',
              params: {
                idempotency_key: idempotencyKey,
                expected_revision: expectedRevision,
                handoff,
              },
            }),
          });

          const nextState: PortfolioManagerLifecycleState = {
            phase: 'onboarding',
            lastPortfolioState: currentState.lastPortfolioState,
            lastSharedEmberRevision: response.result?.revision ?? null,
            lastRootDelegation: response.result?.root_delegation ?? null,
            lastOnboardingBootstrap: currentState.lastOnboardingBootstrap,
            lastRootedWalletContextId: currentState.lastRootedWalletContextId,
            activeWalletAddress: currentState.activeWalletAddress,
            pendingOnboardingWalletAddress: currentState.pendingOnboardingWalletAddress,
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
            activeWalletAddress: currentState.activeWalletAddress,
            pendingOnboardingWalletAddress: currentState.pendingOnboardingWalletAddress,
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
          const response = await runSharedEmberCommandWithResolvedRevision<{
            result?: {
              revision?: number;
              committed_event_ids?: string[];
              rooted_wallet_context_id?: string;
              root_delegation?: unknown;
            };
          }>({
            protocolHost: options.protocolHost,
            threadId,
            agentId,
            currentRevision: currentState.lastSharedEmberRevision,
            buildRequest: (expectedRevision) => ({
              jsonrpc: '2.0',
              id: `shared-ember-${threadId}-complete-rooted-bootstrap`,
              method: 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
              params: {
                idempotency_key: idempotencyKey,
                expected_revision: expectedRevision,
                onboarding,
                handoff,
              },
            }),
          });

          const nextState: PortfolioManagerLifecycleState = {
            phase: 'onboarding',
            lastPortfolioState: currentState.lastPortfolioState,
            lastSharedEmberRevision: response.result?.revision ?? null,
            lastRootDelegation: response.result?.root_delegation ?? currentState.lastRootDelegation,
            lastOnboardingBootstrap: currentState.lastOnboardingBootstrap,
            lastRootedWalletContextId: response.result?.rooted_wallet_context_id ?? null,
            activeWalletAddress:
              currentState.activeWalletAddress ??
              currentState.pendingOnboardingWalletAddress,
            pendingOnboardingWalletAddress: currentState.pendingOnboardingWalletAddress,
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

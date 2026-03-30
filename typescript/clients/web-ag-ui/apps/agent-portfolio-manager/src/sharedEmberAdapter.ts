import type { AgentRuntimeDomainConfig } from 'agent-runtime';

export type PortfolioManagerSharedEmberProtocolHost = {
  handleJsonRpc: (input: unknown) => Promise<unknown>;
  readCommittedEventOutbox: (input: unknown) => Promise<unknown>;
  acknowledgeCommittedEventOutbox: (input: unknown) => Promise<unknown>;
};

export type PortfolioManagerLifecycleState = {
  phase: 'prehire' | 'onboarding';
  lastPortfolioState: unknown;
  lastSharedEmberRevision: number | null;
  lastRootDelegation: unknown;
  lastOnboardingBootstrap: unknown;
  lastRootedWalletContextId: string | null;
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
  };
}

export function createPortfolioManagerDomain(
  options: CreatePortfolioManagerDomainOptions = {},
): AgentRuntimeDomainConfig<PortfolioManagerLifecycleState> {
  const agentId = options.agentId ?? 'portfolio-manager';

  return {
      lifecycle: {
        initialPhase: 'prehire',
        phases: ['prehire', 'onboarding'],
        terminalPhases: [],
        commands: [
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
      interrupts: [],
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

      return context;
    },
    handleOperation: async ({ operation, state, threadId }) => {
      const currentState = state ?? buildDefaultLifecycleState();

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

      switch (operation.name) {
        case 'register_root_delegation_from_user_signing': {
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

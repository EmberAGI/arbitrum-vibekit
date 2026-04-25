import { ROOT_AUTHORITY } from '@metamask/delegation-toolkit';
import { getDelegationHashOffchain } from '@metamask/delegation-toolkit/utils';
import { describe, expect, it, vi } from 'vitest';
import type { AgentRuntimeSigningService } from 'agent-runtime/internal';

import { createPortfolioManagerDomain } from './sharedEmberAdapter.js';

function createRuntimeSigningStub(signPayload: AgentRuntimeSigningService['signPayload']) {
  return {
    readAddress: vi.fn<AgentRuntimeSigningService['readAddress']>(),
    signPayload,
  };
}

function decodeDelegationArtifactRef(artifactRef: string): Record<string, unknown> {
  const prefix = 'metamask-delegation:';

  if (!artifactRef.startsWith(prefix)) {
    throw new Error(`Unsupported delegation artifact ref: ${artifactRef}`);
  }

  return JSON.parse(
    Buffer.from(artifactRef.slice(prefix.length), 'base64url').toString('utf8'),
  ) as Record<string, unknown>;
}

function encodeDelegationArtifactRef(delegation: Record<string, unknown>): string {
  return `metamask-delegation:${Buffer.from(JSON.stringify(delegation), 'utf8').toString(
    'base64url',
  )}`;
}

function createSignedRootDelegation(delegate: `0x${string}`) {
  return {
    delegate,
    delegator: '0x00000000000000000000000000000000000000a1' as const,
    authority: ROOT_AUTHORITY as `0x${string}`,
    caveats: [],
    salt: '0x1111111111111111111111111111111111111111111111111111111111111111' as const,
    signature: '0x1234' as const,
  };
}

const TEST_REDELEGATION_SIGNATURE =
  '0x464a27f0b9166323a2d686a053ac34e74c318b59854dcc7de4221837437214870c365e2d8e5060f092656d3bd06f78c324ed296792df9c60f76c68bca5551eb601';
const TEST_DELEGATION_MANAGER = '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3';
const TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS = '0x00000000000000000000000000000000000000c2' as const;

function createAgentServiceIdentityResponse(input: {
  agentId: string;
  role: 'orchestrator' | 'subagent';
  walletAddress: `0x${string}`;
  revision?: number;
}) {
  return {
    jsonrpc: '2.0',
    id: 'rpc-agent-service-identity-read',
    result: {
      revision: input.revision ?? 2,
      agent_service_identity: {
        identity_ref: `agent-service-identity-${input.agentId}-${input.role}-1`,
        agent_id: input.agentId,
        role: input.role,
        wallet_address: input.walletAddress,
        wallet_source: 'ember_local_write',
        capability_metadata:
          input.role === 'orchestrator'
            ? {
                onboarding: true,
                root_registration: true,
              }
            : {
                execution: true,
                onboarding: true,
              },
        registration_version: 1,
        registered_at: '2026-04-01T00:00:00.000Z',
      },
    },
  };
}

type PortfolioManagerSetupInputFixture = {
  walletAddress: `0x${string}`;
  portfolioMandate: {
    approved: true;
    riskLevel: 'medium';
  };
  firstManagedMandate: {
    targetAgentId: 'ember-lending';
    targetAgentKey: string;
    managedMandate: {
      lending_policy: {
        collateral_policy: {
          assets: Array<{
            asset: string;
            max_allocation_pct: number;
          }>;
        };
        borrow_policy: {
          allowed_assets: string[];
        };
        risk_policy: {
          max_ltv_bps: number;
          min_health_factor: string;
        };
      };
    };
  };
};

type ManagedMandateFixture =
  PortfolioManagerSetupInputFixture['firstManagedMandate']['managedMandate'];

function createManagedLendingPolicy(
  overrides: Partial<ManagedMandateFixture['lending_policy']> = {},
) {
  return {
    collateral_policy: {
      assets: [
        {
          asset: 'USDC',
          max_allocation_pct: 35,
        },
      ],
    },
    borrow_policy: {
      allowed_assets: ['USDC'],
    },
    risk_policy: {
      max_ltv_bps: 7000,
      min_health_factor: '1.25',
    },
    ...overrides,
  };
}

function createPortfolioManagerSetupInput(): PortfolioManagerSetupInputFixture {
  return {
    walletAddress: '0x00000000000000000000000000000000000000a1' as const,
    portfolioMandate: {
      approved: true as const,
      riskLevel: 'medium' as const,
    },
    firstManagedMandate: {
      targetAgentId: 'ember-lending' as const,
      targetAgentKey: 'ember-lending-primary',
      managedMandate: {
        lending_policy: createManagedLendingPolicy(),
      },
    },
  };
}

function createOnboardingBootstrap() {
  return {
    occurredAt: '2026-03-29T00:06:00Z',
    rootedWalletContext: {
      rooted_wallet_context_id: 'rwc-user-protocol-001',
      user_id: 'user_idle',
      wallet_address: '0xUSERPROTO1',
      network: 'arbitrum',
      registered_at: '2026-03-29T00:00:00Z',
      metadata: {
        source: 'onboarding_scan',
        approvedOnboardingSetup: {
          portfolioMandate: {
            approved: true,
            riskLevel: 'medium',
          },
          firstManagedMandate: {
            targetAgentId: 'ember-lending',
            targetAgentKey: 'ember-lending-primary',
            managedMandate: {
              lending_policy: createManagedLendingPolicy(),
            },
          },
        },
      },
    },
    mandates: [
      {
        mandate_ref: 'mandate-portfolio-protocol-001',
        agent_id: 'portfolio-manager',
        managed_mandate: null,
      },
      {
        mandate_ref: 'mandate-ember-lending-protocol-001',
        agent_id: 'ember-lending',
        managed_mandate: {
          lending_policy: createManagedLendingPolicy(),
        },
      },
    ],
    userReservePolicies: [
      {
        reserve_policy_ref: 'reserve-policy-ember-lending-protocol-001',
        summary: 'allow managed lending to admit allocable idle USDC',
        user_reserve_rules: [
          {
            root_asset: 'USDC',
            network: 'arbitrum',
            benchmark_asset: 'USD',
            reserved_quantity: '0',
            reason: 'allow managed lending to admit allocable idle USDC',
          },
        ],
      },
    ],
    activation: {
      mandateRef: 'mandate-ember-lending-protocol-001',
    },
  };
}

function createLiveManagedAgentPortfolioState() {
  return {
    agent_id: 'ember-lending',
    benchmark_asset: 'USD',
    mandate_ref: 'mandate-ember-lending-live-001',
    mandate_context: {
      lending_policy: createManagedLendingPolicy({
        collateral_policy: {
          assets: [
            {
              asset: 'USDC',
              max_allocation_pct: 60,
            },
            {
              asset: 'USDT',
              max_allocation_pct: 25,
            },
          ],
        },
        borrow_policy: {
          allowed_assets: ['USDC', 'USDT'],
        },
        risk_policy: {
          max_ltv_bps: 6500,
          min_health_factor: '1.4',
        },
      }),
    },
    agent_wallet: '0x00000000000000000000000000000000000000e1',
    root_user_wallet: '0x00000000000000000000000000000000000000a1',
    rooted_wallet_context_id: 'rwc-user-protocol-001',
    owned_units: [
      {
        unit_id: 'unit-usdc-portfolio-001',
        network: 'arbitrum',
        root_asset: 'USDC',
        quantity: '25',
        benchmark_asset: 'USD',
        benchmark_value_usd: '25',
        reservation_id: 'reservation-ember-lending-001',
        position_scope_id: 'position-scope-aave-arbitrum-usdc',
      },
    ],
    reservations: [
      {
        reservation_id: 'reservation-ember-lending-001',
        agent_id: 'ember-lending',
        purpose: 'position.enter',
        status: 'active',
        control_path: 'lending.supply',
        created_at: '2026-03-30T00:00:00.000Z',
        unit_allocations: [
          {
            unit_id: 'unit-usdc-portfolio-001',
            quantity: '25',
          },
        ],
      },
    ],
    wallet_contents: [
      {
        asset: 'USDC',
        network: 'arbitrum',
        quantity: '10',
        value_usd: '10',
      },
      {
        asset: 'WBTC',
        network: 'arbitrum',
        quantity: '2736',
        value_usd: '2.1084539253125922',
      },
      {
        asset: 'WETH',
        network: 'arbitrum',
        quantity: '0.01',
        value_usd: '20',
        economic_exposures: [
          {
            asset: 'ETH',
            quantity: '0.01',
          },
        ],
      },
    ],
    active_position_scopes: [
      {
        scope_id: 'position-scope-aave-arbitrum-usdc',
        kind: 'lending-position',
        network: 'arbitrum',
        protocol_system: 'aave',
        container_ref: 'aave:position-scope-aave-arbitrum-usdc',
        owner_type: 'agent',
        owner_id: 'ember-lending',
        status: 'active',
        market_state: {
          available_borrows_usd: '18',
          borrowable_headroom_usd: '12.5',
          current_ltv_bps: 3200,
          liquidation_threshold_bps: 7800,
          health_factor: '2.1',
        },
        members: [
          {
            member_id: 'collateral-usdc',
            role: 'collateral',
            asset: 'USDC',
            quantity: '25',
            value_usd: '25',
            economic_exposures: [
              {
                asset: 'USDC',
                quantity: '25',
              },
            ],
            state: {
              withdrawable_quantity: '10',
              supply_apr: '0.03',
            },
          },
          {
            member_id: 'debt-usdt',
            role: 'debt',
            asset: 'USDT',
            quantity: '5',
            value_usd: '5',
            economic_exposures: [
              {
                asset: 'USDT',
                quantity: '5',
              },
            ],
            state: {
              borrow_apr: '0.06',
            },
          },
        ],
      },
    ],
  };
}

function createUpdatedManagedMandate() {
  return {
    lending_policy: createManagedLendingPolicy({
      collateral_policy: {
        assets: [
          {
            asset: 'USDC',
            max_allocation_pct: 50,
          },
          {
            asset: 'DAI',
            max_allocation_pct: 20,
          },
        ],
      },
      borrow_policy: {
        allowed_assets: ['USDC', 'DAI'],
      },
      risk_policy: {
        max_ltv_bps: 6800,
        min_health_factor: '1.3',
      },
    }),
  } satisfies ManagedMandateFixture;
}

describe('createPortfolioManagerDomain', () => {
  it('starts hire by moving into onboarding and requesting portfolio-manager setup input', async () => {
    const domain = createPortfolioManagerDomain({
      agentId: 'portfolio-manager',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'prehire',
          lastPortfolioState: null,
          lastSharedEmberRevision: null,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
          activeWalletAddress: null,
          pendingOnboardingWalletAddress: null,
        },
        operation: {
          source: 'command',
          name: 'hire',
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'onboarding',
        activeWalletAddress: null,
        pendingOnboardingWalletAddress: null,
      },
      outputs: {
        status: {
          executionStatus: 'interrupted',
          statusMessage: 'Connect the wallet you want the portfolio manager to onboard.',
        },
        interrupt: {
          type: 'portfolio-manager-setup-request',
          mirroredToActivity: false,
          message: 'Connect the wallet you want the portfolio manager to onboard.',
        },
      },
    });
  });

  it('turns the approved mandate envelope into a delegation-signing interrupt', async () => {
    const domain = createPortfolioManagerDomain({
      agentId: 'portfolio-manager',
      controllerWalletAddress: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'onboarding',
          lastPortfolioState: null,
          lastSharedEmberRevision: null,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
          activeWalletAddress: null,
          pendingOnboardingWalletAddress: null,
        },
        operation: {
          source: 'interrupt',
          name: 'portfolio-manager-setup-request',
          input: createPortfolioManagerSetupInput(),
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'onboarding',
        activeWalletAddress: '0x00000000000000000000000000000000000000a1',
        pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1',
      },
      outputs: {
        status: {
          executionStatus: 'interrupted',
          statusMessage:
            'Review and sign the delegation needed to activate your portfolio manager.',
        },
        interrupt: {
          type: 'portfolio-manager-delegation-signing-request',
          mirroredToActivity: false,
          message: 'Review and sign the delegation needed to activate your portfolio manager.',
          payload: {
            chainId: 42161,
            delegatorAddress: '0x00000000000000000000000000000000000000a1',
            delegateeAddress: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
            delegationManager: TEST_DELEGATION_MANAGER,
            descriptions: [
              'Authorize the portfolio manager to operate through your root delegation.',
            ],
            delegationsToSign: [
              expect.objectContaining({
                delegate: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
                delegator: '0x00000000000000000000000000000000000000a1',
                authority: ROOT_AUTHORITY,
                salt: '0x1111111111111111111111111111111111111111111111111111111111111111',
              }),
            ],
          },
        },
      },
    });
  });

  it('fails closed when onboarding reaches delegation signing without a configured controller smart-account address', async () => {
    const domain = createPortfolioManagerDomain({
      agentId: 'portfolio-manager',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'onboarding',
          lastPortfolioState: null,
          lastSharedEmberRevision: null,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
          activeWalletAddress: null,
          pendingOnboardingWalletAddress: null,
        },
        operation: {
          source: 'interrupt',
          name: 'portfolio-manager-setup-request',
          input: createPortfolioManagerSetupInput(),
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'onboarding',
        activeWalletAddress: null,
        pendingOnboardingWalletAddress: null,
      },
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Portfolio manager onboarding is blocked because the controller smart-account address is not configured.',
        },
      },
    });
  });

  it('completes onboarding after signed delegations are supplied through the signing interrupt', async () => {
    const signedDelegation = createSignedRootDelegation(TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS);
    const protocolHost = {
      handleJsonRpc: vi.fn(async (request: unknown) => {
        const jsonRpcRequest =
          typeof request === 'object' && request !== null
            ? (request as Record<string, unknown>)
            : null;
        const params =
          typeof jsonRpcRequest?.['params'] === 'object' && jsonRpcRequest['params'] !== null
            ? (jsonRpcRequest['params'] as Record<string, unknown>)
            : null;

        if (jsonRpcRequest?.['method'] === 'orchestrator.readAgentServiceIdentity.v1') {
          if (params?.['agent_id'] === 'portfolio-manager' && params['role'] === 'orchestrator') {
            return createAgentServiceIdentityResponse({
              agentId: 'portfolio-manager',
              role: 'orchestrator',
              walletAddress: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
            });
          }

          if (params?.['agent_id'] === 'ember-lending' && params['role'] === 'subagent') {
            return createAgentServiceIdentityResponse({
              agentId: 'ember-lending',
              role: 'subagent',
              walletAddress: '0x00000000000000000000000000000000000000e1',
            });
          }
        }

        if (jsonRpcRequest?.['method'] === 'subagent.readExecutionContext.v1') {
          expect(params?.['agent_id']).toBe('ember-lending');
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-read-execution-context',
            result: {
              protocol_version: 'v1',
              revision: 4,
              execution_context: {
                generated_at: '2026-04-02T15:00:00.000Z',
                network: 'arbitrum',
                mandate_ref: 'mandate-ember-lending-001',
                mandate_context: null,
                subagent_wallet_address: '0x00000000000000000000000000000000000000e1',
                root_user_wallet_address: '0x00000000000000000000000000000000000000a1',
                owned_units: [],
                wallet_contents: [],
              },
            },
          };
        }

        if (jsonRpcRequest?.['method'] === 'orchestrator.readOnboardingState.v1') {
          expect(params).toMatchObject({
            agent_id: 'ember-lending',
            wallet_address: '0x00000000000000000000000000000000000000a1',
            network: 'arbitrum',
          });
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-wallet-accounting-ember-lending-0x00000000000000000000000000000000000000a1',
            result: {
              revision: 4,
              onboarding_state: {
                wallet_address: '0x00000000000000000000000000000000000000a1',
                network: 'arbitrum',
                phase: 'active',
                proofs: {
                  rooted_wallet_context_registered: true,
                  root_delegation_registered: true,
                  root_authority_active: true,
                  wallet_baseline_observed: true,
                  accounting_units_seeded: true,
                  mandate_inputs_configured: true,
                  reserve_policy_configured: false,
                  capital_reserved_for_agent: true,
                  policy_snapshot_recorded: true,
                  initial_subagent_delegation_issued: true,
                  agent_active: true,
                },
                rooted_wallet_context: {
                  rooted_wallet_context_id: 'rwc-user-protocol-001',
                },
                root_delegation: {
                  root_delegation_id: 'root-user-protocol-001',
                },
                owned_units: [
                  {
                    unit_id: 'unit-usdc-protocol-001',
                    root_asset: 'USDC',
                    quantity: '10',
                    status: 'reserved',
                    control_path: 'lending.supply',
                    reservation_id: 'reservation-usdc-protocol-001',
                  },
                ],
                reservations: [
                  {
                    reservation_id: 'reservation-usdc-protocol-001',
                    agent_id: 'ember-lending',
                    purpose: 'position.enter',
                    status: 'active',
                    control_path: 'lending.supply',
                    unit_allocations: [
                      {
                        unit_id: 'unit-usdc-protocol-001',
                        quantity: '10',
                      },
                    ],
                  },
                ],
              },
            },
          };
        }

        return {
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-complete-rooted-bootstrap',
          result: {
            protocol_version: 'v1',
            revision: 3,
            committed_event_ids: ['evt-rooted-bootstrap-1', 'evt-rooted-bootstrap-2'],
            rooted_wallet_context_id: 'rwc-user-protocol-001',
            root_delegation: {
              root_delegation_id: 'root-user-protocol-001',
              user_wallet: '0x00000000000000000000000000000000000000a1',
              status: 'active',
            },
          },
        };
      }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 3,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 3,
        consumer_id: 'portfolio-manager',
        acknowledged_through_sequence: 0,
      })),
    };

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
      controllerWalletAddress: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'onboarding',
          lastPortfolioState: null,
          lastSharedEmberRevision: 0,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingApprovedSetup: {
            portfolioMandate: createPortfolioManagerSetupInput().portfolioMandate,
            firstManagedMandate: createPortfolioManagerSetupInput().firstManagedMandate,
          },
        },
        operation: {
          source: 'interrupt',
          name: 'portfolio-manager-delegation-signing-request',
          input: {
            outcome: 'signed',
            signedDelegations: [signedDelegation],
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'active',
        lastSharedEmberRevision: 4,
        lastRootDelegation: {
          root_delegation_id: 'root-user-protocol-001',
          user_wallet: '0x00000000000000000000000000000000000000a1',
          status: 'active',
        },
        lastRootedWalletContextId: 'rwc-user-protocol-001',
        activeWalletAddress: '0x00000000000000000000000000000000000000a1',
        pendingOnboardingWalletAddress: null,
      },
      domainProjectionUpdate: {
        managedMandateEditor: {
          mandateRef: expect.stringMatching(/^mandate-/),
          managedMandate: {
            lending_policy: createManagedLendingPolicy(),
          },
          rootUserWallet: '0x00000000000000000000000000000000000000a1',
          rootedWalletContextId: expect.stringMatching(/^rwc-/),
          reservation: null,
        },
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Portfolio manager onboarding complete. Agent is active.',
        },
        artifacts: [
          {
            data: {
              type: 'shared-ember-rooted-bootstrap',
              rootedWalletContextId: 'rwc-user-protocol-001',
            },
          },
        ],
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonrpc: '2.0',
        method: 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
        params: expect.objectContaining({
          idempotency_key: expect.stringMatching(/^idem-portfolio-manager-rooted-bootstrap-/),
          expected_revision: 0,
          onboarding: expect.objectContaining({
            rootedWalletContext: expect.objectContaining({
              wallet_address: '0x00000000000000000000000000000000000000a1',
              metadata: expect.objectContaining({
                approvedOnboardingSetup: {
                  portfolioMandate: {
                    approved: true,
                    riskLevel: 'medium',
                  },
                  firstManagedMandate: {
                    targetAgentId: 'ember-lending',
                    targetAgentKey: 'ember-lending-primary',
                    managedMandate: {
                      lending_policy: createManagedLendingPolicy(),
                    },
                  },
                },
              }),
            }),
            userReservePolicies: [
              {
                reserve_policy_ref: expect.stringContaining('reserve-policy-'),
                summary: 'allow managed lending to admit allocable idle USDC',
                user_reserve_rules: [
                  {
                    root_asset: 'USDC',
                    network: 'arbitrum',
                    benchmark_asset: 'USD',
                    reserved_quantity: '0',
                    reason: 'allow managed lending to admit allocable idle USDC',
                  },
                ],
              },
            ],
            mandates: [
              {
                mandate_ref: expect.stringContaining('mandate-'),
                agent_id: 'portfolio-manager',
                managed_mandate: null,
              },
              {
                mandate_ref: expect.stringContaining('mandate-'),
                agent_id: 'ember-lending',
                managed_mandate: {
                  lending_policy: createManagedLendingPolicy(),
                },
              },
            ],
            activation: {
              mandateRef: expect.stringContaining('mandate-'),
            },
          }),
          handoff: expect.objectContaining({
            user_wallet: '0x00000000000000000000000000000000000000a1',
            orchestrator_wallet: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
            signer_kind: 'delegation_toolkit',
          }),
        }),
      }),
    );
    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonrpc: '2.0',
        method: 'subagent.readExecutionContext.v1',
        params: {
          agent_id: 'ember-lending',
        },
      }),
    );
    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonrpc: '2.0',
        method: 'orchestrator.readOnboardingState.v1',
        params: {
          agent_id: 'ember-lending',
          wallet_address: '0x00000000000000000000000000000000000000a1',
          network: 'arbitrum',
        },
      }),
    );

    const rootedBootstrapCall = (
      protocolHost.handleJsonRpc.mock.calls as unknown as Array<[unknown]>
    ).find(
      ([request]) =>
        typeof request === 'object' &&
        request !== null &&
        'method' in request &&
        request.method === 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
    );
    expect(rootedBootstrapCall).toBeDefined();
    if (!rootedBootstrapCall) {
      throw new Error('expected rooted bootstrap Shared Ember request');
    }

    const rootedBootstrapRequest = rootedBootstrapCall[0] as {
      params?: {
        onboarding?: {
          mandates?: Array<{
            mandate_ref?: string;
            agent_id?: string;
          }>;
          activation?: {
            mandateRef?: string;
          };
        } & Record<string, unknown>;
        handoff?: {
          artifact_ref?: string;
        };
      };
    };

    const managedMandateRef = rootedBootstrapRequest.params?.onboarding?.mandates?.find(
      (mandate) => mandate.agent_id === 'ember-lending',
    )?.mandate_ref;
    expect(managedMandateRef).toEqual(expect.any(String));
    expect(rootedBootstrapRequest.params?.onboarding?.activation?.mandateRef).toBe(
      managedMandateRef,
    );
    expect(rootedBootstrapRequest.params?.handoff).toMatchObject({
      artifact_ref: expect.stringMatching(/^metamask-delegation:/),
    });
    expect(
      decodeDelegationArtifactRef(rootedBootstrapRequest.params?.handoff?.artifact_ref as string),
    ).toEqual(signedDelegation);

    expect(rootedBootstrapRequest.params?.onboarding).not.toHaveProperty('capitalObservation');
    expect(rootedBootstrapRequest.params?.onboarding).not.toHaveProperty('ownedUnits');
    expect(rootedBootstrapRequest.params?.onboarding).not.toHaveProperty('reservations');
    expect(rootedBootstrapRequest.params?.onboarding).not.toHaveProperty('policySnapshots');
  });

  it('keeps onboarding pending when Shared Ember cannot admit the mandate asset after signing', async () => {
    const signedDelegation = createSignedRootDelegation(TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS);
    const protocolHost = {
      handleJsonRpc: vi.fn(async (request: unknown) => {
        const jsonRpcRequest =
          typeof request === 'object' && request !== null
            ? (request as Record<string, unknown>)
            : null;
        const params =
          typeof jsonRpcRequest?.['params'] === 'object' && jsonRpcRequest['params'] !== null
            ? (jsonRpcRequest['params'] as Record<string, unknown>)
            : null;

        if (jsonRpcRequest?.['method'] === 'orchestrator.readAgentServiceIdentity.v1') {
          if (params?.['agent_id'] === 'portfolio-manager' && params['role'] === 'orchestrator') {
            return createAgentServiceIdentityResponse({
              agentId: 'portfolio-manager',
              role: 'orchestrator',
              walletAddress: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
            });
          }

          if (params?.['agent_id'] === 'ember-lending' && params['role'] === 'subagent') {
            return createAgentServiceIdentityResponse({
              agentId: 'ember-lending',
              role: 'subagent',
              walletAddress: '0x00000000000000000000000000000000000000e1',
            });
          }
        }

        if (jsonRpcRequest?.['method'] === 'subagent.readExecutionContext.v1') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-read-execution-context',
            result: {
              protocol_version: 'v1',
              revision: 4,
              execution_context: {
                generated_at: '2026-04-02T15:00:00.000Z',
                network: 'arbitrum',
                mandate_ref: 'mandate-ember-lending-001',
                mandate_context: null,
                subagent_wallet_address: '0x00000000000000000000000000000000000000e1',
                root_user_wallet_address: '0x00000000000000000000000000000000000000a1',
                owned_units: [],
                wallet_contents: [],
              },
            },
          };
        }

        if (jsonRpcRequest?.['method'] === 'orchestrator.readOnboardingState.v1') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-wallet-accounting-ember-lending-0x00000000000000000000000000000000000000a1',
            result: {
              revision: 4,
              onboarding_state: {
                wallet_address: '0x00000000000000000000000000000000000000a1',
                network: 'arbitrum',
                phase: 'ingested',
                proofs: {
                  rooted_wallet_context_registered: true,
                  root_delegation_registered: true,
                  root_authority_active: true,
                  wallet_baseline_observed: true,
                  accounting_units_seeded: true,
                  mandate_inputs_configured: true,
                  reserve_policy_configured: false,
                  capital_reserved_for_agent: false,
                  policy_snapshot_recorded: false,
                  initial_subagent_delegation_issued: false,
                  agent_active: false,
                },
                rooted_wallet_context: {
                  rooted_wallet_context_id: 'rwc-user-protocol-001',
                },
                root_delegation: {
                  root_delegation_id: 'root-user-protocol-001',
                },
                owned_units: [
                  {
                    unit_id: 'unit-eth-protocol-001',
                    root_asset: 'ETH',
                    quantity: '1.5',
                    status: 'free',
                    control_path: 'unassigned',
                    reservation_id: null,
                  },
                  {
                    unit_id: 'unit-usdc-protocol-001',
                    root_asset: 'USDC',
                    quantity: '10',
                    status: 'free',
                    control_path: 'unassigned',
                    reservation_id: null,
                  },
                ],
                reservations: [],
              },
            },
          };
        }

        return {
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-complete-rooted-bootstrap',
          result: {
            protocol_version: 'v1',
            revision: 3,
            committed_event_ids: ['evt-rooted-bootstrap-1', 'evt-rooted-bootstrap-2'],
            rooted_wallet_context_id: 'rwc-user-protocol-001',
            root_delegation: {
              root_delegation_id: 'root-user-protocol-001',
              user_wallet: '0x00000000000000000000000000000000000000a1',
              status: 'active',
            },
          },
        };
      }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 3,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 3,
        consumer_id: 'portfolio-manager',
        acknowledged_through_sequence: 0,
      })),
    };

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
      controllerWalletAddress: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'onboarding',
          lastPortfolioState: null,
          lastSharedEmberRevision: 0,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingApprovedSetup: {
            portfolioMandate: createPortfolioManagerSetupInput().portfolioMandate,
            firstManagedMandate: {
              ...createPortfolioManagerSetupInput().firstManagedMandate,
              managedMandate: {
                ...createPortfolioManagerSetupInput().firstManagedMandate.managedMandate,
                lending_policy: createManagedLendingPolicy({
                  collateral_policy: {
                    assets: [
                      {
                        asset: 'WETH',
                        max_allocation_pct: 35,
                      },
                    ],
                  },
                }),
              },
            },
          },
        },
        operation: {
          source: 'interrupt',
          name: 'portfolio-manager-delegation-signing-request',
          input: {
            outcome: 'signed',
            signedDelegations: [signedDelegation],
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'onboarding',
        lastSharedEmberRevision: 4,
        lastRootedWalletContextId: 'rwc-user-protocol-001',
        activeWalletAddress: '0x00000000000000000000000000000000000000a1',
        pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1',
      },
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Portfolio manager onboarding is not complete because Shared Ember could not admit any WETH for lending. Wallet accounting currently shows ETH, USDC. Deposit or wrap WETH in the wallet, then retry onboarding.',
        },
      },
    });
  });

  it('fails fast before rooted bootstrap when the managed ember-lending identity is missing', async () => {
    const signedDelegation = {
      delegate: '0x00000000000000000000000000000000000000c1',
      delegator: '0x00000000000000000000000000000000000000a1',
      authority: ROOT_AUTHORITY,
      caveats: [],
      salt: '0x1111111111111111111111111111111111111111111111111111111111111111',
      signature: '0x1234',
    };
    const protocolHost = {
      handleJsonRpc: vi.fn(async (request: unknown) => {
        const jsonRpcRequest =
          typeof request === 'object' && request !== null
            ? (request as Record<string, unknown>)
            : null;

        if (jsonRpcRequest?.['method'] === 'orchestrator.readAgentServiceIdentity.v1') {
          const params =
            typeof jsonRpcRequest['params'] === 'object' && jsonRpcRequest['params'] !== null
              ? (jsonRpcRequest['params'] as Record<string, unknown>)
              : null;

          if (params?.['agent_id'] === 'portfolio-manager' && params['role'] === 'orchestrator') {
            return {
              jsonrpc: '2.0',
              id: 'rpc-agent-service-identity-read',
              result: {
                revision: 2,
                agent_service_identity: {
                  identity_ref: 'agent-service-identity-portfolio-manager-orchestrator-1',
                  agent_id: 'portfolio-manager',
                  role: 'orchestrator',
                  wallet_address: '0x00000000000000000000000000000000000000c1',
                  wallet_source: 'ember_local_write',
                  capability_metadata: {
                    onboarding: true,
                    root_registration: true,
                  },
                  registration_version: 1,
                  registered_at: '2026-04-01T00:00:00.000Z',
                },
              },
            };
          }

          if (params?.['agent_id'] === 'ember-lending' && params['role'] === 'subagent') {
            return {
              jsonrpc: '2.0',
              id: 'rpc-agent-service-identity-read',
              result: {
                revision: 2,
                agent_service_identity: null,
              },
            };
          }
        }

        return {
          jsonrpc: '2.0',
          id: 'unexpected',
          result: {},
        };
      }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 2,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 2,
        consumer_id: 'portfolio-manager',
        acknowledged_through_sequence: 0,
      })),
    };

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
      controllerWalletAddress: '0x00000000000000000000000000000000000000c1',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'onboarding',
          lastPortfolioState: null,
          lastSharedEmberRevision: 2,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingApprovedSetup: {
            portfolioMandate: createPortfolioManagerSetupInput().portfolioMandate,
            firstManagedMandate: createPortfolioManagerSetupInput().firstManagedMandate,
          },
        },
        operation: {
          source: 'interrupt',
          name: 'portfolio-manager-delegation-signing-request',
          input: {
            outcome: 'signed',
            signedDelegations: [signedDelegation],
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'onboarding',
        activeWalletAddress: '0x00000000000000000000000000000000000000a1',
        pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1',
      },
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Portfolio manager onboarding is blocked until the ember-lending service registers its subagent identity in Shared Ember.',
        },
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 'rpc-agent-service-identity-read',
      method: 'orchestrator.readAgentServiceIdentity.v1',
      params: {
        agent_id: 'portfolio-manager',
        role: 'orchestrator',
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 'rpc-agent-service-identity-read',
      method: 'orchestrator.readAgentServiceIdentity.v1',
      params: {
        agent_id: 'ember-lending',
        role: 'subagent',
      },
    });
    expect(protocolHost.handleJsonRpc).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
      }),
    );
  });

  it('uses a distinct rooted-bootstrap idempotency key when signing input changes on the same thread', async () => {
    const firstSignedDelegation = createSignedRootDelegation(TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS);
    const secondSignedDelegation = {
      ...createSignedRootDelegation(TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS),
      signature: '0x5678' as const,
    };
    const rootedBootstrapKeys: string[] = [];
    const protocolHost = {
      handleJsonRpc: vi.fn(async (request: unknown) => {
        const jsonRpcRequest =
          typeof request === 'object' && request !== null
            ? (request as Record<string, unknown>)
            : null;
        const params =
          typeof jsonRpcRequest?.['params'] === 'object' && jsonRpcRequest['params'] !== null
            ? (jsonRpcRequest['params'] as Record<string, unknown>)
            : null;

        if (jsonRpcRequest?.['method'] === 'orchestrator.readAgentServiceIdentity.v1') {
          if (params?.['agent_id'] === 'portfolio-manager' && params['role'] === 'orchestrator') {
            return createAgentServiceIdentityResponse({
              agentId: 'portfolio-manager',
              role: 'orchestrator',
              walletAddress: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
            });
          }

          if (params?.['agent_id'] === 'ember-lending' && params['role'] === 'subagent') {
            return createAgentServiceIdentityResponse({
              agentId: 'ember-lending',
              role: 'subagent',
              walletAddress: '0x00000000000000000000000000000000000000e1',
            });
          }
        }

        if (
          jsonRpcRequest?.['method'] === 'orchestrator.completeRootedBootstrapFromUserSigning.v1'
        ) {
          const idempotencyKey = params?.['idempotency_key'];
          if (typeof idempotencyKey !== 'string') {
            throw new Error('expected rooted-bootstrap idempotency key');
          }
          rootedBootstrapKeys.push(idempotencyKey);
        }

        if (jsonRpcRequest?.['method'] === 'subagent.readExecutionContext.v1') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-read-execution-context',
            result: {
              protocol_version: 'v1',
              revision: 4,
              execution_context: {
                generated_at: '2026-04-02T15:00:00.000Z',
                network: 'arbitrum',
                mandate_ref: 'mandate-ember-lending-001',
                mandate_context: null,
                subagent_wallet_address: '0x00000000000000000000000000000000000000e1',
                root_user_wallet_address: '0x00000000000000000000000000000000000000a1',
                owned_units: [],
                wallet_contents: [],
              },
            },
          };
        }

        if (jsonRpcRequest?.['method'] === 'orchestrator.readOnboardingState.v1') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-wallet-accounting-ember-lending-0x00000000000000000000000000000000000000a1',
            result: {
              revision: 4,
              onboarding_state: {
                wallet_address: '0x00000000000000000000000000000000000000a1',
                network: 'arbitrum',
                phase: 'active',
                proofs: {
                  rooted_wallet_context_registered: true,
                  root_delegation_registered: true,
                  root_authority_active: true,
                  wallet_baseline_observed: true,
                  accounting_units_seeded: true,
                  mandate_inputs_configured: true,
                  reserve_policy_configured: false,
                  capital_reserved_for_agent: true,
                  policy_snapshot_recorded: true,
                  initial_subagent_delegation_issued: true,
                  agent_active: true,
                },
                rooted_wallet_context: {
                  rooted_wallet_context_id: 'rwc-user-protocol-001',
                },
                root_delegation: {
                  root_delegation_id: 'root-user-protocol-001',
                },
                owned_units: [],
                reservations: [],
              },
            },
          };
        }

        return {
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-complete-rooted-bootstrap',
          result: {
            protocol_version: 'v1',
            revision: 3,
            committed_event_ids: ['evt-rooted-bootstrap-1', 'evt-rooted-bootstrap-2'],
            rooted_wallet_context_id: 'rwc-user-protocol-001',
            root_delegation: {
              root_delegation_id: 'root-user-protocol-001',
              user_wallet: '0x00000000000000000000000000000000000000a1',
              status: 'active',
            },
          },
        };
      }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 3,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 3,
        consumer_id: 'portfolio-manager',
        acknowledged_through_sequence: 0,
      })),
    };

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
      controllerWalletAddress: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
    });

    const baseState = {
      phase: 'onboarding' as const,
      lastPortfolioState: null,
      lastSharedEmberRevision: 0,
      lastRootDelegation: null,
      lastOnboardingBootstrap: null,
      lastRootedWalletContextId: null,
      activeWalletAddress: '0x00000000000000000000000000000000000000a1' as const,
      pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1' as const,
      pendingApprovedSetup: {
        portfolioMandate: createPortfolioManagerSetupInput().portfolioMandate,
        firstManagedMandate: createPortfolioManagerSetupInput().firstManagedMandate,
      },
    };

    await domain.handleOperation?.({
      threadId: 'thread-1',
      state: baseState,
      operation: {
        source: 'interrupt',
        name: 'portfolio-manager-delegation-signing-request',
        input: {
          outcome: 'signed',
          signedDelegations: [firstSignedDelegation],
        },
      },
    });

    await domain.handleOperation?.({
      threadId: 'thread-1',
      state: baseState,
      operation: {
        source: 'interrupt',
        name: 'portfolio-manager-delegation-signing-request',
        input: {
          outcome: 'signed',
          signedDelegations: [secondSignedDelegation],
        },
      },
    });

    expect(rootedBootstrapKeys).toHaveLength(2);
    expect(rootedBootstrapKeys[0]).not.toBe(rootedBootstrapKeys[1]);
  });

  it('fails fast before rooted bootstrap when the managed ember-lending identity echo is misaddressed', async () => {
    const signedDelegation = {
      delegate: '0x00000000000000000000000000000000000000c1',
      delegator: '0x00000000000000000000000000000000000000a1',
      authority: ROOT_AUTHORITY,
      caveats: [],
      salt: '0x1111111111111111111111111111111111111111111111111111111111111111',
      signature: '0x1234',
    };
    const protocolHost = {
      handleJsonRpc: vi.fn(async (request: unknown) => {
        const jsonRpcRequest =
          typeof request === 'object' && request !== null
            ? (request as Record<string, unknown>)
            : null;
        const params =
          typeof jsonRpcRequest?.['params'] === 'object' && jsonRpcRequest['params'] !== null
            ? (jsonRpcRequest['params'] as Record<string, unknown>)
            : null;

        if (jsonRpcRequest?.['method'] === 'orchestrator.readAgentServiceIdentity.v1') {
          if (params?.['agent_id'] === 'portfolio-manager' && params['role'] === 'orchestrator') {
            return createAgentServiceIdentityResponse({
              agentId: 'portfolio-manager',
              role: 'orchestrator',
              walletAddress: '0x00000000000000000000000000000000000000c1',
            });
          }

          if (params?.['agent_id'] === 'ember-lending' && params['role'] === 'subagent') {
            return createAgentServiceIdentityResponse({
              agentId: 'portfolio-manager',
              role: 'orchestrator',
              walletAddress: '0x00000000000000000000000000000000000000e1',
            });
          }
        }

        throw new Error(
          `Unexpected Shared Ember JSON-RPC method: ${String(jsonRpcRequest?.['method'])}`,
        );
      }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 2,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 2,
        consumer_id: 'portfolio-manager',
        acknowledged_through_sequence: 0,
      })),
    };

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
      controllerWalletAddress: '0x00000000000000000000000000000000000000c1',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'onboarding',
          lastPortfolioState: null,
          lastSharedEmberRevision: 2,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingApprovedSetup: {
            portfolioMandate: createPortfolioManagerSetupInput().portfolioMandate,
            firstManagedMandate: createPortfolioManagerSetupInput().firstManagedMandate,
          },
        },
        operation: {
          source: 'interrupt',
          name: 'portfolio-manager-delegation-signing-request',
          input: {
            outcome: 'signed',
            signedDelegations: [signedDelegation],
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'onboarding',
        activeWalletAddress: '0x00000000000000000000000000000000000000a1',
        pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1',
      },
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Portfolio manager onboarding is blocked until the ember-lending service registers its subagent identity in Shared Ember.',
        },
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 'rpc-agent-service-identity-read',
      method: 'orchestrator.readAgentServiceIdentity.v1',
      params: {
        agent_id: 'ember-lending',
        role: 'subagent',
      },
    });
    expect(protocolHost.handleJsonRpc).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'subagent.readPortfolioState.v1',
      }),
    );
    expect(protocolHost.handleJsonRpc).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
      }),
    );
  });

  it('fails fast before rooted bootstrap when the portfolio-manager orchestrator identity is missing', async () => {
    const signedDelegation = {
      delegate: '0x00000000000000000000000000000000000000c1',
      delegator: '0x00000000000000000000000000000000000000a1',
      authority: ROOT_AUTHORITY,
      caveats: [],
      salt: '0x1111111111111111111111111111111111111111111111111111111111111111',
      signature: '0x1234',
    };
    const protocolHost = {
      handleJsonRpc: vi.fn(async (request: unknown) => {
        const jsonRpcRequest =
          typeof request === 'object' && request !== null
            ? (request as Record<string, unknown>)
            : null;
        const params =
          typeof jsonRpcRequest?.['params'] === 'object' && jsonRpcRequest['params'] !== null
            ? (jsonRpcRequest['params'] as Record<string, unknown>)
            : null;

        if (
          jsonRpcRequest?.['method'] === 'orchestrator.readAgentServiceIdentity.v1' &&
          params?.['agent_id'] === 'portfolio-manager' &&
          params['role'] === 'orchestrator'
        ) {
          return {
            jsonrpc: '2.0',
            id: 'rpc-agent-service-identity-read',
            result: {
              revision: 2,
              agent_service_identity: null,
            },
          };
        }

        throw new Error(
          `Unexpected Shared Ember JSON-RPC method: ${String(jsonRpcRequest?.['method'])}`,
        );
      }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 2,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 2,
        consumer_id: 'portfolio-manager',
        acknowledged_through_sequence: 0,
      })),
    };

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
      controllerWalletAddress: '0x00000000000000000000000000000000000000c1',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'onboarding',
          lastPortfolioState: null,
          lastSharedEmberRevision: 2,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingApprovedSetup: {
            portfolioMandate: createPortfolioManagerSetupInput().portfolioMandate,
            firstManagedMandate: createPortfolioManagerSetupInput().firstManagedMandate,
          },
        },
        operation: {
          source: 'interrupt',
          name: 'portfolio-manager-delegation-signing-request',
          input: {
            outcome: 'signed',
            signedDelegations: [signedDelegation],
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'onboarding',
        activeWalletAddress: '0x00000000000000000000000000000000000000a1',
        pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1',
      },
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Portfolio manager onboarding is blocked until the portfolio-manager service registers its orchestrator identity in Shared Ember.',
        },
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 'rpc-agent-service-identity-read',
      method: 'orchestrator.readAgentServiceIdentity.v1',
      params: {
        agent_id: 'portfolio-manager',
        role: 'orchestrator',
      },
    });
    expect(protocolHost.handleJsonRpc).not.toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          agent_id: 'ember-lending',
          role: 'subagent',
        }),
      }),
    );
    expect(protocolHost.handleJsonRpc).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
      }),
    );
  });

  it('fails fast before rooted bootstrap when the portfolio-manager orchestrator identity echo is misaddressed', async () => {
    const signedDelegation = {
      delegate: '0x00000000000000000000000000000000000000c1',
      delegator: '0x00000000000000000000000000000000000000a1',
      authority: ROOT_AUTHORITY,
      caveats: [],
      salt: '0x1111111111111111111111111111111111111111111111111111111111111111',
      signature: '0x1234',
    };
    const protocolHost = {
      handleJsonRpc: vi.fn(async (request: unknown) => {
        const jsonRpcRequest =
          typeof request === 'object' && request !== null
            ? (request as Record<string, unknown>)
            : null;
        const params =
          typeof jsonRpcRequest?.['params'] === 'object' && jsonRpcRequest['params'] !== null
            ? (jsonRpcRequest['params'] as Record<string, unknown>)
            : null;

        if (
          jsonRpcRequest?.['method'] === 'orchestrator.readAgentServiceIdentity.v1' &&
          params?.['agent_id'] === 'portfolio-manager' &&
          params['role'] === 'orchestrator'
        ) {
          return createAgentServiceIdentityResponse({
            agentId: 'ember-lending',
            role: 'subagent',
            walletAddress: '0x00000000000000000000000000000000000000c1',
          });
        }

        throw new Error(
          `Unexpected Shared Ember JSON-RPC method: ${String(jsonRpcRequest?.['method'])}`,
        );
      }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 2,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 2,
        consumer_id: 'portfolio-manager',
        acknowledged_through_sequence: 0,
      })),
    };

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
      controllerWalletAddress: '0x00000000000000000000000000000000000000c1',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'onboarding',
          lastPortfolioState: null,
          lastSharedEmberRevision: 2,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingApprovedSetup: {
            portfolioMandate: createPortfolioManagerSetupInput().portfolioMandate,
            firstManagedMandate: createPortfolioManagerSetupInput().firstManagedMandate,
          },
        },
        operation: {
          source: 'interrupt',
          name: 'portfolio-manager-delegation-signing-request',
          input: {
            outcome: 'signed',
            signedDelegations: [signedDelegation],
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'onboarding',
        activeWalletAddress: '0x00000000000000000000000000000000000000a1',
        pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1',
      },
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Portfolio manager onboarding is blocked until the portfolio-manager service registers its orchestrator identity in Shared Ember.',
        },
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 'rpc-agent-service-identity-read',
      method: 'orchestrator.readAgentServiceIdentity.v1',
      params: {
        agent_id: 'portfolio-manager',
        role: 'orchestrator',
      },
    });
    expect(protocolHost.handleJsonRpc).not.toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          agent_id: 'ember-lending',
          role: 'subagent',
        }),
      }),
    );
    expect(protocolHost.handleJsonRpc).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
      }),
    );
  });

  it('fails closed after rooted bootstrap when the managed ember-lending execution context still has no subagent wallet', async () => {
    const signedDelegation = {
      delegate: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
      delegator: '0x00000000000000000000000000000000000000a1',
      authority: ROOT_AUTHORITY,
      caveats: [],
      salt: '0x1111111111111111111111111111111111111111111111111111111111111111',
      signature: '0x1234',
    };
    const protocolHost = {
      handleJsonRpc: vi.fn(async (request: unknown) => {
        const jsonRpcRequest =
          typeof request === 'object' && request !== null
            ? (request as Record<string, unknown>)
            : null;
        const params =
          typeof jsonRpcRequest?.['params'] === 'object' && jsonRpcRequest['params'] !== null
            ? (jsonRpcRequest['params'] as Record<string, unknown>)
            : null;

        if (jsonRpcRequest?.['method'] === 'orchestrator.readAgentServiceIdentity.v1') {
          if (params?.['agent_id'] === 'portfolio-manager' && params['role'] === 'orchestrator') {
            return createAgentServiceIdentityResponse({
              agentId: 'portfolio-manager',
              role: 'orchestrator',
              walletAddress: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
            });
          }

          if (params?.['agent_id'] === 'ember-lending' && params['role'] === 'subagent') {
            return createAgentServiceIdentityResponse({
              agentId: 'ember-lending',
              role: 'subagent',
              walletAddress: '0x00000000000000000000000000000000000000e1',
            });
          }
        }

        if (jsonRpcRequest?.['method'] === 'subagent.readExecutionContext.v1') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-read-execution-context',
            result: {
              protocol_version: 'v1',
              revision: 4,
              execution_context: {
                generated_at: '2026-04-02T15:15:00.000Z',
                network: 'arbitrum',
                mandate_ref: 'mandate-ember-lending-001',
                mandate_context: null,
                subagent_wallet_address: null,
                root_user_wallet_address: '0x00000000000000000000000000000000000000a1',
                owned_units: [],
                wallet_contents: [],
              },
            },
          };
        }

        if (jsonRpcRequest?.['method'] === 'orchestrator.readOnboardingState.v1') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-wallet-accounting-ember-lending-0x00000000000000000000000000000000000000a1',
            result: {
              revision: 4,
              onboarding_state: {
                wallet_address: '0x00000000000000000000000000000000000000a1',
                network: 'arbitrum',
                phase: 'ingested',
                proofs: {
                  rooted_wallet_context_registered: true,
                  root_delegation_registered: true,
                  root_authority_active: true,
                  wallet_baseline_observed: true,
                  accounting_units_seeded: true,
                  mandate_inputs_configured: true,
                  reserve_policy_configured: false,
                  capital_reserved_for_agent: false,
                  policy_snapshot_recorded: false,
                  initial_subagent_delegation_issued: false,
                  agent_active: false,
                },
                rooted_wallet_context: {
                  rooted_wallet_context_id: 'rwc-user-protocol-001',
                },
                root_delegation: {
                  root_delegation_id: 'root-user-protocol-001',
                },
                owned_units: [],
                reservations: [],
              },
            },
          };
        }

        return {
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-complete-rooted-bootstrap',
          result: {
            protocol_version: 'v1',
            revision: 3,
            committed_event_ids: ['evt-rooted-bootstrap-1', 'evt-rooted-bootstrap-2'],
            rooted_wallet_context_id: 'rwc-user-protocol-001',
            root_delegation: {
              root_delegation_id: 'root-user-protocol-001',
              user_wallet: '0x00000000000000000000000000000000000000a1',
              status: 'active',
            },
          },
        };
      }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 4,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 4,
        consumer_id: 'portfolio-manager',
        acknowledged_through_sequence: 0,
      })),
    };

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
      controllerWalletAddress: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'onboarding',
          lastPortfolioState: null,
          lastSharedEmberRevision: 0,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingApprovedSetup: {
            portfolioMandate: createPortfolioManagerSetupInput().portfolioMandate,
            firstManagedMandate: createPortfolioManagerSetupInput().firstManagedMandate,
          },
        },
        operation: {
          source: 'interrupt',
          name: 'portfolio-manager-delegation-signing-request',
          input: {
            outcome: 'signed',
            signedDelegations: [signedDelegation],
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'onboarding',
        lastSharedEmberRevision: 4,
        lastRootDelegation: {
          root_delegation_id: 'root-user-protocol-001',
          user_wallet: '0x00000000000000000000000000000000000000a1',
          status: 'active',
        },
        lastRootedWalletContextId: 'rwc-user-protocol-001',
        activeWalletAddress: '0x00000000000000000000000000000000000000a1',
        pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1',
      },
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Portfolio manager onboarding is blocked because ember-lending did not expose a non-null subagent wallet in Shared Ember execution context after rooted bootstrap.',
        },
        artifacts: [
          {
            data: {
              type: 'shared-ember-rooted-bootstrap',
              rootedWalletContextId: 'rwc-user-protocol-001',
            },
          },
        ],
      },
    });
  });

  it('fails fast before subagent activation when the registered orchestrator wallet does not match the session controller wallet', async () => {
    const signedDelegation = {
      delegate: '0x00000000000000000000000000000000000000c1',
      delegator: '0x00000000000000000000000000000000000000a1',
      authority: ROOT_AUTHORITY,
      caveats: [],
      salt: '0x1111111111111111111111111111111111111111111111111111111111111111',
      signature: '0x1234',
    };
    const protocolHost = {
      handleJsonRpc: vi.fn(async (request: unknown) => {
        const jsonRpcRequest =
          typeof request === 'object' && request !== null
            ? (request as Record<string, unknown>)
            : null;
        const params =
          typeof jsonRpcRequest?.['params'] === 'object' && jsonRpcRequest['params'] !== null
            ? (jsonRpcRequest['params'] as Record<string, unknown>)
            : null;

        if (
          jsonRpcRequest?.['method'] === 'orchestrator.readAgentServiceIdentity.v1' &&
          params?.['agent_id'] === 'portfolio-manager' &&
          params['role'] === 'orchestrator'
        ) {
          return createAgentServiceIdentityResponse({
            agentId: 'portfolio-manager',
            role: 'orchestrator',
            walletAddress: '0x00000000000000000000000000000000000000d1',
          });
        }

        return {
          jsonrpc: '2.0',
          id: 'unexpected',
          result: {},
        };
      }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 2,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 2,
        consumer_id: 'portfolio-manager',
        acknowledged_through_sequence: 0,
      })),
    };

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
      controllerWalletAddress: '0x00000000000000000000000000000000000000c1',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'onboarding',
          lastPortfolioState: null,
          lastSharedEmberRevision: 2,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingApprovedSetup: {
            portfolioMandate: createPortfolioManagerSetupInput().portfolioMandate,
            firstManagedMandate: createPortfolioManagerSetupInput().firstManagedMandate,
          },
        },
        operation: {
          source: 'interrupt',
          name: 'portfolio-manager-delegation-signing-request',
          input: {
            outcome: 'signed',
            signedDelegations: [signedDelegation],
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'onboarding',
        activeWalletAddress: '0x00000000000000000000000000000000000000a1',
        pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1',
      },
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Portfolio manager onboarding is blocked because the registered portfolio-manager orchestrator wallet does not match this session controller wallet.',
        },
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledTimes(1);
    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 'rpc-agent-service-identity-read',
      method: 'orchestrator.readAgentServiceIdentity.v1',
      params: {
        agent_id: 'portfolio-manager',
        role: 'orchestrator',
      },
    });
  });

  it('returns to prehire and clears wallet-local state when delegation signing is rejected', async () => {
    const domain = createPortfolioManagerDomain({
      agentId: 'portfolio-manager',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'onboarding',
          lastPortfolioState: null,
          lastSharedEmberRevision: null,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingApprovedSetup: {
            portfolioMandate: createPortfolioManagerSetupInput().portfolioMandate,
            firstManagedMandate: createPortfolioManagerSetupInput().firstManagedMandate,
          },
        },
        operation: {
          source: 'interrupt',
          name: 'portfolio-manager-delegation-signing-request',
          input: {
            outcome: 'rejected',
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
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
    });
  });

  it('reads the current Shared Ember revision before completing onboarding when the thread has no cached revision', async () => {
    const signedDelegation = {
      delegate: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
      delegator: '0x00000000000000000000000000000000000000a1',
      authority: ROOT_AUTHORITY,
      caveats: [],
      salt: '0x1111111111111111111111111111111111111111111111111111111111111111',
      signature: '0x1234',
    };
    const protocolHost = {
      handleJsonRpc: vi.fn(async (request: unknown) => {
        const jsonRpcRequest =
          typeof request === 'object' && request !== null
            ? (request as Record<string, unknown>)
            : null;
        const params =
          typeof jsonRpcRequest?.['params'] === 'object' && jsonRpcRequest['params'] !== null
            ? (jsonRpcRequest['params'] as Record<string, unknown>)
            : null;

        if (jsonRpcRequest?.['method'] === 'orchestrator.readAgentServiceIdentity.v1') {
          if (params?.['agent_id'] === 'portfolio-manager' && params['role'] === 'orchestrator') {
            return createAgentServiceIdentityResponse({
              agentId: 'portfolio-manager',
              role: 'orchestrator',
              walletAddress: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
            });
          }

          if (params?.['agent_id'] === 'ember-lending' && params['role'] === 'subagent') {
            return createAgentServiceIdentityResponse({
              agentId: 'ember-lending',
              role: 'subagent',
              walletAddress: '0x00000000000000000000000000000000000000e1',
            });
          }
        }

        if (
          typeof request === 'object' &&
          request !== null &&
          'method' in request &&
          request.method === 'subagent.readPortfolioState.v1'
        ) {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-read-current-revision',
            result: {
              protocol_version: 'v1',
              revision: 3,
              portfolio_state: {
                agent_id: 'portfolio-manager',
                owned_units: [],
                reservations: [],
              },
            },
          };
        }

        if (
          typeof request === 'object' &&
          request !== null &&
          'method' in request &&
          request.method === 'subagent.readExecutionContext.v1'
        ) {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-read-execution-context',
            result: {
              protocol_version: 'v1',
              revision: 4,
              execution_context: {
                generated_at: '2026-04-02T15:10:00.000Z',
                network: 'arbitrum',
                mandate_ref: 'mandate-ember-lending-001',
                mandate_context: null,
                subagent_wallet_address: '0x00000000000000000000000000000000000000e1',
                root_user_wallet_address: '0x00000000000000000000000000000000000000a1',
                owned_units: [],
                wallet_contents: [],
              },
            },
          };
        }

        if (
          typeof request === 'object' &&
          request !== null &&
          'method' in request &&
          request.method === 'orchestrator.readOnboardingState.v1'
        ) {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-wallet-accounting-ember-lending-0x00000000000000000000000000000000000000a1',
            result: {
              revision: 4,
              onboarding_state: {
                wallet_address: '0x00000000000000000000000000000000000000a1',
                network: 'arbitrum',
                phase: 'active',
                proofs: {
                  rooted_wallet_context_registered: true,
                  root_delegation_registered: true,
                  root_authority_active: true,
                  wallet_baseline_observed: true,
                  accounting_units_seeded: true,
                  mandate_inputs_configured: true,
                  reserve_policy_configured: false,
                  capital_reserved_for_agent: true,
                  policy_snapshot_recorded: true,
                  initial_subagent_delegation_issued: true,
                  agent_active: true,
                },
                rooted_wallet_context: {
                  rooted_wallet_context_id: 'rwc-user-protocol-001',
                },
                root_delegation: {
                  root_delegation_id: 'root-user-protocol-001',
                },
                owned_units: [
                  {
                    unit_id: 'unit-usdc-protocol-001',
                    root_asset: 'USDC',
                    quantity: '10',
                    status: 'reserved',
                    control_path: 'lending.supply',
                    reservation_id: 'reservation-usdc-protocol-001',
                  },
                ],
                reservations: [
                  {
                    reservation_id: 'reservation-usdc-protocol-001',
                    agent_id: 'ember-lending',
                    purpose: 'position.enter',
                    status: 'active',
                    control_path: 'lending.supply',
                    unit_allocations: [
                      {
                        unit_id: 'unit-usdc-protocol-001',
                        quantity: '10',
                      },
                    ],
                  },
                ],
              },
            },
          };
        }

        return {
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-complete-rooted-bootstrap',
          result: {
            protocol_version: 'v1',
            revision: 4,
            committed_event_ids: ['evt-rooted-bootstrap-3', 'evt-rooted-bootstrap-4'],
            rooted_wallet_context_id: 'rwc-user-protocol-001',
            root_delegation: {
              root_delegation_id: 'root-user-protocol-001',
              user_wallet: '0x00000000000000000000000000000000000000a1',
              status: 'active',
            },
          },
        };
      }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 4,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 4,
        consumer_id: 'portfolio-manager',
        acknowledged_through_sequence: 0,
      })),
    };

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
      controllerWalletAddress: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'onboarding',
          lastPortfolioState: null,
          lastSharedEmberRevision: null,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingApprovedSetup: {
            portfolioMandate: createPortfolioManagerSetupInput().portfolioMandate,
            firstManagedMandate: createPortfolioManagerSetupInput().firstManagedMandate,
          },
        },
        operation: {
          source: 'interrupt',
          name: 'portfolio-manager-delegation-signing-request',
          input: {
            outcome: 'signed',
            signedDelegations: [signedDelegation],
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'active',
        lastSharedEmberRevision: 4,
        lastRootedWalletContextId: 'rwc-user-protocol-001',
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(1, {
      jsonrpc: '2.0',
      id: 'rpc-agent-service-identity-read',
      method: 'orchestrator.readAgentServiceIdentity.v1',
      params: {
        agent_id: 'portfolio-manager',
        role: 'orchestrator',
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(2, {
      jsonrpc: '2.0',
      id: 'rpc-agent-service-identity-read',
      method: 'orchestrator.readAgentServiceIdentity.v1',
      params: {
        agent_id: 'ember-lending',
        role: 'subagent',
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(3, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-read-current-revision',
      method: 'subagent.readPortfolioState.v1',
      params: {
        agent_id: 'portfolio-manager',
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        method: 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
        params: expect.objectContaining({
          expected_revision: 3,
        }),
      }),
    );
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(5, {
      jsonrpc: '2.0',
      id: 'shared-ember-read-managed-subagent-execution-context',
      method: 'subagent.readExecutionContext.v1',
      params: {
        agent_id: 'ember-lending',
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(6, {
      jsonrpc: '2.0',
      id: 'shared-ember-wallet-accounting-ember-lending-0x00000000000000000000000000000000000000a1',
      method: 'orchestrator.readOnboardingState.v1',
      params: {
        agent_id: 'ember-lending',
        wallet_address: '0x00000000000000000000000000000000000000a1',
        network: 'arbitrum',
      },
    });
  });

  it('moves back to prehire on fire and allows hire to start again', async () => {
    const domain = createPortfolioManagerDomain({
      agentId: 'portfolio-manager',
    });

    const fired = await domain.handleOperation?.({
      threadId: 'thread-1',
      state: {
        phase: 'active',
        lastPortfolioState: {
          positions: 1,
        },
        lastSharedEmberRevision: 3,
        lastRootDelegation: {
          root_delegation_id: 'root-user-protocol-001',
        },
        lastOnboardingBootstrap: createOnboardingBootstrap(),
        lastRootedWalletContextId: 'rwc-user-protocol-001',
        activeWalletAddress: '0x00000000000000000000000000000000000000a1',
        pendingOnboardingWalletAddress: null,
      },
      operation: {
        source: 'command',
        name: 'fire',
      },
    });

    expect(fired).toMatchObject({
      state: {
        phase: 'prehire',
        lastPortfolioState: {
          positions: 1,
        },
        lastSharedEmberRevision: 3,
        lastRootDelegation: null,
        lastOnboardingBootstrap: null,
        lastRootedWalletContextId: null,
        activeWalletAddress: null,
        pendingOnboardingWalletAddress: null,
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Portfolio manager fired. Ready to hire again.',
        },
      },
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: fired?.state,
        operation: {
          source: 'command',
          name: 'hire',
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'onboarding',
      },
      outputs: {
        status: {
          executionStatus: 'interrupted',
          statusMessage: 'Connect the wallet you want the portfolio manager to onboard.',
        },
        interrupt: {
          type: 'portfolio-manager-setup-request',
        },
      },
    });
  });

  it('translates register_root_delegation_from_user_signing into the Shared Ember root-delegation command', async () => {
    const handoff = {
      handoff_id: 'handoff-root-protocol-001',
      root_delegation_id: 'root-user-protocol-001',
      user_id: 'user_idle',
      user_wallet: '0xUSERPROTO1',
      orchestrator_wallet: '0xORCHPROTO1',
      network: 'arbitrum',
      artifact_ref: 'artifact-root-protocol-001',
      issued_at: '2026-03-29T00:00:00Z',
      activated_at: '2026-03-29T00:00:05Z',
      signer_kind: 'delegation_toolkit',
      metadata: {
        delegation_manager: '0xDELEGATIONMANAGERPROTO1',
      },
    };
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-register-root-delegation',
        result: {
          protocol_version: 'v1',
          revision: 1,
          committed_event_ids: ['evt-root-delegation-1'],
          root_delegation: {
            root_delegation_id: 'root-user-protocol-001',
            user_id: 'user_idle',
            user_wallet: '0xUSERPROTO1',
            orchestrator_wallet: '0xORCHPROTO1',
            network: 'arbitrum',
            status: 'active',
            issued_at: '2026-03-29T00:00:00Z',
            activated_at: '2026-03-29T00:00:05Z',
            revoked_at: null,
            artifact_ref: 'artifact-root-protocol-001',
            metadata: {
              delegation_manager: '0xDELEGATIONMANAGERPROTO1',
            },
          },
        },
      })),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 1,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 1,
        consumer_id: 'portfolio-manager',
        acknowledged_through_sequence: 0,
      })),
    };

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'prehire',
          lastPortfolioState: null,
          lastSharedEmberRevision: 0,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
          activeWalletAddress: null,
          pendingOnboardingWalletAddress: null,
        },
        operation: {
          source: 'tool',
          name: 'register_root_delegation_from_user_signing',
          input: {
            idempotencyKey: 'idem-root-protocol-001',
            handoff,
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'onboarding',
        lastSharedEmberRevision: 1,
        lastRootDelegation: {
          root_delegation_id: 'root-user-protocol-001',
          user_wallet: '0xUSERPROTO1',
          status: 'active',
        },
        lastOnboardingBootstrap: null,
        lastRootedWalletContextId: null,
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Root delegation registered with Shared Ember Domain Service.',
        },
        artifacts: [
          {
            data: {
              type: 'shared-ember-root-delegation',
              revision: 1,
              committedEventIds: ['evt-root-delegation-1'],
              rootDelegation: {
                root_delegation_id: 'root-user-protocol-001',
                user_wallet: '0xUSERPROTO1',
                status: 'active',
              },
            },
          },
        ],
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-register-root-delegation',
      method: 'orchestrator.registerRootDelegationFromUserSigning.v1',
      params: {
        idempotency_key: 'idem-root-protocol-001',
        expected_revision: 0,
        handoff,
      },
    });
  });

  it('translates complete_rooted_bootstrap_from_user_signing into the Shared Ember rooted-bootstrap command', async () => {
    const onboarding = createOnboardingBootstrap();
    const handoff = {
      handoff_id: 'handoff-root-protocol-001',
      root_delegation_id: 'root-user-protocol-001',
      user_id: 'user_idle',
      user_wallet: '0xUSERPROTO1',
      orchestrator_wallet: '0xORCHPROTO1',
      network: 'arbitrum',
      artifact_ref: 'artifact-root-protocol-001',
      issued_at: '2026-03-29T00:00:00Z',
      activated_at: '2026-03-29T00:00:05Z',
      signer_kind: 'delegation_toolkit',
      metadata: {
        delegation_manager: '0xDELEGATIONMANAGERPROTO1',
      },
    };
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-complete-rooted-bootstrap',
        result: {
          protocol_version: 'v1',
          revision: 3,
          committed_event_ids: ['evt-rooted-bootstrap-1', 'evt-rooted-bootstrap-2'],
          rooted_wallet_context_id: 'rwc-user-protocol-001',
          root_delegation: {
            root_delegation_id: 'root-user-protocol-001',
            user_wallet: '0xUSERPROTO1',
            status: 'active',
          },
        },
      })),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 3,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 3,
        consumer_id: 'portfolio-manager',
        acknowledged_through_sequence: 0,
      })),
    };

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'onboarding',
          lastPortfolioState: null,
          lastSharedEmberRevision: 0,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
          activeWalletAddress: null,
          pendingOnboardingWalletAddress: null,
        },
        operation: {
          source: 'tool',
          name: 'complete_rooted_bootstrap_from_user_signing',
          input: {
            idempotencyKey: 'idem-rooted-bootstrap-protocol-001',
            onboarding,
            handoff,
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'onboarding',
        lastSharedEmberRevision: 3,
        lastRootDelegation: {
          root_delegation_id: 'root-user-protocol-001',
          user_wallet: '0xUSERPROTO1',
          status: 'active',
        },
        lastOnboardingBootstrap: null,
        lastRootedWalletContextId: 'rwc-user-protocol-001',
        activeWalletAddress: null,
        pendingOnboardingWalletAddress: null,
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Rooted bootstrap completed with Shared Ember Domain Service.',
        },
        artifacts: [
          {
            data: {
              type: 'shared-ember-rooted-bootstrap',
              revision: 3,
              committedEventIds: ['evt-rooted-bootstrap-1', 'evt-rooted-bootstrap-2'],
              rootedWalletContextId: 'rwc-user-protocol-001',
              rootDelegation: {
                root_delegation_id: 'root-user-protocol-001',
                user_wallet: '0xUSERPROTO1',
                status: 'active',
              },
            },
          },
        ],
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-complete-rooted-bootstrap',
      method: 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
      params: {
        idempotency_key: 'idem-rooted-bootstrap-protocol-001',
        expected_revision: 0,
        onboarding,
        handoff,
      },
    });
  });

  it('derives a distinct fallback rooted-bootstrap idempotency key when command payload changes', async () => {
    const firstOnboarding = createOnboardingBootstrap();
    const secondOnboarding = {
      ...createOnboardingBootstrap(),
      activation: {
        mandateRef: 'mandate-ember-lending-protocol-002',
      },
    };
    const handoff = {
      handoff_id: 'handoff-root-protocol-001',
      root_delegation_id: 'root-user-protocol-001',
      user_id: 'user_idle',
      user_wallet: '0xUSERPROTO1',
      orchestrator_wallet: '0xORCHPROTO1',
      network: 'arbitrum',
      artifact_ref: 'artifact-root-protocol-001',
      issued_at: '2026-03-29T00:00:00Z',
      activated_at: '2026-03-29T00:00:05Z',
      signer_kind: 'delegation_toolkit',
      metadata: {
        delegation_manager: '0xDELEGATIONMANAGERPROTO1',
      },
    } as const;
    const observedIdempotencyKeys: string[] = [];
    const protocolHost = {
      handleJsonRpc: vi.fn(async (request: unknown) => {
        const jsonRpcRequest =
          typeof request === 'object' && request !== null
            ? (request as Record<string, unknown>)
            : null;
        const params =
          typeof jsonRpcRequest?.['params'] === 'object' && jsonRpcRequest['params'] !== null
            ? (jsonRpcRequest['params'] as Record<string, unknown>)
            : null;

        if (
          jsonRpcRequest?.['method'] === 'orchestrator.completeRootedBootstrapFromUserSigning.v1'
        ) {
          const idempotencyKey = params?.['idempotency_key'];
          if (typeof idempotencyKey !== 'string') {
            throw new Error('expected rooted-bootstrap idempotency key');
          }
          observedIdempotencyKeys.push(idempotencyKey);
        }

        return {
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-complete-rooted-bootstrap',
          result: {
            protocol_version: 'v1',
            revision: 3,
            committed_event_ids: ['evt-rooted-bootstrap-1', 'evt-rooted-bootstrap-2'],
            rooted_wallet_context_id: 'rwc-user-protocol-001',
            root_delegation: {
              root_delegation_id: 'root-user-protocol-001',
              user_wallet: '0xUSERPROTO1',
              status: 'active',
            },
          },
        };
      }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 3,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 3,
        consumer_id: 'portfolio-manager',
        acknowledged_through_sequence: 0,
      })),
    };

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
    });

    await domain.handleOperation?.({
      threadId: 'thread-1',
      state: {
        phase: 'onboarding',
        lastPortfolioState: null,
        lastSharedEmberRevision: 0,
        lastRootDelegation: null,
        lastOnboardingBootstrap: null,
        lastRootedWalletContextId: null,
        activeWalletAddress: null,
        pendingOnboardingWalletAddress: null,
      },
      operation: {
        source: 'tool',
        name: 'complete_rooted_bootstrap_from_user_signing',
        input: {
          onboarding: firstOnboarding,
          handoff,
        },
      },
    });

    await domain.handleOperation?.({
      threadId: 'thread-1',
      state: {
        phase: 'onboarding',
        lastPortfolioState: null,
        lastSharedEmberRevision: 0,
        lastRootDelegation: null,
        lastOnboardingBootstrap: null,
        lastRootedWalletContextId: null,
        activeWalletAddress: null,
        pendingOnboardingWalletAddress: null,
      },
      operation: {
        source: 'tool',
        name: 'complete_rooted_bootstrap_from_user_signing',
        input: {
          onboarding: secondOnboarding,
          handoff,
        },
      },
    });

    expect(observedIdempotencyKeys).toHaveLength(2);
    expect(observedIdempotencyKeys[0]).toMatch(/^idem-portfolio-manager-rooted-bootstrap-/);
    expect(observedIdempotencyKeys[0]).not.toBe(observedIdempotencyKeys[1]);
  });

  it('retries rooted bootstrap once after a Shared Ember expected_revision conflict', async () => {
    const onboarding = createOnboardingBootstrap();
    const handoff = {
      handoff_id: 'handoff-root-protocol-001',
      root_delegation_id: 'root-user-protocol-001',
      user_id: 'user_idle',
      user_wallet: '0xUSERPROTO1',
      orchestrator_wallet: '0xORCHPROTO1',
      network: 'arbitrum',
      artifact_ref: 'artifact-root-protocol-001',
      issued_at: '2026-03-29T00:00:00Z',
      activated_at: '2026-03-29T00:00:05Z',
      signer_kind: 'delegation_toolkit',
      metadata: {
        delegation_manager: '0xDELEGATIONMANAGERPROTO1',
      },
    } as const;
    const protocolHost = {
      handleJsonRpc: vi
        .fn()
        .mockRejectedValueOnce(
          new Error(
            'Shared Ember Domain Service JSON-RPC error: protocol_conflict: expected_revision must match the current service revision',
          ),
        )
        .mockResolvedValueOnce({
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-read-current-revision',
          result: {
            protocol_version: 'v1',
            revision: 3,
            portfolio_state: {
              agent_id: 'portfolio-manager',
              owned_units: [],
              reservations: [],
            },
          },
        })
        .mockResolvedValueOnce({
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-complete-rooted-bootstrap',
          result: {
            protocol_version: 'v1',
            revision: 4,
            committed_event_ids: ['evt-rooted-bootstrap-3', 'evt-rooted-bootstrap-4'],
            rooted_wallet_context_id: 'rwc-user-protocol-001',
            root_delegation: {
              root_delegation_id: 'root-user-protocol-001',
              user_wallet: '0xUSERPROTO1',
              status: 'active',
            },
          },
        }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 4,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 4,
        consumer_id: 'portfolio-manager',
        acknowledged_through_sequence: 0,
      })),
    };

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'onboarding',
          lastPortfolioState: null,
          lastSharedEmberRevision: 0,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
          activeWalletAddress: null,
          pendingOnboardingWalletAddress: null,
        },
        operation: {
          source: 'tool',
          name: 'complete_rooted_bootstrap_from_user_signing',
          input: {
            idempotencyKey: 'idem-rooted-bootstrap-protocol-001',
            onboarding,
            handoff,
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        lastSharedEmberRevision: 4,
        lastRootedWalletContextId: 'rwc-user-protocol-001',
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(1, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-complete-rooted-bootstrap',
      method: 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
      params: {
        idempotency_key: 'idem-rooted-bootstrap-protocol-001',
        expected_revision: 0,
        onboarding,
        handoff,
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(2, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-read-current-revision',
      method: 'subagent.readPortfolioState.v1',
      params: {
        agent_id: 'portfolio-manager',
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(3, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-complete-rooted-bootstrap',
      method: 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
      params: {
        idempotency_key: 'idem-rooted-bootstrap-protocol-001',
        expected_revision: 3,
        onboarding,
        handoff,
      },
    });
  });

  it('translates refresh_portfolio_state into the Shared Ember portfolio-state query', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-read-portfolio-state',
        result: {
          protocol_version: 'v1',
          revision: 7,
          portfolio_state: {
            policy: 'capital-preservation',
            units: [
              {
                agent_id: 'portfolio-manager',
                unit_id: 'unit-1',
                symbol: 'USDC',
              },
            ],
          },
        },
      })),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 7,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 7,
        consumer_id: 'portfolio-manager',
        acknowledged_through_sequence: 0,
      })),
    };

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'prehire',
          lastPortfolioState: null,
          lastSharedEmberRevision: null,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
          activeWalletAddress: null,
          pendingOnboardingWalletAddress: null,
        },
        operation: {
          source: 'tool',
          name: 'refresh_portfolio_state',
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'prehire',
        lastSharedEmberRevision: 7,
        lastRootDelegation: null,
        lastOnboardingBootstrap: null,
        lastRootedWalletContextId: null,
        lastPortfolioState: {
          policy: 'capital-preservation',
          units: [
            {
              agent_id: 'portfolio-manager',
              unit_id: 'unit-1',
              symbol: 'USDC',
            },
          ],
        },
        activeWalletAddress: null,
        pendingOnboardingWalletAddress: null,
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Portfolio state refreshed from Shared Ember Domain Service.',
        },
        artifacts: [
          {
            data: {
              type: 'shared-ember-portfolio-state',
              revision: 7,
              portfolioState: {
                policy: 'capital-preservation',
                units: [
                  {
                    agent_id: 'portfolio-manager',
                    unit_id: 'unit-1',
                    symbol: 'USDC',
                  },
                ],
              },
            },
          },
        ],
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-read-portfolio-state',
      method: 'subagent.readPortfolioState.v1',
      params: {
        agent_id: 'portfolio-manager',
      },
    });
  });

  it('emits a live managed-mandate projection from Shared Ember reads during refresh', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async (request: unknown) => {
        const jsonRpcRequest =
          typeof request === 'object' && request !== null
            ? (request as { params?: unknown })
            : null;
        const params =
          jsonRpcRequest &&
          typeof jsonRpcRequest.params === 'object' &&
          jsonRpcRequest.params !== null
            ? (jsonRpcRequest.params as { agent_id?: unknown })
            : null;

        if (params?.agent_id === 'portfolio-manager') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-read-portfolio-state',
            result: {
              protocol_version: 'v1',
              revision: 8,
              portfolio_state: {
                agent_id: 'portfolio-manager',
              },
            },
          };
        }

        if (params?.agent_id === 'ember-lending') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-read-managed-agent-portfolio-state',
            result: {
              protocol_version: 'v1',
              revision: 8,
              portfolio_state: createLiveManagedAgentPortfolioState(),
            },
          };
        }

        throw new Error(`unexpected refresh agent_id: ${String(params?.agent_id ?? 'missing')}`);
      }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 8,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 8,
        consumer_id: 'portfolio-manager',
        acknowledged_through_sequence: 0,
      })),
    };

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'active',
          lastPortfolioState: null,
          lastSharedEmberRevision: 7,
          lastRootDelegation: null,
          lastOnboardingBootstrap: createOnboardingBootstrap(),
          lastRootedWalletContextId: 'rwc-user-protocol-001',
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: null,
        },
        operation: {
          source: 'tool',
          name: 'refresh_portfolio_state',
        },
      }),
    ).resolves.toMatchObject({
      domainProjectionUpdate: {
        managedMandateEditor: {
          ownerAgentId: 'agent-portfolio-manager',
          targetAgentId: 'ember-lending',
          targetAgentRouteId: 'agent-ember-lending',
          targetAgentKey: 'ember-lending-primary',
          targetAgentTitle: 'Ember Lending',
          mandateRef: 'mandate-ember-lending-live-001',
          managedMandate: {
            lending_policy: {
              collateral_policy: {
                assets: [
                  {
                    asset: 'USDC',
                    max_allocation_pct: 60,
                  },
                  {
                    asset: 'USDT',
                    max_allocation_pct: 25,
                  },
                ],
              },
              borrow_policy: {
                allowed_assets: ['USDC', 'USDT'],
              },
              risk_policy: {
                max_ltv_bps: 6500,
                min_health_factor: '1.4',
              },
            },
          },
          agentWallet: '0x00000000000000000000000000000000000000e1',
          rootUserWallet: '0x00000000000000000000000000000000000000a1',
          rootedWalletContextId: 'rwc-user-protocol-001',
          reservation: {
            reservationId: 'reservation-ember-lending-001',
            purpose: 'position.enter',
            controlPath: 'lending.supply',
            rootAsset: 'USDC',
            quantity: '25',
          },
        },
        portfolioProjectionInput: {
          benchmarkAsset: 'USD',
          walletContents: expect.arrayContaining([
            expect.objectContaining({
              asset: 'USDC',
              network: 'arbitrum',
              quantity: '10',
              displayQuantity: '0.00001',
              valueUsd: 10,
            }),
            expect.objectContaining({
              asset: 'WBTC',
              network: 'arbitrum',
              quantity: '2736',
              displayQuantity: '0.00002736',
              valueUsd: 2.1084539253125922,
            }),
            expect.objectContaining({
              asset: 'WETH',
              valueUsd: 20,
              economicExposures: [
                {
                  asset: 'ETH',
                  quantity: '0.01',
                },
              ],
            }),
          ]),
          reservations: [
            {
              reservationId: 'reservation-ember-lending-001',
              agentId: 'ember-lending',
              purpose: 'position.enter',
              controlPath: 'lending.supply',
              createdAt: '2026-03-30T00:00:00.000Z',
              status: 'active',
              unitAllocations: [
                {
                  unitId: 'unit-usdc-portfolio-001',
                  quantity: '25',
                },
              ],
            },
          ],
          ownedUnits: [
            {
              unitId: 'unit-usdc-portfolio-001',
              rootAsset: 'USDC',
              network: 'arbitrum',
              quantity: '25',
              benchmarkAsset: 'USD',
              benchmarkValue: 25,
              reservationId: 'reservation-ember-lending-001',
              positionScopeId: 'position-scope-aave-arbitrum-usdc',
            },
          ],
          activePositionScopes: [
            {
              scopeId: 'position-scope-aave-arbitrum-usdc',
              kind: 'lending-position',
              network: 'arbitrum',
              protocolSystem: 'aave',
              containerRef: 'aave:position-scope-aave-arbitrum-usdc',
              ownerType: 'agent',
              ownerId: 'ember-lending',
              status: 'active',
              marketState: {
                availableBorrowsUsd: '18',
                borrowableHeadroomUsd: '12.5',
                currentLtvBps: 3200,
                liquidationThresholdBps: 7800,
                healthFactor: '2.1',
              },
              members: expect.arrayContaining([
                expect.objectContaining({
                  memberId: 'collateral-usdc',
                  role: 'collateral',
                  asset: 'USDC',
                  valueUsd: 25,
                }),
                expect.objectContaining({
                  memberId: 'debt-usdt',
                  role: 'debt',
                  asset: 'USDT',
                  valueUsd: 5,
                }),
              ]),
            },
          ],
        },
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(2, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-read-managed-agent-portfolio-state',
      method: 'subagent.readPortfolioState.v1',
      params: {
        agent_id: 'ember-lending',
      },
    });
  });

  it('promotes a stale onboarding PM thread to active when refresh finds a live managed mandate projection', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async (request: unknown) => {
        const jsonRpcRequest =
          typeof request === 'object' && request !== null
            ? (request as { params?: unknown })
            : null;
        const params =
          jsonRpcRequest &&
          typeof jsonRpcRequest.params === 'object' &&
          jsonRpcRequest.params !== null
            ? (jsonRpcRequest.params as { agent_id?: unknown })
            : null;

        if (params?.agent_id === 'portfolio-manager') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-read-portfolio-state',
            result: {
              protocol_version: 'v1',
              revision: 8,
              portfolio_state: {
                agent_id: 'portfolio-manager',
              },
            },
          };
        }

        if (params?.agent_id === 'ember-lending') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-read-managed-agent-portfolio-state',
            result: {
              protocol_version: 'v1',
              revision: 8,
              portfolio_state: createLiveManagedAgentPortfolioState(),
            },
          };
        }

        throw new Error(`unexpected refresh agent_id: ${String(params?.agent_id ?? 'missing')}`);
      }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 8,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 8,
        consumer_id: 'portfolio-manager',
        acknowledged_through_sequence: 0,
      })),
    };

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'onboarding',
          lastPortfolioState: null,
          lastSharedEmberRevision: 7,
          lastRootDelegation: {
            root_delegation_id: 'root-a1',
          },
          lastOnboardingBootstrap: createOnboardingBootstrap(),
          lastRootedWalletContextId: 'rwc-user-protocol-001',
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingApprovedSetup: {
            portfolioMandate: {
              approved: true,
              riskLevel: 'medium',
            },
            firstManagedMandate: {
              targetAgentId: 'ember-lending',
              targetAgentKey: 'ember-lending-primary',
              managedMandate: {
                lending_policy: createManagedLendingPolicy(),
              },
            },
          },
        },
        operation: {
          source: 'tool',
          name: 'refresh_portfolio_state',
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'active',
        lastSharedEmberRevision: 8,
        lastRootedWalletContextId: 'rwc-user-protocol-001',
        activeWalletAddress: '0x00000000000000000000000000000000000000a1',
        pendingOnboardingWalletAddress: null,
        pendingApprovedSetup: null,
      },
      domainProjectionUpdate: {
        managedMandateEditor: {
          mandateRef: 'mandate-ember-lending-live-001',
        },
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(2, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-read-managed-agent-portfolio-state',
      method: 'subagent.readPortfolioState.v1',
      params: {
        agent_id: 'ember-lending',
      },
    });
  });

  it('routes post-activation managed-mandate edits through the PM-owned protocol command and rehydrates live state', async () => {
    let managedAgentReadCount = 0;
    const protocolHost = {
      handleJsonRpc: vi.fn(async (request: unknown) => {
        const jsonRpcRequest =
          typeof request === 'object' && request !== null
            ? (request as { method?: unknown; params?: unknown })
            : null;
        const method = jsonRpcRequest?.method;
        const params =
          jsonRpcRequest &&
          typeof jsonRpcRequest.params === 'object' &&
          jsonRpcRequest.params !== null
            ? (jsonRpcRequest.params as { agent_id?: unknown })
            : null;

        if (method === 'subagent.readPortfolioState.v1' && params?.agent_id === 'ember-lending') {
          const currentReadCount = managedAgentReadCount;
          managedAgentReadCount += 1;

          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-read-managed-agent-portfolio-state',
            result: {
              protocol_version: 'v1',
              revision: currentReadCount === 0 ? 8 : 9,
              portfolio_state:
                currentReadCount === 0
                  ? createLiveManagedAgentPortfolioState()
                  : {
                      ...createLiveManagedAgentPortfolioState(),
                      mandate_context: createUpdatedManagedMandate(),
                    },
            },
          };
        }

        if (method === 'orchestrator.updateManagedMandate.v1') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-update-managed-mandate',
            result: {
              protocol_version: 'v1',
              revision: 9,
              committed_event_ids: ['evt-managed-mandate-1'],
              mandate: {
                mandate_ref: 'mandate-ember-lending-live-001',
                agent_id: 'ember-lending',
                managed_mandate: createUpdatedManagedMandate(),
              },
            },
          };
        }

        throw new Error(`unexpected method: ${String(method ?? 'missing')}`);
      }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 9,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 9,
        consumer_id: 'portfolio-manager',
        acknowledged_through_sequence: 0,
      })),
    };

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'active',
          lastPortfolioState: {
            agent_id: 'portfolio-manager',
          },
          lastSharedEmberRevision: 8,
          lastRootDelegation: null,
          lastOnboardingBootstrap: createOnboardingBootstrap(),
          lastRootedWalletContextId: 'rwc-user-protocol-001',
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: null,
        },
        operation: {
          source: 'command',
          name: 'update_managed_mandate',
          input: {
            targetAgentId: 'ember-lending',
            managedMandate: createUpdatedManagedMandate(),
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'active',
        lastSharedEmberRevision: 9,
      },
      domainProjectionUpdate: {
        managedMandateEditor: {
          managedMandate: createUpdatedManagedMandate(),
        },
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Managed mandate updated through Shared Ember Domain Service.',
        },
        artifacts: [
          {
            data: {
              type: 'shared-ember-managed-mandate',
              revision: 9,
              committedEventIds: ['evt-managed-mandate-1'],
            },
          },
        ],
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(2, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-update-managed-mandate',
      method: 'orchestrator.updateManagedMandate.v1',
      params: {
        idempotency_key: expect.stringMatching(/^idem-update-managed-mandate-/),
        expected_revision: 8,
        occurred_at: expect.any(String),
        agent_id: 'ember-lending',
        mandate_ref: 'mandate-ember-lending-live-001',
        managed_mandate: createUpdatedManagedMandate(),
      },
    });
  });

  it('dispatches structured spot swaps through the hidden OCA executor with the selected rooted wallet context', async () => {
    const hiddenExecutor = {
      executeSpotSwap: vi.fn(async () => ({
        status: 'submitted' as const,
        swapSummary: {
          fromToken: 'USDC',
          toToken: 'WETH',
          amount: '1000000',
          amountType: 'exactIn' as const,
          displayFromAmount: '1',
          displayToAmount: '0.0003',
        },
        transactionPlanId: 'txplan-hidden-swap-001',
        requestId: 'req-hidden-swap-001',
        transactionHash: '0xsubmittedswap',
        committedEventIds: ['evt-hidden-swap-1'],
      })),
    };
    const domain = createPortfolioManagerDomain({
      agentId: 'portfolio-manager',
      hiddenOcaSpotSwapExecutor: hiddenExecutor,
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'active',
          lastPortfolioState: null,
          lastSharedEmberRevision: 8,
          lastRootDelegation: null,
          lastOnboardingBootstrap: createOnboardingBootstrap(),
          lastRootedWalletContextId: 'rwc-user-protocol-001',
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: null,
        },
        operation: {
          source: 'command',
          name: 'dispatch_spot_swap',
          input: {
            walletAddress: '0x00000000000000000000000000000000000000a1',
            amount: '1000000',
            amountType: 'exactIn',
            fromChain: 'arbitrum',
            toChain: 'arbitrum',
            fromToken: 'USDC',
            toToken: 'WETH',
            slippageTolerance: '0.5',
            idempotencyKey: 'idem-hidden-swap-001',
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'active',
        lastSharedEmberRevision: 8,
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Spot swap submitted through the portfolio manager.',
        },
        artifacts: [
          {
            data: {
              type: 'hidden-oca-spot-swap',
              status: 'submitted',
              transactionPlanId: 'txplan-hidden-swap-001',
              requestId: 'req-hidden-swap-001',
              transactionHash: '0xsubmittedswap',
            },
          },
        ],
      },
    });

    expect(hiddenExecutor.executeSpotSwap).toHaveBeenCalledWith({
      threadId: 'thread-1',
      currentRevision: 8,
      input: {
        walletAddress: '0x00000000000000000000000000000000000000a1',
        amount: '1000000',
        amountType: 'exactIn',
        fromChain: 'arbitrum',
        toChain: 'arbitrum',
        fromToken: 'USDC',
        toToken: 'WETH',
        slippageTolerance: '0.5',
        idempotencyKey: 'idem-hidden-swap-001',
        rootedWalletContextId: 'rwc-user-protocol-001',
      },
    });
  });

  it('rejects initial spot swap dispatches that try to pre-authorize reserved-capital conflict handling', async () => {
    const hiddenExecutor = {
      executeSpotSwap: vi.fn(),
    };
    const domain = createPortfolioManagerDomain({
      agentId: 'portfolio-manager',
      hiddenOcaSpotSwapExecutor: hiddenExecutor,
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'active',
          lastPortfolioState: null,
          lastSharedEmberRevision: 8,
          lastRootDelegation: null,
          lastOnboardingBootstrap: createOnboardingBootstrap(),
          lastRootedWalletContextId: 'rwc-user-protocol-001',
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: null,
        },
        operation: {
          source: 'command',
          name: 'dispatch_spot_swap',
          input: {
            walletAddress: '0x00000000000000000000000000000000000000a1',
            amount: '1000000',
            amountType: 'exactIn',
            fromChain: 'arbitrum',
            toChain: 'arbitrum',
            fromToken: 'USDC',
            toToken: 'WETH',
            reservationConflictHandling: {
              kind: 'allow_reserved_for_other_agent',
            },
          },
        },
      }),
    ).resolves.toMatchObject({
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Spot swap reserved-capital conflict handling can only be supplied by the portfolio-manager conflict confirmation retry.',
        },
      },
    });

    expect(hiddenExecutor.executeSpotSwap).not.toHaveBeenCalled();
  });

  it('interrupts for PM-routed reserved-capital confirmation and stores the exact swap retry', async () => {
    const hiddenExecutor = {
      executeSpotSwap: vi.fn(async () => ({
        status: 'conflict' as const,
        idempotencyKey: 'idem-generated-hidden-swap-001',
        swapSummary: {
          fromToken: 'USDC',
          toToken: 'WETH',
          amount: '1000000',
          amountType: 'exactIn' as const,
          displayFromAmount: '1',
          displayToAmount: '0.0003',
        },
        transactionPlanId: 'txplan-hidden-swap-001',
        requestId: 'req-hidden-swap-001',
        committedEventIds: ['evt-hidden-swap-conflict-1'],
        conflict: {
          kind: 'reserved_for_other_agent' as const,
          blockingReasonCode: 'reserved_for_other_agent',
          reservationId: 'res-ember-lending-001',
          message: 'USDC is reserved for another agent.',
          retryOptions: ['allow_reserved_for_other_agent' as const, 'unassigned_only' as const],
        },
      })),
    };
    const domain = createPortfolioManagerDomain({
      agentId: 'portfolio-manager',
      hiddenOcaSpotSwapExecutor: hiddenExecutor,
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'active',
          lastPortfolioState: null,
          lastSharedEmberRevision: 8,
          lastRootDelegation: null,
          lastOnboardingBootstrap: createOnboardingBootstrap(),
          lastRootedWalletContextId: 'rwc-user-protocol-001',
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: null,
        },
        operation: {
          source: 'command',
          name: 'dispatch_spot_swap',
          input: {
            walletAddress: '0x00000000000000000000000000000000000000a1',
            amount: '1000000',
            amountType: 'exactIn',
            fromChain: 'arbitrum',
            toChain: 'arbitrum',
            fromToken: 'USDC',
            toToken: 'WETH',
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        pendingSpotSwapConflict: {
          dispatch: {
            idempotencyKey: 'idem-generated-hidden-swap-001',
            rootedWalletContextId: 'rwc-user-protocol-001',
          },
          conflict: {
            reservationId: 'res-ember-lending-001',
          },
        },
      },
      outputs: {
        status: {
          executionStatus: 'interrupted',
          statusMessage:
            'This swap would touch capital reserved for another agent. Confirm whether to proceed or retry with unassigned capital only.',
        },
        interrupt: {
          type: 'portfolio-manager-swap-reservation-conflict-request',
          mirroredToActivity: false,
          payload: {
            retryOptions: ['allow_reserved_for_other_agent', 'unassigned_only'],
          },
        },
      },
    });
  });

  it('does not report hidden spot swaps as completed while executor redelegation remains pending', async () => {
    const hiddenExecutor = {
      executeSpotSwap: vi.fn(async () => ({
        status: 'awaiting_redelegation' as const,
        swapSummary: {
          fromToken: 'USDC',
          toToken: 'WETH',
          amount: '1000000',
          amountType: 'exactIn' as const,
          displayFromAmount: '1',
          displayToAmount: '0.0003',
        },
        transactionPlanId: 'txplan-hidden-swap-001',
        requestId: 'req-hidden-swap-001',
        committedEventIds: ['evt-hidden-swap-redelegation-1'],
      })),
    };
    const domain = createPortfolioManagerDomain({
      agentId: 'portfolio-manager',
      hiddenOcaSpotSwapExecutor: hiddenExecutor,
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'active',
          lastPortfolioState: null,
          lastSharedEmberRevision: 8,
          lastRootDelegation: null,
          lastOnboardingBootstrap: createOnboardingBootstrap(),
          lastRootedWalletContextId: 'rwc-user-protocol-001',
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: null,
        },
        operation: {
          source: 'command',
          name: 'dispatch_spot_swap',
          input: {
            walletAddress: '0x00000000000000000000000000000000000000a1',
            amount: '1000000',
            amountType: 'exactIn',
            fromChain: 'arbitrum',
            toChain: 'arbitrum',
            fromToken: 'USDC',
            toToken: 'WETH',
            idempotencyKey: 'idem-hidden-swap-001',
          },
        },
      }),
    ).resolves.toMatchObject({
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Spot swap execution is waiting for Shared Ember redelegation readiness and was not completed.',
        },
      },
    });
  });

  it('re-dispatches the exact pending swap after conflict-only user confirmation', async () => {
    const hiddenExecutor = {
      executeSpotSwap: vi.fn(async () => ({
        status: 'completed' as const,
        swapSummary: {
          fromToken: 'USDC',
          toToken: 'WETH',
          amount: '1000000',
          amountType: 'exactIn' as const,
          displayFromAmount: '1',
          displayToAmount: '0.0003',
        },
        transactionPlanId: 'txplan-hidden-swap-001',
        requestId: 'req-hidden-swap-001',
        transactionHash: '0xconfirmed',
        committedEventIds: ['evt-hidden-swap-2'],
      })),
    };
    const domain = createPortfolioManagerDomain({
      agentId: 'portfolio-manager',
      hiddenOcaSpotSwapExecutor: hiddenExecutor,
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'active',
          lastPortfolioState: null,
          lastSharedEmberRevision: 8,
          lastRootDelegation: null,
          lastOnboardingBootstrap: createOnboardingBootstrap(),
          lastRootedWalletContextId: 'rwc-user-protocol-001',
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: null,
          pendingSpotSwapConflict: {
            dispatch: {
              walletAddress: '0x00000000000000000000000000000000000000a1',
              amount: '1000000',
              amountType: 'exactIn',
              fromChain: 'arbitrum',
              toChain: 'arbitrum',
              fromToken: 'USDC',
              toToken: 'WETH',
              idempotencyKey: 'idem-hidden-swap-001',
              rootedWalletContextId: 'rwc-user-protocol-001',
            },
            conflict: {
              kind: 'reserved_for_other_agent',
              blockingReasonCode: 'reserved_for_other_agent',
              reservationId: 'res-ember-lending-001',
              message: 'USDC is reserved for another agent.',
              retryOptions: ['allow_reserved_for_other_agent', 'unassigned_only'],
            },
          },
        },
        operation: {
          source: 'interrupt',
          name: 'portfolio-manager-swap-reservation-conflict-request',
          input: {
            outcome: 'unassigned_only',
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        pendingSpotSwapConflict: null,
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Spot swap completed through the portfolio manager.',
        },
      },
    });

    expect(hiddenExecutor.executeSpotSwap).toHaveBeenCalledWith({
      threadId: 'thread-1',
      currentRevision: 8,
      input: {
        walletAddress: '0x00000000000000000000000000000000000000a1',
        amount: '1000000',
        amountType: 'exactIn',
        fromChain: 'arbitrum',
        toChain: 'arbitrum',
        fromToken: 'USDC',
        toToken: 'WETH',
        idempotencyKey: 'idem-hidden-swap-001',
        rootedWalletContextId: 'rwc-user-protocol-001',
        reservationConflictHandling: {
          kind: 'unassigned_only',
        },
      },
    });
  });

  it('signs, registers, and acknowledges redelegation work from the committed outbox', async () => {
    const rootSignedDelegation = createSignedRootDelegation(
      '0x00000000000000000000000000000000000000c1',
    );
    const rootDelegationArtifactRef = encodeDelegationArtifactRef(rootSignedDelegation);
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-register-signed-redelegation',
        result: {
          protocol_version: 'v1',
          revision: 9,
          committed_event_ids: ['evt-request-execution-6'],
          execution_result: {
            phase: 'ready_for_execution_signing',
            request_id: 'req-ember-lending-execution-001',
            transaction_plan_id: 'txplan-ember-lending-001',
          },
        },
      })),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 8,
        acknowledged_through_sequence: 4,
        next_cursor: 5,
        has_more: false,
        events: [
          {
            protocol_version: 'v1',
            event_id: 'evt-request-execution-4',
            sequence: 4,
            aggregate: 'request',
            aggregate_id: 'req-irrelevant-001',
            event_type: 'requestExecution.completed.v1',
            committed_at: '2026-04-01T06:18:00Z',
            payload: {
              request_id: 'req-irrelevant-001',
              transaction_plan_id: 'txplan-irrelevant-001',
              status: 'confirmed',
            },
          },
          {
            protocol_version: 'v1',
            event_id: 'evt-request-execution-5',
            sequence: 5,
            aggregate: 'request',
            aggregate_id: 'req-ember-lending-execution-001',
            event_type: 'requestExecution.prepared.v1',
            committed_at: '2026-04-01T06:19:00Z',
            payload: {
              request_id: 'req-ember-lending-execution-001',
              transaction_plan_id: 'txplan-ember-lending-001',
              phase: 'ready_for_redelegation',
              redelegation_signing_package: {
                execution_preparation_id: 'execprep-ember-lending-001',
                transaction_plan_id: 'txplan-ember-lending-001',
                request_id: 'req-ember-lending-execution-001',
                redelegation_intent_id: 'ri-req-ember-lending-execution-001',
                active_delegation_id: 'del-ember-lending-001',
                delegation_id: 'del-req-ember-lending-execution-001',
                delegation_plan_id:
                  'plan-req-ember-lending-execution-001-del-req-ember-lending-execution-001',
                root_delegation_id: 'root-user-protocol-001',
                root_delegation_artifact_ref: rootDelegationArtifactRef,
                delegator_address: '0x00000000000000000000000000000000000000a1',
                agent_id: 'ember-lending',
                agent_wallet: '0x00000000000000000000000000000000000000b1',
                network: 'arbitrum',
                reservation_ids: ['reservation-ember-lending-001'],
                unit_ids: ['unit-ember-lending-001'],
                control_paths: ['lending.supply'],
                zero_capacity: false,
                policy_snapshot_ref: 'pol-ember-lending-001',
                canonical_unsigned_payload_ref: 'unsigned-txpayload-ember-lending-001',
              },
            },
          },
        ],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 9,
        consumer_id: 'portfolio-manager-redelegation',
        acknowledged_through_sequence: 5,
      })),
    };
    const runtimeSigning = createRuntimeSigningStub(
      vi.fn(async () => ({
        confirmedAddress: '0x00000000000000000000000000000000000000c1' as const,
        signedPayload: {
          signature: TEST_REDELEGATION_SIGNATURE,
        },
      })),
    );

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
      controllerWalletAddress: '0x00000000000000000000000000000000000000c2',
      controllerSignerAddress: '0x00000000000000000000000000000000000000c1',
      runtimeSigning,
      runtimeSignerRef: 'controller-wallet',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'active',
          lastPortfolioState: null,
          lastSharedEmberRevision: 7,
          lastRootDelegation: {
            root_delegation_id: 'root-user-protocol-001',
          },
          lastOnboardingBootstrap: createOnboardingBootstrap(),
          lastRootedWalletContextId: 'rwc-user-protocol-001',
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: null,
        },
        operation: {
          source: 'command',
          name: 'refresh_redelegation_work',
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'active',
        lastSharedEmberRevision: 9,
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Redelegation signed, registered, and acknowledged through Shared Ember.',
        },
        artifacts: [
          {
            data: {
              type: 'shared-ember-redelegation-registration',
              revision: 9,
              consumerId: 'portfolio-manager-redelegation',
              eventId: 'evt-request-execution-5',
              sequence: 5,
              requestId: 'req-ember-lending-execution-001',
              transactionPlanId: 'txplan-ember-lending-001',
              committedEventIds: ['evt-request-execution-6'],
              acknowledgedThroughSequence: 5,
            },
          },
        ],
      },
    });

    expect(protocolHost.readCommittedEventOutbox).toHaveBeenCalledWith({
      protocol_version: 'v1',
      consumer_id: 'portfolio-manager-redelegation',
      after_sequence: 0,
      limit: 100,
    });
    expect(runtimeSigning.signPayload).toHaveBeenCalledWith({
      signerRef: 'controller-wallet',
      expectedAddress: '0x00000000000000000000000000000000000000c1',
      payloadKind: 'typed-data',
      payload: {
        chain: 'evm',
        typedData: expect.objectContaining({
          domain: expect.objectContaining({
            chainId: 42161,
            name: 'DelegationManager',
            version: '1',
          }),
          primaryType: 'Delegation',
          message: expect.objectContaining({
            delegate: '0x00000000000000000000000000000000000000b1',
            delegator: '0x00000000000000000000000000000000000000c2',
            authority: expect.stringMatching(/^0x[0-9a-f]{64}$/),
            caveats: [],
          }),
        }),
      },
    });

    const registerSignedRedelegationCall = protocolHost.handleJsonRpc.mock.calls[0] as
      | [unknown]
      | undefined;
    if (!registerSignedRedelegationCall) {
      throw new Error('expected register signed redelegation JSON-RPC call');
    }

    const registerSignedRedelegationRequest = registerSignedRedelegationCall[0] as {
      params: {
        signed_redelegation: Record<string, unknown>;
      };
    };
    expect(registerSignedRedelegationRequest).toMatchObject({
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-register-signed-redelegation',
      method: 'orchestrator.registerSignedRedelegation.v1',
      params: {
        idempotency_key:
          'idem-refresh-redelegation-work-thread-1:register-redelegation:req-ember-lending-execution-001',
        expected_revision: 8,
        transaction_plan_id: 'txplan-ember-lending-001',
        signed_redelegation: {
          execution_preparation_id: 'execprep-ember-lending-001',
          transaction_plan_id: 'txplan-ember-lending-001',
          request_id: 'req-ember-lending-execution-001',
          redelegation_intent_id: 'ri-req-ember-lending-execution-001',
          active_delegation_id: 'del-ember-lending-001',
          delegation_id: 'del-req-ember-lending-execution-001',
          delegation_plan_id:
            'plan-req-ember-lending-execution-001-del-req-ember-lending-execution-001',
          root_delegation_id: 'root-user-protocol-001',
          root_delegation_artifact_ref: rootDelegationArtifactRef,
          delegator_address: '0x00000000000000000000000000000000000000a1',
          agent_id: 'ember-lending',
          agent_wallet: '0x00000000000000000000000000000000000000b1',
          network: 'arbitrum',
          reservation_ids: ['reservation-ember-lending-001'],
          unit_ids: ['unit-ember-lending-001'],
          control_paths: ['lending.supply'],
          zero_capacity: false,
          policy_snapshot_ref: 'pol-ember-lending-001',
          canonical_unsigned_payload_ref: 'unsigned-txpayload-ember-lending-001',
          artifact_ref: expect.stringMatching(/^metamask-delegation:/),
          issued_at: expect.any(String),
          activated_at: expect.any(String),
          policy_hash: 'policy-pol-ember-lending-001',
        },
      },
    });

    const signedRedelegation = registerSignedRedelegationRequest.params.signed_redelegation;
    const decodedArtifact = decodeDelegationArtifactRef(
      signedRedelegation['artifact_ref'] as string,
    );
    expect(decodedArtifact).toMatchObject({
      delegate: '0x00000000000000000000000000000000000000b1',
      delegator: '0x00000000000000000000000000000000000000c2',
      authority: getDelegationHashOffchain(rootSignedDelegation) as `0x${string}`,
      caveats: [],
      salt: expect.stringMatching(/^0x[0-9a-f]+$/),
      signature: TEST_REDELEGATION_SIGNATURE,
    });

    expect(protocolHost.acknowledgeCommittedEventOutbox).toHaveBeenCalledWith({
      protocol_version: 'v1',
      consumer_id: 'portfolio-manager-redelegation',
      delivered_through_sequence: 5,
    });
  });

  it('prefers the newest unacknowledged redelegation work item when older work is stale', async () => {
    const rootSignedDelegation = createSignedRootDelegation(
      '0x00000000000000000000000000000000000000c1',
    );
    const rootDelegationArtifactRef = encodeDelegationArtifactRef(rootSignedDelegation);
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-register-signed-redelegation',
        result: {
          protocol_version: 'v1',
          revision: 10,
          committed_event_ids: ['evt-request-execution-7'],
          execution_result: {
            phase: 'ready_for_execution_signing',
            request_id: 'req-ember-lending-execution-002',
            transaction_plan_id: 'txplan-ember-lending-002',
          },
        },
      })),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 9,
        acknowledged_through_sequence: 4,
        next_cursor: 6,
        has_more: false,
        events: [
          {
            protocol_version: 'v1',
            event_id: 'evt-request-execution-5',
            sequence: 5,
            aggregate: 'request',
            aggregate_id: 'req-ember-lending-execution-001',
            event_type: 'requestExecution.prepared.v1',
            committed_at: '2026-04-01T06:19:00Z',
            payload: {
              request_id: 'req-ember-lending-execution-001',
              transaction_plan_id: 'txplan-ember-lending-001',
              phase: 'ready_for_redelegation',
              redelegation_signing_package: {
                execution_preparation_id: 'execprep-ember-lending-001',
                transaction_plan_id: 'txplan-ember-lending-001',
                request_id: 'req-ember-lending-execution-001',
                redelegation_intent_id: 'ri-req-ember-lending-execution-001',
                active_delegation_id: 'del-ember-lending-001',
                delegation_id: 'del-req-ember-lending-execution-001',
                delegation_plan_id:
                  'plan-req-ember-lending-execution-001-del-req-ember-lending-execution-001',
                root_delegation_id: 'root-user-protocol-001',
                root_delegation_artifact_ref: rootDelegationArtifactRef,
                delegator_address: '0x00000000000000000000000000000000000000a1',
                agent_id: 'ember-lending',
                agent_wallet: '0x00000000000000000000000000000000000000b1',
                network: 'arbitrum',
                reservation_ids: ['reservation-ember-lending-001'],
                unit_ids: ['unit-ember-lending-001'],
                control_paths: ['lending.withdraw'],
                zero_capacity: false,
                policy_snapshot_ref: 'pol-ember-lending-001',
                canonical_unsigned_payload_ref: 'unsigned-txpayload-ember-lending-001',
              },
            },
          },
          {
            protocol_version: 'v1',
            event_id: 'evt-request-execution-6',
            sequence: 6,
            aggregate: 'request',
            aggregate_id: 'req-ember-lending-execution-002',
            event_type: 'requestExecution.prepared.v1',
            committed_at: '2026-04-01T06:20:00Z',
            payload: {
              request_id: 'req-ember-lending-execution-002',
              transaction_plan_id: 'txplan-ember-lending-002',
              phase: 'ready_for_redelegation',
              redelegation_signing_package: {
                execution_preparation_id: 'execprep-ember-lending-002',
                transaction_plan_id: 'txplan-ember-lending-002',
                request_id: 'req-ember-lending-execution-002',
                redelegation_intent_id: 'ri-req-ember-lending-execution-002',
                active_delegation_id: 'del-ember-lending-002',
                delegation_id: 'del-req-ember-lending-execution-002',
                delegation_plan_id:
                  'plan-req-ember-lending-execution-002-del-req-ember-lending-execution-002',
                root_delegation_id: 'root-user-protocol-001',
                root_delegation_artifact_ref: rootDelegationArtifactRef,
                delegator_address: '0x00000000000000000000000000000000000000a1',
                agent_id: 'ember-lending',
                agent_wallet: '0x00000000000000000000000000000000000000b2',
                network: 'arbitrum',
                reservation_ids: ['reservation-ember-lending-002'],
                unit_ids: ['unit-ember-lending-002', 'unit-ember-lending-003'],
                control_paths: ['lending.withdraw'],
                zero_capacity: false,
                policy_snapshot_ref: 'pol-ember-lending-002',
                canonical_unsigned_payload_ref: 'unsigned-txpayload-ember-lending-002',
              },
            },
          },
        ],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 10,
        consumer_id: 'portfolio-manager-redelegation',
        acknowledged_through_sequence: 6,
      })),
    };
    const runtimeSigning = createRuntimeSigningStub(
      vi.fn(async () => ({
        confirmedAddress: '0x00000000000000000000000000000000000000c1' as const,
        signedPayload: {
          signature: TEST_REDELEGATION_SIGNATURE,
        },
      })),
    );

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
      controllerWalletAddress: '0x00000000000000000000000000000000000000c2',
      controllerSignerAddress: '0x00000000000000000000000000000000000000c1',
      runtimeSigning,
      runtimeSignerRef: 'controller-wallet',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'active',
          lastPortfolioState: null,
          lastSharedEmberRevision: 8,
          lastRootDelegation: {
            root_delegation_id: 'root-user-protocol-001',
          },
          lastOnboardingBootstrap: createOnboardingBootstrap(),
          lastRootedWalletContextId: 'rwc-user-protocol-001',
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: null,
        },
        operation: {
          source: 'command',
          name: 'refresh_redelegation_work',
        },
      }),
    ).resolves.toMatchObject({
      outputs: {
        artifacts: [
          {
            data: expect.objectContaining({
              eventId: 'evt-request-execution-6',
              sequence: 6,
              requestId: 'req-ember-lending-execution-002',
              transactionPlanId: 'txplan-ember-lending-002',
              acknowledgedThroughSequence: 6,
            }),
          },
        ],
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          transaction_plan_id: 'txplan-ember-lending-002',
        }),
      }),
    );
    expect(protocolHost.acknowledgeCommittedEventOutbox).toHaveBeenCalledWith({
      protocol_version: 'v1',
      consumer_id: 'portfolio-manager-redelegation',
      delivered_through_sequence: 6,
    });
  });

  it('fails closed when redelegation work arrives without a configured controller signer address', async () => {
    const rootSignedDelegation = createSignedRootDelegation(TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS);
    const rootDelegationArtifactRef = encodeDelegationArtifactRef(rootSignedDelegation);
    const protocolHost = {
      handleJsonRpc: vi.fn(),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 8,
        acknowledged_through_sequence: 0,
        events: [
          {
            event_id: 'evt-request-execution-5',
            sequence: 5,
            aggregate: 'request',
            aggregate_id: 'req-ember-lending-execution-001',
            event_type: 'requestExecution.prepared.v1',
            committed_at: '2026-04-01T06:19:00Z',
            payload: {
              request_id: 'req-ember-lending-execution-001',
              transaction_plan_id: 'txplan-ember-lending-001',
              phase: 'ready_for_redelegation',
              redelegation_signing_package: {
                execution_preparation_id: 'execprep-ember-lending-001',
                transaction_plan_id: 'txplan-ember-lending-001',
                request_id: 'req-ember-lending-execution-001',
                redelegation_intent_id: 'ri-req-ember-lending-execution-001',
                active_delegation_id: 'del-ember-lending-001',
                delegation_id: 'del-req-ember-lending-execution-001',
                delegation_plan_id:
                  'plan-req-ember-lending-execution-001-del-req-ember-lending-execution-001',
                root_delegation_id: 'root-user-protocol-001',
                root_delegation_artifact_ref: rootDelegationArtifactRef,
                delegator_address: '0x00000000000000000000000000000000000000a1',
                agent_id: 'ember-lending',
                agent_wallet: '0x00000000000000000000000000000000000000b1',
                network: 'arbitrum',
                reservation_ids: ['reservation-ember-lending-001'],
                unit_ids: ['unit-ember-lending-001'],
                control_paths: ['lending.supply'],
                zero_capacity: false,
                policy_snapshot_ref: 'pol-ember-lending-001',
                canonical_unsigned_payload_ref: 'unsigned-txpayload-ember-lending-001',
              },
            },
          },
        ],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(),
    };
    const runtimeSigning = createRuntimeSigningStub(vi.fn());

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
      controllerWalletAddress: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
      runtimeSigning,
      runtimeSignerRef: 'controller-wallet',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'active',
          lastPortfolioState: null,
          lastSharedEmberRevision: 7,
          lastRootDelegation: {
            root_delegation_id: 'root-user-protocol-001',
          },
          lastOnboardingBootstrap: createOnboardingBootstrap(),
          lastRootedWalletContextId: 'rwc-user-protocol-001',
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: null,
        },
        operation: {
          source: 'command',
          name: 'refresh_redelegation_work',
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'active',
        lastSharedEmberRevision: 8,
      },
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Portfolio-manager redelegation signing is blocked because the controller signer address is not configured.',
        },
      },
    });

    expect(runtimeSigning.signPayload).not.toHaveBeenCalled();
    expect(protocolHost.handleJsonRpc).not.toHaveBeenCalled();
    expect(protocolHost.acknowledgeCommittedEventOutbox).not.toHaveBeenCalled();
  });

  it('injects the portfolio mandate and managed lending mandate set into system context', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async (request: unknown) => {
        const jsonRpcRequest =
          typeof request === 'object' && request !== null
            ? (request as { method?: unknown; params?: unknown })
            : null;
        const method = jsonRpcRequest?.method;
        const params =
          jsonRpcRequest &&
          typeof jsonRpcRequest.params === 'object' &&
          jsonRpcRequest.params !== null
            ? (jsonRpcRequest.params as { agent_id?: unknown })
            : null;

        if (method === 'subagent.readPortfolioState.v1' && params?.agent_id === 'ember-lending') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-system-context-managed-agent-portfolio-state',
            result: {
              protocol_version: 'v1',
              revision: 4,
              portfolio_state: createLiveManagedAgentPortfolioState(),
            },
          };
        }

        if (method === 'orchestrator.readOnboardingState.v1') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-wallet-accounting-ember-lending-0x00000000000000000000000000000000000000a1',
            result: {
              revision: 4,
              onboarding_state: {
                wallet_address: '0x00000000000000000000000000000000000000a1',
                network: 'arbitrum',
                phase: 'active',
                proofs: {
                  rooted_wallet_context_registered: true,
                  root_delegation_registered: true,
                  root_authority_active: true,
                  wallet_baseline_observed: true,
                  accounting_units_seeded: true,
                  mandate_inputs_configured: true,
                  reserve_policy_configured: true,
                  capital_reserved_for_agent: true,
                  policy_snapshot_recorded: true,
                  initial_subagent_delegation_issued: true,
                  agent_active: true,
                },
                rooted_wallet_context: {
                  rooted_wallet_context_id: 'rwc-user-protocol-001',
                },
                root_delegation: {
                  root_delegation_id: 'root-a1',
                },
                owned_units: [],
                reservations: [],
              },
            },
          };
        }

        throw new Error(`unexpected method: ${String(method ?? 'missing')}`);
      }),
      readCommittedEventOutbox: vi.fn(),
      acknowledgeCommittedEventOutbox: vi.fn(),
    };
    const domain = createPortfolioManagerDomain({
      agentId: 'portfolio-manager',
      protocolHost,
    });

    await expect(
      domain.systemContext?.({
        threadId: 'thread-1',
        state: {
          phase: 'active',
          lastPortfolioState: null,
          lastSharedEmberRevision: 4,
          lastRootDelegation: {
            root_delegation_id: 'root-a1',
          },
          lastOnboardingBootstrap: createOnboardingBootstrap(),
          lastRootedWalletContextId: 'rwc-user-protocol-001',
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: null,
        },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        '  <managed_agent_mandates>',
        '    <managed_agent agent_key="ember-lending-primary" agent_type="ember-lending" approved="true" mandate_ref="mandate-ember-lending-live-001">',
        '      <managed_mandate>',
        '        <lending_policy>',
        '          <collateral_policy>',
        '            <assets>',
        '              <item>',
        '                <asset>USDC</asset>',
        '                <max_allocation_pct>60</max_allocation_pct>',
        '              </item>',
        '              <item>',
        '                <asset>USDT</asset>',
        '                <max_allocation_pct>25</max_allocation_pct>',
        '              </item>',
        '            </assets>',
        '          </collateral_policy>',
        '          <borrow_policy>',
        '            <allowed_assets>',
        '              <item>USDC</item>',
        '              <item>USDT</item>',
        '            </allowed_assets>',
        '          </borrow_policy>',
        '          <risk_policy>',
        '            <max_ltv_bps>6500</max_ltv_bps>',
        '            <min_health_factor>1.4</min_health_factor>',
        '          </risk_policy>',
        '        </lending_policy>',
        '      </managed_mandate>',
        '    </managed_agent>',
        '  </managed_agent_mandates>',
      ]),
    );
  });

  it('falls back to the projected managed mandate when active-phase live portfolio reads are unavailable', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async (request: unknown) => {
        const jsonRpcRequest =
          typeof request === 'object' && request !== null
            ? (request as { method?: unknown; params?: unknown })
            : null;
        const method = jsonRpcRequest?.method;
        const params =
          jsonRpcRequest &&
          typeof jsonRpcRequest.params === 'object' &&
          jsonRpcRequest.params !== null
            ? (jsonRpcRequest.params as { agent_id?: unknown })
            : null;

        if (method === 'subagent.readPortfolioState.v1' && params?.agent_id === 'ember-lending') {
          throw new Error('managed-agent portfolio state unavailable');
        }

        if (method === 'orchestrator.readOnboardingState.v1') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-wallet-accounting-ember-lending-0x00000000000000000000000000000000000000a1',
            result: {
              revision: 4,
              onboarding_state: {
                wallet_address: '0x00000000000000000000000000000000000000a1',
                network: 'arbitrum',
                phase: 'active',
                proofs: {
                  rooted_wallet_context_registered: true,
                  root_delegation_registered: true,
                  root_authority_active: true,
                  wallet_baseline_observed: true,
                  accounting_units_seeded: true,
                  mandate_inputs_configured: true,
                  reserve_policy_configured: true,
                  capital_reserved_for_agent: true,
                  policy_snapshot_recorded: true,
                  initial_subagent_delegation_issued: true,
                  agent_active: true,
                },
                rooted_wallet_context: {
                  rooted_wallet_context_id: 'rwc-user-protocol-001',
                },
                root_delegation: {
                  root_delegation_id: 'root-a1',
                },
                owned_units: [],
                reservations: [],
              },
            },
          };
        }

        throw new Error(`unexpected method: ${String(method ?? 'missing')}`);
      }),
      readCommittedEventOutbox: vi.fn(),
      acknowledgeCommittedEventOutbox: vi.fn(),
    };
    const domain = createPortfolioManagerDomain({
      agentId: 'portfolio-manager',
      protocolHost,
    });

    await expect(
      domain.systemContext?.({
        threadId: 'thread-1',
        state: {
          phase: 'active',
          lastPortfolioState: null,
          lastSharedEmberRevision: 4,
          lastRootDelegation: {
            root_delegation_id: 'root-a1',
          },
          lastOnboardingBootstrap: createOnboardingBootstrap(),
          lastRootedWalletContextId: 'rwc-user-protocol-001',
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: null,
        },
        currentProjection: {
          managedMandateEditor: {
            ownerAgentId: 'agent-portfolio-manager',
            targetAgentId: 'ember-lending',
            targetAgentRouteId: 'agent-ember-lending',
            targetAgentKey: 'ember-lending-primary',
            targetAgentTitle: 'Ember Lending',
            mandateRef: 'mandate-ember-lending-live-001',
            managedMandate: {
              lending_policy: createManagedLendingPolicy({
                collateral_policy: {
                  assets: [
                    {
                      asset: 'USDC',
                      max_allocation_pct: 60,
                    },
                    {
                      asset: 'USDT',
                      max_allocation_pct: 25,
                    },
                  ],
                },
                borrow_policy: {
                  allowed_assets: ['USDC', 'USDT'],
                },
                risk_policy: {
                  max_ltv_bps: 6500,
                  min_health_factor: '1.4',
                },
              }),
            },
            agentWallet: '0x00000000000000000000000000000000000000e1',
            rootUserWallet: '0x00000000000000000000000000000000000000a1',
            rootedWalletContextId: 'rwc-user-protocol-001',
            reservation: {
              reservationId: 'reservation-ember-lending-001',
              purpose: 'position.enter',
              controlPath: 'lending.supply',
              rootAsset: 'USDC',
              quantity: '25',
            },
          },
        } as Record<string, unknown>,
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        '  <managed_agent_mandates>',
        '    <managed_agent agent_key="ember-lending-primary" agent_type="ember-lending" approved="true" mandate_ref="mandate-ember-lending-live-001">',
        '      <managed_mandate>',
        '        <lending_policy>',
        '          <collateral_policy>',
        '            <assets>',
        '              <item>',
        '                <asset>USDC</asset>',
        '                <max_allocation_pct>60</max_allocation_pct>',
        '              </item>',
        '              <item>',
        '                <asset>USDT</asset>',
        '                <max_allocation_pct>25</max_allocation_pct>',
        '              </item>',
        '            </assets>',
        '          </collateral_policy>',
        '          <borrow_policy>',
        '            <allowed_assets>',
        '              <item>USDC</item>',
        '              <item>USDT</item>',
        '            </allowed_assets>',
        '          </borrow_policy>',
        '          <risk_policy>',
        '            <max_ltv_bps>6500</max_ltv_bps>',
        '            <min_health_factor>1.4</min_health_factor>',
        '          </risk_policy>',
        '        </lending_policy>',
        '      </managed_mandate>',
        '    </managed_agent>',
        '  </managed_agent_mandates>',
      ]),
    );
  });

  it('appends aggregated live Shared Ember accounting context to the system prompt context when a wallet is active', async () => {
    const onboardingBootstrap = {
      ...createOnboardingBootstrap(),
      mandates: [
        ...createOnboardingBootstrap().mandates,
        {
          mandate_ref: 'mandate-ember-rebalance-protocol-001',
          agent_id: 'ember-rebalance',
          managed_mandate: {
            lending_policy: createManagedLendingPolicy({
              collateral_policy: {
                assets: [
                  {
                    asset: 'WETH',
                    max_allocation_pct: 20,
                  },
                ],
              },
              borrow_policy: {
                allowed_assets: ['USDC'],
              },
            }),
          },
        },
      ],
    };
    const protocolHost = {
      handleJsonRpc: vi.fn(async (request: unknown) => {
        const jsonRpcRequest =
          typeof request === 'object' && request !== null
            ? (request as { method?: unknown; params?: unknown })
            : null;
        const method = jsonRpcRequest?.method;
        const params =
          jsonRpcRequest &&
          typeof jsonRpcRequest.params === 'object' &&
          jsonRpcRequest.params !== null
            ? (jsonRpcRequest.params as { agent_id?: unknown })
            : null;

        if (method === 'subagent.readPortfolioState.v1') {
          throw new Error('managed-agent portfolio state unavailable');
        }

        if (
          method === 'orchestrator.readOnboardingState.v1' &&
          params?.agent_id === 'ember-lending'
        ) {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-wallet-accounting-ember-lending-0x00000000000000000000000000000000000000a1',
            result: {
              revision: 4,
              onboarding_state: {
                wallet_address: '0x00000000000000000000000000000000000000a1',
                network: 'arbitrum',
                phase: 'active',
                proofs: {
                  rooted_wallet_context_registered: true,
                  root_delegation_registered: true,
                  root_authority_active: true,
                  wallet_baseline_observed: true,
                  accounting_units_seeded: true,
                  mandate_inputs_configured: true,
                  reserve_policy_configured: true,
                  capital_reserved_for_agent: true,
                  policy_snapshot_recorded: true,
                  initial_subagent_delegation_issued: true,
                  agent_active: true,
                },
                rooted_wallet_context: {
                  rooted_wallet_context_id: 'rwc-a1',
                },
                root_delegation: {
                  root_delegation_id: 'root-a1',
                },
                owned_units: [
                  {
                    unit_id: 'unit-idle',
                    root_asset: 'USDC',
                    quantity: '40',
                    status: 'available',
                    control_path: 'wallet.idle',
                    reservation_id: null,
                  },
                  {
                    unit_id: 'unit-a1',
                    root_asset: 'USDC',
                    quantity: '10',
                    status: 'reserved',
                    control_path: 'lending.supply',
                    reservation_id: 'reservation-a1',
                  },
                  {
                    unit_id: 'unit-a2',
                    root_asset: 'WETH',
                    quantity: '1.5',
                    status: 'reserved',
                    control_path: 'lending.supply',
                    reservation_id: 'reservation-a2',
                  },
                ],
                reservations: [
                  {
                    reservation_id: 'reservation-a1',
                    agent_id: 'ember-lending',
                    purpose: 'position.enter',
                    status: 'active',
                    control_path: 'lending.supply',
                    unit_allocations: [
                      {
                        unit_id: 'unit-a1',
                        quantity: '10',
                      },
                    ],
                  },
                ],
              },
            },
          };
        }

        if (
          method === 'orchestrator.readOnboardingState.v1' &&
          params?.agent_id === 'ember-rebalance'
        ) {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-wallet-accounting-ember-rebalance-0x00000000000000000000000000000000000000a1',
            result: {
              revision: 5,
              onboarding_state: {
                wallet_address: '0x00000000000000000000000000000000000000a1',
                network: 'arbitrum',
                phase: 'active',
                proofs: {
                  rooted_wallet_context_registered: true,
                  root_delegation_registered: true,
                  root_authority_active: true,
                  wallet_baseline_observed: true,
                  accounting_units_seeded: true,
                  mandate_inputs_configured: true,
                  reserve_policy_configured: true,
                  capital_reserved_for_agent: true,
                  policy_snapshot_recorded: true,
                  initial_subagent_delegation_issued: true,
                  agent_active: true,
                },
                rooted_wallet_context: {
                  rooted_wallet_context_id: 'rwc-a1',
                },
                root_delegation: {
                  root_delegation_id: 'root-a1',
                },
                owned_units: [
                  {
                    unit_id: 'unit-idle',
                    root_asset: 'USDC',
                    quantity: '40',
                    status: 'available',
                    control_path: 'wallet.idle',
                    reservation_id: null,
                  },
                  {
                    unit_id: 'unit-a1',
                    root_asset: 'USDC',
                    quantity: '10',
                    status: 'reserved',
                    control_path: 'lending.supply',
                    reservation_id: 'reservation-a1',
                  },
                  {
                    unit_id: 'unit-a2',
                    root_asset: 'WETH',
                    quantity: '1.5',
                    status: 'reserved',
                    control_path: 'lending.supply',
                    reservation_id: 'reservation-a2',
                  },
                ],
                reservations: [
                  {
                    reservation_id: 'reservation-a2',
                    agent_id: 'ember-rebalance',
                    purpose: 'position.enter',
                    status: 'active',
                    control_path: 'lending.supply',
                    unit_allocations: [
                      {
                        unit_id: 'unit-a2',
                        quantity: '1.5',
                      },
                    ],
                  },
                ],
              },
            },
          };
        }

        throw new Error(`unexpected method: ${String(method ?? 'missing')}`);
      }),
      readCommittedEventOutbox: vi.fn(),
      acknowledgeCommittedEventOutbox: vi.fn(),
    };
    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
    });

    await expect(
      domain.systemContext?.({
        threadId: 'thread-1',
        state: {
          phase: 'active',
          lastPortfolioState: null,
          lastSharedEmberRevision: 4,
          lastRootDelegation: null,
          lastOnboardingBootstrap: onboardingBootstrap,
          lastRootedWalletContextId: 'rwc-a1',
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: null,
        },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        '<shared_ember_accounting_context freshness="live">',
        expect.stringMatching(/^  <generated_at>.+<\/generated_at>$/),
        '  <wallet_address>0x00000000000000000000000000000000000000a1</wallet_address>',
        '  <revision>5</revision>',
        '  <phase>active</phase>',
        '    <asset unit_id="unit-idle">',
        '    <asset unit_id="unit-a1" reservation_id="reservation-a1">',
        '    <asset unit_id="unit-a2" reservation_id="reservation-a2">',
        '    <reservation reservation_id="reservation-a1" agent_id="ember-lending">',
        '    <reservation reservation_id="reservation-a2" agent_id="ember-rebalance">',
      ]),
    );

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'subagent.readPortfolioState.v1',
        params: {
          agent_id: 'ember-lending',
        },
      }),
    );
    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'subagent.readPortfolioState.v1',
        params: {
          agent_id: 'ember-rebalance',
        },
      }),
    );
    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'orchestrator.readOnboardingState.v1',
        params: {
          agent_id: 'ember-lending',
          wallet_address: '0x00000000000000000000000000000000000000a1',
          network: 'arbitrum',
        },
      }),
    );
    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'orchestrator.readOnboardingState.v1',
        params: {
          agent_id: 'ember-rebalance',
          wallet_address: '0x00000000000000000000000000000000000000a1',
          network: 'arbitrum',
        },
      }),
    );
  });

  it('marks live Shared Ember accounting context unavailable when the upstream read fails', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => {
        throw new Error('Shared Ember Domain Service HTTP request failed with status 503.');
      }),
      readCommittedEventOutbox: vi.fn(),
      acknowledgeCommittedEventOutbox: vi.fn(),
    };
    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
    });

    await expect(
      domain.systemContext?.({
        threadId: 'thread-1',
        state: {
          phase: 'active',
          lastPortfolioState: null,
          lastSharedEmberRevision: 4,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: null,
        },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        '<shared_ember_accounting_context status="unavailable">',
        expect.stringMatching(/^  <generated_at>.+<\/generated_at>$/),
        '  <wallet_address>0x00000000000000000000000000000000000000a1</wallet_address>',
        '  <network>arbitrum</network>',
        '  <error>Shared Ember Domain Service HTTP request failed with status 503.</error>',
      ]),
    );
  });
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AgentDetailPage } from './AgentDetailPage';

vi.mock('../hooks/usePrivyWalletClient', () => {
  return {
    usePrivyWalletClient: () => ({
      walletClient: null,
      privyWallet: null,
      chainId: null,
      switchChain: async () => {},
      isLoading: false,
      error: null,
    }),
  };
});

function renderManagedAgentDetail(
  overrides: Partial<React.ComponentProps<typeof AgentDetailPage>>,
) {
  return renderToStaticMarkup(
    React.createElement(AgentDetailPage, {
      agentId: 'agent-ember-lending',
      agentName: 'Ember Lending',
      agentDescription: 'desc',
      creatorName: 'Ember AI Team',
      creatorVerified: true,
      profile: {
        chains: ['Arbitrum'],
        protocols: ['Pi Runtime', 'Shared Ember Domain Service'],
        tokens: ['USDC'],
      },
      metrics: {},
      isHired: false,
      isHiring: false,
      hasLoadedView: true,
      onHire: () => {},
      onFire: () => {},
      onSync: () => {},
      onBack: () => {},
      allowedPools: [],
      ...overrides,
    }),
  );
}

describe('AgentDetailPage managed-agent affordances', () => {
  it('routes ember-lending onboarding through the portfolio manager in prehire state', () => {
    const html = renderManagedAgentDetail({});

    expect(html).toContain('Open Ember Portfolio Manager');
    expect(html).toContain('Managed onboarding happens through Ember Portfolio Manager.');
    expect(html).not.toContain('>Hire<');
    expect(html).toMatch(new RegExp('<button[^>]*disabled[^>]*>\\s*Chat\\s*</button>'));
    expect(html).not.toContain('Send message');
  });

  it('renders lending runtime context and enables chat only when the managed lane is active', () => {
    const html = renderManagedAgentDetail({
      isHired: true,
      initialTab: 'chat',
      taskStatus: 'working',
      lifecycleState: {
        phase: 'active',
        mandateRef: 'mandate-ember-lending-001',
        mandateSummary:
          'lend USDC on Aave within medium-risk allocation and health-factor guardrails',
        mandateContext: {
          network: 'arbitrum',
          protocol: 'aave',
        },
        walletAddress: '0x00000000000000000000000000000000000000b1',
        rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
        rootedWalletContextId: 'rwc-ember-lending-thread-001',
        lastReservationSummary:
          'Reservation reservation-ember-lending-001 deploys 10 USDC via lending.supply.',
      } as never,
    });

    expect(html).toContain('Managed lending runtime');
    expect(html).toContain('Lifecycle state');
    expect(html).toContain('active');
    expect(html).toContain('Subagent wallet');
    expect(html).toContain('0x00000000000000000000000000000000000000b1');
    expect(html).toContain('Task status');
    expect(html).toContain('working');
    expect(html).toContain('Arbitrum / Aave');
    expect(html).toContain(
      'lend USDC on Aave within medium-risk allocation and health-factor guardrails',
    );
    expect(html).toContain(
      'Reservation reservation-ember-lending-001 deploys 10 USDC via lending.supply.',
    );
    expect(html).toContain('>Manage<');
    expect(html).toContain('Send message');
  });

  it('keeps lending chat visible while the thread is input-required', () => {
    const html = renderManagedAgentDetail({
      isHired: true,
      initialTab: 'chat',
      taskStatus: 'input-required',
      activeInterrupt: {
        type: 'operator-config-request',
        message:
          'Please confirm safe withdrawal scope for collateral. I need the exact asset and/or maximum amount to withdraw.',
      } as never,
      lifecycleState: {
        phase: 'active',
        mandateRef: 'mandate-ember-lending-001',
        mandateSummary:
          'lend WETH on Aave within medium-risk allocation and health-factor guardrails',
        mandateContext: {
          network: 'arbitrum',
          protocol: 'aave',
          allowedCollateralAssets: ['WETH'],
          allowedBorrowAssets: ['WETH'],
          maxAllocationPct: 35,
          maxLtvBps: 7000,
          minHealthFactor: '1.25',
        },
        walletAddress: '0x00000000000000000000000000000000000000b1',
        rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
        rootedWalletContextId: 'rwc-ember-lending-thread-001',
        lastReservationSummary:
          'Reservation reservation-ember-lending-001 deploys 10 WETH via lending.supply.',
      } as never,
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'Withdraw all supplied WETH back to my wallet on Arbitrum.',
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Please confirm the safe withdrawal scope for collateral.',
        },
      ],
    });

    expect(html).toContain('Withdraw all supplied WETH back to my wallet on Arbitrum.');
    expect(html).toContain('Please confirm the safe withdrawal scope for collateral.');
    expect(html).toContain('Send message');
    expect(html).not.toContain('Agent Preferences');
  });

  it('does not invent a subagent wallet from sparse lending portfolio state and keeps chat enabled', () => {
    const html = renderManagedAgentDetail({
      isHired: true,
      initialTab: 'chat',
      taskStatus: 'completed',
      lifecycleState: {
        phase: 'active',
        mandateRef: null,
        mandateSummary: null,
        mandateContext: null,
        walletAddress: null,
        rootUserWalletAddress: null,
        rootedWalletContextId: null,
        lastReservationSummary: null,
        lastPortfolioState: {
          agent_id: 'ember-lending',
          owned_units: [
            {
              unit_id: 'unit-ember-lending-001',
              network: 'arbitrum',
              wallet_address: '0x00000000000000000000000000000000000000b1',
              root_asset: 'USDC',
              quantity: '10',
              reservation_id: 'reservation-ember-lending-001',
            },
          ],
          reservations: [
            {
              reservation_id: 'reservation-ember-lending-001',
              purpose: 'deploy',
              control_path: 'lending.supply',
            },
          ],
        },
      } as never,
    });

    expect(html).toContain('Managed lending runtime');
    expect(html).toContain('Lifecycle state');
    expect(html).toContain('active');
    expect(html).toContain('Lane');
    expect(html).toContain('Arbitrum / Lending');
    expect(html).not.toContain('Subagent wallet');
    expect(html).not.toContain('0x00000000000000000000000000000000000000b1');
    expect(html).toContain(
      'Reservation reservation-ember-lending-001 deploys 10 USDC via lending.supply.',
    );
    expect(html).toContain('Send message');
  });

  it('renders artifact labels from nested artifact payload types in the activity stream', () => {
    const html = renderManagedAgentDetail({
      isHired: true,
      initialTab: 'transactions',
      events: [
        {
          type: 'artifact',
          artifact: {
            artifactId: 'artifact-1',
            data: {
              type: 'shared-ember-portfolio-state',
            },
          },
        } as never,
      ],
    });

    expect(html).toContain('Activity Stream');
    expect(html).toContain('Artifact: shared-ember-portfolio-state');
  });

  it('renders the managed lending lane summary on the portfolio-manager detail page', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-portfolio-manager',
        agentName: 'Ember Portfolio Manager',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: ['Arbitrum'],
          protocols: ['Pi Runtime', 'Shared Ember Domain Service'],
          tokens: ['USDC'],
        },
        metrics: {},
        isHired: true,
        isHiring: false,
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
        lifecycleState: {
          phase: 'active',
          lastOnboardingBootstrap: {
            rootedWalletContext: {
              metadata: {
                approvedMandateEnvelope: {
                  portfolioMandate: {
                    approved: true,
                    riskLevel: 'medium',
                  },
                  managedAgentMandates: [
                    {
                      agentKey: 'ember-lending-primary',
                      agentType: 'ember-lending',
                      approved: true,
                      settings: {
                        network: 'arbitrum',
                        protocol: 'aave',
                        allowedCollateralAssets: ['USDC'],
                        allowedBorrowAssets: ['USDC'],
                        maxAllocationPct: 35,
                        maxLtvBps: 7000,
                        minHealthFactor: '1.25',
                      },
                    },
                  ],
                },
              },
            },
            mandates: [
              {
                mandate_ref: 'mandate-ember-lending-001',
                agent_id: 'ember-lending',
                mandate_summary:
                  'lend USDC on Aave within medium-risk allocation and health-factor guardrails',
              },
            ],
            reservations: [
              {
                reservation_id: 'reservation-ember-lending-001',
                purpose: 'deploy',
                control_path: 'lending.supply',
              },
            ],
            ownedUnits: [
              {
                unit_id: 'unit-ember-lending-001',
                root_asset: 'USDC',
                quantity: '10',
                reservation_id: 'reservation-ember-lending-001',
              },
            ],
          },
        } as never,
      }),
    );

    expect(html).toContain('Managed lending lane');
    expect(html).toContain('Ember Lending');
    expect(html).toContain('Arbitrum / Aave');
    expect(html).toContain('35% allocation cap');
    expect(html).toContain(
      'Reservation reservation-ember-lending-001 deploys 10 USDC via lending.supply.',
    );
    expect(html).toContain('/hire-agents/agent-ember-lending');
  });
});

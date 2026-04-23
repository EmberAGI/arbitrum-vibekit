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

function createManagedMandateEditorProjection(overrides: Record<string, unknown> = {}) {
  return {
    managedMandateEditor: {
      ownerAgentId: 'agent-portfolio-manager',
      targetAgentId: 'ember-lending',
      targetAgentRouteId: 'agent-ember-lending',
      targetAgentKey: 'ember-lending-primary',
      targetAgentTitle: 'Ember Lending',
      mandateRef: 'mandate-ember-lending-001',
      managedMandate: {
        lending_policy: {
          collateral_policy: {
            assets: [
              {
                asset: 'USDC',
                max_allocation_pct: 35,
              },
              {
                asset: 'WETH',
                max_allocation_pct: 20,
              },
            ],
          },
          borrow_policy: {
            allowed_assets: ['USDC', 'WETH'],
          },
          risk_policy: {
            max_ltv_bps: 7000,
            min_health_factor: '1.25',
          },
        },
      },
      agentWallet: '0x00000000000000000000000000000000000000b1',
      rootUserWallet: '0x00000000000000000000000000000000000000a1',
      rootedWalletContextId: 'rwc-ember-lending-thread-001',
      reservation: {
        reservationId: 'reservation-ember-lending-001',
        purpose: 'position.enter',
        controlPath: 'lending.supply',
        rootAsset: 'USDC',
        quantity: '10',
      },
      ...overrides,
    },
  };
}

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

    expect(html).toContain('Open Ember Portfolio Agent');
    expect(html).toContain('Managed onboarding happens through Ember Portfolio Agent.');
    expect(html).toContain('Swarm');
    expect(html).not.toContain('Workflow');
    expect(html).not.toContain('Managed workflow');
    expect(html).not.toContain('Shared state');
    expect(html).not.toContain('Pi Runtime');
    expect(html).not.toContain('Shared Ember Domain Service');
    expect(html).not.toContain('>Hire<');
    expect(html).toMatch(new RegExp('<button[^>]*disabled[^>]*>\\s*Chat\\s*</button>'));
    expect(html).not.toContain('Send message');
  });

  it('defaults hired ember-lending to the chat tab and renders chat first in the tab strip', () => {
    const html = renderManagedAgentDetail({
      isHired: true,
      taskStatus: 'working',
      lifecycleState: {
        phase: 'active',
      } as never,
      domainProjection: createManagedMandateEditorProjection(),
    });

    expect(html).toContain('Send message');
    expect(html.indexOf('>Chat<')).toBeLessThan(html.indexOf('>Settings and policies<'));
    expect(html.indexOf('>Chat<')).toBeLessThan(html.indexOf('>Metrics<'));
    expect(html.indexOf('>Chat<')).toBeLessThan(html.indexOf('>Activity<'));
    expect(html).toMatch(
      new RegExp('<button[^>]*text-\\[#261a12\\] border-\\[#d8c3ad\\][^>]*>\\s*Chat\\s*</button>'),
    );
  });

  it('renders only the shared managed-mandate workbench on lending while chat stays enabled', () => {
    const html = renderManagedAgentDetail({
      isHired: true,
      initialTab: 'chat',
      taskStatus: 'working',
      lifecycleState: {
        phase: 'active',
      } as never,
      domainProjection: createManagedMandateEditorProjection(),
    });

    expect(html).toContain('Subagent wallet');
    expect(html).toContain('0x0000...00b1');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('Edit collateral policy');
    expect(html).toContain('Edit allowed borrow assets');
    expect(html).toContain('>Manage<');
    expect(html).toContain('Save managed mandate');
    expect(html).toContain('Send message');
    expect(html).not.toContain('Managed lending lane');
    expect(html).not.toContain('View lending agent');
    expect(html).not.toContain('Reservation');
    expect(html).not.toContain('lending.supply');
    expect(html).not.toContain('lending_policy.collateral_policy.assets.0.asset');
    expect(html).not.toContain('lending_policy.borrow_policy.allowed_assets');
    expect(html).not.toContain('lending_policy.risk_policy.max_ltv_bps');
    expect(html).not.toContain('allocation_basis');
    expect(html).not.toContain('asset_intent');
    expect(html).not.toContain('Lifecycle state');
    expect(html).not.toContain('Task status');
    expect(html).not.toContain('Lane');
    expect(html).not.toContain('Agent Income');
    expect(html).not.toContain('AUM');
    expect(html).not.toContain('Total Users');
    expect(html).not.toContain('APY');
    expect(html).not.toContain('Your Assets');
    expect(html).not.toContain('Your PnL');
    expect(html).not.toContain('Managed lending runtime');
    expect(html.indexOf('0x0000...00b1')).toBeLessThan(
      html.indexOf('desc'),
    );
    expect(html.indexOf('Ember Lending')).toBeLessThan(html.indexOf('Ember AI Team'));
    expect(html.indexOf('Ember AI Team')).toBeLessThan(html.indexOf('desc'));
    expect(html.indexOf('desc')).toBeLessThan(html.indexOf('Save managed mandate'));
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
      } as never,
      domainProjection: createManagedMandateEditorProjection({
        managedMandate: {
          lending_policy: {
            collateral_policy: {
              assets: [
                {
                  asset: 'WETH',
                  max_allocation_pct: 35,
                },
              ],
            },
            borrow_policy: {
              allowed_assets: [],
            },
            risk_policy: {
              max_ltv_bps: 7000,
              min_health_factor: '1.25',
            },
          },
        },
        reservation: {
          reservationId: 'reservation-ember-lending-001',
          purpose: 'position.enter',
          controlPath: 'lending.supply',
          rootAsset: 'WETH',
          quantity: '10',
        },
      }),
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
      } as never,
    });

    expect(html).not.toContain('Subagent wallet');
    expect(html).not.toContain('0x00000000000000000000000000000000000000b1');
    expect(html).toContain('Send message');
    expect(html).not.toContain('Lifecycle state');
    expect(html).not.toContain('Task status');
    expect(html).not.toContain('Lane');
    expect(html).not.toContain('Agent Income');
    expect(html).not.toContain('AUM');
    expect(html).not.toContain('Total Users');
    expect(html).not.toContain('APY');
    expect(html).not.toContain('Your Assets');
    expect(html).not.toContain('Your PnL');
    expect(html).not.toContain('Managed lending runtime');
  });

  it('does not render lending reservation summaries now that only the workbench remains', () => {
    const longReservationId =
      'res-ember-lending-rwc-3bdae87fc824589696d2525dee4ca7ae0xad53ec51a70e9a17df6752fda80cd465457c258d';
    const html = renderManagedAgentDetail({
      isHired: true,
      initialTab: 'chat',
      taskStatus: 'working',
      lifecycleState: {
        phase: 'active',
      } as never,
      domainProjection: createManagedMandateEditorProjection({
        reservation: {
          reservationId: longReservationId,
          purpose: 'position.enter',
          controlPath: 'lending.supply',
          rootAsset: 'USDC',
          quantity: '10',
        },
      }),
    });

    expect(html).toContain('Save managed mandate');
    expect(html).not.toContain('Reservation');
    expect(html).not.toContain('lending.supply');
    expect(html).not.toContain(longReservationId);
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

  it('renders only the shared managed-mandate workbench on the portfolio-manager detail page', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-portfolio-manager',
        agentName: 'Ember Portfolio Agent',
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
        } as never,
        domainProjection: createManagedMandateEditorProjection(),
      }),
    );

    expect(html).toContain('Edit collateral policy');
    expect(html).toContain('Edit allowed borrow assets');
    expect(html).toContain('Send message');
    expect(html).not.toContain('Settings and policies');
    expect(html).not.toMatch(new RegExp('<button[^>]*>\\s*Metrics\\s*</button>'));
    expect(html).not.toMatch(new RegExp('<button[^>]*>\\s*Activity\\s*</button>'));
    expect(html).not.toMatch(new RegExp('<button[^>]*>\\s*Chat\\s*</button>'));
    expect(html).toContain('Save managed mandate');
    expect(html).not.toContain('Managed lending lane');
    expect(html).not.toContain('View lending agent');
    expect(html).not.toContain('lending.supply');
    expect(html.indexOf('Ember Portfolio Agent')).toBeLessThan(html.indexOf('Ember AI Team'));
    expect(html.indexOf('Ember AI Team')).toBeLessThan(html.indexOf('desc'));
    expect(html.indexOf('desc')).toBeLessThan(html.indexOf('Save managed mandate'));
    expect(html.indexOf('Save managed mandate')).toBeLessThan(html.indexOf('Send message'));
  });

  it('keeps managed lending lane details hidden while portfolio-manager onboarding is in progress', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-portfolio-manager',
        agentName: 'Ember Portfolio Agent',
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
          phase: 'onboarding',
        } as never,
        onboardingFlow: {
          status: 'in_progress',
          revision: 2,
          steps: [],
        } as never,
        domainProjection: createManagedMandateEditorProjection(),
      }),
    );

    expect(html).not.toContain('Managed lending lane');
    expect(html).not.toContain('Save managed mandate');
    expect(html).not.toContain('/hire-agents/agent-ember-lending');
  });

  it('keeps managed lending lane details hidden until portfolio-manager onboarding completes even after activation', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-portfolio-manager',
        agentName: 'Ember Portfolio Agent',
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
        } as never,
        onboardingFlow: {
          status: 'in_progress',
          revision: 3,
          steps: [],
        } as never,
        domainProjection: createManagedMandateEditorProjection(),
      }),
    );

    expect(html).not.toContain('Managed lending lane');
    expect(html).not.toContain('Save managed mandate');
    expect(html).not.toContain('/hire-agents/agent-ember-lending');
  });
});

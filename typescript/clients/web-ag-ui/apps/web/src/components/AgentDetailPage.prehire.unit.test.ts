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

describe('AgentDetailPage (pre-hire + onboarding affordances)', () => {
  it('renders a lightweight metrics preview before the agent is hired', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-clmm',
        agentName: 'Camelot CLMM',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
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
      }),
    );

    expect(html).toContain('APY Change');
    expect(html).toContain('Total Users');
  });

  it('renders metrics tab as disabled while onboarding is in progress', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-clmm',
        agentName: 'Camelot CLMM',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        isHired: true,
        isHiring: false,
        onboarding: { step: 1 },
        taskStatus: 'input-required',
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toMatch(
      new RegExp('<button[^>]*disabled[^>]*>\\s*Metrics\\s*</button>'),
    );
  });

  it('shows metrics tab as enabled when onboarding metadata is stale but no input is required', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-pendle',
        agentName: 'Pendle Yield',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        isHired: true,
        isHiring: false,
        onboarding: { step: 3 },
        taskStatus: 'working',
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toMatch(
      new RegExp('<button[^>]*>\\s*Metrics\\s*</button>'),
    );
    expect(html).not.toMatch(
      new RegExp('<button[^>]*disabled[^>]*>\\s*Metrics\\s*</button>'),
    );
  });

  it('keeps metrics disabled during Pendle hire while setup is still in progress', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-pendle',
        agentName: 'Pendle Yield',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        isHired: true,
        isHiring: false,
        currentCommand: 'hire',
        taskStatus: 'working',
        setupComplete: false,
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toMatch(
      new RegExp('<button[^>]*disabled[^>]*>\\s*Metrics\\s*</button>'),
    );
  });

  it('enables metrics after Pendle setup is complete even if command remains hire', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-pendle',
        agentName: 'Pendle Yield',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        isHired: true,
        isHiring: false,
        currentCommand: 'hire',
        taskStatus: 'working',
        setupComplete: true,
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toMatch(
      new RegExp('<button[^>]*>\\s*Metrics\\s*</button>'),
    );
    expect(html).not.toMatch(
      new RegExp('<button[^>]*disabled[^>]*>\\s*Metrics\\s*</button>'),
    );
  });

  it('keeps metrics disabled while onboarding lifecycle is explicitly in progress', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-clmm',
        agentName: 'Camelot CLMM',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        isHired: true,
        isHiring: false,
        currentCommand: 'cycle',
        taskStatus: 'working',
        onboardingFlow: {
          status: 'in_progress',
          revision: 2,
          activeStepId: 'funding-token',
          steps: [
            { id: 'setup', title: 'Agent Preferences', status: 'completed' },
            { id: 'funding-token', title: 'Funding Token', status: 'active' },
            { id: 'delegation-signing', title: 'Delegation Signing', status: 'pending' },
          ],
        },
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toMatch(
      new RegExp('<button[^>]*disabled[^>]*>\\s*Metrics\\s*</button>'),
    );
  });

  it('renders onboarding sidebar from agent-provided onboarding flow', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-pendle',
        agentName: 'Pendle Yield',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        isHired: true,
        isHiring: false,
        activeInterrupt: {
          type: 'pendle-setup-request',
          message: 'configure',
        },
        onboardingFlow: {
          status: 'in_progress',
          revision: 1,
          activeStepId: 'funding-amount',
          steps: [
            { id: 'funding-amount', title: 'Funding Amount', status: 'active' },
            { id: 'funding-token', title: 'Funding Token', status: 'pending' },
          ],
        },
        taskStatus: 'input-required',
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toContain('Funding Amount');
    expect(html).toContain('Funding Token');
    expect(html).not.toContain('Delegation Signing');
  });

  it('renders delegation as the second step when funding is skipped', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-pendle',
        agentName: 'Pendle Yield',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        isHired: true,
        isHiring: false,
        activeInterrupt: {
          type: 'pendle-delegation-signing-request',
          message: 'sign',
          chainId: 42161,
          delegationManager: '0x0000000000000000000000000000000000000001',
          delegatorAddress: '0x0000000000000000000000000000000000000002',
          delegateeAddress: '0x0000000000000000000000000000000000000003',
          delegationsToSign: [],
          descriptions: [],
          warnings: [],
        },
        onboardingFlow: {
          status: 'in_progress',
          revision: 2,
          activeStepId: 'delegation-signing',
          steps: [
            { id: 'funding-amount', title: 'Funding Amount', status: 'completed' },
            { id: 'delegation-signing', title: 'Delegation Signing', status: 'active' },
          ],
        },
        taskStatus: 'input-required',
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toContain('Funding Amount');
    expect(html).toContain('Delegation Signing');
    expect(html).not.toContain('Funding Token');
  });

  it('renders reduced delegation step from onboarding flow', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-pendle',
        agentName: 'Pendle Yield',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        isHired: true,
        isHiring: false,
        activeInterrupt: {
          type: 'pendle-delegation-signing-request',
          message: 'sign',
          chainId: 42161,
          delegationManager: '0x0000000000000000000000000000000000000001',
          delegatorAddress: '0x0000000000000000000000000000000000000002',
          delegateeAddress: '0x0000000000000000000000000000000000000003',
          delegationsToSign: [],
          descriptions: [],
          warnings: [],
        },
        onboardingFlow: {
          status: 'in_progress',
          revision: 4,
          activeStepId: 'delegation-signing',
          steps: [
            {
              id: 'funding-amount',
              title: 'Funding Amount',
              status: 'completed',
            },
            {
              id: 'delegation-signing',
              title: 'Delegation Signing',
              status: 'active',
            },
          ],
        },
        taskStatus: 'input-required',
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toContain('Funding Amount');
    expect(html).toContain('Delegation Signing');
    expect(html).not.toContain('Funding Token');
  });
});

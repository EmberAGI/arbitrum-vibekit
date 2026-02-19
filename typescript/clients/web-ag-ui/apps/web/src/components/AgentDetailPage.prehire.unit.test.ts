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

  it('supports the summary toggle before hiring', () => {
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
        initialSummaryCollapsed: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toContain('>Show details<');
    expect(html).not.toContain('>Chains<');
    expect(html).not.toContain('>Protocols<');
    expect(html).not.toContain('>Tokens<');
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

  it('hides allocation settings panels while onboarding is in progress', () => {
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

    expect(html).not.toContain('Allocation Settings');
    expect(html).not.toContain('Configure the amount of funds allocated to this agent');
    expect(html).not.toContain('Additional policy settings will be available in a future update.');
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

  it('renders onboarding sidebar from agent-provided totalSteps', () => {
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
        onboarding: { step: 1, totalSteps: 2 },
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
        onboarding: { step: 2, totalSteps: 2 },
        taskStatus: 'input-required',
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toContain('Agent Setup');
    expect(html).toContain('Delegation Signing');
    expect(html).not.toContain('Funding Token');
  });
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AgentDetailPage } from './AgentDetailPage';
import type { ClmmEvent } from '../types/agent';

type AgentId = 'agent-clmm' | 'agent-pendle' | 'agent-gmx-allora';

const AGENTS: Array<{ id: AgentId; name: string }> = [
  { id: 'agent-clmm', name: 'Camelot CLMM' },
  { id: 'agent-pendle', name: 'Pendle Yield' },
  { id: 'agent-gmx-allora', name: 'GMX Allora Trader' },
];

vi.mock('../hooks/usePrivyWalletClient', () => {
  return {
    usePrivyWalletClient: () => ({
      walletClient: null,
      privyWallet: { address: '0x1111111111111111111111111111111111111111' },
      chainId: 42161,
      switchChain: async () => {},
      isLoading: false,
      error: null,
    }),
  };
});

function renderAgentDetail(params: {
  agentId: AgentId;
  agentName: string;
  isHired: boolean;
  hasLoadedView?: boolean;
  initialTab?: 'blockers' | 'metrics' | 'transactions' | 'chat';
  taskId?: string;
  taskStatus?: string;
  telemetry?: Array<{
    cycle: number;
    action: string;
    timestamp?: string;
  }>;
  events?: ClmmEvent[];
  isFiring?: boolean;
  activeInterrupt?:
    | { type: 'operator-config-request'; message: string }
    | { type: 'pendle-setup-request'; message: string }
    | { type: 'gmx-setup-request'; message: string }
    | null;
}) {
  return renderToStaticMarkup(
    React.createElement(AgentDetailPage, {
      agentId: params.agentId,
      agentName: params.agentName,
      agentDescription: 'desc',
      creatorName: 'Ember AI Team',
      creatorVerified: true,
      profile: {
        chains: ['Arbitrum One', 'Arbitrum'],
        protocols: ['Camelot'],
        tokens: ['USDC', 'WETH', 'WBTC'],
        agentIncome: 754,
        aum: 742510,
        totalUsers: 5321,
        apy: 22,
      },
      metrics: {
        iteration: 1,
        cyclesSinceRebalance: 0,
        staleCycles: 0,
        rebalanceCycles: 0,
        aumUsd: 742510,
        apy: 22,
        lifetimePnlUsd: 0,
      },
      fullMetrics: {
        cyclesSinceRebalance: 0,
        staleCycles: 0,
        iteration: 1,
        rebalanceCycles: 0,
      },
      isHired: params.isHired,
      initialTab: params.initialTab,
      isHiring: false,
      hasLoadedView: params.hasLoadedView ?? true,
      isFiring: params.isFiring ?? false,
      isSyncing: false,
      uiError: null,
      onClearUiError: () => {},
      onHire: () => {},
      onFire: () => {},
      onSync: () => {},
      onBack: () => {},
      activeInterrupt: params.activeInterrupt ?? null,
      allowedPools: [
        {
          address: '0x1111111111111111111111111111111111111111',
          token0: { symbol: 'USDC' },
          token1: { symbol: 'WETH' },
        },
      ],
      onInterruptSubmit: () => {},
      taskId: params.taskId,
      taskStatus: params.taskStatus,
      haltReason: undefined,
      executionError: undefined,
      delegationsBypassActive: false,
      onboarding: undefined,
      transactions: [],
      telemetry: params.telemetry ?? [],
      events: params.events ?? [],
      settings: { amount: 100 },
      onSettingsChange: () => {},
    }),
  );
}

describe('AgentDetailPage (cross-agent contracts)', () => {
  it('keeps pre-hire layout visible even when detail sync has not loaded yet', () => {
    const html = renderAgentDetail({
      agentId: 'agent-gmx-allora',
      agentName: 'GMX Allora Trader',
      isHired: false,
      hasLoadedView: false,
    });

    expect(html).toContain('>Hire<');
    expect(html).not.toContain('Agent is hired');
    expect(html).not.toContain('>Fire<');
  });

  it.each(AGENTS)('renders shared pre-hire summary cards for $name', ({ id, name }) => {
    const html = renderAgentDetail({
      agentId: id,
      agentName: name,
      isHired: false,
    });

    expect(html).toContain('>Hire<');
    expect(html).toContain('APY Change');
    expect(html).toContain('Total Users');
    expect(html).not.toContain('Agent is hired');
  });

  it.each(AGENTS)('renders hired split-pill contract for $name', ({ id, name }) => {
    const html = renderAgentDetail({
      agentId: id,
      agentName: name,
      isHired: true,
    });

    expect(html).toContain('Agent is hired');
    expect(html).toContain('>Fire<');
    expect(html).toContain('Your Assets');
    expect(html).toContain('Your PnL');
  });

  it.each(AGENTS)('uses Activity + Settings and policies tabs for $name', ({ id, name }) => {
    const html = renderAgentDetail({
      agentId: id,
      agentName: name,
      isHired: true,
    });

    expect(html).toContain('Settings and policies');
    expect(html).toContain('Activity');
    expect(html).not.toContain('Agent Blockers');
    expect(html).not.toContain('Transaction history');
  });

  it.each(AGENTS)('renders Activity Stream panel in Activity tab for $name', ({ id, name }) => {
    const html = renderAgentDetail({
      agentId: id,
      agentName: name,
      isHired: true,
      initialTab: 'transactions',
      events: [
        {
          type: 'status',
          message: 'Delegation approvals received. Continuing onboarding.',
          task: { id: 'task-1', taskStatus: { state: 'working' } },
        },
      ],
    });

    expect(html).toContain('Activity Stream');
    expect(html).toContain('Delegation approvals received. Continuing onboarding.');
  });

  it.each(AGENTS)('does not render Activity Stream panel in Metrics tab for $name', ({ id, name }) => {
    const html = renderAgentDetail({
      agentId: id,
      agentName: name,
      isHired: true,
      initialTab: 'metrics',
      events: [
        {
          type: 'status',
          message: 'Delegation approvals received. Continuing onboarding.',
          task: { id: 'task-1', taskStatus: { state: 'working' } },
        },
      ],
    });

    expect(html).not.toContain('Activity Stream');
  });

  it.each(AGENTS)('defaults to Activity tab while fire command is active for $name', ({ id, name }) => {
    const html = renderAgentDetail({
      agentId: id,
      agentName: name,
      isHired: true,
      isFiring: true,
    });

    expect(html).toContain('No transactions yet');
  });

  it.each(AGENTS)(
    'keeps post-hire tabs visible after fire completes for $name',
    ({ id, name }) => {
      const html = renderAgentDetail({
        agentId: id,
        agentName: name,
        isHired: false,
        isFiring: true,
      });

      expect(html).toContain('>Hire<');
      expect(html).toContain('Settings and policies');
      expect(html).toContain('Activity');
      expect(html).toContain('No transactions yet');
      expect(html).not.toContain('APY Change');
    },
  );

  it.each(AGENTS)('deduplicates arbitrum chain label for $name', ({ id, name }) => {
    const html = renderAgentDetail({
      agentId: id,
      agentName: name,
      isHired: true,
    });

    const arbitrumMentions = html.match(/>Arbitrum</g) ?? [];
    expect(arbitrumMentions.length).toBe(1);
    expect(html).not.toContain('Arbitrum One');
  });

  it('routes CLMM setup interrupt to Agent Preferences form', () => {
    const html = renderAgentDetail({
      agentId: 'agent-clmm',
      agentName: 'Camelot CLMM',
      isHired: true,
      activeInterrupt: {
        type: 'operator-config-request',
        message: 'configure clmm',
      },
    });

    expect(html).toContain('Agent Preferences');
    expect(html).toContain('Select Pool');
    expect(html).toContain('Allocated Funds (USD)');
  });

  it('routes Pendle setup interrupt to Pendle Setup form', () => {
    const html = renderAgentDetail({
      agentId: 'agent-pendle',
      agentName: 'Pendle Yield',
      isHired: true,
      activeInterrupt: {
        type: 'pendle-setup-request',
        message: 'configure pendle',
      },
    });

    expect(html).toContain('Pendle Setup');
    expect(html).toContain('Funding Amount (USD)');
    expect(html).not.toContain('Auto-selected yield');
    expect(html).not.toContain('highest-yield YT market');
    expect(html).toContain('PT position management');
  });

  it('routes GMX setup interrupt to GMX Allora Setup form', () => {
    const html = renderAgentDetail({
      agentId: 'agent-gmx-allora',
      agentName: 'GMX Allora Trader',
      isHired: true,
      activeInterrupt: {
        type: 'gmx-setup-request',
        message: 'configure gmx',
      },
    });

    expect(html).toContain('GMX Allora Setup');
    expect(html).toContain('Target Market');
    expect(html).toContain('USDC Allocation');
    expect(html).toContain('Allora Signal Source');
  });
});

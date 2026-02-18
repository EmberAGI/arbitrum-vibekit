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
  initialTab?: 'blockers' | 'metrics' | 'transactions' | 'chat';
  taskId?: string;
  taskStatus?: string;
  telemetry?: Array<{
    cycle: number;
    action: string;
    timestamp?: string;
  }>;
  events?: ClmmEvent[];
  currentCommand?: string;
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
      hasLoadedView: true,
      isFiring: false,
      isSyncing: false,
      currentCommand: params.currentCommand,
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

function makeStatusEvent(message: string): ClmmEvent {
  return {
    type: 'status',
    message,
    task: {
      id: 'task-1',
      taskStatus: {
        state: 'working',
      },
    },
  };
}

function makeArtifactEvent(type: string): ClmmEvent {
  return {
    type: 'artifact',
    artifact: {
      type,
    },
  };
}

describe('AgentDetailPage (cross-agent contracts)', () => {
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
      currentCommand: 'cycle',
    });

    expect(html).toContain('Agent is hired');
    expect(html).toContain('>Fire<');
    expect(html).toContain('Your Assets');
    expect(html).toContain('Your PnL');
  });

  it.each(AGENTS)(
    'renders onboarding lifecycle CTA as single Onboarding button for $name',
    ({ id, name }) => {
      const onboardingInterrupt =
        id === 'agent-pendle'
          ? { type: 'pendle-setup-request' as const, message: 'configure pendle' }
          : id === 'agent-gmx-allora'
            ? { type: 'gmx-setup-request' as const, message: 'configure gmx' }
            : { type: 'operator-config-request' as const, message: 'configure clmm' };

      const html = renderAgentDetail({
        agentId: id,
        agentName: name,
        isHired: true,
        currentCommand: 'hire',
        taskStatus: 'input-required',
        activeInterrupt: onboardingInterrupt,
      });

      expect(html).toContain('>Onboarding<');
      expect(html).not.toContain('Onboarding in progress');
      expect(html).not.toContain('>Pay<');
      expect(html).not.toContain('>Fire<');
    },
  );

  it.each(AGENTS)(
    'removes onboarding waiting/helper copy while setup is active for $name',
    ({ id, name }) => {
      const html = renderAgentDetail({
        agentId: id,
        agentName: name,
        isHired: true,
        currentCommand: 'hire',
        taskStatus: 'input-required',
      });

      expect(html).not.toContain('Waiting for agent');
      expect(html).not.toContain('The agent will prompt you when it needs configuration input.');
      expect(html).not.toContain('How Policies Work');
    },
  );

  it.each(AGENTS)('renders latest activity plaintext under CTA for $name', ({ id, name }) => {
    const html = renderAgentDetail({
      agentId: id,
      agentName: name,
      isHired: true,
      events: [
        makeStatusEvent('Funding amount received.'),
        makeArtifactEvent('cycle-report'),
        makeStatusEvent('Cycle executed successfully.'),
      ],
      telemetry: [{ cycle: 7, action: 'rebalance', timestamp: '2026-02-15T12:00:00.000Z' }],
    });

    expect(html).toContain('Cycle executed successfully.');
  });

  it.each(AGENTS)('keeps latest activity plaintext visible during onboarding for $name', ({ id, name }) => {
    const onboardingInterrupt =
      id === 'agent-pendle'
        ? { type: 'pendle-setup-request' as const, message: 'configure pendle' }
        : id === 'agent-gmx-allora'
          ? { type: 'gmx-setup-request' as const, message: 'configure gmx' }
          : { type: 'operator-config-request' as const, message: 'configure clmm' };
    const html = renderAgentDetail({
      agentId: id,
      agentName: name,
      isHired: true,
      currentCommand: 'hire',
      activeInterrupt: onboardingInterrupt,
      telemetry: [],
      events: [makeStatusEvent('Awaiting funding-token selection to continue onboarding.')],
    });

    expect(html).toContain('Please finish onboarding');
    expect(html).not.toContain('Awaiting funding-token selection to continue onboarding.');
  });

  it.each(AGENTS)('uses Activity + Settings and policies tabs for $name', ({ id, name }) => {
    const html = renderAgentDetail({
      agentId: id,
      agentName: name,
      isHired: true,
      currentCommand: 'cycle',
    });

    expect(html).toContain('Settings and policies');
    expect(html).toContain('Activity');
    expect(html).not.toContain('Agent Blockers');
    expect(html).not.toContain('Transaction history');
  });

  it.each(AGENTS)(
    'hides onboarding panel and keeps settings/policies only in blockers tab once onboarding is complete for $name',
    ({ id, name }) => {
      const html = renderAgentDetail({
        agentId: id,
        agentName: name,
        isHired: true,
        initialTab: 'blockers',
        currentCommand: 'cycle',
        taskStatus: 'working',
      });

      expect(html).toContain('Allocation Settings');
      expect(html).toContain('Policies');
      expect(html).not.toContain('Waiting for agent');
      expect(html).not.toContain('How Policies Work');
      expect(html).not.toContain('lg:grid-cols-[1fr_300px]');
    },
  );

  it.each(AGENTS)('renders current task + latest activity in Activity tab for $name', ({ id, name }) => {
    const html = renderAgentDetail({
      agentId: id,
      agentName: name,
      isHired: true,
      initialTab: 'transactions',
      taskId: 'task-1234567890',
      taskStatus: 'working',
      telemetry: [{ cycle: 1, action: 'sync', timestamp: '2026-02-15T12:00:00.000Z' }],
    });

    expect(html).toContain('Current Task');
    expect(html).toContain('Latest Activity');
    expect(html).toContain('Cycle 1');
    expect(html).toContain('sync');
  });

  it.each(AGENTS)('does not render Activity Stream panel in Metrics tab for $name', ({ id, name }) => {
    const html = renderAgentDetail({
      agentId: id,
      agentName: name,
      isHired: true,
      initialTab: 'metrics',
      events: [makeStatusEvent('Delegation approvals received. Continuing onboarding.')],
    });

    expect(html).not.toContain('Activity Stream');
  });

  it.each(AGENTS)('renders Activity Stream panel in Activity tab for $name', ({ id, name }) => {
    const html = renderAgentDetail({
      agentId: id,
      agentName: name,
      isHired: true,
      initialTab: 'transactions',
      events: [makeStatusEvent('Delegation approvals received. Continuing onboarding.')],
    });

    expect(html).toContain('Activity Stream');
    expect(html).toContain('Delegation approvals received. Continuing onboarding.');
  });

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
    expect(html).toContain('Auto-selected yield');
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

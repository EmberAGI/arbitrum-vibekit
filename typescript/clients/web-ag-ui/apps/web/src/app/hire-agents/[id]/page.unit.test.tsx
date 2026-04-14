// @vitest-environment jsdom

import React, { Suspense } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AgentDetailRoute from './page';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  invokeAgentCommandRoute: vi.fn(),
  getAgentThreadId: vi.fn(),
  applyDomainProjection: vi.fn(),
  agentValue: null as Record<string, unknown> | null,
  capturedProps: null as Record<string, unknown> | null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
  useSearchParams: () => ({
    get: () => null,
  }),
}));

vi.mock('@/contexts/AgentContext', () => ({
  useAgent: () => mocks.agentValue,
}));

vi.mock('@/hooks/usePrivyWalletClient', () => ({
  usePrivyWalletClient: () => ({
    privyWallet: {
      address: '0x1111111111111111111111111111111111111111',
    },
  }),
}));

vi.mock('@/utils/agentCommandRoute', () => ({
  invokeAgentCommandRoute: (...args: unknown[]) => mocks.invokeAgentCommandRoute(...args),
}));

vi.mock('@/utils/agentThread', () => ({
  getAgentThreadId: (...args: unknown[]) => mocks.getAgentThreadId(...args),
}));

vi.mock('@/components/AgentDetailPage', () => ({
  AgentDetailPage: (props: Record<string, unknown>) => {
    mocks.capturedProps = props;
    return React.createElement('div', { 'data-testid': 'agent-detail-page' });
  },
}));

function createAgentValue(overrides: Record<string, unknown> = {}) {
  return {
    config: {
      id: 'agent-portfolio-manager',
    },
    isConnected: true,
    hasLoadedView: true,
    hasAuthoritativeState: true,
    threadId: 'thread-1',
    domainProjection: {},
    applyDomainProjection: mocks.applyDomainProjection,
    interruptRenderer: null,
    uiError: null,
    clearUiError: () => undefined,
    uiState: {
      lifecycle: {
        phase: 'active',
      },
      task: undefined,
      haltReason: undefined,
      executionError: undefined,
      delegationsBypassActive: false,
      onboardingFlow: undefined,
    },
    profile: {
      agentIncome: 0,
      aum: 0,
      totalUsers: 0,
      apy: 0,
      chains: ['Arbitrum'],
      protocols: ['Aave'],
      tokens: ['USDC'],
    },
    metrics: {
      iteration: 0,
      cyclesSinceRebalance: 0,
      staleCycles: 0,
      rebalanceCycles: 0,
      aumUsd: 0,
      apy: 0,
      lifetimePnlUsd: 0,
    },
    activity: {
      telemetry: [],
      events: [],
    },
    transactionHistory: [],
    events: [],
    messages: [],
    settings: {
      amount: 100,
    },
    isHired: true,
    isActive: true,
    isHiring: false,
    isFiring: false,
    isSyncing: false,
    activeInterrupt: null,
    runHire: () => undefined,
    runFire: () => undefined,
    runSync: () => undefined,
    sendChatMessage: () => undefined,
    resolveInterrupt: () => undefined,
    updateSettings: () => undefined,
    saveSettings: () => undefined,
    ...overrides,
  };
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function readCapturedProps(): Record<string, unknown> {
  if (!mocks.capturedProps) {
    throw new Error('Expected AgentDetailPage props to be captured.');
  }

  return mocks.capturedProps;
}

describe('AgentDetailRoute managed mandate wiring', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.push.mockReset();
    mocks.invokeAgentCommandRoute.mockReset();
    mocks.getAgentThreadId.mockReset();
    mocks.applyDomainProjection.mockReset();
    mocks.capturedProps = null;
    mocks.agentValue = createAgentValue();
    mocks.getAgentThreadId.mockImplementation((agentId: string) =>
      agentId === 'agent-portfolio-manager' ? 'pm-thread' : null,
    );

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  async function renderRoute(agentId: string): Promise<void> {
    await act(async () => {
      root.render(
        <Suspense fallback={null}>
          <AgentDetailRoute params={Promise.resolve({ id: agentId })} />
        </Suspense>,
      );
    });
    await flushEffects();
    await flushEffects();
  }

  it('hydrates the PM page from the one-off refresh command and applies returned projection state', async () => {
    mocks.agentValue = createAgentValue({
      config: {
        id: 'agent-portfolio-manager',
      },
      threadId: 'pm-thread',
      domainProjection: {},
    });
    mocks.invokeAgentCommandRoute.mockResolvedValue({
      ok: true,
      domainProjection: {
        managedMandateEditor: {
          mandateRef: 'mandate-ember-lending-001',
        },
      },
    });

    await renderRoute('agent-portfolio-manager');

    expect(mocks.invokeAgentCommandRoute).toHaveBeenCalledWith({
      agentId: 'agent-portfolio-manager',
      threadId: 'pm-thread',
      command: {
        name: 'refresh_portfolio_state',
      },
    });
    expect(mocks.applyDomainProjection).toHaveBeenCalledWith({
      managedMandateEditor: {
        mandateRef: 'mandate-ember-lending-001',
      },
    });
  });

  it('keeps the route in reconnecting mode until an authoritative thread snapshot lands', async () => {
    mocks.agentValue = createAgentValue({
      hasLoadedView: false,
      hasAuthoritativeState: false,
      isHired: false,
      isActive: false,
      uiState: {
        lifecycle: undefined,
        task: undefined,
        haltReason: undefined,
        executionError: undefined,
        delegationsBypassActive: false,
        onboardingFlow: undefined,
      },
      profile: {
        agentIncome: 0,
        aum: 0,
        totalUsers: 0,
        apy: 0,
        chains: [],
        protocols: [],
        tokens: [],
      },
      metrics: {
        iteration: 0,
        cyclesSinceRebalance: 0,
        staleCycles: 0,
        rebalanceCycles: 0,
        aumUsd: 0,
        apy: 0,
        lifetimePnlUsd: 0,
      },
    });
    mocks.invokeAgentCommandRoute.mockResolvedValue({
      ok: true,
      domainProjection: {
        managedMandateEditor: {
          mandateRef: 'mandate-ember-lending-001',
        },
      },
    });

    await renderRoute('agent-portfolio-manager');

    const props = readCapturedProps();
    expect(props.isHired).toBe(false);
    expect(props.isRestoringState).toBe(true);
    expect(props.hasLoadedView).toBe(false);
    expect(mocks.invokeAgentCommandRoute).not.toHaveBeenCalled();
  });

  it('routes hosted lending edits through the PM-owned command and then rehydrates the lending thread projection', async () => {
    mocks.agentValue = createAgentValue({
      config: {
        id: 'agent-ember-lending',
      },
      threadId: 'lending-thread',
      domainProjection: {
        managedMandateEditor: {
          mandateRef: 'mandate-ember-lending-001',
        },
      },
    });
    mocks.invokeAgentCommandRoute
      .mockResolvedValueOnce({
        ok: true,
        domainProjection: {
          managedMandateEditor: {
            mandateRef: 'mandate-ember-lending-002',
          },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        domainProjection: {
          managedMandateEditor: {
            mandateRef: 'mandate-ember-lending-002',
            targetAgentRouteId: 'agent-ember-lending',
          },
        },
      });

    await renderRoute('agent-ember-lending');
    const props = readCapturedProps() as {
      onManagedMandateSave?: (input: {
        targetAgentId: string;
        targetAgentRouteId: string;
        mandateSummary: string;
        managedMandate: Record<string, unknown>;
      }) => Promise<void>;
    };

    await act(async () => {
      await props.onManagedMandateSave?.({
        targetAgentId: 'ember-lending',
        targetAgentRouteId: 'agent-ember-lending',
        mandateSummary: 'lend USDC and WETH through the managed lending lane',
        managedMandate: {
          allocation_basis: 'allocable_idle',
          allowed_assets: ['USDC', 'WETH'],
          asset_intent: {
            root_asset: 'USDC',
            network: 'arbitrum',
            benchmark_asset: 'USD',
            intent: 'deploy',
            control_path: 'lending.supply',
          },
        },
      });
    });

    expect(mocks.invokeAgentCommandRoute).toHaveBeenNthCalledWith(1, {
      agentId: 'agent-portfolio-manager',
      threadId: 'pm-thread',
      command: {
        name: 'update_managed_mandate',
        input: {
          targetAgentId: 'ember-lending',
          mandateSummary: 'lend USDC and WETH through the managed lending lane',
          managedMandate: {
            allocation_basis: 'allocable_idle',
            allowed_assets: ['USDC', 'WETH'],
            asset_intent: {
              root_asset: 'USDC',
              network: 'arbitrum',
              benchmark_asset: 'USD',
              intent: 'deploy',
              control_path: 'lending.supply',
            },
          },
        },
      },
    });
    expect(mocks.invokeAgentCommandRoute).toHaveBeenNthCalledWith(2, {
      agentId: 'agent-ember-lending',
      threadId: 'lending-thread',
      command: {
        name: 'hydrate_runtime_projection',
      },
    });
    expect(mocks.applyDomainProjection).toHaveBeenCalledWith({
      managedMandateEditor: {
        mandateRef: 'mandate-ember-lending-002',
        targetAgentRouteId: 'agent-ember-lending',
      },
    });
  });

  it('applies the returned PM projection directly when the edit is hosted on the PM page', async () => {
    mocks.agentValue = createAgentValue({
      config: {
        id: 'agent-portfolio-manager',
      },
      threadId: 'pm-thread',
      domainProjection: {
        managedMandateEditor: {
          mandateRef: 'mandate-ember-lending-001',
        },
      },
    });
    mocks.invokeAgentCommandRoute.mockResolvedValue({
      ok: true,
      domainProjection: {
        managedMandateEditor: {
          mandateRef: 'mandate-ember-lending-003',
        },
      },
    });

    await renderRoute('agent-portfolio-manager');
    const props = readCapturedProps() as {
      onManagedMandateSave?: (input: {
        targetAgentId: string;
        targetAgentRouteId: string;
        mandateSummary: string;
        managedMandate: Record<string, unknown>;
      }) => Promise<void>;
    };

    await act(async () => {
      await props.onManagedMandateSave?.({
        targetAgentId: 'ember-lending',
        targetAgentRouteId: 'agent-ember-lending',
        mandateSummary: 'lend USDC through the managed lending lane',
        managedMandate: {
          allocation_basis: 'allocable_idle',
          allowed_assets: ['USDC'],
          asset_intent: {
            root_asset: 'USDC',
            network: 'arbitrum',
            benchmark_asset: 'USD',
            intent: 'deploy',
            control_path: 'lending.supply',
          },
        },
      });
    });

    expect(mocks.invokeAgentCommandRoute).toHaveBeenCalledTimes(1);
    expect(mocks.invokeAgentCommandRoute).toHaveBeenCalledWith({
      agentId: 'agent-portfolio-manager',
      threadId: 'pm-thread',
      command: {
        name: 'update_managed_mandate',
        input: {
          targetAgentId: 'ember-lending',
          mandateSummary: 'lend USDC through the managed lending lane',
          managedMandate: {
            allocation_basis: 'allocable_idle',
            allowed_assets: ['USDC'],
            asset_intent: {
              root_asset: 'USDC',
              network: 'arbitrum',
              benchmark_asset: 'USD',
              intent: 'deploy',
              control_path: 'lending.supply',
            },
          },
        },
      },
    });
    expect(mocks.applyDomainProjection).toHaveBeenCalledWith({
      managedMandateEditor: {
        mandateRef: 'mandate-ember-lending-003',
      },
    });
  });
});

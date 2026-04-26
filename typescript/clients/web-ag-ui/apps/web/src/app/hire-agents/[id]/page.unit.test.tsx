// @vitest-environment jsdom

import React, { Suspense } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AgentDetailRoute from './page';
import type { EmberOnboardingSeed } from '@/types/agent';

// React's act() helper expects this flag under the lightweight jsdom runner.
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  navigateToHref: vi.fn(),
  login: vi.fn(),
  invokeAgentCommandRoute: vi.fn(),
  getAgentThreadId: vi.fn(),
  applyDomainProjection: vi.fn(),
  agentValue: null as Record<string, unknown> | null,
  capturedProps: null as Record<string, unknown> | null,
  searchParams: new Map<string, string>(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
  }),
  useSearchParams: () => ({
    get: (key: string) => mocks.searchParams.get(key) ?? null,
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

vi.mock('@privy-io/react-auth', () => ({
  useLogin: () => ({
    login: mocks.login,
  }),
}));

vi.mock('@/utils/privyConfig', () => ({
  isPrivyConfigured: () => true,
}));

vi.mock('@/utils/agentCommandRoute', () => ({
  invokeAgentCommandRoute: (...args: unknown[]) => mocks.invokeAgentCommandRoute(...args),
}));

vi.mock('@/utils/agentThread', () => ({
  getAgentThreadId: (...args: unknown[]) => mocks.getAgentThreadId(...args),
}));

vi.mock('@/utils/hardNavigation', () => ({
  navigateToHref: (...args: unknown[]) => mocks.navigateToHref(...args),
}));

vi.mock('@/components/AgentDetailPage', () => ({
  AgentDetailPage: (props: Record<string, unknown>) => {
    mocks.capturedProps = props;
    return React.createElement('div', { 'data-testid': 'agent-detail-page' });
  },
}));

const walletProfilerSeed: EmberOnboardingSeed = {
  pm_setup: {
    risk_level: 'medium',
    diagnosis_summary: 'Active DeFi user with missing reserve policy.',
    portfolio_intent_summary:
      'Use Portfolio Agent to preserve upside while enforcing reserve discipline.',
    operator_caveats: ['Only the lending mandate is persisted today.'],
  },
  first_managed_mandate: {
    target_agent_id: 'ember-lending',
    target_agent_key: 'ember-lending-primary',
    managed_mandate: {
      lending_policy: {
        collateral_policy: {
          assets: [
            {
              asset: 'USDC',
              max_allocation_pct: 35,
            },
          ],
        },
        borrow_policy: {
          allowed_assets: [],
        },
        risk_policy: {
          max_ltv_bps: 4500,
          min_health_factor: '1.60',
        },
      },
    },
  },
  future_subagent_plan: {
    status: 'exploratory_not_persisted',
    summary: 'Future strategy is not persisted by current onboarding.',
  },
};

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
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_UI_PREVIEW;
    mocks.push.mockReset();
    mocks.replace.mockReset();
    mocks.navigateToHref.mockReset();
    mocks.login.mockReset();
    mocks.invokeAgentCommandRoute.mockReset();
    mocks.invokeAgentCommandRoute.mockResolvedValue({ ok: true });
    mocks.getAgentThreadId.mockReset();
    mocks.applyDomainProjection.mockReset();
    mocks.capturedProps = null;
    mocks.searchParams.clear();
    mocks.agentValue = createAgentValue();
    mocks.getAgentThreadId.mockImplementation((agentId: string) => {
      if (agentId === 'agent-portfolio-manager') {
        return 'pm-thread';
      }
      if (agentId === 'agent-ember-lending') {
        return 'lending-thread';
      }
      return null;
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    globalThis.fetch = originalFetch;
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

  it('redirects unregistered agent routes back to the marketplace instead of rendering a fallback detail view', async () => {
    await renderRoute('agent-pi-example');

    expect(mocks.navigateToHref).toHaveBeenCalledWith('/hire-agents', { replace: true });
    expect(mocks.capturedProps).toBeNull();
  });

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

  it('opens Privy login instead of no-op hire when only a derived thread id exists', async () => {
    mocks.agentValue = createAgentValue({
      config: {
        id: 'inactive-agent',
      },
      threadId: undefined,
      hasLoadedView: false,
      hasAuthoritativeState: false,
      isConnected: false,
      isHired: false,
      isActive: false,
    });
    mocks.getAgentThreadId.mockReturnValue('derived-thread-id');

    await renderRoute('agent-portfolio-manager');

    const props = readCapturedProps();
    expect(typeof props.onHire).toBe('function');
    (props.onHire as () => void)();

    expect(mocks.login).toHaveBeenCalledTimes(1);
  });

  it('hydrates the PM page from refresh even when the hired PM thread is still marked onboarding', async () => {
    mocks.agentValue = createAgentValue({
      config: {
        id: 'agent-portfolio-manager',
      },
      threadId: 'pm-thread',
      domainProjection: {},
      uiState: {
        lifecycle: {
          phase: 'onboarding',
        },
        task: undefined,
        haltReason: undefined,
        executionError: undefined,
        delegationsBypassActive: false,
        onboardingFlow: undefined,
      },
      isHired: true,
      isActive: false,
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

  it('passes an encoded wallet-profiler seed into the PM setup interrupt in UI preview mode', async () => {
    process.env.NEXT_PUBLIC_UI_PREVIEW = 'true';
    mocks.searchParams.set('__uiState', 'onboarding');
    mocks.searchParams.set('__fixture', 'wallet-profiler-seed');
    mocks.searchParams.set(
      '__walletProfilerSeed',
      encodeURIComponent(JSON.stringify(walletProfilerSeed)),
    );

    await renderRoute('agent-portfolio-manager');

    expect(readCapturedProps().activeInterrupt).toEqual({
      type: 'portfolio-manager-setup-request',
      message: 'Review the wallet-profiler onboarding seed.',
      emberOnboardingSeed: walletProfilerSeed,
    });
  });

  it('ignores wallet-profiler seed preview parameters when UI preview mode is disabled', async () => {
    mocks.searchParams.set('__uiState', 'onboarding');
    mocks.searchParams.set('__fixture', 'wallet-profiler-seed');
    mocks.searchParams.set(
      '__walletProfilerSeed',
      encodeURIComponent(JSON.stringify(walletProfilerSeed)),
    );

    await renderRoute('agent-portfolio-manager');

    expect(readCapturedProps().activeInterrupt).toBeNull();
  });

  it('ignores invalid wallet-profiler seed preview JSON instead of passing it through', async () => {
    process.env.NEXT_PUBLIC_UI_PREVIEW = 'true';
    mocks.searchParams.set('__uiState', 'onboarding');
    mocks.searchParams.set('__fixture', 'wallet-profiler-seed');
    mocks.searchParams.set('__walletProfilerSeed', encodeURIComponent('{"pm_setup":{}'));

    await renderRoute('agent-portfolio-manager');

    expect(readCapturedProps().activeInterrupt).toBeNull();
  });

  it('fetches a wallet-profiler seed by seedId in UI preview mode', async () => {
    process.env.NEXT_PUBLIC_UI_PREVIEW = 'true';
    mocks.searchParams.set('__uiState', 'onboarding');
    mocks.searchParams.set('__fixture', 'wallet-profiler-seed');
    mocks.searchParams.set('seedId', 'seed-123');
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      expect(input.toString()).toBe('/api/dev/wallet-profiler-seed/seed-123');
      return new Response(
        JSON.stringify({
          ok: true,
          emberOnboardingSeed: walletProfilerSeed,
        }),
        { status: 200 },
      );
    });

    await renderRoute('agent-portfolio-manager');
    await flushEffects();
    await flushEffects();

    expect(readCapturedProps().activeInterrupt).toEqual({
      type: 'portfolio-manager-setup-request',
      message: 'Review the wallet-profiler onboarding seed.',
      emberOnboardingSeed: walletProfilerSeed,
    });
  });

  it('ignores unknown seedId lookups instead of passing a seeded interrupt', async () => {
    process.env.NEXT_PUBLIC_UI_PREVIEW = 'true';
    mocks.searchParams.set('__uiState', 'onboarding');
    mocks.searchParams.set('__fixture', 'wallet-profiler-seed');
    mocks.searchParams.set('seedId', 'missing');
    globalThis.fetch = vi.fn(async () => new Response('not found', { status: 404 }));

    await renderRoute('agent-portfolio-manager');
    await flushEffects();
    await flushEffects();

    expect(readCapturedProps().activeInterrupt).toBeNull();
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
            mandateRef: 'mandate-ember-lending-001',
          },
        },
      })
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
        managedMandate: Record<string, unknown>;
      }) => Promise<void>;
    };

    await act(async () => {
      await props.onManagedMandateSave?.({
        targetAgentId: 'ember-lending',
        targetAgentRouteId: 'agent-ember-lending',
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
              allowed_assets: ['USDC'],
            },
            risk_policy: {
              max_ltv_bps: 7000,
              min_health_factor: '1.25',
            },
          },
        },
      });
    });

    expect(mocks.invokeAgentCommandRoute).toHaveBeenNthCalledWith(1, {
      agentId: 'agent-ember-lending',
      threadId: 'lending-thread',
      command: {
        name: 'hydrate_runtime_projection',
      },
    });
    expect(mocks.invokeAgentCommandRoute).toHaveBeenNthCalledWith(2, {
      agentId: 'agent-portfolio-manager',
      threadId: 'pm-thread',
      command: {
        name: 'update_managed_mandate',
        input: {
          targetAgentId: 'ember-lending',
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
                allowed_assets: ['USDC'],
              },
              risk_policy: {
                max_ltv_bps: 7000,
                min_health_factor: '1.25',
              },
            },
          },
        },
      },
    });
    expect(mocks.invokeAgentCommandRoute).toHaveBeenNthCalledWith(3, {
      agentId: 'agent-portfolio-manager',
      threadId: 'pm-thread',
      command: {
        name: 'refresh_portfolio_state',
      },
    });
    expect(mocks.invokeAgentCommandRoute).toHaveBeenNthCalledWith(4, {
      agentId: 'agent-ember-lending',
      threadId: 'lending-thread',
      command: {
        name: 'hydrate_runtime_projection',
      },
    });
    expect(mocks.applyDomainProjection).toHaveBeenLastCalledWith({
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
    mocks.invokeAgentCommandRoute
      .mockResolvedValueOnce({
        ok: true,
        domainProjection: {
          managedMandateEditor: {
            mandateRef: 'mandate-ember-lending-001',
          },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        domainProjection: {
          managedMandateEditor: {
            mandateRef: 'mandate-ember-lending-003',
          },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        domainProjection: {
          managedMandateEditor: {
            mandateRef: 'mandate-ember-lending-004',
          },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        domainProjection: {
          managedMandateEditor: {
            mandateRef: 'mandate-ember-lending-004',
            targetAgentRouteId: 'agent-ember-lending',
          },
        },
      });

    await renderRoute('agent-portfolio-manager');
    const props = readCapturedProps() as {
      onManagedMandateSave?: (input: {
        targetAgentId: string;
        targetAgentRouteId: string;
        managedMandate: Record<string, unknown>;
      }) => Promise<void>;
    };

    await act(async () => {
      await props.onManagedMandateSave?.({
        targetAgentId: 'ember-lending',
        targetAgentRouteId: 'agent-ember-lending',
        managedMandate: {
          lending_policy: {
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
          },
        },
      });
    });

    expect(mocks.invokeAgentCommandRoute).toHaveBeenCalledTimes(4);
    expect(mocks.invokeAgentCommandRoute).toHaveBeenNthCalledWith(1, {
      agentId: 'agent-portfolio-manager',
      threadId: 'pm-thread',
      command: {
        name: 'refresh_portfolio_state',
      },
    });
    expect(mocks.invokeAgentCommandRoute).toHaveBeenNthCalledWith(2, {
      agentId: 'agent-portfolio-manager',
      threadId: 'pm-thread',
      command: {
        name: 'update_managed_mandate',
        input: {
          targetAgentId: 'ember-lending',
          managedMandate: {
            lending_policy: {
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
            },
          },
        },
      },
    });
    expect(mocks.invokeAgentCommandRoute).toHaveBeenNthCalledWith(3, {
      agentId: 'agent-portfolio-manager',
      threadId: 'pm-thread',
      command: {
        name: 'refresh_portfolio_state',
      },
    });
    expect(mocks.invokeAgentCommandRoute).toHaveBeenNthCalledWith(4, {
      agentId: 'agent-ember-lending',
      threadId: 'lending-thread',
      command: {
        name: 'hydrate_runtime_projection',
      },
    });
    expect(mocks.applyDomainProjection).toHaveBeenLastCalledWith({
      managedMandateEditor: {
        mandateRef: 'mandate-ember-lending-004',
      },
    });
  });
});

// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  );

  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('AgentDetailPage managed mandate editor', () => {
  let container: HTMLDivElement;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  const previousActEnvironment = (globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }).IS_REACT_ACT_ENVIRONMENT;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    consoleErrorSpy.mockRestore();
    container.remove();
  });

  it('renders the portfolio manager mandate editor on the portfolio manager page', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
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
            status: 'completed',
            revision: 4,
            steps: [],
          } as never,
          domainProjection: {
            portfolioManagerMandateEditor: {
              ownerAgentId: 'agent-portfolio-manager',
              targetAgentId: 'agent-portfolio-manager',
              targetAgentRouteId: 'agent-portfolio-manager',
              targetAgentKey: 'portfolio-manager-primary',
              targetAgentTitle: 'Portfolio Manager Mandate',
              mandateRef: 'mandate-portfolio-manager',
              managedMandate: {
                betaExposureCapPct: 65,
                riskBudgetBps: 1800,
                minimumCashUsd: 5000,
              },
            },
          },
        }),
      );
    });

    const lendingSaveButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Save lending mandate'),
    );
    const portfolioManagerSaveButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Save PM mandate'),
    );

    expect(lendingSaveButton).toBeUndefined();
    expect(portfolioManagerSaveButton).toBeDefined();
    expect(container.textContent).toContain('Portfolio manager mandate');
    expect(container.textContent).toContain('Beta exposure cap');

    await act(async () => {
      root.unmount();
    });
  });

  it('hides risk controls when borrow is cleared and preserves the existing supply-only risk policy', async () => {
    const onManagedMandateSave = vi.fn(async () => undefined);
    const root = createRoot(container);

    await act(async () => {
      root.render(
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
          domainProjection: {
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
                        max_allocation_pct: 25,
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
            },
          },
          onManagedMandateSave,
        }),
      );
    });

    const editCollateralPolicyButton = container.querySelector(
      'button[aria-label="Edit collateral policy"]',
    ) as HTMLButtonElement | null;
    const editBorrowAssetsButton = container.querySelector(
      'button[aria-label="Edit allowed borrow assets"]',
    ) as HTMLButtonElement | null;
    const editMaxLtvButton = container.querySelector(
      'button[aria-label="Edit maximum LTV"]',
    ) as HTMLButtonElement | null;
    const editHealthFactorButton = container.querySelector(
      'button[aria-label="Edit minimum health factor"]',
    ) as HTMLButtonElement | null;
    const submitButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Save lending mandate'),
    );

    expect(editCollateralPolicyButton).toBeDefined();
    expect(editBorrowAssetsButton).toBeDefined();
    expect(editMaxLtvButton).toBeDefined();
    expect(editHealthFactorButton).toBeDefined();
    expect(submitButton).toBeDefined();

    await act(async () => {
      editCollateralPolicyButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const usdcCollateralCapInput = container.querySelector(
      'input[name="managed-mandate-collateral-cap-USDC"]',
    ) as HTMLInputElement | null;
    const wethCollateralCapInput = container.querySelector(
      'input[name="managed-mandate-collateral-cap-WETH"]',
    ) as HTMLInputElement | null;

    expect(usdcCollateralCapInput).toBeDefined();
    expect(wethCollateralCapInput).toBeDefined();

    await act(async () => {
      setInputValue(usdcCollateralCapInput!, '25');
      setInputValue(wethCollateralCapInput!, '60');
      editBorrowAssetsButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const clearBorrowAssetsButton = container.querySelector(
      'button[aria-label="Toggle token USDC"]',
    ) as HTMLButtonElement | null;

    expect(clearBorrowAssetsButton).toBeDefined();

    await act(async () => {
      clearBorrowAssetsButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('button[aria-label="Edit maximum LTV"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Edit minimum health factor"]')).toBeNull();

    await act(async () => {
      submitButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onManagedMandateSave).toHaveBeenCalledWith({
      ownerAgentId: 'agent-portfolio-manager',
      targetAgentId: 'ember-lending',
      targetAgentRouteId: 'agent-ember-lending',
      managedMandate: {
        lending_policy: {
          collateral_policy: {
            assets: [
              {
                asset: 'USDC',
                max_allocation_pct: 25,
              },
              {
                asset: 'WETH',
                max_allocation_pct: 60,
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
    });

    await act(async () => {
      root.unmount();
    });
  });

  it('renders and saves the portfolio manager mandate editor with numeric inputs', async () => {
    const onManagedMandateSave = vi.fn(async () => undefined);
    const root = createRoot(container);

    await act(async () => {
      root.render(
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
            status: 'completed',
            revision: 4,
            steps: [],
          } as never,
          domainProjection: {
            portfolioManagerMandateEditor: {
              ownerAgentId: 'agent-portfolio-manager',
              targetAgentId: 'agent-portfolio-manager',
              targetAgentRouteId: 'agent-portfolio-manager',
              targetAgentKey: 'portfolio-manager-primary',
              targetAgentTitle: 'Portfolio Manager Mandate',
              mandateRef: 'mandate-portfolio-manager',
              managedMandate: {
                betaExposureCapPct: 65,
                riskBudgetBps: 1800,
                minimumCashUsd: 5000,
              },
            },
          },
          onManagedMandateSave,
        }),
      );
    });

    const betaExposureInput = container.querySelector(
      'input[name="portfolio-manager-mandate-beta-exposure-cap-pct"]',
    ) as HTMLInputElement | null;
    const riskBudgetInput = container.querySelector(
      'input[name="portfolio-manager-mandate-risk-budget-bps"]',
    ) as HTMLInputElement | null;
    const minimumCashInput = container.querySelector(
      'input[name="portfolio-manager-mandate-minimum-cash-usd"]',
    ) as HTMLInputElement | null;
    const submitButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Save PM mandate'),
    );

    expect(betaExposureInput).toBeDefined();
    expect(riskBudgetInput).toBeDefined();
    expect(minimumCashInput).toBeDefined();
    expect(submitButton).toBeDefined();
    expect(betaExposureInput!.value).toBe('65');
    expect(riskBudgetInput!.value).toBe('1800');
    expect(minimumCashInput!.value).toBe('5000');

    await act(async () => {
      setInputValue(betaExposureInput!, '68.5');
      setInputValue(riskBudgetInput!, '2000');
      setInputValue(minimumCashInput!, '4000');
    });

    await act(async () => {
      submitButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onManagedMandateSave).toHaveBeenCalledWith({
      ownerAgentId: 'agent-portfolio-manager',
      targetAgentId: 'agent-portfolio-manager',
      targetAgentRouteId: 'agent-portfolio-manager',
      managedMandate: {
        betaExposureCapPct: 68.5,
        riskBudgetBps: 2000,
        minimumCashUsd: 4000,
      },
    });

    await act(async () => {
      root.unmount();
    });
  });

  it('hides the portfolio manager mandate editor while portfolio manager onboarding is active', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
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
            revision: 1,
            steps: [],
          } as never,
          domainProjection: {
            portfolioManagerMandateEditor: {
              ownerAgentId: 'agent-portfolio-manager',
              targetAgentId: 'agent-portfolio-manager',
              targetAgentRouteId: 'agent-portfolio-manager',
              targetAgentKey: 'portfolio-manager-primary',
              targetAgentTitle: 'Portfolio Manager Mandate',
              mandateRef: 'mandate-portfolio-manager',
              managedMandate: {
                betaExposureCapPct: 65,
                riskBudgetBps: 1800,
                minimumCashUsd: 5000,
              },
            },
          },
        }),
      );
    });

    const betaExposureInput = container.querySelector(
      'input[name="portfolio-manager-mandate-beta-exposure-cap-pct"]',
    ) as HTMLInputElement | null;
    const riskBudgetInput = container.querySelector(
      'input[name="portfolio-manager-mandate-risk-budget-bps"]',
    ) as HTMLInputElement | null;
    const minimumCashInput = container.querySelector(
      'input[name="portfolio-manager-mandate-minimum-cash-usd"]',
    ) as HTMLInputElement | null;

    expect(betaExposureInput).toBeNull();
    expect(riskBudgetInput).toBeNull();
    expect(minimumCashInput).toBeNull();
    expect(container.textContent).not.toContain('Portfolio manager mandate');
    expect(container.textContent).not.toContain('Save PM mandate');

    await act(async () => {
      root.unmount();
    });
  });
});

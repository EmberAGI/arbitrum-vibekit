// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentDetailPage } from './AgentDetailPage';
import type { EmberOnboardingSeed } from '../types/agent';

vi.mock('../hooks/usePrivyWalletClient', () => {
  return {
    usePrivyWalletClient: () => ({
      walletClient: null,
      privyWallet: {
        address: '0x00000000000000000000000000000000000000a1',
      },
      chainId: 42161,
      switchChain: async () => {},
      isLoading: false,
      error: null,
    }),
  };
});

function renderPortfolioManagerSetupPage(
  container: HTMLDivElement,
  onInterruptSubmit: ReturnType<typeof vi.fn>,
  emberOnboardingSeed?: EmberOnboardingSeed,
) {
  const root = createRoot(container);

  act(() => {
    root.render(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-portfolio-manager',
        agentName: 'Ember Portfolio Agent',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: ['Arbitrum'],
          protocols: ['Shared Ember Domain Service'],
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
        activeInterrupt: {
          type: 'portfolio-manager-setup-request',
          message: 'configure portfolio manager',
          emberOnboardingSeed,
        },
        onInterruptSubmit,
      }),
    );
  });

  return root;
}

const walletProfilerSeed: EmberOnboardingSeed = {
  pm_setup: {
    risk_level: 'medium',
    diagnosis_summary: 'Active DeFi user with missing reserve policy.',
    portfolio_intent_summary:
      'Use Portfolio Agent to preserve upside while enforcing reserve discipline.',
    operator_caveats: [
      'Only the lending mandate is persisted today.',
      'The broader portfolio plan is PM context until a PM mandate contract exists.',
    ],
  },
  first_managed_mandate: {
    target_agent_id: 'ember-lending',
    target_agent_key: 'ember-lending-primary',
    managed_mandate: {
      lending_policy: {
        collateral_policy: {
          assets: [
            { asset: 'USDC', max_allocation_pct: 35 },
            { asset: 'WETH', max_allocation_pct: 15 },
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
    summary: 'Future subagent strategy is not persisted by current onboarding.',
  },
};

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  );

  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('AgentDetailPage portfolio-manager setup', () => {
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

  it('submits supply-only setup with the default risk policy when no borrow asset is selected', () => {
    const onInterruptSubmit = vi.fn();
    const root = renderPortfolioManagerSetupPage(container, onInterruptSubmit);

    const editCollateralPolicyButton = container.querySelector(
      'button[aria-label="Edit collateral policy"]',
    ) as HTMLButtonElement | null;
    const lendingAvatar = container.querySelector(
      'img[alt="Ember Lending"]',
    ) as HTMLImageElement | null;
    const lendingLink = container.querySelector(
      'a[aria-label="Open Ember Lending"]',
    ) as HTMLAnchorElement | null;
    const submitButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.includes('Approve'),
    ) as HTMLButtonElement | undefined;

    expect(lendingAvatar?.getAttribute('src')).toBe('/ember-lending-avatar.svg');
    expect(lendingLink?.getAttribute('href')).toBe('/hire-agents/agent-ember-lending');
    expect(container.textContent).not.toContain('Wallet profiler seed');
    expect(editCollateralPolicyButton).not.toBeNull();
    expect(container.querySelector('button[aria-label="Edit maximum LTV"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Edit minimum health factor"]')).toBeNull();
    expect(submitButton).toBeDefined();

    act(() => {
      editCollateralPolicyButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    act(() => {
      (
        container.querySelector('button[aria-label="Toggle token WETH"]') as
          | HTMLButtonElement
          | null
      )!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const usdcCollateralCapInput = container.querySelector(
      'input[name="managed-mandate-collateral-cap-USDC"]',
    ) as HTMLInputElement | null;
    const wethCollateralCapInput = container.querySelector(
      'input[name="managed-mandate-collateral-cap-WETH"]',
    ) as HTMLInputElement | null;

    expect(usdcCollateralCapInput).not.toBeNull();
    expect(wethCollateralCapInput).not.toBeNull();

    act(() => {
      setInputValue(usdcCollateralCapInput!, '25');
      setInputValue(wethCollateralCapInput!, '60');
      submitButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onInterruptSubmit).toHaveBeenCalledWith({
      walletAddress: '0x00000000000000000000000000000000000000a1',
      portfolioMandate: {
        approved: true,
        riskLevel: 'medium',
      },
      firstManagedMandate: {
        targetAgentId: 'ember-lending',
        targetAgentKey: 'ember-lending-primary',
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
      },
    });

    act(() => {
      root.unmount();
    });
  });

  it('shows a wallet-profiler seed panel and submits the seeded lending mandate', () => {
    const onInterruptSubmit = vi.fn();
    const root = renderPortfolioManagerSetupPage(
      container,
      onInterruptSubmit,
      walletProfilerSeed,
    );
    const submitButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.includes('Approve'),
    ) as HTMLButtonElement | undefined;

    expect(container.textContent).toContain('Wallet profiler seed');
    expect(container.textContent).toContain(walletProfilerSeed.pm_setup.diagnosis_summary);
    expect(container.textContent).toContain(
      walletProfilerSeed.pm_setup.portfolio_intent_summary,
    );
    expect(container.textContent).toContain('Risk level: medium');
    expect(container.textContent).toContain('USDC 35%');
    expect(container.textContent).toContain('WETH 15%');
    expect(container.textContent).toContain('Only the lending mandate is persisted today.');

    act(() => {
      submitButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onInterruptSubmit).toHaveBeenCalledWith({
      walletAddress: '0x00000000000000000000000000000000000000a1',
      portfolioMandate: {
        approved: true,
        riskLevel: 'medium',
      },
      firstManagedMandate: {
        targetAgentId: 'ember-lending',
        targetAgentKey: 'ember-lending-primary',
        managedMandate: walletProfilerSeed.first_managed_mandate.managed_mandate,
      },
    });

    act(() => {
      root.unmount();
    });
  });
});

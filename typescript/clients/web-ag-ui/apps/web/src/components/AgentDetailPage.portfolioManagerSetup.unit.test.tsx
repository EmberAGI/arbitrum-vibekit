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
        },
        onInterruptSubmit,
      }),
    );
  });

  return root;
}

function setTextInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  );

  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
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

  it('submits editable policy-only mandate inputs and allows supply-only setup', () => {
    const onInterruptSubmit = vi.fn();
    const root = renderPortfolioManagerSetupPage(container, onInterruptSubmit);

    const collateralPoliciesInput = container.querySelector(
      'input[name="portfolio-manager-collateral-policies"]',
    ) as HTMLInputElement | null;
    const allowedBorrowAssetsInput = container.querySelector(
      'input[name="portfolio-manager-allowed-borrow-assets"]',
    ) as HTMLInputElement | null;
    const maxLtvBpsInput = container.querySelector(
      'input[name="portfolio-manager-max-ltv-bps"]',
    ) as HTMLInputElement | null;
    const minHealthFactorInput = container.querySelector(
      'input[name="portfolio-manager-min-health-factor"]',
    ) as HTMLInputElement | null;
    const submitButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.includes('Approve'),
    ) as HTMLButtonElement | undefined;

    expect(collateralPoliciesInput).not.toBeNull();
    expect(allowedBorrowAssetsInput).not.toBeNull();
    expect(maxLtvBpsInput).not.toBeNull();
    expect(minHealthFactorInput).not.toBeNull();
    expect(submitButton).toBeDefined();

    act(() => {
      setTextInputValue(collateralPoliciesInput!, 'weth:60, usdc:25');
      setTextInputValue(allowedBorrowAssetsInput!, '');
      setTextInputValue(maxLtvBpsInput!, '6500');
      setTextInputValue(minHealthFactorInput!, '1.4');
    });

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
        managedMandate: {
          lending_policy: {
            collateral_policy: {
              assets: [
                {
                  asset: 'WETH',
                  max_allocation_pct: 60,
                },
                {
                  asset: 'USDC',
                  max_allocation_pct: 25,
                },
              ],
            },
            borrow_policy: {
              allowed_assets: [],
            },
            risk_policy: {
              max_ltv_bps: 6500,
              min_health_factor: '1.4',
            },
          },
        },
      },
    });

    act(() => {
      root.unmount();
    });
  });
});

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

  it('submits editable structured mandate inputs through the setup interrupt', () => {
    const onInterruptSubmit = vi.fn();
    const root = renderPortfolioManagerSetupPage(container, onInterruptSubmit);

    const rootAssetInput = container.querySelector(
      'input[name="portfolio-manager-root-asset"]',
    ) as HTMLInputElement | null;
    const allowedAssetsInput = container.querySelector(
      'input[name="portfolio-manager-allowed-assets"]',
    ) as HTMLInputElement | null;
    const submitButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.includes('Approve'),
    ) as HTMLButtonElement | undefined;

    expect(rootAssetInput).not.toBeNull();
    expect(allowedAssetsInput).not.toBeNull();
    expect(submitButton).toBeDefined();

    act(() => {
      setTextInputValue(rootAssetInput!, 'weth');
      setTextInputValue(allowedAssetsInput!, 'usdc, weth');
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
        mandateSummary: 'lend WETH and USDC through the managed lending lane',
        managedMandate: {
          allocation_basis: 'allocable_idle',
          allowed_assets: ['WETH', 'USDC'],
          asset_intent: {
            root_asset: 'WETH',
            network: 'arbitrum',
            benchmark_asset: 'USD',
            intent: 'position.enter',
            control_path: 'lending.supply',
          },
        },
      },
    });

    act(() => {
      root.unmount();
    });
  });
});

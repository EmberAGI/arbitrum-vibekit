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

function setTextInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  );

  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
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

  it('saves a policy-only mandate and allows a supply-only borrow policy', async () => {
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

    const collateralPoliciesInput = container.querySelector(
      'input[name="managed-mandate-collateral-policies"]',
    ) as HTMLInputElement | null;
    const allowedBorrowAssetsInput = container.querySelector(
      'input[name="managed-mandate-allowed-borrow-assets"]',
    ) as HTMLInputElement | null;
    const maxLtvBpsInput = container.querySelector(
      'input[name="managed-mandate-max-ltv-bps"]',
    ) as HTMLInputElement | null;
    const minHealthFactorInput = container.querySelector(
      'input[name="managed-mandate-min-health-factor"]',
    ) as HTMLInputElement | null;
    const submitButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Save managed mandate'),
    );

    expect(collateralPoliciesInput).toBeDefined();
    expect(allowedBorrowAssetsInput).toBeDefined();
    expect(maxLtvBpsInput).toBeDefined();
    expect(minHealthFactorInput).toBeDefined();
    expect(submitButton).toBeDefined();

    await act(async () => {
      setTextInputValue(collateralPoliciesInput!, 'weth:60, usdc:25');
      setTextInputValue(allowedBorrowAssetsInput!, '');
      setTextInputValue(maxLtvBpsInput!, '6500');
      setTextInputValue(minHealthFactorInput!, '1.4');
    });

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
    });

    await act(async () => {
      root.unmount();
    });
  });
});

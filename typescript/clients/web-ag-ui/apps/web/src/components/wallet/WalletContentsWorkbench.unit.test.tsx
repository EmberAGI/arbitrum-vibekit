import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WalletContentsWorkbench } from './WalletContentsWorkbench';

const EMPTY_DEFI_POSITIONS = {
  perpetuals: [],
  pendle: [],
  liquidity: [],
};

describe('WalletContentsWorkbench', () => {
  it('renders wallet contents USD values with two decimal places', () => {
    const html = renderToStaticMarkup(
      React.createElement(WalletContentsWorkbench, {
        positions: EMPTY_DEFI_POSITIONS,
        view: {
          summary: {
            grossExposureUsd: 1_259.345,
            walletUsd: 123.4,
            deployedUsd: 1_135.945,
            owedUsd: 12,
            unpricedLaneCount: 0,
          },
          compositionSegments: [
            {
              label: 'In wallet',
              valueUsd: 123.4,
              share: 0.1,
              colorHex: '#4DD999',
            },
            {
              label: 'Deployed',
              valueUsd: 1_135.945,
              share: 0.9,
              colorHex: '#178B5D',
            },
          ],
          families: [
            {
              id: 'family:usdc',
              label: 'USDC',
              walletUsd: 123.4,
              walletAvailableUsd: 23.4,
              walletCommittedUsd: 100,
              deployedUsd: 1_135.945,
              owedUsd: 12,
              positiveUsd: 1_259.345,
              grossExposureUsd: 1_271.345,
              share: 1,
              observedAssets: [
                {
                  asset: 'USDC',
                  familyAsset: 'USDC',
                  quantity: 123.4,
                  valueUsd: 123.4,
                  sourceKind: 'wallet',
                  availableQuantity: 23.4,
                  commitments: [
                    {
                      agentId: 'agent-ember-lending',
                      agentLabel: 'Ember Lending',
                      quantity: 100,
                    },
                  ],
                },
                {
                  asset: 'aArbUSDC',
                  familyAsset: 'USDC',
                  quantity: 1_135.945,
                  valueUsd: 1_135.945,
                  sourceKind: 'position',
                  protocolSystem: 'aave',
                  scopeKind: 'lending-position',
                  economicExposures: [{ asset: 'USDC', quantity: '1135.945' }],
                  commitments: [],
                },
                {
                  asset: 'WBTC',
                  familyAsset: 'WBTC',
                  quantity: 2731,
                  displayQuantity: '0.00002731',
                  valueUsd: 2.104561,
                  sourceKind: 'debt',
                  protocolSystem: 'aave',
                  scopeKind: 'lending-position',
                  economicExposures: [{ asset: 'WBTC', quantity: '2731' }],
                  commitments: [],
                },
              ],
              lines: [
                {
                  id: 'line:wallet',
                  label: 'Wallet USDC',
                  tone: 'wallet',
                  valueUsd: 123.4,
                },
              ],
            },
          ],
          featuredFamilies: [
            {
              id: 'family:usdc',
              label: 'USDC',
              walletUsd: 123.4,
              walletAvailableUsd: 23.4,
              walletCommittedUsd: 100,
              deployedUsd: 1_135.945,
              owedUsd: 12,
              positiveUsd: 1_259.345,
              grossExposureUsd: 1_271.345,
              share: 1,
              observedAssets: [
                {
                  asset: 'USDC',
                  familyAsset: 'USDC',
                  quantity: 123.4,
                  valueUsd: 123.4,
                  sourceKind: 'wallet',
                  availableQuantity: 23.4,
                  commitments: [
                    {
                      agentId: 'agent-ember-lending',
                      agentLabel: 'Ember Lending',
                      quantity: 100,
                    },
                  ],
                },
                {
                  asset: 'aArbUSDC',
                  familyAsset: 'USDC',
                  quantity: 1_135.945,
                  valueUsd: 1_135.945,
                  sourceKind: 'position',
                  protocolSystem: 'aave',
                  scopeKind: 'lending-position',
                  economicExposures: [{ asset: 'USDC', quantity: '1135.945' }],
                  commitments: [],
                },
                {
                  asset: 'WBTC',
                  familyAsset: 'WBTC',
                  quantity: 2731,
                  displayQuantity: '0.00002731',
                  valueUsd: 2.104561,
                  sourceKind: 'debt',
                  protocolSystem: 'aave',
                  scopeKind: 'lending-position',
                  economicExposures: [{ asset: 'WBTC', quantity: '2731' }],
                  commitments: [],
                },
              ],
              lines: [
                {
                  id: 'line:wallet',
                  label: 'Wallet USDC',
                  tone: 'wallet',
                  valueUsd: 123.4,
                },
              ],
            },
          ],
          tailFamilies: [],
        },
      }),
    );

    expect(html).toContain('$123.40');
    expect(html).toContain('$23.40');
    expect(html).toContain('$100.00');
    expect(html).toContain('$1,259.35');
    expect(html).toContain('$1,135.95');
    expect(html).toContain('$12.00');
    expect(html).toContain('0.000027');
    expect(html.indexOf('Composition')).toBeLessThan(html.indexOf('DeFi'));
    expect(html).toContain('<h3 class="text-[10px] uppercase tracking-[0.18em] text-[#8C7F72]">DeFi</h3>');
    expect(html).not.toContain('<h3 class="text-sm font-semibold text-[#221A13]">DeFi</h3>');
    expect(html).toContain('No perpetual positions.');
    expect(html).toContain('No Pendle positions.');
    expect(html).toContain('No CLMM/Camelot positions.');
    expect(html).not.toContain('list-none cursor-pointer px-3 py-3');
    expect(html).toContain('mt-2 text-[32px]');
    expect(html).toContain('group relative overflow-hidden rounded-[22px]');
    expect(html).toContain('list-none cursor-pointer px-3 pb-2 pt-3');
    expect(html).toContain('absolute inset-x-0 bottom-0 flex h-7 justify-center border-t border-[#E7DBD0] bg-[#FFFCF7] pt-1');
    expect(html).toContain('duration-150 group-open:rotate-180');
    expect(html).not.toContain('rotate-180 text-[#6D5B4C] transition-transform duration-150 group-open:rotate-0');
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).not.toContain('mt-3 flex justify-center border-t border-[#E7DBD0] bg-[#FFFCF7] pt-2');
    expect(html).toContain('grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3');
    expect(html).toContain('Direct unmanaged USDC');
    expect(html).toContain('Deployed on Aave · tracks USDC');
    expect(html).not.toContain('mx-4 mb-4 mt-4 overflow-hidden rounded-[18px] border border-[#E7DBD0] bg-[#FFF9F2]');
    expect(html).not.toContain('h-8 w-8');
    expect(html).not.toContain('grid gap-3 md:grid-cols-2 xl:grid-cols-3');
    expect(html).not.toContain('list-none cursor-pointer px-4 py-4');
    expect(html).not.toContain('mt-5 text-[32px]');
    expect(html).not.toContain('>$23<');
    expect(html).not.toContain('>$100<');
    expect(html).not.toContain('>$123<');
    expect(html).not.toContain('$1.1k');
  });

  it('matches the reservation-aware wallet reference structure while preserving the light theme', () => {
    const html = renderToStaticMarkup(
      React.createElement(WalletContentsWorkbench, {
        positions: EMPTY_DEFI_POSITIONS,
        view: {
          summary: {
            grossExposureUsd: 1_271.345,
            walletUsd: 123.4,
            deployedUsd: 1_135.945,
            owedUsd: 12,
            unpricedLaneCount: 0,
          },
          compositionSegments: [],
          families: [
            {
              id: 'family:usdc',
              label: 'USDC',
              walletUsd: 123.4,
              walletAvailableUsd: 23.4,
              walletCommittedUsd: 100,
              deployedUsd: 1_135.945,
              owedUsd: 12,
              positiveUsd: 1_259.345,
              grossExposureUsd: 1_271.345,
              share: 1,
              observedAssets: [
                {
                  asset: 'USDC',
                  familyAsset: 'USDC',
                  quantity: 123.4,
                  valueUsd: 123.4,
                  sourceKind: 'wallet',
                  availableQuantity: 23.4,
                  commitments: [],
                },
              ],
              lines: [],
            },
          ],
          featuredFamilies: [
            {
              id: 'family:usdc',
              label: 'USDC',
              walletUsd: 123.4,
              walletAvailableUsd: 23.4,
              walletCommittedUsd: 100,
              deployedUsd: 1_135.945,
              owedUsd: 12,
              positiveUsd: 1_259.345,
              grossExposureUsd: 1_271.345,
              share: 1,
              observedAssets: [
                {
                  asset: 'USDC',
                  familyAsset: 'USDC',
                  quantity: 123.4,
                  valueUsd: 123.4,
                  sourceKind: 'wallet',
                  availableQuantity: 23.4,
                  commitments: [],
                },
              ],
              lines: [],
            },
          ],
          tailFamilies: [],
        },
      }),
    );

    expect(html).toContain('<details');
    expect(html).toContain('Direct unmanaged USDC');
    expect(html).toContain('Composition');
    expect(html).toContain('bg-[#FFF9F2]');
    expect(html).not.toContain('Grouped into 1 asset families');
    expect(html).not.toContain('Spendable without releasing a reservation');
    expect(html).not.toContain('Unmanaged balance committed to active orchestration');
    expect(html).not.toContain('Protocol debt surfaced separately from held balances');
    expect(html).not.toMatch(/>Exposure</);
  });

  it('uses the wallet summary total for top-level unmanaged exposure when family availability is zero', () => {
    const html = renderToStaticMarkup(
      React.createElement(WalletContentsWorkbench, {
        positions: EMPTY_DEFI_POSITIONS,
        view: {
          summary: {
            grossExposureUsd: 170.45,
            walletUsd: 47.69,
            deployedUsd: 122.76,
            owedUsd: 0,
            unpricedLaneCount: 0,
          },
          compositionSegments: [],
          families: [
            {
              id: 'family:weth',
              label: 'WETH',
              walletUsd: 47.69,
              walletAvailableUsd: 0,
              walletCommittedUsd: 0,
              deployedUsd: 122.76,
              owedUsd: 0,
              positiveUsd: 170.45,
              grossExposureUsd: 170.45,
              share: 1,
              observedAssets: [],
              lines: [],
            },
          ],
          featuredFamilies: [],
          tailFamilies: [],
        },
      }),
    );

    expect(html).toContain('title="Unmanaged $47.69"');
    expect(html).toContain('<span>Unmanaged $47.69</span>');
    expect(html).not.toContain('title="Unmanaged $0.00"');
    expect(html).not.toContain('Unallocated');
  });

  it('keeps the top-level unmanaged value aligned with the summary when reserved data exists without availability', () => {
    const html = renderToStaticMarkup(
      React.createElement(WalletContentsWorkbench, {
        positions: EMPTY_DEFI_POSITIONS,
        view: {
          summary: {
            grossExposureUsd: 112.11,
            walletUsd: 37.11,
            deployedUsd: 75,
            owedUsd: 0,
            unpricedLaneCount: 0,
          },
          compositionSegments: [],
          families: [
            {
              id: 'family:usdc',
              label: 'USDC',
              walletUsd: 37.11,
              walletAvailableUsd: 0,
              walletCommittedUsd: 8,
              deployedUsd: 75,
              owedUsd: 0,
              positiveUsd: 112.11,
              grossExposureUsd: 112.11,
              share: 1,
              observedAssets: [],
              lines: [],
            },
          ],
          featuredFamilies: [],
          tailFamilies: [],
        },
      }),
    );

    expect(html).toContain('title="Unmanaged $37.11"');
    expect(html).toContain('<span>Unmanaged $37.11</span>');
    expect(html).not.toContain('title="Unmanaged $0.00"');
  });
});

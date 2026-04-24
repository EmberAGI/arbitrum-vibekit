import { describe, expect, it } from 'vitest';

import { buildPortfolioProjection } from '@/projections/portfolio/buildPortfolioProjection';

import { buildWalletDashboardView, parseUsdNotional } from './walletDashboardView';

describe('wallet dashboard view', () => {
  it('builds accounting and treemap data from wallet balances and positions', () => {
    const view = buildWalletDashboardView({
      portfolio: {
        balances: [
          {
            tokenUid: { chainId: '42161', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
            symbol: 'USDC',
            amount: '1500000000',
            decimals: 6,
            valueUsd: 1_500,
          },
          {
            tokenUid: { chainId: '42161', address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1' },
            symbol: 'WETH',
            amount: '250000000000000000',
            decimals: 18,
            valueUsd: 500,
          },
        ],
        positions: {
          perpetuals: [
            {
              key: 'perp-long',
              marketAddress: '0x1111111111111111111111111111111111111111',
              positionSide: 'long',
              sizeInUsd: '400',
            },
            {
              key: 'perp-short',
              marketAddress: '0x2222222222222222222222222222222222222222',
              positionSide: 'short',
              sizeInUsd: '100',
            },
          ],
          pendle: [
            {
              marketIdentifier: {
                chainId: '42161',
                address: '0x3333333333333333333333333333333333333333',
              },
              pt: { exactAmount: '1.2' },
              yt: { exactAmount: '0.4' },
            },
          ],
          liquidity: [
            {
              positionId: 'lp-1',
              poolName: 'Camelot ETH/USDC',
              positionValueUsd: '300',
            },
          ],
        },
      },
    });

    expect(view.summary.cashUsd).toBe(2_000);
    expect(view.summary.deployedUsd).toBe(700);
    expect(view.summary.liabilitiesUsd).toBe(100);
    expect(view.summary.grossExposureUsd).toBe(2_800);
    expect(view.summary.netWorthUsd).toBe(2_600);
    expect(view.summary.activeLaneCount).toBe(4);
    expect(view.topbar.benchmarkAssetLabel).toBe('USDC');
    expect(view.topbar.metrics.map((metric) => metric.label)).toEqual([
      'Gross exposure',
      'Net worth',
      'Unmanaged',
    ]);
    expect(view.topbar.metrics).toMatchObject([
      {
        label: 'Gross exposure',
        value: '$2,800.00',
        positiveAssetsValue: '$2,700.00',
        liabilitiesValue: '$100.00',
      },
      {
        label: 'Net worth',
        value: '$2,600.00',
      },
      {
        label: 'Unmanaged',
        value: '$2,000.00',
      },
    ]);
    expect(view.accounting.segments.map((segment) => [segment.label, segment.valueUsd])).toEqual([
      ['Cash', 2_000],
      ['Assets', 700],
      ['Liabilities', 100],
    ]);
    expect(view.contents.summary.walletUsd).toBe(2_000);
    expect(view.contents.summary.deployedUsd).toBe(700);
    expect(view.contents.summary.owedUsd).toBe(100);
    expect(view.contents.summary.unpricedLaneCount).toBe(1);
    expect(view.contents.families.find((family) => family.label === 'USDC')).toMatchObject({
      walletUsd: 1_500,
      deployedUsd: 0,
      owedUsd: 0,
    });
    expect(
      view.contents.families.find((family) => family.label === 'Camelot ETH/USDC'),
    ).toMatchObject({
      walletUsd: 0,
      deployedUsd: 300,
      owedUsd: 0,
    });
    expect(
      view.contents.families.find((family) => family.label === 'Short 0x222222...2222'),
    ).toMatchObject({
      walletUsd: 0,
      deployedUsd: 0,
      owedUsd: 100,
    });
    expect(view.treemapItems.map((item) => item.label)).toEqual([
      'USDC',
      'WETH',
      'Long perp',
      'Camelot ETH/USDC',
    ]);
    expect(view.treemapItems.find((item) => item.label === 'Short perp')).toBeUndefined();
  });

  it('interprets very large integer notionals as 18-decimal fixed point values', () => {
    expect(parseUsdNotional('1000000000000000000')).toBe(1);
    expect(parseUsdNotional('123.45')).toBe(123.45);
  });

  it('builds the wallet view from the real reservation-aware projection packet', () => {
    const portfolioProjection = buildPortfolioProjection({
      benchmarkAsset: 'USD',
      walletContents: [
        {
          asset: 'USDC',
          network: 'arbitrum',
          quantity: '40',
          valueUsd: 40,
        },
        {
          asset: 'WETH',
          network: 'arbitrum',
          quantity: '0.01',
          valueUsd: 20,
          economicExposures: [
            {
              asset: 'ETH',
              quantity: '0.01',
            },
          ],
        },
      ],
      reservations: [
        {
          reservationId: 'reservation-1',
          agentId: 'agent-ember-lending',
          purpose: 'position.enter',
          controlPath: 'lending.supply',
          createdAt: '2026-03-30T00:00:00.000Z',
          status: 'active',
          unitAllocations: [
            {
              unitId: 'unit-usdc-1',
              quantity: '25',
            },
          ],
        },
      ],
      ownedUnits: [
        {
          unitId: 'unit-usdc-1',
          rootAsset: 'USDC',
          network: 'arbitrum',
          quantity: '25',
          benchmarkAsset: 'USD',
          benchmarkValue: 25,
          reservationId: 'reservation-1',
          positionScopeId: 'scope-1',
        },
      ],
      activePositionScopes: [
        {
          scopeId: 'scope-1',
          kind: 'lending-position',
          network: 'arbitrum',
          protocolSystem: 'aave',
          containerRef: 'aave:scope-1',
          status: 'active',
          marketState: {
            availableBorrowsUsd: '18',
            borrowableHeadroomUsd: '12.5',
            currentLtvBps: 3200,
            liquidationThresholdBps: 7800,
            healthFactor: '2.1',
          },
          members: [
            {
              memberId: 'collateral-usdc',
              role: 'collateral',
              asset: 'USDC',
              quantity: '25',
              valueUsd: 25,
              economicExposures: [
                {
                  asset: 'USDC',
                  quantity: '25',
                },
              ],
              state: {
                withdrawableQuantity: '10',
                supplyApr: '0.03',
              },
            },
            {
              memberId: 'debt-usdt',
              role: 'debt',
              asset: 'USDT',
              quantity: '5',
              valueUsd: 5,
              economicExposures: [
                {
                  asset: 'USDT',
                  quantity: '5',
                },
              ],
              state: {
                borrowApr: '0.06',
              },
            },
          ],
        },
      ],
    });

    const view = buildWalletDashboardView({
      portfolioProjection,
      portfolioProjectionInput: {
        benchmarkAsset: 'USD',
        walletContents: [],
        reservations: [],
        ownedUnits: [],
        activePositionScopes: [
          {
            scopeId: 'scope-1',
            kind: 'lending-position',
            network: 'arbitrum',
            protocolSystem: 'aave',
            containerRef: 'aave:scope-1',
            status: 'active',
            members: [],
          },
        ],
      },
    });

    expect(view.summary.cashUsd).toBe(40);
    expect(view.summary.deployedUsd).toBe(25);
    expect(view.summary.liabilitiesUsd).toBe(5);
    expect(view.summary.grossExposureUsd).toBe(90);
    expect(view.summary.activeLaneCount).toBe(1);
    expect(view.topbar.metrics.map((metric) => metric.label)).toEqual([
      'Gross exposure',
      'Net worth',
      'Unmanaged',
    ]);
    expect(view.topbar.metrics[2]).toMatchObject({
      label: 'Unmanaged',
      value: '$35.00',
    });
    expect(view.accounting.segments.map((segment) => [segment.label, segment.valueUsd])).toEqual([
      ['Cash', 40],
      ['Assets', 45],
      ['Liabilities', 5],
    ]);
    expect(view.contents.summary.walletUsd).toBe(35);
    expect(view.contents.summary.deployedUsd).toBe(25);
    expect(view.contents.summary.owedUsd).toBe(5);
    expect(view.contents.families.find((family) => family.label === 'USDC')).toMatchObject({
      walletUsd: 40,
      deployedUsd: 25,
      owedUsd: 0,
    });
    expect(view.contents.families.find((family) => family.label === 'USDT')).toMatchObject({
      walletUsd: 0,
      deployedUsd: 0,
      owedUsd: 5,
    });
    expect(view.treemapItems.map((item) => item.label)).toEqual(['USDC', 'ETH']);
    expect(view.treemapItems.find((item) => item.label === 'USDT')).toBeUndefined();
  });

  it('excludes debt contributions from a mixed asset family treemap item', () => {
    const portfolioProjection = buildPortfolioProjection({
      benchmarkAsset: 'USD',
      walletContents: [
        {
          asset: 'WBTC',
          network: 'arbitrum',
          quantity: '0.00002736',
          valueUsd: 2.08,
        },
      ],
      reservations: [],
      ownedUnits: [],
      activePositionScopes: [
        {
          scopeId: 'scope-1',
          kind: 'lending-position',
          network: 'arbitrum',
          protocolSystem: 'aave',
          containerRef: 'aave:scope-1',
          status: 'active',
          members: [
            {
              memberId: 'debt-wbtc',
              role: 'debt',
              asset: 'variableDebtArbWBTC',
              quantity: '0.00002731',
              valueUsd: 2.07,
              economicExposures: [
                {
                  asset: 'WBTC',
                  quantity: '0.00002731',
                },
              ],
              state: {
                borrowApr: '0.06',
              },
            },
          ],
        },
      ],
    });

    const view = buildWalletDashboardView({
      portfolioProjection,
      portfolioProjectionInput: {
        benchmarkAsset: 'USD',
        walletContents: [],
        reservations: [],
        ownedUnits: [],
        activePositionScopes: [
          {
            scopeId: 'scope-1',
            kind: 'lending-position',
            network: 'arbitrum',
            protocolSystem: 'aave',
            containerRef: 'aave:scope-1',
            status: 'active',
            members: [],
          },
        ],
      },
    });

    const wbtcTreemapItem = view.treemapItems.find((item) => item.label === 'WBTC');
    expect(wbtcTreemapItem).toMatchObject({
      value: 2.08,
      valueLabel: '$2',
    });
    expect(wbtcTreemapItem?.hoverChildren?.map((item) => item.label)).toEqual(['Wallet WBTC']);
  });

  it('uses economic exposure quantities for Aave wrapper position cards', () => {
    const portfolioProjection = buildPortfolioProjection({
      benchmarkAsset: 'USD',
      walletContents: [],
      reservations: [],
      ownedUnits: [],
      activePositionScopes: [
        {
          scopeId: 'position-scope-aave-arbitrum-wallet',
          kind: 'lending-position',
          network: 'arbitrum',
          protocolSystem: 'aave',
          containerRef: 'aave:position-scope-aave-arbitrum-wallet',
          status: 'active',
          members: [
            {
              memberId: 'aave-weth-collateral',
              role: 'collateral',
              asset: 'aArbWETH',
              quantity: '20776430481205574',
              displayQuantity: '0.020776430481205574',
              valueUsd: 48.070624975982546,
              economicExposures: [
                {
                  asset: 'WETH',
                  quantity: '0.020776430517459555',
                },
              ],
              state: {
                withdrawableQuantity: '0.0198384825984434',
              },
            },
            {
              memberId: 'aave-native-usdc-collateral',
              role: 'collateral',
              asset: 'aArbUSDCn',
              quantity: '8244483',
              displayQuantity: '8.244483',
              valueUsd: 8.24315860625088,
              economicExposures: [
                {
                  asset: 'USDC',
                  quantity: '8.244483',
                },
              ],
              state: {
                withdrawableQuantity: '7.872287',
              },
            },
          ],
        },
      ],
    });

    const view = buildWalletDashboardView({
      portfolioProjection,
      portfolioProjectionInput: {
        benchmarkAsset: 'USD',
        walletContents: [],
        reservations: [],
        ownedUnits: [],
        activePositionScopes: [],
      },
    });

    const wethFamily = view.contents.families.find((family) => family.label === 'WETH');
    const usdcFamily = view.contents.families.find((family) => family.label === 'USDC');

    expect(wethFamily?.observedAssets[0]).toMatchObject({
      asset: 'aArbWETH',
      quantity: 20776430481205576,
      displayQuantity: '0.020776430481205574',
      valueUsd: 48.070624975982546,
    });
    expect(usdcFamily?.observedAssets[0]).toMatchObject({
      asset: 'aArbUSDCn',
      quantity: 8244483,
      displayQuantity: '8.244483',
      valueUsd: 8.24315860625088,
    });
  });
});

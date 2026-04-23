import { describe, expect, it } from 'vitest';

import { buildPortfolioProjection } from './buildPortfolioProjection';
import type { PortfolioProjectionInput } from './types';

function findFamily(projection: ReturnType<typeof buildPortfolioProjection>, asset: string) {
  return projection.assetFamilies.find((family) => family.asset === asset);
}

describe('buildPortfolioProjection', () => {
  it('keeps wallet and agent accounting aligned to the live Aave wallet truth', () => {
    const input: PortfolioProjectionInput = {
      benchmarkAsset: 'USD',
      walletContents: [
        {
          asset: 'ETH',
          network: 'arbitrum',
          quantity: '1051504785051886',
          valueUsd: 2.44127473,
        },
        {
          asset: 'WETH',
          network: 'arbitrum',
          quantity: '1943700537301869',
          valueUsd: 4.51268228,
        },
        {
          asset: 'WBTC',
          network: 'arbitrum',
          quantity: '3',
          valueUsd: 0.00232299,
        },
      ],
      ownedUnits: [
        {
          unitId: 'unit-usdc-collateral-primary',
          rootAsset: 'USDC',
          network: 'arbitrum',
          quantity: '7254853',
          benchmarkAsset: 'USD',
          benchmarkValue: 7.2537305,
          reservationId: 'res-active-borrow',
          positionScopeId: 'scope-aave',
        },
        {
          unitId: 'unit-usdc-collateral-fragment',
          rootAsset: 'USDC',
          network: 'arbitrum',
          quantity: '7',
          benchmarkAsset: 'USD',
          benchmarkValue: 7.2537305,
          reservationId: 'res-active-borrow',
          positionScopeId: 'scope-aave',
        },
        {
          unitId: 'unit-wbtc-wallet-remainder',
          rootAsset: 'WBTC',
          network: 'arbitrum',
          quantity: '3',
          benchmarkAsset: 'USD',
          benchmarkValue: 0.00232299,
          reservationId: null,
          positionScopeId: null,
        },
      ],
      reservations: [
        {
          reservationId: 'res-active-borrow',
          agentId: 'ember-lending',
          purpose: 'refresh borrow coverage',
          controlPath: 'lending.borrow',
          createdAt: '2026-04-23T21:29:21.768Z',
          status: 'active',
          unitAllocations: [
            {
              unitId: 'unit-usdc-collateral-primary',
              quantity: '7254853',
            },
            {
              unitId: 'unit-usdc-collateral-fragment',
              quantity: '7',
            },
          ],
        },
        {
          reservationId: 'res-stale-wbtc-supply',
          agentId: 'ember-lending',
          purpose: 'stale supply coverage',
          controlPath: 'lending.supply',
          createdAt: '2026-04-23T21:21:27.032Z',
          status: 'active',
          unitAllocations: [
            {
              unitId: 'unit-wbtc-wallet-remainder',
              quantity: '3',
            },
          ],
        },
      ],
      activePositionScopes: [
        {
          scopeId: 'scope-aave',
          kind: 'lending',
          network: 'arbitrum',
          protocolSystem: 'aave',
          containerRef: 'aave:arbitrum:0x540c144afc3b3a97eeded55376ab257ee706f0ca',
          status: 'active',
          marketState: {
            availableBorrowsUsd: '5.44029712',
            borrowableHeadroomUsd: '5.44029712',
            currentLtvBps: 0,
            liquidationThresholdBps: 7800,
            healthFactor: '-1',
          },
          members: [
            {
              memberId: 'scope-aave:collateral:aArbUSDCn',
              role: 'collateral',
              asset: 'aArbUSDCn',
              quantity: '7254853',
              valueUsd: 7.2537305,
              economicExposures: [
                {
                  asset: 'USDC',
                  quantity: '7.254853',
                },
              ],
              state: {
                withdrawableQuantity: '0.80609489',
                supplyApr: null,
                borrowApr: null,
              },
            },
          ],
        },
      ],
    };

    const projection = buildPortfolioProjection(input);
    const ethFamily = findFamily(projection, 'ETH');
    const wbtcFamily = findFamily(projection, 'WBTC');
    const lendingAgent = projection.agents.specialists.find(
      (allocation) => allocation.agentId === 'ember-lending',
    );

    expect(findFamily(projection, 'WETH')).toBeUndefined();
    expect(ethFamily).toMatchObject({
      walletUsd: 6.95395701,
      positiveUsd: 6.95395701,
    });
    expect(ethFamily?.observedAssets.map((asset) => asset.asset)).toEqual(['WETH', 'ETH']);
    expect(wbtcFamily?.observedAssets[0]).toMatchObject({
      asset: 'WBTC',
      availableUsd: 0.00232299,
      committedUsd: 0,
    });
    expect(projection.summary).toMatchObject({
      positiveAssetsUsd: 14.2100105,
      liabilitiesUsd: 0,
      grossExposureUsd: 14.2100105,
      netWorthUsd: 14.2100105,
    });
    expect(lendingAgent).toMatchObject({
      positiveAssetsUsd: 7.2537305,
      liabilitiesUsd: 0,
      grossExposureUsd: 7.2537305,
    });
    expect(lendingAgent?.allocationShare).toBeCloseTo(0.51046623);
    expect(lendingAgent?.tokenExposures).toEqual([
      {
        asset: 'USDC',
        valueUsd: 7.2537305,
        share: 1,
      },
    ]);
  });
});

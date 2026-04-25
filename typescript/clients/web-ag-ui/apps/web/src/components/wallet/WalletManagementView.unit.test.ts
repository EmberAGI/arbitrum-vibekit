import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { buildPortfolioProjection } from '../../projections/portfolio/buildPortfolioProjection';
import type { PortfolioProjectionInput } from '../../projections/portfolio/types';

import { WalletManagementView } from './WalletManagementView';

describe('WalletManagementView', () => {
  it('renders the wallet dashboard without the placeholder manage wallet hero', () => {
    const html = renderToStaticMarkup(
      React.createElement(WalletManagementView, {
        walletAddress: '0x1111111111111111111111111111111111111111',
        connectedDestinationAddress: null,
        walletClient: null,
        portfolio: {
          balances: [
            {
              tokenUid: { chainId: '42161', address: '0x0000000000000000000000000000000000000000' },
              symbol: 'ETH',
              amount: '1000000000000000000',
              decimals: 18,
              valueUsd: 2_000,
            },
          ],
          positions: {
            perpetuals: [
              {
                key: 'perp-1',
                marketAddress: '0x2222222222222222222222222222222222222222',
                positionSide: 'long',
                sizeInUsd: '123.45',
              },
            ],
            pendle: [
              {
                marketIdentifier: {
                  chainId: '42161',
                  address: '0x3333333333333333333333333333333333333333',
                },
                pt: { exactAmount: '1' },
                yt: { exactAmount: '2' },
              },
            ],
            liquidity: [
              {
                positionId: 'lp-1',
                poolName: 'Camelot ETH/USDC',
                positionValueUsd: '321.00',
              },
            ],
          },
        },
      }),
    );

    expect(html).not.toContain('Manage Wallet');
    expect(html).not.toContain('Wallet dashboard');
    expect(html).not.toMatch(/>Portfolio</);
    expect(html).toContain('mx-auto w-full max-w-[1400px] space-y-6 px-0 pt-0 pb-6');
    expect(html).not.toContain('mx-auto w-full max-w-[1400px] p-6 space-y-6');
    expect(html).toContain('Benchmark');
    expect(html).toContain('Gross exposure');
    expect(html).toContain('Wallet contents');
    expect(html).toContain('In wallet');
    expect(html).toContain('Deployed');
    expect(html).toContain('Owed');
    expect(html).toContain('Camelot ETH/USDC');
    expect(html).toContain('Unpriced lanes');
    expect(html).toContain('Accounting');
    expect(html).toContain('Asset allocation treemap');
    expect(html).toContain('Token Balances');
    expect(html).toContain('Perpetual Positions');
    expect(html).toContain('Pendle Positions');
    expect(html).toContain('CLMM / Camelot Positions');
    expect(html).toContain('Withdraw');
  });

  it('does not mix the projection-backed wallet dashboard with the legacy raw OCA balances panel', () => {
    const portfolioProjectionInput: PortfolioProjectionInput = {
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
      ],
      ownedUnits: [],
      reservations: [],
      activePositionScopes: [
        {
          scopeId: 'scope-aave',
          kind: 'lending',
          network: 'arbitrum',
          protocolSystem: 'aave',
          containerRef: 'aave:arbitrum:0x540c144afc3b3a97eeded55376ab257ee706f0ca',
          status: 'active',
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

    const html = renderToStaticMarkup(
      React.createElement(WalletManagementView, {
        walletAddress: '0x540c144afc3b3a97eeded55376ab257ee706f0ca',
        connectedDestinationAddress: null,
        walletClient: null,
        portfolio: {
          balances: [
            {
              tokenUid: { chainId: '42161', address: '0x724dc807b04555b71ed48a6896b6f41593b8c637' },
              symbol: 'aArbUSDCn',
              amount: '7254852',
              decimals: 6,
              valueUsd: 7.197834651795824,
            },
          ],
          positions: {
            perpetuals: [
              {
                key: 'perp-1',
                marketAddress: '0x2222222222222222222222222222222222222222',
                positionSide: 'long',
                sizeInUsd: '123.45',
              },
            ],
            pendle: [],
            liquidity: [
              {
                positionId: 'lp-1',
                poolName: 'Camelot ETH/USDC',
                positionValueUsd: '321.00',
              },
            ],
          },
        },
        portfolioProjection: buildPortfolioProjection(portfolioProjectionInput),
        portfolioProjectionInput,
      }),
    );

    expect(html).toContain('Projection holdings');
    expect(html).toContain('Wallet contents');
    expect(html).toContain('USDC');
    expect(html).toContain('ETH');
    expect(html).not.toContain('Token Balances');
    expect(html).not.toContain('7.254852');
    expect(html).not.toContain('$7.20');
    expect(html).not.toContain('Perpetual Positions');
    expect(html).not.toContain('CLMM / Camelot Positions');
    expect(html).not.toContain('Camelot ETH/USDC');
  });
});

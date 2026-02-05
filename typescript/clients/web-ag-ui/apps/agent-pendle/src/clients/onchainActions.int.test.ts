import { describe, expect, it } from 'vitest';

import { resolvePendleChainIds } from '../config/constants.js';

import { OnchainActionsClient } from './onchainActions.js';

const DEFAULT_TEST_WALLET = '0x3fd83e40F96C3c81A807575F959e55C34a40e523';
const DEFAULT_PLANNING_MARKET = '0xfad63f0a2ff618edde23561dff212edfeddbe89d';

const normalizeWalletAddress = (value: string): `0x${string}` => {
  if (!value.startsWith('0x')) {
    throw new Error(`Invalid wallet address: ${value}`);
  }
  return value as `0x${string}`;
};

describe('onchainActions client (integration)', () => {
  it('replays recorded pendle planning responses via MSW', async () => {
    process.env.ONCHAIN_ACTIONS_API_URL = 'http://onchain-actions.test';
    const walletAddress = normalizeWalletAddress(process.env.SMOKE_WALLET ?? DEFAULT_TEST_WALLET);
    const chainIds = resolvePendleChainIds();

    const client = new OnchainActionsClient(process.env.ONCHAIN_ACTIONS_API_URL);

    const markets = await client.listTokenizedYieldMarkets({ chainIds });
    expect(markets.length).toBeGreaterThan(0);

    const tokens = await client.listTokens({ chainIds });
    expect(tokens.length).toBeGreaterThan(0);

    const usdc = tokens.find((token) => token.symbol.toLowerCase() === 'usdc');
    expect(usdc).toBeDefined();

    const market =
      markets.find(
        (candidate) =>
          candidate.marketIdentifier.address.toLowerCase() ===
          DEFAULT_PLANNING_MARKET.toLowerCase(),
      ) ?? markets[0];
    if (!market) {
      throw new Error('No markets returned from onchain-actions mocks.');
    }
    const underlyingToken = market.underlyingToken;
    expect(underlyingToken).toBeDefined();

    const positions = await client.listTokenizedYieldPositions({ walletAddress, chainIds });
    expect(Array.isArray(positions)).toBe(true);

    const swapPlan = await client.createSwap({
      walletAddress,
      amount: '1000000',
      amountType: 'exactIn',
      fromTokenUid: usdc!.tokenUid,
      toTokenUid: underlyingToken.tokenUid,
      slippageTolerance: '1.0',
    });
    expect(swapPlan.transactions.length).toBeGreaterThan(0);

    const buyPlan = await client.createTokenizedYieldBuyPt({
      walletAddress,
      marketAddress: market.marketIdentifier.address,
      inputTokenUid: underlyingToken.tokenUid,
      amount: '1000000',
      slippage: '0.5',
    });
    expect(buyPlan.transactions.length).toBeGreaterThan(0);

    const sellPlan = await client.createTokenizedYieldSellPt({
      walletAddress,
      ptTokenUid: market.ptToken.tokenUid,
      amount: '1000000',
      slippage: '0.5',
    });
    expect(sellPlan.transactions.length).toBeGreaterThan(0);

    const redeemPlan = await client.createTokenizedYieldRedeemPt({
      walletAddress,
      ptTokenUid: market.ptToken.tokenUid,
      amount: '1000000',
    });
    expect(redeemPlan.transactions.length).toBeGreaterThan(0);

    const claimPlan = await client.createTokenizedYieldClaimRewards({
      walletAddress,
      ytTokenUid: market.ytToken.tokenUid,
    });
    expect(claimPlan.transactions.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { getAddress } from 'viem';

import { fetchAlloraInference } from '../src/clients/allora.js';
import { OnchainActionsClient } from '../src/clients/onchainActions.js';
import {
  ALLORA_TOPIC_IDS,
  resolveAlloraApiBaseUrl,
  resolveAlloraApiKey,
  resolveAlloraChainId,
  resolveOnchainActionsBaseUrl,
} from '../src/config/constants.js';

const requiredEnv = ['ONCHAIN_ACTIONS_BASE_URL', 'SMOKE_WALLET'] as const;
const hasRequiredEnv = requiredEnv.every((key) => Boolean(process.env[key]));
const itIf = hasRequiredEnv ? it : it.skip;

const shouldRequireOpenPosition =
  process.env['SMOKE_REQUIRE_GMX_POSITION']?.trim().toLowerCase() === 'true';

const normalizeUrl = (value: string): string => value.replace(/\/$/u, '');

const resolveEnvAddress = (key: 'SMOKE_WALLET'): `0x${string}` => {
  const raw = process.env[key];
  if (!raw) {
    throw new Error(`${key} is required for happy path e2e.`);
  }
  return getAddress(raw) as `0x${string}`;
};

describe('GMX Allora happy path (e2e)', () => {
  itIf('plans a perpetual long via local onchain-actions', async () => {
    const originalBaseUrl = process.env['ONCHAIN_ACTIONS_BASE_URL'];
    const baseUrl = process.env['ONCHAIN_ACTIONS_BASE_URL'];
    if (!baseUrl) {
      throw new Error('ONCHAIN_ACTIONS_BASE_URL is required for this test.');
    }

    try {
      const resolved = resolveOnchainActionsBaseUrl();
      expect(resolved).toBe(normalizeUrl(baseUrl));

      const client = new OnchainActionsClient(resolved);
      const markets = await client.listPerpetualMarkets({ chainIds: ['42161'] });
      expect(markets.length).toBeGreaterThan(0);
      expect(markets.every((market) => market.chainId === '42161')).toBe(true);

      const walletAddress = resolveEnvAddress('SMOKE_WALLET');
      const balances = await client.listWalletBalances({ walletAddress });
      expect(Array.isArray(balances)).toBe(true);

      const positions = await client.listPerpetualPositions({
        walletAddress,
        chainIds: ['42161'],
      });
      expect(Array.isArray(positions)).toBe(true);
      expect(positions.every((position) => position.chainId === '42161')).toBe(true);

      const marketWithTokens = markets.find(
        (entry) => Boolean(entry.indexToken && entry.longToken && entry.shortToken),
      );
      const market =
        markets.find(
          (entry) =>
            entry.indexToken?.symbol.toUpperCase() === 'BTC' &&
            entry.longToken?.symbol.toUpperCase() === 'USDC',
        ) ??
        marketWithTokens ??
        markets[0];

      if (!market) {
        throw new Error('Expected at least one perpetual market from onchain-actions.');
      }

      const payToken =
        [market.longToken, market.shortToken].find(
          (token) => token?.symbol.toUpperCase() === 'USDC',
        ) ?? market.longToken ?? market.shortToken;
      if (!payToken) {
        return;
      }

      const payTokenAddress = getAddress(payToken.tokenUid.address) as `0x${string}`;

      const inference = await fetchAlloraInference({
        baseUrl: resolveAlloraApiBaseUrl(),
        chainId: resolveAlloraChainId(),
        topicId: ALLORA_TOPIC_IDS.BTC,
        apiKey: resolveAlloraApiKey(),
      });
      expect(inference.topicId).toBe(ALLORA_TOPIC_IDS.BTC);
      expect(Number.isFinite(inference.combinedValue)).toBe(true);

      // Planning a perp open requires a balance provider and a wallet with funds. If the
      // pay-token balance is unavailable/insufficient, we still validated the onchain read-paths
      // but skip the trade planning call to avoid false negatives in CI/dev environments.
      const payTokenBalance = balances.find(
        (entry) => entry.tokenUid.address.toLowerCase() === payTokenAddress.toLowerCase(),
      );
      const decimals = payTokenBalance?.decimals ?? payToken.decimals;
      const rawAmount = payTokenBalance?.amount;
      const available = rawAmount && /^\d+$/u.test(rawAmount) ? BigInt(rawAmount) : 0n;
      const minAmount = 2n * 10n ** BigInt(decimals); // 2 USDC (safe buffer above $1 minimum)

      if (available < minAmount) {
        return;
      }

      const amount = (available / 2n > 100n * 10n ** BigInt(decimals)
        ? 100n * 10n ** BigInt(decimals)
        : available / 2n
      ).toString();

      const response = await client.createPerpetualLong({
        amount,
        walletAddress,
        chainId: '42161',
        marketAddress: getAddress(market.marketToken.address),
        payTokenAddress,
        collateralTokenAddress: payTokenAddress,
        leverage: '2',
      });
      expect(response.transactions.length).toBeGreaterThan(0);
      expect(response.transactions[0]?.to).toMatch(/^0x/u);
    } finally {
      if (originalBaseUrl === undefined) {
        delete process.env['ONCHAIN_ACTIONS_BASE_URL'];
      } else {
        process.env['ONCHAIN_ACTIONS_BASE_URL'] = originalBaseUrl;
      }
    }
  });

  itIf('plans a perpetual close (full close) via local onchain-actions when a position exists', async () => {
    const baseUrl = process.env['ONCHAIN_ACTIONS_BASE_URL'];
    if (!baseUrl) {
      throw new Error('ONCHAIN_ACTIONS_BASE_URL is required for this test.');
    }

    const client = new OnchainActionsClient(normalizeUrl(baseUrl));
    const walletAddress = resolveEnvAddress('SMOKE_WALLET');

    const positions = await client.listPerpetualPositions({
      walletAddress,
      chainIds: ['42161'],
    });

    const position = positions[0];
    if (!position) {
      if (shouldRequireOpenPosition) {
        throw new Error(
          'Expected at least one open GMX position for SMOKE_WALLET but none were found.\n' +
            'Either fund/open a position on Arbitrum (42161) or set SMOKE_REQUIRE_GMX_POSITION=false to skip.',
        );
      }
      return;
    }

    const response = await client.createPerpetualClose({
      walletAddress,
      marketAddress: getAddress(position.marketAddress),
      positionSide: position.positionSide,
      isLimit: false,
    });

    expect(response.transactions.length).toBeGreaterThan(0);
    const value = response.transactions[0]?.value;
    if (!value) {
      throw new Error('Expected close transaction plan to include a value (GMX execution fee).');
    }

    const wei = BigInt(value);
    expect(wei > 0n).toBe(true);
  });
});

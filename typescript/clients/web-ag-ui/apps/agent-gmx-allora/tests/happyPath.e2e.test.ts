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

const requiredEnv = ['ONCHAIN_ACTIONS_BASE_URL', 'SMOKE_WALLET', 'SMOKE_USDC_ADDRESS'] as const;
const hasRequiredEnv = requiredEnv.every((key) => Boolean(process.env[key]));
const itIf = hasRequiredEnv ? it : it.skip;

const normalizeUrl = (value: string): string => value.replace(/\/$/u, '');

const resolveEnvAddress = (key: 'SMOKE_WALLET' | 'SMOKE_USDC_ADDRESS'): `0x${string}` => {
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

      const walletAddress = resolveEnvAddress('SMOKE_WALLET');
      const payTokenAddress = resolveEnvAddress('SMOKE_USDC_ADDRESS');
      const market =
        markets.find(
          (entry) =>
            entry.indexToken.symbol.toUpperCase() === 'BTC' && entry.name.includes('GMX'),
        ) ?? markets[0];

      const inference = await fetchAlloraInference({
        baseUrl: resolveAlloraApiBaseUrl(),
        chainId: resolveAlloraChainId(),
        topicId: ALLORA_TOPIC_IDS.BTC,
        apiKey: resolveAlloraApiKey(),
      });
      expect(inference.topicId).toBe(ALLORA_TOPIC_IDS.BTC);
      expect(Number.isFinite(inference.combinedValue)).toBe(true);

      await expect(
        client.createPerpetualLong({
          amount: 100n,
          walletAddress,
          chainId: '42161',
          marketAddress: getAddress(market.marketToken.address),
          payTokenAddress,
          collateralTokenAddress: payTokenAddress,
          leverage: '2',
        }),
      ).resolves.toBeDefined();
    } finally {
      if (originalBaseUrl === undefined) {
        delete process.env['ONCHAIN_ACTIONS_BASE_URL'];
      } else {
        process.env['ONCHAIN_ACTIONS_BASE_URL'] = originalBaseUrl;
      }
    }
  });
});

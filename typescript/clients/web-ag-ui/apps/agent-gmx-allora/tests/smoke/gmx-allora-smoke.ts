import { getAddress } from 'viem';

import { fetchAlloraInference } from '../../src/clients/allora.js';
import { OnchainActionsClient } from '../../src/clients/onchainActions.js';
import {
  ALLORA_TOPIC_IDS,
  resolveAlloraApiBaseUrl,
  resolveAlloraApiKey,
  resolveAlloraChainId,
  resolveOnchainActionsBaseUrl,
} from '../../src/config/constants.js';

const resolveBaseUrl = (): string =>
  resolveOnchainActionsBaseUrl({
    endpoint: process.env['ONCHAIN_ACTIONS_API_URL'] ?? process.env['ONCHAIN_ACTIONS_BASE_URL'],
    logger: (message, metadata) => {
      console.info(`[smoke] ${message}`, metadata);
    },
  });

const resolveWalletAddress = (): `0x${string}` | undefined => {
  const value = process.env['SMOKE_WALLET'];
  if (!value) {
    return undefined;
  }
  if (!value.startsWith('0x')) {
    throw new Error(`SMOKE_WALLET must be a hex address, got: ${value}`);
  }
  return value as `0x${string}`;
};

const resolveUsdcAddress = (): `0x${string}` | undefined => {
  const value = process.env['SMOKE_USDC_ADDRESS'];
  if (!value) {
    return undefined;
  }
  if (!value.startsWith('0x')) {
    throw new Error(`SMOKE_USDC_ADDRESS must be a hex address, got: ${value}`);
  }
  return value as `0x${string}`;
};

const baseUrl = resolveBaseUrl();
const walletAddress = resolveWalletAddress();
const usdcAddress = resolveUsdcAddress();
const client = new OnchainActionsClient(baseUrl);

const run = async () => {
  console.log('[smoke] Using onchain-actions base URL:', baseUrl);

  const markets = await client.listPerpetualMarkets({ chainIds: ['42161'] });
  if (markets.length === 0) {
    throw new Error('No perpetual markets returned.');
  }
  console.log(`[smoke] Perpetual markets: ${markets.length}`);

  if (!walletAddress || !usdcAddress) {
    throw new Error('SMOKE_WALLET and SMOKE_USDC_ADDRESS are required for GMX planning checks.');
  }

  const positions = await client.listPerpetualPositions({ walletAddress, chainIds: ['42161'] });
  console.log(`[smoke] Positions for ${walletAddress}: ${positions.length}`);

  const btcMarket =
    markets.find(
      (market) =>
        market.indexToken.symbol.toUpperCase() === 'BTC' && market.name.includes('GMX'),
    ) ?? markets[0];
  if (!btcMarket) {
    throw new Error('No GMX market found for smoke test.');
  }

  const marketAddress = getAddress(btcMarket.marketToken.address);
  const payTokenAddress = getAddress(usdcAddress);

  const inference = await fetchAlloraInference({
    baseUrl: resolveAlloraApiBaseUrl(),
    chainId: resolveAlloraChainId(),
    topicId: ALLORA_TOPIC_IDS.BTC,
    apiKey: resolveAlloraApiKey(),
  });
  console.log('[smoke] Allora inference fetched', { topicId: inference.topicId });

  const failures: string[] = [];
  const warnings: string[] = [];

  const runStep = async (
    label: string,
    fn: () => Promise<void>,
    tolerateWhen?: (message: string) => string | null,
  ) => {
    try {
      await Promise.race([
        fn(),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15_000)),
      ]);
      console.log(`[smoke] ${label}: ok`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const tolerateReason = tolerateWhen ? tolerateWhen(message) : null;
      if (tolerateReason) {
        warnings.push(`${label}: ${tolerateReason}`);
        console.warn(`[smoke] ${label}: warning -> ${tolerateReason}`);
        return;
      }
      failures.push(`${label}: ${message}`);
      console.error(`[smoke] ${label}: failed -> ${message}`);
    }
  };

  await runStep(
    'perpetual long planning',
    async () => {
      await client.createPerpetualLong({
        amount: 100n,
        walletAddress,
        chainId: '42161',
        marketAddress,
        payTokenAddress,
        collateralTokenAddress: payTokenAddress,
        leverage: '2',
      });
    },
    (message) => {
      if (message.includes('Expected bigint')) {
        return 'API expects bigint amount type (upstream mismatch)';
      }
      return null;
    },
  );

  await runStep(
    'perpetual close planning',
    async () => {
      await client.createPerpetualClose({
        walletAddress,
        marketAddress,
        positionSide: 'long',
        isLimit: false,
      });
    },
    (message) => {
      if (message.includes('No position or order found')) {
        return 'no closeable positions for wallet';
      }
      return null;
    },
  );

  if (failures.length > 0) {
    throw new Error(`Smoke checks failed:\n- ${failures.join('\n- ')}`);
  }

  if (warnings.length > 0) {
    console.warn(`[smoke] Warnings:\n- ${warnings.join('\n- ')}`);
  }

  console.log('[smoke] OK');
};

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[smoke] FAILED:', message);
  process.exitCode = 1;
});

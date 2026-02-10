import { getAddress } from 'viem';

import { fetchAlloraInference } from '../../src/clients/allora.js';
import { OnchainActionsClient } from '../../src/clients/onchainActions.js';
import {
  ALLORA_TOPIC_IDS,
  resolveAlloraApiBaseUrl,
  resolveAlloraApiKey,
  resolveAlloraChainId,
  resolveOnchainActionsApiUrl,
} from '../../src/config/constants.js';

const DEFAULT_SMOKE_USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const;
// 1 USDC in base units (6 decimals). Keep this small but non-trivial so onchain-actions
// can plan a realistic position increase when simulation is enabled.
const DEFAULT_LONG_AMOUNT_BASE_UNITS = 1_000_000n;

const resolveBaseUrl = (): string =>
  resolveOnchainActionsApiUrl({
    endpoint: process.env['ONCHAIN_ACTIONS_API_URL'],
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
    console.info('[smoke] SMOKE_USDC_ADDRESS not set; using default Arbitrum USDC', {
      address: DEFAULT_SMOKE_USDC_ADDRESS,
    });
    return DEFAULT_SMOKE_USDC_ADDRESS;
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
        amount: DEFAULT_LONG_AMOUNT_BASE_UNITS,
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
      if (message.includes('No long actions found')) {
        return 'no long actions available (transactions-only env)';
      }
      if (
        message.includes('Execute order simulation failed') ||
        message.toLowerCase().includes('simulation failed')
      ) {
        return 'order simulation failed; rerun against an onchain-actions configured for planning (e.g. GMX_SKIP_SIMULATION=true) or a keeper-capable simulation environment';
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

import { describe, expect, it } from 'vitest';

import { OnchainActionsClient } from '../src/clients/onchainActions.js';
import { resolveOnchainActionsBaseUrl } from '../src/config/constants.js';

describe('onchain-actions readiness (e2e)', () => {
  it('lists GMX perpetual markets from the local onchain-actions server', async () => {
    const baseUrl = process.env['ONCHAIN_ACTIONS_BASE_URL'];
    if (!baseUrl) {
      throw new Error('ONCHAIN_ACTIONS_BASE_URL is required (should be set by global setup).');
    }

    const client = new OnchainActionsClient(resolveOnchainActionsBaseUrl());
    const markets = await client.listPerpetualMarkets({ chainIds: ['42161'] });

    expect(markets.length).toBeGreaterThan(0);
    expect(markets.every((market) => market.chainId === '42161')).toBe(true);
    expect(markets.some((market) => market.marketToken.address.startsWith('0x'))).toBe(true);
  });
});


import { describe, expect, it, vi } from 'vitest';

import { OnchainActionsClient } from '../clients/onchainActions.js';
import { resolvePendleChainIds } from '../config/constants.js';

import { executeUnwind } from './execution.js';

const coerceFetchInputToUrl = (input: unknown): string | null => {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  if (typeof input === 'object' && input !== null && 'url' in input) {
    const url = (input as { url?: unknown }).url;
    return typeof url === 'string' ? url : null;
  }
  return null;
};

describe('executeUnwind (integration)', () => {
  it('replays recorded onchain-actions responses (claim + redeem for matured, sell for non-matured)', async () => {
    // Given: MSW recordings wired for onchain-actions (avoid local service URLs from env files).
    process.env.ONCHAIN_ACTIONS_API_URL = 'http://onchain-actions.test';
    const chainIds = resolvePendleChainIds();
    const client = new OnchainActionsClient(process.env.ONCHAIN_ACTIONS_API_URL);

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // When: unwinding with a "now" after 2026-02-19 but before 2026-06-25.
    const result = await executeUnwind({
      onchainActionsClient: client,
      txExecutionMode: 'plan',
      walletAddress: '0x0000000000000000000000000000000000000001',
      chainIds,
      nowMs: Date.parse('2026-03-01T00:00:00.000Z'),
    });

    // Then: no txs are submitted in plan mode.
    expect(result.txHashes).toEqual([]);

    const urls = fetchSpy.mock.calls
      .map((call) => coerceFetchInputToUrl(call[0]))
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join('\n');

    expect(urls).toContain('/tokenizedYield/markets');
    expect(urls).toContain('/tokenizedYield/positions/');
    expect(urls).toContain('/tokenizedYield/claimRewards');
    expect(urls).toContain('/tokenizedYield/redeemPt');
    expect(urls).toContain('/tokenizedYield/sellPt');
  });
});

import { describe, expect, it } from 'vitest';

import { GmxSetupInputSchema } from './types.js';

describe('GmxSetupInputSchema', () => {
  it('accepts the UI payload shape (baseContributionUsd)', () => {
    const parsed = GmxSetupInputSchema.safeParse({
      walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      baseContributionUsd: 250,
      targetMarket: 'BTC',
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    expect('baseContributionUsd' in parsed.data).toBe(true);
  });
});

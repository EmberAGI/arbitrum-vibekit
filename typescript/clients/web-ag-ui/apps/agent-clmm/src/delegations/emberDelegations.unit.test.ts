import { describe, expect, it } from 'vitest';

import { normalizeAndExpandTransactions } from './emberDelegations.js';

describe('normalizeAndExpandTransactions', () => {
  it('deduplicates repeated warning messages across transactions', () => {
    const result = normalizeAndExpandTransactions({
      transactions: [
        {
          type: 'EVM_TX',
          to: '0x1111111111111111111111111111111111111111',
          data: '0x5ae401dc',
          chainId: '42161',
        },
        {
          type: 'EVM_TX',
          to: '0x2222222222222222222222222222222222222222',
          data: '0x5ae401dc',
          chainId: '42161',
        },
      ],
    });

    expect(result.warnings).toEqual([
      'Some steps are bundled together in a way that can make permissions broader than expected. Please review carefully.',
    ]);
  });
});

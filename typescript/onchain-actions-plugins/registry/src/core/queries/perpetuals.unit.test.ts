import { describe, expect, it } from 'vitest';

import { PerpetualsQueryKeys } from './perpetuals.js';

describe('PerpetualsQueryKeys', () => {
  it('includes lifecycle lookup query key', () => {
    expect(PerpetualsQueryKeys).toEqual(['getMarkets', 'getPositions', 'getOrders', 'getLifecycle']);
  });
});

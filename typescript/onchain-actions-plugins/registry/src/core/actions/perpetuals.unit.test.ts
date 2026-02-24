import { describe, expect, it } from 'vitest';

import { PerpetualsActionTypes } from './perpetuals.js';

describe('PerpetualsActions', () => {
  it('exposes canonical action keys and excludes legacy action keys', () => {
    expect(PerpetualsActionTypes).toEqual([
      'perpetuals-increase-quote',
      'perpetuals-increase-plan',
      'perpetuals-decrease-quote',
      'perpetuals-decrease-plan',
      'perpetuals-orders-cancel-plan',
    ]);
    expect(PerpetualsActionTypes.includes('perpetuals-close')).toBe(false);
  });
});

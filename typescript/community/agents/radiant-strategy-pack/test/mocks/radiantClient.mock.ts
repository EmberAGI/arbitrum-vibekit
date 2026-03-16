import { vi } from 'vitest';
import { RadiantClient } from '../../src/radiantClient';

export function makeRadiantMock(overrides: Partial<RadiantClient> = {}): RadiantClient {
  const base: RadiantClient = {
    supply: vi.fn(async () => {}),
    borrow: vi.fn(async () => {}),
    repay: vi.fn(async () => {}),
    withdraw: vi.fn(async () => {}),

    getHealthFactor: vi.fn(async () => 1.45),
    getBorrowCapacity: vi.fn(async () => 1000n),
    getTotalCollateral: vi.fn(async () => 3000n),
    getBorrowedAmount: vi.fn(async () => 1500n),

    getPendingRewards: vi.fn(async () => 15n),
    getAPYSpread: vi.fn(async () => ({ lendingAPY: 15, borrowAPY: 5 })),
  };

  return { ...base, ...overrides };
}

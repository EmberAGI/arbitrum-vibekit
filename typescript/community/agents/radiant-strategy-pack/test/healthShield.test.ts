import { describe, it, expect, vi } from 'vitest';
import { HealthFactorShield } from '../src/strategies/shield';
import { makeRadiantMock } from './mocks/radiantClient.mock';

describe('Radiant Health Factor Shield', () => {
  it('should repay when health factor is low', async () => {
    const client = makeRadiantMock({
      getHealthFactor: vi.fn(async () => 1.15),
      getBorrowedAmount: vi.fn(async () => 1000n),
    });

    const strategy = new HealthFactorShield(client);
    await strategy.execute({
      token: '0xUSDC',
      warnThreshold: 1.35,
      softThreshold: 1.30,
      hardThreshold: 1.25,
      exitThreshold: 1.20
    });

    expect(client.repay).toHaveBeenCalled();
  });
});

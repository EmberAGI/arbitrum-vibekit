import { describe, it, expect, vi } from 'vitest';
import { AutoCompounder } from '../src/strategies/compound';
import { makeRadiantMock } from './mocks/radiantClient.mock';

describe('Auto Compounder', () => {
  it('should compound rewards when above threshold', async () => {
    const client = makeRadiantMock({
      getPendingRewards: vi.fn(async () => 50n),
    });

    const strategy = new AutoCompounder(client);
    await strategy.execute({
      targetToken: '0xUSDC',
      minValueUSD: 10
    });

    expect(client.supply).toHaveBeenCalledWith({
      token: '0xUSDC',
      amount: '50'
    });
  });
});

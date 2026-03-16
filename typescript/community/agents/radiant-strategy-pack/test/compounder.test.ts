import { describe, it, expect, vi } from 'vitest';
import { executeAutoCompounder } from '../src/strategies/autoCompounder';
import { makeRadiantMock } from './mocks/radiantClient.mock';

describe('Radiant Rewards Auto-Compounder', () => {
  const config = {
    wallet: '0xABC',
    rewardToken: 'RDNT',
    targetToken: '0xUSDC',
    minValueUSD: 10,
    slippageBps: 50,
    intervalSec: 3600,
  };

  it('should skip when rewards below threshold', async () => {
    const client = makeRadiantMock({
      getPendingRewards: vi.fn(async () => 5n),
    });

    const result = await executeAutoCompounder(client, config);

    expect(result.action).toBe('skip_threshold');
    expect(client.supply).not.toHaveBeenCalled();
  });

  it('should execute claim, swap, and supply when above threshold', async () => {
    const client = makeRadiantMock({
      getPendingRewards: vi.fn(async () => 100n),
    });

    const result = await executeAutoCompounder(client, config);

    expect(result.action).toBe('compound');
    expect(result.rewardsClaimed).toBe(100n);
    expect(result.amountSupplied).toBe(100n);
    expect(client.supply).toHaveBeenCalledWith({
      token: '0xUSDC',
      amount: '100',
    });
  });
});

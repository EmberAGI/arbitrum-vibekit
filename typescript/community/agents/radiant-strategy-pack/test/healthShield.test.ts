import { describe, it, expect, vi } from 'vitest';
import { executeHealthFactorShield } from '../src/strategies/healthFactorShield';
import { makeRadiantMock } from './mocks/radiantClient.mock';

describe('Radiant Health Factor Shield', () => {
  const config = {
    wallet: '0xABC',
    token: '0xUSDC',
    warnHF: 1.35,
    softHF: 1.30,
    hardHF: 1.25,
    exitHF: 1.20,
    deleverageStepBps: 1500,
  };

  it('should take no action when HF is healthy', async () => {
    const client = makeRadiantMock({
      getHealthFactor: vi.fn(async () => 1.5),
    });

    const result = await executeHealthFactorShield(client, config);

    expect(result.action).toBe('none');
    expect(result.healthFactor).toBe(1.5);
    expect(client.repay).not.toHaveBeenCalled();
  });

  it('should warn when HF below warnHF', async () => {
    const client = makeRadiantMock({
      getHealthFactor: vi.fn(async () => 1.33),
    });

    const result = await executeHealthFactorShield(client, config);

    expect(result.action).toBe('warn');
    expect(client.repay).not.toHaveBeenCalled();
  });

  it('should soft deleverage when HF below softHF', async () => {
    const client = makeRadiantMock({
      getHealthFactor: vi.fn(async () => 1.28),
      getBorrowedAmount: vi.fn(async () => 1000n),
    });

    const result = await executeHealthFactorShield(client, config);

    expect(result.action).toBe('soft_deleverage');
    expect(client.repay).toHaveBeenCalledWith({
      token: '0xUSDC',
      amount: '150',
    });
  });

  it('should hard deleverage when HF below hardHF', async () => {
    const client = makeRadiantMock({
      getHealthFactor: vi.fn(async () => 1.23),
      getBorrowedAmount: vi.fn(async () => 1000n),
    });

    const result = await executeHealthFactorShield(client, config);

    expect(result.action).toBe('hard_deleverage');
    expect(client.repay).toHaveBeenCalledWith({
      token: '0xUSDC',
      amount: '300',
    });
  });

  it('should full exit when HF below exitHF', async () => {
    const client = makeRadiantMock({
      getHealthFactor: vi.fn(async () => 1.15),
      getBorrowedAmount: vi.fn(async () => 1000n),
    });

    const result = await executeHealthFactorShield(client, config);

    expect(result.action).toBe('full_exit');
    expect(client.repay).toHaveBeenCalledWith({
      token: '0xUSDC',
      amount: '1000',
    });
  });
});

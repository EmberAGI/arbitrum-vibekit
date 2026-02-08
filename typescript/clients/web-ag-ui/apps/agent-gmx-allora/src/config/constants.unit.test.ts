import { describe, expect, it, vi } from 'vitest';

import {
  resolveGmxAlloraTxExecutionMode,
  resolveMinNativeEthWei,
  resolveOnchainActionsBaseUrl,
} from './constants.js';

describe('config/constants', () => {
  const restoreEnv = (key: string, previous: string | undefined) => {
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  };

  it('defaults the minimum native ETH threshold when the env var is unset', () => {
    const previous = process.env.GMX_MIN_NATIVE_ETH_WEI;
    delete process.env.GMX_MIN_NATIVE_ETH_WEI;

    expect(resolveMinNativeEthWei()).toBe(2_000_000_000_000_000n);

    restoreEnv('GMX_MIN_NATIVE_ETH_WEI', previous);
  });

  it('uses the minimum native ETH threshold override when supplied', () => {
    const previous = process.env.GMX_MIN_NATIVE_ETH_WEI;
    process.env.GMX_MIN_NATIVE_ETH_WEI = '12345';

    expect(resolveMinNativeEthWei()).toBe(12_345n);

    restoreEnv('GMX_MIN_NATIVE_ETH_WEI', previous);
  });

  it('falls back to defaults when the minimum native ETH threshold override is invalid', () => {
    const previous = process.env.GMX_MIN_NATIVE_ETH_WEI;
    process.env.GMX_MIN_NATIVE_ETH_WEI = 'not-a-number';

    expect(resolveMinNativeEthWei()).toBe(2_000_000_000_000_000n);

    restoreEnv('GMX_MIN_NATIVE_ETH_WEI', previous);
  });

  it('falls back to defaults when the minimum native ETH threshold override is non-positive', () => {
    const previous = process.env.GMX_MIN_NATIVE_ETH_WEI;
    process.env.GMX_MIN_NATIVE_ETH_WEI = '0';

    expect(resolveMinNativeEthWei()).toBe(2_000_000_000_000_000n);

    restoreEnv('GMX_MIN_NATIVE_ETH_WEI', previous);
  });

  it('normalizes the OpenAPI endpoint to a base URL and logs the change', () => {
    process.env.ONCHAIN_ACTIONS_BASE_URL = 'https://api.emberai.xyz/openapi.json';

    const logger = vi.fn();
    const baseUrl = resolveOnchainActionsBaseUrl({ logger });

    expect(baseUrl).toBe('https://api.emberai.xyz');
    expect(logger).toHaveBeenCalledWith(
      'Normalized onchain-actions endpoint from OpenAPI spec URL',
      expect.objectContaining({
        endpoint: 'https://api.emberai.xyz/openapi.json',
        baseUrl: 'https://api.emberai.xyz',
        source: 'ONCHAIN_ACTIONS_BASE_URL',
      }),
    );
  });

  it('returns the trimmed base URL for explicit overrides and logs the override', () => {
    process.env.ONCHAIN_ACTIONS_BASE_URL = 'https://api.example.test/';

    const logger = vi.fn();
    const baseUrl = resolveOnchainActionsBaseUrl({ logger });

    expect(baseUrl).toBe('https://api.example.test');
    expect(logger).toHaveBeenCalledWith(
      'Using custom onchain-actions base URL',
      expect.objectContaining({
        baseUrl: 'https://api.example.test',
        source: 'ONCHAIN_ACTIONS_BASE_URL',
      }),
    );
  });

  it('uses defaults without logging when no overrides are supplied', () => {
    delete process.env.ONCHAIN_ACTIONS_BASE_URL;

    const logger = vi.fn();
    const baseUrl = resolveOnchainActionsBaseUrl({ logger });

    expect(baseUrl).toBe('https://api.emberai.xyz');
    expect(logger).not.toHaveBeenCalled();
  });

  it('defaults to plan mode for transaction execution', () => {
    delete process.env.GMX_ALLORA_TX_SUBMISSION_MODE;

    expect(resolveGmxAlloraTxExecutionMode()).toBe('plan');
  });

  it('uses execute mode when submission mode is submit', () => {
    const previous = process.env.GMX_ALLORA_TX_SUBMISSION_MODE;
    process.env.GMX_ALLORA_TX_SUBMISSION_MODE = 'submit';

    expect(resolveGmxAlloraTxExecutionMode()).toBe('execute');

    restoreEnv('GMX_ALLORA_TX_SUBMISSION_MODE', previous);
  });

  it('uses plan mode when submission mode is plan', () => {
    const previous = process.env.GMX_ALLORA_TX_SUBMISSION_MODE;
    process.env.GMX_ALLORA_TX_SUBMISSION_MODE = 'plan';

    expect(resolveGmxAlloraTxExecutionMode()).toBe('plan');

    restoreEnv('GMX_ALLORA_TX_SUBMISSION_MODE', previous);
  });
});


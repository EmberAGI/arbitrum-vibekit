import { describe, expect, it, vi } from 'vitest';

import { resolveOnchainActionsBaseUrl } from './constants.js';

describe('config/constants', () => {
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
});

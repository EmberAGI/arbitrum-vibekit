import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

describe('constants env resolvers', () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  it('resolvePollIntervalMs honors CLMM_POLL_INTERVAL_MS when positive', async () => {
    // Given a custom poll interval env override
    process.env['CLMM_POLL_INTERVAL_MS'] = '45000';
    vi.resetModules();
    const { resolvePollIntervalMs } = await import('./constants.js');

    // When the resolver runs
    const result = resolvePollIntervalMs();

    // Then it should adopt the provided positive override
    expect(result).toBe(45_000);
  });

  it('resolvePollIntervalMs falls back to 30s when unset or invalid', async () => {
    // Given an invalid poll interval env override
    process.env['CLMM_POLL_INTERVAL_MS'] = '-1000';
    vi.resetModules();
    const { resolvePollIntervalMs } = await import('./constants.js');

    // When the resolver encounters the malformed value
    const result = resolvePollIntervalMs();

    // Then it should retain the documented 30-second cadence
    expect(result).toBe(30_000);
  });

  it('resolveStreamLimit truncates values and defaults to -1 when malformed', async () => {
    // Given a fractional stream limit override
    process.env['CLMM_STREAM_LIMIT'] = '42.75';
    vi.resetModules();
    const { resolveStreamLimit } = await import('./constants.js');

    // When the resolver executes
    const truncated = resolveStreamLimit();

    // Then it should truncate fractional inputs toward zero
    expect(truncated).toBe(42);

    // And malformed values should revert to the infinite-stream sentinel
    process.env['CLMM_STREAM_LIMIT'] = 'NaN';
    vi.resetModules();
    const constants = await import('./constants.js');
    expect(constants.resolveStreamLimit()).toBe(-1);
  });

  it('resolveEthUsdPrice enforces positive USD quotes with a sensible fallback', async () => {
    // Given an explicit ETH/USD override
    process.env['CLMM_ETH_PRICE_USD'] = '4100';
    vi.resetModules();
    const { resolveEthUsdPrice } = await import('./constants.js');

    // When the resolver runs
    const resolved = resolveEthUsdPrice();

    // Then it should surface the operator-provided quote
    expect(resolved).toBe(4100);

    // And invalid overrides should roll back to the baked-in $3.5k estimate
    process.env['CLMM_ETH_PRICE_USD'] = 'not-a-number';
    vi.resetModules();
    const constants = await import('./constants.js');
    expect(constants.resolveEthUsdPrice()).toBe(3500);
  });

  it('EMBER_API_BASE_URL trims trailing slashes to avoid double separators', async () => {
    // Given a base URL configured with a trailing slash
    process.env['EMBER_API_BASE_URL'] = 'https://example.test/';
    vi.resetModules();
    const { EMBER_API_BASE_URL } = await import('./constants.js');

    // When the constant is evaluated
    // Then it should remove the trailing slash for consistent endpoint joins
    expect(EMBER_API_BASE_URL).toBe('https://example.test');
  });
});

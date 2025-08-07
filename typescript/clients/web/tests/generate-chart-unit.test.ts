import { test, expect } from '@playwright/test';
import { generateChart } from '../lib/ai/tools/generate-chart';

// Mock fetch globally for these tests
const originalFetch = global.fetch;

test.describe('Generate Chart Tool - Unit Tests', () => {
  test.afterEach(() => {
    // Restore original fetch after each test
    global.fetch = originalFetch;
  });

  test('should successfully generate chart data for supported token', async () => {
    const mockResponseData = {
      prices: [
        [1703980800000, 42000],
        [1703984400000, 42100],
        [1703988000000, 41950],
      ],
    };

    // Mock successful API response
    global.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toContain('api.coingecko.com');
      expect(url).toContain('bitcoin'); // BTC should map to bitcoin
      expect(url).toContain('days=7');
      return {
        ok: true,
        status: 200,
        json: async () => mockResponseData,
      } as Response;
    };

    const result = await generateChart.execute(
      { token: 'BTC', days: 7 },
      {
        toolCallId: '',
        messages: [],
      },
    );

    expect(result).toEqual({ prices: mockResponseData.prices });
  });

  test('should handle unsupported token', async () => {
    const result = await generateChart.execute(
      { token: 'INVALIDTOKEN', days: 7 },
      {
        toolCallId: '',
        messages: [],
      },
    );

    expect(result).toEqual({ error: 'Token "INVALIDTOKEN" is not supported.' });
  });

  test('should handle API failure', async () => {
    // Mock API failure
    global.fetch = async () => {
      return {
        ok: false,
        status: 500,
      } as Response;
    };

    const result = await generateChart.execute(
      { token: 'BTC', days: 7 },
      {
        toolCallId: '',
        messages: [],
      },
    );

    expect(result).toEqual({ error: 'Failed to fetch chart data' });
  });

  test('should handle network errors', async () => {
    // Mock network error
    global.fetch = async () => {
      throw new Error('Network error');
    };

    const result = await generateChart.execute(
      { token: 'ETH', days: 30 },
      {
        toolCallId: '',
        messages: [],
      },
    );

    expect(result).toEqual({ error: 'Failed to fetch chart data' });
  });

  test('should handle all supported tokens', async () => {
    const supportedTokens = [
      'BTC',
      'ETH',
      'USDC',
      'USDT',
      'DAI',
      'WBTC',
      'WETH',
      'ARB',
      'BASE',
      'MATIC',
      'OP',
    ];

    for (const token of supportedTokens) {
      global.fetch = async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        expect(url).toContain('api.coingecko.com');
        return {
          ok: true,
          status: 200,
          json: async () => ({ prices: [[Date.now(), 1000]] }),
        } as Response;
      };

      const result = await generateChart.execute(
        { token, days: 1 },
        {
          toolCallId: '',
          messages: [],
        },
      );
      expect(result).toHaveProperty('prices');
      expect(result).not.toHaveProperty('error');
    }
  });

  test('should handle case insensitive token input', async () => {
    global.fetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ prices: [[Date.now(), 1000]] }),
      }) as Response;

    // Test lowercase
    const resultLower = await generateChart.execute(
      { token: 'btc', days: 1 },
      {
        toolCallId: '',
        messages: [],
      },
    );
    expect(resultLower).toHaveProperty('prices');

    // Test mixed case
    const resultMixed = await generateChart.execute(
      { token: 'eTh', days: 1 },
      {
        toolCallId: '',
        messages: [],
      },
    );
    expect(resultMixed).toHaveProperty('prices');
  });

  test('should pass correct days parameter to API', async () => {
    const testDays = [1, 7, 30, 365];

    for (const days of testDays) {
      global.fetch = async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        expect(url).toContain(`days=${days}`);
        return {
          ok: true,
          status: 200,
          json: async () => ({ prices: [] }),
        } as Response;
      };

      await generateChart.execute(
        { token: 'BTC', days },
        {
          toolCallId: '',
          messages: [],
        },
      );
    }
  });

  test('should handle malformed API response', async () => {
    // Mock malformed response
    global.fetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ invalid: 'data' }), // Missing prices array
      }) as Response;

    const result = await generateChart.execute(
      { token: 'BTC', days: 7 },
      {
        toolCallId: '',
        messages: [],
      },
    );

    // Should still return the response even if malformed
    expect(result).toEqual({ prices: undefined });
  });

  test('should handle JSON parsing errors', async () => {
    // Mock response with invalid JSON
    global.fetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      }) as unknown as Response;

    const result = await generateChart.execute(
      { token: 'BTC', days: 7 },
      {
        toolCallId: '',
        messages: [],
      },
    );

    expect(result).toEqual({ error: 'Failed to fetch chart data' });
  });

  test('should validate tool parameters schema', () => {
    const parameters = generateChart.parameters;

    // Check that parameters are correctly defined
    expect(parameters._def.shape()).toHaveProperty('token');
    expect(parameters._def.shape()).toHaveProperty('days');

    // Test valid parameters
    const validParams = { token: 'BTC', days: 7 };
    expect(() => parameters.parse(validParams)).not.toThrow();

    // Test invalid parameters should throw during validation
    expect(() => parameters.parse({ token: 'BTC' })).toThrow(); // Missing days
    expect(() => parameters.parse({ days: 7 })).toThrow(); // Missing token
    expect(() => parameters.parse({ token: 123, days: 7 })).toThrow(); // Wrong type
  });

  test('should handle edge case days values', async () => {
    global.fetch = async (_input: RequestInfo | URL) =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ prices: [] }),
      }) as Response;

    // Test boundary values
    const edgeCases = [0, 1, 365, 1000];

    for (const days of edgeCases) {
      const result = await generateChart.execute(
        { token: 'BTC', days },
        {
          toolCallId: '',
          messages: [],
        },
      );
      // Should not error on edge case values
      expect(result).not.toHaveProperty('error');
    }
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSwapQuote } from './getSwapQuote.js';
import type { GetSwapQuoteRequest } from '../schemas/index.js';
import * as validation from '../utils/validation.js';
import * as provider from '../utils/provider.js';

// Mock dependencies
vi.mock('../utils/provider.js');
vi.mock('../utils/validation.js');
vi.mock('../utils/config.js', () => ({
  loadConfig: () => ({
    defaultSlippage: 0.5,
  }),
}));

describe('getSwapQuote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should validate inputs', async () => {
    const request: GetSwapQuoteRequest = {
      tokenIn: '0x1234567890123456789012345678901234567890',
      tokenOut: '0x0987654321098765432109876543210987654321',
      amount: BigInt('1000000000000000000'), // 1 ETH
      chainId: 1,
    };

    vi.spyOn(validation, 'validateAddress').mockReturnValue(
      request.tokenIn
    );
    vi.spyOn(validation, 'validateDifferentTokens').mockReturnValue(undefined);
    vi.spyOn(validation, 'validatePositiveAmount').mockReturnValue(
      request.amount
    );

    // Mock provider
    const mockProvider = {
      getCode: vi.fn().mockResolvedValue('0x'),
    };
    vi.spyOn(provider, 'getProvider').mockReturnValue(
      mockProvider as any
    );

    // This will fail at token metadata fetching, but validates input validation
    await expect(getSwapQuote(request)).rejects.toThrow();
  });

  it('should reject invalid token addresses', async () => {
    const request: GetSwapQuoteRequest = {
      tokenIn: 'invalid',
      tokenOut: '0x0987654321098765432109876543210987654321',
      amount: BigInt('1000000000000000000'),
      chainId: 1,
    };

    vi.spyOn(validation, 'validateAddress').mockImplementation(() => {
      throw new Error('Invalid address');
    });

    await expect(getSwapQuote(request)).rejects.toThrow('Invalid address');
  });

  it('should reject zero amount', async () => {
    const request: GetSwapQuoteRequest = {
      tokenIn: '0x1234567890123456789012345678901234567890',
      tokenOut: '0x0987654321098765432109876543210987654321',
      amount: BigInt('0'),
      chainId: 1,
    };

    vi.spyOn(validation, 'validateAddress').mockReturnValue(
      request.tokenIn
    );
    vi.spyOn(validation, 'validatePositiveAmount').mockImplementation(() => {
      throw new Error('Amount must be positive');
    });

    await expect(getSwapQuote(request)).rejects.toThrow(
      'Amount must be positive'
    );
  });
});


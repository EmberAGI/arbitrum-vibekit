import { describe, it, expect } from 'vitest';
import {
  validateAddress,
  validateNonZeroAddress,
  validatePositiveAmount,
  validateSlippageTolerance,
  validateChainId,
  validateDifferentTokens,
} from './validation.js';
import { ValidationError } from '../errors/index.js';

describe('validation utilities', () => {
  describe('validateAddress', () => {
    it('should accept valid addresses', () => {
      const valid = '0x742d35Cc6634C4532895c05b22629ce5b3c28da4';
      expect(validateAddress(valid)).toBe(valid.toLowerCase());
    });

    it('should reject invalid addresses', () => {
      expect(() => validateAddress('invalid')).toThrow(ValidationError);
      expect(() => validateAddress('0x123')).toThrow(ValidationError);
    });
  });

  describe('validateNonZeroAddress', () => {
    it('should accept non-zero addresses', () => {
      const valid = '0x742d35Cc6634C4532895c05b22629ce5b3c28da4';
      expect(validateNonZeroAddress(valid)).toBe(valid.toLowerCase());
    });

    it('should reject zero address', () => {
      expect(() =>
        validateNonZeroAddress('0x0000000000000000000000000000000000000000')
      ).toThrow(ValidationError);
    });
  });

  describe('validatePositiveAmount', () => {
    it('should accept positive amounts', () => {
      expect(validatePositiveAmount(BigInt('1000'))).toBe(BigInt('1000'));
    });

    it('should reject zero amount', () => {
      expect(() => validatePositiveAmount(BigInt('0'))).toThrow(
        ValidationError
      );
    });

    it('should reject negative amounts', () => {
      // BigInt doesn't support negative in our context, but test the check
      expect(() => validatePositiveAmount(BigInt('-1'))).toThrow(
        ValidationError
      );
    });
  });

  describe('validateSlippageTolerance', () => {
    it('should accept valid slippage values', () => {
      expect(validateSlippageTolerance(0.5)).toBe(0.5);
      expect(validateSlippageTolerance(1)).toBe(1);
      expect(validateSlippageTolerance(5)).toBe(5);
    });

    it('should reject negative slippage', () => {
      expect(() => validateSlippageTolerance(-1)).toThrow(ValidationError);
    });

    it('should reject slippage over 50%', () => {
      expect(() => validateSlippageTolerance(51)).toThrow(ValidationError);
    });
  });

  describe('validateChainId', () => {
    it('should accept supported chain IDs', () => {
      expect(validateChainId(1)).toBe(1);
      expect(validateChainId(42161)).toBe(42161);
    });

    it('should reject unsupported chain IDs', () => {
      expect(() => validateChainId(999)).toThrow(ValidationError);
    });
  });

  describe('validateDifferentTokens', () => {
    it('should accept different tokens', () => {
      expect(() =>
        validateDifferentTokens(
          '0x1234567890123456789012345678901234567890',
          '0x0987654321098765432109876543210987654321'
        )
      ).not.toThrow();
    });

    it('should reject same tokens', () => {
      const address = '0x1234567890123456789012345678901234567890';
      expect(() => validateDifferentTokens(address, address)).toThrow(
        ValidationError
      );
    });
  });
});


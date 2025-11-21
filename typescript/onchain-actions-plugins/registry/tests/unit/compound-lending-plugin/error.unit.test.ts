import { describe, it, expect } from 'vitest';
import {
  getCompoundError,
  createCompoundError,
  handleCompoundError,
} from '../../../src/compound-lending-plugin/error.js';

describe('Compound V3 Error Handling', () => {
  describe('getCompoundError', () => {
    it('should extract error name from "execution reverted: InvalidUInt104"', () => {
      const error = getCompoundError('execution reverted: InvalidUInt104');
      expect(error).not.toBeNull();
      expect(error?.errorName).toBe('InvalidUInt104');
      expect(error?.message).toBe('InvalidUInt104');
    });

    it('should extract error name from "execution reverted: BadDecimals()"', () => {
      const error = getCompoundError('execution reverted: BadDecimals()');
      expect(error).not.toBeNull();
      expect(error?.errorName).toBe('BadDecimals');
    });

    it('should extract error name from simple error string', () => {
      const error = getCompoundError('Unauthorized');
      expect(error).not.toBeNull();
      expect(error?.errorName).toBe('Unauthorized');
    });

    it('should return null for empty string', () => {
      const error = getCompoundError('');
      expect(error).toBeNull();
    });

    it('should return null for strings longer than 100 characters', () => {
      const longString = 'a'.repeat(101); // 101 characters
      const error = getCompoundError(longString);
      expect(error).toBeNull();
    });

    it('should extract short strings as error names (fallback behavior)', () => {
      // The function extracts any string < 100 chars as a fallback
      const error = getCompoundError('Some random text that is not an error');
      expect(error).not.toBeNull();
      expect(error?.errorName).toBe('Some random text that is not an error');
    });
  });

  describe('createCompoundError', () => {
    it('should create error with extracted name', () => {
      const error = createCompoundError('execution reverted: InvalidUInt104');
      expect(error.errorName).toBe('InvalidUInt104');
      expect(error.name).toBe('CompoundError');
    });

    it('should create error with fallback message for unknown errors', () => {
      const error = createCompoundError('Some unknown error');
      expect(error.errorName).toBe('Some unknown error');
    });

    it('should handle empty string with fallback', () => {
      const error = createCompoundError('');
      expect(error.errorName).toBe('Unknown Compound V3 error');
    });
  });

  describe('handleCompoundError', () => {
    it('should extract error from ethers error object with reason', () => {
      const ethersError = {
        reason: 'execution reverted: InvalidUInt104',
      };
      const error = handleCompoundError(ethersError);
      expect(error).not.toBeNull();
      expect(error?.errorName).toBe('InvalidUInt104');
    });

    it('should extract error from ethers error object with message', () => {
      const ethersError = {
        message: 'execution reverted: BadDecimals()',
      };
      const error = handleCompoundError(ethersError);
      expect(error).not.toBeNull();
      expect(error?.errorName).toBe('BadDecimals');
    });

    it('should extract error from string', () => {
      const error = handleCompoundError('execution reverted: Unauthorized');
      expect(error).not.toBeNull();
      expect(error?.errorName).toBe('Unauthorized');
    });

    it('should return null for non-error objects', () => {
      const error = handleCompoundError({ someProperty: 'value' });
      expect(error).toBeNull();
    });

    it('should return null for null/undefined', () => {
      expect(handleCompoundError(null)).toBeNull();
      expect(handleCompoundError(undefined)).toBeNull();
    });
  });
});

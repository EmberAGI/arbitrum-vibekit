import { describe, it, expect } from 'vitest';
import {
  getCompoundError,
  createCompoundError,
  handleCompoundError,
} from '../../../../src/compound-lending-plugin/error.js';

describe('Compound V3 Error Handling', () => {
  describe('getCompoundError', () => {
    it('should extract valid error name from "execution reverted: ErrorName" pattern', () => {
      const error = getCompoundError('execution reverted: InvalidUInt104');
      expect(error).not.toBeNull();
      expect(error?.errorName).toBe('InvalidUInt104');
      expect(error?.message).toBe('InvalidUInt104');
    });

    it('should extract error name from "execution reverted: ErrorName()" pattern', () => {
      const error = getCompoundError('execution reverted: BadDecimals()');
      expect(error).not.toBeNull();
      expect(error?.errorName).toBe('BadDecimals');
    });

    it('should extract error name from direct error string', () => {
      const error = getCompoundError('Unauthorized');
      expect(error).not.toBeNull();
      expect(error?.errorName).toBe('Unauthorized');
    });

    it('should handle quoted error names', () => {
      const error = getCompoundError('execution reverted: "Paused"');
      expect(error).not.toBeNull();
      expect(error?.errorName).toBe('Paused');
    });

    it('should return null for empty string', () => {
      expect(getCompoundError('')).toBeNull();
    });

    it('should return null for invalid/unknown error names', () => {
      expect(getCompoundError('InvalidErrorName')).toBeNull();
      expect(getCompoundError('execution reverted: InvalidErrorName')).toBeNull();
      expect(getCompoundError('Some random text')).toBeNull();
    });

    it('should return null for standard JavaScript error names', () => {
      expect(getCompoundError('TypeError')).toBeNull();
      expect(getCompoundError('execution reverted: ReferenceError')).toBeNull();
      expect(getCompoundError('Error')).toBeNull();
    });

    it('should extract all valid Compound error names', () => {
      const validErrors = [
        'Absurd',
        'BadAmount',
        'BadAsset',
        'BorrowTooSmall',
        'InsufficientReserves',
        'NotCollateralized',
        'NotLiquidatable',
        'SupplyCapExceeded',
        'TooMuchSlippage',
        'TransferInFailed',
      ];

      for (const errorName of validErrors) {
        const error = getCompoundError(errorName);
        expect(error).not.toBeNull();
        expect(error?.errorName).toBe(errorName);
      }
    });
  });

  describe('createCompoundError', () => {
    it('should create error with extracted valid name', () => {
      const error = createCompoundError('execution reverted: InvalidUInt104');
      expect(error.errorName).toBe('InvalidUInt104');
      expect(error.name).toBe('CompoundError');
    });

    it('should create error with fallback message for invalid errors', () => {
      const error = createCompoundError('Some unknown error');
      expect(error.errorName).toBe('Unknown Compound V3 error');
    });

    it('should handle empty string with fallback', () => {
      const error = createCompoundError('');
      expect(error.errorName).toBe('Unknown Compound V3 error');
    });

    it('should use fallback for standard JavaScript errors', () => {
      const error = createCompoundError('TypeError: something went wrong');
      expect(error.errorName).toBe('Unknown Compound V3 error');
    });
  });

  describe('handleCompoundError', () => {
    it('should extract error from error object with reason', () => {
      const ethersError = {
        reason: 'execution reverted: InvalidUInt104',
      };
      const error = handleCompoundError(ethersError);
      expect(error).not.toBeNull();
      expect(error?.errorName).toBe('InvalidUInt104');
    });

    it('should extract error from error object with message', () => {
      const ethersError = {
        message: 'execution reverted: BadDecimals()',
      };
      const error = handleCompoundError(ethersError);
      expect(error).not.toBeNull();
      expect(error?.errorName).toBe('BadDecimals');
    });

    it('should extract error from error object with shortMessage', () => {
      const ethersError = {
        shortMessage: 'execution reverted: Unauthorized',
      };
      const error = handleCompoundError(ethersError);
      expect(error).not.toBeNull();
      expect(error?.errorName).toBe('Unauthorized');
    });

    it('should extract error from error object with errorName', () => {
      const errorObj = {
        errorName: 'Paused',
      };
      const error = handleCompoundError(errorObj);
      expect(error).not.toBeNull();
      expect(error?.errorName).toBe('Paused');
    });

    it('should extract error from nested data object', () => {
      const errorObj = {
        data: {
          errorName: 'NotLiquidatable',
        },
      };
      const error = handleCompoundError(errorObj);
      expect(error).not.toBeNull();
      expect(error?.errorName).toBe('NotLiquidatable');
    });

    it('should extract error from string', () => {
      const error = handleCompoundError('execution reverted: Unauthorized');
      expect(error).not.toBeNull();
      expect(error?.errorName).toBe('Unauthorized');
    });

    it('should extract nested reason from standard JS errors', () => {
      const jsError = {
        name: 'TypeError',
        reason: 'execution reverted: BadAmount',
      };
      const error = handleCompoundError(jsError);
      expect(error).not.toBeNull();
      expect(error?.errorName).toBe('BadAmount');
    });

    it('should return null for non-error objects without valid error info', () => {
      expect(handleCompoundError({ someProperty: 'value' })).toBeNull();
      expect(handleCompoundError({ reason: 'InvalidErrorName' })).toBeNull();
    });

    it('should return null for null/undefined', () => {
      expect(handleCompoundError(null)).toBeNull();
      expect(handleCompoundError(undefined)).toBeNull();
    });

    it('should return null for standard JS errors without nested Compound error', () => {
      const jsError = {
        name: 'TypeError',
        message: 'Something went wrong',
      };
      expect(handleCompoundError(jsError)).toBeNull();
    });
  });
});

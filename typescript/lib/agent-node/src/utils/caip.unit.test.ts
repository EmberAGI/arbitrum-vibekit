/**
 * Unit tests for CAIP utilities
 * Tests CAIP-2 and CAIP-10 formatting and parsing
 */

import { describe, it, expect } from 'vitest';

import {
  formatCaip2,
  formatCaip10,
  parseCaip2,
  parseCaip10,
  isValidCaip2,
  isValidCaip10,
} from './caip.js';

describe('CAIP Utilities', () => {
  describe('formatCaip2', () => {
    it('should format valid CAIP-2 blockchain ID for Ethereum mainnet', () => {
      // Given: Ethereum mainnet chain ID and registry address
      const chainId = 1;
      const address = '0x1234567890123456789012345678901234567890';

      // When: formatting CAIP-2
      const result = formatCaip2(chainId, address);

      // Then: should return proper CAIP-2 format with lowercase address
      expect(result).toBe('eip155:1:0x1234567890123456789012345678901234567890');
    });

    it('should format valid CAIP-2 blockchain ID for Arbitrum One', () => {
      // Given: Arbitrum One chain ID and registry address
      const chainId = 42161;
      const address = '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01';

      // When: formatting CAIP-2
      const result = formatCaip2(chainId, address);

      // Then: should normalize address to lowercase
      expect(result).toBe('eip155:42161:0xabcdef0123456789abcdef0123456789abcdef01');
    });

    it('should format valid CAIP-2 blockchain ID for Base', () => {
      // Given: Base chain ID and address
      const chainId = 8453;
      const address = '0x0000000000000000000000000000000000000000';

      // When: formatting CAIP-2
      const result = formatCaip2(chainId, address);

      // Then: should return proper CAIP-2 format
      expect(result).toBe('eip155:8453:0x0000000000000000000000000000000000000000');
    });

    it('should throw error for invalid chain ID (zero)', () => {
      // Given: invalid chain ID of 0
      const chainId = 0;
      const address = '0x1234567890123456789012345678901234567890';

      // When/Then: should throw error
      expect(() => formatCaip2(chainId, address)).toThrow('Invalid chain ID: 0');
    });

    it('should throw error for invalid chain ID (negative)', () => {
      // Given: negative chain ID
      const chainId = -1;
      const address = '0x1234567890123456789012345678901234567890';

      // When/Then: should throw error
      expect(() => formatCaip2(chainId, address)).toThrow('Invalid chain ID: -1');
    });

    it('should throw error for invalid chain ID (non-integer)', () => {
      // Given: non-integer chain ID
      const chainId = 1.5;
      const address = '0x1234567890123456789012345678901234567890';

      // When/Then: should throw error
      expect(() => formatCaip2(chainId, address)).toThrow('Invalid chain ID: 1.5');
    });

    it('should throw error for empty address', () => {
      // Given: valid chain ID but empty address
      const chainId = 1;
      const address = '';

      // When/Then: should throw error
      expect(() => formatCaip2(chainId, address)).toThrow('Invalid address');
    });

    it('should throw error for non-string address', () => {
      // Given: valid chain ID but non-string address
      const chainId = 1;
      const address = null as unknown as string;

      // When/Then: should throw error
      expect(() => formatCaip2(chainId, address)).toThrow('Invalid address');
    });
  });

  describe('formatCaip10', () => {
    it('should format valid CAIP-10 account ID', () => {
      // Given: chain ID and operator address
      const chainId = 42161;
      const address = '0x9876543210987654321098765432109876543210';

      // When: formatting CAIP-10
      const result = formatCaip10(chainId, address);

      // Then: should return proper CAIP-10 format (same as CAIP-2 for EVM)
      expect(result).toBe('eip155:42161:0x9876543210987654321098765432109876543210');
    });

    it('should delegate to formatCaip2 and normalize address', () => {
      // Given: chain ID and mixed-case address
      const chainId = 1;
      const address = '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01';

      // When: formatting CAIP-10
      const result = formatCaip10(chainId, address);

      // Then: should normalize to lowercase
      expect(result).toBe('eip155:1:0xabcdef0123456789abcdef0123456789abcdef01');
    });

    it('should throw error for invalid inputs (same as formatCaip2)', () => {
      // Given: invalid chain ID
      const chainId = -5;
      const address = '0x1234567890123456789012345678901234567890';

      // When/Then: should throw error
      expect(() => formatCaip10(chainId, address)).toThrow('Invalid chain ID');
    });
  });

  describe('parseCaip2', () => {
    it('should parse valid CAIP-2 blockchain ID', () => {
      // Given: valid CAIP-2 string
      const caip = 'eip155:1:0x1234567890123456789012345678901234567890';

      // When: parsing CAIP-2
      const result = parseCaip2(caip);

      // Then: should return parsed components
      expect(result).toEqual({
        namespace: 'eip155',
        chainId: 1,
        address: '0x1234567890123456789012345678901234567890',
      });
    });

    it('should parse CAIP-2 with Arbitrum chain ID', () => {
      // Given: CAIP-2 string for Arbitrum
      const caip = 'eip155:42161:0xabcdef0123456789abcdef0123456789abcdef01';

      // When: parsing CAIP-2
      const result = parseCaip2(caip);

      // Then: should return parsed components with correct chain ID
      expect(result).toEqual({
        namespace: 'eip155',
        chainId: 42161,
        address: '0xabcdef0123456789abcdef0123456789abcdef01',
      });
    });

    it('should normalize address to lowercase when parsing', () => {
      // Given: CAIP-2 string with mixed-case address
      const caip = 'eip155:1:0xAbCdEf0123456789AbCdEf0123456789AbCdEf01';

      // When: parsing CAIP-2
      const result = parseCaip2(caip);

      // Then: should normalize address to lowercase
      expect(result.address).toBe('0xabcdef0123456789abcdef0123456789abcdef01');
    });

    it('should throw error for empty string', () => {
      // Given: empty string
      const caip = '';

      // When/Then: should throw error
      expect(() => parseCaip2(caip)).toThrow('Invalid CAIP-2 string');
    });

    it('should throw error for null input', () => {
      // Given: null input
      const caip = null as unknown as string;

      // When/Then: should throw error
      expect(() => parseCaip2(caip)).toThrow('Invalid CAIP-2 string');
    });

    it('should throw error for invalid format (too few parts)', () => {
      // Given: CAIP string with only 2 parts
      const caip = 'eip155:1';

      // When/Then: should throw error with format guidance
      expect(() => parseCaip2(caip)).toThrow(
        'Invalid CAIP-2 format: "eip155:1". Expected format: namespace:chainId:address',
      );
    });

    it('should throw error for invalid format (too many parts)', () => {
      // Given: CAIP string with 4 parts
      const caip = 'eip155:1:0x1234:extra';

      // When/Then: should throw error
      expect(() => parseCaip2(caip)).toThrow('Invalid CAIP-2 format');
    });

    it('should throw error for missing namespace', () => {
      // Given: CAIP string with empty namespace
      const caip = ':1:0x1234567890123456789012345678901234567890';

      // When/Then: should throw error
      expect(() => parseCaip2(caip)).toThrow('Missing namespace in CAIP-2');
    });

    it('should throw error for unsupported namespace', () => {
      // Given: CAIP string with non-EVM namespace
      const caip = 'cosmos:cosmoshub-4:cosmos1abcd1234';

      // When/Then: should throw error indicating only EVM is supported
      expect(() => parseCaip2(caip)).toThrow(
        'Unsupported namespace: "cosmos". Only "eip155" (EVM chains) is currently supported.',
      );
    });

    it('should throw error for missing chain ID', () => {
      // Given: CAIP string with empty chain ID
      const caip = 'eip155::0x1234567890123456789012345678901234567890';

      // When/Then: should throw error
      expect(() => parseCaip2(caip)).toThrow('Missing chain ID in CAIP-2');
    });

    it('should throw error for invalid chain ID (non-numeric)', () => {
      // Given: CAIP string with non-numeric chain ID
      const caip = 'eip155:mainnet:0x1234567890123456789012345678901234567890';

      // When/Then: should throw error
      expect(() => parseCaip2(caip)).toThrow(
        'Invalid chain ID in CAIP-2: "mainnet". Must be a positive integer.',
      );
    });

    it('should throw error for invalid chain ID (zero)', () => {
      // Given: CAIP string with zero chain ID
      const caip = 'eip155:0:0x1234567890123456789012345678901234567890';

      // When/Then: should throw error
      expect(() => parseCaip2(caip)).toThrow('Invalid chain ID in CAIP-2: "0"');
    });

    it('should throw error for invalid chain ID (negative)', () => {
      // Given: CAIP string with negative chain ID
      const caip = 'eip155:-1:0x1234567890123456789012345678901234567890';

      // When/Then: should throw error
      expect(() => parseCaip2(caip)).toThrow('Invalid chain ID in CAIP-2: "-1"');
    });

    it('should throw error for missing address', () => {
      // Given: CAIP string with empty address
      const caip = 'eip155:1:';

      // When/Then: should throw error
      expect(() => parseCaip2(caip)).toThrow('Missing address in CAIP-2');
    });
  });

  describe('parseCaip10', () => {
    it('should parse valid CAIP-10 account ID', () => {
      // Given: valid CAIP-10 string
      const caip = 'eip155:42161:0x9876543210987654321098765432109876543210';

      // When: parsing CAIP-10
      const result = parseCaip10(caip);

      // Then: should return parsed components
      expect(result).toEqual({
        namespace: 'eip155',
        chainId: 42161,
        address: '0x9876543210987654321098765432109876543210',
      });
    });

    it('should delegate to parseCaip2 for validation', () => {
      // Given: invalid CAIP-10 string (unsupported namespace)
      const caip = 'polkadot:1234:5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';

      // When/Then: should throw same error as parseCaip2
      expect(() => parseCaip10(caip)).toThrow('Unsupported namespace');
    });
  });

  describe('isValidCaip2', () => {
    it('should return true for valid CAIP-2 string', () => {
      // Given: valid CAIP-2 string
      const caip = 'eip155:1:0x1234567890123456789012345678901234567890';

      // When: validating CAIP-2
      const result = isValidCaip2(caip);

      // Then: should return true
      expect(result).toBe(true);
    });

    it('should return true for valid CAIP-2 with high chain ID', () => {
      // Given: valid CAIP-2 string with Arbitrum
      const caip = 'eip155:42161:0xabcdef0123456789abcdef0123456789abcdef01';

      // When: validating CAIP-2
      const result = isValidCaip2(caip);

      // Then: should return true
      expect(result).toBe(true);
    });

    it('should return false for invalid format', () => {
      // Given: invalid CAIP-2 string (too few parts)
      const caip = 'eip155:1';

      // When: validating CAIP-2
      const result = isValidCaip2(caip);

      // Then: should return false
      expect(result).toBe(false);
    });

    it('should return false for unsupported namespace', () => {
      // Given: CAIP-2 string with unsupported namespace
      const caip = 'cosmos:cosmoshub-4:cosmos1abcd1234';

      // When: validating CAIP-2
      const result = isValidCaip2(caip);

      // Then: should return false
      expect(result).toBe(false);
    });

    it('should return false for invalid chain ID', () => {
      // Given: CAIP-2 string with invalid chain ID
      const caip = 'eip155:invalid:0x1234567890123456789012345678901234567890';

      // When: validating CAIP-2
      const result = isValidCaip2(caip);

      // Then: should return false
      expect(result).toBe(false);
    });

    it('should return false for empty string', () => {
      // Given: empty string
      const caip = '';

      // When: validating CAIP-2
      const result = isValidCaip2(caip);

      // Then: should return false
      expect(result).toBe(false);
    });
  });

  describe('isValidCaip10', () => {
    it('should return true for valid CAIP-10 string', () => {
      // Given: valid CAIP-10 string
      const caip = 'eip155:42161:0x9876543210987654321098765432109876543210';

      // When: validating CAIP-10
      const result = isValidCaip10(caip);

      // Then: should return true
      expect(result).toBe(true);
    });

    it('should return false for invalid CAIP-10 string', () => {
      // Given: invalid CAIP-10 string
      const caip = 'invalid:format';

      // When: validating CAIP-10
      const result = isValidCaip10(caip);

      // Then: should return false
      expect(result).toBe(false);
    });

    it('should delegate to isValidCaip2', () => {
      // Given: various CAIP strings
      const validCaip = 'eip155:1:0x1234567890123456789012345678901234567890';
      const invalidCaip = 'eip155:0:0x1234567890123456789012345678901234567890';

      // When: validating
      const validResult = isValidCaip10(validCaip);
      const invalidResult = isValidCaip10(invalidCaip);

      // Then: should behave same as isValidCaip2
      expect(validResult).toBe(true);
      expect(invalidResult).toBe(false);
    });
  });
});

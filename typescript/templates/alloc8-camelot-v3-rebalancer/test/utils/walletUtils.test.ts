/**
 * Tests for wallet utility functions
 */

import { describe, it, expect } from 'vitest';
import { getWalletAddressFromPrivateKey } from '../../src/utils/walletUtils.js';

describe('Wallet Utils', () => {
  describe('getWalletAddressFromPrivateKey', () => {
    it('should throw error for invalid private key length', () => {
      const privateKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcde'; // 65 chars

      expect(() => getWalletAddressFromPrivateKey(privateKey)).toThrow(
        'Invalid private key length: expected 66 characters (including 0x), got 65'
      );
    });

    it('should throw error for private key without 0x prefix and wrong length', () => {
      const privateKey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcde'; // 64 chars

      expect(() => getWalletAddressFromPrivateKey(privateKey)).toThrow(
        'Invalid private key length: expected 66 characters (including 0x), got 65'
      );
    });

    it('should throw error for invalid hex format', () => {
      const privateKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeg'; // invalid hex

      expect(() => getWalletAddressFromPrivateKey(privateKey)).toThrow(
        'Invalid private key format: must be 64 hex characters with 0x prefix'
      );
    });

    it('should throw error for private key with invalid characters', () => {
      const privateKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeg'; // invalid hex

      expect(() => getWalletAddressFromPrivateKey(privateKey)).toThrow(
        'Invalid private key format: must be 64 hex characters with 0x prefix'
      );
    });

    it('should handle empty string', () => {
      expect(() => getWalletAddressFromPrivateKey('')).toThrow(
        'Invalid private key length: expected 66 characters (including 0x), got 2'
      );
    });

    it('should handle null or undefined input', () => {
      expect(() => getWalletAddressFromPrivateKey(null as any)).toThrow();
      expect(() => getWalletAddressFromPrivateKey(undefined as any)).toThrow();
    });

    it('should add 0x prefix if missing', () => {
      // This test will fail if the function doesn't handle the prefix correctly
      // but we can't easily test the success case without mocking viem
      const privateKey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      // The function should not throw for this case (it adds the prefix)
      expect(() => getWalletAddressFromPrivateKey(privateKey)).not.toThrow();
    });
  });
});

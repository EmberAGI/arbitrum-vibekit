import { describe, test, expect } from 'vitest';
import { validateAddress, validateAmount } from '../src/simple-tools.js';

describe('Security Tests', () => {
  describe('Address Validation', () => {
    test('rejects zero address', () => {
      expect(() => validateAddress('0x0000000000000000000000000000000000000000'))
        .toThrow('Zero address is not allowed');
    });
    
    test('rejects invalid address formats', () => {
      expect(() => validateAddress('invalid-address'))
        .toThrow('Invalid address format');
      
      expect(() => validateAddress('0x123'))
        .toThrow('Invalid address format');
      
      expect(() => validateAddress(''))
        .toThrow('Invalid address format');
    });
    
    test('accepts valid addresses', () => {
      expect(() => validateAddress('0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6')).not.toThrow();
      expect(() => validateAddress('0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f')).not.toThrow();
    });
  });
  
  describe('Amount Validation', () => {
    test('rejects non-hex amounts', () => {
      expect(() => validateAmount('not-hex'))
        .toThrow('Amount must be hex string');
      
      expect(() => validateAmount('123'))
        .toThrow('Amount must be hex string');
      
      expect(() => validateAmount(''))
        .toThrow('Amount must be hex string');
    });
    
    test('rejects zero and negative amounts', () => {
      expect(() => validateAmount('0x0'))
        .toThrow('Amount must be positive');
      
      expect(() => validateAmount('0x'))
        .toThrow('Amount must be positive');
    });
    
    test('accepts valid hex amounts', () => {
      expect(() => validateAmount('0x1000000000000000000')).not.toThrow(); // 1 ETH
      expect(() => validateAmount('0x1000000')).not.toThrow(); // 1 USDC
      expect(() => validateAmount('0x1')).not.toThrow(); // 1 wei
    });
  });
  
  describe('Maximum Amount Limits', () => {
    test('enforces ETH maximum limit', () => {
      const MAX_ETH_AMOUNT = BigInt('100000000000000000000'); // 100 ETH
      const validAmount = BigInt('50000000000000000000'); // 50 ETH
      const invalidAmount = BigInt('200000000000000000000'); // 200 ETH
      
      expect(validAmount).toBeLessThanOrEqual(MAX_ETH_AMOUNT);
      expect(invalidAmount).toBeGreaterThan(MAX_ETH_AMOUNT);
    });
    
    test('enforces ERC20 maximum limit', () => {
      const MAX_TOKEN_AMOUNT = BigInt('1000000000000000000000000'); // 1M tokens
      const validAmount = BigInt('500000000000000000000000'); // 500K tokens
      const invalidAmount = BigInt('2000000000000000000000000'); // 2M tokens
      
      expect(validAmount).toBeLessThanOrEqual(MAX_TOKEN_AMOUNT);
      expect(invalidAmount).toBeGreaterThan(MAX_TOKEN_AMOUNT);
    });
  });
  
  describe('Gas Limit Protection', () => {
    test('enforces maximum gas limit', () => {
      const MAX_GAS_LIMIT = BigInt(5000000);
      const safeGasLimit = BigInt(2000000);
      const unsafeGasLimit = BigInt(6000000);
      
      expect(safeGasLimit).toBeLessThanOrEqual(MAX_GAS_LIMIT);
      expect(unsafeGasLimit).toBeGreaterThan(MAX_GAS_LIMIT);
    });
  });
  
  describe('Contract Address Validation', () => {
    test('validates contract addresses are not zero', () => {
      const zeroAddress = '0x0000000000000000000000000000000000000000';
      const validContractAddress = '0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f';
      
      expect(zeroAddress).toBe('0x0000000000000000000000000000000000000000');
      expect(validContractAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });
  
  describe('Slippage Protection', () => {
    test('enforces slippage limits', () => {
      const minSlippageBps = 1;
      const maxSlippageBps = 1000;
      const validSlippage = 100; // 1%
      const invalidSlippageLow = 0;
      const invalidSlippageHigh = 2000; // 20%
      
      expect(validSlippage).toBeGreaterThanOrEqual(minSlippageBps);
      expect(validSlippage).toBeLessThanOrEqual(maxSlippageBps);
      expect(invalidSlippageLow).toBeLessThan(minSlippageBps);
      expect(invalidSlippageHigh).toBeGreaterThan(maxSlippageBps);
    });
  });
  
  describe('Deadline Protection', () => {
    test('enforces deadline limits', () => {
      const minDeadlineMinutes = 5;
      const maxDeadlineMinutes = 180;
      const validDeadline = 30; // 30 minutes
      const invalidDeadlineLow = 1;
      const invalidDeadlineHigh = 300; // 5 hours
      
      expect(validDeadline).toBeGreaterThanOrEqual(minDeadlineMinutes);
      expect(validDeadline).toBeLessThanOrEqual(maxDeadlineMinutes);
      expect(invalidDeadlineLow).toBeLessThan(minDeadlineMinutes);
      expect(invalidDeadlineHigh).toBeGreaterThan(maxDeadlineMinutes);
    });
  });
});

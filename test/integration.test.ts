import { describe, test, expect } from 'vitest';
import { tools } from '../src/simple-tools.js';

describe('Integration Tests', () => {
  describe('Bridge Intent Processing', () => {
    test('processes ETH bridge intent correctly', async () => {
      const intent = "Bridge 1 ETH from Ethereum to Arbitrum";
      const result = await tools.processBridgeIntent.execute({
        intent,
        userAddress: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
        maxSlippageBps: 100,
        maxDeadlineMinutes: 30
      });
      
      expect(result.parsed.amount).toBe('1000000000000000000'); // 1 ETH in wei
      expect(result.parsed.token).toBe('ETH');
      expect(result.parsed.fromChain).toBe(1); // Ethereum
      expect(result.parsed.toChain).toBe(42161); // Arbitrum
    });
    
    test('processes USDC bridge intent correctly', async () => {
      const intent = "Bridge 100 USDC to Arbitrum";
      const result = await tools.processBridgeIntent.execute({
        intent,
        userAddress: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
        maxSlippageBps: 100,
        maxDeadlineMinutes: 30
      });
      
      expect(result.parsed.amount).toBe('100000000'); // 100 USDC (6 decimals)
      expect(result.parsed.token).toBe('USDC');
      expect(result.parsed.fromChain).toBe(1); // Ethereum
      expect(result.parsed.toChain).toBe(42161); // Arbitrum
    });
    
    test('processes reverse bridge intent correctly', async () => {
      const intent = "Bridge 0.5 ETH from Arbitrum to Ethereum";
      const result = await tools.processBridgeIntent.execute({
        intent,
        userAddress: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
        maxSlippageBps: 100,
        maxDeadlineMinutes: 30
      });
      
      expect(result.parsed.amount).toBe('500000000000000000'); // 0.5 ETH in wei
      expect(result.parsed.token).toBe('ETH');
      expect(result.parsed.fromChain).toBe(42161); // Arbitrum
      expect(result.parsed.toChain).toBe(1); // Ethereum
    });
  });
  
  describe('Transaction Generation', () => {
    test('generates valid ETH bridge transaction', async () => {
      const result = await tools.generateBridgeTransaction.execute({
        amount: '0x1000000000000000000', // 1 ETH
        recipient: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
        userAddress: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
        slippageBps: 100,
        deadlineMinutes: 30
      });
      
      expect(result.transaction).toHaveProperty('to');
      expect(result.transaction).toHaveProperty('data');
      expect(result.transaction).toHaveProperty('value');
      expect(result.transaction.data).toHaveProperty('abi');
      expect(result.transaction.data).toHaveProperty('functionName');
      expect(result.transaction.data).toHaveProperty('args');
      expect(result.chainId).toBe(1);
      expect(result.bridgeType).toBe('eth_to_arbitrum');
    });
    
    test('generates valid ERC20 bridge transaction', async () => {
      const result = await tools.bridgeErc20ToArbitrum.execute({
        tokenAddress: '0xa0b86a33e6441b8c4c8c0c4c0c4c0c4c0c4c0c4',
        amount: '0x1000000', // 1 token (6 decimals)
        recipient: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
        userAddress: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
        slippageBps: 100,
        deadlineMinutes: 30
      });
      
      expect(result.transaction).toHaveProperty('to');
      expect(result.transaction).toHaveProperty('data');
      expect(result.transaction).toHaveProperty('value');
      expect(result.chainId).toBe(1);
      expect(result.bridgeType).toBe('erc20_to_arbitrum');
      expect(result.tokenAddress).toBe('0xa0b86a33e6441b8c4c8c0c4c0c4c0c4c0c4c0c4');
    });
  });
  
  describe('Validation Tools', () => {
    test('validates bridge feasibility', async () => {
      const result = await tools.validateBridgeFeasibility.execute({
        amount: '0x1000000000000000000', // 1 ETH
        recipient: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
        userAddress: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
        slippageBps: 100,
        deadlineMinutes: 30
      });
      
      expect(result).toHaveProperty('feasible');
      expect(result).toHaveProperty('estimatedCost');
      expect(result).toHaveProperty('estimatedGas');
      expect(result).toHaveProperty('minAmount');
      expect(result).toHaveProperty('deadline');
      expect(result).toHaveProperty('slippageBps');
    });
  });
  
  describe('Gas Estimation', () => {
    test('estimates gas for ETH bridge', async () => {
      const result = await tools.estimateBridgeGas.execute({
        fromChain: 'ethereum',
        toChain: 'arbitrum',
        tokenAddress: '0x0000000000000000000000000000000000000000', // ETH
        amount: '0x1000000000000000000'
      });
      
      expect(result).toHaveProperty('estimatedGas');
      expect(result).toHaveProperty('gasPrice');
      expect(result).toHaveProperty('estimatedCost');
      expect(result.chainId).toBe(1);
    });
    
    test('estimates gas for ERC20 bridge', async () => {
      const result = await tools.estimateBridgeGas.execute({
        fromChain: 'ethereum',
        toChain: 'arbitrum',
        tokenAddress: '0xa0b86a33e6441b8c4c8c0c4c0c4c0c4c0c4c0c4',
        amount: '0x1000000'
      });
      
      expect(result).toHaveProperty('estimatedGas');
      expect(result).toHaveProperty('gasPrice');
      expect(result).toHaveProperty('estimatedCost');
      expect(result.chainId).toBe(1);
    });
  });
});

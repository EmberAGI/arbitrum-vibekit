import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionExecutor } from '../../src/utils/transactionExecutor.js';
import type { TransactionPlan } from 'ember-schemas';

// Mock viem modules
vi.mock('viem', () => ({
  createPublicClient: vi.fn(),
  createWalletClient: vi.fn(),
  http: vi.fn(),
  isHex: vi.fn(),
  hexToString: vi.fn(),
  BaseError: class BaseError extends Error {
    shortMessage: string;
    details?: string;
    constructor(message: string, options?: { shortMessage?: string; details?: string }) {
      super(message);
      this.shortMessage = options?.shortMessage || message;
      this.details = options?.details;
    }
    walk(fn: (e: unknown) => boolean) {
      return fn(this) ? this : null;
    }
  },
  ContractFunctionRevertedError: class ContractFunctionRevertedError extends Error {
    reason?: string;
    shortMessage: string;
    data?: { errorName?: string; args?: string[] };
    constructor(message: string, options?: { reason?: string; shortMessage?: string; data?: any }) {
      super(message);
      this.reason = options?.reason;
      this.shortMessage = options?.shortMessage || message;
      this.data = options?.data;
    }
  },
  arbitrum: { id: 42161, name: 'Arbitrum One' },
}));

describe('Transaction Executor', () => {
  let mockAccount: any;
  let mockPublicClient: any;
  let mockWalletClient: any;
  let transactionExecutor: TransactionExecutor;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Mock console methods to avoid noise in test output
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mockAccount = {
      address: '0x1234567890123456789012345678901234567890',
      signTransaction: vi.fn(),
      signMessage: vi.fn()
    };

    mockPublicClient = {
      waitForTransactionReceipt: vi.fn()
    };

    mockWalletClient = {
      sendTransaction: vi.fn()
    };

    // Setup viem mocks
    const { createPublicClient, createWalletClient, isHex } = vi.mocked(await import('viem'));
    createPublicClient.mockReturnValue(mockPublicClient);
    createWalletClient.mockReturnValue(mockWalletClient);
    isHex.mockImplementation((value: string) => value.startsWith('0x') && value.length > 2);

    transactionExecutor = new TransactionExecutor(
      mockAccount,
      '0x1234567890123456789012345678901234567890',
      'test-subdomain',
      'test-api-key'
    );
  });

  describe('Constructor', () => {
    it('should create transaction executor with correct parameters', () => {
      expect(transactionExecutor).toBeInstanceOf(TransactionExecutor);
    });
  });

  describe('executeTransactions', () => {
    it('should handle empty transaction array', async () => {
      const result = await transactionExecutor.executeTransactions('test-action', []);
      
      expect(result).toBe('Test-action: No on-chain transactions required.');
    });

    it('should execute single transaction successfully', async () => {
      const mockTransaction: TransactionPlan = {
        type: 'EVM_TX',
        chainId: '42161',
        to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        data: '0x095ea7b3000000000000000000000000794a61358d6845594f94dc1db02a252b5b4814ad0000000000000000000000000000000000000000000000000de0b6b3a7640000',
        value: '0'
      };

      const mockTxHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const mockReceipt = {
        status: 'success',
        blockNumber: 12345n,
        transactionHash: mockTxHash
      };

      mockWalletClient.sendTransaction.mockResolvedValue(mockTxHash);
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue(mockReceipt);

      const result = await transactionExecutor.executeTransactions('supply-collateral', [mockTransaction]);

      expect(mockWalletClient.sendTransaction).toHaveBeenCalledWith({
        to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        value: 0n,
        data: '0x095ea7b3000000000000000000000000794a61358d6845594f94dc1db02a252b5b4814ad0000000000000000000000000000000000000000000000000de0b6b3a7640000'
      });

      expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
        hash: mockTxHash
      });

      expect(result).toContain('Supply-collateral successful!');
      expect(result).toContain(mockTxHash);
    });

    it('should execute multiple transactions successfully', async () => {
      const mockTransactions: TransactionPlan[] = [
        {
          type: 'EVM_TX',
          chainId: '42161',
          to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
          data: '0x095ea7b3000000000000000000000000794a61358d6845594f94dc1db02a252b5b4814ad0000000000000000000000000000000000000000000000000de0b6b3a7640000',
          value: '0'
        },
        {
          type: 'EVM_TX',
          chainId: '42161',
          to: '0xA0b86a33E6411B3FCd9Ac3C10e9C8f7a8074f74C',
          data: '0xa22cb46500000000000000000000000094dc6e84e4ead8d9e8e5dd5b0a4b6b3f7a4b1b1b0000000000000000000000000000000000000000000000000000000000000001',
          value: '0'
        }
      ];

      const mockTxHashes = [
        '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      ];

      const mockReceipts = mockTxHashes.map((hash, index) => ({
        status: 'success',
        blockNumber: BigInt(12345 + index),
        transactionHash: hash
      }));

      mockWalletClient.sendTransaction
        .mockResolvedValueOnce(mockTxHashes[0])
        .mockResolvedValueOnce(mockTxHashes[1]);
      
      mockPublicClient.waitForTransactionReceipt
        .mockResolvedValueOnce(mockReceipts[0])
        .mockResolvedValueOnce(mockReceipts[1]);

      const result = await transactionExecutor.executeTransactions('multi-step-action', mockTransactions);

      expect(mockWalletClient.sendTransaction).toHaveBeenCalledTimes(2);
      expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledTimes(2);
      expect(result).toContain('Multi-step-action successful!');
      expect(result).toContain(mockTxHashes[0]);
      expect(result).toContain(mockTxHashes[1]);
    });

    it('should handle transaction with value', async () => {
      const mockTransaction: TransactionPlan = {
        type: 'EVM_TX',
        chainId: '42161',
        to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        data: '0x095ea7b3000000000000000000000000794a61358d6845594f94dc1db02a252b5b4814ad0000000000000000000000000000000000000000000000000de0b6b3a7640000',
        value: '1000000000000000000' // 1 ETH in wei
      };

      const mockTxHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const mockReceipt = {
        status: 'success',
        blockNumber: 12345n,
        transactionHash: mockTxHash
      };

      mockWalletClient.sendTransaction.mockResolvedValue(mockTxHash);
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue(mockReceipt);

      const result = await transactionExecutor.executeTransactions('pay-with-eth', [mockTransaction]);

      expect(mockWalletClient.sendTransaction).toHaveBeenCalledWith({
        to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        value: BigInt('1000000000000000000'),
        data: '0x095ea7b3000000000000000000000000794a61358d6845594f94dc1db02a252b5b4814ad0000000000000000000000000000000000000000000000000de0b6b3a7640000'
      });

      expect(result).toContain('Pay-with-eth successful!');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing chainId', async () => {
      const invalidTransaction: TransactionPlan = {
        type: 'EVM_TX',
        to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        data: '0x095ea7b3000000000000000000000000794a61358d6845594f94dc1db02a252b5b4814ad0000000000000000000000000000000000000000000000000de0b6b3a7640000',
      } as any; // Missing chainId

      await expect(transactionExecutor.executeTransactions('invalid-action', [invalidTransaction]))
        .rejects.toThrow("Transaction object missing required 'chainId' field");
    });

    it('should handle unsupported chainId', async () => {
      const invalidTransaction: TransactionPlan = {
        type: 'EVM_TX',
        chainId: '999', // Unsupported chain
        to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        data: '0x095ea7b3000000000000000000000000794a61358d6845594f94dc1db02a252b5b4814ad0000000000000000000000000000000000000000000000000de0b6b3a7640000',
        value: '0'
      };

      await expect(transactionExecutor.executeTransactions('unsupported-chain', [invalidTransaction]))
        .rejects.toThrow('Unsupported chainId: 999. Currently only Arbitrum (42161) is supported.');
    });

    it('should handle invalid to address', async () => {
      const invalidTransaction: TransactionPlan = {
        type: 'EVM_TX',
        chainId: '42161',
        to: 'invalid-address',
        data: '0x095ea7b3000000000000000000000000794a61358d6845594f94dc1db02a252b5b4814ad0000000000000000000000000000000000000000000000000de0b6b3a7640000',
        value: '0'
      };

      await expect(transactionExecutor.executeTransactions('invalid-to', [invalidTransaction]))
        .rejects.toThrow("Transaction object invalid 'to' field: invalid-address");
    });

    it('should handle invalid data field', async () => {
      const { isHex } = vi.mocked(await import('viem'));
      isHex.mockReturnValue(false); // Make isHex return false for invalid data

      const invalidTransaction: TransactionPlan = {
        type: 'EVM_TX',
        chainId: '42161',
        to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        data: 'invalid-hex-data',
        value: '0'
      };

      await expect(transactionExecutor.executeTransactions('invalid-data', [invalidTransaction]))
        .rejects.toThrow("Transaction object invalid 'data' field (not hex): invalid-hex-data");
    });

    it('should handle reverted transactions', async () => {
      const mockTransaction: TransactionPlan = {
        type: 'EVM_TX',
        chainId: '42161',
        to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        data: '0x095ea7b3000000000000000000000000794a61358d6845594f94dc1db02a252b5b4814ad0000000000000000000000000000000000000000000000000de0b6b3a7640000',
        value: '0'
      };

      const mockTxHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const mockRevertedReceipt = {
        status: 'reverted',
        blockNumber: 12345n,
        transactionHash: mockTxHash
      };

      mockWalletClient.sendTransaction.mockResolvedValue(mockTxHash);
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue(mockRevertedReceipt);

      await expect(transactionExecutor.executeTransactions('reverted-action', [mockTransaction]))
        .rejects.toThrow(`Transaction ${mockTxHash} failed (reverted). Check blockchain explorer for details.`);
    });

    it('should handle wallet client send transaction errors', async () => {
      const mockTransaction: TransactionPlan = {
        type: 'EVM_TX',
        chainId: '42161',
        to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        data: '0x095ea7b3000000000000000000000000794a61358d6845594f94dc1db02a252b5b4814ad0000000000000000000000000000000000000000000000000de0b6b3a7640000',
        value: '0'
      };

      mockWalletClient.sendTransaction.mockRejectedValue(new Error('Insufficient funds'));

      await expect(transactionExecutor.executeTransactions('insufficient-funds', [mockTransaction]))
        .rejects.toThrow('Error executing insufficient-funds: Transaction failed: Insufficient funds');
    });

    it('should handle ContractFunctionRevertedError with reason', async () => {
      const mockTransaction: TransactionPlan = {
        type: 'EVM_TX',
        chainId: '42161',
        to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        data: '0x095ea7b3000000000000000000000000794a61358d6845594f94dc1db02a252b5b4814ad0000000000000000000000000000000000000000000000000de0b6b3a7640000',
        value: '0'
      };

      const { BaseError, ContractFunctionRevertedError } = await import('viem');
      const contractError = new ContractFunctionRevertedError('Contract reverted', {
        reason: 'ERC20: insufficient allowance',
        shortMessage: 'Contract execution reverted'
      });
      
      // Create a BaseError that contains the ContractFunctionRevertedError
      const baseError = new BaseError('Transaction failed', { shortMessage: 'Transaction reverted' });
      baseError.walk = vi.fn().mockReturnValue(contractError);

      mockWalletClient.sendTransaction.mockRejectedValue(baseError);

      await expect(transactionExecutor.executeTransactions('contract-error', [mockTransaction]))
        .rejects.toThrow('Error executing contract-error: Transaction reverted: ERC20: insufficient allowance');
    });

    it('should handle BaseError without ContractFunctionRevertedError', async () => {
      const mockTransaction: TransactionPlan = {
        type: 'EVM_TX',
        chainId: '42161',
        to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        data: '0x095ea7b3000000000000000000000000794a61358d6845594f94dc1db02a252b5b4814ad0000000000000000000000000000000000000000000000000de0b6b3a7640000',
        value: '0'
      };

      const { BaseError } = await import('viem');
      const baseError = new BaseError('Transaction failed', { 
        shortMessage: 'Gas estimation failed',
        details: 'Gas limit exceeded'
      });
      baseError.walk = vi.fn().mockReturnValue(null);

      mockWalletClient.sendTransaction.mockRejectedValue(baseError);

      await expect(transactionExecutor.executeTransactions('gas-error', [mockTransaction]))
        .rejects.toThrow('Error executing gas-error: Transaction failed: Gas estimation failed');
    });

    it('should handle hex reason decoding', async () => {
      const mockTransaction: TransactionPlan = {
        type: 'EVM_TX',
        chainId: '42161',
        to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        data: '0x095ea7b3000000000000000000000000794a61358d6845594f94dc1db02a252b5b4814ad0000000000000000000000000000000000000000000000000de0b6b3a7640000',
        value: '0'
      };

      const { BaseError, ContractFunctionRevertedError, hexToString, isHex } = vi.mocked(await import('viem'));
      
      const contractError = new ContractFunctionRevertedError('Contract reverted', {
        data: {
          errorName: '_decodeRevertReason',
          args: ['0x4572726f723a20496e73756666696369656e742066756e6473'] // "Error: Insufficient funds" in hex
        }
      });
      
      const baseError = new BaseError('Transaction failed');
      baseError.walk = vi.fn().mockReturnValue(contractError);

      isHex.mockReturnValue(true);
      hexToString.mockReturnValue('Error: Insufficient funds');

      mockWalletClient.sendTransaction.mockRejectedValue(baseError);

      await expect(transactionExecutor.executeTransactions('hex-decode', [mockTransaction]))
        .rejects.toThrow('Error executing hex-decode: Transaction reverted: Error: Insufficient funds');
    });
  });

  describe('Chain Configuration', () => {
    it('should create clients and execute transactions correctly', async () => {
      const mockTransaction: TransactionPlan = {
        type: 'EVM_TX',
        chainId: '42161',
        to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        data: '0x095ea7b3000000000000000000000000794a61358d6845594f94dc1db02a252b5b4814ad0000000000000000000000000000000000000000000000000de0b6b3a7640000',
        value: '0'
      };

      const mockTxHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const mockReceipt = {
        status: 'success',
        blockNumber: 12345n,
        transactionHash: mockTxHash
      };

      mockWalletClient.sendTransaction.mockResolvedValue(mockTxHash);
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue(mockReceipt);

      const { createPublicClient, createWalletClient, http } = vi.mocked(await import('viem'));

      const result = await transactionExecutor.executeTransactions('arbitrum-test', [mockTransaction]);

      // Verify the HTTP function was called with correct URL
      expect(http).toHaveBeenCalledWith('https://test-subdomain.arbitrum-mainnet.quiknode.pro/test-api-key');
      
      // Verify clients were created
      expect(createPublicClient).toHaveBeenCalled();
      expect(createWalletClient).toHaveBeenCalled();
      
      // Verify transaction was executed successfully
      expect(result).toContain('Arbitrum-test successful!');
      expect(result).toContain(mockTxHash);
    });
  });
});
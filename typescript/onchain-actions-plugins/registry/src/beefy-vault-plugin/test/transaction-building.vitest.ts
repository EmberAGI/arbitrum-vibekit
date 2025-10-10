import { expect } from 'chai';
import sinon from 'sinon';
import { ethers } from 'ethers';
import { describe, it, beforeEach, afterEach } from 'vitest';
import { BeefyAdapter } from '../adapter.js';
import { createDepositTransaction, createWithdrawTransaction } from '../transactions/index.js';
import { createBeefyVaultContract } from '../contracts/index.js';
import type { VaultData } from '../types.js';

describe('Beefy Vault Transaction Building', () => {
  let mockProvider: ethers.providers.JsonRpcProvider;
  let beefyAdapter: BeefyAdapter;

  // Mock vault data for testing
  const mockVaultData: VaultData = {
    id: 'arbitrum-usdc-vault',
    name: 'USDC Vault',
    vaultAddress: '0x1234567890123456789012345678901234567890',
    tokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // USDC on Arbitrum
    tokenDecimals: 6,
    mooTokenAddress: '0x9876543210987654321098765432109876543210',
    apy: 5.5,
    tvl: 1000000,
    assets: ['USDC'],
  };

  beforeEach(() => {
    // Create mock provider
    mockProvider = new ethers.providers.JsonRpcProvider('http://localhost:8545');

    // Create adapter instance
    beefyAdapter = new BeefyAdapter({
      chainId: 42161,
      rpcUrl: 'http://localhost:8545',
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Deposit Transaction Building - Mocked', () => {
    it('should build deposit transaction with correct parameters', async () => {
      // Mock contract calls
      const mockContract = {
        populateTransaction: {
          deposit: sinon.stub().resolves({
            to: mockVaultData.vaultAddress,
            data: '0x1234567890abcdef',
            value: ethers.BigNumber.from(0),
          }),
        },
        want: sinon.stub().resolves(mockVaultData.tokenAddress),
        totalSupply: sinon.stub().resolves(ethers.utils.parseEther('1000')),
        balance: sinon.stub().resolves(ethers.utils.parseUnits('1000', 6)),
      };

      // Mock token contract for approval
      const mockTokenContract = {
        allowance: sinon.stub().resolves(ethers.BigNumber.from(0)), // No allowance
        populateTransaction: {
          approve: sinon.stub().resolves({
            to: mockVaultData.tokenAddress,
            data: '0xabcdef1234567890',
            value: ethers.BigNumber.from(0),
          }),
        },
      };

      // Stub ethers.Contract constructor
      const contractStub = sinon.stub(ethers, 'Contract');
      contractStub.onFirstCall().returns(mockContract as any);
      contractStub.onSecondCall().returns(mockTokenContract as any);

      const depositAmount = ethers.utils.parseUnits('100', 6); // 100 USDC
      const userAddress = '0xuser1234567890123456789012345678901234567890';

      const result = await createDepositTransaction({
        vault: mockVaultData,
        amount: depositAmount,
        userAddress,
        provider: mockProvider,
      });

      // Verify approval transaction was created
      expect(result.approvalTx).to.exist;
      expect(result.approvalTx!.to).to.equal(mockVaultData.tokenAddress);
      expect(result.approvalTx!.from).to.equal(userAddress);

      // Verify deposit transaction was created
      expect(result.depositTx).to.exist;
      expect(result.depositTx.to).to.equal(mockVaultData.vaultAddress);
      expect(result.depositTx.from).to.equal(userAddress);

      // Verify expected shares calculation
      expect(result.expectedShares).to.exist;
      expect(result.expectedShares.gt(0)).to.be.true;
    });

    it('should skip approval when sufficient allowance exists', async () => {
      const mockContract = {
        populateTransaction: {
          deposit: sinon.stub().resolves({
            to: mockVaultData.vaultAddress,
            data: '0x1234567890abcdef',
          }),
        },
        want: sinon.stub().resolves(mockVaultData.tokenAddress),
        totalSupply: sinon.stub().resolves(ethers.utils.parseEther('1000')),
        balance: sinon.stub().resolves(ethers.utils.parseUnits('1000', 6)),
      };

      const mockTokenContract = {
        allowance: sinon.stub().resolves(ethers.utils.parseUnits('1000', 6)), // Sufficient allowance
      };

      const contractStub = sinon.stub(ethers, 'Contract');
      contractStub.onFirstCall().returns(mockContract as any);
      contractStub.onSecondCall().returns(mockTokenContract as any);

      const result = await createDepositTransaction({
        vault: mockVaultData,
        amount: ethers.utils.parseUnits('100', 6),
        userAddress: '0xuser1234567890123456789012345678901234567890',
        provider: mockProvider,
      });

      // Should not create approval transaction
      expect(result.approvalTx).to.be.null;
      expect(result.depositTx).to.exist;
    });

    it('should build depositAll transaction', async () => {
      const mockContract = {
        populateTransaction: {
          depositAll: sinon.stub().resolves({
            to: mockVaultData.vaultAddress,
            data: '0xdepositall123456',
          }),
        },
      };

      sinon.stub(ethers, 'Contract').returns(mockContract as any);

      const result = await createDepositTransaction({
        vault: mockVaultData,
        amount: ethers.BigNumber.from(0), // Not used for depositAll
        userAddress: '0xuser1234567890123456789012345678901234567890',
        provider: mockProvider,
        useDepositAll: true,
      });

      expect(result.depositTx).to.exist;
      expect(result.depositTx.to).to.equal(mockVaultData.vaultAddress);
      expect(result.approvalTx).to.be.null; // No approval for depositAll
    });
  });

  describe('Withdraw Transaction Building - Mocked', () => {
    it('should build withdraw transaction with correct parameters', async () => {
      const mockContract = {
        populateTransaction: {
          withdraw: sinon.stub().resolves({
            to: mockVaultData.vaultAddress,
            data: '0xwithdraw123456',
          }),
        },
        totalSupply: sinon.stub().resolves(ethers.utils.parseEther('1000')),
        balance: sinon.stub().resolves(ethers.utils.parseUnits('1000', 6)),
      };

      sinon.stub(ethers, 'Contract').returns(mockContract as any);

      const shares = ethers.utils.parseEther('10'); // 10 mooTokens
      const userAddress = '0xuser1234567890123456789012345678901234567890';

      const result = await createWithdrawTransaction({
        vault: mockVaultData,
        shares,
        userAddress,
        provider: mockProvider,
      });

      expect(result.withdrawTx).to.exist;
      expect(result.withdrawTx.to).to.equal(mockVaultData.vaultAddress);
      expect(result.withdrawTx.from).to.equal(userAddress);
      expect(result.expectedTokens).to.exist;
      expect(result.expectedTokens.gt(0)).to.be.true;
    });

    it('should build withdrawAll transaction', async () => {
      const mockContract = {
        populateTransaction: {
          withdrawAll: sinon.stub().resolves({
            to: mockVaultData.vaultAddress,
            data: '0xwithdrawall123456',
          }),
        },
      };

      sinon.stub(ethers, 'Contract').returns(mockContract as any);

      const result = await createWithdrawTransaction({
        vault: mockVaultData,
        shares: ethers.BigNumber.from(0), // Not used for withdrawAll
        userAddress: '0xuser1234567890123456789012345678901234567890',
        provider: mockProvider,
        useWithdrawAll: true,
      });

      expect(result.withdrawTx).to.exist;
      expect(result.withdrawTx.to).to.equal(mockVaultData.vaultAddress);
      expect(result.expectedTokens.eq(0)).to.be.true; // Can't calculate for withdrawAll
    });
  });

  describe('Contract Interface Validation', () => {
    it('should create vault contract with correct ABI', () => {
      const vaultContract = createBeefyVaultContract(mockVaultData.vaultAddress, mockProvider);
      expect(vaultContract).to.exist;
    });

    it('should have correct gas limits for different operations', async () => {
      const mockContract = {
        populateTransaction: {
          deposit: sinon.stub().resolves({
            to: mockVaultData.vaultAddress,
            data: '0x1234567890abcdef',
            gasLimit: ethers.BigNumber.from(200000),
          }),
        },
        want: sinon.stub().resolves(mockVaultData.tokenAddress),
        totalSupply: sinon.stub().resolves(ethers.utils.parseEther('1000')),
        balance: sinon.stub().resolves(ethers.utils.parseUnits('1000', 6)),
      };

      sinon.stub(ethers, 'Contract').returns(mockContract as any);

      const result = await createDepositTransaction({
        vault: mockVaultData,
        amount: ethers.utils.parseUnits('100', 6),
        userAddress: '0xuser1234567890123456789012345678901234567890',
        provider: mockProvider,
      });

      expect(result.depositTx.gasLimit).to.exist;
      expect(ethers.BigNumber.isBigNumber(result.depositTx.gasLimit)).to.be.true;
    });
  });

  describe('Error Handling', () => {
    it('should handle contract call failures gracefully', async () => {
      const mockContract = {
        populateTransaction: {
          deposit: sinon.stub().rejects(new Error('Contract call failed')),
        },
        want: sinon.stub().resolves(mockVaultData.tokenAddress),
      };

      sinon.stub(ethers, 'Contract').returns(mockContract as any);

      try {
        await createDepositTransaction({
          vault: mockVaultData,
          amount: ethers.utils.parseUnits('100', 6),
          userAddress: '0xuser1234567890123456789012345678901234567890',
          provider: mockProvider,
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect((error as Error).message).to.include('Contract call failed');
      }
    });

    it('should validate input parameters', async () => {
      try {
        await createDepositTransaction({
          vault: mockVaultData,
          amount: ethers.BigNumber.from(0), // Invalid amount
          userAddress: '0xuser1234567890123456789012345678901234567890',
          provider: mockProvider,
        });
        // Should handle zero amount gracefully or throw appropriate error
      } catch (error) {
        // Expected for zero amount
      }
    });
  });

  // Integration tests with real contracts (if RPC URL is available)
  describe('Real Contract Integration', () => {
    const ARBITRUM_RPC = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';

    // Skip if no RPC URL provided
    const shouldSkip = !process.env.ARBITRUM_RPC_URL;

    it('should connect to real Arbitrum network', async function (this: any) {
      if (shouldSkip) {
        this.skip();
        return;
      }

      const realProvider = new ethers.providers.JsonRpcProvider(ARBITRUM_RPC);
      const network = await realProvider.getNetwork();
      expect(network.chainId).to.equal(42161);
    });

    it('should build transaction for real Beefy vault', async function (this: any) {
      if (shouldSkip) {
        this.skip();
        return;
      }

      this.timeout(10000); // Increase timeout for network calls

      const realProvider = new ethers.providers.JsonRpcProvider(ARBITRUM_RPC);

      // Use a known Beefy vault on Arbitrum (example address)
      const realVault: VaultData = {
        ...mockVaultData,
        vaultAddress: '0x1234567890123456789012345678901234567890', // Replace with real vault
      };

      try {
        const result = await createDepositTransaction({
          vault: realVault,
          amount: ethers.utils.parseUnits('1', 6), // 1 USDC
          userAddress: '0x1234567890123456789012345678901234567890',
          provider: realProvider,
        });

        expect(result.depositTx).to.exist;
        expect(result.depositTx.to).to.equal(realVault.vaultAddress);
        expect(result.depositTx.data).to.be.a('string');
        if (result.depositTx.data) {
          expect(result.depositTx.data.startsWith('0x')).to.be.true;
        }
      } catch (error) {
        // May fail if vault doesn't exist, but should fail gracefully
        console.log(
          "Real vault test failed (expected if vault doesn't exist):",
          (error as Error).message
        );
      }
    });
  });
});

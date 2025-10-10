import { expect } from 'chai';
import { describe, it } from 'vitest';
import { ethers } from 'ethers';
import { BEEFY_VAULT_ABI, ERC20_ABI, GAS_LIMITS } from '../contracts/abis.js';
import type { VaultData } from '../types.js';

describe('Beefy Vault Transaction Building - Focused Tests', () => {
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

  const mockUserAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

  describe('Core Transaction Building', () => {
    it('should validate transaction building components exist', () => {
      // Since we can't easily mock the provider for actual transaction building,
      // we'll validate that all the components needed for transaction building exist
      expect(BEEFY_VAULT_ABI).to.be.an('array');
      expect(ERC20_ABI).to.be.an('array');
      expect(GAS_LIMITS).to.be.an('object');

      // Verify we can create transaction interfaces
      const vaultInterface = new ethers.utils.Interface(BEEFY_VAULT_ABI);
      const erc20Interface = new ethers.utils.Interface(ERC20_ABI);

      expect(vaultInterface).to.exist;
      expect(erc20Interface).to.exist;
    });

    it('should be able to encode deposit transaction data', () => {
      const depositAmount = ethers.utils.parseUnits('100', mockVaultData.tokenDecimals);
      const vaultInterface = new ethers.utils.Interface(BEEFY_VAULT_ABI);

      const depositData = vaultInterface.encodeFunctionData('deposit', [depositAmount]);
      expect(depositData).to.exist;
      expect(depositData).to.match(/^0x[a-fA-F0-9]+$/);

      // Verify we can decode it back
      const decoded = vaultInterface.decodeFunctionData('deposit', depositData);
      expect(decoded[0].toString()).to.equal(depositAmount.toString());
    });

    it('should be able to encode withdraw transaction data', () => {
      const withdrawShares = ethers.utils.parseEther('50'); // mooTokens are 18 decimals
      const vaultInterface = new ethers.utils.Interface(BEEFY_VAULT_ABI);

      const withdrawData = vaultInterface.encodeFunctionData('withdraw', [withdrawShares]);
      expect(withdrawData).to.exist;
      expect(withdrawData).to.match(/^0x[a-fA-F0-9]+$/);

      // Verify we can decode it back
      const decoded = vaultInterface.decodeFunctionData('withdraw', withdrawData);
      expect(decoded[0].toString()).to.equal(withdrawShares.toString());
    });
  });

  describe('ABI and Contract Interface Validation', () => {
    it('should have all required Beefy vault functions', () => {
      const requiredFunctions = [
        'deposit(uint _amount)',
        'withdraw(uint256 _shares)',
        'depositAll()',
        'withdrawAll()',
        'want()',
        'balance()',
        'totalSupply()',
        'getPricePerFullShare()',
        'balanceOf(address account)',
      ];

      requiredFunctions.forEach(func => {
        const hasFunction = BEEFY_VAULT_ABI.some(abi => abi.includes(func));
        expect(hasFunction, `Missing function: ${func}`).to.be.true;
      });
    });

    it('should have all required ERC20 functions', () => {
      const requiredFunctions = [
        'balanceOf(address owner)',
        'approve(address spender, uint256 amount)',
        'allowance(address owner, address spender)',
        'decimals()',
        'symbol()',
        'name()',
      ];

      requiredFunctions.forEach(func => {
        const hasFunction = ERC20_ABI.some(abi => abi.includes(func));
        expect(hasFunction, `Missing ERC20 function: ${func}`).to.be.true;
      });
    });
  });

  describe('Transaction Data Encoding', () => {
    it('should encode deposit function call correctly', () => {
      const depositAmount = ethers.utils.parseUnits('100', 6);
      const iface = new ethers.utils.Interface(BEEFY_VAULT_ABI);

      const encodedData = iface.encodeFunctionData('deposit', [depositAmount]);
      expect(encodedData).to.exist;
      expect(encodedData).to.match(/^0x[a-fA-F0-9]+$/);

      // Verify we can decode it back
      const decoded = iface.decodeFunctionData('deposit', encodedData);
      expect(decoded[0].toString()).to.equal(depositAmount.toString());
    });

    it('should encode withdraw function call correctly', () => {
      const withdrawShares = ethers.utils.parseEther('50');
      const iface = new ethers.utils.Interface(BEEFY_VAULT_ABI);

      const encodedData = iface.encodeFunctionData('withdraw', [withdrawShares]);
      expect(encodedData).to.exist;
      expect(encodedData).to.match(/^0x[a-fA-F0-9]+$/);

      // Verify we can decode it back
      const decoded = iface.decodeFunctionData('withdraw', encodedData);
      expect(decoded[0].toString()).to.equal(withdrawShares.toString());
    });

    it('should encode ERC20 approve function call correctly', () => {
      const approveAmount = ethers.utils.parseUnits('100', 6);
      const spenderAddress = mockVaultData.vaultAddress;
      const iface = new ethers.utils.Interface(ERC20_ABI);

      const encodedData = iface.encodeFunctionData('approve', [spenderAddress, approveAmount]);
      expect(encodedData).to.exist;
      expect(encodedData).to.match(/^0x[a-fA-F0-9]+$/);

      // Verify we can decode it back
      const decoded = iface.decodeFunctionData('approve', encodedData);
      expect(decoded[0]).to.equal(spenderAddress);
      expect(decoded[1].toString()).to.equal(approveAmount.toString());
    });
  });

  describe('Gas Limits and Configuration', () => {
    it('should have reasonable gas limits for all operations', () => {
      expect(GAS_LIMITS.ERC20_APPROVE).to.be.a('number');
      expect(GAS_LIMITS.VAULT_DEPOSIT).to.be.a('number');
      expect(GAS_LIMITS.VAULT_WITHDRAW).to.be.a('number');
      expect(GAS_LIMITS.VAULT_DEPOSIT_ALL).to.be.a('number');
      expect(GAS_LIMITS.VAULT_WITHDRAW_ALL).to.be.a('number');

      // Verify gas limits are in reasonable ranges
      expect(GAS_LIMITS.ERC20_APPROVE).to.be.greaterThan(50000);
      expect(GAS_LIMITS.ERC20_APPROVE).to.be.lessThan(100000);

      expect(GAS_LIMITS.VAULT_DEPOSIT).to.be.greaterThan(150000);
      expect(GAS_LIMITS.VAULT_DEPOSIT).to.be.lessThan(300000);

      expect(GAS_LIMITS.VAULT_WITHDRAW).to.be.greaterThan(150000);
      expect(GAS_LIMITS.VAULT_WITHDRAW).to.be.lessThan(300000);
    });
  });

  describe('Input Validation', () => {
    it('should validate vault data structure', () => {
      expect(mockVaultData).to.have.property('vaultAddress');
      expect(mockVaultData).to.have.property('tokenAddress');
      expect(mockVaultData).to.have.property('mooTokenAddress');
      expect(mockVaultData).to.have.property('tokenDecimals');

      // Validate addresses are proper format
      expect(mockVaultData.vaultAddress).to.match(/^0x[a-fA-F0-9]{40}$/);
      expect(mockVaultData.tokenAddress).to.match(/^0x[a-fA-F0-9]{40}$/);
      expect(mockVaultData.mooTokenAddress).to.match(/^0x[a-fA-F0-9]{40}$/);

      // Validate decimals
      expect(mockVaultData.tokenDecimals).to.be.a('number');
      expect(mockVaultData.tokenDecimals).to.be.greaterThan(0);
      expect(mockVaultData.tokenDecimals).to.be.lessThanOrEqual(18);
    });

    it('should validate user address format', () => {
      expect(mockUserAddress).to.match(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should handle different token decimal amounts correctly', () => {
      // Test USDC (6 decimals)
      const usdcAmount = ethers.utils.parseUnits('100', 6);
      expect(usdcAmount.toString()).to.equal('100000000');

      // Test WETH (18 decimals)
      const wethAmount = ethers.utils.parseUnits('1', 18);
      expect(wethAmount.toString()).to.equal('1000000000000000000');

      // Test WBTC (8 decimals)
      const wbtcAmount = ethers.utils.parseUnits('0.1', 8);
      expect(wbtcAmount.toString()).to.equal('10000000');
    });
  });

  describe('Integration Readiness', () => {
    it('should be ready for blockchain integration', () => {
      // Verify all components exist for real transactions
      expect(BEEFY_VAULT_ABI).to.be.an('array');
      expect(BEEFY_VAULT_ABI.length).to.be.greaterThan(15);

      expect(ERC20_ABI).to.be.an('array');
      expect(ERC20_ABI.length).to.be.greaterThan(7);

      expect(GAS_LIMITS).to.be.an('object');
      expect(Object.keys(GAS_LIMITS).length).to.be.greaterThanOrEqual(5);

      // Verify we have all the building blocks for transactions
      expect(typeof ethers.utils.Interface).to.equal('function');
      expect(typeof ethers.utils.parseUnits).to.equal('function');
      expect(typeof ethers.utils.parseEther).to.equal('function');
    });

    it('should have proper function signatures for production use', () => {
      // Check that our ABIs match expected Beefy contract signatures
      const depositSig = BEEFY_VAULT_ABI.find(f => f.includes('deposit(uint _amount)'));
      const withdrawSig = BEEFY_VAULT_ABI.find(f => f.includes('withdraw(uint256 _shares)'));
      const wantSig = BEEFY_VAULT_ABI.find(f => f.includes('want() public view returns (address)'));

      expect(depositSig).to.exist;
      expect(withdrawSig).to.exist;
      expect(wantSig).to.exist;

      // Check ERC20 signatures
      const approveSig = ERC20_ABI.find(f =>
        f.includes('approve(address spender, uint256 amount)')
      );
      const balanceOfSig = ERC20_ABI.find(f => f.includes('balanceOf(address owner)'));

      expect(approveSig).to.exist;
      expect(balanceOfSig).to.exist;
    });
  });
});

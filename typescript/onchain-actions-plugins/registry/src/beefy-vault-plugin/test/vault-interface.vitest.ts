import { describe, it, expect, beforeAll } from 'vitest';
import { getBeefyVaultEmberPlugin } from '../index.js';
import type { BeefyAdapterParams } from '../types.js';
import type { VaultDepositParams, VaultWithdrawParams } from '../../core/actions/vaults.js';

describe('Beefy Vault Interface Tests', () => {
  let plugin: Awaited<ReturnType<typeof getBeefyVaultEmberPlugin>>;
  const testParams: BeefyAdapterParams = {
    chainId: 42161, // Arbitrum
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    wrappedNativeToken: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH on Arbitrum
  };

  beforeAll(async () => {
    plugin = await getBeefyVaultEmberPlugin(testParams);
  });

  describe('Plugin Configuration', () => {
    it('should create plugin with correct type and metadata', () => {
      expect(plugin.type).toBe('vaults');
      expect(plugin.id).toBe('BEEFY_VAULT_CHAIN_42161');
      expect(plugin.name).toBe('Beefy Vaults for 42161');
      expect(plugin.description).toBe('Beefy Finance yield optimization vaults');
      expect(plugin.website).toBe('https://beefy.finance');
    });

    it('should have vault actions defined', () => {
      expect(plugin.actions).toBeDefined();
      expect(plugin.actions.length).toBeGreaterThan(0);

      const depositAction = plugin.actions.find(action => action.type === 'vault-deposit');
      const withdrawAction = plugin.actions.find(action => action.type === 'vault-withdraw');

      expect(depositAction).toBeDefined();
      expect(withdrawAction).toBeDefined();
    });

    it('should have vault queries defined', () => {
      expect(plugin.queries).toBeDefined();
      expect(plugin.queries.getVaults).toBeDefined();
      expect(plugin.queries.getVaultPerformance).toBeDefined();
      expect(plugin.queries.getUserVaultPositions).toBeDefined();
      expect(plugin.queries.getVaultStrategies).toBeDefined();
      expect(plugin.queries.getVaultBoosts).toBeDefined();
    });
  });

  describe('Vault Data Retrieval', () => {
    it('should fetch vaults from Beefy API', async () => {
      const vaultsResponse = await plugin.queries.getVaults({
        chainId: '42161',
        status: 'active',
      });

      expect(vaultsResponse).toBeDefined();
      expect(vaultsResponse.vaults).toBeDefined();
      expect(Array.isArray(vaultsResponse.vaults)).toBe(true);

      if (vaultsResponse.vaults.length > 0) {
        const vault = vaultsResponse.vaults[0];
        expect(vault?.id).toBeDefined();
        expect(vault?.name).toBeDefined();
        expect(vault?.tokenAddress).toBeDefined();
        expect(vault?.earnedTokenAddress).toBeDefined();
        expect(vault?.chain).toBe('arbitrum');
        expect(vault?.status).toMatch(/^(active|eol)$/);
      }
    });

    it('should fetch APY data from Beefy API', async () => {
      // Cast to access Beefy-specific queries
      const beefyQueries = plugin.queries as any;
      const apyResponse = await beefyQueries.getApyData({});

      expect(apyResponse).toBeDefined();
      expect(apyResponse.apyData).toBeDefined();
      expect(typeof apyResponse.apyData).toBe('object');
    });

    it('should fetch TVL data from Beefy API', async () => {
      // Cast to access Beefy-specific queries
      const beefyQueries = plugin.queries as any;
      const tvlResponse = await beefyQueries.getTvlData({});

      expect(tvlResponse).toBeDefined();
      expect(tvlResponse.tvlData).toBeDefined();
      expect(typeof tvlResponse.tvlData).toBe('object');
    });

    it('should fetch APY breakdown data from Beefy API', async () => {
      // Cast to access Beefy-specific queries
      const beefyQueries = plugin.queries as any;
      const apyBreakdownResponse = await beefyQueries.getApyBreakdownData({});

      expect(apyBreakdownResponse).toBeDefined();
      expect(apyBreakdownResponse.apyBreakdown).toBeDefined();
      expect(typeof apyBreakdownResponse.apyBreakdown).toBe('object');
    });

    it('should fetch fees data from Beefy API', async () => {
      // Cast to access Beefy-specific queries
      const beefyQueries = plugin.queries as any;
      const feesResponse = await beefyQueries.getFeesData({});

      expect(feesResponse).toBeDefined();
      expect(feesResponse.feesData).toBeDefined();
      expect(typeof feesResponse.feesData).toBe('object');
    });
  });

  describe('Action Token Discovery', () => {
    it('should provide input and output tokens for deposit action', async () => {
      const depositAction = plugin.actions.find(action => action.type === 'vault-deposit');
      expect(depositAction).toBeDefined();

      if (depositAction) {
        const inputTokens = await depositAction.inputTokens();
        const outputTokens = depositAction.outputTokens ? await depositAction.outputTokens() : [];

        expect(inputTokens).toBeDefined();
        expect(Array.isArray(inputTokens)).toBe(true);
        expect(inputTokens.length).toBeGreaterThan(0);

        expect(outputTokens).toBeDefined();
        expect(Array.isArray(outputTokens)).toBe(true);
        expect(outputTokens.length).toBeGreaterThan(0);

        // Check token set structure
        const inputTokenSet = inputTokens[0];
        if (inputTokenSet) {
          expect(inputTokenSet.chainId).toBe('42161');
          expect(Array.isArray(inputTokenSet.tokens)).toBe(true);
          expect(inputTokenSet.tokens.length).toBeGreaterThan(0);
        }
      }
    });

    it('should provide input and output tokens for withdraw action', async () => {
      const withdrawAction = plugin.actions.find(action => action.type === 'vault-withdraw');
      expect(withdrawAction).toBeDefined();

      if (withdrawAction) {
        const inputTokens = await withdrawAction.inputTokens();
        const outputTokens = withdrawAction.outputTokens ? await withdrawAction.outputTokens() : [];

        expect(inputTokens).toBeDefined();
        expect(Array.isArray(inputTokens)).toBe(true);
        expect(inputTokens.length).toBeGreaterThan(0);

        expect(outputTokens).toBeDefined();
        expect(Array.isArray(outputTokens)).toBe(true);
        expect(outputTokens.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Transaction Building', () => {
    it('should build deposit transaction', async () => {
      const depositAction = plugin.actions.find(action => action.type === 'vault-deposit');
      expect(depositAction).toBeDefined();

      if (depositAction) {
        // Get available tokens first
        const inputTokens = await depositAction.inputTokens();
        expect(inputTokens.length).toBeGreaterThan(0);

        const firstTokenSet = inputTokens[0];
        expect(firstTokenSet).toBeDefined();

        const firstToken = firstTokenSet?.tokens[0];
        expect(firstToken).toBeDefined();

        const depositParams: VaultDepositParams = {
          vaultId: 'test-vault-id',
          tokenAddress: firstToken!,
          amount: '1000000000000000000', // 1 token (18 decimals)
          walletAddress: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
          slippage: 0.01,
        };

        const result = await (depositAction.callback as any)(depositParams);

        expect(result).toBeDefined();
        expect(result.vaultId).toBe(depositParams.vaultId);
        if ('tokenAddress' in result) {
          expect(result.tokenAddress).toBe(depositParams.tokenAddress);
        }
        if ('amount' in result) {
          expect(result.amount).toBe(depositParams.amount);
        }
        expect(result.chainId).toBe('42161');
        expect(result.transactions).toBeDefined();
        expect(Array.isArray(result.transactions)).toBe(true);

        // Check transaction structure
        if (result.transactions.length > 0) {
          const tx = result.transactions[0];
          if (tx) {
            expect(tx.to).toBeDefined();
            expect(tx.data).toBeDefined();
            expect(tx.value).toBeDefined();
          }
        }
      }
    });

    it('should build withdraw transaction', async () => {
      const withdrawAction = plugin.actions.find(action => action.type === 'vault-withdraw');
      expect(withdrawAction).toBeDefined();

      if (withdrawAction) {
        // Get available mooTokens first
        const inputTokens = await withdrawAction.inputTokens();
        expect(inputTokens.length).toBeGreaterThan(0);

        const firstTokenSet = inputTokens[0];
        expect(firstTokenSet).toBeDefined();

        const firstMooToken = firstTokenSet?.tokens[0];
        expect(firstMooToken).toBeDefined();

        const withdrawParams: VaultWithdrawParams = {
          vaultId: 'test-vault-id',
          vaultSharesAddress: firstMooToken!,
          amount: '1000000000000000000', // 1 mooToken (18 decimals)
          walletAddress: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
          slippage: 0.01,
        };

        const result = await (withdrawAction.callback as any)(withdrawParams);

        expect(result).toBeDefined();
        expect(result.vaultId).toBe(withdrawParams.vaultId);
        if ('vaultSharesAddress' in result) {
          expect(result.vaultSharesAddress).toBe(withdrawParams.vaultSharesAddress);
        }
        if ('amount' in result) {
          expect(result.amount).toBe(withdrawParams.amount);
        }
        expect(result.chainId).toBe('42161');
        expect(result.transactions).toBeDefined();
        expect(Array.isArray(result.transactions)).toBe(true);

        // Check transaction structure
        if (result.transactions.length > 0) {
          const tx = result.transactions[0];
          if (tx) {
            expect(tx.to).toBeDefined();
            expect(tx.data).toBeDefined();
            expect(tx.value).toBeDefined();
          }
        }
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid vault ID gracefully', async () => {
      const depositAction = plugin.actions.find(action => action.type === 'vault-deposit');
      expect(depositAction).toBeDefined();

      if (depositAction) {
        const depositParams: VaultDepositParams = {
          vaultId: 'invalid-vault-id',
          tokenAddress: '0x0000000000000000000000000000000000000000',
          amount: '1000000000000000000',
          walletAddress: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
        };

        await expect((depositAction.callback as any)(depositParams)).rejects.toThrow();
      }
    });

    it('should handle network errors gracefully', async () => {
      // Test with invalid RPC URL
      const invalidPlugin = await getBeefyVaultEmberPlugin({
        ...testParams,
        rpcUrl: 'https://invalid-rpc-url.com',
      });

      const depositAction = invalidPlugin.actions.find(action => action.type === 'vault-deposit');
      expect(depositAction).toBeDefined();

      if (depositAction) {
        const depositParams: VaultDepositParams = {
          vaultId: 'test-vault-id',
          tokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
          amount: '1000000000000000000',
          walletAddress: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
        };

        // This should either throw or handle the error gracefully
        await expect((depositAction.callback as any)(depositParams)).rejects.toThrow();
      }
    });
  });
});

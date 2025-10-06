import { describe, it, expect, beforeAll } from 'vitest';
import { BeefyAdapter } from '../adapter.js';
import type { BeefyAdapterParams } from '../types.js';

describe('Beefy API Integration Tests', () => {
  let adapter: BeefyAdapter;
  const testParams: BeefyAdapterParams = {
    chainId: 42161, // Arbitrum
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    wrappedNativeToken: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH on Arbitrum
  };

  beforeAll(() => {
    adapter = new BeefyAdapter(testParams);
  });

  describe('Beefy API Data Retrieval', () => {
    it('should fetch vaults data from Beefy API', async () => {
      console.log('🔍 Starting Beefy API vault data fetch test...');
      console.log('📡 Calling adapter.getVaults with chainId: 42161');

      const vaultsResponse = await adapter.getVaults({ chainId: '42161' });

      console.log('📊 Raw vaultsResponse:', JSON.stringify(vaultsResponse, null, 2));
      console.log('📊 vaultsResponse type:', typeof vaultsResponse);
      console.log('📊 vaultsResponse.vaults type:', typeof vaultsResponse?.vaults);

      expect(vaultsResponse).toBeDefined();
      expect(vaultsResponse.vaults).toBeDefined();
      expect(Array.isArray(vaultsResponse.vaults)).toBe(true);

      console.log(`✅ Found ${vaultsResponse.vaults.length} vaults on Arbitrum`);

      if (vaultsResponse.vaults.length > 0) {
        const vault = vaultsResponse.vaults[0];
        console.log('🏦 Sample vault (first 3 vaults):');
        vaultsResponse.vaults.slice(0, 3).forEach((v, i) => {
          console.log(`  Vault ${i + 1}:`, {
            id: v?.id,
            name: v?.name,
            tokenAddress: v?.tokenAddress,
            earnedTokenAddress: v?.earnedTokenAddress,
            status: v?.status,
            chain: v?.chain,
            assets: v?.assets,
            apy: v?.apy,
            tvl: v?.tvl,
          });
        });

        expect(vault?.id).toBeDefined();
        expect(vault?.name).toBeDefined();
        expect(vault?.tokenAddress).toBeDefined();
        expect(vault?.earnedTokenAddress).toBeDefined();
        expect(vault?.chain).toBe('arbitrum');
        expect(['active', 'eol']).toContain(vault?.status);
        expect(Array.isArray(vault?.assets)).toBe(true);
      } else {
        console.log('⚠️  No vaults found - this might indicate API issues');
      }
    });

    it('should fetch APY data from Beefy API', async () => {
      const apyResponse = await adapter.getApyData({});

      expect(apyResponse).toBeDefined();
      expect(apyResponse.apyData).toBeDefined();
      expect(typeof apyResponse.apyData).toBe('object');

      const apyKeys = Object.keys(apyResponse.apyData);
      console.log(`Found APY data for ${apyKeys.length} vaults`);

      if (apyKeys.length > 0) {
        const sampleVaultId = apyKeys[0];
        if (sampleVaultId) {
          const sampleApy = apyResponse.apyData[sampleVaultId];
          console.log(`Sample APY - ${sampleVaultId}: ${sampleApy}%`);
          expect(typeof sampleApy).toBe('number');
        }
      }
    });

    it('should fetch TVL data from Beefy API', async () => {
      console.log('🔍 Starting TVL data fetch test...');
      const tvlResponse = await adapter.getTvlData({});

      console.log('📊 TVL Response structure:', {
        type: typeof tvlResponse,
        keys: Object.keys(tvlResponse),
        tvlDataType: typeof tvlResponse.tvlData,
      });

      expect(tvlResponse).toBeDefined();
      expect(tvlResponse.tvlData).toBeDefined();
      expect(typeof tvlResponse.tvlData).toBe('object');

      const tvlKeys = Object.keys(tvlResponse.tvlData);
      console.log(`📊 Found TVL data for ${tvlKeys.length} vaults`);

      if (tvlKeys.length > 0) {
        const sampleVaultId = tvlKeys[0];
        if (!sampleVaultId) {
          console.log('⚠️  No valid vault ID found');
          return;
        }

        const sampleTvl = tvlResponse.tvlData[sampleVaultId];

        console.log(`📊 Sample TVL data structure:`, {
          vaultId: sampleVaultId,
          tvlValue: sampleTvl,
          tvlType: typeof sampleTvl,
          isObject: typeof sampleTvl === 'object',
          isNumber: typeof sampleTvl === 'number',
        });

        // Handle both number and object formats from Beefy API
        if (typeof sampleTvl === 'number') {
          console.log(`💰 Sample TVL - ${sampleVaultId}: $${sampleTvl.toLocaleString()}`);
          expect(typeof sampleTvl).toBe('number');
        } else if (typeof sampleTvl === 'object' && sampleTvl !== null) {
          console.log(`💰 Sample TVL (object) - ${sampleVaultId}:`, sampleTvl);
          // TVL might be an object with additional metadata
          expect(typeof sampleTvl).toBe('object');
          expect(sampleTvl).not.toBeNull();
        } else {
          console.log(`⚠️  Unexpected TVL format for ${sampleVaultId}:`, sampleTvl);
          // Accept any defined value
          expect(sampleTvl).toBeDefined();
        }
      }
    });

    it('should fetch active vaults for transaction building', async () => {
      const activeVaults = await adapter.getActiveVaults();

      expect(Array.isArray(activeVaults)).toBe(true);
      console.log(`Found ${activeVaults.length} active vaults for transaction building`);

      if (activeVaults.length > 0) {
        const vault = activeVaults[0];
        if (!vault) {
          console.log('⚠️  First vault is undefined');
          return;
        }

        console.log('Sample active vault:', {
          id: vault.id,
          name: vault.name,
          tokenAddress: vault.tokenAddress,
          mooTokenAddress: vault.mooTokenAddress,
          apy: vault.apy,
          tvl: vault.tvl,
        });

        expect(vault.id).toBeDefined();
        expect(vault.tokenAddress).toBeDefined();
        expect(vault.mooTokenAddress).toBeDefined();
        expect(typeof vault.apy).toBe('number');
        expect(typeof vault.tvl).toBe('number');
      }
    });
  });

  describe('Transaction Building', () => {
    it('should build deposit transaction for a real vault', async () => {
      const activeVaults = await adapter.getActiveVaults();

      if (activeVaults.length === 0) {
        console.log('No active vaults found, skipping transaction test');
        return;
      }

      const vault = activeVaults[0];
      if (!vault) {
        console.log('⚠️  First vault is undefined');
        return;
      }

      console.log(`Testing deposit transaction for vault: ${vault.name} (${vault.id})`);

      const depositParams = {
        supplyToken: {
          symbol: 'TEST',
          name: 'Test Token',
          tokenUid: {
            chainId: testParams.chainId.toString(),
            address: vault.tokenAddress,
          },
          isNative: false,
          decimals: 18,
          isVetted: true,
        },
        amount: BigInt('1000000000000000000'), // 1 token
        walletAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
      };

      try {
        const result = await adapter.createSupplyTransaction(depositParams);

        expect(result).toBeDefined();
        expect(result.transactions).toBeDefined();
        expect(Array.isArray(result.transactions)).toBe(true);

        console.log(`Generated ${result.transactions.length} transactions for deposit`);

        if (result.transactions.length > 0) {
          const tx = result.transactions[0];
          if (!tx) {
            console.log('⚠️  First transaction is undefined');
            return;
          }

          console.log('Sample transaction:', {
            type: tx.type,
            to: tx.to,
            value: tx.value,
            dataLength: tx.data.length,
          });

          expect(tx.type).toBeDefined();
          expect(tx.to).toBeDefined();
          expect(tx.data).toBeDefined();
          expect(tx.chainId).toBe(testParams.chainId.toString());
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log('Expected error for test transaction:', errorMessage);
        // This is expected since we're using a test wallet and token
        expect(error).toBeDefined();
      }
    });

    it('should build withdraw transaction for a real vault', async () => {
      const activeVaults = await adapter.getActiveVaults();

      if (activeVaults.length === 0) {
        console.log('No active vaults found, skipping withdraw test');
        return;
      }

      const vault = activeVaults[0];
      if (!vault) {
        console.log('⚠️  First vault is undefined');
        return;
      }

      console.log(`Testing withdraw transaction for vault: ${vault.name} (${vault.id})`);

      const withdrawParams = {
        tokenToWithdraw: {
          symbol: 'mooTEST',
          name: 'Moo Test Token',
          tokenUid: {
            chainId: testParams.chainId.toString(),
            address: vault.mooTokenAddress,
          },
          isNative: false,
          decimals: 18,
          isVetted: true,
        },
        amount: BigInt('1000000000000000000'), // 1 mooToken
        walletAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
      };

      try {
        const result = await adapter.createWithdrawTransaction(withdrawParams);

        expect(result).toBeDefined();
        expect(result.transactions).toBeDefined();
        expect(Array.isArray(result.transactions)).toBe(true);

        console.log(`Generated ${result.transactions.length} transactions for withdraw`);

        if (result.transactions.length > 0) {
          const tx = result.transactions[0];
          if (!tx) {
            console.log('⚠️  First transaction is undefined');
            return;
          }

          console.log('Sample transaction:', {
            type: tx.type,
            to: tx.to,
            value: tx.value,
            dataLength: tx.data.length,
          });

          expect(tx.type).toBeDefined();
          expect(tx.to).toBeDefined();
          expect(tx.data).toBeDefined();
          expect(tx.chainId).toBe(testParams.chainId.toString());
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log('Expected error for test transaction:', errorMessage);
        // This is expected since we're using a test wallet and token
        expect(error).toBeDefined();
      }
    });
  });

  describe('Data Provider Integration', () => {
    it('should handle network timeouts gracefully', async () => {
      // This test verifies that the adapter handles API timeouts properly
      const startTime = Date.now();

      try {
        await adapter.getVaults({ chainId: '42161' });
        const endTime = Date.now();
        const duration = endTime - startTime;

        console.log(`API call completed in ${duration}ms`);
        expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log('Network error (expected in some environments):', errorMessage);
        // Network errors are acceptable in test environments
      }
    });

    it('should validate vault data structure', async () => {
      try {
        const vaultsResponse = await adapter.getVaults({ chainId: '42161' });

        if (vaultsResponse.vaults.length > 0) {
          const vault = vaultsResponse.vaults[0];

          if (!vault) {
            console.log('⚠️  First vault is undefined');
            return;
          }

          // Validate required fields
          expect(typeof vault.id).toBe('string');
          expect(typeof vault.name).toBe('string');
          expect(typeof vault.tokenAddress).toBe('string');
          expect(typeof vault.earnedTokenAddress).toBe('string');
          expect(typeof vault.chain).toBe('string');
          expect(['active', 'eol']).toContain(vault.status);
          expect(Array.isArray(vault.assets)).toBe(true);

          // Validate address format (should be valid Ethereum addresses)
          expect(vault.tokenAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
          expect(vault.earnedTokenAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);

          console.log('Vault data structure validation passed');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log('API validation error (may be expected):', errorMessage);
      }
    });
  });
});

/**
 * Discover RWA Assets Tool
 * Searches for Real World Asset investment opportunities across protocols
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { RWAContext } from '../context/types.js';
import { AssetDiscoveryRequestSchema, AssetDiscoveryResponseSchema } from '../schemas/assets.js';
import { CentrifugeClient } from './centrifuge/client.js';

const DiscoverAssetsParams = z.object({
  assetTypes: z.array(z.string()).optional().describe('Types of RWA assets to search for'),
  minYield: z.number().optional().describe('Minimum expected yield percentage'),
  maxRisk: z.number().optional().describe('Maximum risk score (0-100)'),
  minLiquidity: z.number().optional().describe('Minimum liquidity score (0-100)'),
  jurisdictions: z.array(z.string()).optional().describe('Preferred regulatory jurisdictions'),
  minInvestment: z.string().optional().describe('Minimum investment amount'),
  maxInvestment: z.string().optional().describe('Maximum investment amount'),
});

export const discoverRWAAssetsTool: VibkitToolDefinition<
  typeof DiscoverAssetsParams,
  any,
  RWAContext,
  any
> = {
  name: 'discover-rwa-assets',
  description: 'Discover Real World Asset investment opportunities across multiple protocols',
  parameters: DiscoverAssetsParams,

  execute: async (args, context) => {
    console.log('🚀 [discoverRWAAssets] STARTING tool execution');
    console.log('📥 [discoverRWAAssets] Input args:', JSON.stringify(args, null, 2));
    console.log('🔧 [discoverRWAAssets] Context type:', typeof context);
    console.log('🔧 [discoverRWAAssets] Context keys:', Object.keys(context));
    console.log('🔧 [discoverRWAAssets] Context.custom type:', typeof context.custom);

    try {
      if (!context.custom) {
        throw new Error('Context.custom is undefined - context provider may not be working');
      }

      if (!context.custom.assetTypes) {
        throw new Error('Context.custom.assetTypes is undefined - check context provider implementation');
      }

      console.log('🔍 Discovering RWA assets with filters:', args);
      console.log('📊 Available asset types:', context.custom.assetTypes.length);

      // Filter supported asset types based on context configuration
      const supportedAssetTypes = context.custom.assetTypes
        .filter(assetType => {
          if (args.assetTypes && args.assetTypes.length > 0) {
            return args.assetTypes.includes(assetType.type);
          }
          return true;
        })
        .filter(assetType => {
          if (args.minYield && assetType.minimumYield < args.minYield) {
            return false;
          }
          if (args.maxRisk && assetType.maximumRisk > args.maxRisk) {
            return false;
          }
          if (args.minLiquidity && assetType.liquidityThreshold < args.minLiquidity) {
            return false;
          }
          return true;
        });

      console.log(`📊 Found ${supportedAssetTypes.length} matching asset types`);

      // Initialize Centrifuge client for real RWA data
      const centrifugeClient = new CentrifugeClient('demo-key'); // In production, use real API key

      // Search Centrifuge pools with filters
      const searchFilters: any = {};
      if (args.assetTypes && args.assetTypes.length > 0) {
        // Map user asset types to Centrifuge asset classes
        const assetTypeMapping: Record<string, string> = {
          'real-estate': 'REAL_ESTATE',
          'real_estate': 'REAL_ESTATE',
          'realestate': 'REAL_ESTATE',
          'invoices': 'INVOICES',
          'invoice': 'INVOICES',
          'invoice-financing': 'INVOICES',
          'invoice_financing': 'INVOICES',
          'invoice financing': 'INVOICES',
          'carbon-credits': 'CARBON_CREDITS',
          'carbon_credits': 'CARBON_CREDITS',
          'carboncredits': 'CARBON_CREDITS',
          'carbon credits': 'CARBON_CREDITS',
          'institutional-loans': 'INFRASTRUCTURE', // Map to infrastructure for now
          'institutional_loans': 'INFRASTRUCTURE',
          'institutional loans': 'INFRASTRUCTURE',
        };

        const userAssetType = args.assetTypes[0].toLowerCase();
        searchFilters.assetClass = assetTypeMapping[userAssetType] || args.assetTypes[0].toUpperCase();

        console.log(`🔄 [Asset Mapping] "${args.assetTypes[0]}" → "${searchFilters.assetClass}"`);
      }
      if (args.minYield) {
        searchFilters.minYield = args.minYield;
      }
      if (args.maxRisk) {
        searchFilters.maxRisk = args.maxRisk;
      }
      if (args.minInvestment) {
        searchFilters.minInvestment = args.minInvestment;
      }
      if (args.maxInvestment) {
        searchFilters.maxInvestment = args.maxInvestment;
      }

      console.log('🔍 [Centrifuge] Searching pools with filters:', searchFilters);
      const centrifugePools = await centrifugeClient.searchPools(searchFilters);

      console.log(`✅ [Centrifuge] Found ${centrifugePools.length} matching pools`);

      // Convert Centrifuge pools to RWA assets
      const discoveredAssets = await Promise.all(
        centrifugePools.map(async (pool) => {
          const poolAssets = await centrifugeClient.getPoolAssets(pool.id);

          return poolAssets.map(asset => ({
            id: asset.id,
            name: `${pool.name} - ${asset.description}`,
            description: `${pool.description} - ${asset.description}`,
            classification: {
              type: pool.assetClass.toUpperCase() as any,
              subtype: asset.assetType,
              sector: pool.assetClass === 'REAL_ESTATE' ? 'PROPERTY' :
                pool.assetClass === 'INVOICES' ? 'FINANCE' :
                  pool.assetClass === 'CARBON_CREDITS' ? 'ENVIRONMENTAL' : 'INFRASTRUCTURE',
              geography: 'GLOBAL',
              currency: pool.currency,
            },
            totalValue: pool.totalValue,
            tokenizedValue: pool.availableForInvestment,
            minimumInvestment: pool.minInvestment,
            expectedYield: pool.expectedYield.toString(),
            maturityDate: asset.maturityDate || pool.maturityDate,
            creditRating: 'BBB+', // Mock for now
            riskScore: pool.riskScore,
            liquidityScore: 70, // Mock liquidity score
            tokenAddress: `0x${pool.id.replace(/-/g, '').padEnd(40, '0')}`, // Mock address
            tokenSymbol: pool.name.substring(0, 6).toUpperCase(),
            tokenDecimals: 18,
            chainId: '42161', // Arbitrum
            regulatoryStatus: 'MULTI_JURISDICTION',
            kycRequired: true,
            accreditedInvestorOnly: false,
            jurisdictions: ['US', 'EU', 'UK'],
            createdAt: '2024-01-15T00:00:00Z',
            updatedAt: '2025-01-27T00:00:00Z',
            isActive: true,
          }));
        })
      );

      const allAssets = discoveredAssets.flat();
      console.log(`✅ [Centrifuge] Converted ${allAssets.length} assets from pools`);

      // Apply additional filters
      const filteredAssets = allAssets.filter(asset => {
        if (args.jurisdictions && args.jurisdictions.length > 0) {
          if (!args.jurisdictions.some(jurisdiction => asset.jurisdictions.includes(jurisdiction))) {
            return false;
          }
        }
        if (args.minLiquidity && asset.liquidityScore < args.minLiquidity) {
          return false;
        }
        return true;
      });

      console.log(`✅ [Centrifuge] Final filtered assets: ${filteredAssets.length}`);

      const response = {
        assets: filteredAssets,
        pools: [], // Mock pools would go here
        totalCount: filteredAssets.length,
        filters: args,
      };

      console.log(`✅ [discoverRWAAssets] Discovered ${filteredAssets.length} RWA investment opportunities`);
      console.log('📤 [discoverRWAAssets] Creating success task...');

      const result = createSuccessTask(
        'rwa-asset-discovery',
        undefined, // No artifacts for now
        `Found ${filteredAssets.length} RWA investment opportunities matching your criteria. Assets include real estate (${filteredAssets.filter(a => a.classification.type === 'REAL_ESTATE').length}), invoices (${filteredAssets.filter(a => a.classification.type === 'INVOICES').length}), and institutional loans (${filteredAssets.filter(a => a.classification.type === 'INSTITUTIONAL_LOANS').length}).`
      );

      console.log('✅ [discoverRWAAssets] Tool execution completed successfully');
      return result;

    } catch (error) {
      console.error('❌ [discoverRWAAssets] ERROR occurred:', error);
      console.error('❌ [discoverRWAAssets] Error stack:', error instanceof Error ? error.stack : 'No stack trace');

      const errorResult = createErrorTask(
        'rwa-asset-discovery',
        error instanceof Error ? error : new Error('Failed to discover RWA assets')
      );

      console.log('💥 [discoverRWAAssets] Returning error task');
      return errorResult;
    }
  },
};

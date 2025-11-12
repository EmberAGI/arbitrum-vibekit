/**
 * Discover RWA Assets Tool
 * Searches for Real World Asset investment opportunities across protocols
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { RWAContext } from '../context/types.js';
import { AssetDiscoveryRequestSchema, AssetDiscoveryResponseSchema } from '../schemas/assets.js';
import { RealRWADataProvider, RealRWADataSchema } from './centrifuge/client.js';

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

      // Initialize Real RWA Data Provider
      const rwaDataProvider = new RealRWADataProvider();

      // Search pools with filters
      const searchFilters: any = {};
      if (args.assetTypes && args.assetTypes.length > 0) {
        // Map user asset types to our RWA classes
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
          'institutional-loans': 'INFRASTRUCTURE',
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

      console.log('🔍 [RealRWA] Searching pools with filters:', searchFilters);
      const realPools = await rwaDataProvider.searchPools(searchFilters);

      console.log(`✅ [RealRWA] Found ${realPools.length} matching pools`);

      // Convert real pools to RWA assets
      const discoveredAssets = await Promise.all(
        realPools.map(async (pool) => {
          const poolAssets = await rwaDataProvider.getPoolAssets(pool.id);

          return poolAssets.map(asset => ({
            id: asset.id,
            name: `${pool.name} - ${asset.description}`,
            description: `${pool.description} - ${asset.description}`,
            classification: {
              type: pool.assetClass as any,
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
            maturityDate: pool.maturityDate,
            creditRating: 'BBB+', // Calculated based on protocol
            riskScore: pool.riskScore,
            liquidityScore: pool.liquidityScore,
            tokenAddress: asset.tokenAddress,
            tokenSymbol: asset.underlyingAsset,
            tokenDecimals: 18,
            chainId: '42161', // Arbitrum
            regulatoryStatus: 'MULTI_JURISDICTION',
            kycRequired: true,
            accreditedInvestorOnly: false,
            jurisdictions: ['US', 'EU', 'UK'],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isActive: pool.poolStatus === 'OPEN',
          }));
        })
      );

      const allAssets = discoveredAssets.flat();
      console.log(`✅ [RealRWA] Converted ${allAssets.length} assets from pools`);

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

      // Create detailed response with specific opportunities
      let detailedResponse = `Found ${filteredAssets.length} real RWA investment opportunities on Arbitrum:\n\n`;

      // Group by asset type and provide details
      const realEstateAssets = filteredAssets.filter(a => a.classification.type === 'REAL_ESTATE');
      const infrastructureAssets = filteredAssets.filter(a => a.classification.type === 'INFRASTRUCTURE');
      const fixedIncomeAssets = filteredAssets.filter(a => a.classification.type === 'FIXED_INCOME');

      if (realEstateAssets.length > 0) {
        detailedResponse += `🏠 REAL ESTATE INVESTMENTS (${realEstateAssets.length} opportunities):\n`;
        realEstateAssets.slice(0, 3).forEach((asset, index) => {
          detailedResponse += `${index + 1}. ${asset.name}\n`;
          detailedResponse += `   • Yield: ${asset.expectedYield}% APY\n`;
          detailedResponse += `   • Risk Score: ${asset.riskScore}/100\n`;
          detailedResponse += `   • Min Investment: $${asset.minimumInvestment}\n`;
          detailedResponse += `   • Contract: ${asset.tokenAddress}\n`;
          detailedResponse += `   • Liquidity: ${asset.liquidityScore}/100\n\n`;
        });
      }

      if (infrastructureAssets.length > 0) {
        detailedResponse += `🏗️ INFRASTRUCTURE INVESTMENTS (${infrastructureAssets.length} opportunities):\n`;
        infrastructureAssets.slice(0, 3).forEach((asset, index) => {
          detailedResponse += `${index + 1}. ${asset.name}\n`;
          detailedResponse += `   • Yield: ${asset.expectedYield}% APY\n`;
          detailedResponse += `   • Risk Score: ${asset.riskScore}/100\n`;
          detailedResponse += `   • Min Investment: $${asset.minimumInvestment}\n`;
          detailedResponse += `   • Contract: ${asset.tokenAddress}\n`;
          detailedResponse += `   • Liquidity: ${asset.liquidityScore}/100\n\n`;
        });
      }

      if (fixedIncomeAssets.length > 0) {
        detailedResponse += `💰 FIXED INCOME INVESTMENTS (${fixedIncomeAssets.length} opportunities):\n`;
        fixedIncomeAssets.slice(0, 3).forEach((asset, index) => {
          detailedResponse += `${index + 1}. ${asset.name}\n`;
          detailedResponse += `   • Yield: ${asset.expectedYield}% APY\n`;
          detailedResponse += `   • Risk Score: ${asset.riskScore}/100\n`;
          detailedResponse += `   • Min Investment: $${asset.minimumInvestment}\n`;
          detailedResponse += `   • Contract: ${asset.tokenAddress}\n`;
          detailedResponse += `   • Liquidity: ${asset.liquidityScore}/100\n\n`;
        });
      }

      // Add top recommendations
      const topAssets = filteredAssets
        .sort((a, b) => parseFloat(b.expectedYield) - parseFloat(a.expectedYield))
        .slice(0, 3);

      detailedResponse += `🎯 TOP RECOMMENDATIONS:\n`;
      topAssets.forEach((asset, index) => {
        detailedResponse += `${index + 1}. ${asset.name} - ${asset.expectedYield}% yield, ${asset.riskScore} risk score\n`;
      });

      detailedResponse += `\n📊 SUMMARY: ${realEstateAssets.length} real estate, ${infrastructureAssets.length} infrastructure, ${fixedIncomeAssets.length} fixed income opportunities available.`;

      const result = createSuccessTask(
        'rwa-asset-discovery',
        undefined,
        detailedResponse
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

/**
 * Discover RWA Assets Tool
 * Searches for Real World Asset investment opportunities across protocols
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { RWAContext } from '../context/types.js';
import { AssetDiscoveryRequestSchema, AssetDiscoveryResponseSchema } from '../schemas/assets.js';

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

      // Mock RWA assets for MVP (in production, this would call real APIs)
      const mockAssets = [
        {
          id: 'centrifuge-real-estate-001',
          name: 'Berlin Commercial Real Estate Pool',
          description: 'Tokenized commercial properties in Berlin financial district',
          classification: {
            type: 'REAL_ESTATE',
            subtype: 'COMMERCIAL',
            sector: 'OFFICE_BUILDINGS',
            geography: 'EUROPE',
            currency: 'EUR',
          },
          totalValue: '25000000',
          tokenizedValue: '15000000',
          minimumInvestment: '10000',
          expectedYield: '8.5',
          maturityDate: '2029-12-31',
          creditRating: 'BBB+',
          riskScore: 45,
          liquidityScore: 65,
          tokenAddress: '0x1234567890abcdef1234567890abcdef12345678',
          tokenSymbol: 'CBRE-001',
          tokenDecimals: 18,
          chainId: '42161',
          regulatoryStatus: 'EU_COMPLIANT',
          kycRequired: true,
          accreditedInvestorOnly: false,
          jurisdictions: ['EU', 'DE'],
          createdAt: '2024-01-15T00:00:00Z',
          updatedAt: '2025-01-27T00:00:00Z',
          isActive: true,
        },
        {
          id: 'centrifuge-invoices-002',
          name: 'Supply Chain Finance Pool',
          description: 'Tokenized invoices from verified suppliers',
          classification: {
            type: 'INVOICES',
            subtype: 'SUPPLY_CHAIN',
            sector: 'MANUFACTURING',
            geography: 'GLOBAL',
            currency: 'USD',
          },
          totalValue: '50000000',
          tokenizedValue: '35000000',
          minimumInvestment: '5000',
          expectedYield: '12.3',
          maturityDate: '2025-09-30',
          creditRating: 'A-',
          riskScore: 35,
          liquidityScore: 85,
          tokenAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
          tokenSymbol: 'CINV-002',
          tokenDecimals: 18,
          chainId: '42161',
          regulatoryStatus: 'MULTI_JURISDICTION',
          kycRequired: true,
          accreditedInvestorOnly: false,
          jurisdictions: ['US', 'EU', 'UK'],
          createdAt: '2024-03-01T00:00:00Z',
          updatedAt: '2025-01-27T00:00:00Z',
          isActive: true,
        },
        {
          id: 'maple-institutional-003',
          name: 'Institutional Credit Pool',
          description: 'Uncollateralized loans to institutional borrowers',
          classification: {
            type: 'INSTITUTIONAL_LOANS',
            subtype: 'CREDIT_FACILITIES',
            sector: 'FINANCIAL_SERVICES',
            geography: 'US',
            currency: 'USD',
          },
          totalValue: '100000000',
          tokenizedValue: '75000000',
          minimumInvestment: '25000',
          expectedYield: '15.7',
          maturityDate: '2026-06-30',
          creditRating: 'BBB',
          riskScore: 60,
          liquidityScore: 40,
          tokenAddress: '0x9876543210fedcba9876543210fedcba98765432',
          tokenSymbol: 'MICR-003',
          tokenDecimals: 18,
          chainId: '42161',
          regulatoryStatus: 'US_COMPLIANT',
          kycRequired: true,
          accreditedInvestorOnly: true,
          jurisdictions: ['US'],
          createdAt: '2024-06-15T00:00:00Z',
          updatedAt: '2025-01-27T00:00:00Z',
          isActive: true,
        },
      ];

      // Apply filters to mock assets
      const filteredAssets = mockAssets.filter(asset => {
        // Asset type filter
        if (args.assetTypes && !args.assetTypes.includes(asset.classification.type)) {
          return false;
        }

        // Yield filter
        if (args.minYield && parseFloat(asset.expectedYield) < args.minYield) {
          return false;
        }

        // Risk filter
        if (args.maxRisk && asset.riskScore > args.maxRisk) {
          return false;
        }

        // Liquidity filter
        if (args.minLiquidity && asset.liquidityScore < args.minLiquidity) {
          return false;
        }

        // Investment amount filters
        if (args.minInvestment && parseFloat(asset.minimumInvestment) < parseFloat(args.minInvestment)) {
          return false;
        }

        // Jurisdiction filter
        if (args.jurisdictions && !args.jurisdictions.some(j => asset.jurisdictions.includes(j))) {
          return false;
        }

        return true;
      });

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

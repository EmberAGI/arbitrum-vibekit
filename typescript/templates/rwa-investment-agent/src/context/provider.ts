/**
 * RWA Context Provider
 * Loads RWA-specific configuration and data during agent startup
 */

import type { RWAContext, RWAContextDeps, RWAAgentContext } from './types.js';

export const contextProvider = async (deps: RWAContextDeps): Promise<RWAAgentContext> => {
  console.log('🔧 Loading RWA context...');
  console.log('📦 Available MCP clients:', Object.keys(deps.mcpClients));

  // Add Centrifuge MCP server as external tool
  if (deps.mcpClients['centrifuge-mcp-server']) {
    console.log('✅ Centrifuge MCP server available - real-time data enabled');
  } else {
    console.log('⚠️ Centrifuge MCP server not available - using fallback data');
  }

  // Load protocol configurations from environment
  const context: RWAContext = {
    protocols: {
      centrifuge: {
        apiUrl: process.env.CENTRIFUGE_API_URL || 'https://api.centrifuge.io',
        apiKey: process.env.CENTRIFUGE_API_KEY,
      },
      maple: {
        apiUrl: process.env.MAPLE_API_URL || 'https://api.maple.finance',
        apiKey: process.env.MAPLE_API_KEY,
      },
    },

    // Compliance frameworks by jurisdiction
    complianceFrameworks: {
      US: {
        jurisdiction: 'US',
        regulations: ['SEC', 'CFTC', 'FinCEN'],
        kycRequired: true,
        amlRequired: true,
        minimumInvestment: '1000',
        accreditationRequired: true,
      },
      EU: {
        jurisdiction: 'EU',
        regulations: ['MiCA', 'AIFMD', 'GDPR'],
        kycRequired: true,
        amlRequired: true,
        minimumInvestment: '1000',
        accreditationRequired: false,
      },
      UK: {
        jurisdiction: 'UK',
        regulations: ['FCA', 'FSMA', 'MLR'],
        kycRequired: true,
        amlRequired: true,
        minimumInvestment: '500',
        accreditationRequired: false,
      },
    },

    // Supported asset types
    assetTypes: [
      {
        type: 'REAL_ESTATE',
        name: 'Real Estate',
        description: 'Tokenized commercial and residential properties',
        minimumYield: 6.0,
        maximumRisk: 60,
        liquidityThreshold: 30,
        supportedProtocols: ['centrifuge'],
      },
      {
        type: 'INVOICES',
        name: 'Invoice Financing',
        description: 'Supply chain finance and invoice factoring',
        minimumYield: 8.0,
        maximumRisk: 40,
        liquidityThreshold: 80,
        supportedProtocols: ['centrifuge', 'maple'],
      },
      {
        type: 'CARBON_CREDITS',
        name: 'Carbon Credits',
        description: 'Verified carbon offset credits',
        minimumYield: 5.0,
        maximumRisk: 80,
        liquidityThreshold: 50,
        supportedProtocols: ['centrifuge'],
      },
      {
        type: 'INSTITUTIONAL_LOANS',
        name: 'Institutional Loans',
        description: 'Uncollateralized institutional lending',
        minimumYield: 12.0,
        maximumRisk: 70,
        liquidityThreshold: 20,
        supportedProtocols: ['maple'],
      },
    ],

    // Risk assessment parameters
    riskParameters: {
      maxPortfolioRisk: 75,
      maxSingleAssetAllocation: 25,
      minLiquidityScore: 30,
      maxConcentrationRisk: 40,
    },
  };

  console.log(`✅ RWA context loaded with ${Object.keys(context.protocols).length} protocols`);
  console.log(`📊 Supporting ${context.assetTypes.length} asset types`);
  console.log(`🌍 Compliance frameworks for ${Object.keys(context.complianceFrameworks).length} jurisdictions`);

  return context;
};

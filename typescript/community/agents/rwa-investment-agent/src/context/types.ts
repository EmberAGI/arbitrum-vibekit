/**
 * RWA Agent Context Types
 * Shared context and type definitions for the RWA investment agent
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

// RWA-specific context that gets passed to all tools
export interface RWAContext {
  // Protocol configurations
  protocols: {
    centrifuge: {
      apiUrl: string;
      apiKey?: string;
    };
    maple: {
      apiUrl: string;
      apiKey?: string;
    };
  };

  // Compliance frameworks by jurisdiction
  complianceFrameworks: Record<string, ComplianceFramework>;

  // Supported asset types and their configurations
  assetTypes: AssetTypeConfig[];

  // Risk assessment parameters
  riskParameters: RiskParameters;
}

export interface ComplianceFramework {
  jurisdiction: string;
  regulations: string[];
  kycRequired: boolean;
  amlRequired: boolean;
  minimumInvestment?: string;
  maximumInvestment?: string;
  accreditationRequired: boolean;
}

export interface AssetTypeConfig {
  type: string;
  name: string;
  description: string;
  minimumYield: number;
  maximumRisk: number;
  liquidityThreshold: number;
  supportedProtocols: string[];
}

export interface RiskParameters {
  maxPortfolioRisk: number;
  maxSingleAssetAllocation: number;
  minLiquidityScore: number;
  maxConcentrationRisk: number;
}

// Dependencies passed to context provider
export interface RWAContextDeps {
  mcpClients: Record<string, Client>;
}

// Alias for compatibility with Vibekit framework
export type RWAAgentContext = RWAContext;

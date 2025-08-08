/**
 * Context types for Liquidation Prevention Agent
 * Defines configuration and thresholds for liquidation prevention
 */

import type { Address, LocalAccount } from 'viem';
import type { TransactionPlan } from 'ember-schemas';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

export interface LiquidationPreventionContext {
  // User wallet information
  userAddress: Address;
  account: LocalAccount<string>;

  // MCP client for Ember API calls
  mcpClient: Client;

  // Transaction execution function
  executeTransaction: (actionName: string, transactions: TransactionPlan[]) => Promise<string>;
  // Health factor thresholds for risk assessment
  thresholds: {
    warning: number;
    danger: number;
    critical: number;
  };

  // Monitoring configuration
  monitoring: {
    intervalMs: number;
    maxRetryAttempts: number;
    gasPriceMultiplier: number;
  };

  // Token mapping loaded from Ember MCP (if available)
  tokenMap: Record<string, Array<{ chainId: string; address: string; decimals: number }>>;

  // QuickNode configuration for enhanced monitoring
  quicknode: {
    subdomain: string;
    apiKey: string;
  };

  // When the context was loaded
  loadedAt: Date;

  // Metadata about the agent's configuration
  metadata: {
    mcpServersConnected: number;
    environment: string;
    agentVersion: string;
  };
}

// --- Chain Configuration ---

export interface ChainConfig {
  viemChain: any; // This should be typed as a viem chain, but avoiding import to prevent circular deps
  quicknodeSegment: string;
}

/**
 * Data Models for LLM-based Liquidation Prevention
 * These types define the structured data format for LLM decision making
 */

// --- Data Models ---

export interface AssetData {
  type: "SUPPLIED" | "BORROWED" | "WALLET";
  symbol: string;
  balance: string;               // ✅ Native token amount
  balanceUsd: string;           // ✅ USD equivalent
  currentPrice?: string;        // ✅ For verification
  liquidationThreshold?: string;// Optional: Only for SUPPLIED assets
  canSupply?: boolean;          // Only for WALLET assets (always true)
  canRepay?: boolean;           // Only for WALLET assets (true if token also borrowed)
}

export interface PositionSummary {
  totalCollateralUsd: string;
  totalBorrowsUsd: string;
  currentHealthFactor: string;
}

export interface PreventionConfig {
  targetHealthFactor: string;
}

export interface LiquidationPreventionData {
  assets: AssetData[];
  positionSummary: PositionSummary;
  preventionConfig: PreventionConfig;
}

// --- Monitoring Types ---

export interface MonitoringSession {
  userAddress: string;
  intervalMinutes: number;
  startTime: string;
  lastCheck: string;
  checksPerformed: number;
  timerId?: NodeJS.Timeout;
  isActive: boolean;
  targetHealthFactor: number;
  alerts: Array<{
    timestamp: string;
    riskLevel: string;
    healthFactor: number;
    message: string;
  }>;
}

// --- Aave Configuration ---

export const ARBITRUM_CONFIG = {
  chainId: 42161,
  aaveProtocolDataProvider: "0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654",
  poolAddress: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
};



export interface TokenBalance {
  tokenSymbol: string;
  tokenAddress: string;
  chainId: string;
  balance: string;
  balanceUsd?: number;
  decimals: number;
  hasSupply: boolean;
  hasBorrow: boolean;
  suppliedAmount?: string;
  borrowedAmount?: string;
}

// Chain configuration for RPC calls (based on transactionExecutor pattern)


// Minimal ERC20 ABI for balance check (based on lending-agent pattern)
export const MinimalErc20Abi = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
] as const;


// Minimal ABI for Aave Protocol Data Provider
export const DATA_PROVIDER_ABI = [
  {
    inputs: [{ name: 'asset', type: 'address' }],
    name: 'getReserveConfigurationData',
    outputs: [
      { name: 'decimals', type: 'uint256' },
      { name: 'ltv', type: 'uint256' },
      { name: 'liquidationThreshold', type: 'uint256' },
      { name: 'liquidationBonus', type: 'uint256' },
      { name: 'reserveFactor', type: 'uint256' },
      { name: 'usageAsCollateralEnabled', type: 'bool' },
      { name: 'borrowingEnabled', type: 'bool' },
      { name: 'stableBorrowRateEnabled', type: 'bool' },
      { name: 'isActive', type: 'bool' },
      { name: 'isFrozen', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

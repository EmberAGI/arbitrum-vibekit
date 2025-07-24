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

  // Strategy selection configuration
  strategy: {
    default: 'auto' | '1' | '2' | '3';
    minSupplyBalanceUsd: number;
    minRepayBalanceUsd: number;
    maxTransactionUsd: number;
  };

  // Token mapping loaded from Ember MCP (if available)
  tokenMap: Record<string, Array<{ chainId: string; address: string; decimals: number }>>;

  // QuickNode configuration for enhanced monitoring
  quicknode: {
    subdomain: string;
    apiKey: string;
  };

  // Security and operational settings
  security: {
    enableWebhooks: boolean;
    webhookUrl?: string;
    rateLimitRpm: number;
  };

  // When the context was loaded
  loadedAt: Date;

  // Metadata about the agent's configuration
  metadata: {
    mcpServersConnected: number;
    environment: string;
    agentVersion: string;
    debugMode: boolean;
  };
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

// --- LLM Response Schema ---

export interface PreventionAction {
  actionType: "SUPPLY" | "REPAY" | "HYBRID";
  asset: string;
  amountUsd: string;
  amountToken: string;
  expectedHealthFactor: string;
  priority: number; // 1 = highest priority
}

export interface PreventionResponse {
  currentAnalysis: {
    currentHF: string;
    targetHF: string;
    requiredIncrease: string;
  };
  recommendedActions: PreventionAction[];
  optimalAction: PreventionAction;
}

// --- Aave Configuration ---

export const ARBITRUM_CONFIG = {
  chainId: 42161,
  aaveProtocolDataProvider: "0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654",
  poolAddress: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
};

// ABI for Aave Protocol Data Provider (only what we need)
export const dataProviderABI = [
  {
    "inputs": [{ "internalType": "address", "name": "asset", "type": "address" }],
    "name": "getReserveConfigurationData",
    "outputs": [
      { "internalType": "uint256", "name": "decimals", "type": "uint256" },
      { "internalType": "uint256", "name": "ltv", "type": "uint256" },
      { "internalType": "uint256", "name": "liquidationThreshold", "type": "uint256" },
      { "internalType": "uint256", "name": "liquidationBonus", "type": "uint256" },
      { "internalType": "uint256", "name": "reserveFactor", "type": "uint256" },
      { "internalType": "bool", "name": "usageAsCollateralEnabled", "type": "bool" },
      { "internalType": "bool", "name": "borrowingEnabled", "type": "bool" },
      { "internalType": "bool", "name": "stableBorrowRateEnabled", "type": "bool" },
      { "internalType": "bool", "name": "isActive", "type": "bool" },
      { "internalType": "bool", "name": "isFrozen", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;


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

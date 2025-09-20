import { z } from 'zod';

/**
 * Risk profile configuration
 */
export enum RiskProfile {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

/**
 * Operating mode for the agent
 */
export enum OperatingMode {
  PASSIVE = 'passive',
  ACTIVE = 'active',
}

/**
 * Position discovery mode for the agent
 */
export enum DiscoveryMode {
  SINGLE_POOL = 'single-pool',
  AUTO_DISCOVER = 'auto-discover',
}

/**
 * Configuration schema for the rebalancing agent
 */
export const AgentConfigSchema = z
  .object({
    // Operating mode
    mode: z.nativeEnum(OperatingMode).default(OperatingMode.PASSIVE),

    // Risk profile
    riskProfile: z.nativeEnum(RiskProfile).default(RiskProfile.MEDIUM),

    // Discovery mode
    discoveryMode: z.nativeEnum(DiscoveryMode).default(DiscoveryMode.AUTO_DISCOVER),

    // Pool configuration (optional when using auto-discovery)
    poolId: z.string().optional().describe('Camelot v3 pool ID (required for single-pool mode)'),
    token0: z
      .string()
      .optional()
      .describe('First token symbol (e.g., ETH) (required for single-pool mode)'),
    token1: z
      .string()
      .optional()
      .describe('Second token symbol (e.g., USDC) (required for single-pool mode)'),

    // Chain configuration for auto-discovery
    chainIds: z
      .array(z.number())
      .default([42161])
      .describe('Chain IDs to scan for positions (default: [42161] for Arbitrum)'),

    // Monitoring configuration
    checkInterval: z
      .number()
      .min(60000)
      .default(3600000)
      .describe('Check interval in milliseconds (default: 1 hour)'),

    // Rebalance triggers
    priceDeviationThreshold: z
      .number()
      .min(0.01)
      .max(1)
      .default(0.05)
      .describe('Price deviation threshold (5% default)'),
    utilizationThreshold: z
      .number()
      .min(0.1)
      .max(1)
      .default(0.8)
      .describe('Liquidity utilization threshold (80% default)'),

    // Wallet configuration
    walletPrivateKey: z.string().describe('Wallet private key for transactions'),

    // Telegram configuration
    telegramBotToken: z.string().optional().describe('Telegram bot token for notifications'),
    telegramChatId: z.string().optional().describe('Telegram chat ID for notifications'),

    // RPC configuration
    arbitrumRpcUrl: z.string().url().default('https://arb1.arbitrum.io/rpc'),

    // MCP server configuration
    emberMcpServerUrl: z.string().url().default('https://api.emberai.xyz/mcp'),

    // Subgraph configuration
    subgraphApiKey: z.string().describe('The Graph API key for subgraph access'),
  })
  .refine(
    data => {
      // If using single-pool mode, require pool configuration
      if (data.discoveryMode === DiscoveryMode.SINGLE_POOL) {
        return data.poolId && data.token0 && data.token1;
      }
      return true;
    },
    {
      message: 'Pool ID, token0, and token1 are required when using single-pool discovery mode',
      path: ['discoveryMode'],
    }
  );

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/**
 * Risk profile settings
 */
export interface RiskProfileSettings {
  // Range width multiplier (higher = wider ranges)
  rangeWidthMultiplier: number;

  // Rebalance frequency (lower = more frequent)
  rebalanceThreshold: number;

  // Maximum slippage tolerance
  maxSlippage: number;

  // Minimum position size in USD
  minPositionSize: number;
}

/**
 * Predefined risk profile configurations
 */
export const RISK_PROFILES: Record<RiskProfile, RiskProfileSettings> = {
  [RiskProfile.LOW]: {
    rangeWidthMultiplier: 2.0,
    rebalanceThreshold: 0.15, // 15%
    maxSlippage: 0.005, // 0.5%
    minPositionSize: 1000,
  },
  [RiskProfile.MEDIUM]: {
    rangeWidthMultiplier: 1.5,
    rebalanceThreshold: 0.1, // 10%
    maxSlippage: 0.01, // 1%
    minPositionSize: 500,
  },
  [RiskProfile.HIGH]: {
    rangeWidthMultiplier: 1.0,
    rebalanceThreshold: 0.05, // 5%
    maxSlippage: 0.02, // 2%
    minPositionSize: 100,
  },
};

/**
 * Pool position data
 */
export interface PoolPosition {
  positionId: string;
  poolAddress: string;
  token0: string;
  token1: string;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  amount0: string;
  amount1: string;
  fees0: string;
  fees1: string;
  isInRange: boolean;
}

/**
 * Pool state data
 */
export interface PoolState {
  poolAddress: string;
  token0: string;
  token1: string;
  fee: number;
  tick: number;
  price: string;
  liquidity: string;
  sqrtPriceX96: string;
  tvl: string;
  volume24h: string;
  feesEarned24h: string;
}

/**
 * Token market data
 */
export interface TokenMarketData {
  symbol: string;
  address: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
  volatility: number;
}

/**
 * Rebalance evaluation result
 */
export interface RebalanceEvaluation {
  positionId: string;
  poolAddress: string;
  currentPrice: number;
  priceDeviation: number;
  needsRebalance: boolean;
  currentRange: {
    lower: number;
    upper: number;
  };
  isInRange: boolean;
  liquidity: string;
  fees: {
    token0: string;
    token1: string;
  };
  // Token information for withdrawal operations
  token0: string;
  token1: string;
  token0Symbol: string;
  token1Symbol: string;
  // Position value information
  amountUSD?: string;
  tvlUSD?: {
    token0: string;
    token1: string;
  };
  recommendation?: {
    action: string;
    newRange: {
      lower: number;
      upper: number;
    };
    confidence: number;
    reasoning: string;
  };
  kpis?: any;
  llmAnalysis?: any;
  timestamp: Date;
}

/**
 * Transaction result
 */
export interface TransactionResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  gasUsed?: string;
  gasPrice?: string;
}

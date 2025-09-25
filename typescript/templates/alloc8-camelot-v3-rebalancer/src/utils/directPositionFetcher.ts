import { request, gql } from 'graphql-request';
import type { PoolPosition } from '../config/types.js';
import {
  calculatePriceRange,
  calculatePriceDeviation,
  isInRange as checkInRange,
  calculateUtilizationRate,
  tickToPrice,
} from './priceCalculations.js';
import { loadAgentConfig } from '../config/index.js';

// Get subgraph URL from environment variable
function getSubgraphUrl(): string {
  const config = loadAgentConfig();
  const apiKey = config.subgraphApiKey;
  console.log('🔍 Subgraph API Key:', apiKey);
  if (!apiKey) {
    throw new Error('SUBRAPH_API_KEY environment variable is required');
  }
  return `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/3utanEBA9nqMjPnuQP1vMCCys6enSM3EawBpKTVwnUw2`;
}

// -------------------- Type Definitions --------------------
interface Token {
  id: string;
  symbol: string;
  decimals: string;
  totalValueLocked: string;
  totalValueLockedUSD: string;
}

interface Pool {
  id: string;
  tick: string;
  token0: Token;
  token1: Token;
  feesToken0: string;
  feesToken1: string;
  feesUSD: string;
  token0Price: string;
  token1Price: string;
  tickSpacing: string;
  sqrtPrice?: string;
}

interface MintOrBurn {
  tickLower: string;
  tickUpper: string;
  amount0?: string;
  amount1?: string;
  amountUSD?: string;
}

interface Transaction {
  mints: MintOrBurn[];
  burns: MintOrBurn[];
}

interface RawPosition {
  id: string;
  pool: Pool;
  transaction: Transaction;
}

// -------------------- Enhanced Position Type --------------------
export interface EnhancedPoolPosition extends PoolPosition {
  chainId: number;
  token0Symbol?: string;
  token1Symbol?: string;
  token0Decimals?: number;
  token1Decimals?: number;
  currentPrice?: string;
  priceRange?: {
    lower: number;
    upper: number;
  };
  utilizationRate?: number;
  feesUSD?: string;
  tvlUSD?: {
    token0: string;
    token1: string;
  };
  amountUSD?: string;
  currentTick?: number;
  tickSpacing?: number;
  sqrtPrice?: string;
}

// -------------------- GraphQL Query --------------------
const ACTIVE_POSITIONS_QUERY = gql`
  query ActivePositions($wallet: String!) {
    positions(where: { owner: $wallet }) {
      id
      pool {
        id
        tick
        token0 {
          id
          symbol
          decimals
          totalValueLocked
          totalValueLockedUSD
        }
        token1 {
          id
          symbol
          decimals
          totalValueLocked
          totalValueLockedUSD
        }
        feesToken0
        feesToken1
        feesUSD
        token0Price
        token1Price
        tickSpacing
        sqrtPrice
      }
      transaction {
        mints {
          tickLower
          tickUpper
          amount0
          amount1
          amountUSD
        }
        burns {
          tickLower
          tickUpper
        }
      }
    }
  }
`;

// -------------------- Fetch Function --------------------
export async function fetchActivePositions(wallet: string): Promise<EnhancedPoolPosition[]> {
  try {
    console.log(`🔍 Fetching positions from Camelot v3 subgraph for wallet: ${wallet}`);

    const data = await request<{ positions: RawPosition[] }>(
      getSubgraphUrl(),
      ACTIVE_POSITIONS_QUERY,
      { wallet: wallet.toLowerCase() }
    );

    // Filter only active positions (no burn events)
    const activePositions = data.positions.filter(pos => pos.transaction.burns.length === 0);

    console.log(`📍 Found ${activePositions.length} active positions`);

    if (activePositions.length === 0) {
      console.log('ℹ️  No active positions found for this wallet.');
      return [];
    }

    // Convert raw positions to our enhanced format
    const enhancedPositions: EnhancedPoolPosition[] = activePositions.map(pos => {
      const pool = pos.pool;
      const mint = pos.transaction.mints[0]; // assuming first mint is the main range

      if (!mint) {
        throw new Error(`No mint data found for position ${pos.id}`);
      }

      // Calculate price range from ticks
      const tickLower = parseInt(mint.tickLower);
      const tickUpper = parseInt(mint.tickUpper);
      const currentTick = parseInt(pool.tick);
      const token0Decimals = parseInt(pool.token0.decimals);
      const token1Decimals = parseInt(pool.token1.decimals);

      // Calculate proper price range using the utility function
      const priceRange = calculatePriceRange(tickLower, tickUpper, token0Decimals, token1Decimals);

      // Calculate utilization rate using the utility function
      const utilizationRate = calculateUtilizationRate(currentTick, tickLower, tickUpper);

      // Determine if position is in range using the utility function
      const positionInRange = checkInRange(currentTick, tickLower, tickUpper);

      // Calculate liquidity (simplified - in real implementation you'd need more complex calculation)
      const liquidity = positionInRange ? '1000000' : '0'; // Placeholder

      // Get actual amounts from mint data
      const amount0 = mint.amount0 || '0';
      const amount1 = mint.amount1 || '0';
      const amountUSD = mint.amountUSD || '0';

      const enhancedPosition: EnhancedPoolPosition = {
        positionId: pos.id,
        poolAddress: pool.id,
        token0: pool.token0.id,
        token1: pool.token1.id,
        tickLower,
        tickUpper,
        liquidity,
        amount0,
        amount1,
        fees0: pool.feesToken0,
        fees1: pool.feesToken1,
        isInRange: positionInRange,
        chainId: 42161, // Arbitrum
        token0Symbol: pool.token0.symbol,
        token1Symbol: pool.token1.symbol,
        token0Decimals: parseInt(pool.token0.decimals),
        token1Decimals: parseInt(pool.token1.decimals),
        currentPrice: pool.token0Price,
        priceRange,
        utilizationRate,
        feesUSD: pool.feesUSD,
        currentTick: currentTick,
        tickSpacing: parseInt(pool.tickSpacing),
        sqrtPrice: pool.sqrtPrice,
        // Use actual position amounts from subgraph
        amountUSD: amountUSD,
        // Calculate TVL from actual position amounts
        tvlUSD: {
          token0: amount0,
          token1: amount1,
        },
      };

      return enhancedPosition;
    });

    // Log position details
    console.log(`\n🟢 Active positions for wallet: ${wallet}`);
    enhancedPositions.forEach(pos => {
      const symbolPair =
        pos.token0Symbol && pos.token1Symbol
          ? `${pos.token0Symbol}/${pos.token1Symbol}`
          : `${pos.token0.slice(0, 6)}.../${pos.token1.slice(0, 6)}...`;

      console.log('------------------------------------');
      console.log(`Position ID: ${pos.positionId}`);
      console.log(`Pool ID: ${pos.poolAddress}`);
      console.log(`Token0: ${pos.token0Symbol} (${pos.token0})`);
      console.log(`Token1: ${pos.token1Symbol} (${pos.token1})`);
      console.log(`Liquidity range: [${pos.tickLower}, ${pos.tickUpper}]`);
      console.log(`Fees USD: ${pos.feesUSD}`);
      console.log(`Token0 Price: ${pos.currentPrice}`);
      console.log(`In Range: ${pos.isInRange ? '✅' : '❌'}`);
      console.log(
        `Position Utilization: ${pos.utilizationRate ? (pos.utilizationRate * 100).toFixed(2) + '%' : 'N/A'}`
      );

      if (pos.priceRange) {
        console.log(
          `Price Range: ${pos.priceRange.lower.toFixed(6)} - ${pos.priceRange.upper.toFixed(6)}`
        );
      }

      if (pos.amountUSD) {
        console.log(`Position Value: $${pos.amountUSD} USD`);
      }

      if (pos.amount0 && pos.amount1) {
        console.log(`Amount0: ${pos.amount0}`);
        console.log(`Amount1: ${pos.amount1}`);
      }

      if (pos.tvlUSD) {
        console.log(`TVL Token0: ${pos.tvlUSD.token0} USD`);
        console.log(`TVL Token1: ${pos.tvlUSD.token1} USD`);
      }
    });

    return enhancedPositions;
  } catch (error) {
    console.error('❌ Error fetching positions from subgraph:', error);
    throw error;
  }
}

// -------------------- Multiple Wallets Function --------------------
export async function fetchMultipleWalletPositions(
  walletAddresses: string[]
): Promise<EnhancedPoolPosition[]> {
  const allPositions: EnhancedPoolPosition[] = [];

  for (const wallet of walletAddresses) {
    try {
      const positions = await fetchActivePositions(wallet);
      allPositions.push(...positions);
    } catch (error) {
      console.error(`❌ Error fetching positions for wallet ${wallet}:`, error);
      // Continue with other wallets
    }
  }

  return allPositions;
}

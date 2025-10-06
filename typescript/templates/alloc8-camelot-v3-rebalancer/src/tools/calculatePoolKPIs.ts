import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { Task, Message } from '@google-a2a/types';
import type { RebalancerContext } from '../context/types.js';
import { request, gql } from 'graphql-request';
import { loadAgentConfig } from '../config/index.js';

const calculatePoolKPIsParametersSchema = z.object({
  poolAddress: z.string().describe('Pool address to calculate KPIs for'),
  positionRange: z
    .object({
      lower: z.number().describe('Lower tick of the position'),
      upper: z.number().describe('Upper tick of the position'),
    })
    .describe('Position range in ticks'),
  currentPrice: z.number().describe('Current price (token1 per token0)'),
  tickSpacing: z.number().optional().default(1).describe('Pool tick spacing'),
});

type CalculatePoolKPIsParams = z.infer<typeof calculatePoolKPIsParametersSchema>;

// GraphQL queries for different data types
const LIQUIDITY_QUERY = gql`
  query PoolLiquidity($poolId: String!) {
    pool(id: $poolId) {
      id
      tick
      totalValueLockedToken0
      totalValueLockedToken1
      totalValueLockedUSD
      liquidityProviderCount
      txCount
      ticks(first: 1000, orderBy: tickIdx, orderDirection: asc) {
        tickIdx
        liquidityNet
        liquidityGross
      }
    }
  }
`;

const PRICE_HISTORY_QUERY = gql`
  query PoolPriceHistory($poolId: String!, $days: Int!) {
    pool(id: $poolId) {
      id
      poolHourData(first: $days, orderBy: periodStartUnix, orderDirection: desc) {
        periodStartUnix
        token0Price
        token1Price
        volumeUSD
        feesUSD
      }
    }
  }
`;

const VOLUME_QUERY = gql`
  query PoolVolume($poolId: String!) {
    pool(id: $poolId) {
      id
      totalValueLockedUSD
      poolDayData(first: 30, orderBy: date, orderDirection: desc) {
        date
        volumeUSD
        feesUSD
        tvlUSD
      }
    }
  }
`;

// Get subgraph URL from environment variable
function getSubgraphUrl(): string {
  const config = loadAgentConfig();
  const apiKey = config.subgraphApiKey;
  if (!apiKey) {
    throw new Error('SUBRAPH_API_KEY environment variable is required');
  }
  return `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/3utanEBA9nqMjPnuQP1vMCCys6enSM3EawBpKTVwnUw2`;
}

/**
 * Calculate hourly LP dashboard KPIs
 */
function calculateHourlyLPDashboard(
  liquidityData: any,
  priceData: any,
  currentPrice: number,
  positionRange: { lower: number; upper: number },
  tickSpacing: number = 1
) {
  // Liquidity metrics
  const pool = (liquidityData as any)?.pool || {};
  const ticks = pool.ticks || [];

  // Use current tick directly from subgraph data
  const currentTick = parseInt(pool.tick || '0');

  console.log(`🔍 Current tick from subgraph: ${pool.tick} (parsed: ${currentTick})`);

  console.log(`🔍 Pool data analysis:`);
  console.log(`   - Pool object keys:`, Object.keys(pool));
  console.log(`   - Pool ticks count: ${ticks.length}`);
  console.log(`   - Sample ticks:`, ticks.slice(0, 3));
  

  const liquidityValues = ticks
    .filter((tick: any) => parseInt(tick.liquidityNet) !== 0)
    .map((tick: any) => Math.abs(parseInt(tick.liquidityNet)));
  const tickIndices = ticks
    .filter((tick: any) => parseInt(tick.liquidityNet) !== 0)
    .map((tick: any) => parseInt(tick.tickIdx));

  console.log(`   - Filtered ticks count: ${liquidityValues.length}`);
  console.log(`   - Sample liquidity values:`, liquidityValues.slice(0, 3));
  console.log(`   - Sample tick indices:`, tickIndices.slice(0, 3));

  const totalLiquidity = liquidityValues.reduce((sum: number, val: number) => sum + val, 0);

  // Active liquidity in position range
  const { lower, upper } = positionRange;
  const activeLiquidity = tickIndices
    .map((tick: number, i: number) => (lower <= tick && tick <= upper ? liquidityValues[i] : 0))
    .reduce((sum: number, val: number) => sum + val, 0);

  const liquidityUtilization = totalLiquidity > 0 ? activeLiquidity / totalLiquidity : 0;

  // Debug logging
  console.log(`🔍 KPI Debug:`);
  console.log(`   - Total liquidity: ${totalLiquidity}`);
  console.log(`   - Active liquidity: ${activeLiquidity}`);
  console.log(`   - Position range: [${lower}, ${upper}]`);
  console.log(`   - Current tick: ${currentTick}`);
  console.log(`   - Liquidity utilization: ${liquidityUtilization}`);

  // Concentration around current price (top 10% ticks)
  const numTicks = liquidityValues.length;
  const topN = Math.max(1, Math.floor(numTicks * 0.1));
  const sortedLiquidity = [...liquidityValues].sort((a, b) => b - a);
  const topTicksLiq = sortedLiquidity.slice(0, topN).reduce((sum, val) => sum + val, 0);
  const topTicksPercent = totalLiquidity > 0 ? (topTicksLiq / totalLiquidity) * 100 : 0;

  // Liquidity skew
  const below = tickIndices
    .map((tick: number, i: number) => (tick < currentTick ? liquidityValues[i] : 0))
    .reduce((sum: number, val: number) => sum + val, 0);
  const above = tickIndices
    .map((tick: number, i: number) => (tick > currentTick ? liquidityValues[i] : 0))
    .reduce((sum: number, val: number) => sum + val, 0);
  const totalAboveBelow = above + below;
  const liquiditySkew = totalAboveBelow > 0 ? (above - below) / totalAboveBelow : 0;

  // Token ratios
  const tvlToken0 = parseFloat(pool.totalValueLockedToken0 || '0');
  const tvlToken1 = parseFloat(pool.totalValueLockedToken1 || '0');
  const totalTvl = tvlToken0 + tvlToken1;
  const token0Ratio = totalTvl > 0 ? tvlToken0 / totalTvl : 0;
  const token1Ratio = totalTvl > 0 ? tvlToken1 / totalTvl : 0;

  // Price & volatility metrics
  const poolHourData = priceData?.pool?.poolHourData || [];
  let token0Vol = 0;
  let token1Vol = 0;
  let priceChange = 0;

  if (poolHourData.length > 0) {
    const prices = poolHourData
      .map((hour: any) => ({
        token0Price: parseFloat(hour.token0Price || '0'),
        token1Price: parseFloat(hour.token1Price || '0'),
      }))
      .filter((p: any) => !isNaN(p.token0Price) && !isNaN(p.token1Price));

    if (prices.length > 1) {
      // Calculate percentage changes
      const token0Changes = [];
      const token1Changes = [];

      for (let i = 1; i < prices.length; i++) {
        const prev = prices[i];
        const curr = prices[i - 1];
        if (prev.token0Price > 0 && curr.token0Price > 0) {
          token0Changes.push((curr.token0Price - prev.token0Price) / prev.token0Price);
        }
        if (prev.token1Price > 0 && curr.token1Price > 0) {
          token1Changes.push((curr.token1Price - prev.token1Price) / prev.token1Price);
        }
      }

      // Latest price change
      if (token0Changes.length > 0 && token1Changes.length > 0) {
        priceChange = (token0Changes[0]! + token1Changes[0]!) / 2;
      }

      // Volatility (last 24 hours or available data)
      const volWindow = Math.min(24, token0Changes.length);
      if (volWindow > 0) {
        const token0Std = calculateStandardDeviation(token0Changes.slice(0, volWindow));
        const token1Std = calculateStandardDeviation(token1Changes.slice(0, volWindow));
        token0Vol = token0Std;
        token1Vol = token1Std;
      }
    }
  }

  // Range & risk metrics
  const lowerDist = currentTick - lower;
  const upperDist = upper - currentTick;

  // Impermanent loss estimation (simplified)
  const lastPrice = poolHourData.length > 0 ? parseFloat(poolHourData[0].token0Price || '1') : 1;
  const priceRatio = currentPrice / lastPrice;
  const impermanentLossEst = Math.abs(priceRatio - 1) * 100;

  return {
    current_price: currentPrice,
    hourly_price_change_pct: Math.round(priceChange * 100 * 10000) / 10000,
    token0_hourly_volatility: Math.round(token0Vol * 10000) / 10000,
    token1_hourly_volatility: Math.round(token1Vol * 10000) / 10000,
    active_liquidity_in_range: activeLiquidity,
    liquidity_utilization_pct: Math.round(liquidityUtilization * 100 * 100) / 100,
    top_10pct_tick_liquidity_pct: Math.round(topTicksPercent * 100) / 100,
    liquidity_skew: Math.round(liquiditySkew * 10000) / 10000,
    token0_ratio: Math.round(token0Ratio * 10000) / 10000,
    token1_ratio: Math.round(token1Ratio * 10000) / 10000,
    distance_to_lower_tick: lowerDist,
    distance_to_upper_tick: upperDist,
    impermanent_loss_est_pct: Math.round(impermanentLossEst * 100) / 100,
  };
}

/**
 * Calculate volume and fee analysis
 */
function calculateVolumeFeeAnalysis(volumeData: any) {
  const poolData = volumeData?.pool || {};
  const poolDayData = poolData.poolDayData || [];

  if (poolDayData.length === 0) {
    return {
      total_vol_usd: 0.0,
      total_fees_usd: 0.0,
      avg_fee_rate: 0.0,
      avg_tvl_usd: 0.0,
      avg_daily_vol_usd: 0.0,
      fee_tier: 0.0,
      txn_count: 0,
    };
  }

  const totalVolume = poolDayData.reduce(
    (sum: number, day: any) => sum + parseFloat(day.volumeUSD || '0'),
    0
  );
  const totalFees = poolDayData.reduce(
    (sum: number, day: any) => sum + parseFloat(day.feesUSD || '0'),
    0
  );
  const avgFeeRate = totalVolume > 0 ? totalFees / totalVolume : 0;

  // Fix avgTvl computation - aggregate over poolDayData
  const totalTvl = poolDayData.reduce(
    (sum: number, day: any) => sum + parseFloat(day.tvlUSD || '0'),
    0
  );
  const avgTvl =
    poolDayData.length > 0
      ? totalTvl / poolDayData.length
      : parseFloat(poolData.totalValueLockedUSD || '0');

  const avgDailyVol = poolDayData.length > 0 ? totalVolume / poolDayData.length : 0;
  const feeTier = 0; // Remove feeZtO reference
  const txnCount = parseInt(poolData.txCount || '0');

  return {
    total_vol_usd: Math.round(totalVolume * 100) / 100,
    total_fees_usd: Math.round(totalFees * 100) / 100,
    avg_fee_rate: Math.round(avgFeeRate * 1000000) / 1000000,
    avg_tvl_usd: Math.round(avgTvl * 100) / 100,
    avg_daily_vol_usd: Math.round(avgDailyVol * 100) / 100,
    fee_tier: feeTier,
    txn_count: txnCount,
  };
}

/**
 * Calculate extended LP KPIs
 */
function calculateLPKPIs(
  liquidityData: any,
  topTicksPercent: number = 10,
  currentPriceTick?: number
) {
  const pool = liquidityData?.pool || {};
  const ticks = pool.ticks || [];
  const liquidityValues = ticks
    .filter((tick: any) => parseInt(tick.liquidityNet) !== 0)
    .map((tick: any) => Math.abs(parseInt(tick.liquidityNet)));
  const tickIndices = ticks
    .filter((tick: any) => parseInt(tick.liquidityNet) !== 0)
    .map((tick: any) => parseInt(tick.tickIdx));

  const totalLiquidity = liquidityValues.reduce((sum: number, val: number) => sum + val, 0);
  const numTicks = liquidityValues.length;
  const liquidityProviderCount = parseInt(pool.liquidityProviderCount || '1');

  // HHI (Herfindahl-Hirschman Index)
  const normalizedLiquidity =
    totalLiquidity > 0 ? liquidityValues.map((liq: number) => liq / totalLiquidity) : [0];
  const hhi = normalizedLiquidity.reduce((sum: number, val: number) => sum + val * val, 0);

  // Gini coefficient
  const sortedLiq = [...normalizedLiquidity].sort((a, b) => a - b);
  const n = sortedLiq.length;
  let gini = 0;
  if (n > 0) {
    const numerator = 2 * sortedLiq.reduce((sum, liq, i) => sum + (i + 1) * liq, 0);
    const denominator = n * sortedLiq.reduce((sum, liq) => sum + liq, 0);
    gini = numerator / denominator - (n + 1) / n;
  }

  // Active tick range width
  const activeRange =
    tickIndices.length > 0 ? Math.max(...tickIndices) - Math.min(...tickIndices) : 0;

  // Average liquidity per tick
  const avgLiqPerTick = numTicks > 0 ? totalLiquidity / numTicks : 0;

  // Top X% tick liquidity
  const topN = Math.max(1, Math.floor((numTicks * topTicksPercent) / 100));
  const sortedLiquidity = [...liquidityValues].sort((a, b) => b - a);
  const topTicksLiq = sortedLiquidity.slice(0, topN).reduce((sum, val) => sum + val, 0);
  const topTicksPercentLiq = totalLiquidity > 0 ? (topTicksLiq / totalLiquidity) * 100 : 0;

  // Average liquidity per LP
  const avgLiqPerLp = liquidityProviderCount > 0 ? totalLiquidity / liquidityProviderCount : 0;

  // Token composition ratios
  const tvlToken0 = parseFloat(pool.totalValueLockedToken0 || '0');
  const tvlToken1 = parseFloat(pool.totalValueLockedToken1 || '0');
  const totalTvl = tvlToken0 + tvlToken1;
  const token0Ratio = totalTvl > 0 ? tvlToken0 / totalTvl : 0;
  const token1Ratio = totalTvl > 0 ? tvlToken1 / totalTvl : 0;

  // Liquidity skew around current price
  let skew = null;
  if (currentPriceTick !== undefined) {
    const below = tickIndices
      .map((tick: number, i: number) => (tick < currentPriceTick ? liquidityValues[i] : 0))
      .reduce((sum: number, val: number) => sum + val, 0);
    const above = tickIndices
      .map((tick: number, i: number) => (tick > currentPriceTick ? liquidityValues[i] : 0))
      .reduce((sum: number, val: number) => sum + val, 0);
    const total = below + above;
    skew = total > 0 ? (above - below) / total : 0;
  }

  return {
    HHI: Math.round(hhi * 10000) / 10000,
    Gini_Coefficient: Math.round(gini * 10000) / 10000,
    Active_Tick_Range: activeRange,
    Average_Liquidity_per_Tick: Math.round(avgLiqPerTick * 100) / 100,
    [`Top_${topTicksPercent}pct_Tick_Liquidity_pct`]: Math.round(topTicksPercentLiq * 100) / 100,
    Average_Liquidity_per_LP: Math.round(avgLiqPerLp * 100) / 100,
    Token0_Ratio: Math.round(token0Ratio * 10000) / 10000,
    Token1_Ratio: Math.round(token1Ratio * 10000) / 10000,
    Liquidity_Skew: skew !== null ? Math.round(skew * 10000) / 10000 : null,
  };
}

/**
 * Helper function to calculate standard deviation
 */
function calculateStandardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Calculate pool KPIs tool
 */
export const calculatePoolKPIsTool: VibkitToolDefinition<
  typeof calculatePoolKPIsParametersSchema,
  Task | Message,
  RebalancerContext
> = {
  name: 'calculatePoolKPIs',
  description:
    'Calculate comprehensive KPIs for a Camelot v3 pool including liquidity, price, and volume metrics',
  parameters: calculatePoolKPIsParametersSchema,

  execute: async (params: CalculatePoolKPIsParams, context: { custom: RebalancerContext }) => {
    try {
      console.log(`🔍 Calculating KPIs for pool ${params.poolAddress}...`);

      // Fetch data from subgraph
      console.log(`🔍 Fetching data for pool: ${params.poolAddress}`);

      // Test with lowercase pool address
      const poolId = params.poolAddress.toLowerCase();
      console.log(`🔍 Using pool ID: ${poolId}`);

      const [liquidityData, priceData, volumeData] = await Promise.all([
        request(getSubgraphUrl(), LIQUIDITY_QUERY, { poolId }).catch(err => {
          console.error('❌ Error fetching liquidity data:', err);
          return { data: { pool: null } };
        }),
        request(getSubgraphUrl(), PRICE_HISTORY_QUERY, { poolId, days: 24 }).catch(err => {
          console.error('❌ Error fetching price data:', err);
          return { data: { pool: null } };
        }),
        request(getSubgraphUrl(), VOLUME_QUERY, { poolId }).catch(err => {
          console.error('❌ Error fetching volume data:', err);
          return { data: { pool: null } };
        }),
      ]);

      // Debug: Check for GraphQL errors
      if ((liquidityData as any)?.errors) {
        console.error('❌ GraphQL errors in liquidity data:', (liquidityData as any).errors);
      }
      if ((priceData as any)?.errors) {
        console.error('❌ GraphQL errors in price data:', (priceData as any).errors);
      }
      if ((volumeData as any)?.errors) {
        console.error('❌ GraphQL errors in volume data:', (volumeData as any).errors);
      }

      // Use current tick directly from subgraph data
      const pool = (liquidityData as any)?.pool || {};
      const currentPriceTick = parseInt(pool.tick || '0');

      console.log(`🔍 Current tick from subgraph: ${pool.tick} (parsed: ${currentPriceTick})`);

      // Calculate all KPI categories
      const liquidityMetrics = calculateLPKPIs(liquidityData, 10, currentPriceTick);
      const priceMetrics = calculateHourlyLPDashboard(
        liquidityData,
        priceData,
        params.currentPrice,
        params.positionRange,
        params.tickSpacing
      );
      const volumeFeeMetrics = calculateVolumeFeeAnalysis(volumeData);

      // Combine all KPIs
      const finalKPIs = {
        pool_address: params.poolAddress,
        position_range: params.positionRange,
        current_price: params.currentPrice,
        current_tick: currentPriceTick,
        liquidity_metrics: liquidityMetrics,
        price_metrics: priceMetrics,
        volume_fee_metrics: volumeFeeMetrics,
        calculated_at: new Date().toISOString(),
      };

      console.log(`✅ Calculated KPIs for pool ${params.poolAddress}`);
      console.log(`   - Liquidity utilization: ${priceMetrics.liquidity_utilization_pct}%`);
      console.log(`   - Price change: ${priceMetrics.hourly_price_change_pct}%`);
      console.log(`   - Volatility: ${priceMetrics.token0_hourly_volatility}`);
      console.log(`   - Impermanent loss: ${priceMetrics.impermanent_loss_est_pct}%`);

      return createSuccessTask(
        'calculatePoolKPIs',
        [
          {
            artifactId: 'pool-kpis-' + Date.now(),
            parts: [{ kind: 'text', text: JSON.stringify(finalKPIs, null, 2) }],
          },
        ],
        'Pool KPIs calculated successfully'
      );
    } catch (error) {
      console.error('❌ Error calculating pool KPIs:', error);
      return createErrorTask(
        'calculatePoolKPIs',
        error instanceof Error ? error : new Error(`Failed to calculate KPIs: ${error}`)
      );
    }
  },
};

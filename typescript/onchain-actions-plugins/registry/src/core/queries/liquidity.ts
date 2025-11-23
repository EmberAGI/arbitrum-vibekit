import type {
  GetLiquidityPoolsResponse,
  GetWalletLiquidityPositionsRequest,
  GetWalletLiquidityPositionsResponse,
} from '../schemas/liquidity.js';

/**
 * Optional hints for fetching liquidity pools. includePrices defaults to true when omitted,
 * and an empty or undefined poolAddresses array means no filtering.
 */
export type LiquidityGetPoolsOptions = {
  includePrices?: boolean;
  poolAddresses?: string[];
};

/**
 * Optional hints for fetching wallet liquidity positions. includePrices defaults to true when omitted,
 * and an empty or undefined positionIds array means no filtering.
 */
export type LiquidityGetWalletPositionsOptions = GetWalletLiquidityPositionsRequest;

/**
 * Get liquidity positions for a wallet.
 */
export type LiquidityGetWalletPositions = (
  options?: LiquidityGetWalletPositionsOptions
) => Promise<GetWalletLiquidityPositionsResponse>;

/**
 * Get all liquidity pools.
 */
export type LiquidityGetPools = (
  options?: LiquidityGetPoolsOptions
) => Promise<GetLiquidityPoolsResponse>;

/**
 * All the queries related to liquidity.
 */
export type LiquidityQueries = {
  getWalletPositions: LiquidityGetWalletPositions;
  getPools: LiquidityGetPools;
};

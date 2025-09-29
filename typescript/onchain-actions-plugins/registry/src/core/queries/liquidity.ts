import type {
  GetLiquidityPoolsResponse,
  GetWalletLiquidityPositionsRequest,
  GetWalletLiquidityPositionsResponse,
} from '../schemas/liquidity.js';

/**
 * Get liquidity positions for a wallet.
 */
export type LiquidityGetWalletPositions = (
  request: GetWalletLiquidityPositionsRequest
) => Promise<GetWalletLiquidityPositionsResponse>;

/**
 * Get all liquidity pools.
 */
export type LiquidityGetPools = () => Promise<GetLiquidityPoolsResponse>;

/**
 * All the queries related to liquidity.
 */
export type LiquidityQueries = {
  getWalletPositions: LiquidityGetWalletPositions;
  getPools: LiquidityGetPools;
};

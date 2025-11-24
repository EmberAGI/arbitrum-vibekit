/**
 * User position queries for Radiant V2 Lending Protocol
 * 
 * This module fetches user-specific lending data including:
 * - Total collateral and debt values
 * - Health factor (liquidation risk indicator)
 * - Individual asset positions (supplied and borrowed amounts)
 * 
 * Health Factor:
 * - > 1.0: Position is safe
 * - = 1.0: Position is at liquidation threshold
 * - < 1.0: Position can be liquidated
 */

import { createPublicClient, http, parseAbi } from 'viem';
import { arbitrum } from 'viem/chains';
import { RADIANT_CONFIG } from '../radiant.config.js';

/**
 * User's complete lending position
 */
export type UserPosition = {
  address: string;              // User's wallet address
  healthFactor: string;         // Health factor (scaled by 1e18, e.g., "1500000000000000000" = 1.5)
  totalCollateralUSD: string;   // Total collateral value in USD (scaled by 1e8)
  totalDebtUSD: string;         // Total debt value in USD (scaled by 1e8)
  positions: {
    asset: string;              // Asset symbol (e.g., "USDC")
    supplied: string;           // Amount supplied (in smallest unit)
    borrowed: string;           // Amount borrowed (in smallest unit)
  }[];
};

/**
 * Public client for reading from Arbitrum blockchain
 */
const client = createPublicClient({
  chain: arbitrum,
  transport: http(RADIANT_CONFIG.rpcUrl)
});

/**
 * List of supported assets to check for user positions
 */
const KNOWN_ASSETS = [
  { symbol: 'WETH', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' },
  { symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
  { symbol: 'USDT', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' },
  { symbol: 'WBTC', address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' },
  { symbol: 'ARB', address: '0x912CE59144191C1204E64559FE8253a0e49E6548' }
];

/**
 * ABI for Radiant's LendingPool contract
 * Used to fetch user account summary data
 */
const poolAbi = parseAbi([
  'function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)'
]);

/**
 * ABI for Radiant's PoolDataProvider contract
 * Used to fetch user's reserve-specific data
 */
const dataProviderAbi = parseAbi([
  'function getUserReserveData(address asset, address user) external view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)'
]);

/**
 * Fetch user's complete lending position
 * 
 * This function queries:
 * 1. Overall account data (collateral, debt, health factor)
 * 2. Individual asset positions (supplied and borrowed amounts)
 * 
 * Only returns positions where the user has non-zero supplied or borrowed amounts.
 * 
 * @param address - User's wallet address
 * @returns Complete user position data
 */
export async function getUserPosition(address: string): Promise<UserPosition> {
  // Fetch overall account summary
  const accountData = await client.readContract({
    address: RADIANT_CONFIG.addresses.lendingPool as `0x${string}`,
    abi: poolAbi,
    functionName: 'getUserAccountData',
    args: [address as `0x${string}`]
  });

  // Fetch individual asset positions in parallel
  const positions = await Promise.all(
    KNOWN_ASSETS.map(async (asset) => {
      try {
        const userData = await client.readContract({
          address: RADIANT_CONFIG.addresses.dataProvider as `0x${string}`,
          abi: dataProviderAbi,
          functionName: 'getUserReserveData',
          args: [asset.address as `0x${string}`, address as `0x${string}`]
        });

        return {
          asset: asset.symbol,
          supplied: userData[0].toString(),  // currentATokenBalance
          borrowed: userData[2].toString()   // currentVariableDebt
        };
      } catch (error) {
        // Return null if asset data cannot be fetched
        return null;
      }
    })
  );

  return {
    address,
    healthFactor: accountData[5].toString(),
    totalCollateralUSD: accountData[0].toString(),
    totalDebtUSD: accountData[1].toString(),
    // Only include positions with non-zero balances
    positions: positions.filter((p): p is { asset: string; supplied: string; borrowed: string } => 
      p !== null && (p.supplied !== '0' || p.borrowed !== '0')
    )
  };
}

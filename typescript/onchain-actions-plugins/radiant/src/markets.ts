/**
 * Market data queries for Radiant V2 Lending Protocol
 * 
 * This module fetches real-time market information including:
 * - Supply and borrow APRs
 * - Available liquidity
 * - Asset prices
 * - Loan-to-value ratios
 * - Liquidation thresholds
 * 
 * Data is fetched directly from Radiant's on-chain contracts using viem.
 */

import { createPublicClient, http, parseAbi } from 'viem';
import { arbitrum } from 'viem/chains';
import { RADIANT_CONFIG } from '../radiant.config.js';

/**
 * Market information for a single asset
 */
export type MarketInfo = {
  symbol: string;              // Token symbol (e.g., "USDC")
  address: string;             // Token contract address
  decimals: number;            // Token decimals (e.g., 6 for USDC, 18 for WETH)
  ltv: number;                 // Loan-to-value ratio (max borrow % of collateral value)
  liquidationThreshold: number; // Liquidation threshold (position liquidated if exceeded)
  supplyAPR: string;           // Annual percentage rate for suppliers
  borrowAPR: string;           // Annual percentage rate for borrowers
  liquidity: string;           // Available liquidity in the pool (in smallest unit)
  price: string;               // Asset price in USD (scaled by 1e18)
};

/**
 * Public client for reading from Arbitrum blockchain
 */
const client = createPublicClient({
  chain: arbitrum,
  transport: http(RADIANT_CONFIG.rpcUrl)
});

/**
 * List of supported assets on Radiant V2
 * These are the main liquid assets available for lending/borrowing
 */
const KNOWN_ASSETS = [
  { symbol: 'WETH', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' },
  { symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
  { symbol: 'USDT', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' },
  { symbol: 'WBTC', address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' },
  { symbol: 'ARB', address: '0x912CE59144191C1204E64559FE8253a0e49E6548' }
];

/**
 * ABI for Radiant's PoolDataProvider contract
 * Used to fetch reserve configuration and market data
 */
const dataProviderAbi = parseAbi([
  'function getReserveConfigurationData(address asset) external view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)',
  'function getReserveData(address asset) external view returns (uint256 availableLiquidity, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)'
]);

/**
 * ABI for Radiant's PriceOracle contract
 * Used to fetch asset prices in USD
 */
const oracleAbi = parseAbi([
  'function getAssetPrice(address asset) external view returns (uint256)'
]);

/**
 * Fetch market data for all supported assets
 * 
 * This function queries on-chain contracts to get real-time market information.
 * APR calculations use the RAY unit (1e27) which is standard in Aave-based protocols.
 * 
 * @returns Array of market information for each supported asset
 */
export async function fetchMarkets(): Promise<MarketInfo[]> {
  const markets = await Promise.all(
    KNOWN_ASSETS.map(async (asset) => {
      try {
        // Fetch configuration, reserve data, and price in parallel
        const [config, data, price] = await Promise.all([
          client.readContract({
            address: RADIANT_CONFIG.addresses.dataProvider as `0x${string}`,
            abi: dataProviderAbi,
            functionName: 'getReserveConfigurationData',
            args: [asset.address as `0x${string}`]
          }),
          client.readContract({
            address: RADIANT_CONFIG.addresses.dataProvider as `0x${string}`,
            abi: dataProviderAbi,
            functionName: 'getReserveData',
            args: [asset.address as `0x${string}`]
          }),
          client.readContract({
            address: RADIANT_CONFIG.addresses.oracle as `0x${string}`,
            abi: oracleAbi,
            functionName: 'getAssetPrice',
            args: [asset.address as `0x${string}`]
          })
        ]);

        // Convert rates from RAY (1e27) to APR percentage
        // Formula: (rate * 100 * seconds_per_year) / RAY
        const RAY = 10n ** 27n;
        const SECONDS_PER_YEAR = 31536000n;
        const supplyAPR = ((data[3] * 100n * SECONDS_PER_YEAR) / RAY).toString();
        const borrowAPR = ((data[4] * 100n * SECONDS_PER_YEAR) / RAY).toString();

        return {
          symbol: asset.symbol,
          address: asset.address,
          decimals: Number(config[0]),
          ltv: Number(config[1]) / 100,  // Convert from basis points
          liquidationThreshold: Number(config[2]) / 100,  // Convert from basis points
          supplyAPR: (Number(supplyAPR) / 100).toFixed(2),
          borrowAPR: (Number(borrowAPR) / 100).toFixed(2),
          liquidity: data[0].toString(),
          price: price.toString()
        };
      } catch (error) {
        // Return null if asset data cannot be fetched (e.g., not active)
        return null;
      }
    })
  );

  // Filter out null values (failed fetches)
  return markets.filter((m): m is MarketInfo => m !== null);
}

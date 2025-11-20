import { createPublicClient, http, parseAbi } from 'viem';
import { arbitrum } from 'viem/chains';
import { RADIANT_CONFIG } from '../radiant.config.js';

export type UserPosition = {
  address: string;
  healthFactor: string;
  totalCollateralUSD: string;
  totalDebtUSD: string;
  positions: {
    asset: string;
    supplied: string;
    borrowed: string;
  }[];
};

const client = createPublicClient({
  chain: arbitrum,
  transport: http(RADIANT_CONFIG.rpcUrl)
});

const KNOWN_ASSETS = [
  { symbol: 'WETH', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' },
  { symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
  { symbol: 'USDT', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' },
  { symbol: 'WBTC', address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' },
  { symbol: 'ARB', address: '0x912CE59144191C1204E64559FE8253a0e49E6548' }
];

const poolAbi = parseAbi([
  'function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)'
]);

const dataProviderAbi = parseAbi([
  'function getUserReserveData(address asset, address user) external view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)'
]);

export async function getUserPosition(address: string): Promise<UserPosition> {
  const accountData = await client.readContract({
    address: RADIANT_CONFIG.addresses.lendingPool as `0x${string}`,
    abi: poolAbi,
    functionName: 'getUserAccountData',
    args: [address as `0x${string}`]
  });

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
          supplied: userData[0].toString(),
          borrowed: userData[2].toString()
        };
      } catch (error) {
        return null;
      }
    })
  );

  return {
    address,
    healthFactor: accountData[5].toString(),
    totalCollateralUSD: accountData[0].toString(),
    totalDebtUSD: accountData[1].toString(),
    positions: positions.filter((p): p is { asset: string; supplied: string; borrowed: string } => 
      p !== null && (p.supplied !== '0' || p.borrowed !== '0')
    )
  };
}

import { createPublicClient, http, parseAbi } from 'viem';
import { arbitrum } from 'viem/chains';
import { RADIANT_CONFIG } from '../radiant.config.js';

export type MarketInfo = {
  symbol: string;
  address: string;
  decimals: number;
  ltv: number;
  liquidationThreshold: number;
  supplyAPR: string;
  borrowAPR: string;
  liquidity: string;
  price: string;
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

const dataProviderAbi = parseAbi([
  'function getReserveConfigurationData(address asset) external view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)',
  'function getReserveData(address asset) external view returns (uint256 availableLiquidity, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)'
]);

const oracleAbi = parseAbi([
  'function getAssetPrice(address asset) external view returns (uint256)'
]);

export async function fetchMarkets(): Promise<MarketInfo[]> {
  const markets = await Promise.all(
    KNOWN_ASSETS.map(async (asset) => {
      try {
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

        const RAY = 10n ** 27n;
        const supplyAPR = ((data[3] * 100n * 31536000n) / RAY).toString();
        const borrowAPR = ((data[4] * 100n * 31536000n) / RAY).toString();

        return {
          symbol: asset.symbol,
          address: asset.address,
          decimals: Number(config[0]),
          ltv: Number(config[1]) / 100,
          liquidationThreshold: Number(config[2]) / 100,
          supplyAPR: (Number(supplyAPR) / 100).toFixed(2),
          borrowAPR: (Number(borrowAPR) / 100).toFixed(2),
          liquidity: data[0].toString(),
          price: price.toString()
        };
      } catch (error) {
        return null;
      }
    })
  );

  return markets.filter((m): m is MarketInfo => m !== null);
}

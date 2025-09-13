import * as markets from '@bgd-labs/aave-address-book';

// AAVE market selection provided by aave-address-book is not very typescript-friendly:
// we have to trust that the structure of their modules is the same, which
// seems to be the case.

// An interface that only contains fields of market definitions that we actually use
export type AAVEMarket = {
  AAVE_PROTOCOL_DATA_PROVIDER: string;
  POOL: string;
  POOL_ADDRESSES_PROVIDER: string;
  UI_INCENTIVE_DATA_PROVIDER: string;
  UI_POOL_DATA_PROVIDER: string;
  WALLET_BALANCE_PROVIDER: string;
  WETH_GATEWAY: string;
};

const marketMap: Record<number, keyof typeof markets> = {
  1: 'AaveV3Ethereum',
  11155111: 'AaveV3Sepolia',
  42161: 'AaveV3Arbitrum',
  421614: 'AaveV3ArbitrumSepolia',
  8453: 'AaveV3Base',
  137: 'AaveV3Polygon',
  10: 'AaveV3Optimism',
};

export const getMarket = (chainId: number): AAVEMarket => {
  const marketKey = marketMap[chainId];
  if (!marketKey) {
    throw new Error(
      `AAVE: no market found for chain ID ${chainId}: modify providers/aave/market.ts`
    );
  }

  const market = markets[marketKey] as unknown as AAVEMarket;
  if (!market) {
    throw new Error(`No such market: ${marketKey}`);
  }

  return market;
};

// PancakeSwap market configuration for different chains
export type PancakeSwapMarket = {
  routerAddress: string;
  factoryAddress: string;
  wrappedNativeToken: string;
  initCodeHash: string;
};

const marketMap: Record<number, PancakeSwapMarket> = {
  42161: {
    // Arbitrum One
    routerAddress: '0xE592427A0AEce92De3Edee1F18E0157C05861564', // PancakeSwap Router
    factoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984', // Uniswap V3 Factory (PancakeSwap uses this)
    wrappedNativeToken: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
    initCodeHash: '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54', // PancakeSwap V3 init code hash
  },
  // Add other chains as needed
};

export const getMarket = (chainId: number): PancakeSwapMarket => {
  const market = marketMap[chainId];
  if (!market) {
    throw new Error(
      `PancakeSwap: no market found for chain ID ${chainId}: modify pancakeswap-swap-plugin/market.ts`
    );
  }

  return market;
};

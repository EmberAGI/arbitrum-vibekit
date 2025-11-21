// Compound V3 protocol contract addresses by chain
// Compound V3 uses Comet contracts (proxy addresses are the main entry points)

export type CompoundAddresses = {
  COMET: string; // Comet proxy address (main lending contract in Compound V3)
};

// Helper to create market addresses
const createMarket = (comet: string): CompoundAddresses => ({
  COMET: comet,
});

// Ethereum Mainnet (Chain ID: 1)
const ETHEREUM_MARKETS = {
  USDC: createMarket('0xc3d688B66703497DAA19211EEdff47f25384cdc3'), // cUSDCv3
  WETH: createMarket('0xA17581A9E3356d9A858b789D68B4d866e593aE94'), // cWETHv3
  USDT: createMarket('0x3Afdc9BCA9213A35503b077a6072F3D0d5AB0840'), // cUSDTv3
  WSTETH: createMarket('0x3D0bb1ccaB520A66e607822fC55BC921738fAFE3'), // cWSTETHv3
  USDS: createMarket('0x5D409e56D886231aDAf00c8775665AD0f9897b56'), // cUSDSv3
} as const;

// Arbitrum (Chain ID: 42161)
const ARBITRUM_MARKETS = {
  USDCE: createMarket('0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA'), // cUSDCEv3
  USDC: createMarket('0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf'), // cUSDCv3
  WETH: createMarket('0x6f7D514bbD4aFf3BcD1140B7344b32f063dEe486'), // cWETHv3
  USDT: createMarket('0xd98Be00b5D27fc98112BdE293e487f8D4cA57d07'), // cUSDTv3
} as const;

// Base (Chain ID: 8453)
const BASE_MARKETS = {
  USDC: createMarket('0xb125E6687d4313864e53df431d5425969c15Eb2F'), // cUSDCv3
  USDBC: createMarket('0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf'), // cUSDBCv3
  WETH: createMarket('0x46e6b214b524310239732D51387075E0e70970bf'), // cWETHv3
  AERO: createMarket('0x784efeB622244d2348d4F2522f8860B96fbEcE89'), // cAEROv3
} as const;

// Market registry by chain ID
export const CompoundV3MarketsByChain: Record<number, Record<string, CompoundAddresses>> = {
  1: ETHEREUM_MARKETS,
  42161: ARBITRUM_MARKETS,
  8453: BASE_MARKETS,
};

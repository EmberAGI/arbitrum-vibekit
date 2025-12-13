import type { ChainId } from '../schemas/index.js';
import { ConfigurationError } from '../errors/index.js';

/**
 * Chain configuration constants
 */
export const CHAIN_CONFIG = {
  1: {
    name: 'Ethereum Mainnet',
    rpcUrlEnv: 'ETHEREUM_RPC_URL',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    uniswap: {
      v2Factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
      v3Factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      universalRouter: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
      quoterV2: '0x61fFE014bA17989E7c319Ea740e6A0e8D8C9ee2E',
    },
  },
  42161: {
    name: 'Arbitrum One',
    rpcUrlEnv: 'ARBITRUM_RPC_URL',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    uniswap: {
      v2Factory: '0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9',
      v3Factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      universalRouter: '0x4C60051384bd2d3C01bfc845Cf5F4b44bcbE9de5',
      quoterV2: '0x61fFE014bA17989E7c319Ea740e6A0e8D8C9ee2E',
    },
  },
  11155111: {
    name: 'Ethereum Sepolia',
    rpcUrlEnv: 'ETHEREUM_RPC_URL',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    uniswap: {
      v2Factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
      v3Factory: '0x0227628f3F023bb0B980b67D528571c95c6DaC1c',
      universalRouter: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
      quoterV2: '0xEd1f6473345F45e35B8d73FaB75A43D7898c24fB',
    },
  },
  421614: {
    name: 'Arbitrum Sepolia',
    rpcUrlEnv: 'ARBITRUM_RPC_URL',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    uniswap: {
      v2Factory: '0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9',
      v3Factory: '0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e',
      universalRouter: '0x4C60051384bd2d3C01bfc845Cf5F4b44bcbE9de5',
      quoterV2: '0xEd1f6473345F45e35B8d73FaB75A43D7898c24fB',
    },
  },
} as const;

/**
 * Get chain configuration for a given chain ID
 */
export function getChainConfig(chainId: ChainId) {
  const config = CHAIN_CONFIG[chainId];
  if (!config) {
    throw new ConfigurationError(`Unsupported chain ID: ${chainId}`);
  }
  return config;
}

/**
 * Get RPC URL for a chain from environment variables
 */
export function getRpcUrl(chainId: ChainId): string {
  const config = getChainConfig(chainId);
  const rpcUrl = process.env[config.rpcUrlEnv];
  if (!rpcUrl) {
    throw new ConfigurationError(
      `RPC URL not configured for ${config.name}. Set ${config.rpcUrlEnv} environment variable.`
    );
  }
  return rpcUrl;
}


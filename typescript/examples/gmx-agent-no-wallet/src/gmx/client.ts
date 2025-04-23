import { ethers } from 'ethers';
import * as gmxSdk from '@gmx-io/sdk';

/**
 * Sets up the GMX client with the necessary configurations
 */
export async function setupGmxClient() {
  try {
    // Get environment variables
    const rpcUrl = process.env.RPC_URL || 'https://arb1.arbitrum.io/rpc';
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // Create and return GMX SDK client
    // Note: In this simulation, we're returning a mock client that provides the expected interface
    // but doesn't actually connect to GMX. In a real implementation, you would use the actual SDK.
    
    return {
      // Markets info functionality
      getMarketsInfo: async () => {
        console.log('Simulating GMX getMarketsInfo call');
        return simulateMarketsInfo();
      },
      
      // Account positions functionality
      getAccountPositions: async ({ account }: { account: string }) => {
        console.log(`Simulating GMX getAccountPositions call for account: ${account}`);
        return simulatePositions(account);
      }
    };
  } catch (error) {
    console.error('Error setting up GMX client:', error);
    throw new Error(`Failed to initialize GMX client: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Simulates market information for testing purposes
 */
function simulateMarketsInfo() {
  // Create mock market data
  const markets = {
    marketsInfoData: {
      '0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064': {
        marketTokenAddress: '0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064',
        indexToken: {
          address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
          symbol: 'ETH',
          decimals: 18
        },
        longToken: {
          address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
          symbol: 'ETH',
          decimals: 18
        },
        shortToken: {
          address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
          symbol: 'USDT',
          decimals: 6
        }
      },
      '0x47c031236e19d024b42f8AE6780E44A573170703': {
        marketTokenAddress: '0x47c031236e19d024b42f8AE6780E44A573170703',
        indexToken: {
          address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
          symbol: 'BTC',
          decimals: 8
        },
        longToken: {
          address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
          symbol: 'BTC',
          decimals: 8
        },
        shortToken: {
          address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
          symbol: 'USDC',
          decimals: 6
        }
      },
      '0x9Ade130C0FeD8d07aD013C556862133E3Cb9F9A1': {
        marketTokenAddress: '0x9Ade130C0FeD8d07aD013C556862133E3Cb9F9A1',
        indexToken: {
          address: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',
          symbol: 'LINK',
          decimals: 18
        },
        longToken: {
          address: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',
          symbol: 'LINK',
          decimals: 18
        },
        shortToken: {
          address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
          symbol: 'USDC',
          decimals: 6
        }
      }
    },
    tokensData: {}
  };
  
  return markets;
}

/**
 * Simulates position information for testing purposes
 */
function simulatePositions(account: string) {
  // Return empty positions for most accounts
  if (account === '0x0000000000000000000000000000000000000000') {
    return { positions: [] };
  }
  
  // Return some test positions for specific accounts
  if (account.toLowerCase() === process.env.DEMO_ACCOUNT?.toLowerCase()) {
    return {
      positions: [
        {
          marketAddress: '0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064',
          isLong: true,
          sizeInUsd: ethers.utils.parseUnits('1000', 30).toString(),
          collateralAmount: ethers.utils.parseUnits('0.5', 18).toString(),
          collateralUsd: ethers.utils.parseUnits('500', 30).toString(),
          entryPrice: ethers.utils.parseUnits('2000', 30).toString(),
          markPrice: ethers.utils.parseUnits('2100', 30).toString(),
          liquidationPrice: ethers.utils.parseUnits('1800', 30).toString(),
          pnl: ethers.utils.parseUnits('50', 30).toString()
        },
        {
          marketAddress: '0x47c031236e19d024b42f8AE6780E44A573170703',
          isLong: false,
          sizeInUsd: ethers.utils.parseUnits('2000', 30).toString(),
          collateralAmount: ethers.utils.parseUnits('1000', 6).toString(),
          collateralUsd: ethers.utils.parseUnits('1000', 30).toString(),
          entryPrice: ethers.utils.parseUnits('30000', 30).toString(),
          markPrice: ethers.utils.parseUnits('29000', 30).toString(),
          liquidationPrice: ethers.utils.parseUnits('31000', 30).toString(),
          pnl: ethers.utils.parseUnits('100', 30).toString()
        }
      ]
    };
  }
  
  // Return a single test position for other accounts
  return {
    positions: [
      {
        marketAddress: '0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064',
        isLong: true,
        sizeInUsd: ethers.utils.parseUnits('1000', 30).toString(),
        collateralAmount: ethers.utils.parseUnits('0.5', 18).toString(),
        collateralUsd: ethers.utils.parseUnits('500', 30).toString(),
        entryPrice: ethers.utils.parseUnits('2000', 30).toString(),
        markPrice: ethers.utils.parseUnits('2100', 30).toString(),
        liquidationPrice: ethers.utils.parseUnits('1800', 30).toString(),
        pnl: ethers.utils.parseUnits('50', 30).toString()
      }
    ]
  };
} 
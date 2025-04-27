import { GmxSdk } from '@gmx-io/sdk';
import { createPublicClient, createWalletClient, http } from 'viem';
import { arbitrum } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Configure the chains we want to use
const CHAINS = {
  arbitrum: {
    id: arbitrum.id,
    name: 'Arbitrum',
    rpcUrl: process.env.RPC_URL || 'https://arb1.arbitrum.io/rpc',
    oracleUrl: process.env.ORACLE_URL || 'https://arbitrum-api.gmxinfra.io',
    subsquidUrl:
      process.env.SUBSQUID_URL ||
      'https://gmx.squids.live/gmx-synthetics-arbitrum:live/api/graphql',
    subgraphUrl: 'https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/synthetics-arbitrum-stats/api',
  },
};

// Default to Arbitrum
const defaultChain = CHAINS.arbitrum;

/**
 * Setup the GMX SDK client with required configuration
 */
export async function setupGmxClient(chainId = defaultChain.id) {
  try {
    // Get chain config based on chainId
    const chainConfig = Object.values(CHAINS).find((chain) => chain.id === chainId) || defaultChain;

    console.log(`Initializing GMX client for ${chainConfig.name}...`);

    // Create wallet client if a private key is provided
    let walletClient = undefined;
    if (process.env.WALLET_PRIVATE_KEY) {
      try {
        const account = privateKeyToAccount(process.env.WALLET_PRIVATE_KEY as `0x${string}`);
        walletClient = createWalletClient({
          account,
          chain: arbitrum,
          transport: http(chainConfig.rpcUrl),
        });
        console.log(`Wallet connected: ${account.address.substring(0, 8)}...`);
      } catch (walletError) {
        console.error(`Error initializing wallet: ${walletError}`);
      }
    }

    // Simple SDK setup - this approach works based on user feedback
    const sdk = new GmxSdk({
      chainId,
      rpcUrl: chainConfig.rpcUrl,
      oracleUrl: chainConfig.oracleUrl,
      subsquidUrl: chainConfig.subsquidUrl,
      subgraphUrl: chainConfig.subgraphUrl,
      walletClient,
    });

    // Optional: Set account if wallet client is available
    if (walletClient?.account?.address) {
      sdk.setAccount(walletClient.account.address);
    }

    console.log(`GMX SDK initialized for ${chainConfig.name}`);
    return sdk;
  } catch (error) {
    console.error(`Error initializing GMX client: ${error}`);
    throw new Error(`Failed to initialize GMX client: ${(error as Error).message}`);
  }
}

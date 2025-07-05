import Compound from '@compound-finance/compound-js';
import { providers, Wallet } from 'ethers';

// Centralised env-config import
import { env, chainId, networkName } from './config.js';

export const RPC_URL       = env.RPC_URL;
export const PRIVATE_KEY   = env.PRIVATE_KEY;
export const COMET_ADDRESS = env.COMET_ADDRESS;

// Optional – some callers/tests may set TOKEN_ADDRESS (e.g., USDC) for convenience
export const TOKEN_ADDRESS = (env as any).TOKEN_ADDRESS as string | undefined; // Not validated on purpose for flexibility

// Provider that can spoof the chainId if user supplies CHAIN_ID, to keep
// Compound.js happy when working against local forks.
class FixedNetworkProvider extends providers.JsonRpcProvider {
  constructor(rpcUrl: string) {
    super(rpcUrl, {
      chainId: chainId ?? undefined,
      name: networkName,
    } as providers.Network);
  }

  /** Return the user-specified chain id (if any) instead of whatever the
   *  underlying node reports. */
  override async getNetwork(): Promise<providers.Network> {
    if (chainId !== undefined) {
      return { chainId, name: networkName } as providers.Network;
    }
    return super.getNetwork();
  }

  /** Spoof `net_version` as well for libraries that use raw RPC. */
  override async send(method: string, params: Array<unknown>): Promise<unknown> {
    if (method === 'net_version' && chainId !== undefined) {
      return String(chainId);
    }
    return super.send(method as any, params as any);
  }
}

export const provider = new FixedNetworkProvider(RPC_URL);

// Wallet (server-side)
export const wallet   = new Wallet(PRIVATE_KEY, provider);

// Root Compound.js object  (cast to any, then pass RPC_URL)
export const compound = new (Compound as any)(wallet);

// Instantiate the canonical Arbitrum USDC Comet instance (address is hard-coded
// inside the Compound.js constants and must match your fork). This avoids the
// nonexistent `.custom()` helper.
export const comet = (compound.comet as any).ARBITRUM_USDC();
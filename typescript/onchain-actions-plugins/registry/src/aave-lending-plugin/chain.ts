import { ethers } from 'ethers';

/**
 * Represents a blockchain network configuration used to create JSON-RPC providers and
 * hold basic chain-specific metadata.
 *
 * The Chain class encapsulates:
 * - a numeric chain identifier (id),
 * - an RPC URL to connect to the chain (rpcUrl),
 * - an optional wrapped native token address (wrappedNativeTokenAddress).
 *
 * @param id - The numeric identifier for the chain (e.g., 1 for Ethereum mainnet).
 * @param rpcUrl - The JSON-RPC endpoint URL used to create providers for this chain.
 * @param wrappedNativeTokenAddress - Optional address of the chain's wrapped native token (if applicable).
 */
export class Chain {
  constructor(
    public id: number,
    public rpcUrl: string,
    public wrappedNativeTokenAddress?: string
  ) {}

  /**
   * Create and return an ethers.js JsonRpcProvider configured with this chain's RPC URL.
   *
   * This method constructs a new ethers.providers.JsonRpcProvider each time it is called.
   * Consumers may cache the provider if they intend to reuse it to avoid allocating multiple instances.
   *
   * @returns An instance of ethers.providers.JsonRpcProvider configured with the chain's rpcUrl.
   */
  public getProvider(): ethers.providers.JsonRpcProvider {
    return new ethers.providers.JsonRpcProvider(this.rpcUrl);
  }
}

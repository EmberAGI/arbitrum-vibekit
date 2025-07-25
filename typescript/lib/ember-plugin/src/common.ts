/**
 * The type of the chain.
 */
export enum ChainType {
  UNSPECIFIED = 'UNSPECIFIED',
  EVM = 'EVM',
  SOLANA = 'SOLANA',
  COSMOS = 'COSMOS',
}

/**
 * Represents a blockchain network.
 */
export interface Chain {
  /**
   * The unique identifier for the chain.
   */
  chainId: string;
  /**
   * The type of the chain.
   */
  type: ChainType;
  /**
   * The name of the chain.
   */
  name: string;
  /**
   * The URI of the icon representing the chain.
   */
  iconUri: string;
  /**
   * The URL for the RPC endpoint of the chain.
   */
  httpRpcUrl: string;
  /**
   * The URLs for the block explorer of the chain.
   */
  blockExplorerUrls: string[];
}

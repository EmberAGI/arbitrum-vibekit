/**
 * Configuration for a blockchain network.
 */
export type ChainConfig = {
  chainId: number;
  name: string;
  rpcUrl: string;
  wrappedNativeToken?: string;
};

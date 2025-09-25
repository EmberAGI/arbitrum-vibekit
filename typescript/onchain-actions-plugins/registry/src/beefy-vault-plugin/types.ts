import type { PopulatedTransaction } from 'ethers';

export type BeefyAction = PopulatedTransaction[];

export interface BeefyAdapterParams {
  chainId: number;
  rpcUrl: string;
  wrappedNativeToken?: string;
}

export interface BeefyVault {
  id: string;
  name: string;
  token: string;
  tokenAddress: string;
  tokenDecimals: number;
  earnedToken: string;
  earnedTokenAddress: string;
  earnContractAddress: string;
  status: 'active' | 'eol';
  assets: string[];
  network: string;
  chain: string;
  pricePerFullShare: string;
  apy?: number;
  tvl?: number;
}

export interface BeefyVaultsResponse {
  [vaultId: string]: BeefyVault;
}

export interface BeefyApyResponse {
  [vaultId: string]: number;
}

export interface BeefyTvlResponse {
  [vaultId: string]: number;
}

export interface BeefyTokensResponse {
  [chainName: string]: {
    [tokenSymbol: string]: {
      name: string;
      symbol: string;
      address: string;
      decimals: number;
    };
  };
}

export interface VaultData {
  id: string;
  name: string;
  vaultAddress: string;
  tokenAddress: string;
  tokenDecimals: number;
  mooTokenAddress: string;
  apy: number;
  tvl: number;
  assets: string[];
}

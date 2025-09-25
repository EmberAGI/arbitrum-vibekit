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

// New types for additional Beefy API endpoints
export interface BeefyApyBreakdownResponse {
  [vaultId: string]: {
    totalApy?: number;
    vaultApr?: number;
    compoundingsPerYear?: number;
    beefyPerformanceFee?: number;
    vaultApy?: number;
    lpFee?: number;
    tradingApr?: number;
  };
}

export interface BeefyFeesResponse {
  [vaultId: string]: {
    performance: {
      total: number;
      strategist: number;
      call: number;
      treasury: number;
      stakers: number;
    };
    withdraw: number;
    lastUpdated: number;
  };
}

// Request/Response types for new actions
export interface GetVaultsRequest {
  chainId?: string;
}

export interface GetVaultsResponse {
  vaults: BeefyVault[];
}

export interface GetApyRequest {
  chainId?: string;
}

export interface GetApyResponse {
  apyData: BeefyApyResponse;
}

export interface GetTvlRequest {
  chainId?: string;
}

export interface GetTvlResponse {
  tvlData: BeefyTvlResponse;
}

export interface GetApyBreakdownRequest {
  chainId?: string;
}

export interface GetApyBreakdownResponse {
  apyBreakdown: BeefyApyBreakdownResponse;
}

export interface GetFeesRequest {
  chainId?: string;
}

export interface GetFeesResponse {
  feesData: BeefyFeesResponse;
}

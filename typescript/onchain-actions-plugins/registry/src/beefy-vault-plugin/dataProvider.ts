import type {
  BeefyVaultsResponse,
  BeefyApyResponse,
  BeefyTvlResponse,
  BeefyTokensResponse,
  BeefyApyBreakdownResponse,
  BeefyFeesResponse,
  VaultData,
} from './types.js';

export class BeefyDataProvider {
  private baseUrl = 'https://api.beefy.finance';

  async getVaults(): Promise<BeefyVaultsResponse> {
    const response = await fetch(`${this.baseUrl}/vaults`);
    if (!response.ok) {
      throw new Error(`Failed to fetch vaults: ${response.statusText}`);
    }
    return response.json() as Promise<BeefyVaultsResponse>;
  }

  async getApy(): Promise<BeefyApyResponse> {
    const response = await fetch(`${this.baseUrl}/apy`);
    if (!response.ok) {
      throw new Error(`Failed to fetch APY data: ${response.statusText}`);
    }
    return response.json() as Promise<BeefyApyResponse>;
  }

  async getTvl(): Promise<BeefyTvlResponse> {
    const response = await fetch(`${this.baseUrl}/tvl`);
    if (!response.ok) {
      throw new Error(`Failed to fetch TVL data: ${response.statusText}`);
    }
    return response.json() as Promise<BeefyTvlResponse>;
  }

  async getTokens(chain: string): Promise<BeefyTokensResponse> {
    const response = await fetch(`${this.baseUrl}/tokens/${chain}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch tokens for ${chain}: ${response.statusText}`);
    }
    return response.json() as Promise<BeefyTokensResponse>;
  }

  async getApyBreakdown(): Promise<BeefyApyBreakdownResponse> {
    const response = await fetch(`${this.baseUrl}/apy/breakdown`);
    if (!response.ok) {
      throw new Error(`Failed to fetch APY breakdown: ${response.statusText}`);
    }
    return response.json() as Promise<BeefyApyBreakdownResponse>;
  }

  async getFees(): Promise<BeefyFeesResponse> {
    const response = await fetch(`${this.baseUrl}/fees`);
    if (!response.ok) {
      throw new Error(`Failed to fetch fees data: ${response.statusText}`);
    }
    return response.json() as Promise<BeefyFeesResponse>;
  }

  async getActiveVaultsForChain(chainId: number): Promise<VaultData[]> {
    const chainName = this.getChainName(chainId);

    const [vaults, apyData, tvlData] = await Promise.all([
      this.getVaults(),
      this.getApy(),
      this.getTvl(),
    ]);

    const activeVaults: VaultData[] = [];

    for (const [vaultId, vault] of Object.entries(vaults)) {
      // Filter for active vaults on the specified chain
      if (vault.status === 'active' && vault.chain === chainName) {
        const apy = apyData[vaultId] || 0;
        const tvl = tvlData[vaultId] || 0;

        activeVaults.push({
          id: vault.id,
          name: vault.name,
          vaultAddress: vault.earnContractAddress,
          tokenAddress: vault.tokenAddress,
          tokenDecimals: vault.tokenDecimals,
          mooTokenAddress: vault.earnedTokenAddress,
          apy,
          tvl,
          assets: vault.assets,
        });
      }
    }

    return activeVaults;
  }

  private getChainName(chainId: number): string {
    switch (chainId) {
      case 42161:
        return 'arbitrum';
      case 1:
        return 'ethereum';
      case 137:
        return 'polygon';
      case 56:
        return 'bsc';
      default:
        throw new Error(`Unsupported chain ID: ${chainId}`);
    }
  }
}

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
    const url = `${this.baseUrl}/vaults`;
    console.log(`🌐 Making HTTP request to: ${url}`);

    const response = await fetch(url);
    console.log(`📡 Response status: ${response.status} ${response.statusText}`);
    console.log(`📡 Response headers:`, Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      throw new Error(`Failed to fetch vaults: ${response.statusText}`);
    }

    const data = (await response.json()) as BeefyVaultsResponse;
    console.log(`📊 Received ${Object.keys(data).length} vaults from Beefy API`);
    console.log(`📊 Sample vault IDs:`, Object.keys(data).slice(0, 5));

    return data;
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
    console.log(`🔍 Filtering vaults for chain: ${chainName} (chainId: ${chainId})`);

    const [vaults, apyData, tvlData] = await Promise.all([
      this.getVaults(),
      this.getApy(),
      this.getTvl(),
    ]);

    console.log(`📊 Total vaults from API: ${Object.keys(vaults).length}`);
    console.log(`📊 APY data entries: ${Object.keys(apyData).length}`);
    console.log(`📊 TVL data entries: ${Object.keys(tvlData).length}`);

    const activeVaults: VaultData[] = [];
    let totalChecked = 0;
    let activeCount = 0;
    let chainMatches = 0;

    for (const [vaultId, vault] of Object.entries(vaults)) {
      totalChecked++;

      if (vault.status === 'active') {
        activeCount++;
      }

      if (vault.chain === chainName) {
        chainMatches++;
      }

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

        if (activeVaults.length <= 3) {
          console.log(`✅ Found active vault ${activeVaults.length}:`, {
            id: vault.id,
            name: vault.name,
            chain: vault.chain,
            status: vault.status,
            tokenAddress: vault.tokenAddress,
            apy,
            tvl,
          });
        }
      }
    }

    console.log(`📈 Filtering results:`);
    console.log(`  - Total vaults checked: ${totalChecked}`);
    console.log(`  - Active vaults: ${activeCount}`);
    console.log(`  - Chain matches (${chainName}): ${chainMatches}`);
    console.log(`  - Final active vaults for ${chainName}: ${activeVaults.length}`);

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

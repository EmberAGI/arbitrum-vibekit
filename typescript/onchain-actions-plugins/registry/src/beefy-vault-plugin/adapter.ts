import { Chain } from './chain.js';
import { BeefyDataProvider } from './dataProvider.js';
import { ethers, type PopulatedTransaction } from 'ethers';
import type {
  TransactionPlan,
  SupplyTokensRequest,
  SupplyTokensResponse,
  WithdrawTokensRequest,
  WithdrawTokensResponse,
  GetWalletLendingPositionsRequest,
  GetWalletLendingPositionsResponse,
  Token,
} from '../core/index.js';
import { TransactionTypes } from '../core/index.js';
import type {
  BeefyAdapterParams,
  BeefyAction,
  VaultData,
  GetVaultsRequest,
  GetVaultsResponse,
  GetApyRequest,
  GetApyResponse,
  GetTvlRequest,
  GetTvlResponse,
  GetApyBreakdownRequest,
  GetApyBreakdownResponse,
  GetFeesRequest,
  GetFeesResponse,
} from './types.js';

// Standard ERC20 ABI for basic operations
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

// Basic Beefy Vault ABI
const BEEFY_VAULT_ABI = [
  'function deposit(uint256 amount)',
  'function depositAll()',
  'function withdraw(uint256 shares)',
  'function withdrawAll()',
  'function balanceOf(address account) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function getPricePerFullShare() view returns (uint256)',
  'function want() view returns (address)',
];

export class BeefyAdapter {
  public chain: Chain;
  private dataProvider: BeefyDataProvider;

  constructor(params: BeefyAdapterParams) {
    this.chain = new Chain(params.chainId, params.rpcUrl, params.wrappedNativeToken);
    this.dataProvider = new BeefyDataProvider();
  }

  public async createSupplyTransaction(params: SupplyTokensRequest): Promise<SupplyTokensResponse> {
    const { supplyToken: token, amount, walletAddress } = params;

    // Find the best vault for this token
    const vault = await this.findBestVaultForToken(token);
    if (!vault) {
      throw new Error(`No Beefy vault found for token ${token.symbol}`);
    }

    const txs = await this.deposit(vault, token, amount, walletAddress);
    return {
      transactions: txs.map(t => this.transactionPlanFromEthers(t)),
    };
  }

  public async createWithdrawTransaction(
    params: WithdrawTokensRequest
  ): Promise<WithdrawTokensResponse> {
    const { tokenToWithdraw, amount, walletAddress } = params;

    // Find vault that produces this mooToken
    const vault = await this.findVaultByMooToken(tokenToWithdraw);
    if (!vault) {
      throw new Error(`No Beefy vault found for mooToken ${tokenToWithdraw.symbol}`);
    }

    const txs = await this.withdraw(vault, amount, walletAddress);
    return {
      transactions: txs.map(t => this.transactionPlanFromEthers(t)),
    };
  }

  public async getAvailableVaults(): Promise<VaultData[]> {
    const vaults = await this.getActiveVaults();
    return vaults;
  }

  public async getUserSummary(
    params: GetWalletLendingPositionsRequest
  ): Promise<GetWalletLendingPositionsResponse> {
    const { walletAddress } = params;
    const vaults = await this.dataProvider.getActiveVaultsForChain(this.chain.id);
    const provider = this.chain.getProvider();

    const userReserves = [];

    for (const vault of vaults) {
      try {
        const vaultContract = new ethers.Contract(vault.vaultAddress, BEEFY_VAULT_ABI, provider);
        const balance = await vaultContract.balanceOf(walletAddress);

        if (balance.gt(0)) {
          const pricePerShare = await vaultContract.getPricePerFullShare();
          const underlyingBalance = balance.mul(pricePerShare).div(ethers.utils.parseEther('1'));

          // Get token info
          const tokenContract = new ethers.Contract(vault.tokenAddress, ERC20_ABI, provider);
          const [name, symbol, decimals] = await Promise.all([
            tokenContract.name(),
            tokenContract.symbol(),
            tokenContract.decimals(),
          ]);

          userReserves.push({
            token: {
              tokenUid: {
                address: vault.tokenAddress,
                chainId: this.chain.id.toString(),
              },
              isNative: false,
              name,
              symbol,
              decimals,
              isVetted: true,
            },
            underlyingBalance: ethers.utils.formatUnits(underlyingBalance, decimals),
            underlyingBalanceUsd: '0', // Would need price oracle
            variableBorrows: '0',
            variableBorrowsUsd: '0',
            totalBorrows: '0',
            totalBorrowsUsd: '0',
          });
        }
      } catch (error) {
        // Silently ignore vault balance errors
      }
    }

    return {
      userReserves,
      totalLiquidityUsd: '0',
      totalCollateralUsd: '0',
      totalBorrowsUsd: '0',
      netWorthUsd: '0',
      availableBorrowsUsd: '0',
      currentLoanToValue: '0',
      currentLiquidationThreshold: '0',
      healthFactor: '0',
    };
  }

  public async getActiveVaults(): Promise<VaultData[]> {
    return this.dataProvider.getActiveVaultsForChain(this.chain.id);
  }

  // New methods for vault information actions
  public async getVaults(params: GetVaultsRequest): Promise<GetVaultsResponse> {
    const chainName = this.getChainName(this.chain.id);
    const vaultsData = await this.dataProvider.getVaults();

    // Filter vaults for the current chain
    const chainVaults = Object.entries(vaultsData)
      .filter(([_, vault]) => vault.chain === chainName)
      .map(([_, vault]) => vault);

    return {
      vaults: chainVaults,
    };
  }

  public async getApyData(params: GetApyRequest): Promise<GetApyResponse> {
    const apyData = await this.dataProvider.getApy();
    return {
      apyData,
    };
  }

  public async getTvlData(params: GetTvlRequest): Promise<GetTvlResponse> {
    const tvlData = await this.dataProvider.getTvl();
    return {
      tvlData,
    };
  }

  public async getApyBreakdownData(
    params: GetApyBreakdownRequest
  ): Promise<GetApyBreakdownResponse> {
    const apyBreakdown = await this.dataProvider.getApyBreakdown();
    return {
      apyBreakdown,
    };
  }

  public async getFeesData(params: GetFeesRequest): Promise<GetFeesResponse> {
    const feesData = await this.dataProvider.getFees();
    return {
      feesData,
    };
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

  private async findBestVaultForToken(token: Token): Promise<VaultData | null> {
    const vaults = await this.getActiveVaults();

    // Find vaults that accept this token
    const compatibleVaults = vaults.filter(
      vault =>
        vault.tokenAddress.toLowerCase() === token.tokenUid.address.toLowerCase() ||
        vault.assets.some(asset => asset.toLowerCase() === token.symbol.toLowerCase())
    );

    if (compatibleVaults.length === 0) {
      return null;
    }

    // Return the vault with highest APY
    return compatibleVaults.reduce((best, current) => (current.apy > best.apy ? current : best));
  }

  private async findVaultByMooToken(mooToken: Token): Promise<VaultData | null> {
    const vaults = await this.getActiveVaults();

    return (
      vaults.find(
        vault => vault.mooTokenAddress.toLowerCase() === mooToken.tokenUid.address.toLowerCase()
      ) || null
    );
  }

  private async deposit(
    vault: VaultData,
    token: Token,
    amount: bigint,
    walletAddress: string
  ): Promise<BeefyAction> {
    const provider = this.chain.getProvider();
    const vaultContract = new ethers.Contract(vault.vaultAddress, BEEFY_VAULT_ABI, provider);
    const tokenContract = new ethers.Contract(vault.tokenAddress, ERC20_ABI, provider);

    const transactions: PopulatedTransaction[] = [];

    // Check if approval is needed
    const allowance = await tokenContract.allowance(walletAddress, vault.vaultAddress);
    if (allowance.lt(amount)) {
      const approveTx = await tokenContract.populateTransaction.approve!(
        vault.vaultAddress,
        amount.toString()
      );
      transactions.push(approveTx);
    }

    // Create deposit transaction
    const depositTx = await vaultContract.populateTransaction.deposit!(amount.toString());
    transactions.push(depositTx);

    return transactions;
  }

  private async withdraw(
    vault: VaultData,
    shares: bigint,
    walletAddress: string
  ): Promise<BeefyAction> {
    const provider = this.chain.getProvider();
    const vaultContract = new ethers.Contract(vault.vaultAddress, BEEFY_VAULT_ABI, provider);

    const withdrawTx = await vaultContract.populateTransaction.withdraw!(shares.toString());
    return [withdrawTx];
  }

  private transactionPlanFromEthers(tx: PopulatedTransaction): TransactionPlan {
    return {
      type: TransactionTypes.EVM_TX,
      to: tx.to!,
      value: tx.value?.toString() || '0',
      data: tx.data!,
      chainId: this.chain.id.toString(),
    };
  }
}

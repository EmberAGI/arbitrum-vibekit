import { ethers, type PopulatedTransaction } from 'ethers';

import {
  type GetWalletLendingPositionsResponse,
  type GetWalletLendingPositionsRequest,
  type SupplyTokensRequest,
  type SupplyTokensResponse,
  type WithdrawTokensRequest,
  type WithdrawTokensResponse,
  type BorrowTokensRequest,
  type BorrowTokensResponse,
  type RepayTokensRequest,
  type RepayTokensResponse,
  type TransactionPlan,
  TransactionTypes,
} from '../core/index.js';

import { Chain } from './chain.js';
import { type CompoundMarket, getMarket } from './market.js';
import { handleCompoundError } from './error.js';
import { UserSummary, type CompoundUserPosition } from './userSummary.js';

// Comet contract interface for view and transaction functions
// Based on Compound V3 documentation: https://docs.compound.finance/helper-functions/
// ABI reference: https://docs.compound.finance/public/files/comet-interface-abi-98f438b.json
interface CometContract extends ethers.Contract {
  // Account balances
  balanceOf(account: string): Promise<ethers.BigNumber>;
  borrowBalanceOf(account: string): Promise<ethers.BigNumber>;
  getCollateralBalance(account: string, asset: string): Promise<ethers.BigNumber>;

  // Account data
  userBasic(account: string): Promise<{
    principal: ethers.BigNumber;
    baseTrackingIndex: ethers.BigNumber;
    baseTrackingAccrued: ethers.BigNumber;
    assetsIn: ethers.BigNumber;
  }>;

  // Asset information
  numAssets(): Promise<ethers.BigNumber>;
  getAssetInfo(i: number): Promise<{
    offset: number;
    asset: string;
    priceFeed: string;
    scale: ethers.BigNumber;
    borrowCollateralFactor: ethers.BigNumber;
    liquidateCollateralFactor: ethers.BigNumber;
    liquidationFactor: ethers.BigNumber;
    supplyCap: ethers.BigNumber;
  }>;
  getAssetInfoByAddress(asset: string): Promise<{
    offset: number;
    asset: string;
    priceFeed: string;
    scale: ethers.BigNumber;
    borrowCollateralFactor: ethers.BigNumber;
    liquidateCollateralFactor: ethers.BigNumber;
    liquidationFactor: ethers.BigNumber;
    supplyCap: ethers.BigNumber;
  }>;
  getPrice(priceFeed: string): Promise<ethers.BigNumber>;
  getLiquidity(account: string): Promise<ethers.BigNumber>;
  isBorrowCollateralized(account: string): Promise<boolean>;

  // Market information
  totalsBasic(): Promise<{
    baseSupplyIndex: ethers.BigNumber;
    baseBorrowIndex: ethers.BigNumber;
    trackingSupplyIndex: ethers.BigNumber;
    trackingBorrowIndex: ethers.BigNumber;
    totalSupplyBase: ethers.BigNumber;
    totalBorrowBase: ethers.BigNumber;
    lastAccrualTime: ethers.BigNumber;
    pauseFlags: number;
  }>;
  baseToken(): Promise<string>;
  baseScale(): Promise<ethers.BigNumber>;
  factorScale(): Promise<ethers.BigNumber>;
  priceScale(): Promise<ethers.BigNumber>;

  // Interest rate functions
  getUtilization(): Promise<ethers.BigNumber>;
  getBorrowRate(utilization: ethers.BigNumber): Promise<ethers.BigNumber>;

  // Transaction functions
  supply(asset: string, amount: ethers.BigNumber): Promise<ethers.ContractTransaction>;
  withdraw(asset: string, amount: ethers.BigNumber): Promise<ethers.ContractTransaction>;
}

export interface CompoundAdapterParams {
  chainId: number;
  rpcUrl: string;
  marketId: string; // e.g., 'USDC', 'WETH', etc.
  wrappedNativeToken?: string;
}

export type CompoundAction = PopulatedTransaction[];

/**
 * CompoundAdapter is the primary class wrapping Compound V3 (Comet) interactions.
 */
export class CompoundAdapter {
  public chain: Chain;
  public market: CompoundMarket;

  constructor(params: CompoundAdapterParams) {
    this.chain = new Chain(params.chainId, params.rpcUrl, params.wrappedNativeToken);
    this.market = getMarket(params.chainId, params.marketId);
  }

  // ============================================================================
  // Public View Methods
  // ============================================================================

  /**
   * Get user summary (positions, health factor, etc.)
   */
  public async getUserSummary(
    params: GetWalletLendingPositionsRequest,
  ): Promise<GetWalletLendingPositionsResponse> {
    const userSummary = await this._getUserSummary(params.walletAddress);
    const {
      totalCollateralUsd,
      totalBorrowsUsd,
      netWorthUsd,
      availableBorrowsUsd,
      currentLoanToValue,
      currentLiquidationThreshold,
      healthFactor,
      collateral,
      borrowBalance,
      borrowBalanceUsd,
    } = userSummary.position;

    const userReservesFormatted = [];

    // Add collateral positions
    for (const coll of collateral) {
      if (parseFloat(coll.balanceUsd) > 0) {
        userReservesFormatted.push({
          tokenUid: {
            address: coll.asset,
            chainId: this.chain.id.toString(),
          },
          underlyingBalance: coll.balance.toString(),
          underlyingBalanceUsd: coll.balanceUsd,
          variableBorrows: '0',
          variableBorrowsUsd: '0',
          totalBorrows: '0',
          totalBorrowsUsd: '0',
        });
      }
    }

    // Add borrow position if exists
    if (parseFloat(totalBorrowsUsd) > 0) {
      const comet = this.getCometContract();
      const baseToken = await comet.baseToken();
      userReservesFormatted.push({
        tokenUid: {
          address: baseToken,
          chainId: this.chain.id.toString(),
        },
        underlyingBalance: '0',
        underlyingBalanceUsd: '0',
        variableBorrows: borrowBalance.toString(),
        variableBorrowsUsd: borrowBalanceUsd,
        totalBorrows: borrowBalance.toString(),
        totalBorrowsUsd: borrowBalanceUsd,
      });
    }

    return {
      userReserves: userReservesFormatted,
      totalLiquidityUsd: totalCollateralUsd,
      totalCollateralUsd: totalCollateralUsd,
      totalBorrowsUsd: totalBorrowsUsd,
      netWorthUsd: netWorthUsd,
      availableBorrowsUsd: availableBorrowsUsd,
      currentLoanToValue,
      currentLiquidationThreshold,
      healthFactor,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private getProvider(): ethers.providers.JsonRpcProvider {
    return this.chain.getProvider();
  }

  private getCometContract(): CometContract {
    const provider = this.getProvider();
    // Using minimal ABI for view functions - will be extended as needed
    const cometAbi = [
      'function balanceOf(address account) external view returns (uint256)',
      'function borrowBalanceOf(address account) external view returns (uint256)',
      'function getCollateralBalance(address account, address asset) external view returns (uint256)',
      'function userBasic(address account) external view returns (int104 principal, uint64 baseTrackingIndex, uint64 baseTrackingAccrued, uint16 assetsIn)',
      'function numAssets() external view returns (uint8)',
      'function getAssetInfo(uint8 i) external view returns ((uint8 offset, address asset, address priceFeed, uint64 scale, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap))',
      'function getAssetInfoByAddress(address asset) external view returns ((uint8 offset, address asset, address priceFeed, uint64 scale, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap))',
      'function getPrice(address priceFeed) external view returns (uint256)',
      'function getLiquidity(address account) external view returns (int256)',
      'function isBorrowCollateralized(address account) external view returns (bool)',
      'function totalsBasic() external view returns ((uint64 baseSupplyIndex, uint64 baseBorrowIndex, uint64 trackingSupplyIndex, uint64 trackingBorrowIndex, uint104 totalSupplyBase, uint104 totalBorrowBase, uint40 lastAccrualTime, uint8 pauseFlags))',
      'function baseToken() external view returns (address)',
      'function baseScale() external view returns (uint64)',
      'function factorScale() external view returns (uint64)',
      'function priceScale() external view returns (uint64)',
      // Interest rate functions
      'function getUtilization() external view returns (uint256)',
      'function getBorrowRate(uint256 utilization) external view returns (uint64)',
      // Transaction functions
      'function supply(address asset, uint256 amount) external',
      'function withdraw(address asset, uint256 amount) external',
    ];
    return new ethers.Contract(this.market.COMET, cometAbi, provider) as CometContract;
  }

  // ============================================================================
  // Private View Methods
  // ============================================================================

  /**
   * Internal method to fetch and format user summary
   */
  private async _getUserSummary(userAddress: string): Promise<UserSummary> {
    const validatedUser = ethers.utils.getAddress(userAddress);
    const comet = this.getCometContract();

    try {
      // Get scales
      const baseScale = await comet.baseScale();
      const factorScale = await comet.factorScale();
      const priceScale = await comet.priceScale();

      // Get user borrow balance
      const borrowedBase = await comet.borrowBalanceOf(validatedUser);

      // Get number of assets and fetch all collateral positions
      const numAssets = await comet.numAssets();
      const collateralPositions: Array<{
        asset: string;
        balance: ethers.BigNumber;
        balanceUsd: string;
      }> = [];

      let totalCollateralValue = ethers.BigNumber.from(0);

      // Convert numAssets to number
      // numAssets() returns uint8, which should be a small number
      const numAssetsCount = Number(numAssets);

      for (let i = 0; i < numAssetsCount; i++) {
        try {
          const assetInfo = await comet.getAssetInfo(i);

          // Skip if asset address is invalid
          if (!assetInfo.asset || assetInfo.asset === ethers.constants.AddressZero) {
            continue;
          }

          const collateralBalance = await comet.getCollateralBalance(
            validatedUser,
            assetInfo.asset,
          );

          if (collateralBalance.gt(0)) {
            // Get price for this asset
            const price = await comet.getPrice(assetInfo.priceFeed);
            const assetScale = assetInfo.scale;

            // Calculate USD value: (balance * price * priceScale) / (assetScale * baseScale)
            const balanceScaled = collateralBalance.mul(price).mul(priceScale);
            const divisor = assetScale.mul(baseScale);
            const usdValue = balanceScaled.div(divisor);

            totalCollateralValue = totalCollateralValue.add(usdValue);

            collateralPositions.push({
              asset: assetInfo.asset,
              balance: collateralBalance,
              balanceUsd: ethers.utils.formatUnits(usdValue, 8), // priceScale is 8 decimals
            });
          }
        } catch (error) {
          // Skip assets that fail (e.g., invalid asset, contract revert)
          // This can happen if an asset index is out of bounds or asset is invalid
          continue;
        }
      }

      // Calculate borrow USD value (base token is typically 1:1 for stablecoins like USDC)
      // Base token price is typically 1e8 (priceScale) for stablecoins
      const basePrice = priceScale; // For stablecoins, price is typically 1 * priceScale
      const borrowUsdValue = borrowedBase.mul(basePrice).div(baseScale);
      const borrowBalanceUsd = ethers.utils.formatUnits(borrowUsdValue, 8); // priceScale is 8 decimals

      const totalCollateralUsd = ethers.utils.formatUnits(totalCollateralValue, 8);
      const totalBorrowsUsd = borrowBalanceUsd;

      // Get liquidation threshold (minimum of all collateral factors)
      let minLiquidationFactor = ethers.BigNumber.from('999999999999999999'); // Max uint64 scaled
      for (const coll of collateralPositions) {
        const assetInfo = await comet.getAssetInfoByAddress(coll.asset);
        if (assetInfo.liquidateCollateralFactor.lt(minLiquidationFactor)) {
          minLiquidationFactor = assetInfo.liquidateCollateralFactor;
        }
      }

      // Calculate health factor
      // Health factor = (collateral value * liquidation factor) / borrow value
      // We'll calculate it manually for precision
      const borrowValueScaled = borrowUsdValue;
      const collateralValueScaled = totalCollateralValue;

      let healthFactorValue = ethers.BigNumber.from(0);
      if (borrowValueScaled.gt(0) && collateralValueScaled.gt(0)) {
        const maxBorrowable = collateralValueScaled.mul(minLiquidationFactor).div(factorScale);
        healthFactorValue = maxBorrowable
          .mul(ethers.BigNumber.from(10).pow(18))
          .div(borrowValueScaled);
      } else if (borrowValueScaled.eq(0) && collateralValueScaled.gt(0)) {
        // No borrows, health factor is infinite (represented as a very large number)
        healthFactorValue = ethers.BigNumber.from(10).pow(36);
      }

      const healthFactor = healthFactorValue.gt(0)
        ? ethers.utils.formatUnits(healthFactorValue, 18)
        : '0';

      // Calculate LTV: borrow / collateral
      const ltvValue = collateralValueScaled.gt(0)
        ? borrowValueScaled.mul(ethers.BigNumber.from(10).pow(18)).div(collateralValueScaled)
        : ethers.BigNumber.from(0);
      const currentLoanToValue = ethers.utils.formatUnits(ltvValue, 18);

      // Calculate available borrows
      const maxBorrowValue = collateralValueScaled.mul(minLiquidationFactor).div(factorScale);
      const availableBorrowsUsd = maxBorrowValue.gt(borrowValueScaled)
        ? ethers.utils.formatUnits(maxBorrowValue.sub(borrowValueScaled), 8)
        : '0';

      // Net worth
      const netWorthValue = totalCollateralValue.sub(borrowUsdValue);
      const netWorthUsd = ethers.utils.formatUnits(netWorthValue, 8);

      const position: CompoundUserPosition = {
        collateral: collateralPositions,
        borrowBalance: borrowedBase,
        borrowBalanceUsd: totalBorrowsUsd,
        totalCollateralUsd,
        totalBorrowsUsd,
        netWorthUsd,
        healthFactor,
        currentLoanToValue,
        currentLiquidationThreshold: ethers.utils.formatUnits(minLiquidationFactor, 18),
        availableBorrowsUsd,
      };

      return new UserSummary(position);
    } catch (error) {
      const compoundError = handleCompoundError(error);
      if (compoundError) {
        throw compoundError;
      }
      throw error;
    }
  }

  // ============================================================================
  // Public Transaction Methods
  // ============================================================================

  /**
   * Create a supply transaction for supplying collateral or base token
   */
  public async createSupplyTransaction(params: SupplyTokensRequest): Promise<SupplyTokensResponse> {
    const { supplyToken, amount, walletAddress } = params;
    const assetAddress = ethers.utils.getAddress(supplyToken.tokenUid.address);
    const txs = await this.supply(assetAddress, amount, walletAddress);
    return {
      transactions: txs.map((tx) => this.transactionPlanFromEthers(tx)),
    };
  }

  /**
   * Create a withdraw transaction for withdrawing collateral or base token supply
   */
  public async createWithdrawTransaction(
    params: WithdrawTokensRequest,
  ): Promise<WithdrawTokensResponse> {
    const { tokenToWithdraw, amount } = params;
    const assetAddress = ethers.utils.getAddress(tokenToWithdraw.tokenUid.address);
    const txs = await this.withdraw(assetAddress, amount);
    return {
      transactions: txs.map((tx) => this.transactionPlanFromEthers(tx)),
    };
  }

  /**
   * Create a borrow transaction for borrowing base token
   * In Compound V3, borrowing is done by withdrawing base token
   */
  public async createBorrowTransaction(params: BorrowTokensRequest): Promise<BorrowTokensResponse> {
    const { borrowToken, amount, walletAddress } = params;
    const comet = this.getCometContract();
    const baseToken = await comet.baseToken();

    // Verify that the borrow token is the base token
    const borrowTokenAddress = ethers.utils.getAddress(borrowToken.tokenUid.address);
    if (borrowTokenAddress !== baseToken) {
      throw new Error(
        `Compound V3 only supports borrowing the base token (${baseToken}), not ${borrowTokenAddress}`,
      );
    }

    // Borrow is done by withdrawing base token
    const txs = await this.withdraw(baseToken, amount);

    // Get liquidation threshold from user's collateral
    const userSummary = await this._getUserSummary(walletAddress);
    const liquidationThreshold = userSummary.position.currentLiquidationThreshold;

    // Get borrow APR from contract
    const currentBorrowApy = await this.getBorrowApy();

    return {
      liquidationThreshold,
      currentBorrowApy,
      transactions: txs.map((tx) => this.transactionPlanFromEthers(tx)),
    };
  }

  /**
   * Create a repay transaction for repaying borrowed base token
   * In Compound V3, repaying is done by supplying base token
   */
  public async createRepayTransaction(params: RepayTokensRequest): Promise<RepayTokensResponse> {
    const { repayToken, amount, walletAddress } = params;
    const comet = this.getCometContract();
    const baseToken = await comet.baseToken();

    // Verify that the repay token is the base token
    const repayTokenAddress = ethers.utils.getAddress(repayToken.tokenUid.address);
    if (repayTokenAddress !== baseToken) {
      throw new Error(
        `Compound V3 only supports repaying the base token (${baseToken}), not ${repayTokenAddress}`,
      );
    }

    // Repay is done by supplying base token
    const txs = await this.supply(baseToken, amount, walletAddress);

    return {
      transactions: txs.map((tx) => this.transactionPlanFromEthers(tx)),
    };
  }

  // ============================================================================
  // Private Transaction Methods
  // ============================================================================

  /**
   * Helper to convert ethers PopulatedTransaction to TransactionPlan
   */
  private transactionPlanFromEthers(tx: PopulatedTransaction): TransactionPlan {
    return {
      type: TransactionTypes.EVM_TX,
      to: tx.to!,
      value: tx.value?.toString() || '0',
      data: tx.data!,
      chainId: this.chain.id.toString(),
    };
  }

  /**
   * Get the current borrow APY from the Comet contract
   * @returns Borrow APY as a string (e.g., "0.05" for 5%)
   */
  private async getBorrowApy(): Promise<string> {
    const comet = this.getCometContract();
    const utilization = await comet.getUtilization();
    const borrowRatePerSecond = await comet.getBorrowRate(utilization);

    // Convert per-second rate to APY
    // borrowRatePerSecond is scaled by baseAccrualScale (typically 1e18)
    // APY = (1 + rate_per_second)^(seconds_per_year) - 1
    // For small rates: APY ≈ rate_per_second * seconds_per_year
    const secondsPerYear = 365 * 24 * 60 * 60; // 31,536,000 seconds
    const baseAccrualScale = ethers.BigNumber.from(10).pow(18); // 1e18

    // Calculate APY: (borrowRatePerSecond / baseAccrualScale) * secondsPerYear
    const rateDecimal = borrowRatePerSecond.mul(secondsPerYear).div(baseAccrualScale);
    const apyDecimal = rateDecimal.toString();

    // Convert to percentage string (e.g., "0.05" for 5%)
    // For better precision, we can return the decimal directly
    return apyDecimal;
  }

  /**
   * Supply collateral or base token to Compound V3
   * @param asset - Token address to supply (can be collateral or base token)
   * @param amount - Amount to supply (in token's native decimals)
   * @param from - Address supplying the tokens
   */
  private async supply(
    asset: string,
    amount: bigint,
    from: string,
  ): Promise<PopulatedTransaction[]> {
    const validatedAsset = ethers.utils.getAddress(asset);
    const validatedFrom = ethers.utils.getAddress(from);
    const comet = this.getCometContract();
    const cometAddress = this.market.COMET;

    const transactions: PopulatedTransaction[] = [];

    // Check if approval is needed
    // For base token (native token), no approval needed if using native ETH
    // For ERC20 tokens, check allowance
    const baseToken = await comet.baseToken();
    const isBaseToken = validatedAsset.toLowerCase() === baseToken.toLowerCase();

    if (!isBaseToken) {
      // For collateral tokens, we need approval
      const tokenContract = new ethers.Contract(
        validatedAsset,
        ['function allowance(address owner, address spender) view returns (uint256)'],
        this.getProvider(),
      );

      const allowance = await tokenContract['allowance'](validatedFrom, cometAddress);
      const amountBN = ethers.BigNumber.from(amount.toString());

      if (allowance.lt(amountBN)) {
        // Create approval transaction
        // approve(address spender, uint256 amount) is always available in ERC20 contracts
        const approvalTx = await tokenContract.populateTransaction['approve']!(
          cometAddress,
          ethers.constants.MaxUint256, // Approve max for gas efficiency
        );
        transactions.push(approvalTx);
      }
    }

    // Create supply transaction
    // supply(address asset, uint256 amount) is always available in Comet contract
    const supplyTx = await comet.populateTransaction['supply']!(
      validatedAsset,
      ethers.BigNumber.from(amount.toString()),
    );
    transactions.push(supplyTx);

    return transactions;
  }

  /**
   * Withdraw collateral or base token from Compound V3
   * For base token, this can be either withdrawing supply or borrowing
   * @param asset - Token address to withdraw (can be collateral or base token)
   * @param amount - Amount to withdraw (in token's native decimals)
   */
  private async withdraw(asset: string, amount: bigint): Promise<PopulatedTransaction[]> {
    const validatedAsset = ethers.utils.getAddress(asset);
    const comet = this.getCometContract();

    // Create withdraw transaction
    // withdraw(address asset, uint256 amount) is always available in Comet contract
    // No approval needed for withdrawals
    const withdrawTx = await comet.populateTransaction['withdraw']!(
      validatedAsset,
      ethers.BigNumber.from(amount.toString()),
    );

    return [withdrawTx];
  }
}

import { ethers, type PopulatedTransaction } from 'ethers';

import {
  type GetWalletLendingPositionsResponse,
  type GetWalletLendingPositionsRequest,
} from '../core/index.js';

import { Chain } from './chain.js';
import { type CompoundMarket, getMarket } from './market.js';
import { handleCompoundError } from './error.js';
import { UserSummary, type CompoundUserPosition } from './userSummary.js';

// Comet contract interface for view functions
// Based on Compound V3 documentation: https://docs.compound.finance/helper-functions/
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
      'function baseScale() external pure returns (uint64)',
      'function factorScale() external pure returns (uint64)',
      'function priceScale() external pure returns (uint64)',
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

  // Transaction creation methods (to be implemented)
  // - createSupplyTransaction
  // - createWithdrawTransaction
  // - createBorrowTransaction
  // - createRepayTransaction

  // ============================================================================
  // Private Transaction Methods
  // ============================================================================

  // Private transaction building methods (to be implemented)
  // - supply
  // - withdraw
  // - borrow
  // - repay
}

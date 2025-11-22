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
import { handleCompoundError } from './error.js';
import { type CompoundMarket, getMarket } from './market.js';
import { UserSummary, type CompoundUserPosition } from './userSummary.js';

/**
 * Native ETH placeholder address used in DeFi protocols.
 * This is the standard address used to represent native ETH.
 */
const NATIVE_ETH_PLACEHOLDER = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// ============================================================================
// Constants
// ============================================================================

/**
 * Decimal precision constants used in Compound V3 calculations
 */
const DECIMALS = {
  /** Price scale uses 8 decimals (e.g., 1 USD = 1e8) */
  PRICE_SCALE: 8,
  /** Health factor and LTV calculations use 18 decimals for precision */
  PRECISION: 18,
  /** Factor scale uses 18 decimals (e.g., 0.8 = 0.8e18) */
  FACTOR_SCALE: 18,
} as const;

/**
 * Constants for health factor calculations
 */
const HEALTH_FACTOR = {
  /** Infinite health factor representation (no borrows) */
  INFINITE: ethers.BigNumber.from(10).pow(36),
  /** Precision multiplier for health factor calculation */
  PRECISION_MULTIPLIER: ethers.BigNumber.from(10).pow(18),
} as const;

/**
 * Constants for LTV percentage calculation
 */
const LTV = {
  /** Multiplier to convert decimal to percentage (10^20 = 10^18 * 100) */
  PERCENTAGE_MULTIPLIER: ethers.BigNumber.from(10).pow(20),
  /** Format decimals for percentage output (18 decimals) */
  FORMAT_DECIMALS: 18,
} as const;

/**
 * Time constants for APY calculations
 */
const TIME = {
  /** Seconds per year (365 * 24 * 60 * 60) */
  SECONDS_PER_YEAR: 365 * 24 * 60 * 60,
} as const;

/**
 * Constants for liquidation threshold calculation
 */
const LIQUIDATION = {
  /** Maximum value for uint64 scaled (used as initial value for min calculation) */
  MAX_UINT64_SCALED: ethers.BigNumber.from('999999999999999999'),
} as const;

/**
 * Comet contract interface for view and transaction functions.
 *
 * This interface extends ethers.Contract to provide type-safe access to Compound V3 (Comet) contract methods.
 * Based on the official Compound V3 documentation and ABI.
 *
 * @see {@link https://docs.compound.finance/helper-functions/ Compound V3 Documentation}
 * @see {@link https://docs.compound.finance/public/files/comet-interface-abi-98f438b.json ABI Reference}
 */
interface CometContract extends ethers.Contract {
  // Account balances
  balanceOf(account: string): Promise<ethers.BigNumber>;
  borrowBalanceOf(account: string): Promise<ethers.BigNumber>;
  collateralBalanceOf(account: string, asset: string): Promise<ethers.BigNumber>;

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

/**
 * Configuration parameters for initializing a CompoundAdapter instance.
 */
export interface CompoundAdapterParams {
  /** Chain ID where the Compound V3 market is deployed (e.g., 42161 for Arbitrum) */
  chainId: number;
  /** RPC URL for blockchain interactions */
  rpcUrl: string;
  /** Market identifier (e.g., 'USDC', 'WETH', 'USDCE') */
  marketId: string;
  /** Optional wrapped native token address (e.g., WETH on Ethereum) */
  wrappedNativeToken?: string;
}

/**
 * Type alias for Compound transaction actions.
 * @deprecated Not currently used, kept for potential future use
 */
export type CompoundAction = PopulatedTransaction[];

/**
 * CompoundAdapter provides a high-level interface for interacting with Compound V3 (Comet) protocol.
 *
 * This adapter handles:
 * - Querying user lending positions (collateral, borrows, health factor, LTV)
 * - Creating transactions for supply, withdraw, borrow, and repay operations
 * - Calculating risk metrics (health factor, LTV, available borrows)
 *
 * @remarks
 * Compound V3 uses a simplified model compared to V2:
 * - Single borrowable asset (base token, typically a stablecoin)
 * - Multiple collateral assets
 * - Borrowing is done via `withdraw()` of the base token
 * - Repaying is done via `supply()` of the base token
 *
 * @example
 * ```typescript
 * const adapter = new CompoundAdapter({
 *   chainId: 42161,
 *   rpcUrl: 'https://arb1.arbitrum.io/rpc',
 *   marketId: 'USDC',
 * });
 *
 * const positions = await adapter.getUserSummary({
 *   walletAddress: '0x...',
 * });
 * ```
 */
export class CompoundAdapter {
  public readonly chain: Chain;
  public readonly market: CompoundMarket;

  /** Cached Comet contract instance to avoid recreating on every call */
  private _cometContract: CometContract | null = null;

  /** Cached base token address to avoid repeated contract calls */
  private _baseToken: string | null = null;

  constructor(params: CompoundAdapterParams) {
    this.chain = new Chain(params.chainId, params.rpcUrl, params.wrappedNativeToken);
    this.market = getMarket(params.chainId, params.marketId);
  }

  // ============================================================================
  // Public View Methods
  // ============================================================================

  /**
   * Retrieves comprehensive lending position information for a wallet address.
   *
   * This method fetches and calculates:
   * - Collateral positions with USD values
   * - Borrow positions (base token only in Compound V3)
   * - Health factor (risk metric for liquidation)
   * - Loan-to-Value (LTV) ratio as percentage (0-100)
   * - Available borrow capacity
   * - Net worth (collateral - borrows)
   *
   * @param params - Request parameters containing the wallet address
   * @param params.walletAddress - Ethereum address to query (case-insensitive)
   * @returns Promise resolving to user's lending positions and risk metrics
   * @throws {CompoundError} If contract interaction fails with a Compound-specific error
   * @throws {Error} For other errors during execution
   *
   * @example
   * ```typescript
   * const summary = await adapter.getUserSummary({
   *   walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
   * });
   * console.log(`Health Factor: ${summary.healthFactor}`);
   * console.log(`LTV: ${summary.currentLoanToValue}%`);
   * ```
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

    // Add collateral positions (include if balance > 0, regardless of USD value)
    for (const coll of collateral) {
      if (coll.balance.gt(0)) {
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

    // Add base token position (supply and/or borrow)
    // The base token can be both supplied (lent) and borrowed
    const comet = this.getCometContract();
    const baseToken = await this.getBaseToken();
    const baseTokenSupply = await comet.balanceOf(params.walletAddress);
    const baseScale = await comet.baseScale();
    const priceScale = await comet.priceScale();
    // Calculate USD value: (supply * priceScale) / baseScale
    // For stablecoins, priceScale typically equals baseScale, so this simplifies to supply amount
    const baseTokenSupplyUsd = baseTokenSupply.gt(0)
      ? ethers.utils.formatUnits(
          baseTokenSupply.mul(priceScale).div(baseScale),
          DECIMALS.PRICE_SCALE,
        )
      : '0';

    // Add base token if there's supply or borrows
    // Use BigNumber comparison for precision instead of parseFloat
    const baseTokenSupplyUsdBN = ethers.utils.parseUnits(
      baseTokenSupplyUsd || '0',
      DECIMALS.PRICE_SCALE,
    );
    const totalBorrowsUsdBN = ethers.utils.parseUnits(totalBorrowsUsd || '0', DECIMALS.PRICE_SCALE);
    if (baseTokenSupplyUsdBN.gt(0) || totalBorrowsUsdBN.gt(0)) {
      userReservesFormatted.push({
        tokenUid: {
          address: baseToken,
          chainId: this.chain.id.toString(),
        },
        underlyingBalance: baseTokenSupply.toString(),
        underlyingBalanceUsd: baseTokenSupplyUsd,
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

  /**
   * Gets the JSON-RPC provider for blockchain interactions.
   * @returns Configured ethers.js JsonRpcProvider instance
   */
  private getProvider(): ethers.providers.JsonRpcProvider {
    return this.chain.getProvider();
  }

  /**
   * Gets or creates a typed Comet contract instance.
   *
   * The contract instance is cached to avoid recreating it on every call,
   * improving performance and reducing memory allocations.
   *
   * The contract is initialized with a minimal ABI containing only the functions
   * needed for this adapter. This reduces bundle size and improves type safety.
   *
   * @returns Typed CometContract instance for interacting with the Compound V3 market
   */
  private getCometContract(): CometContract {
    if (this._cometContract === null) {
      const provider = this.getProvider();
      // Using minimal ABI for view functions - will be extended as needed
      const cometAbi = [
        'function balanceOf(address account) external view returns (uint256)',
        'function borrowBalanceOf(address account) external view returns (uint256)',
        'function collateralBalanceOf(address account, address asset) external view returns (uint128)',
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
      this._cometContract = new ethers.Contract(
        this.market.COMET,
        cometAbi,
        provider,
      ) as CometContract;
    }
    return this._cometContract;
  }

  /**
   * Gets the base token address, caching it to avoid repeated contract calls.
   *
   * @returns Promise resolving to the base token address
   */
  private async getBaseToken(): Promise<string> {
    if (this._baseToken === null) {
      const comet = this.getCometContract();
      this._baseToken = await comet.baseToken();
    }
    return this._baseToken;
  }

  /**
   * Validates that the provided token address matches the base token.
   *
   * @param tokenAddress - Token address to validate
   * @param operation - Operation name for error message (e.g., "borrow", "repay")
   * @throws {Error} If token address does not match the base token
   */
  private async validateBaseToken(tokenAddress: string, operation: string): Promise<void> {
    const baseToken = await this.getBaseToken();
    const validatedTokenAddress = ethers.utils.getAddress(tokenAddress);
    if (validatedTokenAddress !== baseToken) {
      throw new Error(
        `Compound V3 only supports ${operation} the base token (${baseToken}), not ${validatedTokenAddress}`,
      );
    }
  }

  // ============================================================================
  // Private View Methods
  // ============================================================================

  /**
   * Internal method to fetch and format user summary from Compound V3 protocol.
   *
   * This method performs the core logic of:
   * 1. Fetching user's collateral positions (using assetsIn bitmap for efficiency)
   * 2. Calculating USD values using price feeds
   * 3. Computing risk metrics (health factor, LTV, available borrows)
   * 4. Formatting data into a UserSummary object
   *
   * @param userAddress - Validated Ethereum address to query
   * @returns Promise resolving to UserSummary with all position data
   * @throws {CompoundError} If contract interaction fails with Compound-specific error
   * @throws {Error} For other errors during execution
   *
   * @remarks
   * - Uses `assetsIn` bitmap to only query balances for assets the user actually has
   * - Skips invalid assets gracefully to handle edge cases
   * - All USD calculations use 8 decimal precision (priceScale)
   * - LTV is returned as percentage (0-100) for consistency with industry standards
   */
  private async _getUserSummary(userAddress: string): Promise<UserSummary> {
    const validatedUser = ethers.utils.getAddress(userAddress);
    const comet = this.getCometContract();

    try {
      // ========================================================================
      // Step 1: Fetch Protocol Scales
      // ========================================================================
      // These scales are used for all calculations to maintain precision
      // - baseScale: Scaling factor for base token (typically 1e6 for USDC)
      // - factorScale: Scaling factor for collateral/liquidation factors (typically 1e18)
      // - priceScale: Scaling factor for prices (typically 1e8)
      const baseScale = await comet.baseScale();
      const factorScale = await comet.factorScale();
      const priceScale = await comet.priceScale();

      // ========================================================================
      // Step 2: Fetch User Borrow Position
      // ========================================================================
      const borrowedBase = await comet.borrowBalanceOf(validatedUser);
      const userBasic = await comet.userBasic(validatedUser);
      // assetsIn is a bitmap where each bit represents an asset index
      // Bit 0 = asset 0, Bit 1 = asset 1, etc.
      // This allows efficient checking without querying all assets
      const assetsIn = userBasic.assetsIn;

      // ========================================================================
      // Step 3: Fetch Collateral Positions
      // ========================================================================
      const numAssets = await comet.numAssets();
      const collateralPositions: Array<{
        asset: string;
        balance: ethers.BigNumber;
        balanceUsd: string;
      }> = [];

      let totalCollateralValue = ethers.BigNumber.from(0);

      // numAssets() returns uint8 (0-255), safe to convert to number
      const numAssetsCount = Number(numAssets);

      for (let i = 0; i < numAssetsCount; i++) {
        try {
          // Check if asset is in the user's assetsIn bitmap before querying balance
          // This avoids unnecessary calls and potential reverts
          const assetsInNum = Number(assetsIn);
          const assetBit = 1 << i;
          if ((assetsInNum & assetBit) === 0) {
            // Asset not in user's portfolio, skip
            continue;
          }

          const assetInfo = await comet.getAssetInfo(i);

          // Skip if asset address is invalid
          if (!assetInfo.asset || assetInfo.asset === ethers.constants.AddressZero) {
            continue;
          }

          const collateralBalance = await comet.collateralBalanceOf(validatedUser, assetInfo.asset);

          if (collateralBalance.gt(0)) {
            // Fetch current price from oracle
            const price = await comet.getPrice(assetInfo.priceFeed);
            const assetScale = assetInfo.scale;

            // Calculate USD value using Compound V3's pricing formula:
            // USD Value = (balance * price * priceScale) / (assetScale * baseScale)
            // This accounts for different token decimals and price feed scaling
            const balanceScaled = collateralBalance.mul(price).mul(priceScale);
            const divisor = assetScale.mul(baseScale);
            const usdValue = balanceScaled.div(divisor);

            totalCollateralValue = totalCollateralValue.add(usdValue);

            collateralPositions.push({
              asset: assetInfo.asset,
              balance: collateralBalance,
              balanceUsd: ethers.utils.formatUnits(usdValue, DECIMALS.PRICE_SCALE),
            });
          }
        } catch (_error) {
          // Skip assets that fail (e.g., invalid asset, contract revert)
          // This can happen if an asset index is out of bounds or asset is invalid
          continue;
        }
      }

      // ========================================================================
      // Step 4: Calculate Borrow USD Value
      // ========================================================================
      // For stablecoins (like USDC), the base token price is 1:1 with USD
      // Price is represented as priceScale (typically 1e8) for 1 USD
      const basePrice = priceScale; // 1 USD = priceScale in the price feed
      const borrowUsdValue = borrowedBase.mul(basePrice).div(baseScale);
      const borrowBalanceUsd = ethers.utils.formatUnits(borrowUsdValue, DECIMALS.PRICE_SCALE);

      const totalCollateralUsd = ethers.utils.formatUnits(
        totalCollateralValue,
        DECIMALS.PRICE_SCALE,
      );
      const totalBorrowsUsd = borrowBalanceUsd;

      // ========================================================================
      // Step 5: Calculate Liquidation Threshold
      // ========================================================================
      // The liquidation threshold is the minimum of all collateral factors
      // This represents the maximum LTV before liquidation can occur
      // We use the minimum to be conservative (worst-case scenario)
      let minLiquidationFactor = LIQUIDATION.MAX_UINT64_SCALED;
      for (const coll of collateralPositions) {
        const assetInfo = await comet.getAssetInfoByAddress(coll.asset);
        if (assetInfo.liquidateCollateralFactor.lt(minLiquidationFactor)) {
          minLiquidationFactor = assetInfo.liquidateCollateralFactor;
        }
      }

      // ========================================================================
      // Step 6: Calculate Health Factor
      // ========================================================================
      // Health Factor = (Max Borrowable Value) / (Current Borrow Value)
      // Where Max Borrowable = Collateral Value * Liquidation Factor
      //
      // Health Factor > 1: Position is safe
      // Health Factor = 1: At liquidation threshold
      // Health Factor < 1: Position can be liquidated
      //
      // We calculate manually using BigNumber for precision
      const borrowValueScaled = borrowUsdValue;
      const collateralValueScaled = totalCollateralValue;

      let healthFactorValue = ethers.BigNumber.from(0);
      if (borrowValueScaled.gt(0) && collateralValueScaled.gt(0)) {
        // Calculate max borrowable: collateral * liquidationFactor / factorScale
        const maxBorrowable = collateralValueScaled.mul(minLiquidationFactor).div(factorScale);
        // Health factor = (maxBorrowable / borrowValue) * precision multiplier
        healthFactorValue = maxBorrowable
          .mul(HEALTH_FACTOR.PRECISION_MULTIPLIER)
          .div(borrowValueScaled);
      } else if (borrowValueScaled.eq(0) && collateralValueScaled.gt(0)) {
        // No borrows = infinite health factor (represented as very large number)
        healthFactorValue = HEALTH_FACTOR.INFINITE;
      }

      const healthFactor = healthFactorValue.gt(0)
        ? ethers.utils.formatUnits(healthFactorValue, DECIMALS.PRECISION)
        : '0';

      // ========================================================================
      // Step 7: Calculate Loan-to-Value (LTV)
      // ========================================================================
      // LTV = (Borrow Value / Collateral Value) * 100
      // Returns as percentage (0-100) for consistency with industry standards
      //
      // Calculation: (borrow / collateral) * PERCENTAGE_MULTIPLIER, then format with 18 decimals
      // Result: (borrow / collateral) * 10^20 / 10^18 = (borrow / collateral) * 100
      const ltvValue = collateralValueScaled.gt(0)
        ? borrowValueScaled.mul(LTV.PERCENTAGE_MULTIPLIER).div(collateralValueScaled)
        : ethers.BigNumber.from(0);
      const currentLoanToValue = ethers.utils.formatUnits(ltvValue, LTV.FORMAT_DECIMALS);

      // ========================================================================
      // Step 8: Calculate Available Borrows
      // ========================================================================
      // Available Borrows = Max Borrowable - Current Borrows
      // Max Borrowable = Collateral Value * Liquidation Factor
      const maxBorrowValue = collateralValueScaled.mul(minLiquidationFactor).div(factorScale);
      const availableBorrowsUsd = maxBorrowValue.gt(borrowValueScaled)
        ? ethers.utils.formatUnits(maxBorrowValue.sub(borrowValueScaled), DECIMALS.PRICE_SCALE)
        : '0';

      // ========================================================================
      // Step 9: Calculate Net Worth
      // ========================================================================
      // Net Worth = Total Collateral - Total Borrows
      const netWorthValue = totalCollateralValue.sub(borrowUsdValue);
      const netWorthUsd = ethers.utils.formatUnits(netWorthValue, DECIMALS.PRICE_SCALE);

      const position: CompoundUserPosition = {
        collateral: collateralPositions,
        borrowBalance: borrowedBase,
        borrowBalanceUsd: totalBorrowsUsd,
        totalCollateralUsd,
        totalBorrowsUsd,
        netWorthUsd,
        healthFactor,
        currentLoanToValue,
        currentLiquidationThreshold: ethers.utils.formatUnits(
          minLiquidationFactor,
          DECIMALS.FACTOR_SCALE,
        ),
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
   * Creates a transaction plan for supplying collateral or base token to Compound V3.
   *
   * This method handles:
   * - ERC20 token approval (if needed)
   * - Supply transaction creation
   *
   * @param params - Supply transaction parameters
   * @param params.supplyToken - Token to supply (can be collateral or base token)
   * @param params.amount - Amount to supply in token's native decimals
   * @param params.walletAddress - Address that will supply the tokens
   * @returns Promise resolving to transaction plan with approval + supply transactions
   *
   * @remarks
   * - All ERC20 tokens (including base tokens) require approval before supply
   * - Approval is set to MaxUint256 for gas efficiency
   * - Native ETH (0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE) is automatically wrapped to WETH before supply
   * - Requires `wrappedNativeToken` to be configured in adapter params for native ETH support
   *
   * @example
   * ```typescript
   * // Supply ERC20 token
   * const result = await adapter.createSupplyTransaction({
   *   supplyToken: { tokenUid: { address: '0x...', chainId: '42161' }, decimals: 8, ... },
   *   amount: BigInt('100000000'), // 1 token with 8 decimals
   *   walletAddress: '0x...',
   * });
   *
   * // Supply native ETH (auto-wraps to WETH)
   * const ethResult = await adapter.createSupplyTransaction({
   *   supplyToken: { tokenUid: { address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', chainId: '42161' }, decimals: 18, ... },
   *   amount: BigInt('1000000000000000000'), // 1 ETH
   *   walletAddress: '0x...',
   * });
   * // Execute result.transactions (includes WETH deposit + approval + supply)
   * ```
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
   * Creates a transaction plan for withdrawing collateral or base token from Compound V3.
   *
   * @param params - Withdraw transaction parameters
   * @param params.tokenToWithdraw - Token to withdraw (can be collateral or base token)
   * @param params.amount - Amount to withdraw in token's native decimals
   * @returns Promise resolving to transaction plan with withdraw transaction
   *
   * @remarks
   * - For base tokens: withdraws from supply first, then borrows if supply is insufficient
   * - For collateral: withdraws from collateral position
   * - No approval needed for withdrawals
   *
   * @example
   * ```typescript
   * const result = await adapter.createWithdrawTransaction({
   *   tokenToWithdraw: { tokenUid: { address: '0x...', chainId: '42161' }, decimals: 8, ... },
   *   amount: BigInt('50000000'), // 0.5 token with 8 decimals
   * });
   * ```
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
   * Creates a transaction plan for borrowing the base token from Compound V3.
   *
   * In Compound V3, borrowing is implemented by withdrawing the base token.
   * The protocol automatically creates a borrow position if there's no supply to withdraw.
   *
   * @param params - Borrow transaction parameters
   * @param params.borrowToken - Token to borrow (must be the base token)
   * @param params.amount - Amount to borrow in token's native decimals
   * @param params.walletAddress - Address that will borrow (must have collateral)
   * @returns Promise resolving to transaction plan with borrow transaction and risk metrics
   * @throws {Error} If borrowToken is not the base token
   *
   * @remarks
   * - Compound V3 only supports borrowing the base token (typically a stablecoin)
   * - User must have sufficient collateral to borrow against
   * - Returns current borrow APY and liquidation threshold for risk assessment
   *
   * @example
   * ```typescript
   * const result = await adapter.createBorrowTransaction({
   *   borrowToken: { tokenUid: { address: baseTokenAddress, chainId: '42161' }, decimals: 6, ... },
   *   amount: BigInt('1000000'), // 1 USDC (6 decimals)
   *   walletAddress: '0x...',
   * });
   * console.log(`Borrow APY: ${result.currentBorrowApy}`);
   * ```
   */
  public async createBorrowTransaction(params: BorrowTokensRequest): Promise<BorrowTokensResponse> {
    const { borrowToken, amount, walletAddress } = params;

    // Verify that the borrow token is the base token
    await this.validateBaseToken(borrowToken.tokenUid.address, 'borrowing');

    // Borrow is done by withdrawing base token
    const baseToken = await this.getBaseToken();
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
   * Creates a transaction plan for repaying borrowed base token to Compound V3.
   *
   * In Compound V3, repaying is implemented by supplying the base token.
   * The protocol automatically applies the supply to the borrow position.
   *
   * @param params - Repay transaction parameters
   * @param params.repayToken - Token to repay (must be the base token)
   * @param params.amount - Amount to repay in token's native decimals
   * @param params.walletAddress - Address that will repay (must have tokens and approval)
   * @returns Promise resolving to transaction plan with approval + repay transactions
   * @throws {Error} If repayToken is not the base token
   *
   * @remarks
   * - Compound V3 only supports repaying the base token
   * - Requires ERC20 approval if not already approved
   * - Repayment reduces borrow balance and improves health factor
   *
   * @example
   * ```typescript
   * const result = await adapter.createRepayTransaction({
   *   repayToken: { tokenUid: { address: baseTokenAddress, chainId: '42161' }, decimals: 6, ... },
   *   amount: BigInt('500000'), // 0.5 USDC (6 decimals)
   *   walletAddress: '0x...',
   * });
   * ```
   */
  public async createRepayTransaction(params: RepayTokensRequest): Promise<RepayTokensResponse> {
    const { repayToken, amount, walletAddress } = params;

    // Verify that the repay token is the base token
    await this.validateBaseToken(repayToken.tokenUid.address, 'repaying');

    // Repay is done by supplying base token
    const baseToken = await this.getBaseToken();
    const txs = await this.supply(baseToken, amount, walletAddress);

    return {
      transactions: txs.map((tx) => this.transactionPlanFromEthers(tx)),
    };
  }

  // ============================================================================
  // Private Transaction Methods
  // ============================================================================

  /**
   * Converts an ethers.js PopulatedTransaction to the TransactionPlan format.
   *
   * @param tx - Ethers.js populated transaction object
   * @returns TransactionPlan formatted for execution
   */
  private transactionPlanFromEthers(tx: PopulatedTransaction): TransactionPlan {
    if (!tx.to) {
      throw new Error('Transaction must have a recipient address');
    }
    if (!tx.data) {
      throw new Error('Transaction must have data');
    }

    return {
      type: TransactionTypes.EVM_TX,
      to: tx.to,
      value: tx.value?.toString() || '0',
      data: tx.data,
      chainId: this.chain.id.toString(),
    };
  }

  /**
   * Calculates the current borrow APY (Annual Percentage Yield) from the Comet contract.
   *
   * The APY is calculated from the per-second borrow rate returned by the contract.
   * For small rates, we use the approximation: APY ≈ rate_per_second * seconds_per_year
   *
   * @returns Promise resolving to borrow APY as a decimal string (e.g., "0.05" for 5%)
   *
   * @remarks
   * - Uses current utilization to get the borrow rate
   * - Rate is scaled by baseAccrualScale (typically 1e18)
   * - Returns decimal format (0.05 = 5%) for consistency
   */
  private async getBorrowApy(): Promise<string> {
    const comet = this.getCometContract();
    const utilization = await comet.getUtilization();
    const borrowRatePerSecond = await comet.getBorrowRate(utilization);

    // Convert per-second rate to APY
    // Formula: APY = (1 + rate_per_second)^(seconds_per_year) - 1
    // For small rates, approximation: APY ≈ rate_per_second * seconds_per_year
    const baseAccrualScale = ethers.BigNumber.from(10).pow(DECIMALS.PRECISION); // 1e18

    // Calculate: (borrowRatePerSecond / baseAccrualScale) * secondsPerYear
    const rateDecimal = borrowRatePerSecond.mul(TIME.SECONDS_PER_YEAR).div(baseAccrualScale);
    return rateDecimal.toString();
  }

  /**
   * Internal method to create supply transactions for collateral or base token.
   *
   * Handles native ETH auto-wrapping and ERC20 approval if needed, then creates the supply transaction.
   * All ERC20 tokens (including base tokens) require approval before supply.
   *
   * @param asset - Token address to supply (can be collateral, base token, or native ETH placeholder)
   * @param amount - Amount to supply in token's native decimals
   * @param from - Address that will supply the tokens (must have balance and approval)
   * @returns Promise resolving to array of populated transactions (wrap + approval + supply)
   *
   * @remarks
   * - If native ETH (address(0)) is provided, automatically wraps to WETH first
   * - Checks current allowance and adds approval transaction if insufficient
   * - Approval is set to MaxUint256 for gas efficiency
   * - Requires `wrappedNativeToken` to be configured in adapter params for native ETH support
   *
   * @throws {Error} If native ETH placeholder is provided but `wrappedNativeToken` is not configured
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
    let targetAsset = validatedAsset;

    // Handle native ETH auto-wrapping
    // Compound V3 doesn't support native ETH directly in the Comet contract
    // Best practice: Auto-wrap ETH to WETH first, then supply WETH
    // This matches Compound's UI behavior where backend wraps ETH before supplying
    // Native ETH is represented as 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE (standard DeFi convention)
    if (validatedAsset === NATIVE_ETH_PLACEHOLDER) {
      // Get WETH address from chain configuration
      const wethAddress = this.chain.wrappedNativeTokenAddress;
      if (!wethAddress) {
        throw new Error(
          `Native ETH supply requires wrappedNativeToken to be configured. Please provide WETH address in adapter params.`,
        );
      }

      // Create WETH deposit transaction to wrap ETH
      // Functions: deposit() payable, withdraw(uint256 amount)
      const wethContract = new ethers.Contract(
        wethAddress,
        ['function deposit() external payable', 'function withdraw(uint256 amount) external'],
        this.getProvider(),
      );

      // Populate transaction with value override for payable function
      // In ethers v5, populateTransaction accepts overrides as the last parameter
      const wrapTx = await wethContract.populateTransaction['deposit']!({
        value: ethers.BigNumber.from(amount.toString()),
      });

      // Ensure value is set (populateTransaction should set it, but we verify)
      if (!wrapTx.value) {
        wrapTx.value = ethers.BigNumber.from(amount.toString());
      }

      transactions.push(wrapTx);

      // Use WETH address for subsequent operations
      targetAsset = ethers.utils.getAddress(wethAddress);
    }

    // Check current allowance for ERC20 tokens (including WETH after wrapping)
    // All ERC20 tokens (including base tokens like USDC) require approval
    interface ERC20Contract {
      allowance: (owner: string, spender: string) => Promise<ethers.BigNumber>;
      populateTransaction: {
        approve: (spender: string, amount: ethers.BigNumber) => Promise<PopulatedTransaction>;
      };
    }

    const tokenContract = new ethers.Contract(
      targetAsset,
      [
        'function allowance(address owner, address spender) view returns (uint256)',
        'function approve(address spender, uint256 amount) returns (bool)',
      ],
      this.getProvider(),
    ) as unknown as ERC20Contract;

    const allowance = await tokenContract.allowance(validatedFrom, cometAddress);
    const amountBN = ethers.BigNumber.from(amount.toString());

    if (allowance.lt(amountBN)) {
      // Create approval transaction with MaxUint256 for gas efficiency
      // This avoids needing multiple approvals for future transactions
      const approvalTx = await tokenContract.populateTransaction.approve(
        cometAddress,
        ethers.constants.MaxUint256,
      );
      transactions.push(approvalTx);
    }

    // Create supply transaction
    // Compound V3's supply() function accepts any ERC20 asset (collateral or base token)
    // After wrapping, we supply WETH instead of native ETH
    const supplyTx = await comet.populateTransaction['supply']!(
      targetAsset,
      ethers.BigNumber.from(amount.toString()),
    );
    transactions.push(supplyTx);

    return transactions;
  }

  /**
   * Internal method to create withdraw transaction for collateral or base token.
   *
   * For base tokens, Compound V3's withdraw() function:
   * 1. First withdraws from supply (if available)
   * 2. Then borrows if supply is insufficient
   *
   * For collateral tokens, withdraws from the collateral position.
   *
   * @param asset - Token address to withdraw (can be collateral or base token)
   * @param amount - Amount to withdraw in token's native decimals
   * @returns Promise resolving to array with withdraw transaction
   *
   * @remarks
   * - No approval needed for withdrawals (tokens are already in the protocol)
   * - For base tokens, this is used for both withdrawing supply and borrowing
   * - WETH unwrapping (WETH.withdraw(uint256)) can be done separately after withdrawal
   */
  private async withdraw(asset: string, amount: bigint): Promise<PopulatedTransaction[]> {
    const validatedAsset = ethers.utils.getAddress(asset);
    const comet = this.getCometContract();

    // Create withdraw transaction
    // Compound V3's withdraw() handles both supply withdrawal and borrowing for base tokens
    const withdrawTx = await comet.populateTransaction['withdraw']!(
      validatedAsset,
      ethers.BigNumber.from(amount.toString()),
    );

    return [withdrawTx];
  }
}

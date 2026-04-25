import {
  Pool,
  PoolBundle,
  InterestRate,
  type ReservesDataHumanized,
  type ReserveDataHumanized,
} from '@aave/contract-helpers';
import type { ComputedUserReserve, FormatReserveUSDResponse } from '@aave/math-utils';
import { ethers, type PopulatedTransaction, utils } from 'ethers';

import {
  type TransactionPlan,
  type BorrowTokensRequest,
  type BorrowTokensResponse,
  type RepayTokensRequest,
  type RepayTokensResponse,
  type SupplyTokensRequest,
  type SupplyTokensResponse,
  type WithdrawTokensRequest,
  type WithdrawTokensResponse,
  type GetWalletLendingPositionsResponse,
  TransactionTypes,
  type GetWalletLendingPositionsRequest,
  type Token,
} from '../core/index.js';

import { Chain } from './chain.js';
import { getUiPoolDataProviderImpl, type IUiPoolDataProvider } from './dataProvider.js';
import { type AAVEMarket, getMarket } from './market.js';
import { populateTransaction } from './populateTransaction.js';
import { UserSummary } from './userSummary.js';

type UserReserveWithQuote = ComputedUserReserve<FormatReserveUSDResponse>;
type ReserveQuoteFields = Pick<
  FormatReserveUSDResponse,
  | 'underlyingAsset'
  | 'priceInUSD'
  | 'priceInMarketReferenceCurrency'
  | 'formattedPriceInMarketReferenceCurrency'
  | 'availableLiquidity'
  | 'availableLiquidityUSD'
> &
  Partial<Pick<FormatReserveUSDResponse, 'symbol' | 'name' | 'decimals'>>;

function hasVisibleReservePosition({
  underlyingBalance,
  totalBorrows,
}: Pick<UserReserveWithQuote, 'underlyingBalance' | 'totalBorrows'>): boolean {
  return underlyingBalance !== '0' || totalBorrows !== '0';
}

function toLendingReserveDetail(
  chainId: string,
  {
    reserve,
    underlyingBalance = '0',
    underlyingBalanceUSD = '0',
    variableBorrows = '0',
    variableBorrowsUSD = '0',
    totalBorrows = '0',
    totalBorrowsUSD = '0',
  }: {
    reserve: ReserveQuoteFields;
    underlyingBalance?: string;
    underlyingBalanceUSD?: string;
    variableBorrows?: string;
    variableBorrowsUSD?: string;
    totalBorrows?: string;
    totalBorrowsUSD?: string;
  },
) {
  return {
    tokenUid: {
      address: reserve.underlyingAsset,
      chainId,
    },
    ...(reserve.symbol !== undefined ? { symbol: reserve.symbol } : {}),
    ...(reserve.name !== undefined ? { name: reserve.name } : {}),
    ...(reserve.decimals !== undefined ? { decimals: reserve.decimals } : {}),
    underlyingBalance,
    underlyingBalanceUsd: underlyingBalanceUSD,
    variableBorrows,
    variableBorrowsUsd: variableBorrowsUSD,
    totalBorrows,
    totalBorrowsUsd: totalBorrowsUSD,
    priceInUsd: reserve.priceInUSD,
    priceInMarketReferenceCurrency: reserve.priceInMarketReferenceCurrency,
    formattedPriceInMarketReferenceCurrency: reserve.formattedPriceInMarketReferenceCurrency,
    availableLiquidity: reserve.availableLiquidity,
    availableLiquidityUsd: reserve.availableLiquidityUSD,
  };
}

export type EModeCategory = 'default' | 'stablecoins';

export interface PoolData {
  tokenAddress: string;
  poolAddress: string;
  variableBorrowRate: string;
  variableSupplyRate: string;
  ltv: string;
  availableLiquidity: string;
  reserveSize: string;
}

export type AAVEAction = PopulatedTransaction[];

export interface AAVEAdapterParams {
  chainId: number;
  rpcUrl: string;
  wrappedNativeToken?: string; // e.g. WETH address for ETH
}

// AAVE's ETH placeholder address used for native ETH operations
const AAVE_ETH_PLACEHOLDER = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

/**
 * AAVEAdapter is the primary class wrapping Aave V3 interactions.
 */
export class AAVEAdapter {
  public chain: Chain;
  public market: AAVEMarket;

  constructor(params: AAVEAdapterParams) {
    this.chain = new Chain(params.chainId, params.rpcUrl);
    this.market = getMarket(this.chain.id);
  }

  /**
   * If the token is native, return AAVE's placeholder address instead of the ember address.
   * @param token - The token to normalize.
   * @returns The normalized token address.
   */
  public normalizeTokenAddress(token: Token): string {
    return token.isNative ? AAVE_ETH_PLACEHOLDER : token.tokenUid.address;
  }

  public async createSupplyTransaction(params: SupplyTokensRequest): Promise<SupplyTokensResponse> {
    const { supplyToken: token, amount, walletAddress } = params;
    const txs = await this.supply(
      this.normalizeTokenAddress(token),
      amount.toString(),
      walletAddress,
    );
    return {
      transactions: txs.map((t) => transactionPlanFromEthers(this.chain.id.toString(), t)),
    };
  }

  public async createWithdrawTransaction(
    params: WithdrawTokensRequest,
  ): Promise<WithdrawTokensResponse> {
    const { tokenToWithdraw, amount, walletAddress } = params;

    const reserve = (await this.getReserves()).reservesData.find(
      (candidate) =>
        candidate.underlyingAsset.toLowerCase() === tokenToWithdraw.tokenUid.address.toLowerCase(),
    );
    if (!reserve) {
      throw new Error('No position can generate the token to withdraw');
    }

    const txs = await this.withdraw(
      reserve.underlyingAsset,
      utils.formatUnits(amount, tokenToWithdraw.decimals),
      walletAddress,
      walletAddress,
    );
    return {
      transactions: txs.map((t) => transactionPlanFromEthers(this.chain.id.toString(), t)),
    };
  }

  public async createBorrowTransaction(params: BorrowTokensRequest): Promise<BorrowTokensResponse> {
    const { borrowToken, amount, walletAddress } = params;
    const normalizedTokenAddress = this.normalizeTokenAddress(borrowToken);

    // Get pool data to fetch APR
    const poolData = await this.getPool(normalizedTokenAddress);
    const reservesResponse = await this.getReserves();

    let reserveLiquidationThreshold: string | null = null;
    for (const reserve of reservesResponse.reservesData) {
      const token = ethers.utils.getAddress(reserve.underlyingAsset);
      if (token === normalizedTokenAddress) {
        reserveLiquidationThreshold = reserve.reserveLiquidationThreshold;
      }
    }

    if (reserveLiquidationThreshold == null) {
      throw new Error('Reserve not found in AAVE pool for a given token');
    }

    // Create borrow transaction
    const txs = await this.borrow(normalizedTokenAddress, amount.toString(), walletAddress);

    return {
      liquidationThreshold: reserveLiquidationThreshold,
      currentBorrowApy: poolData.variableBorrowRate,
      transactions: txs.map((t) => transactionPlanFromEthers(this.chain.id.toString(), t)),
    };
  }

  public async createRepayTransaction(params: RepayTokensRequest): Promise<RepayTokensResponse> {
    const { repayToken, amount, walletAddress: from } = params;

    const normalizedAsset = this.normalizeTokenAddress(repayToken);

    // Choose repayment method based on useATokens flag
    const txs = await this.repay(normalizedAsset, amount.toString(), from);

    return {
      transactions: txs.map((t) => transactionPlanFromEthers(this.chain.id.toString(), t)),
    };
  }

  public async createRepayTransactionWithATokens(
    params: RepayTokensRequest,
  ): Promise<RepayTokensResponse> {
    const { repayToken, amount, walletAddress: from } = params;

    const normalizedAsset = this.normalizeTokenAddress(repayToken);

    // Choose repayment method based on useATokens flag
    const txs = await this.repayWithATokens(
      normalizedAsset,
      amount.toString(),
      from,
    );

    return {
      transactions: txs.map((t) => transactionPlanFromEthers(this.chain.id.toString(), t)),
    };
  }

  // Private Methods
  private getProvider() {
    return this.chain.getProvider();
  }

  private getPoolBundle() {
    const provider = this.getProvider();
    return new PoolBundle(provider, {
      POOL: this.market.POOL,
      WETH_GATEWAY: this.market.WETH_GATEWAY,
    });
  }

  private getPoolDataProvider(): IUiPoolDataProvider {
    const provider = this.getProvider();
    const DataProviderImpl = getUiPoolDataProviderImpl(this.chain.id);
    return new DataProviderImpl({
      uiPoolDataProviderAddress: this.market.UI_POOL_DATA_PROVIDER,
      provider,
      chainId: this.chain.id,
    });
  }

  private getPoolContract() {
    const provider = this.getProvider();
    return new Pool(provider, {
      POOL: this.market.POOL,
      WETH_GATEWAY: this.market.WETH_GATEWAY,
    });
  }

  private async getPool(asset: string): Promise<PoolData> {
    const reservesResponse = await this.getReserves();

    let targetAsset = asset;

    // If asset is AAVE's native token placeholder, find the corresponding wrapped native token reserve
    if (asset === AAVE_ETH_PLACEHOLDER) {
      const configuredWrappedNativeToken = this.chain.wrappedNativeTokenAddress;

      if (!configuredWrappedNativeToken) {
        throw new Error(`No wrapped native token configured for chain ${this.chain.id}`);
      }

      const wrappedNativeTokenReserve = reservesResponse.reservesData.find(
        (r: ReserveDataHumanized) =>
          ethers.utils.getAddress(r.underlyingAsset) === configuredWrappedNativeToken,
      );

      if (!wrappedNativeTokenReserve) {
        throw new Error(`Wrapped native token reserve not found for native token operations`);
      }

      targetAsset = wrappedNativeTokenReserve.underlyingAsset;
    }

    const reserve = reservesResponse.reservesData.find(
      (r: ReserveDataHumanized) =>
        ethers.utils.getAddress(r.underlyingAsset) === ethers.utils.getAddress(targetAsset),
    );

    if (!reserve) {
      throw new Error(`Asset ${asset} not found in reserves`);
    }

    return {
      tokenAddress: reserve.underlyingAsset,
      poolAddress: this.market.POOL,
      variableBorrowRate: reserve.variableBorrowRate,
      variableSupplyRate: reserve.liquidityRate,
      ltv: reserve.baseLTVasCollateral,
      availableLiquidity: reserve.availableLiquidity,
      reserveSize: reserve.availableLiquidity,
    };
  }

  public async getReserves(): Promise<ReservesDataHumanized> {
    const reserves = this.getPoolDataProvider().getReservesHumanized({
      lendingPoolAddressProvider: this.market.POOL_ADDRESSES_PROVIDER,
    });
    return reserves;
  }

  public async getUserSummary(
    params: GetWalletLendingPositionsRequest,
  ): Promise<GetWalletLendingPositionsResponse> {
    const userSummaryResponse = await this._getUserSummary(params.walletAddress);
    const {
      totalLiquidityUSD,
      totalCollateralUSD,
      totalBorrowsUSD,
      netWorthUSD,
      availableBorrowsUSD,
      currentLoanToValue,
      currentLiquidationThreshold,
      healthFactor,
      userReservesData,
    } = userSummaryResponse.reserves;

    const chainId = this.chain.id.toString();
    const userReservesFormatted = userReservesData
      .filter(hasVisibleReservePosition)
      .map((reserve) => toLendingReserveDetail(chainId, reserve));

    const requestedReserveAddress = params.tokenAddress
      ? params.tokenAddress.toLowerCase()
      : undefined;
    const requestedReserve = requestedReserveAddress
      ? userReservesFormatted.find(
          ({ tokenUid }) => tokenUid.address.toLowerCase() === requestedReserveAddress,
        ) ??
        (() => {
          const reserve = userSummaryResponse.getReserveByUnderlyingAsset(requestedReserveAddress);

          if (!reserve) {
            return undefined;
          }

          return toLendingReserveDetail(chainId, { reserve });
        })()
      : undefined;

    return {
      userReserves: userReservesFormatted,
      requestedReserve,
      totalLiquidityUsd: totalLiquidityUSD,
      totalCollateralUsd: totalCollateralUSD,
      totalBorrowsUsd: totalBorrowsUSD,
      netWorthUsd: netWorthUSD,
      availableBorrowsUsd: availableBorrowsUSD,
      currentLoanToValue,
      currentLiquidationThreshold,
      healthFactor,
    };
  }

  private async _getUserSummary(userAddress: string): Promise<UserSummary> {
    const validatedUser = ethers.utils.getAddress(userAddress);
    const poolDataProvider = this.getPoolDataProvider();

    const reservesResponse = await this.getReserves();

    const userReservesResponse = await poolDataProvider.getUserReservesHumanized({
      lendingPoolAddressProvider: this.market.POOL_ADDRESSES_PROVIDER,
      user: validatedUser,
    });

    return new UserSummary(userReservesResponse, reservesResponse);
  }

  private borrow(asset: string, amount: string, from: string): Promise<AAVEAction> {
    // validate
    ethers.utils.getAddress(asset);
    ethers.utils.getAddress(from);

    const bundle: PoolBundle = this.getPoolBundle();

    const tx = bundle.borrowTxBuilder.generateTxData({
      user: from,
      reserve: asset,
      amount,
      interestRateMode: InterestRate.Variable,
    });

    return Promise.resolve([tx]);
  }

  private async createApproval({
    asset,
    amount_raw,
    user,
    spender,
  }: {
    spender: string;
    user: string;
    asset: string;
    amount_raw: string;
  }): Promise<PopulatedTransaction | null> {
    const bundle = this.getPoolBundle();
    let approvalTx = null;
    const isApprovedEnough = await bundle.erc20Service.isApproved({
      user: user,
      token: asset,
      spender,
      amount: amount_raw,
      nativeDecimals: true,
    });

    if (!isApprovedEnough) {
      approvalTx = bundle.erc20Service.approveTxData({
        user,
        token: asset,
        spender,
        amount: amount_raw,
      });
    }

    return approvalTx;
  }

  private async supply(asset: string, amount: string, from: string): Promise<AAVEAction> {
    // validate
    ethers.utils.getAddress(asset);
    ethers.utils.getAddress(from);

    const bundle = this.getPoolBundle();

    const approvalTx = await this.createApproval({
      asset,
      amount_raw: amount,
      user: from,
      spender: bundle.poolAddress,
    });

    const tx = bundle.supplyTxBuilder.generateTxData({
      user: from,
      reserve: asset,
      amount,
      onBehalfOf: from,
    });

    return (approvalTx ? [approvalTx] : []).concat([tx]);
  }

  private async repay(asset: string, amount: string, from: string): Promise<AAVEAction> {
    // validate
    ethers.utils.getAddress(asset);
    ethers.utils.getAddress(from);

    const bundle: PoolBundle = this.getPoolBundle();

    const tx = bundle.repayTxBuilder.generateTxData({
      user: from,
      reserve: asset,
      amount: amount,
      interestRateMode: InterestRate.Variable,
      onBehalfOf: from,
    });

    const approvalTx = await this.createApproval({
      asset,
      amount_raw: amount,
      user: from,
      spender: bundle.poolAddress,
    });

    return (approvalTx ? [approvalTx] : []).concat([tx]);
  }

  private repayWithATokens(asset: string, amount: string, from: string): Promise<AAVEAction> {
    ethers.utils.getAddress(asset);
    ethers.utils.getAddress(from);
    const bundle = this.getPoolBundle();
    const tx = bundle.repayWithATokensTxBuilder.generateTxData({
      user: from,
      reserve: asset,
      amount,
      rateMode: InterestRate.Variable,
    });
    return Promise.resolve([tx]);
  }

  private async withdraw(
    asset: string,
    amount_formatted: string,
    to: string,
    from: string,
  ): Promise<AAVEAction> {
    ethers.utils.getAddress(asset);
    ethers.utils.getAddress(to);
    ethers.utils.getAddress(from);

    const pool = this.getPoolContract();
    const txs = await pool.withdraw({
      user: from,
      reserve: asset,
      amount: amount_formatted,
    });

    if (txs.length !== 1) {
      throw new Error('AAVEInstance.withdraw: impossible happened');
    }

    // Null coercion is safe here because we checked txs.length above
    return [await populateTransaction(txs[0]!)];
  }
}

const transactionPlanFromEthers = (
  chainId: string,
  tx: ethers.PopulatedTransaction,
): TransactionPlan => {
  return {
    type: TransactionTypes.EVM_TX,
    to: tx.to!,
    value: tx.value?.toString() || '0',
    data: tx.data!,
    chainId,
  };
};

import { createPublicClient, http, parseAbi, type Address, type PublicClient } from 'viem';
import { arbitrum } from 'viem/chains';
import type {
  SupplyTokensRequest,
  SupplyTokensResponse,
  WithdrawTokensRequest,
  WithdrawTokensResponse,
  BorrowTokensRequest,
  BorrowTokensResponse,
  RepayTokensRequest,
  RepayTokensResponse,
  GetWalletLendingPositionsRequest,
  GetWalletLendingPositionsResponse,
} from '../core/index.js';

import type {
  RadiantAdapterParams,
  RadiantMarket,
  RadiantPosition,
  RadiantTxResult,
} from './types.js';
import { wrapRadiantError, RADIANT_CONFIG } from './types.js';

/**
 * Adapter class for interacting with Radiant Capital V2 lending protocol
 */
export class RadiantAdapter {
  public readonly client: PublicClient;
  public readonly chain = arbitrum;

  /**
   * Initialize RadiantAdapter with configuration parameters
   * @param params - Configuration including chainId, rpcUrl, and wrappedNativeToken
   */
  constructor(private params: RadiantAdapterParams) {
    this.client = createPublicClient({
      transport: http(params.rpcUrl),
      chain: arbitrum,
    });
  }

  /**
   * Fetch all available markets from Radiant protocol
   * @returns Array of RadiantMarket objects with market data
   */
  async fetchMarkets(): Promise<RadiantMarket[]> {
    try {
      // Copy of markets.ts logic but using this.client instead of hardcoded RPC
      const dataProviderAbi = parseAbi([
        'function getAllReservesTokens() external view returns (tuple(string symbol, address tokenAddress)[])',
        'function getReserveConfigurationData(address asset) external view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)',
        'function getReserveData(address asset) external view returns (uint256 availableLiquidity, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)'
      ]);

      const oracleAbi = parseAbi([
        'function getAssetPrice(address asset) external view returns (uint256)'
      ]);

      const reserves = await this.client.readContract({
        address: RADIANT_CONFIG.addresses.dataProvider as Address,
        abi: dataProviderAbi,
        functionName: 'getAllReservesTokens'
      });

      const markets: RadiantMarket[] = [];

      for (const reserve of reserves) {
        const [configData, reserveData, price] = await Promise.all([
          this.client.readContract({
            address: RADIANT_CONFIG.addresses.dataProvider as Address,
            abi: dataProviderAbi,
            functionName: 'getReserveConfigurationData',
            args: [reserve.tokenAddress]
          }),
          this.client.readContract({
            address: RADIANT_CONFIG.addresses.dataProvider as Address,
            abi: dataProviderAbi,
            functionName: 'getReserveData',
            args: [reserve.tokenAddress]
          }),
          this.client.readContract({
            address: RADIANT_CONFIG.addresses.oracle as Address,
            abi: oracleAbi,
            functionName: 'getAssetPrice',
            args: [reserve.tokenAddress]
          })
        ]);

        const supplyAPR = ((Number(reserveData[3]) / 1e27) * 100).toFixed(2);
        const borrowAPR = ((Number(reserveData[4]) / 1e27) * 100).toFixed(2);

        markets.push({
          symbol: reserve.symbol,
          address: reserve.tokenAddress,
          decimals: Number(configData[0]),
          ltv: Number(configData[1]) / 100,
          liquidationThreshold: Number(configData[2]) / 100,
          supplyAPR,
          borrowAPR,
          liquidity: reserveData[0].toString(),
          price: price.toString()
        });
      }

      return markets;
    } catch (error) {
      throw wrapRadiantError('fetchMarkets failed', error);
    }
  }

  /**
   * Get user's lending position for a specific address
   * @param address - User's wallet address
   * @returns RadiantPosition object with user's lending data
   */
  async getUserPosition(address: Address): Promise<RadiantPosition> {
    try {
      // Copy of positions.ts logic but using this.client
      const lendingPoolAbi = parseAbi([
        'function getUserAccountData(address user) external view returns (uint256 totalCollateralETH, uint256 totalDebtETH, uint256 availableBorrowsETH, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)'
      ]);

      const dataProviderAbi = parseAbi([
        'function getUserReserveData(address asset, address user) external view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)'
      ]);

      const [accountData, markets] = await Promise.all([
        this.client.readContract({
          address: RADIANT_CONFIG.addresses.lendingPool as Address,
          abi: lendingPoolAbi,
          functionName: 'getUserAccountData',
          args: [address]
        }),
        this.fetchMarkets()
      ]);

      const positions = [];
      for (const market of markets) {
        const userData = await this.client.readContract({
          address: RADIANT_CONFIG.addresses.dataProvider as Address,
          abi: dataProviderAbi,
          functionName: 'getUserReserveData',
          args: [market.address as Address, address]
        });

        if (userData[0] > 0n || userData[2] > 0n) {
          positions.push({
            asset: market.symbol,
            supplied: userData[0].toString(),
            borrowed: userData[2].toString()
          });
        }
      }

      return {
        address,
        healthFactor: accountData[5].toString(),
        totalCollateralUSD: accountData[0].toString(),
        totalDebtUSD: accountData[1].toString(),
        positions
      };
    } catch (error) {
      throw wrapRadiantError('getUserPosition failed', error);
    }
  }

  /**
   * Get user's lending positions summary for wallet
   * @param request - Request containing wallet address
   * @returns GetWalletLendingPositionsResponse with user's positions
   */
  async getUserSummary(request: GetWalletLendingPositionsRequest): Promise<GetWalletLendingPositionsResponse> {
    try {
      const position = await this.getUserPosition(request.walletAddress as Address);
      
      return {
        walletAddress: request.walletAddress,
        positions: position.positions.map(pos => ({
          asset: pos.asset,
          supplied: pos.supplied,
          borrowed: pos.borrowed,
        })),
        healthFactor: position.healthFactor,
        totalCollateralUSD: position.totalCollateralUSD,
        totalDebtUSD: position.totalDebtUSD,
      };
    } catch (error) {
      throw wrapRadiantError('getUserSummary failed', error);
    }
  }

  /**
   * Create supply transaction for depositing tokens to earn yield
   * @param request - Supply request with token details and amount
   * @returns SupplyTokensResponse with transaction data
   */
  async createSupplyTransaction(request: SupplyTokensRequest): Promise<SupplyTokensResponse> {
    try {
      const txResult = this.buildSupplyTx({
        token: request.tokenAddress as Address,
        amount: request.amount,
        onBehalfOf: request.walletAddress as Address,
      });

      return {
        transactionPlan: {
          type: 'single',
          transaction: {
            to: txResult.to as Address,
            data: txResult.data as `0x${string}`,
            value: BigInt(txResult.value || '0'),
          },
        },
      };
    } catch (error) {
      throw wrapRadiantError('createSupplyTransaction failed', error);
    }
  }

  /**
   * Create withdraw transaction for withdrawing supplied tokens
   * @param request - Withdraw request with token details and amount
   * @returns WithdrawTokensResponse with transaction data
   */
  async createWithdrawTransaction(request: WithdrawTokensRequest): Promise<WithdrawTokensResponse> {
    try {
      const txResult = this.buildWithdrawTx({
        token: request.tokenAddress as Address,
        amount: request.amount,
        to: request.walletAddress as Address,
      });

      return {
        transactionPlan: {
          type: 'single',
          transaction: {
            to: txResult.to as Address,
            data: txResult.data as `0x${string}`,
            value: BigInt(txResult.value || '0'),
          },
        },
      };
    } catch (error) {
      throw wrapRadiantError('createWithdrawTransaction failed', error);
    }
  }

  /**
   * Create borrow transaction for borrowing tokens against collateral
   * @param request - Borrow request with token details and amount
   * @returns BorrowTokensResponse with transaction data
   */
  async createBorrowTransaction(request: BorrowTokensRequest): Promise<BorrowTokensResponse> {
    try {
      const txResult = this.buildBorrowTx({
        token: request.tokenAddress as Address,
        amount: request.amount,
        rateMode: 2,
        onBehalfOf: request.walletAddress as Address,
      });

      return {
        transactionPlan: {
          type: 'single',
          transaction: {
            to: txResult.to as Address,
            data: txResult.data as `0x${string}`,
            value: BigInt(txResult.value || '0'),
          },
        },
      };
    } catch (error) {
      throw wrapRadiantError('createBorrowTransaction failed', error);
    }
  }

  /**
   * Create repay transaction for repaying borrowed tokens
   * @param request - Repay request with token details and amount
   * @returns RepayTokensResponse with transaction data
   */
  async createRepayTransaction(request: RepayTokensRequest): Promise<RepayTokensResponse> {
    try {
      const txResult = this.buildRepayTx({
        token: request.tokenAddress as Address,
        amount: request.amount,
        rateMode: 2,
        onBehalfOf: request.walletAddress as Address,
      });

      return {
        transactionPlan: {
          type: 'single',
          transaction: {
            to: txResult.to as Address,
            data: txResult.data as `0x${string}`,
            value: BigInt(txResult.value || '0'),
          },
        },
      };
    } catch (error) {
      throw wrapRadiantError('createRepayTransaction failed', error);
    }
  }

  private buildSupplyTx(params: { token: Address; amount: string; onBehalfOf?: Address }): RadiantTxResult {
    const lendingPoolAbi = parseAbi([
      'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external'
    ]);

    const data = this.client.encodeFunctionData({
      abi: lendingPoolAbi,
      functionName: 'supply',
      args: [params.token, BigInt(params.amount), params.onBehalfOf || params.token, 0]
    });

    return {
      to: RADIANT_CONFIG.addresses.lendingPool,
      data,
      value: '0'
    };
  }

  private buildWithdrawTx(params: { token: Address; amount: string; to?: Address }): RadiantTxResult {
    const lendingPoolAbi = parseAbi([
      'function withdraw(address asset, uint256 amount, address to) external returns (uint256)'
    ]);

    const data = this.client.encodeFunctionData({
      abi: lendingPoolAbi,
      functionName: 'withdraw',
      args: [params.token, BigInt(params.amount), params.to || params.token]
    });

    return {
      to: RADIANT_CONFIG.addresses.lendingPool,
      data,
      value: '0'
    };
  }

  private buildBorrowTx(params: { token: Address; amount: string; rateMode?: number; onBehalfOf?: Address }): RadiantTxResult {
    const lendingPoolAbi = parseAbi([
      'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external'
    ]);

    const data = this.client.encodeFunctionData({
      abi: lendingPoolAbi,
      functionName: 'borrow',
      args: [params.token, BigInt(params.amount), BigInt(params.rateMode || 2), 0, params.onBehalfOf || params.token]
    });

    return {
      to: RADIANT_CONFIG.addresses.lendingPool,
      data,
      value: '0'
    };
  }

  private buildRepayTx(params: { token: Address; amount: string; rateMode?: number; onBehalfOf?: Address }): RadiantTxResult {
    const lendingPoolAbi = parseAbi([
      'function repay(address asset, uint256 amount, uint256 rateMode, address onBehalfOf) external returns (uint256)'
    ]);

    const data = this.client.encodeFunctionData({
      abi: lendingPoolAbi,
      functionName: 'repay',
      args: [params.token, BigInt(params.amount), BigInt(params.rateMode || 2), params.onBehalfOf || params.token]
    });

    return {
      to: RADIANT_CONFIG.addresses.lendingPool,
      data,
      value: '0'
    };
  }

  async createSetCollateralTransaction(params: { tokenAddress: string; useAsCollateral: boolean; walletAddress: string }): Promise<any> {
    try {
      const txResult = this.buildSetCollateralTx({
        token: params.tokenAddress as Address,
        useAsCollateral: params.useAsCollateral,
      });

      return {
        transactionPlan: {
          type: 'single',
          transaction: {
            to: txResult.to as Address,
            data: txResult.data as `0x${string}`,
            value: BigInt(txResult.value || '0'),
          },
        },
      };
    } catch (error) {
      throw wrapRadiantError('createSetCollateralTransaction failed', error);
    }
  }

  async createUnsetCollateralTransaction(params: { tokenAddress: string; walletAddress: string }): Promise<any> {
    try {
      const txResult = this.buildSetCollateralTx({
        token: params.tokenAddress as Address,
        useAsCollateral: false,
      });

      return {
        transactionPlan: {
          type: 'single',
          transaction: {
            to: txResult.to as Address,
            data: txResult.data as `0x${string}`,
            value: BigInt(txResult.value || '0'),
          },
        },
      };
    } catch (error) {
      throw wrapRadiantError('createUnsetCollateralTransaction failed', error);
    }
  }

  private buildSetCollateralTx(params: { token: Address; useAsCollateral: boolean }): RadiantTxResult {
    const lendingPoolAbi = parseAbi([
      'function setUserUseReserveAsCollateral(address asset, bool useAsCollateral) external'
    ]);

    const data = this.client.encodeFunctionData({
      abi: lendingPoolAbi,
      functionName: 'setUserUseReserveAsCollateral',
      args: [params.token, params.useAsCollateral]
    });

    return {
      to: RADIANT_CONFIG.addresses.lendingPool,
      data,
      value: '0'
    };
  }
    const lendingPoolAbi = parseAbi([
      'function setUserUseReserveAsCollateral(address asset, bool useAsCollateral) external'
    ]);

    const data = this.client.encodeFunctionData({
      abi: lendingPoolAbi,
      functionName: 'setUserUseReserveAsCollateral',
      args: [params.token, params.useAsCollateral]
    });

    return {
      to: RADIANT_CONFIG.addresses.lendingPool,
      data,
      value: '0'
    };
  }

  async getReserves() {
    try {
      const markets = await this.fetchMarkets();
      
      return {
        reservesData: markets.map(market => ({
          underlyingAsset: market.address,
          aTokenAddress: market.address,
          symbol: market.symbol,
          decimals: market.decimals,
          ltv: market.ltv.toString(),
          liquidationThreshold: market.liquidationThreshold.toString(),
          borrowingEnabled: true,
          supplyAPR: market.supplyAPR,
          borrowAPR: market.borrowAPR,
          liquidity: market.liquidity,
          price: market.price,
        })),
      };
    } catch (error) {
      throw wrapRadiantError('getReserves failed', error);
    }
  }
}
    try {
      const markets = await this.fetchMarkets();
      
      return {
        reservesData: markets.map(market => ({
          underlyingAsset: market.address,
          aTokenAddress: market.address,
          symbol: market.symbol,
          decimals: market.decimals,
          ltv: market.ltv.toString(),
          liquidationThreshold: market.liquidationThreshold.toString(),
          borrowingEnabled: true,
          supplyAPR: market.supplyAPR,
          borrowAPR: market.borrowAPR,
          liquidity: market.liquidity,
          price: market.price,
        })),
      };
    } catch (error) {
      throw wrapRadiantError('getReserves failed', error);
    }
  }
}

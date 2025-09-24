import { Chain } from './chain.js';
import { type PancakeSwapLiquidityMarket, getMarket } from './market.js';
import { populateTransaction } from './populateTransaction.js';
import { ethers, type PopulatedTransaction } from 'ethers';
import type {
  TransactionPlan,
  SupplyLiquidityRequest,
  SupplyLiquidityResponse,
  WithdrawLiquidityRequest,
  WithdrawLiquidityResponse,
  GetWalletLiquidityPositionsRequest,
  GetWalletLiquidityPositionsResponse,
  GetLiquidityPoolsResponse,
  LiquidityPosition,
  LiquidityPool,
  Token,
} from '../core/index.js';

export interface PancakeSwapLiquidityAdapterParams {
  chainId: number;
  rpcUrl: string;
  wrappedNativeToken?: string;
}

/**
 * PancakeSwapLiquidityAdapter handles PancakeSwap V2 liquidity operations.
 */
export class PancakeSwapLiquidityAdapter {
  public chain: Chain;
  public market: PancakeSwapLiquidityMarket;

  constructor(params: PancakeSwapLiquidityAdapterParams) {
    this.chain = new Chain(params.chainId, params.rpcUrl);
    this.market = getMarket(this.chain.id);
  }

  /**
   * If the token is native, return the wrapped native token address.
   * @param token - The token to normalize.
   * @returns The normalized token address.
   */
  public normalizeTokenAddress(token: Token): string {
    return token.isNative ? this.market.wrappedNativeToken : token.tokenUid.address;
  }

  /**
   * Create a supply liquidity transaction.
   * @param params - The supply liquidity request parameters.
   * @returns The supply liquidity response.
   */
  public async createSupplyLiquidityTransaction(params: SupplyLiquidityRequest): Promise<SupplyLiquidityResponse> {
    const { token0, token1, amount0, amount1, walletAddress } = params;

    // For PancakeSwap V2, we need to add liquidity to a pair
    const txs = await this.addLiquidity(
      token0.address,
      token1.address,
      amount0,
      amount1,
      walletAddress
    );

    return {
      transactions: txs.map(t => this.transactionPlanFromEthers(t)),
      chainId: this.chain.id.toString(),
    };
  }

  /**
   * Create a withdraw liquidity transaction.
   * @param params - The withdraw liquidity request parameters.
   * @returns The withdraw liquidity response.
   */
  public async createWithdrawLiquidityTransaction(params: WithdrawLiquidityRequest): Promise<WithdrawLiquidityResponse> {
    const { tokenId, walletAddress } = params;

    // For PancakeSwap V2, tokenId represents the LP token address
    const txs = await this.removeLiquidity(tokenId, walletAddress);

    return {
      transactions: txs.map(t => this.transactionPlanFromEthers(t)),
      chainId: this.chain.id.toString(),
    };
  }

  /**
   * Get wallet liquidity positions.
   * @param params - The request parameters.
   * @returns The wallet liquidity positions.
   */
  public async getWalletLiquidityPositions(params: GetWalletLiquidityPositionsRequest): Promise<GetWalletLiquidityPositionsResponse> {
    const { walletAddress } = params;

    // Mock implementation - in a real implementation, you'd query the blockchain
    // for LP token balances and positions
    const positions: LiquidityPosition[] = [
      // This would be populated from actual blockchain queries
    ];

    return { positions };
  }

  /**
   * Get available liquidity pools.
   * @returns The liquidity pools response.
   */
  public async getLiquidityPools(): Promise<GetLiquidityPoolsResponse> {
    // Mock implementation - in a real implementation, you'd query for active pairs
    const liquidityPools: LiquidityPool[] = [
      // This would be populated from actual pair queries
    ];

    return { liquidityPools };
  }

  /**
   * Add liquidity to a PancakeSwap V2 pair.
   * @param tokenA - First token address.
   * @param tokenB - Second token address.
   * @param amountA - Amount of first token.
   * @param amountB - Amount of second token.
   * @param to - Recipient address.
   * @returns Array of populated transactions.
   */
  private async addLiquidity(
    tokenA: string,
    tokenB: string,
    amountA: bigint,
    amountB: bigint,
    to: string
  ): Promise<PopulatedTransaction[]> {
    const deadline = Math.floor(Date.now() / 1000) + 1200; // 20 minutes

    const routerInterface = new ethers.utils.Interface([
      'function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)',
      'function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)',
    ]);

    let data: string;
    let value: string = '0';

    // Handle different liquidity addition scenarios
    if (tokenA === this.market.wrappedNativeToken && tokenB !== this.market.wrappedNativeToken) {
      // ETH + Token
      data = routerInterface.encodeFunctionData('addLiquidityETH', [
        tokenB,
        amountB,
        amountB, // amountTokenMin (no slippage protection for simplicity)
        amountA, // amountETHMin
        to,
        deadline,
      ]);
      value = amountA.toString();
    } else if (tokenA !== this.market.wrappedNativeToken && tokenB === this.market.wrappedNativeToken) {
      // Token + ETH
      data = routerInterface.encodeFunctionData('addLiquidityETH', [
        tokenA,
        amountA,
        amountA, // amountTokenMin
        amountB, // amountETHMin
        to,
        deadline,
      ]);
      value = amountB.toString();
    } else {
      // Token + Token
      data = routerInterface.encodeFunctionData('addLiquidity', [
        tokenA,
        tokenB,
        amountA,
        amountB,
        amountA, // amountAMin (no slippage protection for simplicity)
        amountB, // amountBMin
        to,
        deadline,
      ]);
    }

    const tx: PopulatedTransaction = {
      to: this.market.routerAddress,
      data,
      value: ethers.BigNumber.from(value),
    };

    return [tx];
  }

  /**
   * Remove liquidity from a PancakeSwap V2 pair.
   * @param lpToken - LP token address.
   * @param to - Recipient address.
   * @returns Array of populated transactions.
   */
  private async removeLiquidity(lpToken: string, to: string): Promise<PopulatedTransaction[]> {
    const deadline = Math.floor(Date.now() / 1000) + 1200; // 20 minutes

    // For simplicity, we'll assume we want to remove all liquidity
    // In a real implementation, you'd need to calculate the amounts
    const routerInterface = new ethers.utils.Interface([
      'function removeLiquidity(address tokenA, address tokenB, uint liquidity, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB)',
    ]);

    // This is a simplified implementation - you'd need to determine tokenA, tokenB, and liquidity amount
    // For now, we'll create a placeholder transaction
    const data = routerInterface.encodeFunctionData('removeLiquidity', [
      '0x0000000000000000000000000000000000000000', // tokenA - placeholder
      '0x0000000000000000000000000000000000000000', // tokenB - placeholder
      '0', // liquidity - placeholder
      '0', // amountAMin
      '0', // amountBMin
      to,
      deadline,
    ]);

    const tx: PopulatedTransaction = {
      to: this.market.routerAddress,
      data,
      value: ethers.BigNumber.from('0'),
    };

    return [tx];
  }

  /**
   * Get common tokens for this chain.
   * @returns Array of common token addresses.
   */
  public async getCommonTokens(): Promise<string[]> {
    return [
      this.market.wrappedNativeToken, // WETH
      '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC
      '0x912CE59144191C1204E64559FE8253a0e49E6548', // ARB
      '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // USDT
      '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', // WBTC
    ];
  }

  /**
   * Convert ethers PopulatedTransaction to TransactionPlan.
   * @param tx - The ethers transaction.
   * @returns The TransactionPlan.
   */
  private transactionPlanFromEthers(tx: PopulatedTransaction): TransactionPlan {
    return {
      type: 'legacy', // Assuming legacy transaction type
      chainId: this.chain.id.toString(),
      to: tx.to!,
      data: tx.data || '0x',
      value: tx.value ? tx.value.toString() : '0',
    };
  }
}

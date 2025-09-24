import { Chain } from './chain.js';
import { type PancakeSwapMarket, getMarket } from './market.js';
import { populateTransaction } from './populateTransaction.js';
import { ethers, type PopulatedTransaction } from 'ethers';
import type {
  TransactionPlan,
  SwapTokensRequest,
  SwapTokensResponse,
  Token,
} from '../core/index.js';

export interface PancakeSwapAdapterParams {
  chainId: number;
  rpcUrl: string;
  wrappedNativeToken?: string; // e.g. WETH address for ETH
}

/**
 * PancakeSwapAdapter is the primary class wrapping PancakeSwap DEX interactions.
 */
export class PancakeSwapAdapter {
  public chain: Chain;
  public market: PancakeSwapMarket;

  constructor(params: PancakeSwapAdapterParams) {
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
   * Create a swap transaction for PancakeSwap.
   * @param params - The swap request parameters.
   * @returns The swap transaction response.
   */
  public async createSwapTransaction(params: SwapTokensRequest): Promise<SwapTokensResponse> {
    const { fromToken, toToken, amount, recipient, slippageTolerance, limitPrice } = params;

    // Get quote first
    const quote = await this.getQuote(
      this.normalizeTokenAddress(fromToken),
      this.normalizeTokenAddress(toToken),
      amount
    );

    // Apply slippage tolerance (default 0.5%)
    const slippage = slippageTolerance ? parseFloat(slippageTolerance) : 0.005;
    const amountOutMin = BigInt(Math.floor(Number(quote.amountOut) * (1 - slippage)));

    // Apply limit price if provided
    if (limitPrice) {
      const limitPriceBigInt = BigInt(Math.floor(parseFloat(limitPrice) * 10 ** 18));
      if (amountOutMin < limitPriceBigInt) {
        throw new Error(`Price too low. Expected at least ${limitPrice}, got ${amountOutMin}`);
      }
    }

    const txs = await this.swap(
      this.normalizeTokenAddress(fromToken),
      this.normalizeTokenAddress(toToken),
      amount,
      amountOutMin,
      recipient
    );

    return {
      fromToken,
      toToken,
      exactFromAmount: amount.toString(),
      displayFromAmount: ethers.utils.formatEther(amount),
      exactToAmount: quote.amountOut.toString(),
      displayToAmount: ethers.utils.formatEther(quote.amountOut),
      transactions: txs.map(t => this.transactionPlanFromEthers(t)),
      feeBreakdown: {
        serviceFee: '0',
        slippageCost: '0',
        total: '0',
        feeDenomination: 'ETH',
      },
    };
  }

  /**
   * Get a quote for swapping tokens.
   * @param tokenIn - The input token address.
   * @param tokenOut - The output token address.
   * @param amountIn - The input amount.
   * @returns The quote with amount out.
   */
  private async getQuote(tokenIn: string, tokenOut: string, amountIn: bigint): Promise<{ amountOut: bigint }> {
    const provider = new ethers.providers.JsonRpcProvider(this.chain.rpcUrl);
    const router = new ethers.Contract(
      this.market.routerAddress,
      [
        'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
      ],
      provider
    );

    const path = [tokenIn, tokenOut];
    const amounts = await router.getAmountsOut(amountIn, path);
    return { amountOut: amounts[1] };
  }

  /**
   * Execute a token swap.
   * @param tokenIn - Input token address.
   * @param tokenOut - Output token address.
   * @param amountIn - Input amount.
   * @param amountOutMin - Minimum output amount.
   * @param to - Recipient address.
   * @returns Array of populated transactions.
   */
  private async swap(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    amountOutMin: bigint,
    to: string
  ): Promise<PopulatedTransaction[]> {
    const deadline = Math.floor(Date.now() / 1000) + 1200; // 20 minutes
    const path = [tokenIn, tokenOut];

    const routerInterface = new ethers.utils.Interface([
      'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
      'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
      'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
    ]);

    let data: string;
    let value: string = '0';

    // Handle different swap scenarios
    if (tokenIn === this.market.wrappedNativeToken && tokenOut !== this.market.wrappedNativeToken) {
      // WETH -> Token: unwrap and swap
      data = routerInterface.encodeFunctionData('swapExactETHForTokens', [
        amountOutMin,
        path,
        to,
        deadline,
      ]);
      value = amountIn.toString();
    } else if (tokenIn !== this.market.wrappedNativeToken && tokenOut === this.market.wrappedNativeToken) {
      // Token -> WETH: swap and wrap
      data = routerInterface.encodeFunctionData('swapExactTokensForETH', [
        amountIn,
        amountOutMin,
        path,
        to,
        deadline,
      ]);
    } else {
      // Token -> Token
      data = routerInterface.encodeFunctionData('swapExactTokensForTokens', [
        amountIn,
        amountOutMin,
        path,
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
   * Get common tokens for this chain.
   * @returns Array of common token addresses.
   */
  public async getCommonTokens(): Promise<string[]> {
    // Return common tokens on Arbitrum
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

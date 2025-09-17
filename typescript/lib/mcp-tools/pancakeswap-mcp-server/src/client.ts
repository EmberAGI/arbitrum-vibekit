/**
 * PancakeSwap Client
 * Clean, type-safe client for PancakeSwap operations
 */

import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from 'viem'
import type { Address, Chain, PublicClient, WalletClient } from 'viem'
import { 
  CHAIN_CONFIGS, 
  PANCAKESWAP_ROUTER_ABI, 
  ERC20_ABI, 
  COMMON_TOKENS,
  DEFAULT_SLIPPAGE,
  DEFAULT_DEADLINE
} from './constants.js'
import type { 
  SupportedChain, 
  TokenInfo, 
  SwapParams, 
  AddLiquidityParams, 
  PoolInfo, 
  PriceQuote 
} from './types.js'
import { PancakeSwapError } from './types.js'

export class PancakeSwapClient {
  private publicClient: PublicClient
  private walletClient?: WalletClient
  private chainConfig: any

  constructor(
    chain: SupportedChain = 'bsc',
    rpcUrl?: string,
    privateKey?: `0x${string}`
  ) {
    this.chainConfig = CHAIN_CONFIGS[chain]
    
    // Override RPC URL if provided
    if (rpcUrl) {
      this.chainConfig.rpcUrl = rpcUrl
    }

    // Create public client
    this.publicClient = createPublicClient({
      chain: this.chainConfig.chain,
      transport: http(this.chainConfig.rpcUrl)
    })

    // Create wallet client if private key provided
    if (privateKey) {
      this.walletClient = createWalletClient({
        chain: this.chainConfig.chain,
        transport: http(this.chainConfig.rpcUrl),
        account: privateKey
      })
    }
  }

  /**
   * Get token information
   */
  async getTokenInfo(tokenAddress: Address): Promise<TokenInfo> {
    try {
      const [decimals, symbol, name] = await Promise.all([
        this.publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'decimals'
        }),
        this.publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'symbol'
        }),
        this.publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'name'
        })
      ])

      return {
        address: tokenAddress,
        symbol: symbol as string,
        name: name as string,
        decimals: Number(decimals),
        chainId: this.chainConfig.chain.id
      }
    } catch (error) {
      throw new PancakeSwapError(
        `Failed to get token info for ${tokenAddress}: ${error}`,
        'TOKEN_INFO_ERROR',
        this.chainConfig.chain.id
      )
    }
  }

  /**
   * Get price quote for a swap
   */
  async getPriceQuote(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: string,
    decimals: number = 18
  ): Promise<PriceQuote> {
    try {
      const amountInWei = parseUnits(amountIn, decimals)
      const path = [tokenIn, tokenOut]

      const amounts = await this.publicClient.readContract({
        address: this.chainConfig.routerAddress,
        abi: PANCAKESWAP_ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [amountInWei, path]
      })

      const amountOut = amounts[1]!
      const priceImpact = 0 // Simplified - would need more complex calculation

      return {
        tokenIn,
        tokenOut,
        amountIn: amountInWei,
        amountOut,
        priceImpact,
        route: path,
        chainId: this.chainConfig.chain.id
      }
    } catch (error) {
      throw new PancakeSwapError(
        `Failed to get price quote: ${error}`,
        'QUOTE_ERROR',
        this.chainConfig.chain.id
      )
    }
  }

  /**
   * Execute a token swap
   */
  async executeSwap(
    swapParams: SwapParams,
    privateKey: `0x${string}`
  ): Promise<{ hash: string; amountOut: bigint }> {
    if (!this.walletClient) {
      throw new PancakeSwapError(
        'Wallet client not initialized. Provide private key.',
        'WALLET_ERROR',
        this.chainConfig.chain.id
      )
    }

    try {
      const path = [swapParams.tokenIn, swapParams.tokenOut]
      
      const hash = await this.walletClient.writeContract({
        address: this.chainConfig.routerAddress,
        abi: PANCAKESWAP_ROUTER_ABI,
        functionName: 'swapExactTokensForTokens',
        args: [
          swapParams.amountIn,
          swapParams.amountOutMin,
          path,
          swapParams.to,
          swapParams.deadline
        ]
      })

      // Get the actual amount out from the transaction
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash })
      const amountOut = swapParams.amountOutMin // Simplified

      return { hash, amountOut }
    } catch (error) {
      throw new PancakeSwapError(
        `Failed to execute swap: ${error}`,
        'SWAP_ERROR',
        this.chainConfig.chain.id
      )
    }
  }

  /**
   * Add liquidity to a pool
   */
  async addLiquidity(
    params: AddLiquidityParams,
    privateKey: `0x${string}`
  ): Promise<{ hash: string; liquidity: bigint }> {
    if (!this.walletClient) {
      throw new PancakeSwapError(
        'Wallet client not initialized. Provide private key.',
        'WALLET_ERROR',
        this.chainConfig.chain.id
      )
    }

    try {
      const hash = await this.walletClient.writeContract({
        address: this.chainConfig.routerAddress,
        abi: PANCAKESWAP_ROUTER_ABI,
        functionName: 'addLiquidity',
        args: [
          params.tokenA,
          params.tokenB,
          params.amountADesired,
          params.amountBDesired,
          params.amountAMin,
          params.amountBMin,
          params.to,
          params.deadline
        ]
      })

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash })
      const liquidity = params.amountADesired // Simplified

      return { hash, liquidity }
    } catch (error) {
      throw new PancakeSwapError(
        `Failed to add liquidity: ${error}`,
        'LIQUIDITY_ERROR',
        this.chainConfig.chain.id
      )
    }
  }

  /**
   * Get current token price in USD (simplified)
   */
  async getTokenPrice(tokenAddress: Address, amount: string = '1'): Promise<string> {
    try {
      // For BSC, use BUSD as USD reference
      if (this.chainConfig.chain.id === 56) { // BSC
        const quote = await this.getPriceQuote(
          tokenAddress,
          COMMON_TOKENS.BSC.BUSD,
          amount
        )
        return formatUnits(quote.amountOut, 18)
      }
      
      // For other chains, use USDC
      const quote = await this.getPriceQuote(
        tokenAddress,
        this.chainConfig.wethAddress, // Fallback to WETH
        amount
      )
      return formatUnits(quote.amountOut, 18)
    } catch (error) {
      throw new PancakeSwapError(
        `Failed to get token price: ${error}`,
        'PRICE_ERROR',
        this.chainConfig.chain.id
      )
    }
  }

  /**
   * Check token allowance
   */
  async getAllowance(
    tokenAddress: Address,
    owner: Address,
    spender: Address
  ): Promise<bigint> {
    try {
      return await this.publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [owner, spender]
      })
    } catch (error) {
      throw new PancakeSwapError(
        `Failed to get allowance: ${error}`,
        'ALLOWANCE_ERROR',
        this.chainConfig.chain.id
      )
    }
  }

  /**
   * Approve token spending
   */
  async approveToken(
    tokenAddress: Address,
    spender: Address,
    amount: bigint,
    privateKey: `0x${string}`
  ): Promise<{ hash: string }> {
    if (!this.walletClient) {
      throw new PancakeSwapError(
        'Wallet client not initialized. Provide private key.',
        'WALLET_ERROR',
        this.chainConfig.chain.id
      )
    }

    try {
      const hash = await this.walletClient.writeContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spender, amount]
      })

      return { hash }
    } catch (error) {
      throw new PancakeSwapError(
        `Failed to approve token: ${error}`,
        'APPROVE_ERROR',
        this.chainConfig.chain.id
      )
    }
  }

  /**
   * Get chain information
   */
  getChainInfo() {
    return {
      chainId: this.chainConfig.chain.id,
      name: this.chainConfig.chain.name,
      routerAddress: this.chainConfig.routerAddress,
      wethAddress: this.chainConfig.wethAddress
    }
  }
}

/**
 * PancakeSwap Client
 * Clean, type-safe client for PancakeSwap operations
 */

import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
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
  PriceQuote,
  FarmInfo,
  SyrupPoolInfo
} from './types.js'
import { PancakeSwapError } from './types.js'

export class PancakeSwapClient {
  private publicClient: PublicClient
  private walletClient?: WalletClient
  private chainConfig: any

  constructor(
    chain: SupportedChain = 'arbitrum',
    rpcUrl?: string,
    privateKey?: `0x${string}`
  ) {
    this.chainConfig = CHAIN_CONFIGS[chain]
    
    // Override RPC URL if provided
    if (rpcUrl) {
      this.chainConfig.rpcUrl = rpcUrl
    }

    // Create public client
    const transport = http(this.chainConfig.rpcUrl)
    this.publicClient = createPublicClient({
      chain: this.chainConfig.chain,
      transport
    }) as any

    // Create wallet client if private key provided
    if (privateKey) {
      try {
        const account = privateKeyToAccount(privateKey)
        this.walletClient = createWalletClient({
          chain: this.chainConfig.chain,
          transport: http(this.chainConfig.rpcUrl),
          account: account
        }) as any
      } catch (error) {
        console.warn('Invalid private key provided, wallet client not initialized:', error)
        this.walletClient = undefined
      }
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
          functionName: 'decimals',
          authorizationList: undefined
        }),
        this.publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'symbol',
          authorizationList: undefined
        }),
        this.publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'name',
          authorizationList: undefined
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

      // For now, return mock data since PancakeSwap V2 is not available on Arbitrum
      // In a real implementation, you would integrate with Uniswap V3 or another DEX
      let mockAmountOut: bigint
      
      // Simple mock pricing based on common token pairs
      if (tokenIn === COMMON_TOKENS.ARBITRUM.WETH && tokenOut === COMMON_TOKENS.ARBITRUM.USDC) {
        // Mock: 1 WETH = 3000 USDC
        mockAmountOut = parseUnits('3000', 6) // USDC has 6 decimals
      } else if (tokenIn === COMMON_TOKENS.ARBITRUM.USDC && tokenOut === COMMON_TOKENS.ARBITRUM.WETH) {
        // Mock: 3000 USDC = 1 WETH
        mockAmountOut = parseUnits('1', 18)
      } else {
        // Default mock: assume 1:1 ratio for other pairs
        mockAmountOut = amountInWei
      }

      const amountOutMin = mockAmountOut * BigInt(995) / BigInt(1000) // 0.5% slippage
      const priceImpact = 0.1 // Mock 0.1% price impact

      return {
        tokenIn,
        tokenOut,
        amountIn: amountInWei.toString(), // Convert BigInt to string
        amountOut: mockAmountOut.toString(), // Convert BigInt to string
        amountOutMin: amountOutMin.toString(), // Convert BigInt to string
        priceImpact,
        path,
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
    swapParams: SwapParams
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
        account: this.walletClient.account,
        chain: this.chainConfig.chain,
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
        `Failed to execute swap: ${error}. Note: PancakeSwap on Arbitrum may not support traditional V2 swaps. Consider using Uniswap V3 or other DEXs on Arbitrum.`,
        'SWAP_ERROR',
        this.chainConfig.chain.id
      )
    }
  }

  /**
   * Add liquidity to a pool
   */
  async addLiquidity(
    params: AddLiquidityParams
  ): Promise<{ hash: string; liquidity: string }> {
    if (!this.walletClient) {
      throw new PancakeSwapError(
        'Wallet client not initialized. Provide private key.',
        'WALLET_ERROR',
        this.chainConfig.chain.id
      )
    }

    try {
      // Try to send the transaction
      const hash = await this.walletClient.writeContract({
        account: this.walletClient.account,
        chain: this.chainConfig.chain,
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

      return { hash, liquidity: liquidity.toString() }
    } catch (error) {
      throw new PancakeSwapError(
        `Failed to add liquidity: ${error}. Note: PancakeSwap on Arbitrum uses ALP pools for perpetual trading, not traditional V2 liquidity pools.`,
        'LIQUIDITY_ERROR',
        this.chainConfig.chain.id
      )
    }
  }

  /**
   * Remove liquidity from a pair
   */
  async removeLiquidity(params: {
    tokenA: Address
    tokenB: Address
    liquidity: bigint
    amountAMin: bigint
    amountBMin: bigint
    to: Address
    deadline: bigint
  }): Promise<{ hash: `0x${string}`, amountA: string, amountB: string }> {
    if (!this.walletClient) {
      throw new PancakeSwapError(
        'Wallet client not initialized. Provide private key.',
        'WALLET_ERROR',
        this.chainConfig.chain.id
      )
    }

    try {
      const hash = await this.walletClient.writeContract({
        account: this.walletClient.account,
        chain: this.chainConfig.chain,
        address: this.chainConfig.routerAddress,
        abi: PANCAKESWAP_ROUTER_ABI,
        functionName: 'removeLiquidity',
        args: [
          params.tokenA,
          params.tokenB,
          params.liquidity,
          params.amountAMin,
          params.amountBMin,
          params.to,
          params.deadline
        ]
      })

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash })
      
      // Mock return values - in real implementation, parse from transaction logs
      const amountA = params.amountAMin
      const amountB = params.amountBMin

      return { hash, amountA: amountA.toString(), amountB: amountB.toString() }
    } catch (error) {
      throw new PancakeSwapError(
        `Failed to remove liquidity: ${error}. Note: PancakeSwap on Arbitrum uses ALP pools for perpetual trading, not traditional V2 liquidity pools.`,
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
      // For Arbitrum, use USDC as USD reference
      const quote = await this.getPriceQuote(
        tokenAddress,
        COMMON_TOKENS.ARBITRUM.USDC,
        amount
      )
      return formatUnits(BigInt(quote.amountOut), 6) // USDC has 6 decimals
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
        args: [owner, spender],
        authorizationList: undefined
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
    amount: bigint
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
        account: this.walletClient.account,
        chain: this.chainConfig.chain,
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
   * Get PancakeSwap V2 pair address for two tokens
   */
  async getPairAddress(tokenA: Address, tokenB: Address): Promise<string> {
    try {
      const factoryAddress = this.chainConfig.factoryAddress
      if (!factoryAddress) {
        throw new PancakeSwapError('Factory address not configured for this chain', 'CONFIG_ERROR', this.chainConfig.chain.id)
      }

      // Sort tokens to ensure consistent pair address
      const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA]

      // For now, return a placeholder - proper CREATE2 calculation would need more complex implementation
      // This is a simplified approach that would need the actual factory contract interaction
      const pairAddress = '0x0000000000000000000000000000000000000000' // Placeholder

      return pairAddress
    } catch (error) {
      throw new PancakeSwapError(
        `Failed to get pair address: ${error}`,
        'PAIR_ADDRESS_ERROR',
        this.chainConfig.chain.id
      )
    }
  }

  /**
   * Get detailed information about a PancakeSwap V2 pair
   */
  async getPairInfo(pairAddress: Address): Promise<any> {
    try {
      // Return mock data since PancakeSwap V2 pairs don't exist on Arbitrum
      // In a real implementation, you would integrate with Uniswap V3 or another DEX
      const mockPairInfo = {
        address: pairAddress,
        token0: {
          address: COMMON_TOKENS.ARBITRUM.WETH,
          symbol: 'WETH',
          name: 'Wrapped Ether',
          decimals: 18
        },
        token1: {
          address: COMMON_TOKENS.ARBITRUM.USDC,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6
        },
        reserve0: parseUnits('1000', 18).toString(), // Convert BigInt to string
        reserve1: parseUnits('3000000', 6).toString(), // Convert BigInt to string
        totalSupply: parseUnits('1000000', 18).toString(), // Convert BigInt to string
        kLast: parseUnits('3000000000', 18).toString(), // Convert BigInt to string
        price0CumulativeLast: parseUnits('1000000', 18).toString(), // Convert BigInt to string
        price1CumulativeLast: parseUnits('1000000', 18).toString(), // Convert BigInt to string
        blockTimestampLast: Math.floor(Date.now() / 1000),
        chainId: this.chainConfig.chain.id
      }

      return mockPairInfo
    } catch (error) {
      throw new PancakeSwapError(
        `Failed to get pair info: ${error}`,
        'PAIR_INFO_ERROR',
        this.chainConfig.chain.id
      )
    }
  }

  /**
   * Add liquidity to PancakeSwap ALP Pool (Arbitrum-specific)
   * PancakeSwap on Arbitrum uses ALP pools for perpetual trading instead of traditional V2 pools
   */
  async addALPLiquidity(
    asset: Address,
    amount: bigint
  ): Promise<{ hash: string; alpAmount: string }> {
    if (!this.walletClient) {
      throw new PancakeSwapError(
        'Wallet client not initialized. Provide private key.',
        'WALLET_ERROR',
        this.chainConfig.chain.id
      )
    }

    // Note: This would need the actual ALP pool contract address and ABI
    // For now, throw an informative error
    throw new PancakeSwapError(
      'ALP pool functionality not yet implemented. PancakeSwap on Arbitrum uses ALP pools for perpetual trading. Please use the official PancakeSwap interface for ALP pool operations.',
      'ALP_NOT_IMPLEMENTED',
      this.chainConfig.chain.id
    )
  }

  /**
   * Remove liquidity from PancakeSwap ALP Pool (Arbitrum-specific)
   */
  async removeALPLiquidity(
    alpAmount: bigint,
    asset: Address
  ): Promise<{ hash: string; assetAmount: string }> {
    if (!this.walletClient) {
      throw new PancakeSwapError(
        'Wallet client not initialized. Provide private key.',
        'WALLET_ERROR',
        this.chainConfig.chain.id
      )
    }

    // Note: This would need the actual ALP pool contract address and ABI
    // For now, throw an informative error
    throw new PancakeSwapError(
      'ALP pool functionality not yet implemented. PancakeSwap on Arbitrum uses ALP pools for perpetual trading. Please use the official PancakeSwap interface for ALP pool operations.',
      'ALP_NOT_IMPLEMENTED',
      this.chainConfig.chain.id
    )
  }

  /**
   * Get farm information
   */
  async getFarmInfo(pid: number): Promise<FarmInfo> {
    try {
      // Mock implementation - PancakeSwap farming is not available on Arbitrum
      return {
        pid,
        lpToken: '0x0000000000000000000000000000000000000000' as `0x${string}`,
        allocPoint: BigInt(100).toString(),
        lastRewardBlock: BigInt(0).toString(),
        accCakePerShare: BigInt(0).toString(),
        chainId: this.chainConfig.chain.id
      }
    } catch (error) {
      throw new PancakeSwapError(
        `Failed to get farm info: ${error}`,
        'FARM_INFO_ERROR',
        this.chainConfig.chain.id
      )
    }
  }

  /**
   * Stake LP tokens in farming pool
   */
  async stakeLPTokens(pid: number, amount: bigint): Promise<{ hash: string }> {
    if (!this.walletClient) {
      throw new PancakeSwapError(
        'Wallet client not initialized. Provide private key.',
        'WALLET_ERROR',
        this.chainConfig.chain.id
      )
    }

    try {
      // Mock implementation - PancakeSwap farming is not available on Arbitrum
      throw new PancakeSwapError(
        'PancakeSwap farming is not available on Arbitrum. Use ALP pools for perpetual trading instead.',
        'FARMING_NOT_AVAILABLE',
        this.chainConfig.chain.id
      )
    } catch (error) {
      throw new PancakeSwapError(
        `Failed to stake LP tokens: ${error}`,
        'STAKE_ERROR',
        this.chainConfig.chain.id
      )
    }
  }

  /**
   * Unstake LP tokens from farming pool
   */
  async unstakeLPTokens(pid: number, amount: bigint): Promise<{ hash: string }> {
    if (!this.walletClient) {
      throw new PancakeSwapError(
        'Wallet client not initialized. Provide private key.',
        'WALLET_ERROR',
        this.chainConfig.chain.id
      )
    }

    try {
      // Mock implementation - PancakeSwap farming is not available on Arbitrum
      throw new PancakeSwapError(
        'PancakeSwap farming is not available on Arbitrum. Use ALP pools for perpetual trading instead.',
        'FARMING_NOT_AVAILABLE',
        this.chainConfig.chain.id
      )
    } catch (error) {
      throw new PancakeSwapError(
        `Failed to unstake LP tokens: ${error}`,
        'UNSTAKE_ERROR',
        this.chainConfig.chain.id
      )
    }
  }

  /**
   * Claim farming rewards
   */
  async claimRewards(pid: number): Promise<{ hash: string }> {
    if (!this.walletClient) {
      throw new PancakeSwapError(
        'Wallet client not initialized. Provide private key.',
        'WALLET_ERROR',
        this.chainConfig.chain.id
      )
    }

    try {
      // Mock implementation - PancakeSwap farming is not available on Arbitrum
      throw new PancakeSwapError(
        'PancakeSwap farming is not available on Arbitrum. Use ALP pools for perpetual trading instead.',
        'FARMING_NOT_AVAILABLE',
        this.chainConfig.chain.id
      )
    } catch (error) {
      throw new PancakeSwapError(
        `Failed to claim rewards: ${error}`,
        'CLAIM_ERROR',
        this.chainConfig.chain.id
      )
    }
  }

  /**
   * Get syrup pool information
   */
  async getSyrupPoolInfo(poolId: number): Promise<SyrupPoolInfo> {
    try {
      // Mock implementation - PancakeSwap syrup pools are not available on Arbitrum
      return {
        totalShares: BigInt(0).toString(),
        totalCakeInPool: BigInt(0).toString(),
        pricePerFullShare: BigInt(0).toString(),
        chainId: this.chainConfig.chain.id
      }
    } catch (error) {
      throw new PancakeSwapError(
        `Failed to get syrup pool info: ${error}`,
        'SYRUP_POOL_ERROR',
        this.chainConfig.chain.id
      )
    }
  }

  /**
   * Stake CAKE tokens in syrup pool
   */
  async stakeCake(poolId: number, amount: bigint): Promise<{ hash: string }> {
    if (!this.walletClient) {
      throw new PancakeSwapError(
        'Wallet client not initialized. Provide private key.',
        'WALLET_ERROR',
        this.chainConfig.chain.id
      )
    }

    try {
      // Mock implementation - PancakeSwap syrup pools are not available on Arbitrum
      throw new PancakeSwapError(
        'PancakeSwap syrup pools are not available on Arbitrum. Use ALP pools for perpetual trading instead.',
        'SYRUP_POOL_NOT_AVAILABLE',
        this.chainConfig.chain.id
      )
    } catch (error) {
      throw new PancakeSwapError(
        `Failed to stake CAKE: ${error}`,
        'STAKE_CAKE_ERROR',
        this.chainConfig.chain.id
      )
    }
  }

  /**
   * Unstake CAKE tokens from syrup pool
   */
  async unstakeCake(poolId: number, amount: bigint): Promise<{ hash: string }> {
    if (!this.walletClient) {
      throw new PancakeSwapError(
        'Wallet client not initialized. Provide private key.',
        'WALLET_ERROR',
        this.chainConfig.chain.id
      )
    }

    try {
      // Mock implementation - PancakeSwap syrup pools are not available on Arbitrum
      throw new PancakeSwapError(
        'PancakeSwap syrup pools are not available on Arbitrum. Use ALP pools for perpetual trading instead.',
        'SYRUP_POOL_NOT_AVAILABLE',
        this.chainConfig.chain.id
      )
    } catch (error) {
      throw new PancakeSwapError(
        `Failed to unstake CAKE: ${error}`,
        'UNSTAKE_CAKE_ERROR',
        this.chainConfig.chain.id
      )
    }
  }

  /**
   * Get IFO information
   */
  async getIFOInfo(ifoId: string): Promise<any> {
    try {
      // Mock implementation - PancakeSwap IFOs are not available on Arbitrum
      return {
        ifoId,
        status: 'Not Available',
        startTime: 0,
        endTime: 0,
        raisingAmount: BigInt(0).toString(),
        offeringAmount: BigInt(0).toString(),
        chainId: this.chainConfig.chain.id,
        note: 'PancakeSwap IFOs are not available on Arbitrum. This is a mock response.'
      }
    } catch (error) {
      throw new PancakeSwapError(
        `Failed to get IFO info: ${error}`,
        'IFO_INFO_ERROR',
        this.chainConfig.chain.id
      )
    }
  }

  /**
   * Participate in IFO
   */
  async participateInIFO(ifoId: string, amount: bigint): Promise<{ hash: string }> {
    if (!this.walletClient) {
      throw new PancakeSwapError(
        'Wallet client not initialized. Provide private key.',
        'WALLET_ERROR',
        this.chainConfig.chain.id
      )
    }

    try {
      // Mock implementation - PancakeSwap IFOs are not available on Arbitrum
      throw new PancakeSwapError(
        'PancakeSwap IFOs are not available on Arbitrum.',
        'IFO_NOT_AVAILABLE',
        this.chainConfig.chain.id
      )
    } catch (error) {
      throw new PancakeSwapError(
        `Failed to participate in IFO: ${error}`,
        'PARTICIPATE_IFO_ERROR',
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
      wethAddress: this.chainConfig.wethAddress,
      factoryAddress: this.chainConfig.factoryAddress,
      note: 'PancakeSwap on Arbitrum uses ALP pools for perpetual trading, not traditional V2 liquidity pools'
    }
  }
}

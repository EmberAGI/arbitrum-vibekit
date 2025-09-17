/**
 * PancakeSwap MCP Server Types
 * Clean, type-safe interfaces for PancakeSwap operations
 */

import type { Address, Chain } from 'viem'

// Supported chains
export type SupportedChain = 'bsc' | 'ethereum' | 'arbitrum' | 'polygon'

// Chain configuration
export interface ChainConfig {
  chain: Chain
  routerAddress: Address
  factoryAddress: Address
  wethAddress: Address
  rpcUrl: string
}

// Token information
export interface TokenInfo {
  address: Address
  symbol: string
  name: string
  decimals: number
  chainId: number
}

// Swap parameters
export interface SwapParams {
  tokenIn: Address
  tokenOut: Address
  amountIn: bigint
  amountOutMin: bigint
  to: Address
  deadline: bigint
  chainId: number
}

// Liquidity parameters
export interface AddLiquidityParams {
  tokenA: Address
  tokenB: Address
  amountADesired: bigint
  amountBDesired: bigint
  amountAMin: bigint
  amountBMin: bigint
  to: Address
  deadline: bigint
  chainId: number
}

// Pool information
export interface PoolInfo {
  address: Address
  token0: TokenInfo
  token1: TokenInfo
  reserve0: bigint
  reserve1: bigint
  totalSupply: bigint
  kLast: bigint
  fee: number
  chainId: number
}

// Price quote
export interface PriceQuote {
  tokenIn: Address
  tokenOut: Address
  amountIn: bigint
  amountOut: bigint
  priceImpact: number
  route: Address[]
  chainId: number
}

// Farm information
export interface FarmInfo {
  pid: number
  lpToken: Address
  allocPoint: bigint
  lastRewardBlock: bigint
  accCakePerShare: bigint
  chainId: number
}

// Error types
export class PancakeSwapError extends Error {
  constructor(
    message: string,
    public code: string,
    public chainId?: number
  ) {
    super(message)
    this.name = 'PancakeSwapError'
  }
}

// MCP tool response types
export interface McpResponse<T = any> {
  content: Array<{
    type: 'text'
    text: string
  }>
  metadata?: T
}

/**
 * PancakeSwap MCP Server Types
 * Clean, type-safe interfaces for PancakeSwap operations
 */

import type { Address, Chain } from 'viem'

// Supported chains
export type SupportedChain = 'arbitrum'

// Chain configuration
export interface ChainConfig {
  chain: Chain
  routerAddress: Address
  factoryAddress: Address
  wethAddress: Address
  masterChefAddress: Address
  syrupPoolAddress: Address
  predictionAddress: Address
  lotteryAddress: Address
  nftMarketplaceAddress: Address
  factoryV3Address: Address
  autoRouterAddress: Address
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

// PancakeSwap V2 Pair information
export interface PairInfo {
  address: Address
  token0: TokenInfo
  token1: TokenInfo
  reserve0: bigint
  reserve1: bigint
  totalSupply: bigint
  kLast: bigint
  price0CumulativeLast: bigint
  price1CumulativeLast: bigint
  blockTimestampLast: number
  chainId: number
}

// Liquidity position information
export interface LiquidityPosition {
  pairAddress: Address
  userAddress: Address
  liquidity: bigint
  token0Balance: bigint
  token1Balance: bigint
  shareOfPool: number
  chainId: number
}

// Price quote
export interface PriceQuote {
  tokenIn: Address
  tokenOut: Address
  amountIn: string // Changed to string for JSON serialization
  amountOut: string // Changed to string for JSON serialization
  amountOutMin: string // Changed to string for JSON serialization
  priceImpact: number
  path: Address[]
  route: Address[]
  chainId: number
}

// Farm information
export interface FarmInfo {
  pid: number
  lpToken: Address
  allocPoint: string
  lastRewardBlock: string
  accCakePerShare: string
  chainId: number
}

// User farming position
export interface FarmPosition {
  pid: number
  userAddress: Address
  amount: bigint
  rewardDebt: bigint
  pendingCake: bigint
  chainId: number
}

// Syrup pool information
export interface SyrupPoolInfo {
  totalShares: string
  totalCakeInPool: string
  pricePerFullShare: string
  chainId: number
}

// User syrup pool position
export interface SyrupPosition {
  userAddress: Address
  shares: bigint
  lastDepositedTime: bigint
  cakeAtLastUserAction: bigint
  lastUserActionTime: bigint
  pendingReward: bigint
  pricePerFullShare: bigint
  chainId: number
}

// Prediction market round information
export interface PredictionRound {
  epoch: bigint
  startTimestamp: bigint
  lockTimestamp: bigint
  closeTimestamp: bigint
  lockPrice: bigint
  closePrice: bigint
  lockOracleId: bigint
  closeOracleId: bigint
  totalAmount: bigint
  bullAmount: bigint
  bearAmount: bigint
  rewardBaseCalAmount: bigint
  rewardAmount: bigint
  oracleCalled: boolean
  chainId: number
}

// User prediction position
export interface PredictionPosition {
  epoch: bigint
  userAddress: Address
  position: bigint // 0 = Bull, 1 = Bear
  amount: bigint
  claimed: boolean
  chainId: number
}

// Lottery information
export interface LotteryInfo {
  lotteryId: bigint
  status: bigint
  startTime: bigint
  endTime: bigint
  priceTicketInCake: bigint
  discountDivisor: bigint
  rewardsBreakdown: readonly [bigint, bigint, bigint, bigint, bigint, bigint]
  treasuryFee: bigint
  cakePerBracket: readonly [bigint, bigint, bigint, bigint, bigint, bigint]
  countWinnersPerBracket: readonly [bigint, bigint, bigint, bigint, bigint, bigint]
  firstTicketId: bigint
  firstTicketIdNextLottery: bigint
  amountCollectedInCake: bigint
  finalNumber: bigint
  chainId: number
}

// User lottery information
export interface UserLotteryInfo {
  lotteryId: bigint
  userAddress: Address
  userTicketCount: bigint
  totalUserCost: bigint
  userStatus: readonly boolean[]
  ticketNumbers: readonly bigint[]
  ticketStatuses: readonly boolean[]
  chainId: number
}

// NFT marketplace ask information
export interface NFTAsk {
  tokenId: bigint
  seller: Address
  price: bigint
  collection: Address
  chainId: number
}

// NFT collection information
export interface NFTCollection {
  address: Address
  creator: Address
  whitelistChecker: Address
  tradingFee: bigint
  creatorFee: bigint
  creatorFeeRecipient: Address
  totalAsks: number
  chainId: number
}

// Advanced trading types
export interface SwapRoute {
  path: Address[]
  amounts: bigint[]
  gasEstimate: bigint
  priceImpact: number
  chainId: number
}

export interface PoolV3Info {
  address: Address
  token0: TokenInfo
  token1: TokenInfo
  fee: number
  sqrtPriceX96: bigint
  tick: number
  liquidity: bigint
  feeGrowthGlobal0X128: bigint
  feeGrowthGlobal1X128: bigint
  chainId: number
}

export interface PositionV3Info {
  owner: Address
  token0: TokenInfo
  token1: TokenInfo
  fee: number
  tickLower: number
  tickUpper: number
  liquidity: bigint
  tokensOwed0: bigint
  tokensOwed1: bigint
  feeGrowthInside0LastX128: bigint
  feeGrowthInside1LastX128: bigint
  chainId: number
}

export interface TradingVolume {
  tokenAddress: Address
  volume24h: bigint
  trades24h: number
  priceChange24h: number
  high24h: bigint
  low24h: bigint
  chainId: number
}

export interface PortfolioSummary {
  userAddress: Address
  totalValueUSD: number
  positions: {
    liquidity: number
    farming: number
    prediction: number
    lottery: number
    nft: number
  }
  tokens: Record<string, bigint>
  rewards: {
    pendingCake: bigint
    pendingSyrup: bigint
    claimedRewards: bigint
  }
  chainId: number
}

export interface ArbitrageOpportunity {
  tokenIn: Address
  tokenOut: Address
  amountIn: bigint
  expectedProfit: bigint
  profitPercentage: number
  route: SwapRoute
  gasCost: bigint
  netProfit: bigint
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

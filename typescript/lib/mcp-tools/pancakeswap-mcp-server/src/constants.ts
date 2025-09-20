/**
 * PancakeSwap MCP Server Constants
 * Chain configurations and contract addresses
 */

import { arbitrum } from 'viem/chains'
import type { ChainConfig, SupportedChain } from './types.js'

// PancakeSwap Router V2 ABI (simplified for core functions)
export const PANCAKESWAP_ROUTER_ABI = [
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' }
    ],
    name: 'swapExactTokensForTokens',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' }
    ],
    name: 'swapTokensForExactTokens',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'path', type: 'address[]' }
    ],
    name: 'getAmountsOut',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'path', type: 'address[]' }
    ],
    name: 'getAmountsIn',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'amountADesired', type: 'uint256' },
      { name: 'amountBDesired', type: 'uint256' },
      { name: 'amountAMin', type: 'uint256' },
      { name: 'amountBMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' }
    ],
    name: 'addLiquidity',
    outputs: [
      { name: 'amountA', type: 'uint256' },
      { name: 'amountB', type: 'uint256' },
      { name: 'liquidity', type: 'uint256' }
    ],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'liquidity', type: 'uint256' },
      { name: 'amountAMin', type: 'uint256' },
      { name: 'amountBMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' }
    ],
    name: 'removeLiquidity',
    outputs: [
      { name: 'amountA', type: 'uint256' },
      { name: 'amountB', type: 'uint256' }
    ],
    stateMutability: 'nonpayable',
    type: 'function'
  }
] as const

// ERC20 ABI for token interactions
export const ERC20_ABI = [
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  }
] as const

// PancakeSwap V2 Factory ABI
export const PANCAKESWAP_V2_FACTORY_ABI = [
  {
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' }
    ],
    name: 'getPair',
    outputs: [{ name: 'pair', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'allPairsLength',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: '', type: 'uint256' }],
    name: 'allPairs',
    outputs: [{ name: 'pair', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

// PancakeSwap V2 Pair ABI
export const PANCAKESWAP_V2_PAIR_ABI = [
  {
    inputs: [],
    name: 'getReserves',
    outputs: [
      { name: 'reserve0', type: 'uint112' },
      { name: 'reserve1', type: 'uint112' },
      { name: 'blockTimestampLast', type: 'uint32' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'token0',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'token1',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'kLast',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'price0CumulativeLast',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'price1CumulativeLast',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

// PancakeSwap MasterChef ABI (for yield farming)
export const PANCAKESWAP_MASTERCHEF_ABI = [
  {
    inputs: [],
    name: 'poolLength',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: '', type: 'uint256' }],
    name: 'poolInfo',
    outputs: [
      { name: 'lpToken', type: 'address' },
      { name: 'allocPoint', type: 'uint256' },
      { name: 'lastRewardBlock', type: 'uint256' },
      { name: 'accCakePerShare', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: '_pid', type: 'uint256' }, { name: '_user', type: 'address' }],
    name: 'userInfo',
    outputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'rewardDebt', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: '_pid', type: 'uint256' }, { name: '_user', type: 'address' }],
    name: 'pendingCake',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'cakePerBlock',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'totalAllocPoint',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

// PancakeSwap Syrup Pool ABI (for auto-compounding)
export const PANCAKESWAP_SYRUP_ABI = [
  {
    inputs: [],
    name: 'totalShares',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: '', type: 'address' }],
    name: 'userInfo',
    outputs: [
      { name: 'shares', type: 'uint256' },
      { name: 'lastDepositedTime', type: 'uint256' },
      { name: 'cakeAtLastUserAction', type: 'uint256' },
      { name: 'lastUserActionTime', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'totalCakeInPool',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: '_user', type: 'address' }],
    name: 'getPricePerFullShare',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: '_user', type: 'address' }],
    name: 'pendingReward',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

// PancakeSwap Prediction Market ABI
export const PANCAKESWAP_PREDICTION_ABI = [
  {
    inputs: [],
    name: 'currentEpoch',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'epoch', type: 'uint256' }],
    name: 'rounds',
    outputs: [
      { name: 'epoch', type: 'uint256' },
      { name: 'startTimestamp', type: 'uint256' },
      { name: 'lockTimestamp', type: 'uint256' },
      { name: 'closeTimestamp', type: 'uint256' },
      { name: 'lockPrice', type: 'int256' },
      { name: 'closePrice', type: 'int256' },
      { name: 'lockOracleId', type: 'uint256' },
      { name: 'closeOracleId', type: 'uint256' },
      { name: 'totalAmount', type: 'uint256' },
      { name: 'bullAmount', type: 'uint256' },
      { name: 'bearAmount', type: 'uint256' },
      { name: 'rewardBaseCalAmount', type: 'uint256' },
      { name: 'rewardAmount', type: 'uint256' },
      { name: 'oracleCalled', type: 'bool' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'genesisStartOnce',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'genesisLockOnce',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'paused',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'epoch', type: 'uint256' }, { name: 'user', type: 'address' }],
    name: 'ledger',
    outputs: [
      { name: 'position', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      { name: 'claimed', type: 'bool' }
    ],
    stateMutability: 'view',
    type: 'function'
  }
] as const

// PancakeSwap Lottery ABI
export const PANCAKESWAP_LOTTERY_ABI = [
  {
    inputs: [],
    name: 'viewCurrentLotteryId',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: '_lotteryId', type: 'uint256' }],
    name: 'viewLottery',
    outputs: [
      { name: 'status', type: 'uint256' },
      { name: 'startTime', type: 'uint256' },
      { name: 'endTime', type: 'uint256' },
      { name: 'priceTicketInCake', type: 'uint256' },
      { name: 'discountDivisor', type: 'uint256' },
      { name: 'rewardsBreakdown', type: 'uint256[6]' },
      { name: 'treasuryFee', type: 'uint256' },
      { name: 'cakePerBracket', type: 'uint256[6]' },
      { name: 'countWinnersPerBracket', type: 'uint256[6]' },
      { name: 'firstTicketId', type: 'uint256' },
      { name: 'firstTicketIdNextLottery', type: 'uint256' },
      { name: 'amountCollectedInCake', type: 'uint256' },
      { name: 'finalNumber', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: '_lotteryId', type: 'uint256' }],
    name: 'viewNumbersAndStatusesForTicketIds',
    outputs: [
      { name: 'ticketNumbers', type: 'uint256[]' },
      { name: 'ticketStatuses', type: 'bool[]' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: '_lotteryId', type: 'uint256' }, { name: '_user', type: 'address' }],
    name: 'viewUserInfoForLotteryId',
    outputs: [
      { name: 'userTicketCount', type: 'uint256' },
      { name: 'totalUserCost', type: 'uint256' },
      { name: 'userStatus', type: 'bool[]' }
    ],
    stateMutability: 'view',
    type: 'function'
  }
] as const

// PancakeSwap NFT Marketplace ABI (simplified)
export const PANCAKESWAP_NFT_MARKETPLACE_ABI = [
  {
    inputs: [{ name: '_collection', type: 'address' }, { name: '_tokenId', type: 'uint256' }],
    name: 'viewAsksByCollectionAndTokenIds',
    outputs: [
      { name: 'askInfo', type: 'uint256[3]' } // [seller, price, tokenId]
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: '_collection', type: 'address' }],
    name: 'viewAsksByCollection',
    outputs: [
      { name: 'tokenIds', type: 'uint256[]' },
      { name: 'sellers', type: 'address[]' },
      { name: 'prices', type: 'uint256[]' },
      { name: 'tokenIdsAndPrices', type: 'uint256[][]' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'viewCollections',
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: '_collection', type: 'address' }],
    name: 'viewCollectionInfo',
    outputs: [
      { name: 'creator', type: 'address' },
      { name: 'whitelistChecker', type: 'address' },
      { name: 'tradingFee', type: 'uint256' },
      { name: 'creatorFee', type: 'uint256' },
      { name: 'creatorFeeRecipient', type: 'address' }
    ],
    stateMutability: 'view',
    type: 'function'
  }
] as const

// PancakeSwap Auto Router ABI (for advanced routing)
export const PANCAKESWAP_AUTO_ROUTER_ABI = [
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' }
    ],
    name: 'swapExactTokensForTokens',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'amountInMax', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' }
    ],
    name: 'swapTokensForExactTokens',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' }
    ],
    name: 'swapExactETHForTokens',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' }
    ],
    name: 'swapExactETHForTokensSupportingFeeOnTransferTokens',
    outputs: [],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' }
    ],
    name: 'swapExactTokensForETH',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' }
    ],
    name: 'swapExactTokensForETHSupportingFeeOnTransferTokens',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' }
    ],
    name: 'swapExactETHForTokens',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'path', type: 'address[]' }
    ],
    name: 'getAmountsOut',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'path', type: 'address[]' }
    ],
    name: 'getAmountsIn',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

// PancakeSwap Factory V3 ABI (for advanced features)
export const PANCAKESWAP_FACTORY_V3_ABI = [
  {
    inputs: [],
    name: 'feeAmountTickSpacing',
    outputs: [{ name: 'feeAmountTickSpacing', type: 'int24' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'fee', type: 'uint24' }
    ],
    name: 'getPool',
    outputs: [{ name: 'pool', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

// PancakeSwap Pool V3 ABI (for advanced analytics)
export const PANCAKESWAP_POOL_V3_ABI = [
  {
    inputs: [],
    name: 'slot0',
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'observationIndex', type: 'uint16' },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'feeProtocol', type: 'uint8' },
      { name: 'unlocked', type: 'bool' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'liquidity',
    outputs: [{ name: '', type: 'uint128' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'feeGrowthGlobal0X128',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'feeGrowthGlobal1X128',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'tick', type: 'int24' }],
    name: 'ticks',
    outputs: [
      { name: 'liquidityGross', type: 'uint128' },
      { name: 'liquidityNet', type: 'int128' },
      { name: 'feeGrowthOutside0X128', type: 'uint256' },
      { name: 'feeGrowthOutside1X128', type: 'uint256' },
      { name: 'tickCumulativeOutside', type: 'int56' },
      { name: 'secondsPerLiquidityOutsideX128', type: 'uint160' },
      { name: 'secondsOutside', type: 'uint32' },
      { name: 'initialized', type: 'bool' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'positions',
    outputs: [
      { name: 'liquidity', type: 'uint128' },
      { name: 'feeGrowthInside0LastX128', type: 'uint256' },
      { name: 'feeGrowthInside1LastX128', type: 'uint256' },
      { name: 'tokensOwed0', type: 'uint128' },
      { name: 'tokensOwed1', type: 'uint128' }
    ],
    stateMutability: 'view',
    type: 'function'
  }
] as const

// Chain configurations
export const CHAIN_CONFIGS: Record<SupportedChain, ChainConfig> = {
  arbitrum: {
    chain: arbitrum,
    routerAddress: '0xE592427A0AEce92De3Edee1F18E0157C05861564', // Uniswap V3 SwapRouter
    factoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984', // Uniswap V3 Factory
    wethAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH on Arbitrum
    masterChefAddress: '0x0000000000000000000000000000000000000000', // Not available on ARB
    syrupPoolAddress: '0x0000000000000000000000000000000000000000', // Not available on ARB
    predictionAddress: '0x0000000000000000000000000000000000000000', // Not available on ARB
    lotteryAddress: '0x0000000000000000000000000000000000000000', // Not available on ARB
    nftMarketplaceAddress: '0x0000000000000000000000000000000000000000', // Not available on ARB
    factoryV3Address: '0x1F98431c8aD98523631AE4a59f267346ea31F984', // Uniswap V3 Factory
    autoRouterAddress: '0xE592427A0AEce92De3Edee1F18E0157C05861564', // Uniswap V3 SwapRouter
    rpcUrl: 'https://arb1.arbitrum.io/rpc'
  }
}

// Common token addresses by chain
export const COMMON_TOKENS = {
  ARBITRUM: {
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    ARB: '0x912CE59144191C1204E64559FE8253a0e49E6548',
    GMX: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a',
    MAGIC: '0x539bdE0d7Dbd336b79148AA742883198BBF60342'
  }
} as const

// Default slippage tolerance (0.5%)
export const DEFAULT_SLIPPAGE = 50 // 0.5% in basis points

// Default deadline (20 minutes)
export const DEFAULT_DEADLINE = 20 * 60 // 20 minutes in seconds

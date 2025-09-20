/**
 * PancakeSwap MCP Server
 * Clean, comprehensive MCP tools for PancakeSwap operations
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { PancakeSwapClient } from './client.js'
import type { SupportedChain, McpResponse } from './types.js'

export async function createServer() {
  const server = new Server(
    {
      name: 'pancakeswap-mcp-server',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  )

  // Initialize PancakeSwap client
  const chain = 'arbitrum' as SupportedChain
  const rpcUrl = process.env.RPC_URL
  const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined
  
  // Only use private key if it's a valid hex string
  const validPrivateKey = privateKey && privateKey.startsWith('0x') && privateKey.length === 66 ? privateKey : undefined
  const client = new PancakeSwapClient(chain, rpcUrl, validPrivateKey)

  // Available tools definition
  const tools = [
    {
      name: 'get_token_info',
      description: 'Get detailed information about a token including symbol, name, decimals, and chain ID',
      inputSchema: {
        type: 'object',
        properties: {
          tokenAddress: { type: 'string', description: 'Token contract address' },
          chain: { type: 'string', description: 'Chain (arbitrum only)' }
        }
      }
    },
    {
      name: 'get_price_quote',
      description: 'Get a price quote for swapping tokens on PancakeSwap, including amount out and price impact',
      inputSchema: {
        type: 'object',
        properties: {
          tokenIn: { type: 'string', description: 'Input token contract address' },
          tokenOut: { type: 'string', description: 'Output token contract address' },
          amountIn: { type: 'string', description: 'Amount of input token to swap' },
          decimals: { type: 'number', description: 'Decimals of input token (default: 18)' },
          chain: { type: 'string', description: 'Chain (arbitrum only)' }
        }
      }
    },
    {
      name: 'get_token_price',
      description: 'Get the current price of a token in USD (or reference token)',
      inputSchema: {
        type: 'object',
        properties: {
          tokenAddress: { type: 'string', description: 'Token contract address' },
          amount: { type: 'string', description: 'Amount to price (default: 1)' },
          chain: { type: 'string', description: 'Chain (arbitrum only)' }
        }
      }
    },
    {
      name: 'check_token_allowance',
      description: 'Check the allowance of a token for a specific spender address',
      inputSchema: {
        type: 'object',
        properties: {
          tokenAddress: { type: 'string', description: 'Token contract address' },
          owner: { type: 'string', description: 'Token owner address' },
          spender: { type: 'string', description: 'Spender address (usually router)' },
          chain: { type: 'string', description: 'Chain (arbitrum only)' }
        }
      }
    },
    {
      name: 'get_chain_info',
      description: 'Get information about the configured chain including router and WETH addresses',
      inputSchema: {
        type: 'object',
        properties: {
          chain: { type: 'string', description: 'Chain (arbitrum only)' }
        }
      }
    },
    {
      name: 'get_common_tokens',
      description: 'Get a list of common token addresses for the specified chain',
      inputSchema: {
        type: 'object',
        properties: {
          chain: { type: 'string', description: 'Chain (arbitrum only)' }
        }
      }
    },
    {
      name: 'get_pair_address',
      description: 'Get the PancakeSwap V2 pair address for two tokens',
      inputSchema: {
        type: 'object',
        properties: {
          tokenA: { type: 'string', description: 'First token contract address' },
          tokenB: { type: 'string', description: 'Second token contract address' },
          chain: { type: 'string', description: 'Chain (arbitrum only)' }
        }
      }
    },
    {
      name: 'get_pair_info',
      description: 'Get detailed information about a PancakeSwap V2 pair including reserves and tokens',
      inputSchema: {
        type: 'object',
        properties: {
          pairAddress: { type: 'string', description: 'Pair contract address' },
          chain: { type: 'string', description: 'Chain (arbitrum only)' }
        }
      }
    },
    // Token Swapping & Trading Tools
    {
      name: 'execute_swap',
      description: 'Execute a token swap on PancakeSwap',
      inputSchema: {
        type: 'object',
        properties: {
          tokenIn: { type: 'string', description: 'Input token contract address' },
          tokenOut: { type: 'string', description: 'Output token contract address' },
          amountIn: { type: 'string', description: 'Amount of input token to swap' },
          amountOutMin: { type: 'string', description: 'Minimum amount of output token expected' },
          to: { type: 'string', description: 'Recipient address' },
          deadline: { type: 'number', description: 'Transaction deadline timestamp' },
          privateKey: { type: 'string', description: 'Private key for wallet operations' },
          chain: { type: 'string', description: 'Chain (arbitrum only)' }
        },
        required: ['tokenIn', 'tokenOut', 'amountIn', 'to', 'privateKey']
      }
    },
    {
      name: 'add_liquidity',
      description: 'Add liquidity to a PancakeSwap V2 pair',
      inputSchema: {
        type: 'object',
        properties: {
          tokenA: { type: 'string', description: 'First token contract address' },
          tokenB: { type: 'string', description: 'Second token contract address' },
          amountADesired: { type: 'string', description: 'Desired amount of token A' },
          amountBDesired: { type: 'string', description: 'Desired amount of token B' },
          amountAMin: { type: 'string', description: 'Minimum amount of token A' },
          amountBMin: { type: 'string', description: 'Minimum amount of token B' },
          to: { type: 'string', description: 'Recipient address' },
          deadline: { type: 'number', description: 'Transaction deadline timestamp' },
          privateKey: { type: 'string', description: 'Private key for wallet operations' },
          chain: { type: 'string', description: 'Chain (arbitrum only)' }
        },
        required: ['tokenA', 'tokenB', 'amountADesired', 'amountBDesired', 'to', 'privateKey']
      }
    },
    {
      name: 'remove_liquidity',
      description: 'Remove liquidity from a PancakeSwap V2 pair',
      inputSchema: {
        type: 'object',
        properties: {
          tokenA: { type: 'string', description: 'First token contract address' },
          tokenB: { type: 'string', description: 'Second token contract address' },
          liquidity: { type: 'string', description: 'Amount of LP tokens to remove' },
          amountAMin: { type: 'string', description: 'Minimum amount of token A' },
          amountBMin: { type: 'string', description: 'Minimum amount of token B' },
          to: { type: 'string', description: 'Recipient address' },
          deadline: { type: 'number', description: 'Transaction deadline timestamp' },
          privateKey: { type: 'string', description: 'Private key for wallet operations' },
          chain: { type: 'string', description: 'Chain (arbitrum only)' }
        },
        required: ['tokenA', 'tokenB', 'liquidity', 'to', 'privateKey']
      }
    },
    // Yield Farming Tools
    {
      name: 'get_farm_info',
      description: 'Get information about a yield farming pool',
      inputSchema: {
        type: 'object',
        properties: {
          pid: { type: 'number', description: 'Pool ID' },
          chain: { type: 'string', description: 'Chain (arbitrum only)' }
        },
        required: ['pid']
      }
    },
    {
      name: 'stake_lp_tokens',
      description: 'Stake LP tokens in a yield farming pool',
      inputSchema: {
        type: 'object',
        properties: {
          pid: { type: 'number', description: 'Pool ID' },
          amount: { type: 'string', description: 'Amount of LP tokens to stake' },
          privateKey: { type: 'string', description: 'Private key for wallet operations' },
          chain: { type: 'string', description: 'Chain (arbitrum only)' }
        },
        required: ['pid', 'amount', 'privateKey']
      }
    },
    {
      name: 'unstake_lp_tokens',
      description: 'Unstake LP tokens from a yield farming pool',
      inputSchema: {
        type: 'object',
        properties: {
          pid: { type: 'number', description: 'Pool ID' },
          amount: { type: 'string', description: 'Amount of LP tokens to unstake' },
          privateKey: { type: 'string', description: 'Private key for wallet operations' },
          chain: { type: 'string', description: 'Chain (arbitrum only)' }
        },
        required: ['pid', 'amount', 'privateKey']
      }
    },
    {
      name: 'claim_rewards',
      description: 'Claim farming rewards from a yield farming pool',
      inputSchema: {
        type: 'object',
        properties: {
          pid: { type: 'number', description: 'Pool ID' },
          privateKey: { type: 'string', description: 'Private key for wallet operations' },
          chain: { type: 'string', description: 'Chain (arbitrum only)' }
        },
        required: ['pid', 'privateKey']
      }
    },
    // Syrup Pools (Staking) Tools
    {
      name: 'get_syrup_pool_info',
      description: 'Get information about a Syrup Pool (CAKE staking pool)',
      inputSchema: {
        type: 'object',
        properties: {
          poolId: { type: 'number', description: 'Pool ID' },
          chain: { type: 'string', description: 'Chain (arbitrum only)' }
        },
        required: ['poolId']
      }
    },
    {
      name: 'stake_cake',
      description: 'Stake CAKE tokens in a Syrup Pool',
      inputSchema: {
        type: 'object',
        properties: {
          poolId: { type: 'number', description: 'Pool ID' },
          amount: { type: 'string', description: 'Amount of CAKE to stake' },
          privateKey: { type: 'string', description: 'Private key for wallet operations' },
          chain: { type: 'string', description: 'Chain (arbitrum only)' }
        },
        required: ['poolId', 'amount', 'privateKey']
      }
    },
    {
      name: 'unstake_cake',
      description: 'Unstake CAKE tokens from a Syrup Pool',
      inputSchema: {
        type: 'object',
        properties: {
          poolId: { type: 'number', description: 'Pool ID' },
          amount: { type: 'string', description: 'Amount of CAKE to unstake' },
          privateKey: { type: 'string', description: 'Private key for wallet operations' },
          chain: { type: 'string', description: 'Chain (arbitrum only)' }
        },
        required: ['poolId', 'amount', 'privateKey']
      }
    },
    // Initial Farm Offerings (IFOs) Tools
    {
      name: 'get_ifo_info',
      description: 'Get information about an Initial Farm Offering (IFO)',
      inputSchema: {
        type: 'object',
        properties: {
          ifoId: { type: 'string', description: 'IFO ID' },
          chain: { type: 'string', description: 'Chain (arbitrum only)' }
        },
        required: ['ifoId']
      }
    },
    {
      name: 'participate_in_ifo',
      description: 'Participate in an Initial Farm Offering (IFO)',
      inputSchema: {
        type: 'object',
        properties: {
          ifoId: { type: 'string', description: 'IFO ID' },
          amount: { type: 'string', description: 'Amount to invest' },
          privateKey: { type: 'string', description: 'Private key for wallet operations' },
          chain: { type: 'string', description: 'Chain (arbitrum only)' }
        },
        required: ['ifoId', 'amount', 'privateKey']
      }
    },
    {
      name: 'add_alp_liquidity',
      description: 'Add liquidity to PancakeSwap ALP Pool (Arbitrum-specific for perpetual trading)',
      inputSchema: {
        type: 'object',
        properties: {
          asset: { type: 'string', description: 'Asset address (USDC, USDT, DAI, ETH, BTC)' },
          amount: { type: 'string', description: 'Amount of asset to deposit' },
          privateKey: { type: 'string', description: 'Private key for wallet operations' },
          chain: { type: 'string', description: 'Chain (arbitrum only)' }
        },
        required: ['asset', 'amount', 'privateKey']
      }
    },
    {
      name: 'remove_alp_liquidity',
      description: 'Remove liquidity from PancakeSwap ALP Pool (Arbitrum-specific for perpetual trading)',
      inputSchema: {
        type: 'object',
        properties: {
          alpAmount: { type: 'string', description: 'Amount of ALP tokens to burn' },
          asset: { type: 'string', description: 'Asset address to receive' },
          privateKey: { type: 'string', description: 'Private key for wallet operations' },
          chain: { type: 'string', description: 'Chain (arbitrum only)' }
        },
        required: ['alpAmount', 'asset', 'privateKey']
      }
    }
  ]

  // Handler for listing available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
      tools: tools
    }
  })

  // Handler for calling tools
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params

    try {
      switch (name) {
        case 'get_token_info': {
          const tokenAddress = args.tokenAddress
          const chainParam = args.chain

          if (!tokenAddress) {
            throw new McpError(ErrorCode.InvalidParams, 'tokenAddress is required')
          }

        const clientToUse = chainParam ? new PancakeSwapClient(chainParam as SupportedChain, rpcUrl, privateKey) : client
          const tokenInfo = await clientToUse.getTokenInfo(tokenAddress as `0x${string}`)

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                  data: tokenInfo
              }, null, 2)
            }
          ]
        }
        }

        case 'get_price_quote': {
          const { tokenIn, tokenOut, amountIn, decimals = 18, chain: chainParam } = args

          if (!tokenIn || !tokenOut || !amountIn) {
            throw new McpError(ErrorCode.InvalidParams, 'tokenIn, tokenOut, and amountIn are required')
          }

        const clientToUse = chainParam ? new PancakeSwapClient(chainParam as SupportedChain, rpcUrl, privateKey) : client
          const quote = await clientToUse.getPriceQuote(tokenIn as `0x${string}`, tokenOut as `0x${string}`, String(amountIn), Number(decimals))

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                  data: {
                    amountIn: String(quote.amountIn),
                    amountOut: String(quote.amountOut),
                    amountOutMin: String(quote.amountOutMin),
                    path: quote.path,
                    priceImpact: quote.priceImpact ? String(quote.priceImpact) : null
                  }
              }, null, 2)
            }
          ]
        }
        }

        case 'get_token_price': {
          const { tokenAddress, amount = '1', chain: chainParam } = args

          if (!tokenAddress) {
            throw new McpError(ErrorCode.InvalidParams, 'tokenAddress is required')
          }

        const clientToUse = chainParam ? new PancakeSwapClient(chainParam as SupportedChain, rpcUrl, privateKey) : client
          const price = await clientToUse.getTokenPrice(tokenAddress as `0x${string}`, amount as string)

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                data: {
                    tokenAddress,
                    amount,
                    price,
                  chainId: clientToUse.getChainInfo().chainId
                }
              }, null, 2)
            }
          ]
        }
        }

        case 'check_token_allowance': {
          const { tokenAddress, owner, spender, chain: chainParam } = args

          if (!tokenAddress || !owner || !spender) {
            throw new McpError(ErrorCode.InvalidParams, 'tokenAddress, owner, and spender are required')
          }

        const clientToUse = chainParam ? new PancakeSwapClient(chainParam as SupportedChain, rpcUrl, privateKey) : client
          const allowance = await clientToUse.getAllowance(tokenAddress as `0x${string}`, owner as `0x${string}`, spender as `0x${string}`)

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                data: {
                    tokenAddress,
                    owner,
                    spender,
                    allowance: allowance.toString(),
                  chainId: clientToUse.getChainInfo().chainId
                }
              }, null, 2)
            }
          ]
        }
        }

        case 'get_chain_info': {
          const chainParam = args.chain
        const clientToUse = chainParam ? new PancakeSwapClient(chainParam as SupportedChain, rpcUrl, privateKey) : client
          const chainInfo = clientToUse.getChainInfo()

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                  data: chainInfo
              }, null, 2)
            }
          ]
        }
        }

        case 'get_common_tokens': {
          const commonTokens = {
            WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
            USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
            DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
            ARB: '0x912CE59144191C1204E64559FE8253a0e49E6548',
            GMX: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a',
            MAGIC: '0x539bdE0d7Dbd336b79148AA742883198BBF60342'
          }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                  data: commonTokens
              }, null, 2)
            }
          ]
        }
        }

        case 'get_pair_address': {
          const { tokenA, tokenB, chain: chainParam } = args

          if (!tokenA || !tokenB) {
            throw new McpError(ErrorCode.InvalidParams, 'tokenA and tokenB are required')
          }

          const clientToUse = chainParam ? new PancakeSwapClient(chainParam as SupportedChain, rpcUrl, privateKey) : client
          const pairAddress = await clientToUse.getPairAddress(tokenA as `0x${string}`, tokenB as `0x${string}`)

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  data: {
                    tokenA,
                    tokenB,
                    pairAddress
                  }
                }, null, 2)
              }
            ]
          }
        }

        case 'get_pair_info': {
          const { pairAddress, chain: chainParam } = args

          if (!pairAddress) {
            throw new McpError(ErrorCode.InvalidParams, 'pairAddress is required')
          }

          const clientToUse = chainParam ? new PancakeSwapClient(chainParam as SupportedChain, rpcUrl, privateKey) : client
          const pairInfo = await clientToUse.getPairInfo(pairAddress as `0x${string}`)

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  data: pairInfo
                }, null, 2)
              }
            ]
          }
        }

        // Token Swapping & Trading Tools
        case 'execute_swap': {
          const { tokenIn, tokenOut, amountIn, amountOutMin, to, deadline, privateKey: walletPrivateKey, chain: chainParam } = args

          if (!tokenIn || !tokenOut || !amountIn || !to || !walletPrivateKey) {
            throw new McpError(ErrorCode.InvalidParams, 'tokenIn, tokenOut, amountIn, to, and privateKey are required')
          }

          const clientToUse = chainParam ? new PancakeSwapClient(chainParam as SupportedChain, rpcUrl, walletPrivateKey as `0x${string}`) : new PancakeSwapClient(chain as SupportedChain, rpcUrl, walletPrivateKey as `0x${string}`)
          const result = await clientToUse.executeSwap({
            tokenIn: tokenIn as `0x${string}`,
            tokenOut: tokenOut as `0x${string}`,
            amountIn: BigInt(String(amountIn)),
            amountOutMin: amountOutMin ? BigInt(String(amountOutMin)) : BigInt(0),
            to: to as `0x${string}`,
            deadline: deadline ? BigInt(Number(deadline)) : BigInt(Math.floor(Date.now() / 1000) + 1200), // 20 minutes from now
            chainId: clientToUse.getChainInfo().chainId
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  data: result
                }, null, 2)
              }
            ]
          }
        }

        case 'add_liquidity': {
          const { tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin, to, deadline, privateKey: walletPrivateKey, chain: chainParam } = args

          if (!tokenA || !tokenB || !amountADesired || !amountBDesired || !to || !walletPrivateKey) {
            throw new McpError(ErrorCode.InvalidParams, 'tokenA, tokenB, amountADesired, amountBDesired, to, and privateKey are required')
          }

          const clientToUse = chainParam ? new PancakeSwapClient(chainParam as SupportedChain, rpcUrl, walletPrivateKey as `0x${string}`) : new PancakeSwapClient(chain as SupportedChain, rpcUrl, walletPrivateKey as `0x${string}`)
          
          try {
            const result = await clientToUse.addLiquidity({
              tokenA: tokenA as `0x${string}`,
              tokenB: tokenB as `0x${string}`,
              amountADesired: BigInt(String(amountADesired)),
              amountBDesired: BigInt(String(amountBDesired)),
              amountAMin: amountAMin ? BigInt(String(amountAMin)) : BigInt(0),
              amountBMin: amountBMin ? BigInt(String(amountBMin)) : BigInt(0),
              to: to as `0x${string}`,
              deadline: deadline ? BigInt(Number(deadline)) : BigInt(Math.floor(Date.now() / 1000) + 1200), // 20 minutes from now
              chainId: clientToUse.getChainInfo().chainId
            })

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    data: result
                  }, null, 2)
                }
              ]
            }
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    note: 'PancakeSwap on Arbitrum uses ALP pools for perpetual trading instead of traditional V2 liquidity pools. Consider using add_alp_liquidity instead.'
                  }, null, 2)
                }
              ]
            }
          }
        }

        case 'remove_liquidity': {
          const { tokenA, tokenB, liquidity, amountAMin, amountBMin, to, deadline, privateKey: walletPrivateKey, chain: chainParam } = args

          if (!tokenA || !tokenB || !liquidity || !to || !walletPrivateKey) {
            throw new McpError(ErrorCode.InvalidParams, 'tokenA, tokenB, liquidity, to, and privateKey are required')
          }

          const clientToUse = chainParam ? new PancakeSwapClient(chainParam as SupportedChain, rpcUrl, walletPrivateKey as `0x${string}`) : new PancakeSwapClient(chain as SupportedChain, rpcUrl, walletPrivateKey as `0x${string}`)
          const result = await clientToUse.removeLiquidity({
            tokenA: tokenA as `0x${string}`,
            tokenB: tokenB as `0x${string}`,
            liquidity: BigInt(String(liquidity)),
            amountAMin: amountAMin ? BigInt(String(amountAMin)) : BigInt(0),
            amountBMin: amountBMin ? BigInt(String(amountBMin)) : BigInt(0),
            to: to as `0x${string}`,
            deadline: deadline ? BigInt(Number(deadline)) : BigInt(Math.floor(Date.now() / 1000) + 1200), // 20 minutes from now
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  data: result
                }, null, 2)
              }
            ]
          }
        }

        // Yield Farming Tools
        case 'get_farm_info': {
          const { pid, chain: chainParam } = args

          if (pid === undefined) {
            throw new McpError(ErrorCode.InvalidParams, 'pid is required')
          }

          const clientToUse = chainParam ? new PancakeSwapClient(chainParam as SupportedChain, rpcUrl, undefined) : client
          const farmInfo = await clientToUse.getFarmInfo(Number(pid))

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  data: farmInfo
                }, null, 2)
              }
            ]
          }
        }

        case 'stake_lp_tokens': {
          const { pid, amount, privateKey: walletPrivateKey, chain: chainParam } = args

          if (pid === undefined || !amount || !walletPrivateKey) {
            throw new McpError(ErrorCode.InvalidParams, 'pid, amount, and privateKey are required')
          }

          const clientToUse = chainParam ? new PancakeSwapClient(chainParam as SupportedChain, rpcUrl, walletPrivateKey as `0x${string}`) : new PancakeSwapClient(chain as SupportedChain, rpcUrl, walletPrivateKey as `0x${string}`)

          try {
            const result = await clientToUse.stakeLPTokens(Number(pid), BigInt(String(amount)))

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    data: result
                  }, null, 2)
                }
              ]
            }
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                  }, null, 2)
                }
              ]
            }
          }
        }

        case 'unstake_lp_tokens': {
          const { pid, amount, privateKey: walletPrivateKey, chain: chainParam } = args

          if (pid === undefined || !amount || !walletPrivateKey) {
            throw new McpError(ErrorCode.InvalidParams, 'pid, amount, and privateKey are required')
          }

          const clientToUse = chainParam ? new PancakeSwapClient(chainParam as SupportedChain, rpcUrl, walletPrivateKey as `0x${string}`) : new PancakeSwapClient(chain as SupportedChain, rpcUrl, walletPrivateKey as `0x${string}`)

          try {
            const result = await clientToUse.unstakeLPTokens(Number(pid), BigInt(String(amount)))

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    data: result
                  }, null, 2)
                }
              ]
            }
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                  }, null, 2)
                }
              ]
            }
          }
        }

        case 'claim_rewards': {
          const { pid, privateKey: walletPrivateKey, chain: chainParam } = args

          if (pid === undefined || !walletPrivateKey) {
            throw new McpError(ErrorCode.InvalidParams, 'pid and privateKey are required')
          }

          const clientToUse = chainParam ? new PancakeSwapClient(chainParam as SupportedChain, rpcUrl, walletPrivateKey as `0x${string}`) : new PancakeSwapClient(chain as SupportedChain, rpcUrl, walletPrivateKey as `0x${string}`)

          try {
            const result = await clientToUse.claimRewards(Number(pid))

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    data: result
                  }, null, 2)
                }
              ]
            }
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                  }, null, 2)
                }
              ]
            }
          }
        }

        // Syrup Pools (Staking) Tools
        case 'get_syrup_pool_info': {
          const { poolId, chain: chainParam } = args

          if (poolId === undefined) {
            throw new McpError(ErrorCode.InvalidParams, 'poolId is required')
          }

          const clientToUse = chainParam ? new PancakeSwapClient(chainParam as SupportedChain, rpcUrl, undefined) : client
          const syrupPoolInfo = await clientToUse.getSyrupPoolInfo(Number(poolId))

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  data: syrupPoolInfo
                }, null, 2)
              }
            ]
          }
        }

        case 'stake_cake': {
          const { poolId, amount, privateKey: walletPrivateKey, chain: chainParam } = args

          if (poolId === undefined || !amount || !walletPrivateKey) {
            throw new McpError(ErrorCode.InvalidParams, 'poolId, amount, and privateKey are required')
          }

          const clientToUse = chainParam ? new PancakeSwapClient(chainParam as SupportedChain, rpcUrl, walletPrivateKey as `0x${string}`) : new PancakeSwapClient(chain as SupportedChain, rpcUrl, walletPrivateKey as `0x${string}`)

          try {
            const result = await clientToUse.stakeCake(Number(poolId), BigInt(String(amount)))

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    data: result
                  }, null, 2)
                }
              ]
            }
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                  }, null, 2)
                }
              ]
            }
          }
        }

        case 'unstake_cake': {
          const { poolId, amount, privateKey: walletPrivateKey, chain: chainParam } = args

          if (poolId === undefined || !amount || !walletPrivateKey) {
            throw new McpError(ErrorCode.InvalidParams, 'poolId, amount, and privateKey are required')
          }

          const clientToUse = chainParam ? new PancakeSwapClient(chainParam as SupportedChain, rpcUrl, walletPrivateKey as `0x${string}`) : new PancakeSwapClient(chain as SupportedChain, rpcUrl, walletPrivateKey as `0x${string}`)

          try {
            const result = await clientToUse.unstakeCake(Number(poolId), BigInt(String(amount)))

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    data: result
                  }, null, 2)
                }
              ]
            }
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                  }, null, 2)
                }
              ]
            }
          }
        }

        // Initial Farm Offerings (IFOs) Tools
        case 'get_ifo_info': {
          const { ifoId, chain: chainParam } = args

          if (!ifoId) {
            throw new McpError(ErrorCode.InvalidParams, 'ifoId is required')
          }

          const clientToUse = chainParam ? new PancakeSwapClient(chainParam as SupportedChain, rpcUrl, undefined) : client
          const ifoInfo = await clientToUse.getIFOInfo(String(ifoId))

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  data: ifoInfo
                }, null, 2)
              }
            ]
          }
        }

        case 'participate_in_ifo': {
          const { ifoId, amount, privateKey: walletPrivateKey, chain: chainParam } = args

          if (!ifoId || !amount || !walletPrivateKey) {
            throw new McpError(ErrorCode.InvalidParams, 'ifoId, amount, and privateKey are required')
          }

          const clientToUse = chainParam ? new PancakeSwapClient(chainParam as SupportedChain, rpcUrl, walletPrivateKey as `0x${string}`) : new PancakeSwapClient(chain as SupportedChain, rpcUrl, walletPrivateKey as `0x${string}`)

          try {
            const result = await clientToUse.participateInIFO(String(ifoId), BigInt(String(amount)))

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    data: result
                  }, null, 2)
                }
              ]
            }
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                  }, null, 2)
                }
              ]
            }
          }
        }

        case 'add_alp_liquidity': {
          const { asset, amount, privateKey: walletPrivateKey, chain: chainParam } = args

          if (!asset || !amount || !walletPrivateKey) {
            throw new McpError(ErrorCode.InvalidParams, 'asset, amount, and privateKey are required')
          }

          const clientToUse = chainParam ? new PancakeSwapClient(chainParam as SupportedChain, rpcUrl, walletPrivateKey as `0x${string}`) : new PancakeSwapClient(chain as SupportedChain, rpcUrl, walletPrivateKey as `0x${string}`)
          
          try {
            const result = await clientToUse.addALPLiquidity(
              asset as `0x${string}`,
              BigInt(String(amount))
            )

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    data: result
                  }, null, 2)
                }
              ]
            }
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                  }, null, 2)
                }
              ]
            }
          }
        }

        case 'remove_alp_liquidity': {
          const { alpAmount, asset, privateKey: walletPrivateKey, chain: chainParam } = args

          if (!alpAmount || !asset || !walletPrivateKey) {
            throw new McpError(ErrorCode.InvalidParams, 'alpAmount, asset, and privateKey are required')
          }

          const clientToUse = chainParam ? new PancakeSwapClient(chainParam as SupportedChain, rpcUrl, walletPrivateKey as `0x${string}`) : new PancakeSwapClient(chain as SupportedChain, rpcUrl, walletPrivateKey as `0x${string}`)
          
          try {
            const result = await clientToUse.removeALPLiquidity(
              BigInt(String(alpAmount)),
              asset as `0x${string}`
            )

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    data: result
                  }, null, 2)
                }
              ]
            }
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                  }, null, 2)
                }
              ]
            }
          }
        }

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Tool '${name}' not found`)
        }
      } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorCode = error instanceof McpError ? error.code : ErrorCode.InternalError

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
              error: errorMessage,
              code: errorCode
              }, null, 2)
            }
        ],
        isError: true
      }
    }
  })

  return server
}

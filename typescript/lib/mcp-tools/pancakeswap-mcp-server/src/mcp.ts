/**
 * PancakeSwap MCP Server
 * Clean, comprehensive MCP tools for PancakeSwap operations
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { PancakeSwapClient } from './client.js'
import type { McpResponse } from './types.js'

export async function createServer() {
  const server = new McpServer({
    name: 'pancakeswap-mcp-server',
    version: '1.0.0'
  })

  // Initialize PancakeSwap client
  const chain = (process.env.PANCAKESWAP_CHAIN as any) || 'bsc'
  const rpcUrl = process.env.RPC_URL
  const client = new PancakeSwapClient(chain, rpcUrl)

  //
  // Tool: Get Token Information
  //
  const GetTokenInfoSchema = z.object({
    tokenAddress: z.string().describe('Token contract address'),
    chain: z.string().optional().describe('Chain (bsc, ethereum, arbitrum, polygon)')
  })

  server.tool(
    'get_token_info',
    'Get detailed information about a token including symbol, name, decimals, and chain ID',
    GetTokenInfoSchema.shape,
    async ({ tokenAddress, chain: chainParam }) => {
      try {
        const clientToUse = chainParam ? new PancakeSwapClient(chainParam, rpcUrl) : client
        const tokenInfo = await clientToUse.getTokenInfo(tokenAddress as any)
        
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
        } as McpResponse
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
              }, null, 2)
            }
          ]
        } as McpResponse
      }
    }
  )

  //
  // Tool: Get Price Quote
  //
  const GetPriceQuoteSchema = z.object({
    tokenIn: z.string().describe('Input token contract address'),
    tokenOut: z.string().describe('Output token contract address'),
    amountIn: z.string().describe('Amount of input token to swap'),
    decimals: z.number().optional().describe('Decimals of input token (default: 18)'),
    chain: z.string().optional().describe('Chain (bsc, ethereum, arbitrum, polygon)')
  })

  server.tool(
    'get_price_quote',
    'Get a price quote for swapping tokens on PancakeSwap, including amount out and price impact',
    GetPriceQuoteSchema.shape,
    async ({ tokenIn, tokenOut, amountIn, decimals = 18, chain: chainParam }) => {
      try {
        const clientToUse = chainParam ? new PancakeSwapClient(chainParam, rpcUrl) : client
        const quote = await clientToUse.getPriceQuote(
          tokenIn as any,
          tokenOut as any,
          amountIn,
          decimals
        )
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                data: quote
              }, null, 2)
            }
          ]
        } as McpResponse
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
              }, null, 2)
            }
          ]
        } as McpResponse
      }
    }
  )

  //
  // Tool: Get Token Price
  //
  const GetTokenPriceSchema = z.object({
    tokenAddress: z.string().describe('Token contract address'),
    amount: z.string().optional().describe('Amount to price (default: 1)'),
    chain: z.string().optional().describe('Chain (bsc, ethereum, arbitrum, polygon)')
  })

  server.tool(
    'get_token_price',
    'Get the current price of a token in USD (or reference token)',
    GetTokenPriceSchema.shape,
    async ({ tokenAddress, amount = '1', chain: chainParam }) => {
      try {
        const clientToUse = chainParam ? new PancakeSwapClient(chainParam, rpcUrl) : client
        const price = await clientToUse.getTokenPrice(tokenAddress as any, amount)
        
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
        } as McpResponse
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
              }, null, 2)
            }
          ]
        } as McpResponse
      }
    }
  )

  //
  // Tool: Check Token Allowance
  //
  const CheckAllowanceSchema = z.object({
    tokenAddress: z.string().describe('Token contract address'),
    owner: z.string().describe('Token owner address'),
    spender: z.string().describe('Spender address (usually router)'),
    chain: z.string().optional().describe('Chain (bsc, ethereum, arbitrum, polygon)')
  })

  server.tool(
    'check_token_allowance',
    'Check the allowance of a token for a specific spender address',
    CheckAllowanceSchema.shape,
    async ({ tokenAddress, owner, spender, chain: chainParam }) => {
      try {
        const clientToUse = chainParam ? new PancakeSwapClient(chainParam, rpcUrl) : client
        const allowance = await clientToUse.getAllowance(
          tokenAddress as any,
          owner as any,
          spender as any
        )
        
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
        } as McpResponse
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
              }, null, 2)
            }
          ]
        } as McpResponse
      }
    }
  )

  //
  // Tool: Get Chain Information
  //
  const GetChainInfoSchema = z.object({
    chain: z.string().optional().describe('Chain (bsc, ethereum, arbitrum, polygon)')
  })

  server.tool(
    'get_chain_info',
    'Get information about the configured chain including router and WETH addresses',
    GetChainInfoSchema.shape,
    async ({ chain: chainParam }) => {
      try {
        const clientToUse = chainParam ? new PancakeSwapClient(chainParam, rpcUrl) : client
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
        } as McpResponse
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
              }, null, 2)
            }
          ]
        } as McpResponse
      }
    }
  )

  //
  // Tool: Get Common Tokens
  //
  const GetCommonTokensSchema = z.object({
    chain: z.string().optional().describe('Chain (bsc, ethereum, arbitrum, polygon)')
  })

  server.tool(
    'get_common_tokens',
    'Get a list of common token addresses for the specified chain',
    GetCommonTokensSchema.shape,
    async ({ chain: chainParam = 'bsc' }) => {
      try {
        const commonTokens = chainParam === 'bsc' ? {
          WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
          BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
          USDT: '0x55d398326f99059fF775485246999027B3197955',
          USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
          CAKE: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
          ETH: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
          BTCB: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c'
        } : {
          message: 'Common tokens not configured for this chain yet',
          chain: chainParam
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
        } as McpResponse
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
              }, null, 2)
            }
          ]
        } as McpResponse
      }
    }
  )

  return server
}

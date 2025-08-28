#!/usr/bin/env node

import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import dotenv from 'dotenv'
import express from 'express'
import { z } from 'zod'
import {
    getErc20Allowance,
    verifyErc20Token,
    buildErc20ApproveTx,
    getV3PoolState,
    getV3Quote,
    buildV3ExactInputSingleTx,
    computeMinAmountOut,
    computeDeadlineFromNow,
    type EvmChainId
} from './uniswap.js'

dotenv.config()

// Minimal Uniswap DEX MCP server: list tokens and provide simple quote stub.
// We will flesh out full quote and tx building in subsequent edits.

const ListSupportedTokensSchema = z.object({})

const GetQuoteSchema = z.object({
    chainId: z.number().int().describe('EVM chain ID, e.g. 42161 for Arbitrum One'),
    tokenIn: z.string().describe('Input token address'),
    tokenOut: z.string().describe('Output token address'),
    amountIn: z.string().describe('Amount in wei as a decimal string')
})

function createServer() {
    const server = new McpServer({ name: 'uniswap-dex-mcp-server', version: '0.1.0' })

    server.tool(
        'list_supported_tokens',
        'List a curated set of commonly used tokens for quick testing on Arbitrum',
        ListSupportedTokensSchema.shape,
        async () => {
            const tokens = [
                { symbol: 'WETH', address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', decimals: 18 },
                { symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
                { symbol: 'ARB', address: '0x912ce59144191c1204e64559fe8253a0e49e6548', decimals: 18 }
            ]
            return { content: [{ type: 'text', text: JSON.stringify(tokens) }] }
        }
    )

    // Helper: compute_min_amount_out
    const MinAmountOutSchema = z.object({
        amountOut: z.string().describe('Expected amountOut (wei) before slippage'),
        slippageBps: z.number().int().min(0).max(10000)
    })
    server.tool(
        'compute_min_amount_out',
        'Compute amountOutMinimum by applying slippage in basis points.',
        MinAmountOutSchema.shape,
        async ({ amountOut, slippageBps }) => {
            const minOut = computeMinAmountOut(BigInt(amountOut), slippageBps)
            return { content: [{ type: 'text', text: JSON.stringify({ amountOutMinimum: minOut.toString() }) }] }
        }
    )

    // Helper: compute_deadline
    const DeadlineSchema = z.object({ secondsFromNow: z.number().int().positive() })
    server.tool(
        'compute_deadline',
        'Compute a unix timestamp deadline seconds from now.',
        DeadlineSchema.shape,
        async ({ secondsFromNow }) => {
            const deadline = computeDeadlineFromNow(secondsFromNow)
            return { content: [{ type: 'text', text: JSON.stringify({ deadline: deadline.toString() }) }] }
        }
    )

    // Build V3 exactInputSingle swap tx (unsigned)
    const BuildSwapSchema = z.object({
        chainId: z.number().int(),
        router: z.string(),
        tokenIn: z.string(),
        tokenOut: z.string(),
        fee: z.number().int(),
        recipient: z.string(),
        deadline: z.string(),
        amountIn: z.string(),
        amountOutMinimum: z.string(),
        sqrtPriceLimitX96: z.string().optional()
    })
    server.tool(
        'build_v3_exact_input_single_tx',
        'Build unsigned calldata for Uniswap V3 exactInputSingle swap.',
        BuildSwapSchema.shape,
        async ({ chainId, router, tokenIn, tokenOut, fee, recipient, deadline, amountIn, amountOutMinimum, sqrtPriceLimitX96 }) => {
            const tx = buildV3ExactInputSingleTx({
                chainId: chainId as EvmChainId,
                router: router as any,
                tokenIn: tokenIn as any,
                tokenOut: tokenOut as any,
                fee,
                recipient: recipient as any,
                deadline: BigInt(deadline),
                amountIn: BigInt(amountIn),
                amountOutMinimum: BigInt(amountOutMinimum),
                sqrtPriceLimitX96: sqrtPriceLimitX96 ? BigInt(sqrtPriceLimitX96) : undefined
            })
            return { content: [{ type: 'text', text: JSON.stringify(tx) }] }
        }
    )

    server.tool(
        'get_quote',
        'Get a Uniswap V3 quote via user-specified quoter (V1/V2).',
        GetQuoteSchema.shape,
        async ({ chainId, tokenIn, tokenOut, amountIn }) => {
            // Keep backwards compat stub for now (no quoter). Echo payload
            const result = { chainId, tokenIn, tokenOut, amountIn, amountOut: '0' }
            return { content: [{ type: 'text', text: JSON.stringify(result) }] }
        }
    )

    // New: verify_erc20
    const VerifyErc20Schema = z.object({
        chainId: z.number().int().describe('EVM chain ID'),
        token: z.string().describe('Token address')
    })
    server.tool(
        'verify_erc20',
        'Verify that a token address is a valid ERC-20 and return metadata.',
        VerifyErc20Schema.shape,
        async ({ chainId, token }) => {
            const meta = await verifyErc20Token(chainId as EvmChainId, token as any)
            return { content: [{ type: 'text', text: JSON.stringify(meta) }] }
        }
    )

    // New: get_allowance
    const AllowanceSchema = z.object({
        chainId: z.number().int(),
        token: z.string(),
        owner: z.string(),
        spender: z.string()
    })
    server.tool(
        'get_allowance',
        'Read ERC-20 allowance for owner->spender.',
        AllowanceSchema.shape,
        async ({ chainId, token, owner, spender }) => {
            const res = await getErc20Allowance(chainId as EvmChainId, token as any, owner as any, spender as any)
            return { content: [{ type: 'text', text: JSON.stringify(res) }] }
        }
    )

    // New: build_approval_tx
    const BuildApprovalSchema = z.object({
        chainId: z.number().int(),
        token: z.string(),
        spender: z.string(),
        amount: z.string().describe('Approval amount as decimal string (wei)')
    })
    server.tool(
        'build_approval_tx',
        'Build unsigned ERC-20 approval transaction data.',
        BuildApprovalSchema.shape,
        async ({ chainId, token, spender, amount }) => {
            const tx = buildErc20ApproveTx(chainId as EvmChainId, token as any, spender as any, BigInt(amount))
            return { content: [{ type: 'text', text: JSON.stringify(tx) }] }
        }
    )

    // New: get_pool_state
    const PoolStateSchema = z.object({ chainId: z.number().int(), pool: z.string() })
    server.tool(
        'get_pool_state',
        'Read Uniswap V3 pool state (token0, token1, fee, liquidity, slot0).',
        PoolStateSchema.shape,
        async ({ chainId, pool }) => {
            const state = await getV3PoolState(chainId as EvmChainId, pool as any)
            return { content: [{ type: 'text', text: JSON.stringify(state) }] }
        }
    )

    // New: get_v3_quote
    const V3QuoteSchema = z.object({
        chainId: z.number().int(),
        quoter: z.string(),
        tokenIn: z.string(),
        tokenOut: z.string(),
        fee: z.number().int(),
        amountIn: z.string(),
        sqrtPriceLimitX96: z.string().optional(),
        useV2: z.boolean().optional(),
        recipient: z.string().optional()
    })
    server.tool(
        'get_v3_quote',
        'Quote exactInputSingle via a provided Uniswap V3 Quoter (supports v1/v2).',
        V3QuoteSchema.shape,
        async ({ chainId, quoter, tokenIn, tokenOut, fee, amountIn, sqrtPriceLimitX96, useV2, recipient }) => {
            const res = await getV3Quote({
                chainId: chainId as EvmChainId,
                quoter: quoter as any,
                tokenIn: tokenIn as any,
                tokenOut: tokenOut as any,
                fee,
                amountIn: BigInt(amountIn),
                sqrtPriceLimitX96: sqrtPriceLimitX96 ? BigInt(sqrtPriceLimitX96) : undefined,
                useV2,
                recipient: recipient as any
            })
            return { content: [{ type: 'text', text: JSON.stringify(res) }] }
        }
    )

    return server
}

async function main() {
    const server = createServer()

    // Optional HTTP SSE transport like other MCP servers in this repo
    const app = express()
    const transports: { [sessionId: string]: SSEServerTransport } = {}

    app.get('/sse', async (_req, res) => {
        const transport = new SSEServerTransport('/messages', res)
        transports[transport.sessionId] = transport
        await server.connect(transport)
    })

    app.post('/messages', async (req, res) => {
        const sessionId = req.query.sessionId as string
        const transport = transports[sessionId]
        if (!transport) {
            res.status(400).send('No transport found for sessionId')
            return
        }
        await transport.handlePostMessage(req, res)
    })

    const PORT = process.env.PORT || 3031
    app.listen(PORT, () => {
        console.log(`Uniswap DEX MCP server listening on ${PORT}`)
    })

    // Always expose stdio transport for inspector usage
    const stdioTransport = new StdioServerTransport()
    console.error('Initializing stdio transport for Uniswap DEX MCP...')
    await server.connect(stdioTransport)
    console.error('Uniswap DEX MCP stdio server ready.')

    process.stdin.on('end', () => {
        console.error('Stdio closed, exiting Uniswap DEX MCP server...')
        process.exit(0)
    })
}

main().catch(() => process.exit(-1))




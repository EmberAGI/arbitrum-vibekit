#!/usr/bin/env node

import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import dotenv from 'dotenv'
import express from 'express'
import { z } from 'zod'

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

    server.tool(
        'get_quote',
        'Get a rough swap quote between two tokens. For now returns an echo payload you can verify via inspector.',
        GetQuoteSchema.shape,
        async ({ chainId, tokenIn, tokenOut, amountIn }) => {
            const result = {
                chainId,
                tokenIn,
                tokenOut,
                amountIn,
                // Placeholder output amount to be replaced by real Uniswap routing logic
                amountOut: '0',
                note: 'Stub quote. Implement routing in a follow-up commit.'
            }
            return { content: [{ type: 'text', text: JSON.stringify(result) }] }
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




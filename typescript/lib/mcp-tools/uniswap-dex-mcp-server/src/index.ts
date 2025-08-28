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
    getOraclePrice,
    validateQuoteAgainstOracle,
    getV3TwapTick,
    computeSafeSlippageBps,
    buildEip2612TypedData,
    buildPermit2TypedData,
    computeMevRiskScore,
    buildPrivateTxPayload,
    recommendV3FeeTier,
    planTwapExecution,
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

    // Oracle: get price
    const OraclePriceSchema = z.object({ chainId: z.number().int(), aggregator: z.string() })
    server.tool(
        'get_oracle_price',
        'Fetch latest Chainlink aggregator price and decimals.',
        OraclePriceSchema.shape,
        async ({ chainId, aggregator }) => {
            const res = await getOraclePrice(chainId as EvmChainId, aggregator as any)
            return { content: [{ type: 'text', text: JSON.stringify(res) }] }
        }
    )

    // Oracle: validate quote
    const ValidateQuoteSchema = z.object({
        amountIn: z.string(),
        amountOut: z.string(),
        tokenInDecimals: z.number().int(),
        tokenOutDecimals: z.number().int(),
        oraclePrice: z.string(),
        oracleDecimals: z.number().int(),
        maxDeviationBps: z.number().int()
    })
    server.tool(
        'validate_quote_against_oracle',
        'Validate implied DEX price vs oracle; returns deviation in bps and pass/fail.',
        ValidateQuoteSchema.shape,
        async ({ amountIn, amountOut, tokenInDecimals, tokenOutDecimals, oraclePrice, oracleDecimals, maxDeviationBps }) => {
            const res = validateQuoteAgainstOracle({
                amountIn: BigInt(amountIn),
                amountOut: BigInt(amountOut),
                tokenInDecimals,
                tokenOutDecimals,
                oraclePrice: BigInt(oraclePrice),
                oracleDecimals,
                maxDeviationBps
            })
            return { content: [{ type: 'text', text: JSON.stringify(res) }] }
        }
    )

    // TWAP and dynamic slippage
    const TwapSchema = z.object({ chainId: z.number().int(), pool: z.string(), secondsAgo: z.number().int().positive() })
    server.tool(
        'get_pool_twap_tick',
        'Get average tick over a lookback window for a Uniswap V3 pool.',
        TwapSchema.shape,
        async ({ chainId, pool, secondsAgo }) => {
            const res = await getV3TwapTick(chainId as EvmChainId, pool as any, secondsAgo)
            return { content: [{ type: 'text', text: JSON.stringify(res) }] }
        }
    )

    const SafeSlipSchema = z.object({ averageTick: z.number(), baseBps: z.number().int().min(0), perTickBps: z.number().int().min(0), maxBps: z.number().int().positive() })
    server.tool(
        'compute_safe_slippage_bps',
        'Compute dynamic slippage bps from TWAP-derived average tick.',
        SafeSlipSchema.shape,
        async ({ averageTick, baseBps, perTickBps, maxBps }) => {
            const res = computeSafeSlippageBps({ averageTick, baseBps, perTickBps, maxBps })
            return { content: [{ type: 'text', text: JSON.stringify(res) }] }
        }
    )

    // EIP-2612 Permit typed-data
    const Eip2612Schema = z.object({
        chainId: z.number().int(), token: z.string(), owner: z.string(), spender: z.string(), value: z.string(), nonce: z.string(), deadline: z.string(), tokenName: z.string().optional(), tokenVersion: z.string().optional()
    })
    server.tool(
        'build_eip2612_permit',
        'Build EIP-2612 typed data for exact, expiring approvals.',
        Eip2612Schema.shape,
        async ({ chainId, token, owner, spender, value, nonce, deadline, tokenName, tokenVersion }) => {
            const res = await buildEip2612TypedData({
                chainId: chainId as EvmChainId,
                token: token as any,
                owner: owner as any,
                spender: spender as any,
                value: BigInt(value),
                nonce: BigInt(nonce),
                deadline: BigInt(deadline),
                tokenName,
                tokenVersion
            })
            return { content: [{ type: 'text', text: JSON.stringify(res) }] }
        }
    )

    // Permit2 typed-data
    const Permit2Schema = z.object({ chainId: z.number().int(), permit2: z.string(), token: z.string(), amount: z.string(), expiration: z.string(), nonce: z.string(), spender: z.string(), sigDeadline: z.string() })
    server.tool(
        'build_permit2_permit',
        'Build Permit2 typed data for scoped approvals.',
        Permit2Schema.shape,
        async ({ chainId, permit2, token, amount, expiration, nonce, spender, sigDeadline }) => {
            const res = buildPermit2TypedData({
                chainId: chainId as EvmChainId,
                permit2: permit2 as any,
                token: token as any,
                amount: BigInt(amount),
                expiration: BigInt(expiration),
                nonce: BigInt(nonce),
                spender: spender as any,
                sigDeadline: BigInt(sigDeadline)
            })
            return { content: [{ type: 'text', text: JSON.stringify(res) }] }
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

    // MEV protection
    const MevRiskSchema = z.object({
        amountIn: z.string(),
        amountOut: z.string(),
        tokenInDecimals: z.number().int(),
        tokenOutDecimals: z.number().int(),
        poolLiquidity: z.string(),
        recentVolatility: z.number(),
        baseFee: z.string()
    })
    server.tool(
        'compute_mev_risk_score',
        'Compute MEV risk score based on trade size, volatility, and gas costs.',
        MevRiskSchema.shape,
        async ({ amountIn, amountOut, tokenInDecimals, tokenOutDecimals, poolLiquidity, recentVolatility, baseFee }) => {
            const res = computeMevRiskScore({
                amountIn: BigInt(amountIn),
                amountOut: BigInt(amountOut),
                tokenInDecimals,
                tokenOutDecimals,
                poolLiquidity: BigInt(poolLiquidity),
                recentVolatility,
                baseFee: BigInt(baseFee)
            })
            return { content: [{ type: 'text', text: JSON.stringify(res) }] }
        }
    )

    const PrivateTxSchema = z.object({
        chainId: z.number().int(),
        to: z.string(),
        data: z.string(),
        value: z.string().optional(),
        gasLimit: z.string().optional(),
        maxFeePerGas: z.string().optional(),
        maxPriorityFeePerGas: z.string().optional()
    })
    server.tool(
        'build_private_tx_payload',
        'Build private transaction payload for Flashbots/Protect RPC to avoid MEV.',
        PrivateTxSchema.shape,
        async ({ chainId, to, data, value, gasLimit, maxFeePerGas, maxPriorityFeePerGas }) => {
            const res = buildPrivateTxPayload({
                chainId: chainId as EvmChainId,
                to: to as any,
                data,
                value,
                gasLimit: gasLimit ? BigInt(gasLimit) : undefined,
                maxFeePerGas: maxFeePerGas ? BigInt(maxFeePerGas) : undefined,
                maxPriorityFeePerGas: maxPriorityFeePerGas ? BigInt(maxPriorityFeePerGas) : undefined
            })
            return { content: [{ type: 'text', text: JSON.stringify(res) }] }
        }
    )

    // Smart fee-tier recommendation
    const FeeTierSchema = z.object({
        chainId: z.number().int(),
        tokenIn: z.string(),
        tokenOut: z.string(),
        amountIn: z.string(),
        poolAddresses: z.record(z.number(), z.string()).optional(),
        lookbackSeconds: z.number().int().positive().optional()
    })
    server.tool(
        'recommend_v3_fee_tier',
        'Recommend optimal Uniswap V3 fee tier based on liquidity and volatility.',
        FeeTierSchema.shape,
        async ({ chainId, tokenIn, tokenOut, amountIn, poolAddresses, lookbackSeconds }) => {
            const poolAddrs = poolAddresses ? Object.fromEntries(
                Object.entries(poolAddresses).map(([fee, addr]) => [Number(fee), addr as any])
            ) : undefined
            const res = await recommendV3FeeTier(chainId as EvmChainId, {
                tokenIn: tokenIn as any,
                tokenOut: tokenOut as any,
                amountIn: BigInt(amountIn),
                poolAddresses: poolAddrs,
                lookbackSeconds
            })
            return { content: [{ type: 'text', text: JSON.stringify(res) }] }
        }
    )

    // TWAP planner
    const TwapPlanSchema = z.object({
        totalAmountIn: z.string(),
        totalAmountOutMin: z.string(),
        deadline: z.string(),
        sliceCount: z.number().int().positive(),
        intervalSeconds: z.number().int().positive(),
        slippageBps: z.number().int()
    })
    server.tool(
        'plan_twap_execution',
        'Plan TWAP (Time-Weighted Average Price) execution schedule for large orders.',
        TwapPlanSchema.shape,
        async ({ totalAmountIn, totalAmountOutMin, deadline, sliceCount, intervalSeconds, slippageBps }) => {
            const res = planTwapExecution({
                totalAmountIn: BigInt(totalAmountIn),
                totalAmountOutMin: BigInt(totalAmountOutMin),
                deadline: BigInt(deadline),
                sliceCount,
                intervalSeconds,
                slippageBps
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




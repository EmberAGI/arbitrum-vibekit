import { createPublicClient, http, encodeFunctionData, parseAbi, type Address } from 'viem'
import { mainnet, arbitrum } from 'viem/chains'

export type EvmChainId = number

export function getPublicClient(chainId: EvmChainId) {
    const rpcUrl = process.env.ARBITRUM_RPC_URL
    if (chainId === arbitrum.id) {
        if (!rpcUrl) {
            throw new Error('Missing ARBITRUM_RPC_URL env var')
        }
        return createPublicClient({ chain: arbitrum, transport: http(rpcUrl) })
    }
    if (chainId === mainnet.id) {
        const url = process.env.ETHEREUM_RPC_URL
        if (!url) throw new Error('Missing ETHEREUM_RPC_URL env var')
        return createPublicClient({ chain: mainnet, transport: http(url) })
    }
    throw new Error(`Unsupported chainId: ${chainId}`)
}

export async function getPoolImmutables(_chainId: EvmChainId, _pool: Address) {
    // Placeholder for future: read Uniswap V3 pool immutables via ABI
    return { note: 'not implemented yet' }
}

export async function getRoughQuoteEcho(params: {
    chainId: EvmChainId
    tokenIn: Address
    tokenOut: Address
    amountIn: string
}) {
    // This is a stub that simply echoes inputs; real routing in a follow-up PR
    return {
        ...params,
        amountOut: '0'
    }
}

// ---------------------
// ERC20 helpers
// ---------------------

const erc20Abi = parseAbi([
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)'
])

export async function verifyErc20Token(
    chainId: EvmChainId,
    token: Address
) {
    const client = getPublicClient(chainId)
    const bytecode = await client.getBytecode({ address: token })
    if (!bytecode || bytecode === '0x') {
        throw new Error('Provided token address has no contract code')
    }
    const [name, symbol, decimals] = await Promise.all([
        client.readContract({ address: token, abi: erc20Abi, functionName: 'name' }),
        client.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' }),
        client.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' })
    ])
    return { name, symbol, decimals }
}

export async function getErc20Allowance(
    chainId: EvmChainId,
    token: Address,
    owner: Address,
    spender: Address
) {
    const client = getPublicClient(chainId)
    const allowance = await client.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, spender] })
    return { allowance: allowance.toString() }
}

export function buildErc20ApproveTx(
    chainId: EvmChainId,
    token: Address,
    spender: Address,
    amount: bigint
) {
    const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [spender, amount]
    })
    return {
        chainId,
        to: token,
        data,
        value: '0x0'
    }
}

// ---------------------
// Uniswap V3: Pools & Quotes
// ---------------------

const v3PoolAbi = parseAbi([
    'function token0() view returns (address)',
    'function token1() view returns (address)',
    'function fee() view returns (uint24)',
    'function liquidity() view returns (uint128)',
    'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
])

export async function getV3PoolState(chainId: EvmChainId, pool: Address) {
    const client = getPublicClient(chainId)
    const [token0, token1, fee, liquidity, slot0] = await Promise.all([
        client.readContract({ address: pool, abi: v3PoolAbi, functionName: 'token0' }),
        client.readContract({ address: pool, abi: v3PoolAbi, functionName: 'token1' }),
        client.readContract({ address: pool, abi: v3PoolAbi, functionName: 'fee' }),
        client.readContract({ address: pool, abi: v3PoolAbi, functionName: 'liquidity' }),
        client.readContract({ address: pool, abi: v3PoolAbi, functionName: 'slot0' })
    ])
    return { token0, token1, fee: Number(fee), liquidity: liquidity.toString(), slot0 }
}

const quoterV1Abi = parseAbi([
    'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) returns (uint256 amountOut)'
])

const quoterV2Abi = parseAbi([
    'function quoteExactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
])

export async function getV3Quote(params: {
    chainId: EvmChainId
    quoter: Address
    tokenIn: Address
    tokenOut: Address
    fee: number
    amountIn: bigint
    sqrtPriceLimitX96?: bigint
    useV2?: boolean
    recipient?: Address
}) {
    const client = getPublicClient(params.chainId)
    const sqrtLimit = params.sqrtPriceLimitX96 ?? 0n
    if (params.useV2) {
        const recipient: Address = (params.recipient ?? '0x0000000000000000000000000000000000000000') as Address
        try {
            const [amountOut] = await client.readContract({
                address: params.quoter,
                abi: quoterV2Abi,
                functionName: 'quoteExactInputSingle',
                args: [{
                    tokenIn: params.tokenIn,
                    tokenOut: params.tokenOut,
                    fee: params.fee,
                    recipient,
                    amountIn: params.amountIn,
                    sqrtPriceLimitX96: sqrtLimit
                }]
            }) as unknown as [bigint, bigint, number, bigint]
            return { amountOut: amountOut.toString(), via: 'v2' }
        } catch (_err) {
            // Fallback to V1 if V2 reverts
            const amountOut = await client.readContract({
                address: params.quoter,
                abi: quoterV1Abi,
                functionName: 'quoteExactInputSingle',
                args: [params.tokenIn, params.tokenOut, params.fee, params.amountIn, sqrtLimit]
            }) as unknown as bigint
            return { amountOut: amountOut.toString(), via: 'v1-fallback' }
        }
    }
    const amountOut = await client.readContract({
        address: params.quoter,
        abi: quoterV1Abi,
        functionName: 'quoteExactInputSingle',
        args: [params.tokenIn, params.tokenOut, params.fee, params.amountIn, sqrtLimit]
    }) as unknown as bigint
    return { amountOut: amountOut.toString(), via: 'v1' }
}

// ---------------------
// Uniswap V3: Swap tx builder (exactInputSingle)
// ---------------------

const swapRouterAbi = parseAbi([
    'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut)'
])

export function buildV3ExactInputSingleTx(params: {
    chainId: EvmChainId
    router: Address
    tokenIn: Address
    tokenOut: Address
    fee: number
    recipient: Address
    deadline: bigint
    amountIn: bigint
    amountOutMinimum: bigint
    sqrtPriceLimitX96?: bigint
}) {
    const data = encodeFunctionData({
        abi: swapRouterAbi,
        functionName: 'exactInputSingle',
        args: [{
            tokenIn: params.tokenIn,
            tokenOut: params.tokenOut,
            fee: params.fee,
            recipient: params.recipient,
            deadline: params.deadline,
            amountIn: params.amountIn,
            amountOutMinimum: params.amountOutMinimum,
            sqrtPriceLimitX96: params.sqrtPriceLimitX96 ?? 0n
        }]
    })
    return { chainId: params.chainId, to: params.router, data, value: '0x0' }
}

// ---------------------
// Helpers: slippage & deadline
// ---------------------

export function computeMinAmountOut(amountOut: bigint, slippageBps: number) {
    if (slippageBps < 0 || slippageBps > 10000) {
        throw new Error('slippageBps must be between 0 and 10000')
    }
    const slippage = (amountOut * BigInt(slippageBps)) / 10000n
    return amountOut - slippage
}

export function computeDeadlineFromNow(secondsFromNow: number) {
    if (secondsFromNow <= 0) {
        throw new Error('secondsFromNow must be positive')
    }
    const now = Math.floor(Date.now() / 1000)
    return BigInt(now + secondsFromNow)
}

// ---------------------
// Chainlink Oracle helpers
// ---------------------

const aggregatorV3Abi = parseAbi([
    'function latestRoundData() view returns (uint80 roundId,int256 answer,uint256 startedAt,uint256 updatedAt,uint80 answeredInRound)',
    'function decimals() view returns (uint8)'
])

export async function getOraclePrice(chainId: EvmChainId, aggregator: Address) {
    const client = getPublicClient(chainId)
    const [decimals, latest] = await Promise.all([
        client.readContract({ address: aggregator, abi: aggregatorV3Abi, functionName: 'decimals' }),
        client.readContract({ address: aggregator, abi: aggregatorV3Abi, functionName: 'latestRoundData' })
    ])
    const answer = (latest as any).answer as bigint
    const updatedAt = (latest as any).updatedAt as bigint
    return { price: answer.toString(), decimals: Number(decimals), updatedAt: updatedAt.toString() }
}

export function validateQuoteAgainstOracle(params: {
    amountIn: bigint
    amountOut: bigint
    tokenInDecimals: number
    tokenOutDecimals: number
    oraclePrice: bigint
    oracleDecimals: number
    maxDeviationBps: number
}) {
    if (params.maxDeviationBps < 0) throw new Error('maxDeviationBps must be >= 0')
    // implied price = (amountOut / 10^outDec) / (amountIn / 10^inDec)
    const scaledOut = Number(params.amountOut) / 10 ** params.tokenOutDecimals
    const scaledIn = Number(params.amountIn) / 10 ** params.tokenInDecimals
    const impliedPrice = scaledOut / scaledIn
    const oracle = Number(params.oraclePrice) / 10 ** params.oracleDecimals
    const deviation = Math.abs(impliedPrice - oracle) / oracle
    const deviationBps = Math.round(deviation * 10000)
    const ok = deviationBps <= params.maxDeviationBps
    return { ok, deviationBps, impliedPrice, oraclePrice: oracle }
}

// ---------------------
// Uniswap V3 TWAP & dynamic slippage
// ---------------------

const v3ObserveAbi = parseAbi([
    'function observe(uint32[] secondsAgos) view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128s)'
])

export async function getV3TwapTick(chainId: EvmChainId, pool: Address, secondsAgo: number) {
    if (secondsAgo <= 0) throw new Error('secondsAgo must be positive')
    const client = getPublicClient(chainId)
    const secondsAgos: readonly number[] = [secondsAgo, 0]
    const [tickCumulatives] = await client.readContract({
        address: pool,
        abi: v3ObserveAbi,
        functionName: 'observe',
        args: [secondsAgos]
    }) as unknown as [bigint[], bigint[]]
    const tickCumulativesBI = tickCumulatives as unknown as bigint[]
    if (!tickCumulativesBI || tickCumulativesBI.length < 2 || tickCumulativesBI[0] === undefined || tickCumulativesBI[1] === undefined) {
        throw new Error('observe() did not return two tickCumulative values')
    }
    const c0 = tickCumulativesBI[0] as bigint
    const c1 = tickCumulativesBI[1] as bigint
    const tickAvg = Number((c1 - c0) / BigInt(secondsAgo))
    return { averageTick: tickAvg }
}

export function computeSafeSlippageBps(params: {
    averageTick: number
    baseBps: number
    perTickBps: number
    maxBps: number
}) {
    if (params.baseBps < 0 || params.perTickBps < 0 || params.maxBps <= 0) throw new Error('invalid slippage params')
    const bps = Math.min(params.maxBps, params.baseBps + Math.abs(params.averageTick) * params.perTickBps)
    return { slippageBps: bps }
}

// ---------------------
// EIP-2612 and Permit2 typed-data builders
// ---------------------

export async function buildEip2612TypedData(params: {
    chainId: EvmChainId
    token: Address
    owner: Address
    spender: Address
    value: bigint
    nonce: bigint
    deadline: bigint
    tokenName?: string
    tokenVersion?: string
}) {
    let tokenName = params.tokenName
    if (!tokenName) {
        const client = getPublicClient(params.chainId)
        tokenName = await client.readContract({ address: params.token, abi: erc20Abi, functionName: 'name' }) as unknown as string
    }
    const tokenVersion = params.tokenVersion ?? '1'
    const domain = {
        name: tokenName,
        version: tokenVersion,
        chainId: params.chainId,
        verifyingContract: params.token
    }
    const types = {
        Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
        ]
    }
    const message = {
        owner: params.owner,
        spender: params.spender,
        value: params.value.toString(),
        nonce: params.nonce.toString(),
        deadline: params.deadline.toString()
    }
    return { domain, types, primaryType: 'Permit', message }
}

export function buildPermit2TypedData(params: {
    chainId: EvmChainId
    permit2: Address
    token: Address
    amount: bigint
    expiration: bigint
    nonce: bigint
    spender: Address
    sigDeadline: bigint
}) {
    const domain = {
        name: 'Permit2',
        version: '1',
        chainId: params.chainId,
        verifyingContract: params.permit2
    }
    const types = {
        PermitSingle: [
            { name: 'details', type: 'PermitDetails' },
            { name: 'spender', type: 'address' },
            { name: 'sigDeadline', type: 'uint256' }
        ],
        PermitDetails: [
            { name: 'token', type: 'address' },
            { name: 'amount', type: 'uint160' },
            { name: 'expiration', type: 'uint48' },
            { name: 'nonce', type: 'uint48' }
        ]
    }
    const message = {
        details: {
            token: params.token,
            amount: params.amount.toString(),
            expiration: params.expiration.toString(),
            nonce: params.nonce.toString()
        },
        spender: params.spender,
        sigDeadline: params.sigDeadline.toString()
    }
    return { domain, types, primaryType: 'PermitSingle', message }
}




import { createPublicClient, http, getContract, formatUnits, parseAbi, type Address, type Hex } from 'viem'
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




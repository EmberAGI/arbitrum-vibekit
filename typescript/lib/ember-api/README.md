# Ember API

A TypeScript client library for interacting with the Ember MCP (Model Context Protocol) server, providing strongly-typed interfaces for DeFi operations across multiple blockchain protocols. For schema definitions and types, see the [`ember-schemas`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/ember-schemas) package.

## Overview

The Ember API client abstracts the complexity of multi-protocol DeFi interactions, providing a unified interface for:

- **Token Swapping**
- **Lending & Borrowing**
- **Liquidity Operations**
- **Market Data**
- **Wallet Management**

## Available Tools

The Ember MCP server provides the following tools, each mapped to specific DeFi protocols:

### Token Swapping

- **`swapTokens`** - Cross-chain token swaps via DEX aggregation

### Lending & Borrowing (Aave Protocol)

- **`lendingSupply`** - Supply assets to earn yield
- **`lendingWithdraw`** - Withdraw supplied assets
- **`lendingBorrow`** - Borrow against collateral
- **`lendingRepay`** - Repay borrowed assets

### Liquidity Operations (Camelot DEX)

- **`supplyLiquidity`** - Add liquidity to pools
- **`withdrawLiquidity`** - Remove liquidity from pools
- **`getLiquidityPools`** - Query available pools

### Market Data & Information

- **`getTokenMarketData`** - Real-time token prices
- **`getTokens`** - Available tokens across chains
- **`getChains`** - Supported blockchain networks
- **`getCapabilities`** - Protocol capabilities by chain

### Wallet & Portfolio

- **`getWalletBalances`** - Token balances across chains
- **`getWalletLendingPositions`** - Lending/borrowing positions
- **`getWalletLiquidityPositions`** - LP positions
- **`getYieldMarkets`** - Available yield opportunities

### Transaction Tracking

- **`getProviderTrackingStatus`** - Track transaction status

## Installation

```bash
npm install ember-api
# or
pnpm add ember-api
```

## Quickstart

```typescript
import { EmberMcpClient } from 'ember-api';

// Connect to remote Ember MCP server
const client = new EmberMcpClient('https://api.emberai.xyz/mcp');
await client.connect();

// Swap tokens on same chain
const swapResult = await client.swapTokens({
  fromTokenAddress: '0x...', // USDC address
  fromTokenChainId: '42161', // Arbitrum
  toTokenAddress: '0x...', // ETH address
  toTokenChainId: '42161',
  amount: '10000000', // 10 USDC (6 decimals)
  userAddress: '0x...',
});

// Supply to lending protocol (Aave)
const supplyResult = await client.lendingSupply({
  tokenAddress: '0x...',
  tokenChainId: '42161',
  amount: '100000000000000000', // 0.1 ETH
  userAddress: '0x...',
});

// Add liquidity to pools (Camelot)
const liquidityTx = await client.supplyLiquidity({
  token0Address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC
  token0ChainId: '42161',
  token0Amount: '25000000', // 25 USDC
  token1Address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
  token1ChainId: '42161',
  token1Amount: '10000000000000000', // 0.01 ETH
  userAddress: '0x...',
});

// Cross-chain swaps
const crossChainSwap = await client.swapTokens({
  fromTokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC on Arbitrum
  fromTokenChainId: '42161',
  toTokenAddress: '0x0000000000000000000000000000000000000000', // Native ETH
  toTokenChainId: '1', // Ethereum mainnet
  amount: '20000000', // 20 USDC
  userAddress: '0x...',
});

client.close();
```

## Response Format

All tool responses include transaction plans that can be executed:

```typescript
interface ToolResponse {
  transactions: TransactionPlan[];
  // ... other tool-specific data
}

interface TransactionPlan {
  type: 'EVM_TX' | 'SOLANA_TX';
  to: string;
  data: string;
  value: string;
  chainId: string;
}
```

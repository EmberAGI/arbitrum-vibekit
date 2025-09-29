# Ember API

A TypeScript client library for interacting with the EmberAI MCP server, providing strongly-typed interfaces for DeFi operations across multiple blockchain protocols. For schema definitions and types, see the [`ember-schemas`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/ember-schemas) package.

## Overview

The Ember API client abstracts the complexity of multi-protocol DeFi interactions, providing a unified interface for:

- **Token Swapping**
- **Lending & Borrowing**
- **Liquidity Operations**
- **Market Data**
- **Wallet Management**
- **Perpetuals Trading**

## Endpoint

The Ember MCP server is hosted at the following URL:

```
https://api.emberai.xyz/mcp
```

## Available Tools

The Ember MCP server provides the following tools, each mapped to specific DeFi protocols:

### Token Swapping

- `swapTokens`: Cross-chain token swaps via DEX aggregation

### Lending & Borrowing (Aave Protocol)

- `lendingSupply`: Supply assets to earn yield
- `lendingWithdraw`: Withdraw supplied assets
- `lendingBorrow`: Borrow against collateral
- `lendingRepay`: Repay borrowed assets

### Liquidity Operations (Camelot DEX)

- `supplyLiquidity`: Add liquidity to pools
- `withdrawLiquidity`: Remove liquidity from pools
- `getLiquidityPools`: Query available pools

### Perpetuals Trading (GMX)

- `createPerpetualLongPosition`: Create a long position in a perpetual market
- `possiblePerpetualLongPositions`: Get possible long positions for a user
- `createPerpetualShortPosition`: Create a short position in a perpetual market
- `closePerpetualsOrders`: Cancel perpetual orders by order keys
- `getPerpetualsMarkets`: Get perpetual markets for the specified chains
- `getPerpetualsPositions`: Gets perpetual positions for a specified address
- `getPerpetualsOrders`: Gets perpetual orders for a specified address

### Market Data & Information

- `getTokenMarketData`: Real-time token prices
- `getTokens`: Available tokens across chains
- `getChains`: Supported blockchain networks
- `getCapabilities`: Protocol capabilities by chain

### Wallet & Portfolio

- `getWalletBalances`: Token balances across chains
- `getWalletLendingPositions`: Lending/borrowing positions
- `getWalletLiquidityPositions`: LP positions
- `getYieldMarkets`: Available yield opportunities

### Transaction Tracking

- `getProviderTrackingStatus`: Track transaction status

## Installation

```bash
# Add to your package.json dependencies
"ember-api": "workspace:*"

# Or install from the monorepo workspace
pnpm add ember-api
```

## Quickstart

```typescript
import { EmberMcpClient } from 'ember-api';

// Connect to remote Ember MCP server
const client = new EmberMcpClient('https://api.emberai.xyz/mcp');
await client.connect();

// Swap tokens on the same chain (Arbitrum)
const swapResult = await client.swapTokens({
  orderType: 'MARKET_BUY',
  baseToken: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', chainId: '42161' }, // USDC
  quoteToken: { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', chainId: '42161' }, // WETH
  amount: '10000000', // 10 USDC (6 decimals)
  recipient: '0x...',
});

// Supply to the lending protocol (Aave)
const supplyResult = await client.lendingSupply({
  tokenUid: { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', chainId: '42161' }, // WETH
  amount: '100000000000000000', // 0.1 WETH (18 decimals)
  walletAddress: '0x...',
});

// Add liquidity to Camelot V3 pool (full range)
const liquidityTx = await client.supplyLiquidity({
  token0: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', chainId: '42161' }, // USDC
  token1: { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', chainId: '42161' }, // WETH
  amount0: '25000000', // 25 USDC (6 decimals)
  amount1: '10000000000000000', // 0.01 WETH (18 decimals)
  range: { type: 'full' },
  walletAddress: '0x...',
});

// Cross-chain swap (Arbitrum → Ethereum Mainnet)
const crossChainSwap = await client.swapTokens({
  orderType: 'MARKET_BUY',
  baseToken: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', chainId: '42161' }, // USDC (Arbitrum)
  quoteToken: { address: '0x0000000000000000000000000000000000000000', chainId: '1' }, // Native ETH (Mainnet)
  amount: '20000000', // 20 USDC
  recipient: '0x...',
});

client.close();
```

## Response Format

All tool responses include transaction plans that can be executed:

```typescript
interface ToolResponse {
  transactions: TransactionPlan[];
  chainId: string;
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

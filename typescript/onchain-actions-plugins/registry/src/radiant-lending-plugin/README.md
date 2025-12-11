# Radiant Lending Plugin

Ember Plugin System-compliant lending plugin for Radiant Capital V2 on Arbitrum.

## Overview

This plugin provides integration with Radiant Capital's V2 lending protocol through the Ember Plugin System. It enables supply, withdraw, borrow, and repay operations on Arbitrum.

## Features

- ✅ Ember Plugin System compliant
- ✅ Configurable RPC endpoint
- ✅ Complete error handling
- ✅ Support for all lending operations
- ✅ Real-time market data
- ✅ User position queries
- ✅ TypeScript support

## Usage

```typescript
import { getRadiantEmberPlugin } from './radiant-lending-plugin/index.js';

// Initialize the plugin
const radiantPlugin = await getRadiantEmberPlugin({
  chainId: 42161,
  rpcUrl: 'https://arb1.arbitrum.io/rpc',
  wrappedNativeToken: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'
});

// Use the plugin
const markets = await radiantPlugin.queries.getPositions('0x...');
```

## Supported Actions

- `lending-supply` - Supply assets to earn yield
- `lending-withdraw` - Withdraw supplied assets
- `lending-borrow` - Borrow against collateral
- `lending-repay` - Repay borrowed assets
- `lending-set-collateral` - Enable asset as collateral
- `lending-unset-collateral` - Disable asset as collateral

## Supported Assets

| Symbol | Address |
|--------|---------|
| WETH | `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1` |
| USDC | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| USDT | `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9` |
| WBTC | `0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f` |
| ARB  | `0x912CE59144191C1204E64559FE8253a0e49E6548` |

## Configuration

The plugin requires:

- `chainId`: Must be 42161 (Arbitrum One)
- `rpcUrl`: Arbitrum RPC endpoint
- `wrappedNativeToken`: Optional WETH address

## Error Handling

All operations include comprehensive error handling:

- RPC connection errors
- Contract call failures
- EVM reverts
- Input validation
- Market data validation

## Contract Addresses

- **LendingPool**: `0xE23B4AE3624fB6f7cDEF29bC8EAD912f1Ede6886`
- **DataProvider**: `0x596B0cc4c5094507C50b579a662FE7e7b094A2cC`
- **Oracle**: `0xC0cE5De939aaD880b0bdDcf9aB5750a53EDa454b`

## Integration

This plugin is automatically registered for Arbitrum chains in the Ember Plugin Registry.

```typescript
import { registerRadiant } from './radiant-lending-plugin/index.js';

// Register with chain config
registerRadiant(chainConfig, registry);
```

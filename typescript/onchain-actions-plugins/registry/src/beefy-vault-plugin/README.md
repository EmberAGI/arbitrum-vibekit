# Beefy Vault Plugin

A plugin for integrating Beefy Finance yield optimization vaults into the Arbitrum Vibekit ecosystem.

## Overview

Beefy Finance is a yield optimization protocol that automatically compounds rewards from various DeFi protocols. This plugin enables users to:

- **Deposit** tokens into Beefy vaults to earn optimized yield
- **Withdraw** tokens from Beefy vaults
- **Query** user positions across all Beefy vaults

## Supported Operations

### Supply (Deposit)

- Deposit underlying tokens (USDC, ETH, LP tokens, etc.) into Beefy vaults
- Receive mooTokens representing your vault position
- Automatic selection of highest APY vault for the token

### Withdraw

- Redeem mooTokens to withdraw underlying tokens
- Proportional withdrawal based on vault performance

### Vault Information Queries

- **getVaults**: Get all vault configurations and metadata for the current chain
- **getApyData**: Get current annual percentage yield for all vaults
- **getTvlData**: Get total value locked for all vaults in USD
- **getApyBreakdownData**: Get detailed APY breakdown including fees and compounding details
- **getFeesData**: Get fee structure for each vault (performance fees, withdrawal fees, etc.)
- **getAvailableVaults**: Get active vaults with combined APY and TVL data
- **getPositions**: View user positions across Beefy vaults with real-time balance tracking

## Supported Chains

- **Arbitrum** (Chain ID: 42161) - Primary focus
- Easily extensible to other chains supported by Beefy

## Architecture

```
beefy-vault-plugin/
├── index.ts          # Main plugin export and registration
├── adapter.ts        # Core Beefy vault interaction logic
├── dataProvider.ts   # Beefy API integration
├── types.ts          # TypeScript type definitions
├── chain.ts          # Chain configuration utilities
└── README.md         # This documentation
```

## Key Components

### BeefyAdapter

- Handles vault discovery and selection
- Manages deposit/withdrawal transactions
- Queries user positions

### BeefyDataProvider

- Integrates with Beefy Finance API
- Fetches vault data, APY, and TVL information
- Filters active vaults by chain

## API Integration

The plugin integrates with the following Beefy API endpoints:

- `GET /vaults` - Vault configurations and metadata
- `GET /apy` - Current APY for each vault
- `GET /apy/breakdown` - Detailed APY breakdown with fees and compounding info
- `GET /tvl` - Total value locked per vault
- `GET /fees` - Fee structure for each vault
- `GET /tokens/{chain}` - Supported tokens per chain

All endpoints are accessible through the plugin's query system, allowing users to retrieve comprehensive vault information without executing transactions.

## Usage Example

```typescript
// The plugin is automatically registered for Arbitrum
// Users can interact through the main agent:

// Deposit 100 USDC into best Beefy vault
'Deposit 100 USDC into a Beefy vault';

// Withdraw from vault position
'Withdraw my mooUSDC tokens from Beefy';

// Check positions
'Show my Beefy vault positions';
```

## Plugin Type

This plugin uses the **lending** plugin type with the following actions:

- `lending-supply`: Deposit tokens → receive mooTokens
- `lending-withdraw`: Redeem mooTokens → receive underlying tokens

## Integration

The plugin is automatically registered in the main plugin registry for supported chains. No additional configuration is required.

## Future Enhancements

- Support for additional chains (Polygon, BSC, etc.)
- Advanced vault filtering and selection criteria
- Integration with price oracles for USD valuations
- Vault performance analytics and notifications

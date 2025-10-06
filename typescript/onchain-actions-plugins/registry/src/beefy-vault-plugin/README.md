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

## Usage Examples

### Basic Agent Integration

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

### Developer Integration Examples

For developers building their own agents or applications, here are concrete examples of how to integrate the Beefy vault plugin:

#### 1. Plugin Initialization

```typescript
import { getBeefyVaultEmberPlugin } from './beefy-vault-plugin';

// Initialize the plugin
const beefyPlugin = await getBeefyVaultEmberPlugin({
  chainId: 42161, // Arbitrum
  rpcUrl: 'https://arb1.arbitrum.io/rpc',
  wrappedNativeToken: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
});
```

#### 2. Query Available Vaults

```typescript
// Get all active Beefy vaults on Arbitrum
const vaultsResponse = await plugin.queries.getVaults({
  chainId: '42161',
  status: 'active',
});

console.log(`Found ${vaultsResponse.vaults.length} active vaults`);
// Example output: Found 73 active vaults
```

#### 3. Find High-Yield Opportunities

```typescript
// Get APY data to find best yields
const apyData = await plugin.queries.getApyData({});

// Filter for high-yield vaults (>10% APY)
const highYieldVaults = vaultsResponse.vaults.filter(vault => {
  const apy = apyData.apyData[vault.id];
  return apy && apy > 0.1; // 10%+ APY
});

console.log(`Found ${highYieldVaults.length} high-yield opportunities`);
```

#### 4. Deposit into a Vault

```typescript
// Find deposit action
const depositAction = plugin.actions.find(action => action.type === 'vault-deposit');

// Execute deposit
const depositResult = await depositAction.callback({
  vaultId: 'curve-arb-asdcrv-v2.1',
  tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC
  amount: '1000000000', // 1000 USDC (6 decimals)
  walletAddress: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
  slippage: 0.01, // 1%
});

// Returns transaction data to execute
console.log(`Generated ${depositResult.transactions.length} transactions`);
```

#### 5. Check User Positions

```typescript
// Query user's vault positions
const userPositions = await plugin.queries.getUserVaultPositions({
  chainId: '42161',
  userAddress: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
});

console.log(`User has ${userPositions.positions.length} active positions`);
```

#### 6. Withdraw from Vault

```typescript
// Find withdraw action
const withdrawAction = plugin.actions.find(action => action.type === 'vault-withdraw');

// Execute withdrawal
const withdrawResult = await withdrawAction.callback({
  vaultId: 'curve-arb-asdcrv-v2.1',
  vaultSharesAddress: '0x0165384487d26b3bb71aE2f3e26635071b71CC25', // mooToken
  amount: '500000000000000000', // 0.5 mooTokens (18 decimals)
  walletAddress: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
  slippage: 0.01,
});
```

#### 7. Complete Agent Integration Example

```typescript
class YieldFarmingAgent {
  constructor(private beefyPlugin: BeefyVaultPlugin) {}

  async findBestYield(tokenAddress: string, minAmount: string) {
    // 1. Get available vaults
    const vaults = await this.beefyPlugin.queries.getVaults({
      chainId: '42161',
      status: 'active',
    });

    // 2. Filter vaults that accept this token
    const compatibleVaults = vaults.vaults.filter(
      vault => vault.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
    );

    // 3. Get APY data
    const apyData = await this.beefyPlugin.queries.getApyData({});

    // 4. Find highest yield
    const bestVault = compatibleVaults.reduce((best, current) => {
      const currentApy = apyData.apyData[current.id] || 0;
      const bestApy = apyData.apyData[best.id] || 0;
      return currentApy > bestApy ? current : best;
    });

    return {
      vault: bestVault,
      apy: apyData.apyData[bestVault.id],
      recommendation: `Deposit ${minAmount} into ${bestVault.name} for ${(apyData.apyData[bestVault.id] * 100).toFixed(2)}% APY`,
    };
  }

  async autoDeposit(tokenAddress: string, amount: string, userAddress: string) {
    const recommendation = await this.findBestYield(tokenAddress, amount);

    const depositAction = this.beefyPlugin.actions.find(a => a.type === 'vault-deposit');

    return await depositAction.callback({
      vaultId: recommendation.vault.id,
      tokenAddress,
      amount,
      walletAddress: userAddress,
      slippage: 0.01,
    });
  }
}

// Use in your agent
const yieldAgent = new YieldFarmingAgent(beefyPlugin);
```

#### 8. Available Query Methods

The plugin provides these query methods for comprehensive vault data:

```typescript
// Get vault configurations
const vaults = await plugin.queries.getVaults({ chainId: '42161', status: 'active' });

// Get current APY rates
const apyData = await plugin.queries.getApyData({});

// Get total value locked
const tvlData = await plugin.queries.getTvlData({});

// Get detailed APY breakdown
const apyBreakdown = await plugin.queries.getApyBreakdownData({});

// Get fee structures
const feesData = await plugin.queries.getFeesData({});

// Get user positions
const positions = await plugin.queries.getUserVaultPositions({
  chainId: '42161',
  userAddress: '0x...',
});

// Get vault performance data
const performance = await plugin.queries.getVaultPerformance({
  vaultId: 'curve-arb-asdcrv-v2.1',
  period: '30d',
});
```

These examples demonstrate how developers can integrate Beefy vault functionality into their own AI agents or applications, providing automated yield farming capabilities with comprehensive data access.

## Plugin Type

This plugin uses the **lending** plugin type with the following actions:

- `lending-supply`: Deposit tokens → receive mooTokens
- `lending-withdraw`: Redeem mooTokens → receive underlying tokens

## Integration

The plugin is automatically registered in the main plugin registry for supported chains. No additional configuration is required.

## Testing

The plugin includes comprehensive tests to ensure reliability and functionality:

### Running Tests

```bash
# From the typescript/ directory (monorepo root)
cd typescript

# Run all tests including Beefy plugin tests
pnpm test

# Run only the Beefy plugin integration tests
pnpm run test:vitest -- src/beefy-vault-plugin/test/api-integration.vitest.ts

# Run from the registry directory
cd onchain-actions-plugins/registry
pnpm test -- --run src/beefy-vault-plugin/test/api-integration.vitest.ts
```

### Test Coverage

The test suite includes:

- **API Integration Tests**: Real API calls to Beefy Finance endpoints
- **Vault Data Retrieval**: Testing vault discovery and metadata fetching
- **APY and TVL Data**: Validation of yield and liquidity data
- **Transaction Building**: Deposit and withdrawal transaction generation
- **Error Handling**: Network timeout and validation testing
- **Data Structure Validation**: Ensuring proper vault data formats

### Legacy Node.js Tests

For additional testing scenarios and comprehensive integration testing, see the remaining legacy Node.js test file:

```bash
# Run legacy test (requires building first)
pnpm build
node src/beefy-vault-plugin/test-beefy-api-queries.js
```

**Legacy Test Coverage:**

- `test-beefy-api-queries.js`: ✅ **Fully Working** - Comprehensive API endpoint testing, data consistency validation, and cross-reference verification

**Test Status Summary:**

- ✅ **Modern Vitest Tests**: All 14 tests passing with comprehensive coverage
- ✅ **Legacy API Queries Test**: Fully functional, provides valuable API endpoint validation
- ✅ **Outdated Tests Removed**: `test-beefy-plugin.js`, `test-vault-discovery.js`, `test-actions.js` removed as functionality is now covered by the modern Vitest test suite

**Recommendation**: The modern Vitest test suite provides the most reliable and comprehensive testing. The `test-beefy-api-queries.js` legacy test is still valuable for detailed API validation and cross-reference verification across all Beefy API endpoints.

For detailed testing information, see [README-TESTING.md](./README-TESTING.md).

## Future Enhancements

- Support for additional chains (Polygon, BSC, etc.)
- Advanced vault filtering and selection criteria
- Integration with price oracles for USD valuations
- Vault performance analytics and notifications

# Beefy Vault Plugin Testing Guide

This document describes the testing setup for the Beefy Vault plugin and demonstrates its full functionality.

## Test Files

### Modern Vitest Integration Tests

#### 1. `test/api-integration.vitest.ts`

Comprehensive integration test suite using Vitest framework:

- **API Integration Tests**: Real API calls to Beefy Finance endpoints
- **Vault Data Retrieval**: Testing vault discovery and metadata fetching
- **APY and TVL Data**: Validation of yield and liquidity data
- **Transaction Building**: Deposit and withdrawal transaction generation
- **Error Handling**: Network timeout and validation testing
- **Data Structure Validation**: Ensuring proper vault data formats

### Legacy Node.js Tests

#### 1. `test-vault-discovery.js`

Basic test that focuses on the vault discovery functionality:

- Tests the new `getAvailableVaults` query
- Verifies plugin structure and queries
- Shows sample vault data

#### 2. `test-actions.js`

Comprehensive test that demonstrates all plugin functionality:

- **Query Testing**: Tests both `getAvailableVaults` and `getPositions` queries
- **Action Discovery**: Shows available actions and their token mappings
- **Action Execution**: Dry-run tests of supply and withdraw actions
- **AAVE Comparison**: Side-by-side comparison with the AAVE plugin

## Running the Tests

### Modern Vitest Tests (Recommended)

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

### Legacy Node.js Tests

```bash
# Navigate to the registry directory
cd typescript/onchain-actions-plugins/registry

# Build the project first
pnpm build

# Run basic vault discovery test
node src/beefy-vault-plugin/test-vault-discovery.js

# Run comprehensive action test
node src/beefy-vault-plugin/test-actions.js
```

## Test Results Summary

### Plugin Structure

- **Name**: Beefy Vaults for 42161
- **Type**: lending
- **Actions**: 2 (supply, withdraw)
- **Queries**: 2 (getPositions, getAvailableVaults)

### Vault Discovery

- ✅ Successfully retrieves 73 active vaults on Arbitrum
- ✅ Provides detailed vault information (APY, TVL, assets, addresses)
- ✅ Exposes vault discovery as a separate query (like AAVE's `getReserves`)

### Action Functionality

- ✅ **Supply Action**: Creates approve + deposit transactions
- ✅ **Withdraw Action**: Creates withdrawal transaction
- ✅ **Token Discovery**: Maps 67 input tokens to 73 output tokens
- ✅ **Transaction Generation**: Successfully creates valid EVM transactions

### Comparison with AAVE Plugin

| Feature          | Beefy Plugin         | AAVE Plugin                          |
| ---------------- | -------------------- | ------------------------------------ |
| Actions          | 2                    | 5                                    |
| Queries          | 2                    | 1                                    |
| Action Types     | supply, withdraw     | supply, borrow, repay (2x), withdraw |
| Discovery Method | `getAvailableVaults` | `getReserves` (internal)             |

## Key Improvements Made

### 1. Vault Discovery Pattern

- **Before**: Vault discovery was embedded in action creation
- **After**: Separate `getAvailableVaults` query, following AAVE pattern
- **Benefit**: Users/agents can discover vaults independently of actions

### 2. Query System Enhancement

- Extended `LendingQueries` type to support `getAvailableVaults`
- Added vault discovery as an optional query for all lending plugins
- Maintains backward compatibility

### 3. Action Execution

- Successfully creates multi-step transactions (approve + deposit)
- Handles both underlying tokens (for supply) and mooTokens (for withdraw)
- Provides detailed transaction data for execution

## Architecture Pattern

The Beefy plugin now follows the established pattern:

1. **Discovery First**: Call `getAvailableVaults()` to see what's available
2. **Action Selection**: Choose appropriate supply/withdraw actions
3. **Token Mapping**: Use action's `inputTokens()` and `outputTokens()` methods
4. **Execution**: Call action's `callback()` method to generate transactions

This matches the AAVE pattern where discovery happens first, then actions are performed based on discovered data.

## Sample Output

```
🧪 Testing Beefy Plugin Actions & Queries...

📋 Initializing plugin registry...
✅ Found Beefy plugin: Beefy Vaults for 42161

🔍 TESTING QUERIES
✅ Retrieved 73 available vaults

⚡ TESTING ACTIONS
Found 2 available actions:
   1. lending-supply - Beefy vault deposits in chain 42161
   2. lending-withdraw - Beefy vault withdrawals in chain 42161

✅ Supply action input tokens: 67 tokens
✅ Supply action output tokens: 73 tokens

✅ Supply transaction created successfully!
📋 Transaction count: 2 (approve + deposit)

✅ Withdraw transaction created successfully!
📋 Transaction count: 1 (withdraw)

🔄 COMPARISON WITH AAVE PLUGIN
✅ Found AAVE plugin: AAVE lending for 42161
   Beefy Actions: 2, AAVE Actions: 5
   Beefy Queries: 2, AAVE Queries: 1

🎉 SUCCESS: All functionality tested!
```

## Next Steps

The Beefy plugin is now fully functional and follows the established patterns. It can be used by:

1. **AI Agents**: To discover and interact with Beefy vaults
2. **DeFi Applications**: To integrate Beefy yield farming
3. **Portfolio Managers**: To optimize yield across protocols

The plugin successfully demonstrates the vault discovery pattern and can serve as a template for other yield farming protocols.

# Radiant Strategy Pack for Vibekit Agents

A collection of automated DeFi strategies for Radiant lending protocol on Arbitrum, built as a community contribution to the Vibekit Agent Ecosystem.

## Overview

This strategy pack provides safe, automated, and composable DeFi strategies that integrate with the [Radiant Lending Plugin](../../onchain-actions-plugins/radiant/):

1. **Leveraged Looping** - Automated leverage building through supply-borrow loops
2. **Health Factor Shield** - Protection against liquidation with multi-tier response  
3. **Rewards Auto-Compounder** - Automatic reward claiming and compounding

## Architecture

The pack uses a clean abstraction layer (`RadiantClient`) that wraps the Radiant plugin, providing a unified interface for all strategies.

```
src/
  radiantClient.ts           # Core interface abstraction
  radiantFromPlugin.ts       # Adapter: plugin → client
  cli.ts                     # Command-line interface
  strategies/
    looping.ts               # Leveraged looping strategy
    shield.ts                # Health factor protection
    compound.ts              # Rewards auto-compounder
```

## Quick Start

### Installation

```bash
cd radiant-strategy-pack
npm install
```

### Setup Environment

```bash
cp .env.example .env
# Edit .env and add your PRIVATE_KEY
```

### Run Strategies

```bash
# Check current position status
npm run dev status

# Execute leveraged looping (5 loops, USDC)
npm run dev loop --token 0xaf88d065e77c8cC2239327C5EDb3A432268e5831 --loops 5

# Execute health factor protection
npm run dev shield --token 0xaf88d065e77c8cC2239327C5EDb3A432268e5831 --warn 1.35 --exit 1.20

# Execute rewards compounding
npm run dev compound --target 0xaf88d065e77c8cC2239327C5EDb3A432268e5831 --min 10
```

## Strategies

### 1. Leveraged Looping

Automates the process of building leverage by repeatedly borrowing and re-supplying assets.

**How it works:**
1. Check health factor is above minimum threshold
2. Calculate available borrow capacity  
3. Borrow a percentage of available capacity
4. Supply the borrowed amount back as collateral
5. Repeat until maxLoops reached or health factor drops

**CLI Usage:**
```bash
npm run dev loop --token 0xUSDC --loops 5 --hf 1.35 --util 9000
```

**Parameters:**
- `--token`: Token address to loop (e.g., USDC)
- `--loops`: Maximum number of borrow-supply cycles (default: 5)
- `--hf`: Minimum health factor threshold (default: 1.35)
- `--util`: Utilization rate in basis points (default: 9000 = 90%)

### 2. Health Factor Shield

Monitors and protects lending positions from liquidation with tiered response levels.

**Response Tiers:**
1. HF >= warn: No action (position is healthy)
2. HF < warn: Log warning only
3. HF < soft: Repay 10% of debt
4. HF < hard: Repay 20% of debt  
5. HF < exit: Full exit (repay all debt)

**CLI Usage:**
```bash
npm run dev shield --token 0xUSDC --warn 1.35 --soft 1.30 --hard 1.25 --exit 1.20
```

**Parameters:**
- `--token`: Token address to repay
- `--warn`: Warning threshold (default: 1.35)
- `--soft`: Soft deleverage threshold (default: 1.30)
- `--hard`: Hard deleverage threshold (default: 1.25)
- `--exit`: Full exit threshold (default: 1.20)

### 3. Rewards Auto-Compounder

Automatically claims RDNT rewards, swaps them to target asset, and re-supplies to compound yields.

**CLI Usage:**
```bash
npm run dev compound --target 0xUSDC --min 10
```

**Parameters:**
- `--target`: Token to swap rewards into
- `--min`: Minimum reward value in USD to trigger compound (default: 10)

## Integration with Radiant Plugin

This strategy pack is designed to work seamlessly with the [Radiant Lending Plugin](../../onchain-actions-plugins/radiant/). The plugin provides:

- Real-time market data fetching
- User position queries (collateral, debt, health factor)
- Transaction builders for lending operations
- Type-safe interfaces for all operations

The `radiantFromPlugin.ts` adapter creates a `RadiantClient` that wraps the plugin's functionality, allowing strategies to focus on business logic rather than protocol details.

## Development

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Add New Strategy

1. Create new strategy class in `src/strategies/`
2. Implement the strategy using `RadiantClient` interface
3. Add CLI command in `src/cli.ts`
4. Add tests in `test/`

## Safety Features

- **Health Factor Monitoring**: All strategies check health factor before operations
- **Configurable Thresholds**: Customizable risk parameters for different user preferences
- **Maximum Loop Limits**: Prevents infinite execution in looping strategies
- **Minimum Value Thresholds**: Gas optimization for reward compounding
- **Multi-tier Response**: Graduated response levels in health factor protection

## Common Token Addresses (Arbitrum One)

- **USDC**: `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`
- **USDT**: `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9`
- **WETH**: `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1`
- **ARB**: `0x912CE59144191C1204E64559FE8253a0e49E6548`

## Contributing

This is a community contribution to the Vibekit ecosystem. To contribute:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Disclaimer

These strategies involve financial risk. Always test with small amounts first and understand the risks of leveraged positions and automated trading. The authors are not responsible for any financial losses.
```typescript
import { executeLoopingLender } from './strategies/loopingLender';
import { makeRadiantClient } from './radiantFromPlugin';
import { radiantPlugin } from '@radiant/plugin';

const client = makeRadiantClient(radiantPlugin, wallet, executor);
const result = await executeLoopingLender(client, config);
console.log(result);
// { loopsExecuted: 4, stoppedReason: "HF below threshold", finalHealthFactor: 1.34 }
```

### 2. Health Factor Shield

Monitors and protects your position from liquidation with tiered response levels.

**Config:**
```typescript
{
  wallet: "0xABC",
  token: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",  // USDC
  warnHF: 1.35,        // Log warning
  softHF: 1.30,        // Small repayment
  hardHF: 1.25,        // Large repayment
  exitHF: 1.20,        // Full exit
  deleverageStepBps: 1500  // 15% repayment step
}
```

**Usage:**
```typescript
import { executeHealthFactorShield } from './strategies/healthFactorShield';

const result = await executeHealthFactorShield(client, config);
console.log(result);
// { action: "soft_deleverage", healthFactor: 1.28, amountRepaid: 150n }
```

### 3. Rewards Auto-Compounder

Automatically claims RDNT rewards, swaps to target asset, and re-supplies.

**Config:**
```typescript
{
  wallet: "0xABC",
  rewardToken: "RDNT",
  targetToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",  // USDC
  minValueUSD: 10,
  slippageBps: 50,
  intervalSec: 3600
}
```

**Usage:**
```typescript
import { executeAutoCompounder } from './strategies/autoCompounder';

const result = await executeAutoCompounder(client, config);
console.log(result);
// { action: "compound", rewardsClaimed: 100n, amountSupplied: 100n }
```

## Testing

All strategies are fully tested with mock-based unit tests using Vitest.

```bash
npm test
```

**Test Coverage:**
- Looping stops at max loops
- Looping stops when HF drops
- Shield takes appropriate action per HF level
- Compounder skips when below threshold
- Compounder executes when above threshold

## Safety Features

- Health Factor checks in all loops
- Configurable safety thresholds
- Zero-borrow rejection
- Loop limits to prevent infinite execution

## Installation

```bash
cd typescript/community/agents/radiant-strategy-pack
npm install
npm run build
```

## Quick Start (CLI)

The easiest way to use these strategies is via the command-line interface - **no coding required!**

### Setup

```bash
# Set your private key
export PRIVATE_KEY=0x...

# Optional: Set custom RPC URL
export RPC_URL=https://arb1.arbitrum.io/rpc
```

### Execute Strategies

**Leveraged Looping:**
```bash
node dist/cli.js loop \
  --token 0xaf88d065e77c8cC2239327C5EDb3A432268e5831 \
  --loops 5 \
  --hf 1.35 \
  --util 9000
```

**Health Factor Shield:**
```bash
node dist/cli.js shield \
  --token 0xaf88d065e77c8cC2239327C5EDb3A432268e5831 \
  --warn 1.35 \
  --soft 1.30 \
  --hard 1.25 \
  --exit 1.20
```

**Auto-Compounder:**
```bash
node dist/cli.js compound \
  --target 0xaf88d065e77c8cC2239327C5EDb3A432268e5831 \
  --min 10 \
  --slippage 50
```

**Show Help:**
```bash
node dist/cli.js help
```

### CLI Options

**Loop Command:**
- `--token` - Token address (required)
- `--loops` - Max loops (default: 5)
- `--hf` - Min health factor (default: 1.35)
- `--util` - Utilization in bps (default: 9000)

**Shield Command:**
- `--token` - Token address (required)
- `--warn` - Warning threshold (default: 1.35)
- `--soft` - Soft deleverage threshold (default: 1.30)
- `--hard` - Hard deleverage threshold (default: 1.25)
- `--exit` - Full exit threshold (default: 1.20)
- `--step` - Deleverage step in bps (default: 1500)

**Compound Command:**
- `--target` - Target token address (required)
- `--min` - Min value in USD (default: 10)
- `--slippage` - Slippage in bps (default: 50)

---

## Installation

## Getting Started

### Prerequisites

1. **Wallet Connection** - Connect your wallet using wagmi, ethers, or viem
2. **Radiant Plugin** - Import the Radiant plugin from `@radiant/plugin`
3. **Arbitrum Network** - Ensure you're connected to Arbitrum One (Chain ID: 42161)

### Setup

**Step 1: Connect Your Wallet**

```typescript
import { createWalletClient, custom } from 'viem';
import { arbitrum } from 'viem/chains';

// Using browser wallet (MetaMask, etc)
const walletClient = createWalletClient({
  chain: arbitrum,
  transport: custom(window.ethereum)
});

const [address] = await walletClient.getAddresses();
```

**Step 2: Create Transaction Executor**

The executor function signs and sends transactions to the blockchain:

```typescript
const executor = async (tx: { to: string; data: string; value: string | null }) => {
  const hash = await walletClient.sendTransaction({
    account: address,
    to: tx.to as `0x${string}`,
    data: tx.data as `0x${string}`,
    value: BigInt(tx.value || '0')
  });
  
  // Wait for transaction confirmation
  await walletClient.waitForTransactionReceipt({ hash });
};
```

**Step 3: Initialize Radiant Client**

```typescript
import { radiantPlugin } from '@radiant/plugin';
import { makeRadiantClient } from './radiantFromPlugin';

const client = makeRadiantClient(radiantPlugin, address, executor);
```

**Step 4: Execute Strategies**

```typescript
import { executeLoopingLender } from './strategies/loopingLender';

const result = await executeLoopingLender(client, {
  wallet: address,
  token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC
  maxLoops: 5,
  minHealthFactor: 1.35,
  utilizationBps: 9000
});

console.log(`Executed ${result.loopsExecuted} loops`);
console.log(`Final Health Factor: ${result.finalHealthFactor}`);
```

### Complete Example

```typescript
import { createWalletClient, custom } from 'viem';
import { arbitrum } from 'viem/chains';
import { radiantPlugin } from '@radiant/plugin';
import { makeRadiantClient } from './radiantFromPlugin';
import { executeLoopingLender } from './strategies/loopingLender';

async function main() {
  // 1. Connect wallet
  const walletClient = createWalletClient({
    chain: arbitrum,
    transport: custom(window.ethereum)
  });
  const [address] = await walletClient.getAddresses();

  // 2. Create executor
  const executor = async (tx) => {
    const hash = await walletClient.sendTransaction({
      account: address,
      to: tx.to,
      data: tx.data,
      value: BigInt(tx.value || '0')
    });
    await walletClient.waitForTransactionReceipt({ hash });
  };

  // 3. Initialize client
  const client = makeRadiantClient(radiantPlugin, address, executor);

  // 4. Execute strategy
  const result = await executeLoopingLender(client, {
    wallet: address,
    token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    maxLoops: 5,
    minHealthFactor: 1.35,
    utilizationBps: 9000
  });

  console.log('Strategy executed:', result);
}

main();
```

## Installation

## Contributing

This is a community contribution to the Vibekit ecosystem. Feel free to extend or modify these strategies for your needs.

## License

MIT

# Radiant Strategy Pack for Vibekit Agents

A collection of three automated DeFi strategies for Radiant lending protocol on Arbitrum, built as a community contribution to the Vibekit Agent Ecosystem.

## Overview

This strategy pack provides safe, automated, and composable DeFi strategies:

1. **Radiant Leveraged Looping Lender** - Automated leverage building through supply-borrow loops
2. **Radiant Health Factor Shield** - Protection against liquidation with multi-tier response
3. **Radiant Rewards Auto-Compounder** - Automatic reward claiming and compounding

## Architecture

The pack uses a clean abstraction layer (`RadiantClient`) that separates strategy logic from the underlying Radiant plugin implementation.

```
src/
  radiantClient.ts           # Core interface abstraction
  radiantFromPlugin.ts       # Adapter: plugin → client
  strategies/
    loopingLender.ts         # Strategy 1
    healthFactorShield.ts    # Strategy 2
    autoCompounder.ts        # Strategy 3
test/
  radiantLooping.test.ts
  healthShield.test.ts
  compounder.test.ts
  mocks/
    radiantClient.mock.ts
```

## Strategies

### 1. Leveraged Looping Lender

Automates the process of building leverage by repeatedly borrowing and re-supplying assets.

**Config:**
```typescript
{
  wallet: "0x...",
  token: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",  // USDC on Arbitrum
  maxLoops: 6,
  minHealthFactor: 1.35,
  utilizationBps: 9000  // 90%
}
```

**Usage:**
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

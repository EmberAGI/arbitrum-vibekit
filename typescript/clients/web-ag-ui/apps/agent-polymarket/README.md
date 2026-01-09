# Polymarket Arbitrage Agent

A LangGraph-based autonomous agent that monitors Polymarket prediction markets for arbitrage opportunities.

## Overview

This agent implements **intra-market arbitrage** by detecting when the sum of YES and NO token prices is less than $1.00. When this condition is met, buying both tokens guarantees a profit when the market resolves.

## Strategy

### Intra-Market Arbitrage

For each Polymarket prediction market:
- YES tokens represent betting on the outcome
- NO tokens represent betting against the outcome
- When the market resolves, winning tokens pay $1.00 each, losing tokens are worthless

**Arbitrage Condition:**
```
If: price(YES) + price(NO) < $1.00
Then: Buy both YES and NO tokens
Profit: $1.00 - (price(YES) + price(NO)) per pair of shares
```

**Example:**
- YES price: $0.45
- NO price: $0.52
- Combined: $0.97
- Guaranteed profit: $0.03 per share pair (3% return)

### Risk Considerations

- **Capital lockup**: Funds are locked until market resolution (could be days/weeks/months)
- **Slippage**: Large orders may move prices
- **Resolution risk**: Markets must resolve correctly

## Architecture

```
agent-polymarket/
├── src/
│   ├── agent.ts              # LangGraph workflow definition
│   ├── workflow/
│   │   ├── context.ts        # State types and annotations
│   │   └── nodes/            # Workflow nodes
│   │       ├── bootstrap.ts
│   │       ├── runCommand.ts
│   │       ├── hireCommand.ts
│   │       ├── fireCommand.ts
│   │       ├── syncState.ts
│   │       ├── runCycleCommand.ts
│   │       ├── pollCycle.ts
│   │       └── summarize.ts
│   └── strategy/
│       ├── scanner.ts        # Opportunity detection
│       ├── evaluator.ts      # Position sizing
│       └── executor.ts       # Trade execution
└── tests/
```

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `A2A_TEST_AGENT_NODE_PRIVATE_KEY` | - | Private key for signing orders |
| `POLY_FUNDER_ADDRESS` | - | Wallet address for trades |
| `POLY_MIN_SPREAD_THRESHOLD` | 0.02 | Minimum spread to execute (2%) |
| `POLY_MAX_POSITION_SIZE_USD` | 100 | Max USD per position |
| `POLY_PORTFOLIO_RISK_PCT` | 3 | Risk % per trade |
| `POLY_POLL_INTERVAL_MS` | 30000 | Polling interval (30s) |
| `POLYGON_RPC_URL` | polygon-rpc.com | Polygon RPC endpoint |

## Usage

### Development

```bash
# Install dependencies
pnpm install

# Start LangGraph dev server
pnpm dev

# Run tests
pnpm test:unit

# Type check
pnpm typecheck
```

### Programmatic Usage

```typescript
import { polymarketGraph, startPolymarketAgent } from './agent.js';

// Start agent with automatic cron
await startPolymarketAgent('my-thread-id');

// Or manually invoke
await polymarketGraph.invoke(
  { messages: [{ role: 'user', content: JSON.stringify({ command: 'hire' }) }] },
  { configurable: { thread_id: 'my-thread' } }
);
```

## Lifecycle

```
┌──────────┐    Hire    ┌─────────────────┐   Bootstrap   ┌─────────┐
│ Disabled │ ─────────► │ Waiting for     │ ────────────► │ Running │
│          │            │ Funds           │               │         │
└──────────┘            └─────────────────┘               └────┬────┘
                                                               │
      ┌──────────┐                ┌─────────┐    Fire     ─────┘
      │ Finished │ ◄───────────── │ Stopped │ ◄──────────
      └──────────┘                └─────────┘
```

## Commands

- `hire` - Activate the agent and start scanning
- `fire` - Stop the agent and close positions
- `sync` - Return current state
- `cycle` - Execute one arbitrage scan cycle

## API Integration

The agent integrates with Polymarket through:

- **Gamma API**: Market discovery and metadata
- **CLOB API**: Order placement and management
- **Data API**: Position and balance tracking

## References

- [Polymarket Plugin](../../../../onchain-actions-plugins/registry/src/polymarket-perpetuals-plugin/)
- [Agent CLMM Reference](../agent-clmm/)
- [Polymarket API Docs](https://docs.polymarket.com/)

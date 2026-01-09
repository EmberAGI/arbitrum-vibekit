# Polymarket Arbitrage Agent - Execution Plan

**Author:** Jay Sojitra
**Created:** January 9, 2026
**Status:** In Progress
**Last Updated:** January 9, 2026

---

## Team Feedback Summary

| Topic | Team Decision |
|-------|---------------|
| States | Map to A2A Task states (reference agent-clmm) |
| Wallet/Signing | Use MetaMask delegations (like agent-clmm) |
| Strategy | Option A (Intra-market) + LLM for cross-market matching |
| Dependencies | Use `viem` instead of `@ethersproject/wallet` |
| App Location | `apps/agent-polymarket` (follow agent-clmm pattern) |
| API Mocks | Record real API responses from Polymarket |
| PR #346 | Review and comment before merging |

---

## Phase 0: PR #346 Review

### Review Checklist

Before implementation, review PR #346 code at `/home/jay/VibeKit/new/polymarket_plugin`:

- [ ] **Code Structure**
  - [ ] Plugin follows Ember plugin conventions
  - [ ] Proper TypeScript types and interfaces
  - [ ] No `any` types used

- [ ] **Dependencies**
  - [ ] Check if `@ethersproject/wallet` can be replaced with `viem`
  - [ ] `@polymarket/clob-client` version compatibility
  - [ ] No unnecessary dependencies

- [ ] **API Integration**
  - [ ] Gamma API (market data) - correct endpoints and caching
  - [ ] CLOB API (order management) - proper order construction
  - [ ] Data API (positions) - accurate position tracking

- [ ] **Actions Implementation**
  - [ ] `perpetuals-long` (BUY YES) - correct parameters
  - [ ] `perpetuals-short` (BUY NO) - correct parameters
  - [ ] `perpetuals-close` (cancel orders) - proper cleanup

- [ ] **Queries Implementation**
  - [ ] `getMarkets()` - returns all active markets
  - [ ] `getPositions()` - returns user holdings
  - [ ] `getOrders()` - returns pending orders

- [ ] **Error Handling**
  - [ ] API errors properly caught and reported
  - [ ] Rate limiting handled
  - [ ] Network failures graceful

- [ ] **Testing**
  - [ ] Unit tests present
  - [ ] Integration tests present
  - [ ] Mock data available

### PR Review Comments to Post

```markdown
## PR #346 Review

### Positive Points
- [ ] Clean API integration
- [ ] Good type definitions
- [ ] Proper caching strategy

### Requested Changes
- [ ] Replace `@ethersproject/wallet` with `viem` for signing
- [ ] [Add other findings here]

### Questions
- [ ] [Add questions here]
```

---

## Phase 1: Plugin Setup (Est: 2-3 hours)

### 1.1 Copy and Adapt PR #346 Plugin

**Location:** `typescript/onchain-actions-plugins/registry/src/polymarket-plugin/`

- [ ] Copy plugin code from PR #346
- [ ] Replace `@ethersproject/wallet` with `viem`
- [ ] Update imports and package.json
- [ ] Verify plugin builds: `pnpm build`
- [ ] Run lint: `pnpm lint`

### 1.2 Plugin Structure

```
polymarket-plugin/
├── index.ts              # Plugin entry point
├── adapter.ts            # Core API integration
├── types.ts              # TypeScript types
├── actions/
│   ├── long.ts           # BUY YES token
│   ├── short.ts          # BUY NO token
│   └── close.ts          # Close position
├── queries/
│   ├── markets.ts        # Get active markets
│   ├── positions.ts      # Get user positions
│   └── orders.ts         # Get pending orders
└── README.md
```

### 1.3 Viem Migration

Replace ethers wallet with viem:

```typescript
// Before (ethers)
import { Wallet } from '@ethersproject/wallet';
const wallet = new Wallet(privateKey);

// After (viem)
import { privateKeyToAccount } from 'viem/accounts';
const account = privateKeyToAccount(privateKey as `0x${string}`);
```

### 1.4 Record API Mocks

- [ ] Set up mock recording script
- [ ] Record Gamma API responses (markets)
- [ ] Record CLOB API responses (orders)
- [ ] Record Data API responses (positions)
- [ ] Save mocks to `tests/mocks/data/polymarket/`

---

## Phase 2: Agent App Setup (Est: 2-3 hours)

### 2.1 Create Agent App Structure

**Location:** `typescript/clients/web-ag-ui/apps/agent-polymarket/`

- [ ] Create directory structure (copy from agent-clmm)
- [ ] Set up `package.json` with dependencies
- [ ] Create `langgraph.json` configuration
- [ ] Create `tsconfig.json`
- [ ] Set up `.env.example`

### 2.2 Directory Structure

```
apps/agent-polymarket/
├── src/
│   ├── agent.ts                  # LangGraph graph definition
│   ├── workflow/
│   │   ├── context.ts            # State annotations and types
│   │   └── nodes/
│   │       ├── bootstrap.ts      # Initialize workflow
│   │       ├── pollCycle.ts      # Main arbitrage loop
│   │       ├── hireCommand.ts    # Enable agent
│   │       ├── fireCommand.ts    # Stop agent
│   │       └── syncState.ts      # Refresh state
│   ├── strategy/
│   │   ├── scanner.ts            # Scan markets for opportunities
│   │   ├── evaluator.ts          # Evaluate profit potential
│   │   └── executor.ts           # Execute trades
│   └── clients/
│       └── polymarketApi.ts      # API client wrapper
├── tests/
│   ├── unit/
│   └── integration/
├── langgraph.json
├── package.json
├── tsconfig.json
└── .env.example
```

### 2.3 A2A Task States

Map workflow states to A2A Task states (from agent-clmm):

```typescript
// Reference: agent-clmm/src/workflow/context.ts

export type TaskState =
  | 'idle'           // Agent not running (Disabled)
  | 'input-required' // Waiting for user input
  | 'running'        // Strategy executing (Running)
  | 'paused'         // Temporarily paused
  | 'completed'      // Task finished
  | 'error';         // Error state

export type LifecycleState =
  | 'disabled'       // Not hired
  | 'waiting-funds'  // Hired, awaiting deposit
  | 'running'        // Actively trading
  | 'stopping'       // Closing positions
  | 'stopped';       // Ready for withdrawal
```

### 2.4 Environment Variables

```bash
# .env.example
# Required
OPENAI_API_KEY=sk-your-key-here
POLYGON_RPC_URL=https://polygon-rpc.com

# Agent wallet (for demo/testing only - production uses delegations)
# A2A_TEST_AGENT_NODE_PRIVATE_KEY=0x...

# Polymarket API (no auth required for public data)
# POLYMARKET_CLOB_API=https://clob.polymarket.com
# POLYMARKET_GAMMA_API=https://gamma-api.polymarket.com

# Strategy defaults
POLY_MIN_SPREAD_THRESHOLD=0.02
POLY_MAX_POSITION_SIZE_USD=100
POLY_PORTFOLIO_RISK_PCT=3
```

---

## Phase 3: Arbitrage Strategy (Est: 3-4 hours)

### 3.1 Strategy Overview

**Option A: Intra-market Arbitrage**

```
For each market:
  if (price_YES + price_NO < 1.00 - threshold):
    profit = 1.00 - (price_YES + price_NO)
    BUY both YES and NO tokens
    Hold until market resolves → guaranteed profit
```

### 3.2 Strategy Implementation (with LLM enhancement)

Based on team feedback, the strategy should:

```typescript
// strategy/scanner.ts

interface ArbitrageOpportunity {
  marketId: string;
  marketTitle: string;
  yesPrice: number;
  noPrice: number;
  spread: number;
  profitPotential: number;
  relatedMarkets?: RelatedMarket[];
}

async function scanForOpportunities(
  markets: Market[],
  llm: ChatOpenAI
): Promise<ArbitrageOpportunity[]> {
  // 1. Intra-market: Check YES + NO < 1.00
  const intraMarketOpps = markets.filter(m =>
    m.yesPrice + m.noPrice < 0.98 // 2% threshold
  );

  // 2. Cross-market: Use LLM to find related markets
  // (Future enhancement - start simple first)
  // const relatedGroups = await llm.findRelatedMarkets(markets);

  return intraMarketOpps.map(m => ({
    marketId: m.id,
    marketTitle: m.title,
    yesPrice: m.yesPrice,
    noPrice: m.noPrice,
    spread: 1.0 - (m.yesPrice + m.noPrice),
    profitPotential: calculateProfit(m),
  }));
}
```

### 3.3 Position Sizing

```typescript
// strategy/evaluator.ts

interface PositionSize {
  yesShares: number;
  noShares: number;
  totalCostUsd: number;
  expectedProfit: number;
}

function calculatePositionSize(
  opportunity: ArbitrageOpportunity,
  portfolioValue: number,
  riskPct: number = 3 // Default 3% of portfolio
): PositionSize {
  const maxRiskAmount = portfolioValue * (riskPct / 100);

  // Equal dollar investment in YES and NO
  const perSideAmount = maxRiskAmount / 2;

  const yesShares = perSideAmount / opportunity.yesPrice;
  const noShares = perSideAmount / opportunity.noPrice;

  return {
    yesShares,
    noShares,
    totalCostUsd: maxRiskAmount,
    expectedProfit: maxRiskAmount * opportunity.spread,
  };
}
```

### 3.4 Poll Cycle Node

```typescript
// workflow/nodes/pollCycle.ts

export async function pollCycleNode(
  state: PolymarketState,
  config: CopilotKitConfig
): Promise<PolymarketUpdate> {
  const iteration = (state.view.metrics?.iteration ?? 0) + 1;

  logInfo('Polling cycle begin', { iteration });

  // 1. Fetch all active markets
  const markets = await polymarketPlugin.getMarkets();

  // 2. Scan for arbitrage opportunities
  const opportunities = await scanForOpportunities(markets);

  // 3. For each opportunity
  for (const opp of opportunities) {
    if (opp.spread > state.config.minSpreadThreshold) {
      // a. Calculate position size (3% of portfolio)
      const size = calculatePositionSize(
        opp,
        state.view.portfolioValue,
        state.config.portfolioRiskPct
      );

      // b. Execute trades
      await executeArbitrage(opp, size, state);
    }
  }

  // 4. Update PnL and state
  const pnl = await calculatePnL(state);

  return {
    view: {
      metrics: { iteration, lastPoll: new Date().toISOString() },
      opportunities,
      pnl,
    },
  };
}
```

---

## Phase 4: Wallet Integration (Est: 1-2 hours)

### 4.1 MetaMask Delegations

Follow agent-clmm pattern for delegated signing:

```typescript
// Use existing delegation flow from agent-clmm
// The agent requests permission to trade on user's behalf

interface DelegationBundle {
  delegatorAddress: string;  // User's wallet
  delegateAddress: string;   // Agent's wallet
  permissions: Permission[];
  signature: string;
}

// During onboarding, request delegation for:
// - USDC spending on Polygon
// - Polymarket contract interactions
```

### 4.2 Agent Wallet Setup

```typescript
// clients/polymarketApi.ts

import { createWalletClient, http } from 'viem';
import { polygon } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

export function createAgentWallet(privateKey: string) {
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  return createWalletClient({
    account,
    chain: polygon,
    transport: http(process.env.POLYGON_RPC_URL),
  });
}
```

---

## Phase 5: Frontend Integration (Est: 1-2 hours)

### 5.1 Register Agent

**File:** `apps/web/src/config/agents.ts`

```typescript
export const AGENT_REGISTRY: Record<string, AgentConfig> = {
  // ... existing agents
  'agent-polymarket': {
    id: 'agent-polymarket',
    name: 'Polymarket Arbitrage',
    description: 'Automatically finds and executes arbitrage opportunities on Polymarket prediction markets.',
    creator: 'Ember AI Team',
    creatorVerified: true,
    avatar: '🎯',
    avatarBg: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
    isFeatured: true,
    featuredRank: 2,
  },
};
```

### 5.2 Register in CopilotKit

**File:** `apps/web/src/app/api/copilotkit/route.ts`

Add agent-polymarket to the remote agents configuration.

### 5.3 UI Components (Reuse Existing)

The existing `AgentDetailPage` component supports:
- ✅ Hire/Fire buttons
- ✅ Status display
- ✅ Metrics display
- ✅ Transaction history
- ✅ Interrupt handling (for user input)

Minimal UI changes needed - the existing components should work.

---

## Phase 6: Testing (Est: 2-3 hours)

### 6.1 Unit Tests

```
tests/
├── strategy/
│   ├── scanner.unit.test.ts
│   ├── evaluator.unit.test.ts
│   └── executor.unit.test.ts
├── workflow/
│   ├── pollCycle.unit.test.ts
│   └── context.unit.test.ts
```

### 6.2 Integration Tests

```
tests/
├── integration/
│   ├── markets.int.test.ts      # Test market fetching
│   ├── arbitrage.int.test.ts    # Test opportunity detection
│   └── workflow.int.test.ts     # Test full workflow
```

### 6.3 E2E Tests

```
tests/
├── e2e/
│   └── agent-lifecycle.e2e.test.ts  # Full hire→trade→fire cycle
```

---

## Execution Checklist

### Day 1: Setup & Plugin

- [ ] **Phase 0**: Review PR #346 and post comments
- [ ] **Phase 1.1**: Copy plugin code, update dependencies
- [ ] **Phase 1.3**: Replace ethers with viem
- [ ] **Phase 1.4**: Record API mocks

### Day 2: Agent Core

- [ ] **Phase 2.1-2.4**: Create agent app structure
- [ ] **Phase 3.1-3.2**: Implement basic scanner
- [ ] **Phase 3.3**: Implement position sizing
- [ ] **Phase 3.4**: Implement poll cycle node

### Day 3: Integration

- [ ] **Phase 4**: Wallet integration (delegations)
- [ ] **Phase 5**: Frontend registration
- [ ] **Phase 6.1**: Unit tests
- [ ] Run `pnpm lint` and `pnpm build`

### Day 4: Testing & Polish

- [ ] **Phase 6.2-6.3**: Integration and E2E tests
- [ ] End-to-end testing in browser
- [ ] Fix bugs and edge cases
- [ ] Update documentation

---

## Configuration Defaults (Option A)

```typescript
const DEFAULT_CONFIG = {
  // Minimum spread to consider (2%)
  minSpreadThreshold: 0.02,

  // Maximum position size per trade
  maxPositionSizeUsd: 100,

  // Portfolio risk per trade (3%)
  portfolioRiskPct: 3,

  // Poll interval (30 seconds)
  pollIntervalMs: 30000,

  // Maximum total exposure
  maxTotalExposureUsd: 500,
};
```

---

## Open Questions / Notes

- [ ] Confirm Polygon RPC endpoint to use
- [ ] Verify CLOB API rate limits
- [ ] Test delegation flow on Polygon
- [ ] Confirm mock recording approach

---

## Progress Log

| Date | Phase | Status | Notes |
|------|-------|--------|-------|
| 2026-01-09 | Phase 0 | Pending | PR review needed |
| | Phase 1 | Pending | |
| | Phase 2 | Pending | |
| | Phase 3 | Pending | |
| | Phase 4 | Pending | |
| | Phase 5 | Pending | |
| | Phase 6 | Pending | |

---

## References

- [Agent-CLMM Reference](../../typescript/clients/web-ag-ui/apps/agent-clmm/)
- [PR #346 - Polymarket Plugin](https://github.com/EmberAGI/arbitrum-vibekit/pull/346)
- [Polymarket API Docs](https://docs.polymarket.com/)
- [Viem Documentation](https://viem.sh/)

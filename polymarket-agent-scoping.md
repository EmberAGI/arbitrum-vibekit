# Polymarket Arbitrage Agent - Task 0 Scoping Document

**Date:** January 8, 2026
**Status:** Draft - Pending Team Review

---

## 1. Understanding and Definition of Done

### User Story

As a user, I want to deploy an automated agent that:
1. Monitors Polymarket prediction markets for arbitrage opportunities
2. Executes trades to capture those opportunities
3. Provides visibility into performance (PnL, positions, transaction history)
4. Allows me to control the agent lifecycle (enable, deposit, configure, stop, withdraw)

### Definition of "Done"

A working vertical slice where:

| Component | Deliverable |
|-----------|-------------|
| **Plugin** | Polymarket Ember plugin that fetches market data and constructs transactions for opening/adjusting/closing positions |
| **Agent Workflow** | LangGraph-based workflow that runs arbitrage strategy cycles, tracks lifecycle state, and exposes PnL/transaction history |
| **Frontend** | Web UI integration allowing users to hire/fire the agent, view positions, configure parameters, and sign transactions |

### Full User Lifecycle Flow

```
┌──────────┐    Hire    ┌─────────────────┐   Deposit   ┌─────────┐
│ Disabled │ ─────────► │ Waiting for     │ ──────────► │ Running │
│          │            │ Funds           │             │         │
└──────────┘            └─────────────────┘             └────┬────┘
                                                             │
      ┌──────────┐   Withdraw   ┌─────────┐    Stop     ─────┘
      │ Finished │ ◄─────────── │ Stopped │ ◄──────────
      └──────────┘              └─────────┘
```

**States:**
- **Disabled** - Agent not running, user on agent page
- **Waiting for Funds** - User clicked "Hire", awaiting deposit/delegation
- **Running** - Strategy cycles executing, finding and executing arbitrage
- **Stopping** - User requested stop, closing positions
- **Stopped** - Positions closed, ready for withdrawal

---

## 2. High-Level Architecture Outline

### 2.1 Polymarket Plugin (Onchain Actions)


The PR #346 plugin provides all necessary building blocks:

| API | Endpoint | Purpose |
|-----|----------|---------|
| Gamma API | `https://gamma-api.polymarket.com` | Market discovery & metadata |
| CLOB API | `https://clob.polymarket.com` | Order placement & cancellation |
| Data API | `https://data-api.polymarket.com` | User positions & balances |

**Actions Implemented:**
- `perpetuals-long` → BUY YES tokens (creates limit order via CLOB)
- `perpetuals-short` → BUY NO tokens (creates limit order via CLOB)
- `perpetuals-close` → Cancel pending orders

**Queries Implemented:**
- `getMarkets()` → Fetch active prediction markets
- `getPositions()` → Get user's YES/NO token holdings
- `getOrders()` → Get pending CLOB orders

**Key Configuration:**
```typescript
{
  funderAddress: string;      // Polygon address with USDC
  privateKey: string;         // For signing CLOB orders
  maxOrderSize: 100;          // Max shares per order
  maxOrderNotional: 500;      // Max USDC per order
}
```

**Note:** The plugin handles individual trades. **Arbitrage strategy must be in the Agent Workflow.**

### 2.2 Agent Node Workflow (WHERE ARBITRAGE STRATEGY LIVES)

**Proposed Location:** `typescript/clients/web-ag-ui/apps/agent-polymarket/`

**This is the NEW work** - the plugin provides trades, but the **arbitrage detection and execution strategy** must be built here.

**Structure** (following `agent-clmm` pattern):
```
apps/agent-polymarket/
├── src/
│   ├── agent.ts              # LangGraph graph definition
│   ├── workflow/
│   │   ├── context.ts        # State annotations and types
│   │   ├── nodes/            # Workflow nodes
│   │   │   ├── bootstrap.ts
│   │   │   ├── pollCycle.ts  # ⭐ Main arbitrage detection loop
│   │   │   ├── hireCommand.ts
│   │   │   ├── fireCommand.ts
│   │   │   └── syncState.ts
│   │   └── execution.ts      # Execute via Polymarket plugin
│   ├── strategy/             # ⭐ ARBITRAGE LOGIC (NEW)
│   │   ├── arbitrage.ts      # Detect opportunities
│   │   ├── scanner.ts        # Scan markets for mispricing
│   │   └── evaluator.ts      # Evaluate profit vs risk
│   └── domain/types.ts
├── langgraph.json
├── package.json
└── .env.example
```

**Lifecycle Operations (exposed to frontend):**
- `hire` - Enable agent, begin setup flow
- `fire` - Stop agent, close positions
- `sync` - Refresh current state
- `cycle` - Execute strategy cycle (internal, cron-driven)

**Arbitrage Strategy (pollCycle.ts) - Pseudocode:**
```
1. Fetch all active markets from plugin.getMarkets()
2. For each market:
   a. Get description/name/title
   b. If LLM matches multiple markets as being the same
      AND there's a price discrepancy
      → Opportunity found!
   c. Calculate position direction based on spread (delta)
   d. Calculate position size (3% of portfolio value)
   e. Execute plugin.createLongPosition() for YES
   f. Execute plugin.createShortPosition() for NO
3. Track positions and PnL
4. Report to frontend
```

**Read Operations:**
- Status (lifecycle state, current positions, current arbitrage signal)
- PnL (unrealized based on current prices, realized on resolution)
- Transaction history (all trades executed)
- Active opportunities (markets with detected mispricing)

**Configuration:**
- `minProfitThreshold` - Minimum spread to execute (e.g., $0.02)
- `maxPositionSize` - Max shares per arbitrage
- `maxTotalExposure` - Total capital at risk

### 2.3 Frontend Integration

**Location:** `typescript/clients/web-ag-ui/apps/web/`

**Changes needed:**
1. Add agent config to `src/config/agents.ts`
2. Register agent in `src/app/api/copilotkit/route.ts`
3. Reuse existing `AgentDetailPage` component (already supports hire/fire/sync)
4. Handle wallet signing via existing CopilotKit interrupts

---

## 3. Milestones and Estimates

| # | Milestone | Description | Estimate | Dependencies |
|---|-----------|-------------|----------|--------------|
| M1 | Plugin Setup | Create Polymarket plugin structure with market data fetching | 1 hour (if i can use PR code directly and assuming that it is working) | Team answers on PR #346 |
| M2 | Transaction Building | Implement buy/sell transaction construction via CLOB | 1-2 hours (if existing plugin works) | M1 |
| M3 | Agent Workflow Setup | Create `agent-polymarket` app with LangGraph scaffold | 3-4 hour (for intra-market arbitrage (simplest)) | - |
| M4 | Arbitrage Strategy | Implement arbitrage detection logic | 3-4 hour | M1, Team clarity on strategy type |
| M5 | Execution Integration | Wire up transaction execution with plugin | 1-2 hour | M2, M3 |
| M6 | Frontend Integration | Register agent and verify UI works | 1 hour | M3 |
| M7 | Testing & Polish | End-to-end testing and bug fixes | 2-3 hours | M5, M6 |
| M8 | Buffer/Contingency | Unexpected issues | 3-4 hours

**Total Estimate:** 12-14 hours
Estimates assume PR #346 plugin is directly usable and no major integration issues arise.

Risks that could blow the timeline:
❌ PR code needs adaptation to fit current codebase structure
❌ CLOB API authentication issues or rate limiting
❌ LangGraph state management complexity
❌ Testing reveals integration bugs
---

## 4. Risks and Unknowns

### Known Technical Constraints

1. **Chain:** Polymarket operates on **Polygon (chain ID 137)**, not Arbitrum
2. **Order Book:** Polymarket uses CLOB (Central Limit Order Book), not AMM - orders are off-chain
3. **Off-chain Signing:** Orders are signed off-chain via `@polymarket/clob-client` and submitted via REST API
4. **Settlement:** On-chain settlement occurs after market resolution (could be days/weeks/months)
5. **Capital Lockup:** Intra-market arbitrage locks capital until market resolves

### Plugin Status (from PR #346 review)

The existing PR #346 plugin provides:
- ✅ Market data fetching (Gamma API with caching)
- ✅ Position tracking (Data API with CLOB fallback)
- ✅ Order management (CLOB ledger API)
- ✅ Risk controls (maxOrderSize: 100, maxOrderNotional: $500 defaults)
- ❌ **No arbitrage strategy logic** - must be built in Agent Workflow

### Key Dependencies from PR #346

```
@polymarket/clob-client: ^4.22.8
@ethersproject/wallet: ^5.7.2
```

### Documentation Gaps Identified

- Arbitrage strategy type not specified in requirements
- Profit thresholds and position sizing not defined
- Capital lockup implications not addressed
- Exit strategy (hold vs early exit) not specified

---

## 5. Critical Questions for Team

### PR #346 and Code Base

**Q1:** PR [#346](https://github.com/EmberAGI/arbitrum-vibekit/pull/346) is not merged into the `next` branch. I've reviewed the code locally at `/home/jay/VibeKit/new/polymarket_plugin`. The plugin is **fully implemented** with:
- Market data fetching (Gamma API)
- Position tracking (Data API)
- Order management (CLOB API)
- Long/Short position creation
- Risk controls (maxOrderSize, maxOrderNotional)

**Question:** Should I:
- a) Copy the plugin code directly into the main codebase and build the agent workflow on top?
- b) Re-implement with modifications?

### Arbitrage Strategy Clarification (CRITICAL)

**Q2:** The PR #346 plugin provides **individual trade operations** (buy YES, buy NO, cancel orders). It does NOT include arbitrage detection or strategy logic. That must be implemented in the Agent Workflow.

**What type of "cross-market arbitrage" strategy should the agent implement?**

- **Option A - Intra-market arbitrage (simplest):**
  - Buy YES + NO shares when `price(YES) + price(NO) < $1.00`
  - Guaranteed profit of `$1.00 - combined_price` per share when market resolves
  - Example: If YES=$0.45, NO=$0.52, total=$0.97 → Buy both, profit $0.03/share
  - **Risk:** Capital locked until market resolution (could be months)

- **Option B - Cross-correlated market arbitrage (complex):**
  - Find mispricing between RELATED markets
  - Example: "Will Bitcoin hit $100k by Dec?" at 40% vs "Will Bitcoin hit $100k by March?" at 60%
  - **Risk:** Requires understanding market correlations, more sophisticated logic

- **Option C - Market making / spread capture:**
  - Place limit orders on both sides and capture spread
  - **Risk:** Requires inventory management, getting picked off

**Q3:** For intra-market arbitrage (Option A):
- What is the **minimum profit threshold** to execute? (e.g., $0.01, $0.03, $0.05?)
- What is the **maximum position size** per arbitrage opportunity?
- Should the agent **hold until resolution** or try to **exit early** if prices normalize?

### App Structure

**Q4:** Should I create a new app at `apps/agent-polymarket` following the `agent-clmm` pattern? (I assume yes)

### Plugin Dependencies

**Q5:** The PR #346 plugin requires:
- `@polymarket/clob-client` (^4.22.8) - Official Polymarket client
- `@ethersproject/wallet` (^5.7.2) - For signing

Are these dependencies acceptable to add to the thie below repository?
https://github.com/EmberAGI/arbitrum-vibekit/tree/next (or should i create new branch from this and implement there?)

### Credentials and Security

**Q6:** The plugin requires a `privateKey` for signing CLOB orders. In the Agent Workflow:
- Should the private key come from environment variables?
- Or should it use wallet delegation from the frontend (like agent-clmm)?
- The CLOB is **off-chain** - orders are signed and posted via REST API, not on-chain transactions

### Chain Configuration

**Q7:** Polymarket operates on **Polygon (chain ID 137)**, not Arbitrum. Does this affect:
- Any existing chain configuration?
- The overall Arbitrum-focused architecture of the project?

### Testing Approach

**Q8:** For integration tests:
- Should I record real API mocks from Polymarket's Gamma/CLOB/Data APIs?
- Are there any test/sandbox endpoints available?
- The plugin has market caching - should tests verify cache behavior?

---

## References

- **Reference Implementation:** [agent-clmm](../../typescript/clients/web-ag-ui/apps/agent-clmm/)
- **Plugin Development Guide:** [DEVELOPMENT.md](../../typescript/onchain-actions-plugins/registry/DEVELOPMENT.md)
- **Existing Polymarket Plugin PR:** [PR #346](https://github.com/EmberAGI/arbitrum-vibekit/pull/346)
- **Polymarket API Docs:** [https://docs.polymarket.com/](https://docs.polymarket.com/)
- **Polymarket CLOB Client:** [https://github.com/Polymarket/clob-client](https://github.com/Polymarket/clob-client)


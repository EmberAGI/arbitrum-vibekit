# Polymarket Agent – Complete Architecture Overview

This document provides a comprehensive overview of the Polymarket arbitrage trading agent's architecture, components, and data flow.

---

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Core Components](#core-components)
3. [Data Flow](#data-flow)
4. [Technology Stack](#technology-stack)
5. [Directory Structure](#directory-structure)
6. [Key Design Decisions](#key-design-decisions)

---

## High-Level Architecture

The Polymarket agent is a **LangGraph-based autonomous trading system** that:

1. Monitors Polymarket prediction markets for arbitrage opportunities
2. Detects logical relationships between markets using pattern matching and LLM analysis
3. Calculates position sizes based on portfolio risk and liquidity
4. Executes trades automatically (or with manual approval)
5. Tracks positions, P&L, and trading history

```
┌─────────────────────────────────────────────────────────────────┐
│                     POLYMARKET AGENT                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────┐      ┌──────────────────┐                  │
│  │  Frontend (UI)  │◄────►│  LangGraph       │                  │
│  │  - Next.js      │      │  Workflow Engine │                  │
│  │  - React        │      │                  │                  │
│  └────────────────┘      └────────┬─────────┘                  │
│                                    │                            │
│                           ┌────────▼─────────┐                 │
│                           │  Workflow Nodes   │                 │
│                           ├───────────────────┤                 │
│                           │ - Bootstrap       │                 │
│                           │ - PollCycle       │                 │
│                           │ - CheckApprovals  │                 │
│                           │ - SyncPositions   │                 │
│                           │ - Redeem          │                 │
│                           └────────┬──────────┘                 │
│                                    │                            │
│                           ┌────────▼─────────┐                 │
│                           │   Strategy Layer  │                 │
│                           ├───────────────────┤                 │
│                           │ - Scanner         │                 │
│                           │ - Evaluator       │                 │
│                           │ - Executor        │                 │
│                           │ - Detector        │                 │
│                           └────────┬──────────┘                 │
│                                    │                            │
│                           ┌────────▼─────────┐                 │
│                           │ Polymarket Client │                 │
│                           ├───────────────────┤                 │
│                           │ - Gamma API       │                 │
│                           │ - CLOB API        │                 │
│                           │ - Data API        │                 │
│                           └────────┬──────────┘                 │
│                                    │                            │
│                           ┌────────▼─────────┐                 │
│                           │   Blockchain      │                 │
│                           ├───────────────────┤                 │
│                           │ - Polygon         │                 │
│                           │ - USDC/CTF        │                 │
│                           │ - viem            │                 │
│                           └───────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. **LangGraph Workflow (`agent.ts`)**

The orchestration layer that manages agent lifecycle and state transitions.

**Key Nodes:**
- `bootstrap` - Initialize agent, load credentials
- `checkApprovals` - Verify USDC/CTF approvals
- `pollCycle` - Main trading loop (market fetch → detect → execute)
- `collectTradeApproval` - Manual trade approval flow (optional)
- `summarize` - Aggregate cycle results
- `syncPositions` - Fetch real positions from Polymarket
- `redeemPositions` - Auto-redeem resolved markets (every 10th cycle)

**Conditional Routing:**
- Post-bootstrap → checkApprovals (if running) or syncState
- Post-pollCycle → collectTradeApproval (if pending trades) or summarize
- Post-summarize → syncPositions (every 5th cycle) or redeemPositions (every 10th) or END

**State Management:**
- Uses `PolymarketStateAnnotation` with custom merge reducers
- State split into `view` (frontend-visible) and `private` (internal)
- Persisted with `MemorySaver` for thread continuity

---

### 2. **Strategy Layer**

#### **Scanner (`strategy/scanner.ts`)**

Identifies arbitrage opportunities in two modes:

**Intra-Market Arbitrage:**
- Scans each market for `yesPrice + noPrice < 1.0 - threshold`
- Filters by minimum spread (default: 2% = $0.02)
- Returns opportunities sorted by profit potential

**Cross-Market Arbitrage:**
- Calls `detectMarketRelationships()` to find logical links (IMPLIES, REQUIRES, MUTUAL_EXCLUSION, EQUIVALENCE)
- Checks each relationship for price violations
- Filters by minimum profit ($0.005/share), liquidity ($1,000), and resolution timing (max 30 days difference)

#### **Relationship Detector (`strategy/relationshipDetector.ts`)**

Detects logical relationships between markets using two methods:

**Pattern Matching (Fast, Deterministic):**
- Regex patterns for common relationships (e.g., "Trump wins Florida" → "Republican wins Florida")
- Used as fallback when LLM is disabled or times out
- ~40 predefined patterns covering politics, economics, sports, time-based events

**LLM Batch Detection (Comprehensive, Slow):**
- Sends all market pairs to OpenAI/LangChain in a single API call
- Uses structured output (Zod schema) for validation
- Timeout: 120 seconds
- Limited to `POLY_LLM_MAX_MARKETS` (default: 25) to avoid timeout
- Returns relationships with confidence scores and reasoning

**Relationship Types:**
1. **IMPLIES (A → B)**: If A happens, B must happen
   - Violation: `P(A) > P(B) + 0.01`
   - Trade: Buy NO on A, Buy YES on B

2. **REQUIRES (A ← B)**: A requires B to happen first
   - Treated like IMPLIES for pricing
   - Trade: Buy NO on parent, Buy YES on child

3. **MUTUAL_EXCLUSION (A ⊕ B)**: Both can't happen
   - Violation: `P(A) + P(B) > 1.005`
   - Trade: Buy NO on both markets

4. **EQUIVALENCE (A ↔ B)**: Same event, different phrasing
   - Violation: `|P(A) - P(B)| > 0.05`
   - Trade: Buy YES on cheaper, Buy YES on more expensive

#### **Evaluator (`strategy/evaluator.ts`)**

Calculates position sizes based on risk management:

**Intra-Market Position Sizing:**
- Budget: `min(portfolioValue * riskPct%, maxPositionSize)`
- Shares: `floor(budget / (yesPrice + noPrice))`
- Minimum shares: CLOB API `minOrderSize` or config `minShareSize` (default: 5)
- Expected profit: `shares * spread`
- ROI: `profit / totalCost`

**Cross-Market Position Sizing:**
- Cost per share: `(1 - sellPrice) + buyPrice` (both are BUY operations)
- Budget: `min(portfolioValue * riskPct%, maxPositionSize)`
- Liquidity cap: max 5% of `min(parentLiquidity, childLiquidity)`
- Slippage estimation: `(orderSize / liquidity) * 0.5`, capped at 10%
- Filters: `minProfit`, `maxSlippage` (default: 5%)

#### **Executor (`strategy/executor.ts`)**

Executes trades via Polymarket adapter:

**Intra-Market Execution:**
```typescript
adapter.createLongPosition({  // Buy YES
  marketAddress: yesTokenId,
  amount: shares.toString(),
  limitPrice: yesPrice.toString(),
  chainId: '137',
});

adapter.createShortPosition({  // Buy NO
  marketAddress: yesTokenId,
  amount: shares.toString(),
  limitPrice: noPrice.toString(),
  chainId: '137',
});
```

**Cross-Market Execution:**
```typescript
// "Sell" overpriced market = Buy opposite outcome
adapter.placeOrder({
  marketId: parentMarket.yesTokenId,
  outcomeId: oppositeOutcome,  // 'no' if selling 'yes'
  side: 'buy',
  size: shares.toString(),
  price: (1 - sellPrice).toString(),
  chainId: '137',
});

// Buy underpriced market
adapter.placeOrder({
  marketId: childMarket.yesTokenId,
  outcomeId: buyOutcome,
  side: 'buy',
  size: shares.toString(),
  price: buyPrice.toString(),
  chainId: '137',
});
```

**Order Monitoring:**
- `monitorOrderStatus()` - Poll CLOB API for order status
- `waitForOrderFill()` - Wait up to 30 seconds for fills
- Tracks: `filled`, `partially_filled`, `open`, `cancelled`

---

### 3. **Polymarket Client (`clients/polymarketClient.ts`)**

Adapter layer for Polymarket APIs:

**Gamma API (Market Discovery):**
- `getMarkets()` - Fetch active markets with pagination
- Returns: `PerpetualMarket[]` with market details, tokens, timestamps

**CLOB API (Trading):**
- `placeOrder()` - Create limit orders
- `getOrderStatus()` - Check order fill status
- `getMinOrderSize()` - Fetch minimum order requirements
- `getOrderBook()` - Get liquidity/spread data

**Data API (Analytics):**
- `getPositions()` - Fetch user positions with P&L
- `getTradingHistory()` - Fetch trade history with market details

**Price Fetching:**
- `fetchMarketPrices()` - Get best ask prices (BUY prices) from order books
- `fetchOrderBookInfo()` - Get liquidity, spread, minimum order size

**Caching:**
- Markets cached in `marketCache` to avoid redundant API calls
- Cache keyed by `yesTokenId`

---

### 4. **Approval System (`clients/approvals.ts`)**

Handles USDC and CTF (Conditional Token Framework) approvals:

**USDC Approval (EIP-2612 Permit - Gasless):**
- `generateUsdcPermitTypedData()` - Creates EIP-712 typed data for signature
- User signs with wallet (no gas)
- Backend submits permit with first trade

**CTF Approval (Standard ERC-20):**
- `generateCtfApprovalTransaction()` - Creates approval transaction
- User submits transaction (requires gas)
- Enables exchange to transfer CTF tokens

**Approval Checks:**
- `checkUsdcApproval()` - Check USDC allowance
- `checkCtfApproval()` - Check CTF approval status

---

### 5. **State Management (`workflow/context.ts`)**

Defines all state types and merge logic:

**PolymarketState Structure:**
```typescript
{
  messages: Messages[];          // LangGraph conversation history
  copilotkit: {                  // CopilotKit integration
    actions: [],
    context: [],
  },
  view: PolymarketViewState;     // Frontend-visible state
  private: PolymarketPrivateState; // Internal state (credentials, etc.)
}
```

**View State (Exposed to Frontend):**
- `lifecycleState`: 'disabled' | 'waiting-funds' | 'running' | 'stopping' | 'stopped'
- `markets`: Active markets with prices
- `opportunities`: Intra-market arbitrage opportunities
- `crossMarketOpportunities`: Cross-market arbitrage opportunities
- `detectedRelationships`: Logical relationships between markets
- `positions`: Current positions
- `userPositions`: Real positions from Polymarket Data API
- `transactionHistory`: Agent-generated trade history
- `tradingHistory`: Real trade history from Polymarket Data API
- `metrics`: Iteration count, P&L, opportunities found/executed
- `config`: Strategy configuration
- `approvalStatus`: USDC/CTF approval state

**Private State (Internal Only):**
- `walletAddress`: Backend wallet for execution
- `userWalletAddress`: Frontend wallet for approvals
- `privateKey`: Backend wallet private key
- `bootstrapped`: Initialization flag

**State Merge Logic:**
- `mergeAppendOrReplace()` - Smart array merging (append if extending, replace if new)
- `mergeViewState()` - Deep merge with custom logic for arrays
- Arrays like `transactionHistory` and `events` are appended
- Arrays like `tradingHistory` and `userPositions` are replaced (come from API, not incremental)

---

## Data Flow

### Polling Cycle Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. TRIGGER (Frontend or Cron)                                    │
│    runCommand('cycle')                                            │
└────────────────────────┬─────────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────────┐
│ 2. CHECK APPROVALS (checkApprovalsNode)                          │
│    - Check USDC permit signature                                 │
│    - Check CTF approval transaction                              │
│    - Generate typed data if needed                               │
│    - Halt if approvals missing                                   │
└────────────────────────┬─────────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────────┐
│ 3. FETCH MARKETS (pollCycleNode)                                 │
│    - Rotate offset: (currentOffset + iteration * 50) % 500       │
│    - Fetch POLY_MARKET_FETCH_LIMIT markets from Gamma            │
│    - Slice to POLY_MAX_MARKETS (default: 50)                     │
│    - For each market:                                            │
│      - Fetch prices from CLOB (yesBuyPrice, noBuyPrice)          │
│      - Fetch order book info (minOrderSize, liquidity)           │
│      - Cache market data                                         │
└────────────────────────┬─────────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────────┐
│ 4. FETCH USER DATA (Parallel)                                    │
│    - getPositions(userWalletAddress)                             │
│    - getTradingHistory(userWalletAddress, limit: 50)             │
│    - Calculate portfolioValueUsd from positions                  │
└────────────────────────┬─────────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────────┐
│ 5. INTRA-MARKET SCAN (scanner.ts)                                │
│    - For each market:                                            │
│      - Check: yesPrice + noPrice < 1.0 - minSpreadThreshold      │
│      - Create ArbitrageOpportunity if true                       │
│    - Filter by exposure, liquidity, minimum profit               │
│    - Sort by profitPotential (highest first)                     │
└────────────────────────┬─────────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────────┐
│ 6. CROSS-MARKET SCAN (scanForCrossMarketOpportunities)          │
│    A. Relationship Detection (LLM or Pattern-based)              │
│       - If LLM enabled:                                           │
│         - Limit to POLY_LLM_MAX_MARKETS (default: 25)            │
│         - detectRelationshipsByLLMBatch()                        │
│         - Single API call analyzes all pairs                     │
│         - Timeout: 120 seconds                                   │
│         - Fallback to patterns if timeout/error                  │
│       - If LLM disabled:                                          │
│         - detectRelationshipsWithPatterns()                      │
│         - Regex matching against 40+ patterns                    │
│                                                                   │
│    B. Violation Detection                                        │
│       - For each relationship:                                   │
│         - checkPriceViolation()                                  │
│         - IMPLIES/REQUIRES: P(parent) > P(child) + 0.01          │
│         - MUTUAL_EXCLUSION: P(A) + P(B) > 1.005                  │
│         - EQUIVALENCE: |P(A) - P(B)| > 0.05                      │
│                                                                   │
│    C. Filter Opportunities                                       │
│       - Minimum profit: $0.005/share                             │
│       - Minimum liquidity: $1,000 (if data available)            │
│       - Resolution timing: max 30 days difference                │
│       - Sort by expectedProfitPerShare                           │
└────────────────────────┬─────────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────────┐
│ 7. COMBINE & PRIORITIZE                                          │
│    - Merge intra + cross opportunities                           │
│    - Sort all by profit potential                                │
│    - Take top POLY_MAX_OPPORTUNITIES_PER_CYCLE (default: 3)      │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                ┌────────┴────────┐
                │                 │
         ┌──────▼──────┐   ┌──────▼──────┐
         │ Manual Mode │   │  Auto Mode  │
         └──────┬──────┘   └──────┬──────┘
                │                 │
┌───────────────▼─────────────────▼───────────────────────────────┐
│ 8A. MANUAL APPROVAL (if POLY_MANUAL_APPROVAL=true)              │
│    - Create PendingTrade[] for top 3 opportunities               │
│    - Calculate position size for each                            │
│    - Return to frontend with pendingTrades                       │
│    - Frontend shows approval modal                               │
│    - User approves/rejects                                       │
│    - If approved → continue to 8B                                │
│    - If rejected → mark as rejected, skip                        │
└──────────────────────────────────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────────┐
│ 8B. POSITION SIZING & EXECUTION                                  │
│                                                                   │
│    For Intra-Market:                                             │
│    1. calculatePositionSize()                                    │
│       - Budget = min(portfolio * risk%, maxPositionSize)         │
│       - Shares = floor(budget / (yesPrice + noPrice))            │
│       - Check: shares >= minOrderSize                            │
│    2. isPositionViable()                                         │
│       - Check: expectedProfit >= minProfit ($0.01)               │
│       - Check: ROI >= 1%                                         │
│    3. Balance check: USDC >= totalCost * 1.05                    │
│    4. executeArbitrage()                                         │
│       - adapter.createLongPosition() → YES order                 │
│       - adapter.createShortPosition() → NO order                 │
│       - Record Transaction[] with orderIds                       │
│                                                                   │
│    For Cross-Market:                                             │
│    1. calculateCrossMarketPositionSize()                         │
│       - Cost/share = (1 - sellPrice) + buyPrice                  │
│       - Budget = min(portfolio * risk%, maxPositionSize)         │
│       - Shares = floor(budget / costPerShare)                    │
│       - Liquidity cap: max 5% of min(parent, child liquidity)    │
│    2. isCrossMarketPositionViable()                              │
│       - Check: expectedProfit >= minProfit                       │
│       - Check: slippage <= maxSlippage (5%)                      │
│    3. Balance check: USDC >= netCost * 1.05                      │
│    4. executeCrossMarketArbitrage()                              │
│       - adapter.placeOrder() → Buy opposite on overpriced        │
│       - adapter.placeOrder() → Buy underpriced                   │
│       - Record Transaction[] with orderIds                       │
│                                                                   │
│    Paper Trading Mode (POLY_PAPER_TRADING=true):                │
│    - Skip actual execution                                       │
│    - Create simulated Transaction[] with status='simulated'      │
│    - Update metrics as if executed                               │
└────────────────────────┬─────────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────────┐
│ 9. SUMMARIZE (summarizeNode)                                     │
│    - Aggregate metrics (opportunitiesFound, executed, failed)    │
│    - Create status event for frontend                            │
│    - Update iteration counter                                    │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                ┌────────┴────────┐
                │                 │
         ┌──────▼──────┐   ┌──────▼──────┐
         │ Every 5th?  │   │ Every 10th? │
         └──────┬──────┘   └──────┬──────┘
                │                 │
         ┌──────▼──────┐   ┌──────▼──────┐
         │ Sync Pos    │   │ Redeem      │
         │ (optional)  │   │ (optional)  │
         └──────┬──────┘   └──────┬──────┘
                │                 │
┌───────────────▼─────────────────▼───────────────────────────────┐
│ 10A. SYNC POSITIONS (if iteration % 5 === 0)                    │
│     - getPositions(userWalletAddress)                            │
│     - Update userPositions in state                              │
│     - Calculate unrealizedPnl                                    │
└──────────────────────────────────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────────┐
│ 10B. REDEEM POSITIONS (if iteration % 10 === 0)                 │
│     - getPositions(userWalletAddress)                            │
│     - Filter: outcome != 'null' (resolved markets)               │
│     - For each resolved position:                                │
│       - adapter.redeemPosition()                                 │
│       - Convert CTF tokens → USDC                                │
└────────────────────────┬─────────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────────┐
│ 11. WAIT & LOOP (if POLY_CONTINUOUS_POLLING=true)               │
│     - Wait POLY_POLL_INTERVAL_MS (default: 30s)                  │
│     - Loop back to checkApprovals                                │
│                                                                   │
│     OR                                                            │
│                                                                   │
│     END (if continuous polling disabled)                         │
│     - Cron scheduler triggers next cycle                         │
└──────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Backend
- **LangGraph**: Workflow orchestration and state management
- **LangChain**: LLM integration for relationship detection
- **TypeScript**: Type-safe implementation
- **viem**: Ethereum interactions (signing, transactions)
- **zod**: Schema validation for API responses

### APIs
- **Polymarket Gamma API**: Market discovery, metadata
- **Polymarket CLOB API**: Order placement, order book data
- **Polymarket Data API**: Positions, trading history, analytics
- **OpenAI API**: LLM relationship detection (gpt-4o, gpt-4o-mini)

### Blockchain
- **Polygon (Chain ID 137)**: Execution layer
- **USDC**: Collateral token
- **CTF (Conditional Token Framework)**: Outcome tokens

### Frontend
- **Next.js**: React framework
- **CopilotKit**: LangGraph-to-UI integration
- **Tailwind CSS**: Styling

---

## Directory Structure

```
apps/agent-polymarket/
├── src/
│   ├── agent.ts                    # LangGraph workflow definition
│   ├── clients/
│   │   ├── polymarketClient.ts     # Polymarket API adapter
│   │   ├── approvals.ts            # USDC/CTF approval logic
│   │   └── index.ts                # Re-exports
│   ├── constants/
│   │   └── contracts.ts            # Contract addresses, ABIs
│   ├── strategy/
│   │   ├── scanner.ts              # Opportunity detection
│   │   ├── evaluator.ts            # Position sizing
│   │   ├── executor.ts             # Trade execution
│   │   ├── relationshipDetector.ts # LLM/pattern relationship detection
│   │   ├── pnl.ts                  # P&L calculation
│   │   └── index.ts                # Re-exports
│   └── workflow/
│       ├── context.ts              # State definitions, merge logic
│       └── nodes/
│           ├── bootstrap.ts        # Initialization
│           ├── checkApprovals.ts   # Approval verification
│           ├── pollCycle.ts        # Main trading loop
│           ├── summarize.ts        # Cycle summary
│           ├── syncPositions.ts    # Position sync
│           ├── redeemPositions.ts  # Auto-redemption
│           ├── runCommand.ts       # Command dispatcher
│           ├── hireCommand.ts      # Agent activation
│           ├── fireCommand.ts      # Agent deactivation
│           └── ...                 # Other nodes
├── tests/
│   └── unit/                       # Unit tests
├── scripts/                        # Dev/debug scripts
├── docs/                           # Documentation
└── package.json                    # Dependencies
```

---

## Key Design Decisions

### 1. **LangGraph for Orchestration**
- **Why**: Complex state management, conditional routing, persistence
- **Benefits**: Type-safe state, easy graph visualization, CopilotKit integration
- **Tradeoffs**: Learning curve, overhead for simple workflows

### 2. **Buy-Only Strategy (No Naked Shorting)**
- **Why**: Polymarket CLOB doesn't support selling tokens you don't own
- **Implementation**: To "sell YES at $0.75", we buy "NO at $0.25" (economically equivalent)
- **Cross-market**: Both legs are BUY operations (opposite outcome on overpriced + underpriced)

### 3. **LLM Batch Detection**
- **Why**: Detect novel relationships that patterns can't catch
- **Optimization**: Single API call for all pairs instead of O(n²) calls
- **Fallback**: Pattern matching if LLM times out or is disabled
- **Cost**: ~$0.01-0.05 per cycle (varies by market count, model)

### 4. **Offset Rotation for Market Pagination**
- **Why**: Polymarket has 1000s of markets, we can only fetch 50-100 per cycle
- **Strategy**: Rotate offset by 50 each cycle: `(offset + iteration * 50) % 500`
- **Coverage**: Cycles through first 500 most liquid markets

### 5. **Equal Shares Intra-Market Strategy**
- **Why**: Simplicity, guaranteed profit if market resolves to either outcome
- **Formula**: Buy N YES + N NO → Always collect $N, profit = N - cost
- **Alternative**: Optimal shares (proportional to prices) is more complex, marginal benefit

### 6. **Position Sizing Based on Portfolio %**
- **Why**: Risk management, Kelly Criterion principles
- **Default**: 3% of portfolio per trade
- **Protection**: Caps at `maxPositionSizeUsd` ($100), `maxTotalExposureUsd` ($500)

### 7. **Separation of View vs Private State**
- **Why**: Security (don't expose private keys to frontend), clean API
- **View State**: Safe to serialize and send to UI
- **Private State**: Stays on backend, contains credentials

### 8. **Manual Approval Mode (Optional)**
- **Why**: Regulatory compliance, user trust, learning phase
- **Implementation**: Create `PendingTrade[]`, interrupt workflow, wait for user approval
- **Default**: Disabled (auto-execute for full automation)

### 9. **Paper Trading Mode**
- **Why**: Testing, risk-free simulation, strategy validation
- **Implementation**: Skip `adapter.placeOrder()`, create simulated `Transaction[]`
- **Metrics**: Track as if real (opportunitiesExecuted, tradesExecuted)

### 10. **Every-5th Sync, Every-10th Redeem**
- **Why**: Balance freshness vs API rate limits
- **Sync**: Update positions/P&L every 5 cycles (~2.5 min if 30s interval)
- **Redeem**: Auto-redeem resolved markets every 10 cycles (~5 min)
- **Tradeoff**: Slight delay in P&L updates vs avoiding API spam

---

## Next Steps

For more detailed information, see:
- [02-strategy-deep-dive.md](./02-strategy-deep-dive.md) - Detailed strategy explanation with examples
- [03-langgraph-workflow.md](./03-langgraph-workflow.md) - LangGraph node-by-node guide
- [strategy-overview.md](./strategy-overview.md) - Quick reference for environment variables


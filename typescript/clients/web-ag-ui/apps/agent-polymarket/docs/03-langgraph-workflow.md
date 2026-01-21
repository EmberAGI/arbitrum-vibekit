# Polymarket Agent – LangGraph Workflow Guide

This document provides a comprehensive guide to the LangGraph workflow, including all nodes, edges, routing logic, and state management.

---

## Table of Contents

1. [Workflow Overview](#workflow-overview)
2. [State Management](#state-management)
3. [Graph Structure](#graph-structure)
4. [Node Reference](#node-reference)
5. [Routing Logic](#routing-logic)
6. [Execution Flows](#execution-flows)
7. [Error Handling](#error-handling)

---

## Workflow Overview

The Polymarket agent uses **LangGraph** to orchestrate a complex workflow with:
- **15 nodes** for different operations
- **Conditional routing** based on state
- **Persistent state** across cycles
- **Interrupt points** for manual approval (optional)

```
Graph Entry Point: START → runCommand
Main Loop: checkApprovals → pollCycle → summarize → (sync/redeem) → END
Command Variants: hire, fire, cycle, sync, updateApproval
```

---

## State Management

### State Schema (`PolymarketStateAnnotation`)

```typescript
{
  messages: Messages[];           // LangGraph message history
  copilotkit: {                   // CopilotKit integration
    actions: [],
    context: [],
  },
  view: PolymarketViewState;      // Frontend-visible state
  private: PolymarketPrivateState; // Backend-only state
}
```

### View State (Frontend-Visible)

Located in `state.view`, accessible to UI:

```typescript
{
  // Command & Lifecycle
  command?: string;
  task?: Task;
  lifecycleState: LifecycleState;  // 'disabled' | 'waiting-funds' | 'running' | 'stopping' | 'stopped'
  onboarding?: OnboardingState;

  // Market Data
  markets: Market[];                           // Active markets with prices
  opportunities: ArbitrageOpportunity[];       // Intra-market arbitrage
  crossMarketOpportunities: CrossMarketOpportunity[];  // Cross-market arbitrage
  detectedRelationships: MarketRelationship[]; // Logical relationships

  // Positions & History
  positions: Position[];                 // Calculated positions
  userPositions: UserPosition[];         // Real positions from Polymarket Data API
  transactionHistory: Transaction[];     // Agent-generated trades
  tradingHistory: TradingHistoryItem[];  // Real trades from Polymarket Data API
  portfolioValueUsd: number;

  // Pending Trades (Manual Approval Mode)
  pendingTrades?: PendingTrade[];

  // Metrics
  metrics: {
    iteration: number;
    lastPoll?: string;
    totalPnl: number;
    realizedPnl: number;
    unrealizedPnl: number;
    activePositions: number;
    opportunitiesFound: number;
    opportunitiesExecuted: number;
    tradesExecuted: number;
    tradesFailed: number;
  };

  // Configuration
  config: StrategyConfig;

  // Approval State
  approvalStatus?: ApprovalStatus;
  needsApprovalAmountInput?: boolean;
  requestedApprovalAmount?: string;
  forceApprovalUpdate?: boolean;
  needsUsdcPermitSignature?: boolean;
  usdcPermitTypedData?: EIP712TypedData;
  usdcPermitSignature?: PermitSignature;
  needsCtfApprovalTransaction?: boolean;
  ctfApprovalTransaction?: ApprovalTransaction;
  ctfApprovalTxHash?: string;

  // Events & Errors
  events: PolymarketEvent[];
  haltReason?: string;
  executionError?: string;
}
```

### Private State (Internal Only)

Located in `state.private`, never sent to frontend:

```typescript
{
  mode?: 'debug' | 'production';
  pollIntervalMs: number;
  cronScheduled: boolean;
  bootstrapped: boolean;
  walletAddress?: string;        // Backend wallet for execution
  userWalletAddress?: string;    // Frontend wallet for approvals
  privateKey?: string;           // Backend wallet private key
}
```

### State Merge Logic

LangGraph uses **reducers** to merge state updates:

```typescript
// Array merge: append if extending, replace if new
const mergeAppendOrReplace = <T>(left: T[], right?: T[]): T[] => {
  if (!right) return left;
  if (right.length === 0) return left;

  // Check if right extends left (first N elements match)
  if (right.length >= left.length) {
    let isPrefix = true;
    for (let i = 0; i < left.length; i++) {
      if (right[i] !== left[i]) {
        isPrefix = false;
        break;
      }
    }
    if (isPrefix) return right;  // Extension → use right
  }

  return [...left, ...right];  // New data → append
};
```

**Arrays that append**:
- `transactionHistory` (agent-generated, incremental)
- `events` (agent-generated, incremental)

**Arrays that replace**:
- `markets` (from API, complete snapshot)
- `userPositions` (from API, complete snapshot)
- `tradingHistory` (from API, complete snapshot)
- `opportunities` (recalculated each cycle)
- `crossMarketOpportunities` (recalculated each cycle)
- `detectedRelationships` (recalculated each cycle)

---

## Graph Structure

### Node List

| Node | Purpose | File |
|------|---------|------|
| `runCommand` | Dispatch commands (hire, fire, cycle, sync) | `runCommand.ts` |
| `hireCommand` | Activate agent | `hireCommand.ts` |
| `fireCommand` | Deactivate agent | `fireCommand.ts` |
| `runCycleCommand` | Start trading cycle | `runCycleCommand.ts` |
| `updateApprovalCommand` | Update approvals from Settings tab | `updateApprovalCommand.ts` |
| `syncState` | Sync state to frontend | `syncState.ts` |
| `bootstrap` | Initialize agent (load credentials, check config) | `bootstrap.ts` |
| `checkApprovals` | Verify USDC/CTF approvals | `checkApprovals.ts` |
| `collectApprovalAmount` | **(Deprecated)** Collect approval amount | `collectApprovalAmount.ts` |
| `pollCycle` | **Main trading loop** (fetch, scan, execute) | `pollCycle.ts` |
| `collectTradeApproval` | Manual trade approval flow | `collectTradeApproval.ts` |
| `summarize` | Aggregate cycle results, update metrics | `summarize.ts` |
| `syncPositions` | Fetch real positions from Polymarket | `syncPositions.ts` |
| `redeemPositions` | Auto-redeem resolved markets | `redeemPositions.ts` |
| `waitAndLoop` | Wait for poll interval, then loop | *inline* |

### Edge List

```typescript
// Entry point
START → runCommand

// Command routing (conditional)
runCommand → (hireCommand | fireCommand | runCycleCommand | updateApprovalCommand | syncState)

// Hire flow
hireCommand → bootstrap
bootstrap → (checkApprovals | syncState)  // If running → check approvals, else sync

// Fire flow
fireCommand → END

// Sync flow
syncState → END

// Cycle flow
runCycleCommand → checkApprovals
checkApprovals → pollCycle
pollCycle → (collectTradeApproval | summarize)  // If pendingTrades → approval, else summarize
collectTradeApproval → pollCycle  // After approval, resume cycle
summarize → (syncPositions | redeemPositions | waitAndLoop | END)

// Update approval flow (from Settings tab)
updateApprovalCommand → checkApprovals
checkApprovals → END  // Return approval status to frontend

// Position management
syncPositions → END
redeemPositions → END

// Continuous polling
waitAndLoop → checkApprovals  // Loop back to start of cycle
```

### Conditional Routing Functions

#### 1. `resolveCommandTarget` (from runCommand)

Routes commands to appropriate nodes:

```typescript
function resolveCommandTarget(state: PolymarketState): string {
  const command = state.view.command;

  switch (command) {
    case 'hire':
      return 'hireCommand';
    case 'fire':
      return 'fireCommand';
    case 'cycle':
      return 'runCycleCommand';
    case 'sync':
      return 'syncState';
    case 'updateApproval':
      return 'updateApprovalCommand';
    default:
      return 'syncState';  // Unknown → sync
  }
}
```

#### 2. `resolvePostBootstrap` (from bootstrap)

Decides whether to check approvals or just sync state:

```typescript
function resolvePostBootstrap(state: PolymarketState): 'checkApprovals' | 'syncState' {
  // If agent is running, check approvals before trading
  if (state.view.lifecycleState === 'running') {
    return 'checkApprovals';
  }
  // Otherwise just sync state (agent not active)
  return 'syncState';
}
```

#### 3. `resolvePostPollCycle` (from pollCycle)

Routes based on whether there are pending trades awaiting approval:

```typescript
function resolvePostPollCycle(state: PolymarketState): 'collectTradeApproval' | 'summarize' {
  // If manual approval mode and pending trades exist
  if (state.view.pendingTrades && state.view.pendingTrades.length > 0) {
    return 'collectTradeApproval';
  }
  // Otherwise summarize and end cycle
  return 'summarize';
}
```

#### 4. `resolvePostSummarize` (from summarize)

Decides post-cycle actions:

```typescript
function resolvePostSummarize(
  state: PolymarketState,
): 'syncPositions' | 'redeemPositions' | 'waitAndLoop' | typeof END {
  const syncEnabled = process.env.POLY_SYNC_POSITIONS !== 'false';
  const redeemEnabled = process.env.POLY_AUTO_REDEEM === 'true';
  const continuousPolling = process.env.POLY_CONTINUOUS_POLLING === 'true';
  const maxIterations = parseInt(process.env.POLY_MAX_ITERATIONS ?? '0', 10);

  // Sync positions every 5th cycle
  if (syncEnabled && state.view.metrics.iteration % 5 === 0) {
    return 'syncPositions';
  }

  // Redeem resolved positions every 10th cycle
  if (redeemEnabled && state.view.metrics.iteration % 10 === 0) {
    return 'redeemPositions';
  }

  // Loop back if continuous polling enabled and running
  if (
    continuousPolling &&
    state.view.lifecycleState === 'running' &&
    (maxIterations === 0 || state.view.metrics.iteration < maxIterations)
  ) {
    return 'waitAndLoop';
  }

  // Otherwise end
  return END;
}
```

---

## Node Reference

### 1. `runCommand` (Command Dispatcher)

**Purpose**: Entry point for all commands from frontend or cron.

**Input**: `state.view.command` (one of: 'hire', 'fire', 'cycle', 'sync', 'updateApproval')

**Output**: Routes to appropriate command node

**Logic**:
```typescript
export async function runCommandNode(state: PolymarketState): Promise<PolymarketUpdate> {
  const command = state.view.command ?? 'sync';

  logInfo('Running command', { command });

  // Command is read, routing handled by resolveCommandTarget
  return {};
}

export function resolveCommandTarget(state: PolymarketState): string {
  const command = state.view.command;

  if (command === 'hire') return 'hireCommand';
  if (command === 'fire') return 'fireCommand';
  if (command === 'cycle') return 'runCycleCommand';
  if (command === 'sync') return 'syncState';
  if (command === 'updateApproval') return 'updateApprovalCommand';

  return 'syncState';  // Default
}
```

---

### 2. `hireCommand` (Agent Activation)

**Purpose**: Activate the agent for trading.

**State changes**:
- `lifecycleState`: 'disabled' → 'waiting-funds' or 'running'
- `task`: Set to 'working' with message

**Logic**:
```typescript
export async function hireCommandNode(state: PolymarketState): Promise<PolymarketUpdate> {
  logInfo('Hiring agent');

  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'working',
    'Agent hired and initializing...',
  );

  return {
    view: {
      task,
      lifecycleState: 'waiting-funds',  // Will transition to 'running' after bootstrap
      events: [statusEvent],
    },
  };
}
```

**Next**: `bootstrap` (always)

---

### 3. `fireCommand` (Agent Deactivation)

**Purpose**: Stop the agent and close all positions (future enhancement).

**State changes**:
- `lifecycleState`: * → 'stopping' → 'stopped'
- `task`: Set to 'completed'

**Logic**:
```typescript
export async function fireCommandNode(state: PolymarketState): Promise<PolymarketUpdate> {
  logInfo('Firing agent');

  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'completed',
    'Agent has been stopped. Positions remain open.',
  );

  return {
    view: {
      task,
      lifecycleState: 'stopped',
      events: [statusEvent],
    },
  };
}
```

**Next**: `END` (always)

---

### 4. `bootstrap` (Initialization)

**Purpose**: Load credentials, verify config, initialize wallet.

**State changes**:
- `private.bootstrapped`: true
- `private.walletAddress`: Backend wallet address
- `private.userWalletAddress`: Frontend wallet address
- `lifecycleState`: 'waiting-funds' → 'running' (if approvals OK)

**Logic**:
```typescript
export async function bootstrapNode(state: PolymarketState): Promise<PolymarketUpdate> {
  // Skip if already bootstrapped
  if (state.private.bootstrapped) {
    return {};
  }

  // Load credentials from environment
  const privateKey = process.env.POLY_PRIVATE_KEY;
  const funderAddress = process.env.POLY_FUNDER_ADDRESS;
  const userWalletAddress = process.env.POLY_USER_WALLET_ADDRESS || funderAddress;

  if (!privateKey || !funderAddress) {
    const { task, statusEvent } = buildTaskStatus(
      state.view.task,
      'failed',
      'Missing credentials: POLY_PRIVATE_KEY or POLY_FUNDER_ADDRESS',
    );

    return {
      view: {
        task,
        lifecycleState: 'disabled',
        executionError: 'Missing credentials',
        events: [statusEvent],
      },
    };
  }

  // Derive wallet address from private key
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const walletAddress = account.address;

  logInfo('Agent bootstrapped', { walletAddress, userWalletAddress });

  return {
    view: {
      lifecycleState: 'running',
    },
    private: {
      bootstrapped: true,
      walletAddress,
      userWalletAddress,
      privateKey,
    },
  };
}
```

**Next**: `checkApprovals` (if running) or `syncState` (if not running)

---

### 5. `checkApprovals` (Approval Verification)

**Purpose**: Verify USDC permit and CTF approval before trading.

**State changes**:
- `approvalStatus`: { usdc: ..., ctf: ... }
- `needsUsdcPermitSignature`: true (if missing)
- `needsCtfApprovalTransaction`: true (if missing)
- `usdcPermitTypedData`: EIP-712 typed data for signature
- `ctfApprovalTransaction`: Transaction for user to sign

**Logic**:
```typescript
export async function checkApprovalsNode(state: PolymarketState): Promise<PolymarketUpdate> {
  const userWalletAddress = state.private.userWalletAddress;
  const requestedAmount = state.view.requestedApprovalAmount || '1000';  // Default: $1,000

  if (!userWalletAddress) {
    return {
      view: {
        haltReason: 'No user wallet address configured',
      },
    };
  }

  // Check USDC approval (EIP-2612 permit)
  const usdcStatus = await checkUsdcApproval(userWalletAddress);

  // Check CTF approval
  const ctfStatus = await checkCtfApproval(userWalletAddress);

  // If both approved, continue
  if (usdcStatus.approved && ctfStatus.approved) {
    return {
      view: {
        approvalStatus: { usdc: usdcStatus, ctf: ctfStatus },
      },
    };
  }

  // Generate USDC permit typed data if not approved
  let usdcPermitTypedData;
  if (!usdcStatus.approved || state.view.forceApprovalUpdate) {
    usdcPermitTypedData = await generateUsdcPermitTypedData(
      userWalletAddress,
      parseUnits(requestedAmount, 6),  // USDC has 6 decimals
    );
  }

  // Generate CTF approval transaction if not approved
  let ctfApprovalTransaction;
  if (!ctfStatus.approved) {
    ctfApprovalTransaction = await generateCtfApprovalTransaction(userWalletAddress);
  }

  return {
    view: {
      approvalStatus: { usdc: usdcStatus, ctf: ctfStatus },
      needsUsdcPermitSignature: !usdcStatus.approved,
      needsCtfApprovalTransaction: !ctfStatus.approved,
      usdcPermitTypedData,
      ctfApprovalTransaction,
      haltReason: 'Approvals required before trading',
    },
  };
}
```

**Next**: `pollCycle` (if from cycle) or `END` (if from updateApproval)

---

### 6. `pollCycle` (Main Trading Loop)

**Purpose**: Fetch markets, scan for opportunities, execute trades.

**See**: [Data Flow section in 01-architecture-overview.md](./01-architecture-overview.md#data-flow) for detailed flow.

**State changes**:
- `markets`: Fetched markets with prices
- `opportunities`: Intra-market arbitrage opportunities
- `crossMarketOpportunities`: Cross-market arbitrage opportunities
- `detectedRelationships`: Logical relationships
- `userPositions`: User positions from Polymarket Data API
- `tradingHistory`: Trading history from Polymarket Data API
- `portfolioValueUsd`: Calculated portfolio value
- `transactionHistory`: Append new trades
- `metrics`: Update iteration, opportunitiesFound, tradesExecuted
- `pendingTrades`: Create pending trades (if manual approval mode)

**Logic** (high-level):
```typescript
export async function pollCycleNode(state: PolymarketState): Promise<PolymarketUpdate> {
  const iteration = state.view.metrics.iteration + 1;

  // 1. Fetch markets
  const markets = await fetchMarketsFromPlugin(adapter, iteration);

  // 2. Fetch user data (positions, trading history, portfolio value)
  const [userPositions, tradingHistory] = await Promise.all([
    fetchUserPositions(adapter, userWalletAddress),
    fetchTradingHistory(adapter, userWalletAddress),
  ]);
  const portfolioValueUsd = calculatePortfolioValue(userPositions);

  // 3. Scan for opportunities
  const rawOpportunities = scanForOpportunities(markets, config);
  const opportunities = filterOpportunities(rawOpportunities, config, currentExposure);

  const { opportunities: rawCrossOpps, relationships } = await scanForCrossMarketOpportunities(
    markets,
    config,
    useLLM,
  );
  const crossOpportunities = filterCrossMarketOpportunities(rawCrossOpps, config, currentExposure);

  // 4. Combine and sort by profit
  const allOpportunities = [...opportunities, ...crossOpportunities].sort((a, b) => b.profit - a.profit);

  // 5. Manual approval mode: create pending trades
  if (manualApprovalMode && allOpportunities.length > 0) {
    const pendingTrades = createPendingTrades(allOpportunities.slice(0, 3));
    return { view: { pendingTrades, ... } };
  }

  // 6. Auto execution mode: execute trades
  const newTransactions = [];
  for (const opp of allOpportunities.slice(0, maxOpportunitiesPerCycle)) {
    const position = calculatePositionSize(opp, portfolioValueUsd, config);
    if (!isPositionViable(position)) continue;

    const result = await executeArbitrage(opp, position, adapter, iteration);
    newTransactions.push(...result.transactions);
  }

  // 7. Return updated state
  return {
    view: {
      markets,
      opportunities,
      crossMarketOpportunities: crossOpportunities,
      detectedRelationships: relationships,
      userPositions,
      tradingHistory,
      portfolioValueUsd,
      transactionHistory: newTransactions,
      metrics: { iteration, ... },
    },
  };
}
```

**Next**: `collectTradeApproval` (if pendingTrades) or `summarize`

---

### 7. `collectTradeApproval` (Manual Approval Flow)

**Purpose**: Wait for user to approve/reject pending trades.

**State changes**:
- `pendingTrades[].status`: 'pending' → 'approved' or 'rejected'
- `transactionHistory`: Append approved trades

**Logic**:
```typescript
export async function collectTradeApprovalNode(state: PolymarketState): Promise<PolymarketUpdate> {
  const pendingTrades = state.view.pendingTrades ?? [];

  // Check for expired trades
  const now = Date.now();
  const expired = pendingTrades.filter(t => new Date(t.expiresAt).getTime() < now);

  if (expired.length > 0) {
    logInfo('Pending trades expired', { count: expired.length });
    return {
      view: {
        pendingTrades: pendingTrades.map(t =>
          expired.includes(t) ? { ...t, status: 'expired' } : t
        ),
      },
    };
  }

  // Wait for user approval (frontend updates pendingTrades[].status)
  // This is an interrupt point - workflow pauses until user responds

  return {};
}
```

**Note**: This node typically **interrupts** the workflow. The frontend updates `pendingTrades[].status` and resumes the graph.

**Next**: `pollCycle` (after approval, to execute approved trades)

---

### 8. `summarize` (Cycle Summary)

**Purpose**: Aggregate cycle results, update metrics, create summary event.

**State changes**:
- `metrics`: Aggregate opportunitiesFound, tradesExecuted, etc.
- `events`: Add summary event
- `task`: Update with cycle summary

**Logic**:
```typescript
export async function summarizeNode(state: PolymarketState): Promise<PolymarketUpdate> {
  const iteration = state.view.metrics.iteration;
  const opportunitiesFound = state.view.opportunities.length + state.view.crossMarketOpportunities.length;
  const tradesExecuted = state.view.transactionHistory.filter(t => t.cycle === iteration && t.status === 'success').length;

  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'working',
    `Cycle ${iteration} complete: Found ${opportunitiesFound} opportunities, executed ${tradesExecuted} trades.`,
  );

  logInfo('Cycle summary', {
    iteration,
    opportunitiesFound,
    tradesExecuted,
  });

  return {
    view: {
      task,
      events: [statusEvent],
    },
  };
}
```

**Next**: `syncPositions` (every 5th) or `redeemPositions` (every 10th) or `waitAndLoop` (continuous) or `END`

---

### 9. `syncPositions` (Position Sync)

**Purpose**: Fetch real positions from Polymarket Data API and update state.

**State changes**:
- `userPositions`: Latest positions
- `metrics.activePositions`: Count of open positions
- `metrics.unrealizedPnl`: Calculate from positions

**Logic**:
```typescript
export async function syncPositionsNode(state: PolymarketState): Promise<PolymarketUpdate> {
  const adapter = await getAdapter();
  const userWalletAddress = state.private.userWalletAddress;

  if (!adapter || !userWalletAddress) {
    return {};
  }

  const userPositions = await adapter.getPositions(userWalletAddress);
  const unrealizedPnl = calculateUnrealizedPnl(userPositions);

  logInfo('Positions synced', {
    count: userPositions.length,
    unrealizedPnl: unrealizedPnl.toFixed(2),
  });

  return {
    view: {
      userPositions,
      metrics: {
        activePositions: userPositions.length,
        unrealizedPnl,
      },
    },
  };
}
```

**Next**: `END` (always)

---

### 10. `redeemPositions` (Auto-Redemption)

**Purpose**: Auto-redeem positions in resolved markets.

**State changes**:
- `transactionHistory`: Append redemption transactions
- `metrics.realizedPnl`: Update with redeemed profits

**Logic**:
```typescript
export async function redeemPositionsNode(state: PolymarketState): Promise<PolymarketUpdate> {
  const adapter = await getAdapter();
  const userWalletAddress = state.private.userWalletAddress;

  if (!adapter || !userWalletAddress) {
    return {};
  }

  // Get positions
  const userPositions = await adapter.getPositions(userWalletAddress);

  // Filter resolved positions (outcome != 'null')
  const resolvedPositions = userPositions.filter(p => p.outcome !== 'null');

  if (resolvedPositions.length === 0) {
    logInfo('No positions to redeem');
    return {};
  }

  logInfo('Redeeming resolved positions', { count: resolvedPositions.length });

  const transactions: Transaction[] = [];

  for (const position of resolvedPositions) {
    const result = await adapter.redeemPosition({
      marketId: position.marketId,
      tokenId: position.tokenId,
      chainId: '137',
    });

    transactions.push({
      id: uuidv7(),
      cycle: state.view.metrics.iteration,
      action: 'redeem',
      marketId: position.marketId,
      shares: parseFloat(position.size),
      price: parseFloat(position.currentPrice),
      totalCost: -parseFloat(position.value),  // Negative = redemption
      status: result.success ? 'success' : 'failed',
      timestamp: new Date().toISOString(),
      orderId: result.txHash,
    });
  }

  return {
    view: {
      transactionHistory: transactions,
    },
  };
}
```

**Next**: `END` (always)

---

### 11. `waitAndLoop` (Continuous Polling)

**Purpose**: Wait for poll interval, then loop back to checkApprovals.

**State changes**: None (just waits)

**Logic**:
```typescript
async function waitAndLoopNode(state: PolymarketState): Promise<PolymarketUpdate> {
  const pollIntervalMs = parseInt(process.env.POLY_POLL_INTERVAL_MS ?? '60000', 10);
  const intervalSec = (pollIntervalMs / 1000).toFixed(0);

  logInfo(`⏳ Waiting ${intervalSec}s before next poll cycle...`);

  await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

  logInfo('⏰ Poll interval elapsed, starting next cycle');

  return {
    view: {
      metrics: {
        lastPoll: new Date().toISOString(),
      },
    },
  };
}
```

**Next**: `checkApprovals` (always, loops back to start of cycle)

**Note**: Only reached if `POLY_CONTINUOUS_POLLING=true`. Otherwise, cycles are triggered by cron.

---

## Routing Logic

### Visual Graph Flow

```
                          ┌──────────────┐
                          │    START     │
                          └──────┬───────┘
                                 │
                          ┌──────▼───────┐
                          │  runCommand  │
                          └──────┬───────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
         ┌──────────▼─────────┐    ┌─────────▼──────────┐
         │   hireCommand      │    │  fireCommand       │
         │                    │    │                    │
         │  lifecycleState    │    │  lifecycleState    │
         │  → 'waiting-funds' │    │  → 'stopped'       │
         └──────────┬─────────┘    └─────────┬──────────┘
                    │                        │
         ┌──────────▼─────────┐              │
         │    bootstrap       │              │
         │                    │              │
         │  Load credentials  │              │
         │  Initialize wallet │              │
         │  lifecycleState    │              │
         │  → 'running'       │              │
         └──────────┬─────────┘              │
                    │                        │
            ┌───────┴────────┐               │
            │                │               │
   ┌────────▼────────┐  ┌────▼────────┐     │
   │ checkApprovals  │  │  syncState  │     │
   │                 │  │             │     │
   │ Verify USDC     │  └────┬────────┘     │
   │ Verify CTF      │       │              │
   └────────┬────────┘       │              │
            │                │              │
   ┌────────▼────────┐       │              │
   │   pollCycle     │       │              │
   │                 │       │              │
   │ Fetch markets   │       │              │
   │ Scan opps       │       │              │
   │ Execute trades  │       │              │
   └────────┬────────┘       │              │
            │                │              │
      ┌─────┴─────┐          │              │
      │           │          │              │
┌─────▼─────┐  ┌──▼─────────────┐           │
│ Manual?   │  │   summarize    │           │
│           │  │                │           │
│ Pending   │  │ Aggregate      │           │
│ Trades?   │  │ Update metrics │           │
└─────┬─────┘  └───────┬────────┘           │
      │                │                    │
      │         ┌──────┴──────┐             │
      │         │             │             │
┌─────▼─────┐ ┌─▼─────────┐ ┌─▼──────────┐ │
│ collect   │ │ syncPos   │ │ redeemPos  │ │
│ Trade     │ │ (every    │ │ (every     │ │
│ Approval  │ │  5th)     │ │  10th)     │ │
└─────┬─────┘ └─────┬─────┘ └─────┬──────┘ │
      │             │               │       │
      └─────────────┴───────────────┴───────┴─────►  END
```

### Conditional Routes Summary

| From Node | Condition | Next Node |
|-----------|-----------|-----------|
| `runCommand` | command='hire' | `hireCommand` |
| `runCommand` | command='fire' | `fireCommand` |
| `runCommand` | command='cycle' | `runCycleCommand` |
| `runCommand` | command='sync' | `syncState` |
| `runCommand` | command='updateApproval' | `updateApprovalCommand` |
| `bootstrap` | lifecycleState='running' | `checkApprovals` |
| `bootstrap` | lifecycleState!='running' | `syncState` |
| `pollCycle` | pendingTrades.length > 0 | `collectTradeApproval` |
| `pollCycle` | pendingTrades.length === 0 | `summarize` |
| `summarize` | iteration % 5 === 0 | `syncPositions` |
| `summarize` | iteration % 10 === 0 | `redeemPositions` |
| `summarize` | continuousPolling=true | `waitAndLoop` |
| `summarize` | otherwise | `END` |

---

## Execution Flows

### Flow 1: Initial Hire

```
User clicks "Hire Agent"
  ↓
Frontend: runCommand('hire')
  ↓
runCommand → hireCommand
  ↓
hireCommand: lifecycleState → 'waiting-funds'
  ↓
bootstrap: Load credentials, lifecycleState → 'running'
  ↓
checkApprovals: Check USDC permit & CTF approval
  ↓
  If missing approvals:
    - Generate typed data / transaction
    - Halt with 'Approvals required'
    - Frontend shows approval modal
  ↓
  User signs approvals
  ↓
runCommand('cycle')  [triggered by frontend or cron]
  ↓
pollCycle: Execute first cycle
```

### Flow 2: Normal Trading Cycle

```
Cron or Frontend: runCommand('cycle')
  ↓
runCycleCommand → checkApprovals
  ↓
checkApprovals: Verify approvals (skip if already approved)
  ↓
pollCycle:
  - Fetch 50 markets (rotating offset)
  - Fetch user positions & trading history
  - Scan for intra-market opportunities
  - Detect relationships (LLM or patterns)
  - Scan for cross-market opportunities
  - Combine and sort by profit
  - Execute top 3 opportunities
  ↓
summarize:
  - Update metrics
  - Create summary event
  ↓
Conditional routing:
  - If iteration % 5 === 0 → syncPositions
  - If iteration % 10 === 0 → redeemPositions
  - If continuousPolling → waitAndLoop
  - Otherwise → END
  ↓
END (or loop back via waitAndLoop)
```

### Flow 3: Manual Approval Mode

```
pollCycle:
  - Fetch markets
  - Scan opportunities
  - Create pendingTrades[] for top 3
  ↓
pollCycle → collectTradeApproval
  ↓
collectTradeApproval: Interrupt workflow
  ↓
  Frontend shows approval modal
  ↓
  User approves/rejects
  ↓
  Frontend updates pendingTrades[].status
  ↓
  Frontend resumes workflow
  ↓
collectTradeApproval → pollCycle
  ↓
pollCycle: Execute approved trades
  ↓
summarize → END
```

### Flow 4: Update Approvals (from Settings Tab)

```
User updates approval amount in Settings
  ↓
Frontend: runCommand('updateApproval')
  ↓
updateApprovalCommand → checkApprovals
  ↓
checkApprovals:
  - forceApprovalUpdate=true
  - Generate new typed data with updated amount
  ↓
END
  ↓
  Frontend receives updated approvalStatus
  ↓
  User signs new approval
```

---

## Error Handling

### Kill Switch

```typescript
if (process.env.POLY_KILL_SWITCH === 'true') {
  return {
    view: {
      lifecycleState: 'stopped',
      haltReason: 'Kill switch activated (POLY_KILL_SWITCH=true)',
    },
  };
}
```

**Usage**: Emergency stop during live trading.

### Missing Credentials

```typescript
if (!privateKey || !funderAddress) {
  return {
    view: {
      lifecycleState: 'disabled',
      executionError: 'Missing credentials: POLY_PRIVATE_KEY or POLY_FUNDER_ADDRESS',
    },
  };
}
```

**Result**: Agent stays disabled, frontend shows error.

### Missing Approvals

```typescript
if (!usdcApproved || !ctfApproved) {
  return {
    view: {
      haltReason: 'Approvals required before trading',
      needsUsdcPermitSignature: !usdcApproved,
      needsCtfApprovalTransaction: !ctfApproved,
    },
  };
}
```

**Result**: Workflow halts, frontend shows approval modal.

### Insufficient Balance

```typescript
const usdcBalance = await adapter.getUSDCBalance(walletAddress);
if (usdcBalance < requiredBalance) {
  logInfo('⚠️ Insufficient USDC balance', {
    required: requiredBalance.toFixed(2),
    available: usdcBalance.toFixed(2),
  });
  continue;  // Skip trade
}
```

**Result**: Trade skipped, cycle continues with next opportunity.

### Execution Failure

```typescript
const result = await executeArbitrage(opp, position, adapter, iteration);

if (!result.success) {
  logInfo('Trade execution failed', { error: result.error });
  metrics.tradesFailed += 1;
}
```

**Result**: Transaction marked as 'failed', metrics updated, cycle continues.

---

## Summary

### Key Concepts

1. **Command-driven**: All actions start with a command ('hire', 'fire', 'cycle', 'sync')
2. **Conditional routing**: Graph flow adapts based on state (lifecycle, pending trades, iteration count)
3. **Persistent state**: State survives across cycles via `MemorySaver`
4. **Interrupt points**: Manual approval mode pauses workflow for user input
5. **Periodic actions**: Sync every 5th, redeem every 10th, continuous polling optional

### Environment Controls

| Variable | Controls |
|----------|----------|
| `POLY_CONTINUOUS_POLLING` | Enable waitAndLoop (vs cron-driven) |
| `POLY_POLL_INTERVAL_MS` | Wait time in waitAndLoop |
| `POLY_MAX_ITERATIONS` | Limit cycles (0 = unlimited) |
| `POLY_SYNC_POSITIONS` | Enable position sync (every 5th) |
| `POLY_AUTO_REDEEM` | Enable auto-redemption (every 10th) |
| `POLY_MANUAL_APPROVAL` | Enable manual trade approval |
| `POLY_KILL_SWITCH` | Emergency stop |

---

For more information, see:
- [01-architecture-overview.md](./01-architecture-overview.md) - System architecture
- [02-strategy-deep-dive.md](./02-strategy-deep-dive.md) - Trading strategies
- [strategy-overview.md](./strategy-overview.md) - Environment variable reference

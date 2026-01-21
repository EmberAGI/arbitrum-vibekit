# Polymarket Agent – Strategy Deep Dive

This document explains the trading strategies, relationship types, position sizing, and execution logic in detail with concrete examples.

---

## Table of Contents

1. [Trading Strategies Overview](#trading-strategies-overview)
2. [Intra-Market Arbitrage](#intra-market-arbitrage)
3. [Cross-Market Arbitrage](#cross-market-arbitrage)
4. [Relationship Types Explained](#relationship-types-explained)
5. [Position Sizing Logic](#position-sizing-logic)
6. [Execution Strategy](#execution-strategy)
7. [Risk Management](#risk-management)

---

## Trading Strategies Overview

The Polymarket agent implements **two complementary arbitrage strategies**:

### 1. **Intra-Market Arbitrage** (Same Market)
- **Opportunity**: YES + NO prices sum to less than $1.00
- **Profit Source**: Market maker fees, mispricing, low liquidity
- **Execution**: Buy equal shares of YES and NO
- **Profit**: Guaranteed when market resolves (one side pays $1.00/share)

### 2. **Cross-Market Arbitrage** (Related Markets)
- **Opportunity**: Logical relationship between markets is violated by pricing
- **Profit Source**: Mispricing of correlated/dependent events
- **Execution**: Buy opposite outcome on overpriced market + buy underpriced market
- **Profit**: Realized when both markets resolve consistently with logical relationship

---

## Intra-Market Arbitrage

### How It Works

In a prediction market, **YES + NO should always sum to $1.00** (ignoring fees). If it sums to less, you can buy both outcomes and guarantee a profit.

**Example:**

Market: "Will Bitcoin hit $100k in 2025?"
- YES price: $0.48
- NO price: $0.48
- **Combined: $0.96 < $1.00**

**Action:**
- Buy 100 YES shares → Cost: $48
- Buy 100 NO shares → Cost: $48
- **Total investment: $96**

**Outcome (when market resolves):**
- If Bitcoin hits $100k → YES pays $100, NO pays $0 → **Collect $100**
- If Bitcoin doesn't hit $100k → YES pays $0, NO pays $100 → **Collect $100**

**Profit: $100 - $96 = $4** (4.2% ROI)

### Scanning Logic (`scanForOpportunities`)

```typescript
for (const market of markets) {
  const combinedPrice = market.yesPrice + market.noPrice;
  const spread = 1.0 - combinedPrice;

  // Filter: spread must exceed minimum threshold (default: 2%)
  if (spread >= config.minSpreadThreshold) {
    opportunities.push({
      marketId: market.id,
      marketTitle: market.title,
      yesPrice: market.yesPrice,
      noPrice: market.noPrice,
      spread,
      profitPotential: spread,  // Profit per $1 invested
      timestamp: now,
      minOrderSize: market.minOrderSize ?? 5,
    });
  }
}
```

### Position Sizing (`calculatePositionSize`)

```typescript
// 1. Calculate risk-adjusted budget
const maxRiskAmount = portfolioValue * (config.portfolioRiskPct / 100);
const positionBudget = Math.min(maxRiskAmount, config.maxPositionSizeUsd);

// 2. Calculate cost per share pair
const costPerPair = opportunity.yesPrice + opportunity.noPrice;

// 3. Calculate maximum shares
const maxPairs = Math.floor(positionBudget / costPerPair);

// 4. Check minimum share requirement
if (maxPairs < opportunity.minOrderSize) {
  return null;  // Can't meet Polymarket minimum
}

// 5. Calculate costs and profit
const shares = maxPairs;
const yesCostUsd = shares * opportunity.yesPrice;
const noCostUsd = shares * opportunity.noPrice;
const totalCostUsd = yesCostUsd + noCostUsd;
const expectedProfitUsd = shares * opportunity.spread;
const roi = expectedProfitUsd / totalCostUsd;
```

**Example with real numbers:**
- Portfolio value: $1,000
- Risk %: 3%
- Max position size: $100
- YES price: $0.48
- NO price: $0.48
- Min order size: 5 shares

**Calculation:**
1. Budget = min($1,000 * 3%, $100) = min($30, $100) = **$30**
2. Cost per pair = $0.48 + $0.48 = **$0.96**
3. Max pairs = floor($30 / $0.96) = floor(31.25) = **31 shares**
4. Min shares check: 31 >= 5 ✅
5. YES cost = 31 * $0.48 = **$14.88**
6. NO cost = 31 * $0.48 = **$14.88**
7. Total cost = **$29.76**
8. Expected profit = 31 * ($1.00 - $0.96) = **$1.24**
9. ROI = $1.24 / $29.76 = **4.2%**

### Execution (`executeArbitrage`)

```typescript
// Step 1: BUY YES tokens
const yesResult = await adapter.createLongPosition({
  marketAddress: opportunity.yesTokenId,
  amount: position.yesShares.toString(),
  limitPrice: opportunity.yesPrice.toString(),
  chainId: '137',
});

// Step 2: BUY NO tokens
const noResult = await adapter.createShortPosition({
  marketAddress: opportunity.yesTokenId,  // Same market!
  amount: position.noShares.toString(),
  limitPrice: opportunity.noPrice.toString(),
  chainId: '137',
});
```

### Viability Checks (`isPositionViable`)

A position is only executed if:
1. **Minimum shares**: `shares >= 1` (both YES and NO)
2. **Minimum profit**: `expectedProfit >= $0.01`
3. **Minimum ROI**: `roi >= 1%`

---

## Cross-Market Arbitrage

### How It Works

When two markets are **logically related**, their prices must respect that relationship. If they don't, there's an arbitrage opportunity.

**Example: IMPLIES Relationship**

Market A: "Bitcoin hits $100k in Q1 2025" → **P(A) = $0.60**
Market B: "Bitcoin hits $100k in 2025" → **P(B) = $0.35**

**Logical relationship**: A → B (IMPLIES)
- If Q1 happens, the full year must happen
- Therefore: P(A) should be ≤ P(B)

**Violation detected**: $0.60 > $0.35 + $0.01 (threshold)

**Strategy**:
1. Market A is **overpriced** (too optimistic about Q1)
2. Market B is **underpriced** (relative to Q1 price)

**Action**:
- **"Sell" Market A YES** (actually: buy NO at $0.40) → Spend $0.40/share
- **Buy Market B YES** at $0.35 → Spend $0.35/share
- **Total cost: $0.75/share**

**Outcome scenarios**:

| Scenario | Market A | Market B | A Outcome | B Outcome | Profit |
|----------|----------|----------|-----------|-----------|--------|
| BTC hits $100k in Q1 | YES | YES | NO loses ($-0.40) | YES wins ($+1.00) | **+$0.60** |
| BTC hits $100k in Q2-Q4 | NO | YES | NO wins ($+1.00) | YES wins ($+1.00) | **+$1.25** |
| BTC doesn't hit $100k | NO | NO | NO wins ($+1.00) | YES loses ($-0.35) | **+$0.65** |

**Expected profit** (assuming logical consistency): Varies by scenario, but **violation severity = $0.25/share**

### Scanning Logic (`scanForCrossMarketOpportunities`)

```typescript
// Step 1: Detect relationships
const relationships = await detectMarketRelationships(markets, useLLM);

// Step 2: Check each relationship for price violations
for (const relationship of relationships) {
  const opportunity = checkPriceViolation(relationship);
  if (opportunity) {
    opportunities.push(opportunity);
  }
}

// Step 3: Sort by profit potential
opportunities.sort((a, b) => b.expectedProfitPerShare - a.expectedProfitPerShare);
```

### Relationship Detection

Two methods are used:

#### 1. **Pattern Matching** (Fast, Deterministic)

Uses regex patterns to detect common relationships:

```typescript
const RELATIONSHIP_PATTERNS = [
  {
    parent: /Trump wins (.+)/i,
    child: /Republican wins (.+)/i,
    type: 'IMPLIES',
    confidence: 'high',
    description: 'Trump is Republican, so Trump winning implies Republican winning',
  },
  {
    parent: /(.+) in Q1 2025/i,
    child: /(.+) in 2025/i,
    type: 'IMPLIES',
    confidence: 'high',
    description: 'Q1 is part of 2025, so Q1 occurrence implies 2025 occurrence',
  },
  // ... 40+ patterns
];
```

**Detection process**:
1. Check if market1 matches parent pattern
2. Extract captured group (e.g., "Florida", "Bitcoin $100k")
3. Check if market2 matches child pattern with same captured group
4. If match → create `MarketRelationship`

#### 2. **LLM Batch Detection** (Comprehensive, Slow)

Sends all market pairs to OpenAI in a single API call:

```typescript
const prompt = `
Analyze the following ${markets.length} prediction markets and identify ALL logical relationships between them.

MARKETS:
0. [ID: market-1] "Trump wins Florida" - YES: $0.75
1. [ID: market-2] "Republican wins Florida" - YES: $0.72
2. [ID: market-3] "Bitcoin hits $100k in Q1 2025" - YES: $0.40
3. [ID: market-4] "Bitcoin hits $100k in 2025" - YES: $0.35
...

For EACH pair, determine if there is a logical relationship:
1. IMPLIES (A → B): If Market A happens, Market B MUST happen
2. REQUIRES (A ← B): Market A requires Market B to happen first
3. MUTUAL_EXCLUSION (A ⊕ B): Both markets cannot happen simultaneously
4. EQUIVALENCE (A ↔ B): Same event, different phrasing

Return JSON:
{
  "relationships": [
    {
      "market1Id": "market-3",
      "market2Id": "market-4",
      "hasRelationship": true,
      "relationshipType": "IMPLIES",
      "confidence": "high",
      "reasoning": "Q1 is part of 2025, so Q1 occurrence implies 2025 occurrence",
      "parentMarketId": "market-3"
    }
  ]
}
`;
```

**Benefits**:
- Detects novel relationships patterns can't catch
- Provides reasoning for transparency
- Single API call (not O(n²))

**Limitations**:
- Cost: ~$0.01-0.05 per cycle
- Timeout: 120 seconds
- Limited to `POLY_LLM_MAX_MARKETS` (default: 25)

### Position Sizing (`calculateCrossMarketPositionSize`)

```typescript
// 1. Calculate cost per share (both are BUY operations)
const sellPrice = trades.sellMarket.price;  // Overpriced market
const buyPrice = trades.buyMarket.price;    // Underpriced market
const oppositePrice = 1.0 - sellPrice;      // Complement price
const costPerShare = oppositePrice + buyPrice;

// 2. Calculate budget
const maxRiskAmount = portfolioValue * (config.portfolioRiskPct / 100);
let positionBudget = Math.min(maxRiskAmount, config.maxPositionSizeUsd);

// 3. Liquidity cap (max 5% of smallest market)
const minLiquidity = Math.min(parentMarket.liquidity, childMarket.liquidity);
const maxSharesFromLiquidity = Math.floor((minLiquidity * 0.05) / costPerShare);

// 4. Calculate shares
const maxSharesFromBudget = Math.floor(positionBudget / costPerShare);
const shares = Math.min(maxSharesFromBudget, maxSharesFromLiquidity);

// 5. Calculate costs and profit
const sellRevenueUsd = shares * oppositePrice;  // Cost of "selling"
const buyCostUsd = shares * buyPrice;
const netCostUsd = sellRevenueUsd + buyCostUsd;
const expectedProfitUsd = shares * opportunity.expectedProfitPerShare;
const roi = expectedProfitUsd / netCostUsd;
```

**Example with real numbers:**
- Portfolio value: $1,000
- Risk %: 3%
- Max position size: $100
- Sell price (Market A YES): $0.60
- Buy price (Market B YES): $0.35
- Parent liquidity: $50,000
- Child liquidity: $75,000
- Min order size: 5 shares

**Calculation:**
1. Opposite price = 1.0 - $0.60 = **$0.40**
2. Cost per share = $0.40 + $0.35 = **$0.75**
3. Budget = min($1,000 * 3%, $100) = **$30**
4. Max shares (budget) = floor($30 / $0.75) = **40 shares**
5. Max shares (liquidity) = floor($50,000 * 5% / $0.75) = floor($2,500 / $0.75) = **3,333 shares**
6. Shares = min(40, 3,333) = **40 shares**
7. Sell cost = 40 * $0.40 = **$16.00**
8. Buy cost = 40 * $0.35 = **$14.00**
9. Net cost = **$30.00**
10. Expected profit = 40 * $0.25 = **$10.00** (from $0.60 - $0.35 = $0.25 violation)
11. ROI = $10.00 / $30.00 = **33.3%**

### Execution (`executeCrossMarketArbitrage`)

```typescript
// Step 1: "Sell" overpriced market = Buy opposite outcome
const oppositeOutcome = sellOutcome === 'yes' ? 'no' : 'yes';
const oppositePrice = 1.0 - sellPrice;

const sellResult = await adapter.placeOrder({
  marketId: parentMarket.yesTokenId,
  outcomeId: oppositeOutcome,  // Buy OPPOSITE
  side: 'buy',
  size: position.shares.toString(),
  price: oppositePrice.toString(),
  chainId: '137',
});

// Step 2: Buy underpriced market
const buyResult = await adapter.placeOrder({
  marketId: childMarket.yesTokenId,
  outcomeId: buyOutcome,
  side: 'buy',
  size: position.shares.toString(),
  price: buyPrice.toString(),
  chainId: '137',
});
```

**Important**: Both legs are **BUY operations**. Polymarket doesn't support naked shorting, so we buy the opposite outcome instead.

### Viability Checks (`isCrossMarketPositionViable`)

A cross-market position is only executed if:
1. **Minimum shares**: `shares >= 1`
2. **Minimum profit**: `expectedProfit >= $0.01` (configurable via `POLY_MIN_PROFIT_USD`)
3. **Maximum slippage**: `slippage <= 5%` on both sides

---

## Relationship Types Explained

### 1. IMPLIES (A → B)

**Definition**: If A happens, B **MUST** happen.

**Price constraint**: P(A) should be ≤ P(B)

**Violation check**: `P(A) > P(B) + 0.01`

**Examples**:
- "Bitcoin hits $100k in Q1 2025" → "Bitcoin hits $100k in 2025"
- "Trump wins Florida" → "Republican wins Florida"
- "Ethereum hits $5000" → "Ethereum hits $4000"

**Trade action** (when P(A) > P(B)):
- Buy NO on A (overpriced specific market)
- Buy YES on B (underpriced general market)

**Reasoning**:
- Market A (specific event) is overpriced
- Market B (general event) is underpriced
- We bet against the specific and for the general

---

### 2. REQUIRES (A ← B)

**Definition**: A requires B to happen first (B is a prerequisite for A).

**Price constraint**: P(A) should be ≤ P(B) (same as IMPLIES!)

**Violation check**: `P(A) > P(B)`

**Examples**:
- "Candidate wins election" ← "Candidate is nominee"
- "Team wins championship" ← "Team reaches finals"
- "Bill becomes law" ← "Bill passes Senate"

**Trade action** (when P(A) > P(B)):
- Buy NO on A (parent/dependent market)
- Buy YES on B (child/prerequisite market)

**Why same trade as IMPLIES?**
- IMPLIES: A → B means "A is subset of B" → P(A) ≤ P(B)
- REQUIRES: A ← B means "A depends on B" → P(A) ≤ P(B)
- Both enforce the same price constraint!

**Semantic difference**:
- IMPLIES: Directional implication (specific → general)
- REQUIRES: Dependency relationship (dependent ← prerequisite)

---

### 3. MUTUAL_EXCLUSION (A ⊕ B)

**Definition**: Both markets **cannot happen simultaneously**.

**Price constraint**: P(A) + P(B) should be ≤ $1.00

**Violation check**: `P(A) + P(B) > 1.005`

**Examples**:
- "Democrat wins Florida" ⊕ "Republican wins Florida"
- "Bitcoin above $100k in 2025" ⊕ "Bitcoin below $50k in 2025"
- "Team A wins Super Bowl" ⊕ "Team B wins Super Bowl"

**Trade action** (when P(A) + P(B) > 1.00):
- Buy NO on A
- Buy NO on B (use `noPrice`)

**Reasoning**:
- If both markets sum to >$1.00, the market is overestimating that one will happen
- We bet AGAINST both, collecting $1.00 from whichever doesn't happen

**Note**: Implementation uses `noPrice` for child market:
```typescript
trades: {
  sellMarket: { marketId: parentId, outcome: 'yes', price: parentPrice },
  buyMarket: { marketId: childId, outcome: 'no', price: childNoPrice },
}
```

---

### 4. EQUIVALENCE (A ↔ B)

**Definition**: Same event, different phrasing or source.

**Price constraint**: P(A) should ≈ P(B) (within 5%)

**Violation check**: `|P(A) - P(B)| > 0.05`

**Examples**:
- "S&P 500 above 5000" ↔ "Stock market hits 5000"
- "ETH > $5k by 2025" ↔ "Ethereum hits $5k in 2025"
- "Biden wins 2024" ↔ "Democrats win 2024 with Biden"

**Trade action** (when prices differ):
- Buy YES on cheaper market
- Buy YES on more expensive market

**Reasoning**:
- Both markets should converge to the same price (they're the same event)
- We profit when prices converge

---

## Position Sizing Logic

### Budget Calculation

```typescript
// Step 1: Risk-based budget
const maxRiskAmount = portfolioValue * (config.portfolioRiskPct / 100);

// Step 2: Cap at maximum position size
const positionBudget = Math.min(maxRiskAmount, config.maxPositionSizeUsd);
```

**Example**:
- Portfolio: $1,000
- Risk %: 3%
- Max position: $100

**Budget = min($1,000 * 3%, $100) = min($30, $100) = $30**

### Share Calculation

#### Intra-Market
```typescript
const costPerPair = yesPrice + noPrice;
const maxPairs = Math.floor(positionBudget / costPerPair);
const shares = Math.max(maxPairs, minOrderSize);
```

#### Cross-Market
```typescript
const costPerShare = (1 - sellPrice) + buyPrice;
const maxSharesFromBudget = Math.floor(positionBudget / costPerShare);

// Liquidity cap: max 5% of smallest market liquidity
const minLiquidity = Math.min(parentLiquidity, childLiquidity);
const maxSharesFromLiquidity = Math.floor((minLiquidity * 0.05) / costPerShare);

const shares = Math.min(maxSharesFromBudget, maxSharesFromLiquidity);
```

**Liquidity protection**: Never use more than 5% of the smaller market's liquidity to avoid excessive slippage.

### Minimum Order Size

Polymarket enforces minimum order sizes (usually 5-10 shares). The agent:
1. Fetches `minOrderSize` from CLOB API for each market
2. Falls back to `config.minShareSize` (default: 5) if not available
3. Rejects positions that can't meet minimum

**Example**:
- Budget: $30
- Cost per share: $3.50
- Max shares from budget: 8
- Min order size: 10
- **Result**: Reject (can't meet minimum)

---

## Execution Strategy

### Sequential Execution for Cross-Market

Cross-market trades are executed **sequentially**, not atomically:

```typescript
// Step 1: Execute sell side (buy opposite)
const sellResult = await adapter.placeOrder({...});

if (!sellResult.success) {
  return { success: false, error: 'Sell failed' };
}

// Step 2: Execute buy side
const buyResult = await adapter.placeOrder({...});

if (!buyResult.success) {
  return { success: false, error: 'Sell succeeded but buy failed' };
}
```

**Why sequential?**
- If sell fails → Stop immediately, no capital risked
- If sell succeeds but buy fails → Exposed on one side, but collected sell premium

**Risk**: Partial execution leaves us exposed to one side of the trade. This is acceptable because:
1. We still collected the sell premium
2. The market may still resolve favorably
3. We can manually close the position later

### Order Monitoring

After placing orders, the agent can monitor fill status:

```typescript
const results = await monitorOrderStatus(transactions, adapter);

for (const result of results) {
  console.log(`Order ${result.orderId}: ${result.status}`);
  console.log(`  Filled: ${result.sizeFilled} / ${result.sizeRemaining}`);
}
```

**Order statuses**:
- `open`: Waiting for match
- `partially_filled`: Some shares filled, some remaining
- `filled`: Fully executed
- `cancelled`: Order cancelled by user or expired

### Wait for Fill (Optional)

```typescript
const allFilled = await waitForOrderFill(
  transactions,
  adapter,
  timeoutMs: 30000,      // 30 seconds
  pollIntervalMs: 5000,  // Check every 5 seconds
);

if (allFilled) {
  console.log('All orders filled!');
} else {
  console.log('Timeout or partial fill');
}
```

---

## Risk Management

### Exposure Limits

```typescript
const currentExposure = positions.reduce((sum, p) => sum + p.costBasis, 0);
const remainingCapacity = config.maxTotalExposureUsd - currentExposure;

if (remainingCapacity <= 0) {
  return [];  // Skip all opportunities
}
```

**Environment variable**: `POLY_MAX_TOTAL_EXPOSURE_USD` (default: $500)

**Bypass for testing**: `POLY_BYPASS_EXPOSURE_CHECK=true`

### Balance Checks

Before every trade, check USDC balance:

```typescript
const usdcBalance = await adapter.getUSDCBalance(walletAddress);
const requiredBalance = position.totalCostUsd * 1.05;  // 5% buffer

if (usdcBalance < requiredBalance) {
  logInfo('⚠️ Insufficient USDC balance', {
    required: requiredBalance.toFixed(2),
    available: usdcBalance.toFixed(2),
  });
  return;  // Skip trade
}
```

**Buffer**: 5% above calculated cost to cover:
- Slippage
- Fees
- Price movements between calculation and execution

### Profit Filters

**Intra-market**:
- Min profit: $0.01 (configurable via `POLY_MIN_PROFIT_USD`)
- Min ROI: 1%
- Min spread: 1% (configurable via `POLY_MIN_SPREAD_THRESHOLD`)

**Cross-market**:
- Min profit: $0.01 (same as intra)
- Min profit per share: $0.005
- Max slippage: 5% (both legs)
- Min liquidity: $1,000 per market (if data available)

### Execution Limits

**Per cycle**:
- Default: Execute top 3 opportunities
- Configurable via `POLY_MAX_OPPORTUNITIES_PER_CYCLE`
- Override: `POLY_EXECUTE_ALL_OPPORTUNITIES=true` (execute all viable)

**Reasoning**:
- Avoid over-trading and capital depletion
- Prioritize highest-quality opportunities
- Leave capacity for future cycles

### Paper Trading Mode

Test strategies risk-free:

```typescript
if (paperTradingMode) {
  logInfo('📝 PAPER TRADE', {
    market: opportunity.marketTitle,
    shares: position.shares,
    expectedProfit: position.expectedProfitUsd.toFixed(2),
  });

  // Create simulated transactions
  transactions.push({
    id: `sim-${Date.now()}`,
    status: 'simulated',
    ...
  });

  return { success: true, transactions };
}
```

**Enable with**: `POLY_PAPER_TRADING=true`

**Benefits**:
- No real capital risked
- Test strategy parameters
- Validate opportunity detection
- Track performance metrics

---

## Summary

### Intra-Market Strategy
1. Find markets where YES + NO < $1.00
2. Buy equal shares of both outcomes
3. Profit when market resolves (one pays $1.00)

### Cross-Market Strategy
1. Detect logical relationships (LLM or patterns)
2. Check for price violations
3. Buy opposite on overpriced + buy underpriced
4. Profit when markets resolve consistently

### Key Parameters

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `POLY_MIN_PROFIT_USD` | $0.01 | Minimum profit to execute |
| `POLY_MAX_POSITION_SIZE_USD` | $100 | Max capital per trade |
| `POLY_PORTFOLIO_RISK_PCT` | 3% | % of portfolio to risk |
| `POLY_MAX_TOTAL_EXPOSURE_USD` | $500 | Total capital limit |
| `POLY_MIN_SPREAD_THRESHOLD` | 0.02 | Min intra-market spread (2%) |
| `POLY_MAX_OPPORTUNITIES_PER_CYCLE` | 3 | Max trades per cycle |
| `POLY_USE_LLM_DETECTION` | false | Enable LLM relationship detection |
| `POLY_LLM_MAX_MARKETS` | 25 | Markets to send to LLM |
| `POLY_PAPER_TRADING` | false | Simulate trades without execution |

---

For implementation details, see:
- [01-architecture-overview.md](./01-architecture-overview.md) - System architecture
- [03-langgraph-workflow.md](./03-langgraph-workflow.md) - Workflow orchestration
- [strategy-overview.md](./strategy-overview.md) - Environment variable reference

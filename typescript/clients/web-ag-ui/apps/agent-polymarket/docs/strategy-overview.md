# Polymarket Agent – Strategy & Execution Overview

This doc summarizes how the Polymarket agent fetches markets, detects cross‑market arbitrage, sizes trades, and executes. It also maps the key environment variables so you know which knobs affect detection and execution.

---

## End‑to‑End Cycle (happy path)

1. **Trigger**
   - Frontend calls `runCommand('cycle')` on a schedule (UI hook `usePolymarketPolling`, driven by `NEXT_PUBLIC_POLY_POLL_INTERVAL_MS`) or the worker cron (if you run `startPolymarketAgent` with `POLY_POLL_INTERVAL_MS`).
2. **Market Fetch** (`pollCycle.ts` → `fetchMarketsFromPlugin`)
   - Offset rotation: `offset = (currentMarketOffset + iteration * 50) % 500` (uses `POLY_MARKET_OFFSET` only for initial seed).
   - Fetch up to `POLY_MARKET_FETCH_LIMIT` (default 50) from Gamma, then slice to `POLY_MAX_MARKETS` (default 50).
   - For each market: fetch prices + order book info; cache liquidity/volume if present.
3. **Positions & History**
   - Fetch positions and trading history for `userWalletAddress` (state or `POLY_FUNDER_ADDRESS`).
   - Compute `portfolioValueUsd` from positions.
4. **Intra‑Market Scan** (`scanner.ts`)
   - YES+NO < $1.00; filtered by exposure, liquidity, end date.
5. **Cross‑Market Scan** (`relationshipDetector.ts` + `scanner.ts`)
   - Detect relationships, then price‑violation check → cross‑market opportunities.
6. **Filter & Size**
   - Filters consider min profit, liquidity, exposure (`POLY_BYPASS_EXPOSURE_CHECK` can skip exposure).
   - Size trades via `evaluator.ts` (see sizing details below).
7. **Execute / Simulate**
   - Up to `POLY_MAX_OPPORTUNITIES_PER_CYCLE` unless `POLY_EXECUTE_ALL_OPPORTUNITIES=true`.
   - Paper mode (`POLY_PAPER_TRADING=true`) simulates.
8. **Update State → UI**
   - Markets, relationships, opportunities, positions, metrics, events are returned to the frontend.

---

## Market Limits & LLM Limits (important for performance)

- **Fetch limit**: `POLY_MARKET_FETCH_LIMIT` (Gamma API) → then `POLY_MAX_MARKETS` slice (both default 50).
- **LLM subset**: `POLY_LLM_MAX_MARKETS` (default 25 in your env). **Only these markets go to LLM and to the LLM fallback patterns.**
  - With LLM **enabled**, relationships & price checks use only the first `POLY_LLM_MAX_MARKETS` markets.
  - With LLM **disabled**, pattern detection uses all fetched markets (up to `POLY_MAX_MARKETS`).
- **Offset rotation**: starts at `POLY_MARKET_OFFSET` (set to 0 recommended), then increments by 50 each cycle to walk the first 500 markets.

---

## Cross‑Market Relationship Types & Trade Actions

Found in `relationshipDetector.ts`, executed in `executor.ts` (via sized positions from `evaluator.ts`):

1. **IMPLIES (A → B)**
   - Violation: `P(A) > P(B) + 0.01`.
   - Action (BUY‑only): **Buy NO on A**, **Buy YES on B**.
   - Profit source: price inversion between specific (A) and general (B) market.

2. **REQUIRES (A ← B)**
   - Treated like IMPLIES for pricing: parent overpriced vs child.
   - Action: **Buy NO on parent (overpriced)**, **Buy YES on child (underpriced)**.
   - Profit source: parent price should be ≤ child price.

3. **MUTUAL_EXCLUSION (A ⊕ B)**
   - Violation: `P(A) + P(B) > 1.005`.
   - Action (corrected): **Buy NO on both markets** (child uses `noPrice`).
   - Profit source: both can’t happen; sum should be ≤ 1.

4. **EQUIVALENCE (A ↔ B)**
   - Violation: `|P(A) - P(B)| > 0.05`.
   - Action: **Buy YES on cheaper**, **Buy YES on more expensive** (profit from convergence).
   - Profit source: equivalent events should be similarly priced.

The Relationships UI (`RelationshipsTable.tsx`) only shows validity; the trade logic above lives in `relationshipDetector.ts` + `executor.ts`.

---

## Position Sizing & Capital Allocation (`evaluator.ts`)

### Intra‑Market
- Budget per trade: `min(portfolioValue * portfolioRiskPct%, maxPositionSizeUsd)`.
- Requires min share size (`opportunity.minOrderSize` or `config.minShareSize`, default 5).
- Buys equal YES/NO shares; expected profit = shares * spread; ROI checked vs min profit/ROI.

### Cross‑Market
- Two BUY orders: opposite outcome on overpriced market + YES on underpriced market.
- Cost/share = `(1 - sellPrice) + buyPrice`.
- Budget: `min(portfolioValue * portfolioRiskPct%, maxPositionSizeUsd)`, adjusted up to meet minimum shares if wallet allows.
- Liquidity cap: won’t use >5% of min(parentLiquidity, childLiquidity).
- Requires `shares >= minOrderSize`.
- Expected profit = shares * `expectedProfitPerShare` from price violation; ROI uses total capital.
- Slippage estimated; filtered by `maxSlippage` in viability check (default 5%).

---

## Execution Controls (env)

- `POLY_MIN_PROFIT_USD` (default 0.01): gate for both intra & cross.
- `POLY_MAX_OPPORTUNITIES_PER_CYCLE` (default 3): cap executions; can be overridden by `POLY_EXECUTE_ALL_OPPORTUNITIES=true`.
- `POLY_MAX_TOTAL_EXPOSURE_USD`: blocks new trades if exposure exceeded (unless `POLY_BYPASS_EXPOSURE_CHECK=true`).
- `POLY_MIN_SPREAD_THRESHOLD`: intra spread filter.
- `POLY_MAX_POSITION_SIZE_USD`, `POLY_PORTFOLIO_RISK_PCT`: drive per‑trade budget.
- `POLY_FUNDER_ADDRESS`: wallet for balances/positions if no user wallet in state.
- `POLY_USE_LLM_DETECTION`: enable LLM detection (batch).
- `POLY_LLM_MAX_MARKETS`: markets sent to LLM (and to LLM fallback patterns).
- `POLY_LLM_MODEL`: LLM model (e.g., gpt-4o).
- `POLY_MARKET_FETCH_LIMIT`, `POLY_MAX_MARKETS`, `POLY_MARKET_OFFSET`: fetch/pagination controls.
- `POLY_BYPASS_EXPOSURE_CHECK`: testing bypass for exposure limits.
- `POLY_AUTO_REDEEM`: redemption every 10th cycle (if enabled).
- `POLY_KILL_SWITCH`: stop cycles if true.

---

## What drives number of trades per cycle?

1) Opportunities found (after filters).
2) `POLY_MAX_OPPORTUNITIES_PER_CYCLE` (unless `POLY_EXECUTE_ALL_OPPORTUNITIES=true`).
3) Viability checks (profit, ROI/slippage, min shares, liquidity, exposure unless bypassed).
4) Balance check vs USDC (with 5% buffer).

In paper mode, trades are simulated; in real mode, both legs are submitted.

---

## Data Structures that grow (watch for size/perf)

- `markets` (up to `POLY_MAX_MARKETS`).
- `detectedRelationships` (LLM subset size × pairs).
- `crossMarketOpportunities`.
- `transactionHistory` (accumulates across cycles).
- `events` (small slices per cycle).

Large cycles (many markets + LLM content) can bloat state; keeping `POLY_LLM_MAX_MARKETS` modest and fetch limits lower stabilizes cycle time and serialization.

---

## Quick knobs for stability

- Lower `POLY_LLM_MAX_MARKETS` (e.g., 12–15) to reduce LLM payload/time.
- Lower `POLY_MARKET_FETCH_LIMIT` / `POLY_MAX_MARKETS` (e.g., 25) to shrink per‑cycle data.
- Keep `POLY_MARKET_OFFSET=0` and let the rotation walk offsets automatically.
- Leave `POLY_BYPASS_EXPOSURE_CHECK=false` in production.

---

## Cross‑Market Examples (BUY‑only, from the code)

- **IMPLIES**:
  Parent: “Bitcoin hits $100k in Q1 2025” at $0.60, Child: “Bitcoin hits $100k in 2025” at $0.35.
  Violation: parent > child. Action: Buy NO on parent (pay 0.40), Buy YES on child (pay 0.35).

- **REQUIRES**:
  Parent: “Candidate wins election” at $0.70, Child: “Candidate is nominee” at $0.50.
  Violation: parent > child. Action: Buy NO on parent, Buy YES on child.

- **MUTUAL_EXCLUSION**:
  Market A: “Democrat wins Florida” $0.60, Market B: “Republican wins Florida” $0.55.
  Sum = 1.15 > 1.005. Action: Buy NO on both (use `noPrice` on child).

- **EQUIVALENCE**:
  Market A: “ETH > $5k by 2025” $0.70, Market B: “ETH hits $5k in 2025” $0.60.
  Diff = 0.10 > 0.05. Action: Buy YES on both (cheaper and more expensive) to capture convergence.

---

## UI Notes (RelationshipsTable)

- Displays relationships (type, confidence) and a simple price validity badge (Valid/Violation) using fixed thresholds (UI-only). It does **not** drive execution; execution logic is in `relationshipDetector.ts` + `executor.ts`.

---

## File Pointers

- **Poll loop & orchestration**: `workflow/nodes/pollCycle.ts`
- **Market fetch & adapter**: `clients/polymarketClient.ts`
- **Relationship detection** (LLM + patterns + violation checks): `strategy/relationshipDetector.ts`
- **Opportunity filtering**: `strategy/scanner.ts`
- **Sizing & viability**: `strategy/evaluator.ts`
- **Execution**: `strategy/executor.ts`
- **UI relationships table**: `web/src/components/polymarket/RelationshipsTable.tsx`


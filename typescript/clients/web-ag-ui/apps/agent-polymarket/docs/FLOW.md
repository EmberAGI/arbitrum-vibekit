# Polymarket Agent - User Flow & Frontend Integration

## Overview

The Polymarket Arbitrage Agent is an automated trading bot that monitors prediction markets for **intra-market arbitrage opportunities**. When YES + NO token prices sum to less than $1.00, the agent can buy both tokens to guarantee profit when the market resolves.

---

## User Flow

### Phase 1: Discovery (Pre-Hire)

```
┌─────────────────────────────────────────────────────────────────┐
│                    AGENT DISCOVERY PAGE                          │
├─────────────────────────────────────────────────────────────────┤
│  🎯 Polymarket Arbitrage                                         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                             │
│                                                                   │
│  Agent Stats:                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ AUM      │ │ APY      │ │ Users    │ │ Income   │            │
│  │ $50,000  │ │ 12.5%    │ │ 150      │ │ $2,500   │            │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
│                                                                   │
│  Network: Polygon                                                 │
│  Protocol: Polymarket CLOB                                        │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Live Market Preview (no wallet required)                     │ │
│  ├─────────────────────────────────────────────────────────────┤ │
│  │ Market                          │ YES   │ NO    │ Spread   │ │
│  │ Will X happen by Dec 2025?      │ $0.45 │ $0.52 │ 3% 🔥    │ │
│  │ Will Y reach 100?               │ $0.30 │ $0.68 │ 2% 🔥    │ │
│  │ Will Z be announced?            │ $0.80 │ $0.19 │ 1%       │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  [        HIRE AGENT        ]                                    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- Users can see live Polymarket data WITHOUT connecting a wallet
- Market opportunities are displayed with spreads highlighted
- The "HIRE" button initiates the onboarding flow

---

### Phase 2: Onboarding (Hire Flow)

When user clicks "Hire", the agent starts the onboarding process:

```
Step 1: Wallet Connection & Configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌──────────────────────────────────────────────────┐
│  Connect Wallet                                   │
│  ─────────────                                   │
│  Please connect your Polygon wallet to continue. │
│                                                  │
│  [  Connect Wallet  ]                            │
│                                                  │
│  Allocated Funds (USDC):                         │
│  ┌────────────────────────────────────────────┐  │
│  │ $100                                       │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  Risk Settings:                                  │
│  • Max position size: $100                       │
│  • Risk per trade: 3%                            │
│  • Min spread threshold: 2%                      │
│                                                  │
│  [  Next  ]                                      │
└──────────────────────────────────────────────────┘

Step 2: Review & Confirm
━━━━━━━━━━━━━━━━━━━━━━━
┌──────────────────────────────────────────────────┐
│  Review Configuration                             │
│  ────────────────────                            │
│                                                  │
│  Strategy: Intra-Market Arbitrage                │
│  Network: Polygon (Chain ID: 137)                │
│  Protocol: Polymarket CLOB                       │
│                                                  │
│  Allocation: $100 USDC                           │
│  Max Exposure: $500                              │
│  Polling: Every 30 seconds                       │
│                                                  │
│  [  Start Agent  ]                               │
└──────────────────────────────────────────────────┘
```

---

### Phase 3: Running (Active Trading)

Once hired, the agent enters the running state:

```
┌─────────────────────────────────────────────────────────────────┐
│  🎯 Polymarket Arbitrage              [Running] ⬤              │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━               │
│                                                                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐              │
│  │ Portfolio    │ │ Total P&L    │ │ Active       │              │
│  │ $105.42      │ │ +$5.42       │ │ Positions: 3 │              │
│  └──────────────┘ └──────────────┘ └──────────────┘              │
│                                                                   │
│  [Opportunities] [Positions] [Transactions] [Settings]          │
│  ═════════════════════════════════════════════════════          │
│                                                                   │
│  Current Opportunities                                           │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ Market                      │ YES   │ NO    │ Spread │ Act │  │
│  ├───────────────────────────────────────────────────────────┤   │
│  │ Will X happen?              │ $0.45 │ $0.52 │ 3.0% 🔥│ ⚡  │  │
│  │ Will Y reach target?        │ $0.38 │ $0.59 │ 3.0% 🔥│ ⚡  │  │
│  │ Will Z be announced?        │ $0.72 │ $0.26 │ 2.0% 🔥│ ⚡  │  │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  Recent Activity                                                  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ ● Cycle 42: Found 3 opportunities, executed 2             │   │
│  │ ● Cycle 41: No opportunities (spreads too low)            │   │
│  │ ● Cycle 40: Found 1 opportunity, executed 1               │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  [  Sync  ]  [  Fire  ]                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Frontend Components

### 1. MarketOpportunityCard

Displays a single market with its prices and arbitrage status:

```tsx
interface MarketOpportunityCardProps {
  market: {
    id: string;
    title: string;
    yesPrice: number;
    noPrice: number;
    spread: number;
    volume: number;
  };
  onTrade?: () => void;
}
```

### 2. OpportunitiesPanel

Real-time list of arbitrage opportunities:

```tsx
interface OpportunitiesPanelProps {
  opportunities: ArbitrageOpportunity[];
  config: StrategyConfig;
  isLoading?: boolean;
}
```

### 3. PositionsTable

Shows current YES/NO token positions:

```tsx
interface PositionsTableProps {
  positions: Position[];
  onClose?: (position: Position) => void;
}
```

### 4. MetricsDisplay

Agent performance metrics:

```tsx
interface MetricsDisplayProps {
  metrics: PolymarketMetrics;
  config: StrategyConfig;
}
```

---

## Agent Commands

The agent responds to these commands from the frontend:

| Command | Description | State Transition |
|---------|-------------|------------------|
| `hire` | Start the agent | disabled → waiting-funds → running |
| `fire` | Stop the agent | running → stopping → stopped |
| `sync` | Refresh state | No transition (stays running) |
| `cycle` | Force a poll cycle | Executed during running state |

---

## Data Flow

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend   │────▶│   LangGraph      │────▶│   Polymarket    │
│   (Next.js)  │     │   Agent          │     │   APIs          │
└──────────────┘     └──────────────────┘     └─────────────────┘
       │                     │                        │
       │                     │                        │
       ▼                     ▼                        ▼
  User Actions          Agent State              Market Data
  - Hire/Fire           - Lifecycle              - Gamma API
  - Configure           - Positions              - CLOB API
  - View Metrics        - Transactions           - Prices
```

### API Endpoints Used

1. **Gamma API** (https://gamma-api.polymarket.com)
   - `GET /markets` - Fetch available markets
   - No authentication required

2. **CLOB API** (https://clob.polymarket.com)
   - `GET /price` - Fetch current prices
   - `POST /order` - Place orders (requires auth)
   - `GET /orders` - Get open orders (requires auth)

---

## State Machine

```
                    ┌─────────┐
                    │ disabled│
                    └────┬────┘
                         │ hire
                         ▼
                  ┌──────────────┐
                  │waiting-funds │
                  └──────┬───────┘
                         │ funds received
                         ▼
                    ┌─────────┐
              ┌────▶│ running │◀────┐
              │     └────┬────┘     │
              │          │ fire     │ sync
              │          ▼          │
              │    ┌──────────┐     │
              │    │ stopping │─────┘
              │    └────┬─────┘
              │         │ positions closed
              │         ▼
              │    ┌─────────┐
              └────│ stopped │
                   └─────────┘
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `A2A_TEST_AGENT_NODE_PRIVATE_KEY` | - | Private key for signing orders |
| `POLY_FUNDER_ADDRESS` | - | Wallet address for trades |
| `POLY_MIN_SPREAD_THRESHOLD` | `0.02` | Minimum spread (2%) |
| `POLY_MAX_POSITION_SIZE_USD` | `100` | Max USD per position |
| `POLY_PORTFOLIO_RISK_PCT` | `3` | Risk % per trade |
| `POLY_POLL_INTERVAL_MS` | `30000` | Polling interval (30s) |
| `POLYMARKET_CLOB_API` | `https://clob.polymarket.com` | CLOB API URL |
| `POLYMARKET_GAMMA_API` | `https://gamma-api.polymarket.com` | Gamma API URL |
`
---

## Testing the Integration

### 1. Verify Market Fetching

```bash
cd apps/agent-polymarket
pnpm test:markets
```

This fetches live market data and displays opportunities.

### 2. Run the Agent Locally

```bash
pnpm dev
```

This starts the LangGraph development server on port 8125.

### 3. Test via Frontend

1. Start the web app: `cd apps/web && pnpm dev`
2. Navigate to `/hire-agents/agent-polymarket`
3. Click "Hire" and follow the onboarding flow

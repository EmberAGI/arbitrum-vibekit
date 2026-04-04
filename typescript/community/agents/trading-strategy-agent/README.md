# Clarity One Trading Strategy Agent

**RSI/EMA mean-reversion + grid trading strategy for Arbitrum DEXes, built on Vibekit.**

An AI-powered trading agent that monitors Arbitrum DEX markets for oversold/overbought conditions using technical indicators, executes mean-reversion trades, and manages positions with configurable risk parameters. All capabilities exposed as MCP tools for seamless AI agent interaction.

## Strategy

The agent implements a battle-tested mean-reversion strategy:

1. **RSI Signal Detection** — Monitors 14-period RSI for oversold (<42) and overbought (>68) conditions
2. **EMA Trend Filter** — Only enters long when price is above 50-period EMA (confirming uptrend)
3. **Extreme Dip Buying** — Increases position size 2.5x when RSI drops below 30 (panic selling = opportunity)
4. **Grid Trading** — Places layered limit orders at configurable intervals below current price
5. **Bollinger Band Analysis** — Tracks volatility expansion/contraction for timing

## MCP Tools

| Tool | Description |
|------|-------------|
| `get_signals` | Scan all pairs for RSI/EMA buy/sell signals |
| `run_cycle` | Execute one full trading cycle (dry-run by default) |
| `get_positions` | View open positions with P&L and risk metrics |
| `get_market_overview` | Prices, volatility, Bollinger Bands for all pairs |
| `get_status` | Agent configuration and execution status |

## Quick Start

```bash
# Install
pnpm install

# Configure
cp .env.example .env
# Edit .env — at minimum set ARBITRUM_RPC_URL

# Run tests
pnpm test

# Start MCP server (dry-run mode)
pnpm start
```

## Arbitrum Integration

Supports Arbitrum-native DEXes:
- **Camelot** (default) — concentrated liquidity AMM
- **Uniswap V3** — on Arbitrum
- **ODOS** — multi-route aggregator

Default trading pairs: WETH/USDC, ARB/USDC, GMX/USDC

## Architecture

```
src/
├── index.ts              # MCP server entry point (stdio transport)
├── context/
│   ├── types.ts          # Type definitions
│   └── provider.ts       # Configuration & state management
├── skills/
│   └── trading.ts        # Vibekit skill definition (tool registry)
└── tools/
    ├── indicators.ts     # RSI, EMA, SMA, Bollinger Bands, volatility
    ├── priceFeeds.ts     # Price data from CoinGecko + on-chain
    └── tradingEngine.ts  # Core trading logic (signals, positions, execution)
```

## Configuration

All parameters configurable via environment variables:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `RSI_PERIOD` | 14 | RSI calculation period |
| `RSI_OVERSOLD` | 42 | Buy signal threshold |
| `RSI_OVERBOUGHT` | 68 | Sell signal threshold |
| `RSI_EXTREME_DIP` | 30 | Extreme dip buy threshold |
| `EMA_TREND_PERIOD` | 50 | EMA trend filter period |
| `POSITION_SIZE_PCT` | 0.02 | Normal position size (% of equity) |
| `EXTREME_DIP_POSITION_PCT` | 0.05 | Extreme dip position size |
| `GRID_LEVELS` | 7 | Number of grid levels |
| `GRID_SPACING_PCT` | 1.0 | Grid spacing percentage |
| `DRY_RUN` | true | Simulation mode (no real trades) |

## Safety

- **Dry-run by default** — no real trades until explicitly enabled
- **Position size limits** — max 2-5% per trade
- **No private key required** for signal scanning and analysis
- **Rate limiting** — respects API limits on price feeds

## Built by

[Clarity One](https://clarityone.org) — AI & Blockchain Development

## License

MIT

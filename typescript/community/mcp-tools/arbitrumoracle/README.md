# ArbitrumOracle MCP Server

**12 DeFi risk & compliance intelligence tools for Arbitrum agents.**

Every Vibekit agent can trade — ArbitrumOracle tells them if they should.

## Remote Server

**Endpoint**: `https://tooloracle.io/arbitrum/mcp/`

No API key required. MIT licensed. Live and publicly accessible.

## Quick Setup

```json
{
  "mcpServers": {
    "arbitrumoracle": {
      "url": "https://tooloracle.io/arbitrum/mcp/"
    }
  }
}
```

## Tools (12)

| Tool | Description | Data Source |
|------|-------------|------------|
| `arb_overview` | Ecosystem overview: ARB price, $2B TVL, 956 protocols | CoinGecko + DeFiLlama |
| `arb_token_risk` | Token risk scoring by contract address (verification, proxy, activity) | Arbiscan |
| `arb_protocol_health` | Protocol health check: TVL, audit status, risk grade (GMX, Aave, Pendle...) | DeFiLlama |
| `arb_gas_tracker` | Current gas prices with USD cost estimates for transfers and swaps | Arbiscan |
| `arb_whale_watch` | Monitor large transactions for any Arbitrum address | Arbiscan |
| `arb_contract_check` | Smart contract risk: verification, proxy, compiler, license | Arbiscan |
| `arb_defi_yields` | Compare DeFi yields across all Arbitrum protocols | DeFiLlama Yields |
| `arb_protocol_list` | All major DeFi protocols ranked by TVL | DeFiLlama |
| `arb_stablecoin_risk` | Stablecoin supply and risk analysis (USDC, USDT, DAI...) | DeFiLlama |
| `arb_bridge_flows` | Bridge deposit/withdrawal flow monitoring | DeFiLlama Bridges |
| `arb_token_screening` | Compliance screening: verification, risk flags, basic AML check | Arbiscan |
| `arb_liquidity_scan` | DEX liquidity and volume across 124 Arbitrum exchanges ($250M+ daily) | DeFiLlama DEX |

## Use Case: Risk-Aware Agent Workflow

```
User: "Check if MAGIC token is safe, then swap 0.5 ETH on Camelot"

Agent workflow:
1. arb_token_risk    → Check contract verification, proxy status
2. arb_contract_check → Verify source code, compiler version
3. arb_liquidity_scan → Confirm sufficient DEX volume to exit
4. arb_protocol_health → Verify Camelot is healthy
5. If all PASS → Execute swap via Camelot plugin
```

This makes any Vibekit agent "risk-aware" — a capability that currently doesn't exist in the ecosystem.

## Why This Matters

As Arbitrum positions itself for institutional adoption (Robinhood tokenized equities, Mastercard stablecoin settlement), DeFi agents need risk intelligence:

- **Is this token contract verified and non-upgradeable?**
- **What's the protocol's audit status and TVL trend?**
- **Are there whale movements signaling risk?**
- **Which stablecoins on Arbitrum are safe to hold?**

ArbitrumOracle answers these questions via standard MCP protocol.

## Links

- **Live endpoint**: https://tooloracle.io/arbitrum/mcp/
- **Health check**: https://tooloracle.io/arbitrum/health
- **GitHub**: https://github.com/ToolOracle/arbitrumoracle
- **Builder**: [FeedOracle Technologies](https://feedoracle.io) — EU-based compliance infrastructure (55+ MCP servers, 460+ tools)
- **License**: MIT

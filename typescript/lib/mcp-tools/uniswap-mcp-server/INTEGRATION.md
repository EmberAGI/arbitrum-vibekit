# Uniswap MCP Server - Integration Guide

This guide shows how to integrate the Uniswap MCP server into your Vibekit agent.

## Quick Integration

### 1. Add to MCP Registry

Add the Uniswap MCP server to your agent's `mcp.json` file:

```json
{
  "mcpServers": {
    "uniswap": {
      "type": "stdio",
      "command": "node",
      "args": [
        "./typescript/lib/mcp-tools/uniswap-mcp-server/dist/index.js"
      ],
      "env": {
        "ETHEREUM_RPC_URL": "$env:ETHEREUM_RPC_URL",
        "ARBITRUM_RPC_URL": "$env:ARBITRUM_RPC_URL",
        "DEFAULT_SLIPPAGE": "0.5",
        "GAS_MULTIPLIER": "1.2"
      }
    }
  }
}
```

### 2. Reference in Skills

In your skill files (`.md` files in `skills/` directory), reference the Uniswap server:

```markdown
---
skill:
  id: swap-tokens
  name: 'Token Swap Skill'
  description: 'Execute token swaps on Uniswap'
  tags: [defi, swap]

mcp:
  servers:
    - name: uniswap
      allowedTools:
        - uniswap__getSwapQuote
        - uniswap__getBestRoute
        - uniswap__generateSwapTransaction
        - uniswap__validateSwapFeasibility
        - uniswap__processSwapIntent
---

You can help users swap tokens on Uniswap using the available tools...
```

### 3. Environment Variables

Set the required environment variables:

```bash
export ETHEREUM_RPC_URL="https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"
export ARBITRUM_RPC_URL="https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY"
export DEFAULT_SLIPPAGE="0.5"  # Optional
export GAS_MULTIPLIER="1.2"    # Optional
```

## Tool Namespacing

Tools are automatically namespaced as `{server_name}__{tool_name}`:

- `uniswap__getSwapQuote`
- `uniswap__getBestRoute`
- `uniswap__generateSwapTransaction`
- `uniswap__validateSwapFeasibility`
- `uniswap__processSwapIntent`

## HTTP Transport (Alternative)

For HTTP/StreamableHTTP transport:

```json
{
  "mcpServers": {
    "uniswap": {
      "transport": {
        "type": "http",
        "url": "http://localhost:3012/mcp"
      }
    }
  }
}
```

Then start the server separately:

```bash
cd typescript/lib/mcp-tools/uniswap-mcp-server
pnpm start
```

## Testing Integration

1. Start your agent with the MCP server configured
2. Check agent logs for MCP server connection status
3. Test a tool call from your agent

## Troubleshooting

- **Server not found**: Check the path in `args` is correct relative to your agent's working directory
- **Connection failed**: Verify environment variables are set correctly
- **Tool not available**: Check the tool name includes the namespace prefix (`uniswap__`)


# Uniswap DEX MCP Server (Vibekit)

This MCP server exposes basic Uniswap DEX utilities for agents. Initial tools:
- list_supported_tokens
- get_quote (stub echo)

Run Inspector after building:
- pnpm -C typescript/lib/mcp-tools/uniswap-dex-mcp-server run inspect:npx

Env vars for future routing:
- ARBITRUM_RPC_URL (chainId 42161)
- ETHEREUM_RPC_URL (chainId 1)


## Introduction

This directory provides a reference implementation of a Pendle agent using Arbitrum Vibekit and Ember AI's MCP server. It demonstrates how to set up a server, define agent functionalities, and process swapping operations via MCP tools. You can expand or modify this template by adding new tools or incorporating additional MCP-compatible functionalities to suit your project’s requirements.

## Example Capabilities

Below are some example user inputs that showcase the swapping agent's capabilities:

- `Swap 0.00001 wstETH to wstETH_YT via wstETH market on arbitrum one`

- `Swap 0.1 wstETH_YT to wstETH on arbitrum one`

## Run Agent

1. Run onchain-actions grpc server
2. Run [emberai-mcp](../../lib/mcp-tools/emberai-mcp/) - `pnpm runs tart`
3. Run `pnpm run start` here
4. (Optional) Run MCP inspector to interact with the MCP chat interface: `npx @modelcontextprotocol/inspector localhost:3001`

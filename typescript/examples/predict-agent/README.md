## Introduction

This directory contains the `predict-agent`, an AI agent that uses token price predictions from the Allora Network to make decisions about swapping tokens. It is based on the `swapping-agent-no-wallet` and integrates with the `allora-mcp-server` to fetch predictions and the Ember On-chain Actions MCP server to execute swaps.

## File Overview

1. **`index.ts`**

   Creates a Node.js server for real-time (SSE-based) interactions with the agent.

   Initializes the agent with necessary configurations (blockchain connections, environment variables for API keys).

   Sets up an MCP Server with a "chat" tool for user inputs and potentially other tools for controlling the agent.

2. **`agent.ts`**

   Defines the core logic of the `predict-agent`.

   Includes an MCP client to connect to the `allora-mcp-server` to fetch token predictions (e.g., using `get_inference_by_topic_id`).

   Implements decision-making logic based on these predictions (e.g., if ETH price is predicted to rise, buy ETH).

   Interacts with the Ember On-chain Actions MCP server (via another MCP client or existing integration) to execute swaps.

3. **`agentToolHandlers.ts`**

   Contains handler functions for MCP tools exposed by this agent.

   May include logic to validate user commands or parameters before passing them to the agent for processing predictions or executing swaps.

## Example Capabilities

This agent aims to support interactions like:

"Monitor ETH price predictions from Allora and swap 0.5 ETH for USDC if a significant price increase is predicted in the next 4 hours."
"What is the current Allora prediction for ARB token price?"
"Based on Allora predictions, should I buy or sell WBTC?"

## Run Agent

To run and interact with the agent:

1. Ensure the `allora-mcp-server` is running and accessible.
2. Ensure the Ember On-chain Actions MCP server is running and accessible.
3. Set up the required environment variables in an `.env` file in this directory (e.g., `ALLORA_API_KEY`, RPC URLs, private keys if direct signing is later added, Ember MCP server URL).
4. Follow the general run instructions in the main `examples/README.md` (e.g., `pnpm install`, `pnpm build`, `pnpm dev`).

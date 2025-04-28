## Introduction

This directory provides a reference implementation of a swapping agent using Arbitrum Vibekit and Ember AI's MCP server. It demonstrates how to set up a server, define agent functionalities, and process swapping operations via MCP tools. You can expand or modify this template by adding new tools or incorporating additional MCP-compatible functionalities to suit your project’s requirements.

## File Overview

1. **`index.ts`**

   Creates a Node.js server that provides real-time (SSE-based) interactions with an on-chain swapping agent. Key Components are:

- Agent Initialization with ethers (for blockchain) and environment variables.

- MCP Server with a “chat” tool for handling user inputs.

- Express App for HTTP routes and SSE streaming.

2. **`agent.ts`**

   Defines and manages an AI-powered, on-chain swapping agent. Key Components are:

- Agent that interacts with blockchain swapping protocols (Ember On-chain Actions) to handle user inputs and execute on-chain operations.

- MCP client that queries capabilities and generates transaction sets.

3. **`agentToolHandlers.ts`**

   Contains handler functions for MCP tools and Validates tool output before passing it to the agent for on-chain execution.

## Example Capabilities

Below are some example user inputs that showcase the swapping agent's capabilities:

"Swap 1 ETH for USDC"

"Convert 100 USDT to ARB"

"Trade OP on Optimism for ARB on Arbitrum"

## Run Agent

To run and interact with the agent, follow the instructions in the [`examples/README.md`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/examples/README.md) file.

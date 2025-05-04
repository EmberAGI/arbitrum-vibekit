# GMX Agent Example

This directory provides a reference implementation of a GMX agent using Arbitrum AgentKit, Ember SDK, and MCP. It demonstrates how to set up a server, define agent functionalities, and process GMX operations via MCP tools. You can expand or modify this template by adding new tools or incorporating additional MCP-compatible functionalities to suit your project's requirements.

## Introduction

GMX is a decentralized spot and perpetual exchange on Arbitrum that supports low swap fees and zero price impact trades. This agent allows users to interact with GMX through a conversational interface, supporting key features like:

- Getting information about available GMX markets
- Viewing user positions
- Creating new long/short positions
- Closing or decreasing existing positions

## File Overview

1. **`index.ts`**

   Creates a Node.js server that provides real-time (SSE-based) interactions with an on-chain GMX agent. Key Components are:

   - Agent Initialization with ethers (for blockchain) and environment variables.
   - MCP Server with a "chat" tool for handling user inputs.
   - Express App for HTTP routes and SSE streaming.

2. **`agent.ts`**

   Defines and manages an AI-powered, on-chain GMX agent. Key Components are:

   - Agent that interacts with GMX protocol (Ember SDK) to handle user inputs.
   - MCP client that queries capabilities and generates transaction sets.

3. **`agentToolHandlers.ts`**

   Contains handler functions for MCP tools and validates tool output before passing it to the agent for on-chain execution.

4. **`gmx/` Directory**

   Contains GMX-specific functionality:

   - **`client.ts`**: GMX client initialization and configuration
   - **`markets.ts`**: Market information retrieval
   - **`positions.ts`**: Position information retrieval and processing
   - **`orders.ts`**: Order creation for positions

## Example Capabilities

Below are some example user inputs that showcase the GMX agent's capabilities:

```
"Show me available markets on GMX"

"What are my current positions?"

"Open a long ETH position with 0.1 ETH as collateral and 5x leverage"

"Close my BTC position"
```

## Environment Variables

This agent requires the following environment variables:

```
# Blockchain and GMX
RPC_URL=https://arb1.arbitrum.io/rpc
ORACLE_URL=https://arbitrum-api.gmx.io/prices
SUBSQUID_URL=https://arbitrum-api.gmx.io/subgraph
CHAIN_ID=42161

# Ember
EMBER_API_KEY=your_ember_api_key
EMBER_API_URL=https://api.ember.services

# AI Provider
OPENROUTER_API_KEY=your_openrouter_key
LLM_MODEL=openai/gpt-4-turbo-preview

# Server
PORT=3001
TRACING=false
```

## Run Agent

To run and interact with the agent, follow the instructions in the `examples/README.md` file.

## Security Considerations

- In a production environment, you would need to implement proper authentication and security measures
- Always validate user inputs and implement rate limiting for API requests 
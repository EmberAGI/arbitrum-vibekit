## Introduction

This directory provides a reference implementation of a lending agent using Arbitrum AgentKit, Ember SDK, and MCP. It demonstrates how to set up a server, define agent functionalities, and process lending operations (borrow, repay, supply, withdraw) via MCP tools. You can expand or modify this template by adding new tools or incorporating additional MCP-compatible functionalities to suit your project’s requirements.

## File Overview

1. **`index.ts`**

   Creates a Node.js server that provides real-time (SSE-based) interactions with an on-chain lending/borrowing agent. Key Components are:

- Agent Initialization with ethers (for blockchain) and environment variables.

- MCP Server with a “chat” tool for handling user inputs.

- Express App for HTTP routes and SSE streaming.

2. **`agent.ts`**

   Defines and manages an AI-powered, on-chain lending agent. Key Components are:

- Agent that interacts with blockchain lending protocols (Ember SDK) to handle user inputs and execute on-chain operations (borrowing, repayment, supply, and withdrawal).

- MCP client that queries capabilities and generates transaction sets.

3. **`agentToolHandlers.ts`**

   Contains handler functions for MCP tools (borrow, repay, supply, withdraw, and getUserPositions) and Validates tool output before passing it to the agent for on-chain execution.

## Example Capabilities

Below are some example user inputs that showcase the lending agent's capabilities:

1. Request a token loan:

   "Borrow 100 USDC"

2. Pay back a portion (or all) of an existing loan:

   "Repay 50 USDC"

3. Deposit a certain token into the lending platform:

   "Supply 250 WETH"

4. Retrieve a previously deposited tokens from the protocol:

   "Withdraw 50 WETH"

5. Pull real-time lending and borrowing data such as health factor, total borrows, and supplied assets:

   "Show my current positions"

## Run Agent

To run and interact with the agent, folllow the instructions in the `examples/README.md` file.

## Introduction

This section contains example implementations of on-chain AI agents that demonstrate how they are easily built and deployed using the Arbitrum Agentkit. These agents act as MCP tools for compatibility with any system, a common approach in widely used technical references. In the coming months, they will be eligible for listing in MCP registries as part of the Agentkit-agent creation process.

## Running an Agent

**Optional**: If you need an on-chain actions server for local testing or more control, clone and run the [`onchain-actions repo`](https://github.com/EmberAGI/onchain-actions) repo locally. If you do not run it locally, the official deployment will be used instead.

There are two main ways to start an agent:

### 1. Using Docker

Build the MCP-enabled Docker image in the agent's directory and run the container to start your agent.

### 2. Local Development

1. **Using the Inspector via npx**:
   If you prefer not to install anything locally for debugging, you can run the Inspector via npx:

   ```bash
   pnpm run inspect:npx
   ```

   This command uses `npx -y @modelcontextprotocol/inspector` to launch the Inspector, pointing it at your agent’s compiled code (`./dist/index.js`). It’s a convenient way to inspect or interact with your production agent without modifying your local environment.

2. **Using npm**

- **Environment Setup**:

  Copy the `.env.example` file to `.env` in your agent's directory and fill in any required secrets or configuration variables.

- **Install and Build**:

  At the root of this repository, run the following commands:

  ```bash
  pnpm install
  pnpm run build
  ```

- **Start the Agent**:

  Run the following command in your agents' directory:

  ```bash
  pnpm run start
  ```

  The agent should now be running and ready to receive requests or user input.

## Graphical MCP Clients

Although these examples primarily demonstrate command-line interactions, you can integrate a graphical MCP client:

1. **Cursor**: You can incorporate the agent into Cursor by adding a “rules” file that defines how Cursor should display and handle interactions.

2. **Claude Desktop**: By using the Dockerized version alongside Claude Desktop, developers can run reference servers locally (e.g., Docker Desktop) and point Claude Desktop’s `claude_desktop_config.json` to those servers as an MCP client.

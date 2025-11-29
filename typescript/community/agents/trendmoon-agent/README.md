## Introduction

The `community` directory contains community-contributed implementations of on-chain AI agents, illustrating how they are easily built and deployed using the Arbitrum Vibetkit. These agents can act as MCP tools for compatibility with any system.

## Running an Existing Agent

### 1. Setup Environment

Navigate to the desired agent's directory and create an `.env` file. Copy the contents of `.env.example` into the `.env` file and fill in any required secrets or configuration variables.

### 2. Start the Agent

There are two main ways to start an agent:

- **Using Docker Compose**:

  Navigate to the `typescript` directory and install the necessary packages.

  ```
  cd typescript
  pnpm install
  pnpm build
  ```

  Next, run the MCP-enabled Docker container to start your agent. Replace the `"agent-name"` with the name of your desired agent, for example: `"swapping-agent-no-wallet"`.

  ```
  pnpm --filter "agent-name" docker:compose:up
  ```

  **Note**: If you get a `permission denied error`, try running the above command with `sudo`:

  ```
  sudo pnpm --filter "agent-name" docker:compose:up
  ```

- **Local Development**:

  Navigate to the `typescript` directory and run the following `pnpm` commands to build
  your agent. Replace the `"agent-name"` with the name of your desired agent, for example: `"swapping-agent-no-wallet"`.

  ```
  cd typescript
  pnpm --filter "agent-name" install
  pnpm --filter "agent-name" build
  ```

### 3. Interact with the Agent

- **Using the Inspector via npx**:

  You can run the following `npx` command in another terminal to launch the Inspector.

  ```bash
  npx -y @modelcontextprotocol/inspector
  ```

  It’s a convenient way to inspect or interact with your production agent without modifying your local environment.

  **Note**: It might take a couple minutes for the agent to finish setting up. If you get errors of `Connection Error, is your MCP server running?`, try connecting to it in a couple of minutes.

- **Graphical MCP Clients**:

1. Cursor:

   Cursor is designed for lightweight command-line interactions. To integrate an agent into Cursor, update the configuration by editing the `mcp.json` file. Add an entry under the `mcpServers` key to define the agent’s settings. Cursor can run an agent via a local command (using npx) or point directly to an SSE (Server-Sent Events) endpoint. For detailed guidance on configuring MCP for Cursor, refer to https://docs.cursor.com/context/model-context-protocol.

2. Claude Desktop:

   Claude Desktop supports similar agent configurations as Cursor but also includes additional settings such as filesystem access, which enhances its capability to work with local directories. To integrate an agent into Claude Desktop, update the configuration by editing the `claude_desktop_config.json` file. Add an entry under the `mcpServers` key to define the agent’s settings. Claude Desktop can run an agent via a local command (using npx) or point directly to an SSE (Server-Sent Events) endpoint.For detailed guidance on configuring MCP for Claude Desktop, refer to https://modelcontextprotocol.io/quickstart/user.

3. Windsurf:

   Windsurf offers a rich graphical interface and integrates its MCP configurations either through a configuration file named `windsurf_config.json` or via its built-in Settings panel. Windsurf’s configuration process often involves UI-based adjustments. For detailed guidance on configuring MCP for Windsurf, refer to https://docs.windsurf.com/windsurf/mcp.

## Introduction

This section contains example implementations of on-chain AI agents that demonstrate how they are easily built and deployed using the Arbitrum Agentkit. These agents act as MCP tools for compatibility with any system, a common approach in widely used technical references. In the coming months, they will be eligible for listing in MCP registries as part of the Agentkit-agent creation process.

## Set Up Your Project

### 1. Environment Setup:

Copy the `.env.example` file to `.env` in your agent's directory and fill in any required secrets or configuration variables.

### 2. Install Packages:

```bash
pnpm install
```

## Running an Agent

There are two main ways to start an agent:

### 1. Using Docker Compose

Build the MCP-enabled Docker image in the agent's directory and run the container to start your agent.

### 2. Local Development

- **Using the Inspector via npx**:

  ```bash
  pnpm run inspect:npx
  ```

  This command uses `npx -y @modelcontextprotocol/inspector` to launch the Inspector, pointing it at your agent’s compiled code (`./dist/index.js`). It’s a convenient way to inspect or interact with your production agent without modifying your local environment.

- **Using npm**:

  ```bash
  pnpm run build
  pnpm run start
  ```

  The agent should now be running and ready to receive requests or user input.

## Graphical MCP Clients

Although the above examples primarily demonstrate command-line interactions, you can integrate a graphical MCP client as well:

1. **Cursor**: To incorporate an agent into Cursor, update the configuration by editing the `mcp.json` file. Within this file, add an entry under the `mcpServers` key that defines the agent’s settings depending on whether you are setting up a local or remote agent. Cursor can point to the SSE MCP server running on Docker, or directly to the build file for npx. The contents of the `mcp.json` file follow this structure:

```json
{
  "mcpServers": {
    "local-npx-agent": {
      "command": "npx",
      "args": ["/path/to/agent/build/dist/index.js"],
      "env": {
        "VAR": "value"
      }
    },
    "local-sse-agent": {
      "url": "http://localhost:3010/sse",
      "env": {
        "VAR": "value"
      }
    },
    "remote-sse-agent": {
      "url": "http://173.230.139.151:3010/sse"
    }
  }
}
```

2. **Claude Desktop**: To incorporate an agent into Claude Desktop, update the configuration by editing the `claude_desktop_config.json` file. Within this file, add an entry under the `mcpServers` key that defines the agent’s settings depending on whether you are setting up a local or remote agent. Claude Desktop can point to the SSE MCP server running on Docker, or directly to the build file for npx. The contents of the `claude_desktop_config.json` file follow this structure:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/username/Desktop",
        "/path/to/other/allowed/dir"
      ]
    },
    "MCP_DOCKER": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "alpine/socat",
        "STDIO",
        "TCP:host.docker.internal:8811"
      ],
      "local-sse-agent": {
        "url": "http://localhost:3010/sse",
        "env": {
          "VAR": "value"
        }
      },
      "remote-sse-agent": {
        "url": "http://173.230.139.151:3010/sse"
      }
    }
  }
}
```

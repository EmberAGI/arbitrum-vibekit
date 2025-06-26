# 🎯 Agent Templates

This directory contains production-ready AI agent templates that demonstrate how to build sophisticated, autonomous on-chain agents. Each template agent features the v2 framework's improved design with skills, tools, hooks, and enhanced MCP integrations. They serve as both working examples and starting points for building your own custom agents.

Follow this guide to:

- [Understand the v2 Architecture](#-v2-architecture-overview)
- [Get Started with Templates](#-get-started-with-templates)
- [Build Your Own Agent](#%EF%B8%8F-build-your-own-agent)

## 🔄 Migration from Examples

> [!IMPORTANT]  
> The [`examples`](../examples/) directory is being deprecated in favor of these v2 templates. The examples directory contains the older architecture and will be removed in future releases.

## 🏗️ v2 Architecture Overview

### Core Concepts

- **Skills**: High-level capabilities that define what your agent can do (e.g., "price prediction", "token swapping")
- **Tools**: Internal implementations that handle specific actions within skills
- **Hooks**: Enhancement functions that can modify tool inputs/outputs or add functionality
- **Context**: Shared state and type-safe data management across the agent
- **LLM Orchestration**: Intelligent routing and coordination between tools within skills

### Template Agent Directory Structure

```
agent-name/
├── src/
│   ├── index.ts          # Agent entry point and MCP server setup
│   ├── skills/           # Skill definitions (high-level capabilities)
│   │   └── example.ts    # Example skill with LLM orchestration
│   ├── tools/            # Tool implementations (actions)
│   │   └── exampleTool.ts # Example tool implementation
│   ├── hooks/            # Tool enhancement hooks (optional)
│   │   └── index.ts      # Before/after hooks for tools
│   └── context/          # Shared context and types (optional)
│       ├── provider.ts   # Context provider
│       └── types.ts      # Type definitions
├── test/                 # Test files
├── package.json          # Agent dependencies
├── tsconfig.json         # TypeScript configuration
└── README.md            # Agent documentation
```

## 🚀 Get Started with Templates

### 1. Set Up Your IDE

We recommend using [Cursor IDE](https://www.cursor.com/) for the best development experience. Cursor provides an AI-powered environment designed for seamless collaboration between you and your AI assistant.

With Cursor, you can:

- Define your project context using [rule files](https://docs.cursor.com/context/rules) in the `.cursor/rules` folder
- Run Vibekit agents locally or remotely within your development environment
- Integrate [MCP-powered](https://docs.cursor.com/context/model-context-protocol) tools and workflows

To clone Vibekit in Cursor:

1. Open Cursor and click "Clone repo" in the welcome screen
2. Paste the repository URL: https://github.com/EmberAGI/arbitrum-vibekit.git
3. Choose your local directory and click "Clone"

<p align="left">
  <img src="../../img/cursor.png" width="900px" alt="cursor"/>
</p>

Once cloned, Cursor will automatically detect Vibekit's [`.cursor/rules`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/.cursor/rules) directory and set up the AI context.

### 2. Set Up Your Environment

First, ensure that [`Node.js 22+`](https://nodejs.org/) and [`pnpm`](https://pnpm.io/) are installed on your system.

```bash
node -v # Should be 22+
pnpm -v # Check that pnpm is installed
```

Next, navigate to your desired template agent's directory and create an `.env` file. Copy the contents of `.env.example` into the `.env` file and fill in any required secrets or configuration variables.

### 3. Install Packages

Navigate to the [`typescript`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript) directory and install the necessary packages.

```bash
cd typescript && pnpm install
```

### 4. Start Your Agent

You can start any template agent in three different ways. Choose the approach that best fits your preferences and project setup:

**1. Cursor's AI Assistant (Vibe Coding)**:

Ask Cursor's integrated AI assistant to run your desired agent. Make sure to add the desired agent's directory to Cursor's chat context.

**2. Docker Compose**:

To use this option, make sure you have [Docker Desktop](https://www.docker.com/products/docker-desktop/) with Docker Compose `v2.24` or greater installed on your system. Run the following command in the [`typescript`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript) directory. Replace `"agent-name"` with the name of your desired template agent, for example: `"quickstart-agent"`.

```bash
pnpm --filter "agent-name" docker:compose:up
```

> [!NOTE]  
> If you get a `permission denied error`, try running the above command with `sudo`:
>
> ```bash
> sudo pnpm --filter "agent-name" docker:compose:up
> ```

> [!TIP]  
> To run the agent in the background so you can keep using your terminal, use the `-d` flag:
>
> ```bash
> pnpm --filter "agent-name" docker:compose:up -d
> ```

To stop the agent afterwards, use the following command:

```bash
pnpm --filter "agent-name" docker:compose:down
```

**3. Local Development**:

Run the following `pnpm` commands in the [`typescript`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript) directory to build and run your agent. Replace `"agent-name"` with the name of your desired template agent, for example: `"quickstart-agent"`.

```bash
pnpm build && pnpm --filter "agent-name" dev
```

### 5. Interact with Your Agent

Once the agent is up and running, you have two primary ways of interacting with it:

**1. Vibekit's Web Interface**

To interact with the agent through the web interface, refer to [this quickstart](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/README.md#quickstart).

**2. Integrate with Cursor IDE**

> [!TIP]  
> This configuration approach is also compatible with other graphical MCP clients like [Claude Desktop](https://modelcontextprotocol.io/quickstart/user) and [Windsurf](https://docs.windsurf.com/windsurf/mcp). Simply adjust the settings accordingly in their respective configuration files.

To interact with the agent through Cursor, [create or update](https://docs.cursor.com/context/model-context-protocol) your `mcp.json` file through Cursor's MCP settings. If your agent is running on a different port than 3002, make sure to adjust it:

```json
{
  "mcpServers": {
    "local-sse-agent": {
      "url": "http://localhost:3002/sse"
    }
  }
}
```

You might need to restart Cursor to apply the new configuration. Upon successful integration, Cursor will automatically detect the Agent MCP tool and you can interact with it directly through prompts.

## 🛠️ Build Your Own Agent

### Start with the Quickstart Agent

We recommend starting with the [`quickstart-agent`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates/quickstart-agent) template. It's a comprehensive example that demonstrates all v2 framework features and serves as both an integration test and a developer template.

### Features Demonstrated

**Skills:**

1. **greet** (LLM-orchestrated) - Takes name and greeting style, uses multiple tools for personalized greetings
2. **getTime** (Manual handler) - Returns current time without LLM, shows manual handler patterns
3. **echo** (Manual handler with artifacts) - Demonstrates error handling and artifact creation

**Tools:**

1. `getFormalGreeting` - Returns formal greetings
2. `getCasualGreeting` - Returns casual greetings
3. `getLocalizedGreeting` - Enhanced with timestamps via hooks

**Mock MCP Servers:**

1. `mock-mcp-translate` - Translation services
2. `mock-mcp-language` - Supported languages
3. `mock-mcp-time` - Timezone support

Checkout the [quickstart-agent's guide](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates/quickstart-agent#quick-start) to start building your own agent.

# Agent Templates

This directory contains production-ready AI agent templates that demonstrate how to build sophisticated, autonomous on-chain agents. Each template agent features the v2 framework's improved design with skills, tools, hooks, and enhanced MCP integrations. They serve as both working examples and starting points for building your own custom agents.

> **🎯 For New Agent Development**: We recommend using the modern **[Agent Node framework](../lib/agent-node/README.md)** for building new agents. Agent Node provides config-driven architecture, full A2A protocol compliance, generator-based workflows, and embedded wallet support. See [Lesson 28](../../docs/lesson-28.md) for a complete guide.

Follow this guide to:

- [Understand the v2 Architecture](#️-template-agent-architecture-overview)
- [Run Template Agents](#-run-template-agents)
- [Build Your Own Agent](#%EF%B8%8F-build-your-own-agent)

## 🏗️ Template Agent Architecture Overview

### Directory Structure

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
├── Dockerfile            # Development Docker configuration
├── Dockerfile.prod       # Production Docker configuration
├── package.json          # Agent dependencies
├── tsconfig.json         # TypeScript configuration
├── vitest.config.ts      # Vitest configuration (optional)
├── .env.example          # Example environment variables
└── README.md             # Agent documentation
```

### Core Concepts

- **Skills**: High-level capabilities that define what your agent can do (e.g., "price prediction", "token swapping")
- **Tools**: Internal implementations that handle specific actions within skills
- **Hooks**: Enhancement functions that can modify tool inputs/outputs or add functionality
- **Context**: Shared state and type-safe data management across the agent
- **LLM Orchestration**: Intelligent routing and coordination between tools within skills
- **Transaction Signing**: All blockchain transactions should be signed and executed using Vibekit's `withHooks` after hook feature for secure transaction handling

## 🚀 Run Template Agents

### 1. Set Up Your IDE

We recommend using [Cursor IDE](https://www.cursor.com/) for the best development experience. Cursor provides an AI-powered environment designed for seamless collaboration between you and your AI assistant. To clone Vibekit in Cursor:

1. Open Cursor and click "Clone repo" in the welcome screen
2. Paste the repository URL: https://github.com/EmberAGI/arbitrum-vibekit.git
3. Choose your local directory and click "Clone"

<p align="left">
  <img src="../../img/cursor.png" width="900px" alt="cursor"/>
</p>

Once cloned, Cursor will automatically detect Vibekit's [`.cursor/rules`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/.cursor/rules) directory and set up the AI context.

### Using Claude Code CLI

If you prefer using Claude Code instead, you can install the Claude Code CLI and interact with Vibekit entirely from your terminal:

```bash
npm install -g @anthropic-ai/claude-code &&
cd arbitrum-vibekit
```

Next you can can start planning and executing with Claude:

```bash
claude plan "Describe the feature you want to build" &&
claude execute
```

Because the `.claude/` folder is part of this repository, the CLI automatically applies all prompts and hooks, ensuring a consistent developer experience.

### 2. Set Up Your Environment

First, ensure that [`Node.js 22+`](https://nodejs.org/) and [`pnpm`](https://pnpm.io/) are installed on your system.

```bash
node -v # Should be 22+
pnpm -v # Check that pnpm is installed
```

Next, navigate to your desired template agent's directory and create an `.env` file. by copying the `.env.example` and fill in any required secrets or configuration variables.

### 3. Install Packages

Navigate to the [`typescript`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript) directory and install the necessary packages.

```bash
cd typescript && pnpm install
```

### 4. Start Your Agent

You can start any template agent in two different ways. Choose the approach that best fits your preferences and project setup:

**1. Docker Compose**:

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

**2. Local Development**:

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

### 📖 Essential Reading: Development Lessons

Before building your agent, we highly recommend reviewing these key lessons that cover the v2 framework architecture and best practices:

- **[Lesson 28: Agent Node Framework](../../../docs/lesson-28.md)** - Complete guide to the Agent Node framework including configuration, skills, workflows, and A2A protocol integration.

### Start with `quickstart-agent`

We recommend modifying the [`quickstart-agent`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates/quickstart-agent) template to make your agent. It's a comprehensive example that demonstrates all v2 framework features and serves as both an integration test and a developer template. Follow these steps to transform the quickstart agent into your own custom agent:

1. Copy the Quickstart Agent

   > [!NOTE]
   > If you are contributing an agent template, make sure to create it in the [`community`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/community) directory.

   ```bash
   cp -r typescript/templates/quickstart-agent typescript/community/my-custom-agent
   cd typescript/community/my-custom-agent
   ```

2. Update Package Configuration

   - Edit `package.json` to change the name and description
   - Update any references to "quickstart-agent" in your new agent's files

3. Define Your Skills

   - Modify files in `src/skills/` to match your agent's capabilities
   - Remove the demo skills (greet, getTime, echo) and create your own
   - Each skill should represent a high-level capability your agent provides

4. Implement Your Tools

   - Update files in `src/tools/` with your specific business logic
   - Replace the greeting tools with tools that perform your desired actions
   - Keep the tool structure but change the implementation details

5. Configure MCP Integrations

   - Replace the mock MCP servers in `mock-mcp-servers/` with real integrations
   - Or remove them if you don't need external MCP tools
   - Update `src/index.ts` to register your MCP connections

6. Add Custom Context & Hooks

   - Modify `src/context/` if you need shared state management
   - Update `src/hooks/` to add logging, authentication, or data transformation
   - Remove any context or hooks you don't need

7. Update Environment Configuration

   - Copy `.env.example` to `.env` and configure your API keys
   - Add any new environment variables your agent requires
   - Update the example file with your new variables

8. Test Your Agent

   ```bash
   pnpm build
   pnpm dev
   ```

   - Test your agent locally to ensure it works as expected
   - Use the integration test patterns from the quickstart agent

9. Create Your Agent's README

   - Update the `README.md` file with your agent's specific information
   - Document your agent's skills, tools, and capabilities
   - Include setup instructions, environment variables, and usage examples
   - Add any specific deployment or configuration notes

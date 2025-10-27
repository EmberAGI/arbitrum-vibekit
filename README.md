![Graphic](img/Banner.png)

<p align="center">
   &nbsp&nbsp <a href="https://docs.emberai.xyz/vibekit/introduction">Documentation </a> &nbsp&nbsp | &nbsp&nbsp <a href="https://github.com/EmberAGI/arbitrum-vibekit/tree/main/CONTRIBUTIONS.md"> Contributions </a> &nbsp&nbsp | &nbsp&nbsp <a href="https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates"> Agent Templates</a>  &nbsp&nbsp |  &nbsp&nbsp   <a href="https://www.emberai.xyz/"> Ember AI</a>  &nbsp&nbsp | &nbsp&nbsp  <a href="https://discord.com/invite/bgxWQ2fSBR"> Support Discord </a>  &nbsp&nbsp | &nbsp&nbsp  <a href="https://t.me/EmberChat"> Ember Telegram</a>  &nbsp&nbsp | &nbsp&nbsp  <a href="https://x.com/EmberAGI"> 𝕏 </a> &nbsp&nbsp
</p>

## 🧭 Table of Contents

- [📙 Introduction](#-introduction)
- [🧬 Repository Architecture](#-repository-architecture)
- [⚡ Quickstart](#-quickstart)
- [🔧 Build Your Own Agent](#-build-your-own-agent)
- [🤖 LLM Guides](#-llm-guides)
- [💰 Contributions & Bounties](#-contributions--bounties)

## 📙 Introduction

Welcome to Vibekit, the polyglot toolkit for vibe coding smart, autonomous DeFi agents that can perform complex on-chain operations. Whether you're automating trades, managing liquidity, or integrating with blockchain data, Vibekit makes it simple to create intelligent agents that understand natural language and execute sophisticated workflows.

At its core, Vibekit uses the Model Context Protocol (MCP) to standardize how agents connect with tools and data, with built-in Agent2Agent (A2A) integration enabling seamless collaboration. The Ember Plugin System extends this foundation with a modular architecture for DeFi protocols, providing standardized entity mapping, comprehensive type safety, and intelligent routing for optimized execution across multiple protocols.

Here's an overview of how everything fits together:

<p align="left">
  <img src="img/Flow Chart.png" width="800px" alt="Vibekit Concepts Diagram"/>
</p>

> [!NOTE]
> For deeper understanding of Vibekit concepts, explore our comprehensive [lesson series](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/docs).

## 🧬 Repository Architecture

Vibekit is structured as a TypeScript monorepo, with a Rust implementation on the horizon.

```
arbitrum-vibekit/
├── development/                    # Development documentation and analysis
├── img/                           # Documentation images and assets
├── typescript/                     # Main monorepo workspace
│   ├── clients/                    # Client applications
│   │   └── web/                    # Vibekit frontend
│   ├── templates/                  # Official Vibekit agent templates
│   ├── community/                  # Community-contributed agent templates
│   ├── lib/                        # Core framework libraries such as MCP tools, Ember API, etc.
│   │   ├── a2a-types/              # Agent-to-Agent type definitions
│   │   ├── agent-node/             # Agent Node framework (v3.0+) - Config-driven A2A-compliant agents
│   │   ├── ember-api/              # Ember AI API client
│   │   ├── ember-schemas/          # Schema definitions
│   │   ├── community-mcp-tools/   # Community MCP tool server implementations
│   │   └── test-utils/             # Testing utilities and helpers
│   └── onchain-actions-plugins/    # Ember plugin system
├── CHANGELOG.md
├── CLAUDE.md
├── CONTRIBUTIONS.md
├── LICENSE
└── README.md
```

### Key Directories

- **[`agent-node/`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/agent-node)**: The modern config-driven agent framework with full A2A protocol compliance, generator-based workflows, and embedded wallet support. This is the recommended framework for building new agents.

- **[`templates/`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates)**: Official Vibekit agent templates featuring production-ready implementations with skills, tools, hooks, and modern deployment patterns. These serve as reference implementations for building your own agents.

- **[`community/`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/community)**: Community-contributed agent templates and external integrations. This is where developers can contribute their own specialized agents to expand Vibekit's ecosystem.

- **[`clients/web`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/clients/web)**: Vibekit web frontend, featuring wallet integration, agent chat interface, and real-time MCP communication for DeFi agent interactions.

- **[`community-mcp-tools`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/community-mcp-tools)**: Community MCP tool server implementations, providing standardized external data access through the Model Context Protocol.

- **[`onchain-actions-plugins/`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/onchain-actions-plugins)**: The Ember Plugin System providing a registry for on-chain action plugins and smart contract integrations with extensible architecture for adding new blockchain protocols.

## ⚡ Quickstart

Follow these steps to build and run DeFi agents:

### Prerequisites

Make sure you have [Docker Desktop](https://www.docker.com/products/docker-desktop/) with Docker Compose v2.24 or greater installed on your system.

> [!TIP]
> If you are on an M-series Mac, you need to install Docker using the [dmg package](https://docs.docker.com/desktop/setup/install/mac-install/) supplied officially by Docker rather than through Homebrew or other means to avoid build issues.

### Get the Code

To get started, clone the repository through command line or your preferred IDE:

```
git clone https://github.com/EmberAGI/arbitrum-vibekit.git &&
cd arbitrum-vibekit
```

### Run DeFi Agents

The swapping and lending agents start automatically when you launch the Vibekit frontend. Follow the steps below to get everything up and running.

#### Configure Environment Variables

Navigate to the [typescript](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript) directory and create a `.env` file by copying the `.env.example` and filling in the required values:

```bash
cd typescript &&
cp .env.example .env
```

At a minimum, you need:

- Your preferred AI provider API key (e.g., `OPENROUTER_API_KEY`, `OPENAI_API_KEY`)
- Generate a secure `AUTH_SECRET` (you can use https://generate-secret.vercel.app/32 or `openssl rand -base64 32`)

#### Start Services:

```bash
# Start the web frontend and default agents
docker compose up
```

> [!WARNING]
> If you previously ran `docker compose up` with an older version of Vibekit and encounter frontend or database-related errors, clear your browser cache and run the following command in your terminal:
>
> ```bash
> docker compose down && docker volume rm typescript_db_data && docker compose build web --no-cache && docker compose up
> ```

#### Access the Web Interface:

Once all services are running, open your browser and navigate to http://localhost:3000. To be able to chat with the agents, you need to connect your wallet first. Click on "Connect Wallet" to get started:

<p align="left">
  <img src="img/wallet.png" width="900px" alt="wallet"/>
</p>

After setting up your wallet, you'll see the Vibekit web interface where you can explore different agent capabilities:

<p align="left">
  <img src="img/frontend.png" width="900px" alt="frontend"/>
</p>

## 🔧 Build Your Own Agent

To build your own agent, we recommend using our [Quickstart Agent template](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates/quickstart-agent). It provides all the necessary boilerplate code so you can start building right away. Follow these steps to integrate and run the Quickstart Agent:

### Enable the Quickstart Agent in the Frontend

In the [agents-config.ts](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/agents-config.ts) file, uncomment the agent's configuration in two places:

```typescript
...
  {
    id: 'quickstart-agent-template' as const,
    name: 'Quickstart',
    description: 'Quickstart agent',
    suggestedActions: [],
  },
...
```

```typescript
...
  ['quickstart-agent-template', 'http://quickstart-agent-template:3007/sse'],
...
```

### Add the Agent to Docker Compose

In the [docker compose](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/compose.yml) file, uncomment the service definition for the Quickstart Agent:

```yaml
---
quickstart-agent-template:
  build:
    context: ./
    dockerfile: templates/quickstart-agent/Dockerfile
  container_name: vibekit-quickstart-agent-template
  env_file:
    - path: .env
      required: true
    - path: templates/quickstart-agent/.env
      required: false
  ports:
    - 3007:3007
  restart: unless-stopped
```

### Configure the Agent's Environment

Navigate to the agent's directory and create a local `.env` by copying the`.env.example` file. Make sure to populate the `.env` file with your API keys and configurations:

```bash
cd typescript/templates/quickstart-agent && cp .env.example .env
```

### Rebuild and Restart Services

Navigate to the [typescript](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript) directory, rebuild the web application and restart all services to apply the changes:

```bash
cd ../.. &&
docker compose build web --no-cache && docker compose up
```

The Quickstart Agent is now accessible through the web frontend:

<p align="left">
  <img src="/img/quickstart-agent.png" width="900px" alt="quickstart-agent"/>
</p>

> [!TIP]
> To learn more about Vibekit's agent configurations, refer to [this guide](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/clients/web#agent-configuration).

## 🤖 LLM Guides

### `.rulesync` Configuration

The `.rulesync` directory serves as the source of truth for all LLM configuration files. This system allows you to manage rules, commands, and subagents in a centralized location and automatically generate them for different AI tools:

```
.rulesync/
├── commands/           # High-level command structures
├── subagents/          # Persona-driven specialized agents
└── rules/              # Workspace-wide guidelines and best practices
```

Key Benefits:

- **Single Source of Truth**: All LLM configurations managed in one place
- **Automatic Generation**: Run `pnpm sync:rules` to generate files for Claude, Cursor, and other tools
- **Version Control**: Track changes to AI configurations alongside code changes
- **Consistency**: Ensure all AI tools follow the same guidelines and workflows

To generate all LLM configuration files, run the following command:

```bash
pnpm sync:rules

# Files are automatically generated to:
# - .claude/ (for Claude Code)
# - .cursor/ (for Cursor IDE)
```

### Claude

For Claude models, prompt engineering is handled through a set of dedicated files in the [`.claude/`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/.claude) directory. These files include detailed instructions, examples, and best practices to guide LLMs in generating accurate and efficient code:

- **agents/**: Contains prompts for persona-driven agents that specialize in tasks like Test-Driven Development, documentation, and feature writing.
- **commands/**: Includes prompts that define high-level command structures for planning, execution, and version control.
- **hooks/**: Provides scripts that can be triggered at different stages of the development lifecycle, such as pre-task and post-task actions.

Additionally, [`CLAUDE.md`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/CLAUDE.md) provides comprehensive guidance for Claude Code when working with the Vibekit codebase, including architecture overview, development standards, and code quality guidelines.

### Cursor

Cursor rules files are located in the [`.cursor/rules`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/.cursor/rules) directory. These files define best practices, workflows, and workspace conventions for building and maintaining agents:

- **createVibekitAgent.mdc**: A guide for creating and configuring new agents, including best practices, required dependencies, and setup instructions.

- **vibeCodingWorkflow.mdc**: Outlines the step-by-step development workflow for agents, including the Planner/Executor roles, task breakdowns, and conventions for collaborative development.

- **workspaceRules.mdc**: Documents workspace-wide guidelines and best practices for the monorepo, such as dependency management, development scripts, and CI/CD standards.

## 💰 Contributions & Bounties

We welcome contributions from the community! If you'd like to help improve Vibekit or expand its capabilities, please check out our [contribution guidelines](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/CONTRIBUTIONS.md). Certain contributions might qualify for the [Trailblazer Fund 2.0](https://www.emberai.xyz/blog/introducing-arbitrum-vibekit-and-the-trailblazer-fund-2-0) initiative launched by Arbitrum. Checkout our [contribution center](https://github.com/orgs/EmberAGI/projects/13) to get started!

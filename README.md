![Graphic](img/Banner.png)

<p align="center">
   &nbsp&nbsp <a href="https://docs.emberai.xyz/vibekit/introduction">Documentation </a> &nbsp&nbsp | &nbsp&nbsp <a href="https://github.com/EmberAGI/arbitrum-vibekit/tree/main/CONTRIBUTIONS.md"> Contributions </a> &nbsp&nbsp | &nbsp&nbsp <a href="https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/agent-node"> Agent Node</a>  &nbsp&nbsp |  &nbsp&nbsp   <a href="https://www.emberai.xyz/"> Ember AI</a>  &nbsp&nbsp | &nbsp&nbsp  <a href="https://discord.com/invite/bgxWQ2fSBR"> Support Discord </a>  &nbsp&nbsp | &nbsp&nbsp  <a href="https://t.me/EmberChat"> Ember Telegram</a>  &nbsp&nbsp | &nbsp&nbsp  <a href="https://x.com/EmberAGI"> 𝕏 </a> &nbsp&nbsp
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

### Core Features

- **Agent Node Framework**: Modern config-driven framework with full A2A protocol compliance, generator-based workflows, and embedded wallet support for building production-ready autonomous agents

- **Model Context Protocol (MCP)**: Standardized integration layer for connecting agents with tools and external data sources, enabling modular and extensible agent capabilities

- **X402 Payment Protocol**: HTTP-native payment infrastructure for autonomous agent commerce, supporting micropayments and service monetization

- **Agent-to-Agent (A2A) Communication**: Built-in protocol support enabling seamless collaboration and communication between multiple agents

- **EIP-8004 On-Chain Registration**: Decentralized agent identity registration following the EIP-8004 standard, enabling verifiable agent ownership, discoverability through on-chain registries, and cross-platform compatibility

- **Composable DeFi Workflows**: Workflow system enabling multi-step operations with pause/resume capabilities, allowing agents to orchestrate complex DeFi strategies across protocols

- **Ember Plugin System**: Modular architecture for DeFi protocols with standardized entity mapping, comprehensive type safety, and intelligent routing for optimized execution across multiple protocols

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
│   ├── community/                  # Community contributions
│   │   ├── agents/                 # Community-contributed agent templates
│   │   └── mcp-tools/              # Community MCP tool server implementations
│   ├── lib/                        # Core framework libraries such as MCP tools, Ember API, etc.
│   │   ├── a2a-types/              # Agent-to-Agent type definitions
│   │   ├── agent-node/             # Agent Node framework (v3.0+) - Config-driven A2A-compliant agents with X402 payments
│   │   ├── ember-api/              # Ember AI API client
│   │   ├── ember-schemas/          # Schema definitions
│   │   └── test-utils/             # Testing utilities and helpers
│   └── onchain-actions-plugins/    # Ember plugin system
├── CHANGELOG.md
├── CLAUDE.md
├── CONTRIBUTIONS.md
├── LICENSE
└── README.md
```

### Key Directories

- **[`agent-node/`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/agent-node)**: The modern config-driven agent framework with full A2A protocol compliance, generator-based workflows, embedded wallet support, and X402 payment protocol integration for autonomous agent commerce. This is the recommended framework for building new agents.

- **[`templates/`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates)**: Official Vibekit agent templates featuring production-ready implementations with skills, tools, hooks, and modern deployment patterns. These serve as reference implementations for building your own agents.

- **[`community/`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/community)**: Community contributions including agent templates and MCP tool server implementations. This is where developers can contribute their own specialized agents and tools to expand Vibekit's ecosystem.

- **[`clients/web`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/clients/web)**: Vibekit web frontend, featuring wallet integration, agent chat interface, and real-time MCP communication for DeFi agent interactions.

- **[`onchain-actions-plugins/`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/onchain-actions-plugins)**: The Ember Plugin System providing a registry for on-chain action plugins and smart contract integrations with extensible architecture for adding new blockchain protocols.

## ⚡ Quickstart

[Agent Node](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/agent-node) is Vibekit's modern framework for building production-ready autonomous with no coding required. Simply chat with your agent in natural language to execute complex DeFi strategies, orchestrate multi-step operations, and communicate with other agents. Follow the steps below to get started:

### Prerequisites

Before you begin, ensure you have:

1. Node.js 18+
2. AI Provider API Key (from OpenRouter, OpenAI, xAI, or Hyperbolic)

### 1. Initialize Config Workspace

> [!NOTE]
> You can initialize Agent Node anywhere on your system. To take advantage of Vibekit's offered tools and capabilities, we recommend creating your agent node in the [community agent directory](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/community/agents).

```bash
npx -y @emberai/agent-node@latest init
```

> [!NOTE]
> During initialization, you'll be prompted with optional EIP-8004 registration configuration for on-chain agent identity. See the [Agent Node documentation](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/agent-node#on-chain-agent-registration) for details on these prompts.

This creates a `config/` directory with:

- `agent.md` - Base agent configuration including system prompt, model settings, A2A protocol card definition, and EIP-8004 registration details
- `agent.manifest.json` - Skill composition settings
- `skills/` - Directory for skill modules (includes `general-assistant.md` and `ember-onchain-actions.md`)
- `workflows/` - Directory for custom workflow implementations (includes `example-workflow.ts`, `usdai-strategy.ts`, and utility functions)
- `mcp.json` - MCP server registry
- `workflow.json` - Workflow plugin registry
- `README.md` - Config workspace documentation

### 2. Run the Server

Smart-start chat mode (connects to running agent or starts new server):

```bash
npx -y @emberai/agent-node@latest
```

### 3. Time to Profit!

You can now build and execute any DeFi strategy through simple conversation with the Agent Node.

## 🔧 Build Your Own Agent

Once you have Agent Node running, customizing your agent is as simple as editing configuration files. Your `config/` directory contains everything needed to define your agent's personality, capabilities, and behavior.

### Key Configuration Files

**`agent.md`** - Your agent's core identity and system prompt. Modify this to:

- Define your agent's personality and expertise (trading specialist, yield farmer, etc.)
- Set AI model preferences (OpenAI, Anthropic, xAI, etc.)
- Configure A2A protocol card for agent-to-agent communication
- Set up EIP-8004 on-chain registration details

**`skills/`** - Modular capabilities that compose your agent's skillset:

- `general-assistant.md`: Basic conversational and reasoning abilities
- `ember-onchain-actions.md`: DeFi operations (swaps, lending, staking, etc.)
- Add custom skills by creating new `.md` files with specific tool access

**`workflows/`** - Custom multi-step operations for complex strategies:

- `example-workflow.ts`: Template for building your own workflows
- `usdai-strategy.ts`: Sample yield farming strategy implementation
- Create TypeScript files for sophisticated DeFi automation

**`agent.manifest.json`**: Controls which skills and workflows are active

**`mcp.json`**: Registry for Model Context Protocol servers and tools

**`workflow.json`**: Registry for custom workflow plugins

### Advanced Configuration

For detailed configuration options, workflow creation, and advanced features like on-chain registration, see the comprehensive [Agent Node documentation](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/agent-node).

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

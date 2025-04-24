[GRAPHIC]
Vibecode DeFi agents in minutes.

## Table of Contents

1.  [Introduction](#introduction)
2.  [Repository Organization](#repository-organization)
3.  [Quickstart](#quickstart)
4.  [IDE Setup](#ide-setup)
5.  [MCP Tools Integration](#mcp-tools-integration)
6.  [Contribution](#contribution)

## Introduction

Vibekit is a versatile toolkit for rapidly developing DeFi agents. It enables autonomous on-chain operations—such as token transfers, swaps, and advanced DeFi interactions—while integrating on-chain and off-chain data sources for powerful workflows. Vibekit offers ready-to-use implementations and templates across various sectors, helping you build production-ready agents in minutes.

[FLOWCHART]
~Vibekit is under constant development and is open to comunity contributions~ (link to contributions.md) (link to AI Trailblazer article)

## Repository Organization

Vibekit follows a monorepo structure, primarily focused on TypeScript packages. A Rust implementation is planned for release in the near future.

The repository layout is as follows:

```
vibetkit/
├── typescript/
│   └── examples/
│       └── lending-agent/
│       └── swapping-agent-no-wallet/
│       └── swapping-agent/
│----── lib/
│       └── a2a/
│       └── mcp-tools/
│           └── emberai-mcp/
├── CHANGELOG.md
├── CONTRIBUTIONS.md
├── LICENSE
├── README.md
```

## Quickstart

You can easily create a DeFi agent by following this guide:

1. Set up your local environment:

   Ensure that you have Node.js 22+ and pnpm installed.

   ```
   node -v # Should be 22+
   pnpm -v # Check that pnpm is installed
   ```

2. Clone the repository:
   ```
   git clone https://github.com/EmberAGI/arbitrum-vibekit.git
   cd arbitrum-vibekit
   ```

You are now prepared to leverage the sample implementations within our [`examples`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/examples) directory to extend your agent's capabilities.

## IDE Setup

To get the most out of Vibekit, we recommend using a vibe coding workflow: an approach that pairs AI copilots with structured tool contexts for a more fluid, conversational, and iterative development process. Below, you’ll find instructions on configuring your environment to set up a vibe coding workflow.

### What is Vibe Coding?

Vibe coding is a method of working side-by-side with an AI assistant in a shared environment that includes your project’s folder structure, tool capabilities, and any relevant data or schema, making its suggestions more targeted and accurate. Instead of issuing isolated prompts, you continuously refine your code within this context. This is particularly helpful when building agents, as you can dynamically piece together different tools and execution logic, while the AI remains aware of the larger project structure and goals.

### Cursor

We recommend using the Cursor IDE, which is built specifically for vibe coding with LLMs. Cursor allows you to:

- Define project context via a simple [.cursorrules](https://docs.cursor.com/context/rules-for-ai) file.

- Run local or remote AI agents directly inside your dev environment.

- Integrate with [MCP-powered](https://docs.cursor.com/context/model-context-protocol) tools and workflows.

### Agent Context

You can provide the following structured context in a `.cursorrules` file (or for any other AI agent) to work effectively with Arbitrum Vibekit:

```
You are a developer assistant embedded in a Web3 environment, focusing on  Arbitrum Vibekit: https://github.com/EmberAGI/arbitrum-vibekit.
These agents use MCP-compatible tools to carry out DeFi actions such as token transfers, swaps, lending, and governance.
Your goal is to help developers implement, customize, and test these tools in TypeScript using Zod schemas, ensuring all validation rules are properly applied.
By doing so, you enable fluid on-chain operations and integrations with various DeFi protocols, whether on local test networks or live Arbitrum deployments.

For your reference, here is the MCP Server Configuration:
 "mcpServers": {
    "local-npx-agent": {
      "command": "npx",
      "args": ["ts-node", "src/index.ts"],
      "env": {
        "NODE_ENV": "development"
      }
    },
    "production-agent": {
      "command": "node",
      "args": ["build/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
 }


Intructions:
Assist developers in building and registering new MCP tools using TypeScript and Zod, adhering to standardized handler patterns.

Keep the project structure consistent, ensuring each tool is well-documented and clearly integrated into the agent server codebase.

Provide guidance for debugging or extending on-chain agents deployed on Arbitrum.

Support DeFi activities that involve interactions with on-chain contracts, external APIs, or specialized protocols.

You may also be asked to suggest smart contract interactions, call on-chain data, or walk through logic for integrating agent actions into broader workflows. Be concise, technically accurate, and aligned with the modular design philosophy of MCP-based tools.

Follow naming and directory conventions established by Arbitrum Vibekit (e.g., storing tools under mcp-tools/{tools-folder}/src).

Rely on environment variables to transition between local and mainnet configurations without altering the code itself.
Never hard‑code sensitive data; always source credentials and user inputs from environment variables or secure store.

```

## MCP Tools Integration

Model Context Protocol (MCP) integration facilitates data connectivity between external providers and on-chain agents. In a typical MCP‑based system, tools are first registered with the MCP server, and the agents integrate by connecting to the server and discovering the registered tools. The agents then autonomously determine the optimal timing and method for calling each tool to fulfill complex tasks. After each invocation, the agent processes the returned results and incorporates them into its broader workflow, ensuring coherent outcomes. To learn more about the Model Context Protocol, visit the [official documentation](https://modelcontextprotocol.io/introduction) page.

The [`mcp-tools`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/mcp-tools) directory contains templates (`emberai-mcp/src/index.ts`) and guidelines for building these tools with minimal configuration.

## Contribution

If you wish to contribute to the project, please follow the CONTRIBUTIONS.md guidelines.

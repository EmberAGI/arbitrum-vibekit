Unlock Intelligent On-Chain Workflows in TypeScript for the Arbitrum Ecosystem.

## Table of Contents

1.  [Introduction](#introduction)
2.  [Repository Organization](#repository-organization)
3.  [Quickstart](#quickstart)
4.  [MCP Tools Integration](#mcp-tools-integration)
5.  [Contribution](#contribution)

## Introduction

Vibekit is a versatile toolkit for rapidly developing on-chain agents within the Arbitrum ecosystem. It enables autonomous on-chain operations—such as token transfers, swaps, and advanced DeFi interactions—while integrating on-chain and off-chain data sources for powerful workflows. Vibekit offers ready-to-use implementations and templates across various sectors, helping you build production-ready agents in minutes.

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

## MCP Tools Integration

Model Context Protocol (MCP) integration facilitates data connectivity between external providers and on-chain agents. In a typical MCP‑based system, tools are first registered with the MCP server, and the agents integrate by connecting to the server and discovering the registered tools. The agents then autonomously determine the optimal timing and method for calling each tool to fulfill complex tasks. After each invocation, the agent processes the returned results and incorporates them into its broader workflow, ensuring coherent outcomes. To learn more about the Model Context Protocol, visit the [official documentation](https://modelcontextprotocol.io/introduction) page.

The [`mcp-tools`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/mcp-tools) directory contains templates (`emberai-mcp/src/index.ts`) and guidelines for building these tools with minimal configuration.

## Contribution

If you wish to contribute to the project, please follow the CONTRIBUTIONS.md guidelines.

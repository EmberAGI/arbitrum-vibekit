![Graphic](img/Graphic.png)

<p align="center"> 
   📃 <a href="https://ember-ai.gitbook.io/arbitrum-vibekit">Documentation </a> &nbsp&nbsp | &nbsp&nbsp  🧰  <a href="https://github.com/EmberAGI/arbitrum-vibekit/tree/simplify-docs/typescript/examples"> Agent Templates</a>  &nbsp&nbsp | &nbsp&nbsp 🎨  <a href="https://questbook.emberai.xyz/"> GUI </a> &nbsp&nbsp| &nbsp&nbsp  💬  <a href=""> Discord </a>   &nbsp&nbsp | &nbsp&nbsp <a href=""> 𝕏  </a> &nbsp&nbsp
</p>

## 🧭 Table of Contents

- [Introduction](#introduction)
- [Repository Organization](#repository-organization)
- [Quickstart](#quickstart)
- [Vibe Coding](#vibe-coding)
- [MCP Integration](#mcp-integration)
- [Contribution](#contribution)

## 📙 Introduction

Welcome to Vibekit – your toolkit for building smart, autonomous DeFi agents that vibe with the blockchain. Whether you're automating trades, managing liquidity, or integrating with on-chain and off-chain data, Vibekit makes it smooth and fun.

At its core, Vibekit leverages the Model Context Protocol (MCP), a framework that standardizes how agents interact with tools and data. Vibekit syncs effortlessly with your current agent frameworks as well, just plug them in to level up your setup with no extra plumbing.

## 🧬 Repository Organization

Vibekit is structured as a monorepo with TypeScript at its core, with a Rust implementation is on the horizon. Here's how it's organized:

```
Vibekit/
├── typescript/
│   └── examples/
│       └── lending-agent-no-wallet/
│       └── liquidity-agent-no-wallet/
│       └── swapping-agent-no-wallet/
│       └── swapping-agent/
│----── lib/
│       └── a2a/
│       └── mcp-tools/
│           └── allora-mcp-server/
│           └── emberai-mcp/
├── CHANGELOG.md
├── CONTRIBUTIONS.md
├── LICENSE
├── README.md
```

- `examples/`: Playgrounds for different agent templates.

- `lib/`: Core libraries and tools.

- `mcp-tools/`: Implementations of MCP tools.

## ⚡ Quickstart

To start developing with the Vibekit:

**1. Set up your environment:**

Ensure that `Node.js` 22+ and `pnpm` are installed.

```
node -v # Should be 22+
pnpm -v # Check that pnpm is installed
```

**2. Clone the repository:**

```
git clone https://github.com/EmberAGI/arbitrum-vibekit.git
cd arbitrum-vibekit
```

**3. **
Dive into the [`examples/`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/examples) directory to explore other agent templates and start building your own.

## 🎧 Vibe Coding

Vibe Coding is all about teaming up with AI to streamline your development process. Instead of writing every line of code manually, you guide an AI assistant using natural language prompts. The AI understands your project's context—like folder structures, tools, and data schemas—and provides targeted suggestions to help you build more efficiently.

#### 🛠️ Setting Up Your IDE

To get started, we recommend using the [Cursor IDE](https://www.cursor.com/), an AI-powered development environment designed for smooth collaboration between you and your AI assistant.

With Cursor, you can:

- Define your project's context using simple rule files located in the[.cursor/rules](https://docs.cursor.com/context/rules) folder.

- Run AI agents locally or remotely within your development environment.

- Integrate with [MCP-powered](https://docs.cursor.com/context/model-context-protocol) tools and workflows for enhanced functionality.

By setting up your environment this way, you enable a more interactive and efficient workflow, allowing you to focus on building and refining your projects with the support of AI.

#### 🧠 Crafting Effective AI Prompts

To make the most of Vibe Coding, it's important to provide your AI assistant with clear and structured context. In the `.cursor/rules` folder, you can define the scope of your project, including its purpose, key components, and any relevant data schemas.

For example, if you're working on a DeFi agent using Vibekit, you might include information about the Model Context Protocol (MCP), the specific tools you're integrating, and the desired interactions with on-chain and off-chain data sources.

#### 🤖 Setting Up Agent Context

To maximize the benefits of vibe coding, it's essential to provide your AI assistant with structured context about your project. This ensures more accurate and relevant suggestions.

Here's an example of how to define your agent's context:

```
You are a developer assistant embedded in a Web3 environment, focusing on Arbitrum Vibekit: https://github.com/EmberAGI/arbitrum-vibekit. Vibekit enables autonomous on-chain operations and advanced DeFi interactions while integrating on-chain and off-chain data sources for powerful workflows. At the core of Vibekit is support for the Model Context Protocol (MCP), which standardizes how agent capabilities are defined and invoked. Vibekit can also be used alongside existing agent frameworks to extend their capabilities while building on top of their core functionalities.

Your goal is to help developers implement, customize, and test MCP tools in TypeScript using Zod schemas, ensuring all validation rules are properly applied. By doing so, you enable fluid on-chain operations and integrations with various DeFi protocols, whether on local test networks or live Arbitrum deployments.

Vibekit's MCP Architecture:
- An agent must always use MCP tools to interact with external services or perform actions.
- MCP servers may be connected to remotely via SSE/WebSocket pointing to a URL, or locally via STDIO pointing to a file within `typescript/lib/mcp-tools/`.
- New MCP tools must be added to or created as an MCP server within `typescript/lib/mcp-tools/`.
- An agent is always served as an MCP server itself.

Instructions:
- Assist developers in building and registering new MCP tools using TypeScript and Zod, adhering to standardized handler patterns.
- Keep the project structure consistent, ensuring each tool is well-documented and clearly integrated into the agent server codebase.
- Provide guidance for debugging or extending on-chain agents deployed on Arbitrum.
- Support DeFi activities that involve interactions with on-chain contracts, external APIs, or specialized protocols.
- You may also be asked to suggest smart contract interactions, call on-chain data, or walk through logic for integrating agent actions into broader workflows.
- Be concise, technically accurate, and aligned with the modular design philosophy of MCP-based tools.
- Follow naming and directory conventions established by Arbitrum Vibekit.
- Rely on environment variables to transition between local and mainnet configurations without altering the code itself.
- Never hard-code sensitive data; always source credentials and user inputs from environment variables or secure store.
```

## 🔌 MCP Integration

MCP (Model Context Protocol) makes it easy for on-chain agents to tap into external data and tools. Here’s how it works: tools get registered with the MCP server, and agents can plug in to browse what’s available, and start calling those tools whenever it makes sense. Agents may decide on their own when and how to use each tool, and they loop the results back into their flow, keeping everything running smoothly.
Want to dig deeper? Check out the [official MCP docs](https://modelcontextprotocol.io/introduction).

You’ll find our ready-to-go MCP tools and documentation in the [`mcp-tools`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/mcp-tools) directory, great for building your own tools with minimal setup.

## 🙌 Contribution

We welcome contributions from the community! If you’d like to help improve Vibekit —whether by adding new agent templates, adding new MCP tools, or fixing bugs— please check out our [Contributing Guidelines](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/CONTRIBUTIONS.md). To show our appreciation, we’re launching an incentive program that will reward valuable contributions. Join us in pushing the boundaries of DeFi innovation!

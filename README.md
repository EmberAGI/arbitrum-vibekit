![Graphic](img/Banner.png)

<p align="center"> 
   &nbsp&nbsp <a href="https://docs.emberai.xyz/vibekit/introduction">Documentation </a> &nbsp&nbsp | &nbsp&nbsp <a href="https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/examples"> Agent Playground</a>  &nbsp&nbsp |  &nbsp&nbsp   <a href="https://www.emberai.xyz/"> Ember AI</a>  &nbsp&nbsp | &nbsp&nbsp  <a href="https://discord.com/invite/bgxWQ2fSBR"> Support Discord </a>  &nbsp&nbsp | &nbsp&nbsp  <a href="https://t.me/EmberChat"> Ember Telegram</a>  &nbsp&nbsp | &nbsp&nbsp  <a href="https://x.com/EmberAGI"> 𝕏 </a> &nbsp&nbsp
</p>

## 🧭 Table of Contents

- [📙 Introduction](#-introduction)
- [🧬 Repository Organization](#-repository-organization)
- [⚡ Developer Quickstart](#-developer-quickstart)
- [🎧 Vibe Coding Guide](#-vibe-coding-guide)
- [🔌 MCP Explained](#-mcp-explained)
- [💰 Contributions & Bounties](#-contributions--bounties)

## 📙 Introduction

Welcome to Vibekit, the polyglot toolkit for vibe coding smart, autonomous DeFi agents that vibe with the blockchain. Whether you're automating trades, managing liquidity, or integrating with on-chain and off-chain data, Vibekit makes it effortless and fun.

At its core, Vibekit uses the Model Context Protocol (MCP) to standardize how agents connect with tools and data. It includes built-in Agent2Agent (A2A) integration, so the agents can easily work together. Vibekit also works smoothly with popular frameworks like Eliza and LangGraph, just add our MCP tools to your existing agents and watch them level up with DeFi superpowers!

Here's an overview of how everything fits together:

<p align="left">
  <img src="img/Flow Chart.png" width="800px" alt="FlowChart"/>
</p>

## 🧬 Repository Organization

Vibekit is structured as a monorepo with TypeScript at its core, with a Rust implementation is on the horizon. Here's how it's organized:

```
Vibekit/
├── typescript/
|   └── clients/
|       └── web/
│   └── examples/
│       └── lending-agent-no-wallet/
│       └── liquidity-agent-no-wallet/
│       └── pendle-agent/
│       └── swapping-agent-no-wallet/
│       └── swapping-agent/
│   └── templates/
│       └── lending-agent/
│       └── quickstart-agent/
│----── lib/
│       └── a2a/
│       └── arbitrum-vibekit-core/
│       └── ember-schemas/
│       └── mcp-tools/
│           └── allora-mcp-server/
│           └── emberai-mcp/
│       └── test-utils/
│----── test/
├── CHANGELOG.md
├── CONTRIBUTIONS.md
├── LICENSE
├── README.md
```

- `clients/`: Clients for front-end interaction with agents.

- `examples/`: Playground for different agent templates.

- `lib/`: Core libraries and tools.

- `mcp-tools/`: Implementations of MCP tools.

## ⚡ Developer Quickstart

Follow these steps to build and run a DeFi agent:

### 1. Set Up Your Environment:

Ensure that `Node.js` 22+ and `pnpm` are installed.

```
node -v # Should be 22+
pnpm -v # Check that pnpm is installed
```

### 2. Get the Code:

How you get the code depends on whether you want to simply run the project or contribute to its development. If you just want to run Vibekit locally or explore the codebase, you can clone the repository through command line or your preferred IDE:

```
git clone https://github.com/EmberAGI/arbitrum-vibekit.git &&
cd arbitrum-vibekit
```

If you plan to contribute changes to Vibekit, fork the repository on [Vibekit's Github page](https://github.com/EmberAGI/arbitrum-vibekit) and clone your fork locally. Replace `YOUR_USERNAME` with your GitHub username:

```
git clone https://github.com/YOUR_USERNAME/arbitrum-vibekit.git &&
cd arbitrum-vibekit
```

For more detailed contribution steps, please see our [Contribution Guidelines](CONTRIBUTIONS.md).

### 3. Run Your DeFi Agent:

Let's run the lending agent. The lending agent is started by default when the frontend is started. Follow this guide to launch the frontend:

#### Prerequisites

Make sure you have [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed on your system.

**Note:** If your are on an M-series Mac, you need to install Docker using the [dmg package](https://docs.docker.com/desktop/setup/install/mac-install/) supplied officially by Docker rather than through Homebrew or other means to avoid build issues.

#### Running the Frontend

**1. Configure environment variables:**

Navigate to the [typescript](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript) directory and create a `.env` file by copying the example template:

```bash
cd typescript &&
cp .env.example .env
```

Make sure to populate the `.env` with your API keys and configurations.

**2. Start services with Docker Compose:**

From the [typescript](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript) directory, run the following command to build and start the frontend and its associated services (including the lending agent, and the database):

```bash
# Ensure you are in the typescript/ directory
docker compose up
```

**3. Access Vibekit's web interface:**

Open your web browser and navigate to http://localhost:3000. To be able to use the web interface, you need to connect your wallet first. Click on "Connect Wallet" to get started:

<p align="left">
  <img src="img/wallet.png" width="900px" alt="wallet"/>
</p>

After setting up your wallet, you can interact with the lending agent through the chat interface:

<p align="left">
  <img src="img/frontend.png" width="900px" alt="frontend"/>
</p>

#### Integrating a Custom Agent

To integrate another example agent or a custom agent into the frontend, refer to [this guide](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/README.md#agent-configuration).

### 4. Build Your Custom DeFi Agent:

Checkout the [examples/](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/examples) directory to explore other agent templates and start building your own!

## 🎧 Vibe Coding Guide

Vibe coding is all about teaming up with AI to enhance your development process. Instead of writing every line of code manually, you guide an AI assistant using natural language prompts. The AI understands your project's context (such as folder structures, tools, and data schemas) and provides targeted suggestions to help you build more efficiently.

Vibekit enables you to build and customize DeFi agents through vibe coding. Whether you're creating a swapping agent, a lending agent, or a liquidity provider, you can describe your agent's behavior in natural language and let the AI help you implement it. The framework provides pre-built tools for common DeFi operations, MCP integration for external data, and a structured way to define your agent's capabilities through rules files.

### 🤖 Vibe Coding DeFi Agents

Ready to vibe with some DeFi agents? to run any of the existing agents or vibe code your own, head over to [the agent playground](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/examples/README.md).

### 🧠 Crafting Effective AI Prompts

To make the most of vibe coding, it's important to provide your AI assistant with clear and structured context. In the `.cursor/rules` folder, you can define the scope of your project, including its purpose, key components, and any relevant data schemas.

#### 📝 Vibekit's Cursor Rules Structure

Vibekit's rules files are located in the project's [`arbitrum-vibekit/.cursor/rules`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/.cursor/rules) directory. These files define best practices, workflows, and workspace conventions for building and maintaining agents:

- **createAgent.mdc**

  A guide for creating and configuring new agents, including best practices, required dependencies, and setup instructions.

- **vibeCodingWorkflow.mdc**

  Outlines the step-by-step development workflow for agents, including the Planner/Executor roles, task breakdowns, and conventions for collaborative development.

- **workspaceRules.mdc**

  Documents workspace-wide guidelines and best practices for the monorepo, such as dependency management, development scripts, and CI/CD standards.

#### 🔄 Extending and Maintaining Rules

Here's a guidelines for adding or editing rules:

- **Add a New Rule File**

  Create a new `.mdc` file in `.cursor/rules` if you want to introduce a new agent type, workflow, or set of best practices. Follow the structure of the existing files for consistency.

- **Update Existing Rules:**
  - Edit `createAgent.mdc` to add new agent configuration options, initialization parameters, or tool integrations.
  - Update `vibeCodingWorkflow.mdc` to refine development workflows, add new patterns, or document troubleshooting steps.
  - Revise `workspaceRules.mdc` to keep workspace-wide practices and scripts up to date.

Keep these files current to ensure your team and agents always follow the latest best practices and workflows.

## 🔌 MCP Explained

MCP (Model Context Protocol) makes it easy for on-chain agents to tap into external data and tools. Here's how it works: tools get registered with the MCP server, and agents can plug in to browse what's available, and start calling those tools whenever it makes sense. Agents may decide on their own when and how to use each tool, and they use the results to inform their next actions to enable autonomous decision-making.

Want to dig deeper? Check out the [official MCP docs](https://modelcontextprotocol.io/introduction).

### 🤝 Vibekit's MCP Integrations

Vibekit integrates MCP in three powerful ways:

#### 1. Built-in MCP Tools

Vibekit comes with a suite of implemented MCP tools in the [mcp-tools](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/mcp-tools) directory:

- Access real-time market data and on-chain information
- Interact with DeFi protocols and smart contracts
- Execute complex trading and liquidity operations
- Each tool is designed to be easily integrated with any MCP-compatible agent

#### 2. Framework Integration

Vibekit integrates with popular agent frameworks like Eliza, allowing them to:

- Access standardized tool interfaces through MCP
- Maintain their existing functionality while gaining new capabilities
- Use Vibekit's pre-built tools without modifying their core architecture

#### 3. Agent as MCP Server

Every agent built with Vibekit is itself an MCP server, which means:

- Agents can expose their own capabilities as MCP tools
- Other agents can discover and use these capabilities
- Agents can be both consumers and providers of MCP tools
- This creates a network of interoperable agents

### 🛠️ Creating Your Own MCP Tools

You'll find a collection of ready-to-use MCP tools, along with step-by-step guidelines for creating your own, in our [mcp-tools](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/mcp-tools) directory.

## 💰 Contributions & Bounties

We welcome contributions from the community! If you'd like to help improve Vibekit, please check out our [Contribution Guidelines](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/CONTRIBUTIONS.md). These guidelines detail the process for forking the repository, making your changes, and submitting a pull request.

To show our appreciation, we have launched an [incentive program](https://docs.google.com/forms/d/e/1FAIpQLSe-GF7UcUOuyEMsgnVpLFrG_W83RAchaPPqOCD83pZaZXskgw/viewform) that rewards [valuable contributions](https://github.com/orgs/EmberAGI/projects/13) to the Vibekit. Checkout our [blog post](https://www.emberai.xyz/blog) to learn more!

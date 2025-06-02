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

At its core, Vibekit uses the Model Context Protocol (MCP) to standardize how agents connect with tools and data. It also includes built-in Agent2Agent (A2A) integration, so the agents can easily work together. Vibekit also works smoothly with popular frameworks like Eliza and LangGraph, just add our MCP tools to your existing agents and watch them level up with DeFi superpowers!

Here's an overview of how everything fits together:

<p align="left">
  <img src="img/Flow Chart.png" width="800px" alt="FlowChart"/>
</p>

**_Development Status_:**

Vibekit is growing fast and already gives you everything you need to start building. The docs and codebase are ready for you to use, and we're always improving things as we get closer to a full v1.0 launch. We'd love your feedback and contributions to help shape the future of Vibekit!

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
│----── lib/
│       └── a2a/
│       └── arbitrum-vibekit/
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

### 2. Clone the Repository:

You can do so though the command line or through your preferred IDE.

```
git clone https://github.com/EmberAGI/arbitrum-vibekit.git
cd arbitrum-vibekit
```

We recommend using the [Cursor IDE](https://www.cursor.com/).

<p align="left">
  <img src="img/cursor.png" width="900px" alt="cursor"/>
</p>

### 3. Run Your DeFi Agent:

Let's run the Lending Agent. Head over to the [lending-agent-no-wallet](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/examples/lending-agent-no-wallet) directory and create a `.env` file with the following required variables. Alternatively, you can create your `.env` file by copying the `.env.example` template in the agent's directory. Make sure to populate the `.env` file with the necessary configuration settings and API keys specific to your setup.

```env
OPENROUTER_API_KEY=your_openrouter_api_key
QUICKNODE_SUBDOMAIN=your_quicknode_subdomain
QUICKNODE_API_KEY=your_quicknode_api_key
OPENAI_API_KEY=your_openai_api_key

EMBER_ENDPOINT=grpc.api.emberai.xyz:50051
RPC_URL=https://arbitrum.llamarpc.com
AGENT_CACHE_TOKENS=false
PORT=3001

```

Next, navigate to the `typescript` directory and run the following `pnpm` commands to build and start your agent:

```
cd typescript &&
pnpm install &&
pnpm build &&
pnpm --filter "lending-agent-no-wallet" dev
```

Alternatively, you can use Docker to start up the agent:

```
cd typescript &&
pnpm build &&
sudo pnpm --filter "lending-agent-no-wallet" docker:compose:up
```

### 4. Interact With the DeFi Agent:

Once the agent is up and running, you have three ways of interacting with it:

**1. Vibekit Web Interface**

**2. Integrate With Cursor IDE**

To interact with the Lending Agent though Cursor, [create or update](https://docs.cursor.com/context/model-context-protocol) your `mcp.json` file through Cursor's MCP settings with the following content. If your agent is running on a different port than `3001`, make sure to adjust it:

```
{
 "mcpServers": {
   "local-sse-agent": {
     "url": "http://localhost:3001/sse"
   }
 }
}
```

You might need to restart Cursor to apply the new configuration. Upon successful integration, the MCP settings should look like this:

<p align="left">
  <img src="img/mcp.png" width="800px" alt="MCP"/>
</p>

Cursor will now automatically detect the Lending Agent MCP tool and you can interact with it directly through prompts.

### 5. Build Your Custom DeFi Agent:

Checkout the [examples/](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/examples) directory to explore other agent templates and start building your own!

## 🎧 Vibe Coding Guide

Vibe coding is all about teaming up with AI to enhance your development process. Instead of writing every line of code manually, you guide an AI assistant using natural language prompts. The AI understands your project's context (such as folder structures, tools, and data schemas) and provides targeted suggestions to help you build more efficiently.

Vibekit enables you to build and customize DeFi agents through vibe coding. Whether you're creating a swapping agent, a lending agent, or a liquidity provider, you can describe your agent's behavior in natural language and let the AI help you implement it. The framework provides pre-built tools for common DeFi operations, MCP integration for external data, and a structured way to define your agent's capabilities through rules files.

### 🛠️ Setting Up Your IDE

To get started, we recommend using the [Cursor IDE](https://www.cursor.com/), an AI-powered development environment designed for smooth collaboration between you and your AI assistant. With Cursor, you can:

- Define your project's context using simple rule files located in the [.cursor/rules](https://docs.cursor.com/context/rules) folder.

- Run AI agents locally or remotely within your development environment.

- Integrate with [MCP-powered](https://docs.cursor.com/context/model-context-protocol) tools and workflows for advanced functionality.

To clone Vibekit in Cursor:

1. Open Cursor and click "Clone Repository" in the welcome screen.
2. Paste the repository URL: `https://github.com/EmberAGI/arbitrum-vibekit.git`.
3. Choose your local directory and click "Clone".

<p align="left">
  <img src="img/cursor.png" width="900px" alt="cursor"/>
</p>

Once cloned, Cursor will automatically detect the `.cursor/rules` folder and set up the AI context.

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

### 🤝 Our MCP Integrations

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

We welcome contributions from the community! If you'd like to help improve Vibekit, please check out our [Contribution Guidelines](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/CONTRIBUTIONS.md).

To show our appreciation, we have launched an incentive program that rewards [valuable contributions](https://github.com/orgs/EmberAGI/projects/13) to the Vibekit. Checkout our blog post to learn more!

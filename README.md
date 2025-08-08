![Graphic](img/Banner.png)

<p align="center"> 
   &nbsp&nbsp <a href="https://docs.emberai.xyz/vibekit/introduction">Documentation </a> &nbsp&nbsp | &nbsp&nbsp <a href="https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates"> Agent Templates</a>  &nbsp&nbsp |  &nbsp&nbsp   <a href="https://www.emberai.xyz/"> Ember AI</a>  &nbsp&nbsp | &nbsp&nbsp  <a href="https://discord.com/invite/bgxWQ2fSBR"> Support Discord </a>  &nbsp&nbsp | &nbsp&nbsp  <a href="https://t.me/EmberChat"> Ember Telegram</a>  &nbsp&nbsp | &nbsp&nbsp  <a href="https://x.com/EmberAGI"> 𝕏 </a> &nbsp&nbsp
</p>

## 🧭 Table of Contents

- [📙 Introduction](#-introduction)
- [🧬 Repository Organization](#-repository-organization)
- [⚡ Developer Quickstart](#-developer-quickstart)
- [🎧 Vibe Coding Guide](#-vibe-coding-guide)
- [🔌 MCP Explained](#-mcp-explained)
- [💰 Contributions & Bounties](#-contributions--bounties)

## 📙 Introduction

Welcome to Vibekit, the polyglot toolkit for vibe coding smart, autonomous DeFi agents that can perform complex on-chain operations. Whether you're automating trades, managing liquidity, or integrating with blockchain data, Vibekit makes it simple to create intelligent agents that understand natural language and execute sophisticated workflows.

At its core, Vibekit uses the Model Context Protocol (MCP) to standardize how agents connect with tools and data. It includes built-in Agent2Agent (A2A) integration, so the agents can easily work together. Vibekit also works smoothly with popular frameworks like Eliza and LangGraph, allowing you to enhance your existing agents with our specialized DeFi tools.

Here's an overview of how everything fits together:

<p align="left">
  <img src="img/Flow Chart.png" width="800px" alt="FlowChart"/>
</p>

### 📚 Vibekit Concepts

For deeper understanding of Vibekit concepts, explore our comprehensive lesson series in [this directory](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/arbitrum-vibekit-core/docs). These lessons cover everything from basic concepts to advanced agent development patterns, including skills architecture, LLM orchestration, deployment strategies, and production best practices.

## 🧬 Repository Organization

Vibekit is structured as a monorepo with TypeScript at its core, with a Rust implementation on the horizon. Here's how it's organized:

```
Vibekit/
├── .claude/                        # Claude AI prompt engineering files
├── .cursor/                        # Cursor IDE rules and configuration
├── .github/                        # GitHub Actions and configurations
├── .vscode/                        # VSCode workspace settings
├── typescript/                     # Main monorepo workspace
│   ├── clients/
│   │   └── web/                    # Frontend for interacting with agents
│   ├── templates/                  # Agent templates
│   ├── examples/                   # [Legacy] Older architecture examples
│   ├── lib/
│   │   ├── arbitrum-vibekit-core/  # Core framework implementation
│   │   ├── ember-api/              # Ember API client
│   │   ├── ember-schemas/          # Schema definitions
│   │   ├── mcp-tools/              # MCP tool server implementations
│   │   ├── test-utils/             # Testing utilities
│   │   └── a2a-types/              # Agent-to-Agent type definitions
│   ├── test/                       # Integration tests
│   └── scripts/                    # Build and utility scripts
├── img/                            # Documentation images
├── CHANGELOG.md
├── CONTRIBUTIONS.md
├── LICENSE
└── README.md
```

### Key Directories

- **`templates/`**: Production-ready agent templates with skills, tools, hooks, and modern deployment patterns. **Start here for new projects.**

- **`examples/` [Legacy]**: Older architecture examples. Use templates instead for new development.

- **`clients/web/`**: Web frontend for interacting with agents via MCP.

- **`lib/`**: Core framework libraries and supporting packages:

- **`.cursor/`**: Cursor IDE configuration and development rules for vibe coding.

- **`.claude/`**: Claude AI prompt engineering files.

## ⚡ Developer Quickstart

Follow these steps to build and run DeFi agents:

### 1. Get the Code

How you get the code depends on whether you want to simply run the project or contribute to its development. If you just want to run Vibekit locally or explore the codebase, you can clone the repository through command line or your preferred IDE:

```
git clone https://github.com/EmberAGI/arbitrum-vibekit.git &&
cd arbitrum-vibekit
```

If you plan to contribute changes to Vibekit, fork the repository on the Github page and clone your fork locally. Replace `YOUR_USERNAME` with your GitHub username:

```
git clone https://github.com/YOUR_USERNAME/arbitrum-vibekit.git &&
cd arbitrum-vibekit
```

For more detailed contribution steps, please see our [Contribution Guidelines](CONTRIBUTIONS.md).

### 2. Run DeFi Agents

Let's run the swapping and lending agents. These agents are started by default when the frontend is started. Follow this guide to launch the frontend:

- **Prerequisites:**

Make sure you have [Docker Desktop](https://www.docker.com/products/docker-desktop/) with Docker Compose v2.24 or greater installed on your system.

> [!NOTE]  
> If you are on an M-series Mac, you need to install Docker using the [dmg package](https://docs.docker.com/desktop/setup/install/mac-install/) supplied officially by Docker rather than through Homebrew or other means to avoid build issues.

- **Configure Environment Variables:**

Navigate to the [typescript](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript) directory and create a `.env` file by copying the example template:

```bash
cd typescript &&
cp .env.example .env
```

Open the `.env` file and fill in the required values. At minimum, you need:

- Your preferred AI provider API key (e.g., `OPENROUTER_API_KEY`, `OPENAI_API_KEY`)
- Generate a secure `AUTH_SECRET` (you can use https://generate-secret.vercel.app/32 or `openssl rand -base64 32`)

**Optional:** Other agents like Allora price prediction may require additional API keys.

- **Start Services:**

```bash
# Start the web frontend and default agents
docker compose up
```

> [!NOTE]  
> If you get a `permission denied error`, try running the above command with `sudo`:
>
> ```bash
> sudo docker compose up
> ```

> [!WARNING]
> If you previously ran `docker compose up` with an older version of this repository and encounter frontend errors or database-related errors in the `docker service logs`, follow these steps:
>
> 1. Clear your browser cache.
> 2. Run the following command in your terminal:
>    ```bash
>    docker compose down && docker volume rm typescript_db_data && docker compose build web --no-cache && docker compose up
>    ```

- **Access the Web Interface:**

Once all services are running, open your browser and navigate to http://localhost:3000. To be able to chat with the agents, you need to connect your wallet first. Click on "Connect Wallet" to get started:

<p align="left">
  <img src="img/wallet.png" width="900px" alt="wallet"/>
</p>

After setting up your wallet, you'll see the Vibekit web interface where you can explore different agent capabilities:

<p align="left">
  <img src="img/frontend.png" width="900px" alt="frontend"/>
</p>

- **Integrate Other Agents:**

  Checkout the [templates/](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates) directory to explore other Vibekit agents. To integrate any other example agents into the frontend, refer to [this guide](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/clients/web#agent-configuration).

### 3. Build Your Custom DeFi Agent

To build your own agent, we recommend using our [Quickstart Agent template](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates/quickstart-agent). It provides all the necessary boilerplate code so you can start building right away. Follow these steps to integrate and run the Quickstart Agent:

- **Enable the Quickstart Agent in the Frontend:**

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

- **Add the Agent to Docker Compose:**

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

- **Configure the Agent's Environment:**

Navigate to the agent's directory and create a local `.env` by copying the`.env.example` file. Make sure to populate the `.env` file with your API keys and configurations:

```bash
cd typescript/templates/quickstart-agent && cp .env.example .env
```

- **Rebuild and Restart Services:**

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

## 🎧 Vibe Coding Guide

Vibe coding is all about teaming up with AI to enhance your development process. Instead of writing every line of code manually, you guide an AI assistant using natural language prompts. The AI understands your project's context (such as folder structures, tools, and data schemas) and provides targeted suggestions to help you build more efficiently.

Vibekit enables you to build and customize DeFi agents through vibe coding. Whether you're creating a swapping agent, a lending agent, or a liquidity provider, you can describe your agent's behavior in natural language and let the AI help you implement it. The framework provides pre-built tools for common DeFi operations, MCP integration for external data, and a structured way to define your agent's capabilities through rules files.

### 🤖 Vibe Coding DeFi Agents

Ready to vibe with some DeFi agents? to run any of the existing agents or vibe code your own, head over to [the agent playground](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates).

### 🧠 Crafting Effective AI Prompts

To make the most of vibe coding, it's important to provide your AI assistant with clear and structured context. This is done through prompt engineering files that define the scope of your project, including its purpose, key components, and any relevant data schemas.

#### 📝 Claude Prompt Engineering

For Claude models, prompt engineering is handled through a set of dedicated files in the project's [`.claude/`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/.claude) directory. These files include detailed instructions, examples, and best practices to guide the AI in generating accurate and efficient code:

- **agents/**: Contains prompts for persona-driven agents that specialize in tasks like Test-Driven Development, documentation, and feature writing.
- **commands/**: Includes prompts that define high-level command structures for planning, execution, and version control.
- **hooks/**: Provides scripts that can be triggered at different stages of the development lifecycle, such as pre-task and post-task actions.

#### Extending and Maintaining Claude Prompts

- **Add a New Prompt File** – Place your Markdown prompt in the relevant sub-directory (`agents`, `commands`, or `hooks`). Keep filenames short and descriptive.
- **Update Existing Prompts** – Edit the appropriate file and describe the change clearly in your commit message.
- **Best Practices** – Keep prompts concise, include concrete examples, and document any assumptions for future contributors.

#### 📝 Cursor Prompt Engineering

Vibekit's rules files are located in the project's [`arbitrum-vibekit/.cursor/rules`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/.cursor/rules) directory. These files define best practices, workflows, and workspace conventions for building and maintaining agents:

- **createVibekitAgent.mdc**

  A guide for creating and configuring new agents, including best practices, required dependencies, and setup instructions.

- **vibeCodingWorkflow.mdc**

  Outlines the step-by-step development workflow for agents, including the Planner/Executor roles, task breakdowns, and conventions for collaborative development.

- **workspaceRules.mdc**

  Documents workspace-wide guidelines and best practices for the monorepo, such as dependency management, development scripts, and CI/CD standards.

#### Extending and Maintaining Cursor Rules

Here's guidelines for adding or editing rules:

- **Add a New Rule File**

  Create a new `.mdc` file in `.cursor/rules` if you want to introduce a new agent type, workflow, or set of best practices. Follow the structure of the existing files for consistency.

- **Update Existing Rules:**
  - Edit `createVibekitAgent.mdc` to add new agent configuration options, initialization parameters, or tool integrations.
  - Update `vibeCodingWorkflow.mdc` to refine development workflows, add new patterns, or document troubleshooting steps.
  - Revise `workspaceRules.mdc` to keep workspace-wide practices and scripts up to date.

Keep these files current to ensure your team and agents always follow the latest best practices and workflows.

## 🔌 MCP Explained

MCP (Model Context Protocol) makes it easy for on-chain agents to tap into external data and tools. Here's how it works: tools get registered with the MCP server, then agents can plug in to browse what's available and start calling those tools whenever it makes sense. Agents may decide on their own when and how to use each tool, and they use the results to inform their next actions to enable autonomous decision-making.

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

To show our appreciation, we have launched an [incentive program](https://docs.google.com/forms/d/e/1FAIpQLSe-GF7UcUOuyEMsgnVpLFrG_W83RAchaPPqOCD83pZaZXskgw/viewform) that rewards [valuable contributions](https://github.com/orgs/EmberAGI/projects/13) to the Vibekit. Checkout our [blog post](https://www.emberai.xyz/blog/introducing-arbitrum-vibekit-and-the-trailblazer-fund-2-0) to learn more!

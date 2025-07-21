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

Welcome to Vibekit, the v2 framework for building smart, autonomous DeFi agents with skills, tools, and LLM orchestration. Whether you're automating trades, managing liquidity, or integrating with on-chain and off-chain data, Vibekit v2 makes it effortless and powerful.

At its core, the v2 framework uses **skills** (high-level capabilities) that intelligently coordinate **tools** (specific actions) through LLM orchestration. Built on the Model Context Protocol (MCP) with StreamableHTTP transport, it includes Agent2Agent (A2A) integration and modern deployment patterns. Vibekit works smoothly with popular frameworks like Eliza and LangGraph - just add our MCP tools to your existing agents and watch them level up with DeFi superpowers!

Here's an overview of how everything fits together:

<p align="left">
  <img src="img/Flow Chart.png" width="800px" alt="FlowChart"/>
</p>

## 🧬 Repository Organization

Vibekit is structured as a monorepo with TypeScript at its core, organized around the v2 framework architecture:

```
Vibekit/
├── typescript/
|   └── clients/
|       └── web/                    # Frontend for interacting with agents
│   └── templates/                  # 🆕 V2 agent templates (recommended)
│       ├── quickstart-agent/       # Complete example with all v2 features
│       ├── ember-agent/            # Multi-skill DeFi agent
│       ├── lending-agent/          # Aave lending operations
│       ├── allora-price-prediction-agent/ # Price prediction with Allora
│       └── langgraph-workflow-agent/      # LangGraph integration example
│   └── examples/                   # [Legacy] Older architecture examples
│-------- lib/
│       └── arbitrum-vibekit-core/  # V2 framework core
│       └── ember-schemas/          # Schema definitions
│       └── mcp-tools/              # MCP tool server implementations
│       └── test-utils/             # Testing utilities
│-------- test/                     # Integration tests
├── CHANGELOG.md
├── CONTRIBUTIONS.md
├── LICENSE
├── README.md
```

### Key Directories

- **`templates/`**: Production-ready v2 agent templates with skills, tools, hooks, and modern deployment patterns. **Start here for new projects.**

- **`examples/` [Legacy]**: Older architecture examples. Use templates instead for new development.

- **`clients/web/`**: Web frontend for interacting with agents via MCP.

- **`lib/arbitrum-vibekit-core/`**: The v2 framework providing skills, tools, LLM orchestration, and modern transport.

- **`mcp-tools/`**: MCP server implementations for external services.

## ⚡ Developer Quickstart

Follow these steps to build and run v2 DeFi agents:

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

### 2. Run V2 DeFi Agents

Let's run the ember agent that demonstrates the v2 framework's multi-skill architecture. This agent supports token swapping, lending operations, and documentation queries.

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

This command will start:

- **Web Frontend** on http://localhost:3000
- **Ember Agent** (multi-skill DeFi agent) on port 3001
- **Supporting services** (database, etc.)

> [!WARNING]  
> The first time you run this command, Docker will download and build several images, which may take 5-10 minutes depending on your internet connection and system performance.

- **Access the Web Interface:**

Once all services are running (you'll see log output from multiple containers), open your browser and navigate to:

**🌐 http://localhost:3000**

You'll see the Vibekit web interface where you can:

- Chat with the ember agent using natural language
- Try commands like "What tokens can I swap?" or "Show me my Aave positions"
- Explore the agent's skills through the UI

### 3. Explore V2 Agent Templates

The [`templates/`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates) directory contains production-ready v2 agent examples:

- **[`quickstart-agent`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates/quickstart-agent)**: Complete v2 example with skills, tools, hooks, and multiple AI providers
- **[`ember-agent`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates/ember-agent)**: Multi-skill DeFi agent with swapping, lending, and documentation
- **[`lending-agent`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates/lending-agent)**: Focused Aave lending operations
- **[`allora-price-prediction-agent`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates/allora-price-prediction-agent)**: Price predictions using Allora markets
- **[`langgraph-workflow-agent`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates/langgraph-workflow-agent)**: LangGraph integration example

### 4. Build Your Own V2 Agent

Use the quickstart template as a starting point:

```bash
cd typescript/templates
cp -r quickstart-agent my-custom-agent
cd my-custom-agent

# Install dependencies
pnpm install

# Configure your agent
cp .env.example .env
# Edit .env with your API keys

# Start your agent
pnpm dev
```

See the [template README](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates/README.md) for detailed customization instructions.

## 🎧 Vibe Coding Guide

Vibe coding is a development approach where you use AI assistance to rapidly build and iterate on agents. The v2 framework is designed to work seamlessly with AI coding assistants.

### 🔧 Setting Up AI-Powered Development

To make the most of vibe coding, it's important to provide your AI assistant with clear and structured context. In the `.cursor/rules` folder, you can define the scope of your project, including its purpose, key components, and any relevant data schemas.

#### 📝 Vibekit's Cursor Rules Structure

Vibekit's rules files are located in the project's [`arbitrum-vibekit/.cursor/rules`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/.cursor/rules) directory. These files define best practices, workflows, and workspace conventions for building and maintaining v2 agents:

- **createVibekitAgent.mdc**

  A comprehensive guide for creating v2 agents using skills, tools, LLM orchestration, and modern deployment patterns.

- **vibeCodingWorkflow.mdc**

  Outlines the step-by-step development workflow for agents, including the Planner/Executor roles, task breakdowns, and conventions for collaborative development.

- **workspaceRules.mdc**

  Documents workspace-wide guidelines and best practices for the monorepo, such as dependency management, development scripts, and CI/CD standards.

#### 🔄 Extending and Maintaining Rules

Here's guidelines for adding or editing rules:

- **Add a New Rule File**

  Create a new `.mdc` file in `.cursor/rules` if you want to introduce a new agent type, workflow, or set of best practices. Follow the structure of the existing files for consistency.

- **Update Existing Rules:**
  - Edit `createVibekitAgent.mdc` to add new v2 framework features, configuration options, or tool integrations.
  - Update `vibeCodingWorkflow.mdc` to refine development workflows, add new patterns, or document troubleshooting steps.
  - Revise `workspaceRules.mdc` to keep workspace-wide practices and scripts up to date.

Keep these files current to ensure your team and agents always follow the latest v2 best practices and workflows.

#### 📚 Interactive Learning Lessons

For hands-on learning and deeper understanding of Vibekit v2 concepts, explore our comprehensive lesson series in the [`.cursor/rules/lessons/`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/.cursor/rules/lessons) directory. These interactive lessons cover everything from basic concepts to advanced agent development patterns:

**🏗️ V2 Architecture & Design:**

- [Lesson 1: What is an AI Agent in V2?](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-01.md) - V2 framework overview with skills and tools
- [Lesson 2: Understanding MCP in V2](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-02.md) - Modern transport and skills-based architecture
- [Lesson 19: Skills - The V2 Foundation](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-19.md) - Core defineSkill patterns and architecture
- [Lesson 20: LLM Orchestration vs Manual Handlers](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-20.md) - Decision framework for skill design
- [Lesson 22: Workflow Tools and Design Patterns](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-22.md) - Best practices for skills and tools

**⚙️ Implementation & Configuration:**

- [Lesson 21: Provider Selection and Agent Configuration](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-21.md) - Multi-provider LLM setup and agent configuration
- [Lesson 6: V2 Agent Structure and File Layout](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-06.md) - Template agent architecture
- [Lesson 4: Stateless vs Context-Aware Logic](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-04.md) - Context providers and state management

**🚀 Advanced Features & Production:**

- [Lesson 23: Advanced Hooks and Artifacts](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-23.md) - Cross-cutting concerns and rich responses
- [Lesson 24: Production Deployment and Configuration](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-24.md) - Containerization, monitoring, and operations
- [Lesson 25: Modern Transport and Service Discovery](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-25.md) - StreamableHTTP, agent cards, and service patterns
- [Lesson 26: Frontend Integration and User Context Patterns](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-26.md) - Frontend integration and user context management

## 🔌 MCP Explained

The Model Context Protocol (MCP) is how AI models discover and use your agent's capabilities. In the v2 framework:

### V2 MCP Features

- **Skills as Tools**: Each skill becomes an MCP tool with natural language input
- **Modern Transport**: StreamableHTTP by default, with legacy SSE support
- **Agent Cards**: Automatic service discovery via `/.well-known/agent.json`
- **LLM Orchestration**: Skills intelligently route to appropriate internal tools
- **Multi-Provider Support**: OpenRouter, OpenAI, Anthropic, xAI, and Hyperbolic

### Example: Using a V2 Agent with Claude

1. **Start your agent** (it automatically exposes MCP tools)
2. **Connect Claude Desktop** to `http://localhost:3000/mcp`
3. **Use natural language** like "Supply 100 USDC to Aave to earn yield"
4. **Watch the magic** as the agent coordinates multiple tools automatically

The v2 framework handles all the complexity - skills route to tools, LLM orchestration manages multi-step workflows, and you get clean, structured responses.

### Building Custom MCP Tools

For standalone MCP tools (not full agents), see our [`mcp-tools`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/mcp-tools) directory.

## 💰 Contributions & Bounties

We're building the future of autonomous agents together! Here's how you can contribute to Vibekit v2:

### 🏆 Active Bounty Programs

- **Agent Templates**: $200-500 for new v2 agent templates showcasing different DeFi protocols
- **MCP Tool Integrations**: $100-300 for new MCP tool servers connecting to DeFi protocols
- **Documentation**: $50-150 for lesson improvements, tutorials, and guides
- **Framework Enhancements**: $300-1000 for core v2 framework improvements

### 🤝 Ways to Contribute

1. **Build V2 Agent Templates**: Create new agent templates for different DeFi use cases
2. **Improve Framework**: Enhance the v2 core with new features and optimizations
3. **Write Documentation**: Create tutorials, lessons, and guides for the v2 framework
4. **Test and Debug**: Help us find and fix issues in the v2 architecture
5. **Share Knowledge**: Write blog posts, create videos, or speak at events

### 📞 Get Support

- **Discord**: [Join our community](https://discord.com/invite/bgxWQ2fSBR) for real-time help and discussions
- **Issues**: [GitHub Issues](https://github.com/EmberAGI/arbitrum-vibekit/issues) for bug reports and feature requests
- **Discussions**: [GitHub Discussions](https://github.com/EmberAGI/arbitrum-vibekit/discussions) for questions and ideas

Ready to start building? Check out our [Contribution Guidelines](CONTRIBUTIONS.md) and dive into the [template agents](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates)!

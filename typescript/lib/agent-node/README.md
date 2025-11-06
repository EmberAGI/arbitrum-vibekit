# @emberai/agent-node

[![npm version](https://img.shields.io/npm/v/@emberai/agent-node.svg)](https://www.npmjs.com/package/@emberai/agent-node)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/LICENSE)

Agent Node enables building autonomous AI agents that can communicate with other agents, execute complex workflows, and perform transactions. It's a complete implementation of the [A2A (Agent-to-Agent) protocol](https://a2a.co) with integrated AI capabilities, workflow orchestration, blockchain wallet support, and HTTP-native payment infrastructure via X402 for autonomous agent commerce.

## Features

Agent Node provides a complete framework for building autonomous AI agents with these core capabilities:

- **A2A Protocol Compliance**: Full implementation of the Agent-to-Agent communication protocol (v0.3.0)
- **Multi-Provider AI**: Flexible AI provider selection (OpenRouter, OpenAI, xAI, Hyperbolic)
- **Workflow Orchestration**: Generator-based workflow system with pause/resume capabilities
- **MCP Integration**: Model Context Protocol support for dynamic tool/resource access
- **Blockchain Support**: Embedded EOA wallet with multi-chain transaction signing
- **X402 Payment Protocol**: HTTP-native payment infrastructure enabling autonomous agent transactions and micropayment-based service models
- **On-Chain Registration**: EIP-8004 compliant agent identity registration on Ethereum
- **Skills Framework**: Modular skill composition with isolated tool/resource scoping
- **Type-Safe**: Full TypeScript support with Zod schema validation

## Quick Start in 60 Seconds

### Using the CLI

> [!NOTE]
> You can initialize agent node anywhere on your system. To take advantage of the tools that Vibekit offers, we recommend creating your agent node in the [community agent directory](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/community/agents).

#### 1. Initialize Config Workspace

```bash
npx -y @emberai/agent-node@latest init
```

This creates a `config/` directory with:

- `agent.md` - Base agent configuration including system prompt, model settings, A2A protocol card definition, and EIP-8004 registration details
- `agent.manifest.json` - Skill composition settings
- `skills/` - Directory for skill modules (includes sample skills)
- `workflows/` - Directory for custom workflow implementations (includes example workflow)
- `mcp.json` - MCP server registry
- `workflow.json` - Workflow plugin registry
- `README.md` - Config workspace documentation

#### 2. Run the Server

Smart-start chat mode (connects to running agent or starts new server):

```bash
npx -y @emberai/agent-node@latest
```

#### 3. Time to Profit!

You can now build and execute any DeFi strategy through simple conversation with your agent node.

> [!TIP]
> Ready to customize your agent? See the [Configuration](#configuration) section below to learn about agent.md, skills, MCP servers, and workflows.

## On-Chain Agent Registration

Agent Node supports on-chain agent registration using the [EIP-8004 standard](https://eips.ethereum.org/EIPS/eip-8004), which provides a decentralized registry for AI agents.

### Why Register On-Chain?

- **Discoverability**: Make your agent discoverable through on-chain registries
- **Verifiable Identity**: Establish cryptographic proof of agent ownership
- **Interoperability**: Enable other systems to verify and interact with your agent
- **Standards Compliance**: Follow the EIP-8004 Agent Identity standard

### Prerequisites

To register your agent, you'll need:

1. **Pinata Account**: For IPFS file uploads
   - Sign up at [pinata.cloud](https://pinata.cloud)
   - Get your JWT token from API Keys section
   - Configure your gateway URL
2. **Environment Variables**:

   ```bash
   PINATA_JWT=your_pinata_jwt_token
   PINATA_GATEWAY=your_pinata_gateway_url
   ```

3. **Wallet with ETH**: To pay for transaction fees on your chosen chain

### Supported Chains

- **Sepolia** (chainId: 11155111) - Ethereum testnet
- More chains coming soon

### Registration Workflow

#### Configuration During Init

When you run `npx -y @emberai/agent-node@latest init`, you'll be prompted with optional EIP-8004 registration configuration:

- **Enable ERC-8004**: Choose whether to enable on-chain registration
- **Canonical Chain**: Select the primary chain for registration (e.g., Arbitrum One, Ethereum, Base)
- **Mirror Chains**: Optionally select additional chains for multi-chain discovery
- **Operator Address**: Optional wallet address that controls the agent identity (CAIP-10 format)
- **Pinata Credentials**: JWT token and gateway URL for IPFS uploads

These settings are saved to your `agent.md` frontmatter in the `erc8004` section.

#### Registering Your Agent

Once configured, register your agent on-chain:

```bash
npx -y @emberai/agent-node@latest register
```

Optionally override specific fields:

```bash
npx -y @emberai/agent-node@latest register \
  --name "My Trading Agent" \
  --description "Autonomous DeFi trading agent" \
  --url "https://myagent.example.com" \
  --version "1.0.0" \
  --image "https://example.com/agent-image.png" \
  --chain 11155111
```

**Options:**

- `--chain <chainId>`: Target a specific chain (overrides --all)
- `--all`: Register on canonical + mirror chains (default: true)
- `--force-new-upload`: Force new IPFS upload (ignores cached URI from previous attempts)

**What happens:**

1. Loads ERC-8004 configuration from `agent.md`
2. Builds EIP-8004 compliant registration file (name, description, A2A endpoint)
3. Uploads registration file to IPFS via Pinata
4. Saves IPFS URI to `agent.md` for retry capability
5. Encodes `register(ipfsUri)` smart contract transaction
6. Opens browser on localhost:3456 with transaction signing interface
7. After successful transaction, extracts and saves `agentId` to `agent.md`

#### Updating Registration

To update your existing registration:

```bash
npx -y @emberai/agent-node@latest update-registry \
  --agent-id 123 \
  --description "Updated: Now supports GMX v2" \
  --version "2.0.0"
```

**Note**: You must own the agent (same wallet that registered it) to update. The command calls `setAgentUri(agentId, newIpfsUri)` on the registry contract.

### EIP-8004 Registration Format

The registration file follows EIP-8004 standard:

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "My Trading Agent",
  "description": "Autonomous DeFi trading agent",
  "image": "https://example.com/agent-image.png",
  "endpoints": [
    {
      "name": "A2A",
      "endpoint": "https://myagent.example.com/.well-known/agent-card.json",
      "version": "1.0.0"
    }
  ],
  "registrations": [
    {
      "agentId": 123,
      "agentRegistry": "eip155:11155111:0x8004a6090Cd10A7288092483047B097295Fb8847"
    }
  ],
  "supportedTrust": []
}
```

### Identity Registry Contract

The agent identity registry contract is deployed at:

- **Sepolia**: `0x8004a6090Cd10A7288092483047B097295Fb8847`

The contract implements:

- `register(string ipfsUri)` - Register new agent
- `setAgentUri(uint256 agentId, string ipfsUri)` - Update existing registration


## Configuration

### Workspace Structure

Agent Node uses a file-based configuration workspace:

```
config-workspace/
├── agent.md                 # Base agent + model config
├── agent.manifest.json      # Skill/server selection
├── skills/                  # Modular skill definitions
│   ├── skill-1.md
│   └── skill-2.md
├── mcp.json                 # MCP server registry
├── workflow.json            # Workflow registry
└── workflows/               # Custom workflow implementations
    └── example-workflow.ts
```

### Configuration Files

The configuration workspace contains several key files that define your agent's behavior.

#### Agent Definition (`agent.md`)

Base agent configuration including system prompt, model settings, A2A protocol card definition, and EIP-8004 registration details:

```markdown
---
version: 1
card:
  protocolVersion: '0.3.0'
  name: 'My Agent'
  description: 'An autonomous AI agent'
  url: 'http://localhost:3000/a2a'
  version: '1.0.0'
  capabilities:
    streaming: true
    pushNotifications: false
  provider:
    name: 'My Company'
    url: 'https://example.com'

ai:
  modelProvider: openrouter
  model: openai/gpt-5
---

You are an AI agent that helps users with...
```

#### Skills (`skills/*.md`)

Modular skill definitions that compose your agent's capabilities. The `init` command creates two sample skills:

- `general-assistant.md` - General assistant capabilities
- `ember-onchain-actions.md` - On-chain DeFi operations

Example skill structure:

```markdown
---
skill:
  id: token-swap
  name: 'Token Swap Skill'
  description: 'Execute token swaps on DEXes'
  tags: [defi, swap]

mcp:
  servers:
    - name: ember-onchain
      allowedTools: [createSwap, getSwapQuote]
---

You can help users swap tokens using the createSwap tool...
```

#### Skill Manifest (`agent.manifest.json`)

Skill composition and workflow selection settings:

```json
{
  "version": "1.0",
  "skills": ["token-swap", "wallet-management"],
  "enabledWorkflows": ["approve-and-swap"]
}
```

#### MCP Registry (`mcp.json`)

MCP server registry for dynamic tool/resource access:

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    },
    "ember-onchain": {
      "type": "http",
      "url": "https://api.emberai.xyz/mcp",
      "headers": {
        "Authorization": "$env:EMBER_API_KEY"
      }
    }
  }
}
```

#### Workflow Registry (`workflow.json`)

Workflow plugin registry:

```json
{
  "workflows": [
    {
      "id": "example-workflow",
      "from": "./workflows/example-workflow.ts",
      "enabled": true,
      "config": {
        "mode": "default"
      }
    }
  ]
}
```

#### Workflows (`workflows/*.ts`)

Custom workflow implementations. Workflows are multi-step operations that manage A2A Task lifecycles (same concept as [Anthropic's workflows](https://www.anthropic.com/engineering/building-effective-agents)). The `init` command creates an `example-workflow.ts` demonstrating status updates, artifacts, and user confirmation. For detailed workflow documentation, see the [Workflows](#workflows) section under Core Concepts.

After making changes, validate your configuration:

```bash
npx -y @emberai/agent-node@latest doctor
```

This checks for configuration errors, missing references, and policy conflicts.

### X402 Payment Protocol

Agent Node integrates the X402 protocol for internet-native payments between agents:

- **HTTP 402 Standard**: Leverages HTTP 402 "Payment Required" status code for seamless payment flows
- **Autonomous Commerce**: Agents can transact with each other without human intervention
- **Micropayments**: Support for fractional payments enabling pay-per-use service models
- **Rapid Settlement**: On-chain payment verification with ~2 second settlement times
- **Tool & Workflow Monetization**: Enable pay-per-call pricing for agent services and workflows

## Creating Workflows

For a comprehensive guide on building workflows, see **[Workflow Creation Guide](docs/WORKFLOW-CREATION-GUIDE.md)**.

**Quick overview:**

Workflows are multi-step operations defined as async generator functions:

```typescript
const plugin: WorkflowPlugin = {
  id: 'my-workflow',
  name: 'My Workflow',
  description: 'Description of workflow',
  version: '1.0.0',
  inputSchema: z.object({
    /* params */
  }),

  async *execute(context: WorkflowContext) {
    // Yield status updates
    yield {
      type: 'status',
      status: {
        state: 'working',
        message: {
          /* ... */
        },
      },
    };

    // Emit artifacts
    yield {
      type: 'artifact',
      artifact: {
        /* ... */
      },
    };

    // Pause for input
    const userInput = yield {
      type: 'pause',
      status: {
        state: 'input-required',
        message: {
          /* ... */
        },
      },
      inputSchema: z.object({
        /* ... */
      }),
    };

    // Return result
    return { success: true };
  },
};
```

**Key concepts:**

- **Generator-based** - Use `yield` for state updates, `return` for final result
- **Pause/Resume** - Request user input or authorization at any point
- **Artifacts** - Emit structured data throughout execution
- **State Machine** - Enforced transitions: `working` → `input-required` → `completed`
- **Type Safety** - Zod schemas validate inputs automatically

See the [Workflow Creation Guide](docs/WORKFLOW-CREATION-GUIDE.md) for complete documentation, patterns, and examples.

## CLI Commands & Chat Interface

The Agent CLI provides essential commands for managing your agent throughout its lifecycle, with chat as the default interactive experience.

### Core Commands

```bash
# Initialize agent configuration - Creates a new agent configuration workspace with sample files
npx -y @emberai/agent-node@latest init

# Smart-start chat (default) - Attach to running agent, else start local then attach
npx -y @emberai/agent-node@latest

# Run agent in development mode - Starts your agent with hot reload for development
npx -y @emberai/agent-node@latest run --dev

# Validate configuration - Checks your configuration for errors and missing references
npx -y @emberai/agent-node@latest doctor

# View composed configuration - Shows your composed agent configuration in readable format
npx -y @emberai/agent-node@latest print-config

# Create deployment bundle - Creates a production-ready deployment package
npx -y @emberai/agent-node@latest bundle

# Register agent on-chain - Register your agent using EIP-8004 standard (requires PINATA_JWT)
npx -y @emberai/agent-node@latest register

# Update agent registry - Update existing on-chain registration
npx -y @emberai/agent-node@latest update-registry --agent-id 123
```

### Chat Interface Options

Chat supports smart-start behavior and flexible logging configurations:

```bash
# Smart-start (default): attach to running agent, else start local then attach
npx -y @emberai/agent-node@latest

# Client-only chat to a specific URL (never starts a server)
npx -y @emberai/agent-node@latest chat --url http://127.0.0.1:3000

# Start the server and then attach chat
npx -y @emberai/agent-node@latest run --attach
```

### Logging Configuration

- **Default**: Chat forces `LOG_LEVEL=ERROR` for console output to keep the stream clean
- **`--respect-log-level`**: Opt out; respect `LOG_LEVEL` from your environment
- **`--log-dir <dir>`**: Write daily JSONL logs to `<dir>` and suppress all console logs during chat
  - File logs always honor your environment `LOG_LEVEL`
  - Console remains clean; streamed assistant text is printed to stdout only

**Logging Examples:**

```bash
# Clean chat + file-only logs that honor .env LOG_LEVEL
npx -y @emberai/agent-node@latest --log-dir ./logs

# Client-only with file logs and environment log level
npx -y @emberai/agent-node@latest chat --url http://127.0.0.1:3000 --log-dir ./logs

# Respect environment log level in console (do not force ERROR)
npx -y @emberai/agent-node@latest --respect-log-level

# Start server then attach with file-only logs
npx -y @emberai/agent-node@latest run --attach --log-dir ./logs
```

## License

MIT © [EmberAGI](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/LICENSE)

## Links

- [NPM Package](https://www.npmjs.com/package/@emberai/agent-node)
- [GitHub Repository](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/agent-node)
- [Ember Website](https://www.emberai.xyz/)
- [Ember X](https://x.com/EmberAGI)

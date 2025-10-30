# Agent Node

**A modern agent framework for the agentic economy**

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

The configuration workspace contains several key files that define your agent's behavior:

- **[`config/agent.md`](config/agent.md)** - Base agent configuration including system prompt, model settings, and A2A protocol card definition
- **[`config/skills/`](config/skills/)** - Modular skill definitions that compose your agent's capabilities:
  - [`general-assistant.md`](config/skills/general-assistant.md) - General assistant capabilities
  - [`ember-onchain-actions.md`](config/skills/ember-onchain-actions.md) - On-chain DeFi operations
- **[`config/agent.manifest.json`](config/agent.manifest.json)** - Skill composition and workflow selection settings
- **[`config/mcp.json`](config/mcp.json)** - MCP server registry for dynamic tool/resource access
- **[`config/workflow.json`](config/workflow.json)** - Workflow plugin registry
- **[`config/workflows/`](config/workflows/)** - Custom workflow implementations


## Quick Start

### Using the CLI (Recommended)

#### 1. Initialize Config Workspace


> [!NOTE]
> You can initialize agent node anywhere on your system. To take advantage of the tools that Vibekit offers, we recommend creating your agent node in the [community agent directory](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/community/agents).

```bash
npx -y @emberai/agent-node init
```

This creates a `config/` directory with:

- `agent.md` - Base agent configuration and system prompt
- `agent.manifest.json` - Skill composition settings
- `skills/` - Directory for skill modules
- `mcp.json` - MCP server registry
- `workflow.json` - Workflow plugin registry

#### 2. Customize Your Agent

Edit `config/agent.md` to define your agent's personality and capabilities. Add skills in `config/skills/`.

#### 3. Validate Configuration

```bash
npx -y @emberai/agent-node doctor
```

Checks for configuration errors, missing references, and policy conflicts.

#### 4. Run the Server

Development mode (with hot reload):

```bash
npx -y @emberai/agent-node run --dev
```

Production mode:

```bash
node dist/cli/loader.js run
```

### Using pnpm Scripts (Alternative)

#### 1. Build the Project

```bash
pnpm build
```

#### 2. Start the Server

Development mode (with hot reload):

```bash
pnpm dev
```

Production mode:

```bash
pnpm start
```

You can now interact with the agent node through and execute DeFi Workflows.


## Core Concepts

### Sessions

Sessions provide conversation isolation using `contextId`:

- **Server-Generated**: Omit `contextId` to create new session
- **Client-Provided**: Reattach to existing session with `contextId`
- **Isolation**: Tasks, messages, and state are session-scoped
- **Persistence**: Sessions persist for agent uptime

### Tasks

Tasks represent async operations:

- **Creation**: AI tool calls automatically create tasks
- **States**: `submitted`, `working`, `input-required`, `auth-required`, `completed`, `failed`, `canceled`
- **Streaming**: Subscribe to task updates via `message/stream` with `taskId`
- **Artifacts**: Tasks emit structured data artifacts on completion

### Workflows

Workflows are multi-step operations with these key characteristics:

- **Generator Functions**: Use `yield` for status updates and pauses
- **Pause Points**: Request user input or authorization
- **Validation**: Zod schemas validate resume inputs
- **Tool Exposure**: Only `dispatch_workflow_*` tools exposed to AI (no resume)

> [!NOTE]
> The `config/workflows/` directory and example workflow files are created automatically when you initialize your agent configuration using `pnpm cli init`.

For a complete example implementation, see [`config/workflows/example-workflow.ts`](config/workflows/example-workflow.ts) which demonstrates pause/resume capabilities, status updates, and user input validation.

### MCP Integration

MCP (Model Context Protocol) provides dynamic tools:

- **Server Discovery**: Skills select MCP servers from registry
- **Tool Scoping**: Each skill specifies allowed tools
- **HTTP & Stdio**: Support for both transport types
- **Namespacing**: Tool names prefixed with server namespace

### X402 Payment Protocol

Agent Node integrates the X402 protocol for internet-native payments between agents:

- **HTTP 402 Standard**: Leverages HTTP 402 "Payment Required" status code for seamless payment flows
- **Autonomous Commerce**: Agents can transact with each other without human intervention
- **Micropayments**: Support for fractional payments enabling pay-per-use service models
- **Rapid Settlement**: On-chain payment verification with ~2 second settlement times
- **Tool & Workflow Monetization**: Enable pay-per-call pricing for agent services and workflows

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

### Registration Process

#### 1. Register New Agent

```bash
pnpm cli register \
  --name "My Trading Agent" \
  --description "Autonomous DeFi trading agent" \
  --url "https://myagent.example.com" \
  --chain-id 11155111 \
  --version "1.0.0" \
  --image "https://example.com/agent-image.png"
```

**What happens:**

1. Creates EIP-8004 compliant registration file
2. Uploads registration file to IPFS via Pinata
3. Generates transaction data for on-chain registration
4. Opens browser with transaction signing interface
5. Records your agent ID after successful transaction

#### 2. Update Existing Registration

```bash
pnpm cli update-registry \
  --agent-id 123 \
  --name "My Trading Agent" \
  --description "Updated: Now supports GMX v2" \
  --url "https://myagent.example.com" \
  --chain-id 11155111 \
  --version "2.0.0"
```

**Note**: You must own the agent (same wallet that registered it) to update the registry.

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

## CLI Commands

The Agent CLI provides essential commands for managing your agent throughout its lifecycle:

```bash
# Initialize agent configuration - Creates a new agent configuration workspace with sample files
pnpm cli init

# Run agent in development mode - Starts your agent with hot reload for development
pnpm cli run --dev

# Validate configuration - Checks your configuration for errors and missing references
pnpm cli doctor

# View composed configuration - Shows your composed agent configuration in readable format
pnpm cli print-config

# Create deployment bundle - Creates a production-ready deployment package
pnpm cli bundle

# Register agent on-chain - Register your agent using EIP-8004 standard (requires PINATA_JWT)
pnpm cli register --name "My Agent" --description "Agent description" --url "https://myagent.com" --chain-id 11155111

# Update agent registry - Update existing on-chain registration
pnpm cli update-registry --agent-id 123 --name "My Agent" --description "Updated description" --url "https://myagent.com" --chain-id 11155111
```


## Development

### Prerequisites

- Node.js >= 22.0.0
- pnpm (recommended) or npm

### Install Dependencies

```bash
cd lib/agent-node
pnpm install
```

### CLI Access

The agent CLI is available after installation:

- **Development**: `pnpm cli <command>` or `tsx src/cli/loader.ts <command>`
- **Production**: `node dist/cli/loader.js <command>` (after running `pnpm build`)

**Environment Variable Loading**: The CLI automatically loads `.env` and `.env.local` files from the current directory using Node.js native `process.loadEnvFile()`. The loader entry point ensures environment variables are available before the application initializes. No need to manually specify `--env-file` flags.

**Note**: If `tsx` is not found in your PATH, use `pnpm exec tsx` or `npx tsx` instead to run the locally installed version.

See [CLI Commands](#cli-commands) for all available commands.

### CLI Dependencies

The CLI uses the following dependencies for clean, user-friendly output:

- **picocolors** - Terminal colors (lightweight, fast)
- **ora** - Spinners for long-running operations
- **prompts** - _(future)_ For interactive CLI features when needed

These dependencies are automatically installed when you run `pnpm install`.

### Environment Setup

Create a `.env` file in the agent-node directory to configure:

```bash
# AI Provider API Keys (at least one required)
OPENROUTER_API_KEY=your_openrouter_key
OPENAI_API_KEY=your_openai_key
XAI_API_KEY=your_xai_key
HYPERBOLIC_API_KEY=your_hyperbolic_key

# Blockchain RPC URLs (optional, for wallet features)
ETH_RPC_URL=https://eth.merkle.io
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc

# On-Chain Registration (optional, for EIP-8004 registration)
PINATA_JWT=your_pinata_jwt_token
PINATA_GATEWAY=your_pinata_gateway_url

# Server Configuration
PORT=3000
HOST=0.0.0.0

# Public Endpoint (recommended for production)
A2A_BASE_URL=https://your-domain.com
```

### Testing the Server

The server exposes:

- **A2A Endpoint**: `http://localhost:3000/a2a` (JSON-RPC)
- **Agent Card**: `http://localhost:3000/.well-known/agent.json` (also available at `/agent-card.json`)
- **Health Check**: POST to `/a2a` with `{"jsonrpc": "2.0", "method": "health", "id": 1}`

Example message request:

```bash
curl -X POST http://localhost:3000/a2a \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "msg-1",
        "contextId": "ctx-demo",
        "role": "user",
        "parts": [{"kind": "text", "text": "What is 2+2?"}]
      }
    },
    "id": 1
  }'
```

### Connecting with A2A SDK

```typescript
import { A2AClient } from '@a2a-js/sdk/client';

const client = await A2AClient.fromCardUrl('http://localhost:3000/.well-known/agent.json');

const response = await client.sendMessage({
  message: {
    kind: 'message',
    messageId: 'msg-1',
    role: 'user',
    parts: [{ kind: 'text', text: 'Hello agent!' }],
  },
});

console.log(response);
```

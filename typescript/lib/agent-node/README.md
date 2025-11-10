# @emberai/agent-node

[![npm version](https://img.shields.io/npm/v/@emberai/agent-node.svg)](https://www.npmjs.com/package/@emberai/agent-node)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/LICENSE)

Agent Node is a complete implementation of the A2A (Agent-to-Agent) protocol with integrated AI capabilities, workflow orchestration, blockchain wallet support, X402 payment protocol for agent commerce, and EIP-8004 compliant on-chain registration for decentralized agent identity. Create intelligent agents that understand natural language, execute complex DeFi strategies, communicate with other agents, and monetize their services autonomously.

## Features

Agent Node provides a complete framework for building autonomous AI agents with the following core capabilities:

- **A2A Protocol Compliance**: Full implementation of the Agent-to-Agent communication protocol (v0.3.0)
- **Workflow Orchestration**: Generator-based workflow system with pause/resume capabilities
- **MCP Integration**: Model Context Protocol support for dynamic tool/resource access
- **Blockchain Support**: Embedded EOA wallet with multi-chain transaction signing
- **X402 Payment Protocol**: HTTP-native payment infrastructure leveraging HTTP 402 "Payment Required" status code for seamless autonomous agent commerce, micropayments, and pay-per-call tool/workflow monetization with ~2 second settlement times
- **On-Chain Registration**: EIP-8004 compliant agent identity registration on Ethereum
- **Skills Framework**: Modular skill composition with isolated tool/resource scoping
- **Multi-Provider AI**: Flexible AI provider selection (OpenRouter, OpenAI, xAI, Hyperbolic)
- **Type-Safe**: Full TypeScript support with Zod schema validation

## Configuration

### Workspace Structure

Agent Node uses a file-based configuration workspace:

```
config-workspace/
├── agent.md                 # Base agent + model config
├── agent.manifest.json      # Skill/server selection
├── skills/                  # Modular skill definitions
│   ├── general-assistant.md
│   └── ember-onchain-actions.md
├── workflows/               # Custom workflow implementations
│   ├── example-workflow.ts
│   ├── usdai-strategy.ts
│   └── utils/               # Workflow utility functions
├── mcp.json                 # MCP server registry
├── workflow.json            # Workflow registry
└── README.md                # Config workspace documentation
```

### Configuration Files

The configuration workspace contains several key files that define your agent's behavior.

#### Agent Definition (`agent.md`)

Base agent configuration including system prompt, model settings, A2A protocol card definition, and EIP-8004 registration details. See the generated `config/agent.md` file for the complete structure and examples.

#### Skills (`skills/*.md`)

Modular skill definitions that compose your agent's capabilities. The `init` command creates two sample skills:

- `general-assistant.md` - General assistant capabilities
- `ember-onchain-actions.md` - On-chain DeFi operations

See the generated files in `config/skills/` for complete examples and structure.

#### Skill Manifest (`agent.manifest.json`)

Skill composition and workflow selection settings. See the generated `config/agent.manifest.json` file for the complete structure.

#### MCP Registry (`mcp.json`)

MCP server registry for dynamic tool/resource access. See the generated `config/mcp.json` file for configuration examples.

#### Workflow Registry (`workflow.json`)

Workflow plugin registry. See the generated `config/workflow.json` file for configuration examples.

#### Workflows (`workflows/*.ts`)

Custom workflow implementations for multi-step operations that manage A2A Task lifecycles. The `init` command generates example workflows (`example-workflow.ts` and `usdai-strategy.ts`) along with utility functions. Refer to the generated files in `config/workflows/` for working examples and see the [Creating Workflows](#creating-workflows) section for comprehensive documentation.

## Quickstart in 60 Seconds

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
> During initialization, you'll be prompted with optional EIP-8004 registration configuration for on-chain agent identity. See [On-Chain Agent Registration](#on-chain-agent-registration) for details on these prompts.

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

> [!TIP]
> Ready to customize your agent? Once you have Agent Node running, customizing your agent is as simple as editing configuration files. Your `config/` directory contains everything needed to define your agent's personality, capabilities, and behavior. See the [Configuration](#configuration) section above to learn about agent configurations and modify necessary files.

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

**1. Configuration During Init**

When you run `npx -y @emberai/agent-node@latest init`, you'll be prompted with optional EIP-8004 registration configuration:

- **Enable ERC-8004**: Choose whether to enable on-chain registration
- **Canonical Chain**: Select the primary chain for registration (e.g., Arbitrum One, Ethereum, Base)
- **Mirror Chains**: Optionally select additional chains for multi-chain discovery
- **Operator Address**: Optional wallet address that controls the agent identity (CAIP-10 format)
- **Pinata Credentials**: JWT token and gateway URL for IPFS uploads

These settings are saved to your `agent.md` frontmatter in the `erc8004` section.

**2. Registering Your Agent**

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


**3. Updating Registration**

To update your existing registration:

```bash
npx -y @emberai/agent-node@latest update-registry \
  --agent-id 123 \
  --description "Updated: Now supports GMX v2" \
  --version "2.0.0"
```

> [!NOTE]
> Only the wallet that originally registered the agent can update its registration. This command calls `setAgentUri(agentId, newIpfsUri)` on the registry contract to update the agent's metadata.


## Creating Workflows

Workflows enable building complex multi-step operations that can pause for user input, request authorization, emit structured data, and track progress throughout execution. They use JavaScript async generator functions for sophisticated DeFi automation.

For comprehensive documentation, see [Workflow Creation Guide](docs/WORKFLOW-CREATION-GUIDE.md).

### Quick Start: Create a Custom Workflow

**Step 1: Create Your Workflow File**

Create a workflow file in `config/workflows/`. The init command provides `example-workflow.ts` and `usdai-strategy.ts` as references:

```typescript
import type { WorkflowPlugin, WorkflowContext } from '@emberai/agent-node/workflows';
import { z } from 'zod';

const plugin: WorkflowPlugin = {
  id: 'my-workflow',
  name: 'My Workflow',
  description: 'A simple workflow example',
  version: '1.0.0',

  inputSchema: z.object({
    message: z.string(),
  }),

  async *execute(context: WorkflowContext) {
    const { message } = context.parameters;

    // Yield status updates
    yield {
      type: 'status',
      status: {
        state: 'working',
        message: {
          kind: 'message',
          messageId: 'processing',
          contextId: context.contextId,
          role: 'agent',
          parts: [{ kind: 'text', text: 'Processing your request...' }],
        },
      },
    };

    // Pause for user input
    const userInput = yield {
      type: 'pause',
      status: {
        state: 'input-required',
        message: {
          kind: 'message',
          messageId: 'confirmation',
          contextId: context.contextId,
          role: 'agent',
          parts: [{ kind: 'text', text: 'Should I continue with this operation?' }],
        },
      },
      inputSchema: z.object({
        confirmed: z.boolean(),
      }),
    };

    // Return final result
    return { success: userInput.confirmed, message };
  },
};

export default plugin;
```

**Step 2: Register Your Workflow**

Add your workflow to `config/workflow.json`:

```json
{
  "workflows": {
    "my-workflow": "./workflows/my-workflow.ts"
  }
}
```

Enable it in `config/agent.manifest.json`:

```json
{
  "enabledWorkflows": ["my-workflow"]
}
```

**Step 3: Test Your Workflow**

```bash
npx -y @emberai/agent-node@latest doctor
npx -y @emberai/agent-node@latest run --dev
```

Your workflow becomes available as `dispatch_workflow_my_workflow` and can be triggered through natural language conversation with your agent.

### Key Concepts

- **Generator-based**: Use `yield` for state updates, `return` for final result
- **Pause/Resume**: Request user input or authorization at any point
- **Artifacts**: Emit structured data throughout execution
- **State Machine**: Enforced transitions: `working` → `input-required` → `completed`
- **Type Safety**: Zod schemas validate inputs automatically

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

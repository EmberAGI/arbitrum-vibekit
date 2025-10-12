# Agent Node

**A modern agent framework for the agentic economy**

Agent Node enables building autonomous AI agents that can communicate with other agents, execute complex workflows, and transact. It's a complete implementation of the [A2A (Agent-to-Agent) protocol](https://a2a.co) with integrated AI capabilities, workflow orchestration, and blockchain wallet support.

## Overview

Agent Node provides a production-ready framework for building AI agents with:

- **A2A Protocol Compliance**: Full implementation of the Agent-to-Agent communication protocol (v0.3.0)
- **Multi-Provider AI**: Flexible AI provider selection (OpenRouter, OpenAI, xAI, Hyperbolic)
- **Workflow Orchestration**: Generator-based workflow system with pause/resume capabilities
- **MCP Integration**: Model Context Protocol support for dynamic tool/resource access
- **Blockchain Support**: Embedded EOA wallet with multi-chain transaction signing
- **Skills Framework**: Modular skill composition with isolated tool/resource scoping
- **Type-Safe**: Full TypeScript support with Zod schema validation

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Core Concepts](#core-concepts)
- [API Reference](#api-reference)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)

## Features

### A2A Protocol Server

- **JSON-RPC Endpoints**: `message/send`, `message/stream`, `tasks/get`, `tasks/cancel`
- **Server-Sent Events**: Real-time streaming updates for messages and tasks
- **Task Management**: Automatic task creation for complex operations
- **Session Handling**: Context-based session isolation and persistence
- **Agent Card**: Standards-compliant agent discovery via `.well-known/agent-card.json` (v0.3.0)

### AI Integration

- **Provider Flexibility**: Switch between OpenRouter, OpenAI, xAI, or Hyperbolic
- **Tool Access**: Dynamic MCP tool discovery and invocation
- **Workflow Dispatch**: AI can trigger multi-step workflows via tool calls
- **Context Management**: Conversation history tracking across sessions
- **Streaming Support**: Token-by-token response streaming

### Workflow System

- **Generator-Based**: JavaScript generator functions for step-by-step execution
- **Pause/Resume**: Workflows pause for user input or authorization
- **State Transitions**: `working`, `input-required`, `auth-required`, `completed`, `failed`, `canceled`
- **Input Validation**: Zod schema validation for workflow inputs
- **Artifact Emission**: Workflows emit structured data artifacts
- **Concurrent Execution**: Multiple workflows run independently with isolated contexts

### Configuration Framework

- **Workspace-Based**: File-based configuration in a structured directory
- **Skill Composition**: Modular skills with frontmatter metadata
- **MCP Scoping**: Skills select which MCP servers and tools they need
- **Prompt Composition**: Automatic prompt building from base agent + skills
- **Environment Variables**: `$env:VAR` references with validation
- **Hot Reload**: Development mode watches for config changes

### Wallet & Blockchain

- **Embedded EOA**: Built-in Ethereum wallet (viem-based)
- **Multi-Chain**: Support for Arbitrum, Ethereum, Base, and other EVM chains
- **Transaction Signing**: Standard and EIP-712 typed data signing
- **Gas Estimation**: Automatic EIP-1559 fee calculation
- **Authorization Flow**: Workflows pause for user transaction approval

### Command-Line Interface

- **Workspace Scaffolding**: `agent init` creates config workspace with sample files
- **Server Management**: `agent run` starts the server with optional hot-reload mode
- **Configuration Validation**: `agent doctor` validates config and detects conflicts
- **Config Inspection**: `agent print-config` displays composed configuration
- **Deployment Bundling**: `agent bundle` exports production-ready bundle

## Installation

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

See [CLI Reference](#cli-reference) for all available commands.

### CLI Dependencies

The CLI uses the following dependencies for clean, user-friendly output:

- **picocolors** - Terminal colors (lightweight, fast)
- **ora** - Spinners for long-running operations
- **prompts** - _(future)_ For interactive CLI features when needed

These dependencies are automatically installed when you run `pnpm install`.

### Environment Setup

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` to configure:

```bash
# AI Provider API Keys (at least one required)
OPENROUTER_API_KEY=your_openrouter_key
OPENAI_API_KEY=your_openai_key
XAI_API_KEY=your_xai_key
HYPERBOLIC_API_KEY=your_hyperbolic_key

# Blockchain RPC URLs (optional, for wallet features)
ETH_RPC_URL=https://eth.merkle.io
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc

# Server Configuration
PORT=3000
HOST=0.0.0.0
```

## Quick Start

### Using the CLI (Recommended)

#### 1. Initialize Config Workspace

```bash
pnpm cli init
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
pnpm cli doctor
```

Checks for configuration errors, missing references, and policy conflicts.

#### 4. Run the Server

Development mode (with hot reload):

```bash
pnpm cli run --dev
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

### Testing the Server

The server exposes:

- **A2A Endpoint**: `http://localhost:3000/a2a` (JSON-RPC)
- **Agent Card**: `http://localhost:3000/.well-known/agent-card.json`
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

const client = await A2AClient.fromCardUrl('http://localhost:3000/.well-known/agent-card.json');

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

## Architecture

### Directory Structure

```
agent-node/
├── src/
│   ├── a2a/                 # A2A protocol implementation
│   │   ├── server.ts        # Express server setup
│   │   ├── agentExecutor.ts # Message/task execution logic
│   │   ├── handlers/        # JSON-RPC method handlers
│   │   ├── builders/        # Response builders
│   │   └── validation.ts    # A2A schema validation
│   │
│   ├── ai/                  # AI service integration
│   │   ├── ai-service.ts    # Main AI service
│   │   ├── providers/       # Provider implementations
│   │   └── tools/           # Tool registry
│   │
│   ├── config/          # Configuration system
│   │   ├── loaders/        # File loaders
│   │   ├── composers/      # Prompt/card composition
│   │   ├── validators/     # Schema validation
│   │   └── runtime/        # Runtime initialization
│   │
│   ├── sessions/           # Session management
│   │   ├── manager.ts      # Session lifecycle
│   │   └── types.ts        # Session interfaces
│   │
│   ├── workflows/          # Workflow runtime
│   │   ├── runtime.ts      # Execution engine
│   │   ├── plugins/        # Built-in workflows
│   │   └── types.ts        # Workflow interfaces
│   │
│   ├── wallet/             # Blockchain wallet
│   │   ├── embedded.ts     # EOA wallet implementation
│   │   └── manager.ts      # Wallet lifecycle
│   │
│   └── server.ts           # Main entry point
│
├── tests/                  # Test suites
│   ├── integration/        # Integration tests
│   ├── e2e/               # End-to-end tests
│   ├── mocks/             # MSW handlers
│   └── utils/             # Test helpers
│
├── config-workspace/       # Agent configuration (example)
│   ├── agent.md           # Base agent definition
│   ├── agent.manifest.json # Manifest
│   ├── skills/            # Skill modules
│   ├── mcp.json          # MCP server registry
│   └── workflow.json     # Workflow registry
│
└── package.json
```

### Request Flow

```
Client Request
    ↓
Express Server (src/a2a/server.ts)
    ↓
JSON-RPC Router
    ↓
AgentExecutor (src/a2a/agentExecutor.ts)
    ↓
AIService (src/ai/ai-service.ts)
    ↓
Provider (OpenRouter/OpenAI/xAI)
    ↓
Tool Calls → MCP Client / Workflow Runtime
    ↓
Response Builder
    ↓
SSE Stream / JSON Response
```

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
├── mcp.json                # MCP server registry
└── workflow.json           # Workflow registry
```

### Agent Definition (agent.md)

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

model:
  provider: openrouter
  name: anthropic/claude-sonnet-4.5
---

You are an AI agent that helps users with...
```

### Skills (skills/\*.md)

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

### Manifest (agent.manifest.json)

```json
{
  "version": "1.0",
  "skills": ["token-swap", "wallet-management"],
  "enabledWorkflows": ["approve-and-swap"]
}
```

### MCP Registry (mcp.json)

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

Workflows are multi-step operations:

- **Generator Functions**: Use `yield` for status updates and pauses
- **Pause Points**: Request user input or authorization
- **Validation**: Zod schemas validate resume inputs
- **Tool Exposure**: Only `dispatch_workflow_*` tools exposed to AI (no resume)

Example workflow:

```typescript
export const swapWorkflow: WorkflowPlugin = {
  id: 'token_swap',
  name: 'Token Swap',
  inputSchema: z.object({
    fromToken: z.string(),
    toToken: z.string(),
    amount: z.string(),
  }),

  async *execute(context) {
    // Step 1: Get quote
    yield { type: 'status', status: { state: 'working', message: 'Getting quote...' } };
    const quote = await getQuote(context.parameters);

    // Step 2: Request approval
    const approval = yield {
      type: 'pause',
      status: {
        state: 'auth-required',
        message: {
          /* A2A message */
        },
      },
      inputSchema: z.object({ approved: z.boolean() }),
    };

    if (!approval.approved) {
      throw new Error('User rejected swap');
    }

    // Step 3: Execute swap
    yield { type: 'status', status: { message: 'Executing swap...' } };
    const txHash = await executeSwap(quote);

    return { txHash, status: 'success' };
  },
};
```

### MCP Integration

MCP (Model Context Protocol) provides dynamic tools:

- **Server Discovery**: Skills select MCP servers from registry
- **Tool Scoping**: Each skill specifies allowed tools
- **HTTP & Stdio**: Support for both transport types
- **Namespacing**: Tool names prefixed with server namespace

## API Reference

### A2A Methods

#### `message/send`

Send a message and get immediate response:

```json
{
  "jsonrpc": "2.0",
  "method": "message/send",
  "params": {
    "message": {
      "kind": "message",
      "messageId": "msg-123",
      "contextId": "ctx-456", // optional
      "role": "user",
      "parts": [{ "kind": "text", "text": "Hello" }]
    }
  },
  "id": 1
}
```

Response: `Message` (simple queries) or `Task` (complex operations)

#### `message/stream`

Stream message response via SSE:

```json
{
  "jsonrpc": "2.0",
  "method": "message/stream",
  "params": {
    "message": {
      /* same as message/send */
    },
    "taskId": "task-789" // optional, for task-scoped streaming
  },
  "id": 1
}
```

Returns: `text/event-stream` with message deltas and task updates

#### `tasks/get`

Retrieve task status:

```json
{
  "jsonrpc": "2.0",
  "method": "tasks/get",
  "params": {
    "taskId": "task-789"
  },
  "id": 1
}
```

#### `tasks/cancel`

Cancel a running task:

```json
{
  "jsonrpc": "2.0",
  "method": "tasks/cancel",
  "params": {
    "taskId": "task-789"
  },
  "id": 1
}
```

## CLI Reference

The Agent CLI provides commands for configuration management, validation, and deployment.

### Usage

Using the convenience script (recommended):

```bash
pnpm cli <command> [options]
```

Or directly with TypeScript:

```bash
tsx src/cli/loader.ts <command> [options]
```

Production (compiled):

```bash
node dist/cli/loader.js <command> [options]
```

**Environment Variable Loading**: The CLI uses a loader entry point that automatically loads `.env` and `.env.local` files before application initialization. This ensures environment variables (like `OPENROUTER_API_KEY`) are available when needed.

**Note**: If `tsx` is not found in your PATH, use `pnpm exec tsx` or `npx tsx` instead to run the locally installed version.

### Commands

#### `agent init`

Initialize a new config workspace with sample files.

**Options:**

- `--target <dir>` - Target directory (default: `./config`)
- `--force` - Overwrite existing directory

**Example:**

```bash
pnpm cli init --target ./my-agent-config
```

Creates:

- `agent.md` - Base agent definition with A2A card
- `agent.manifest.json` - Skill composition manifest
- `mcp.json` - MCP server registry
- `workflow.json` - Workflow plugin registry
- `skills/` - Directory for skill modules
- `workflows/` - Directory for workflow implementations

---

#### `agent run`

Run the agent server with optional development mode.

**Options:**

- `--config-dir <dir>` - Config directory (default: `./config`)
- `--dev` - Enable hot reload (watches config files)
- `--port <number>` - Server port (default: `3000`)
- `--host <string>` - Server host (default: `0.0.0.0`)

**Examples:**

```bash
# Development mode with hot reload
pnpm cli run --dev

# Production mode with custom port
node dist/cli/loader.js run --port 8080

# Custom config directory
pnpm cli run --config-dir ./production-config
```

---

#### `agent doctor`

Validate configuration and detect issues.

**Options:**

- `--config-dir <dir>` - Config directory (default: `./config`)
- `--verbose` - Show detailed diagnostics

**Checks:**

- Agent card required fields (name, description)
- Skill definitions and frontmatter
- MCP server registry structure
- Workflow registry structure
- Unreferenced MCP servers or workflows
- Tool policy and guardrail merge results

**Example:**

```bash
pnpm cli doctor --verbose
```

---

#### `agent print-config`

Display composed configuration from workspace.

**Options:**

- `--config-dir <dir>` - Config directory (default: `./config`)
- `--format <json|yaml>` - Output format (default: `json`)
- `--no-redact` - Show sensitive values (API keys, etc.)
- `--prompt <summary|full>` - Prompt detail level (default: `summary`)

**Examples:**

```bash
# JSON output with redacted secrets
pnpm cli print-config

# YAML output with full prompt
pnpm cli print-config --format yaml --prompt full

# Show sensitive values (development only)
pnpm cli print-config --no-redact
```

---

#### `agent bundle`

Export deployment bundle with all configuration.

**Options:**

- `--config-dir <dir>` - Config directory (default: `./config`)
- `--output <file>` - Output file (default: `./agent-bundle.json`)
- `--format <json|yaml>` - Output format (default: `json`)

**Bundle Contents:**

- Agent card (A2A protocol metadata)
- Composed system prompt
- Prompt parts with skill attribution
- MCP server configurations
- Workflow configurations

**Example:**

```bash
pnpm cli bundle --output ./dist/production-bundle.json
```

---

### Typical Workflows

**New Agent Setup:**

```bash
# 1. Initialize workspace
pnpm cli init

# 2. Edit configuration
# Edit config/agent.md, add skills to config/skills/

# 3. Validate
pnpm cli doctor

# 4. Run
pnpm cli run --dev
```

**Configuration Inspection:**

```bash
# View composed config
pnpm cli print-config --format yaml

# Validate for issues
pnpm cli doctor --verbose
```

**Production Deployment:**

```bash
# 1. Validate
pnpm cli doctor

# 2. Create bundle
pnpm cli bundle --output ./deploy/agent.json

# 3. Run in production
node dist/cli/loader.js run --config-dir ./production-config
```

## Development

### Development Server

```bash
pnpm dev
```

Starts server with:

- Hot reload on file changes
- Environment variable loading from `.env`
- Config workspace watching (when enabled)

### Code Quality

```bash
# Type checking
pnpm typecheck

# Linting
pnpm lint:check
pnpm lint:fix

# All quality checks
pnpm precommit
```

### Project Commands

```bash
pnpm build          # Build TypeScript to dist/
pnpm clean          # Remove node_modules and build artifacts
pnpm start          # Run production build
```

## Testing

Agent Node uses Vitest with MSW (Mock Service Worker) for HTTP mocking.

### Test Types

- **Unit Tests** (`*.unit.test.ts`): Isolated component testing
- **Integration Tests** (`*.int.test.ts`): Component interaction testing with mocked HTTP
- **E2E Tests** (`*.e2e.test.ts`): Full server testing with real AI providers

### Running Tests

```bash
# All tests (unit + integration)
pnpm test

# By type
pnpm test:unit
pnpm test:int
pnpm test:e2e

# Watch mode
pnpm test:watch

# Coverage
pnpm test:coverage

# Specific pattern
pnpm test:grep -- "pattern"
```

### Recording Mocks

Integration tests use recorded API responses:

```bash
pnpm test:record-mocks
```

This records real API calls to `tests/mocks/data/` for deterministic testing.

### Mock Structure

```
tests/
├── mocks/
│   ├── data/                # Recorded responses
│   │   ├── openrouter/
│   │   ├── openai/
│   │   └── [service]/
│   ├── handlers/            # MSW request handlers
│   │   ├── openrouter.ts
│   │   └── index.ts
│   └── utils/              # Mock utilities
│
├── utils/                   # Test helpers
│   ├── test-server.ts      # Server setup
│   ├── test-config-workspace.ts
│   └── factories/          # Test data factories
│
└── setup/                   # Vitest config
    ├── vitest.base.setup.ts
    ├── vitest.unit.setup.ts
    └── msw.setup.ts
```

### Test Organization

Tests mirror source structure:

```
src/a2a/server.ts         → src/a2a/server.unit.test.ts
src/workflows/runtime.ts  → src/workflows/runtime.unit.test.ts
```

Integration tests go in `tests/integration/`:

```
tests/integration/a2a.int.test.ts
tests/integration/wallet.int.test.ts
```

## Deployment

### Production Build

```bash
pnpm build
```

Output: `dist/` directory with compiled JavaScript

### Docker

Example `Dockerfile`:

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

EXPOSE 3000

CMD ["node", "dist/server.js"]
```

### Environment Variables

Production deployment requires:

```bash
# Required
OPENROUTER_API_KEY=***     # Or other AI provider key
PORT=3000
HOST=0.0.0.0

# Optional
NODE_ENV=production
LOG_LEVEL=info
```

### Health Checks

- **Endpoint**: `POST /a2a` with `{"jsonrpc": "2.0", "method": "health", "id": 1}`
- **Expected**: `200 OK` with `{"jsonrpc": "2.0", "result": {...}, "id": 1}`

### Reverse Proxy (Caddy)

Example `Caddyfile`:

```caddyfile
agent.example.com {
    reverse_proxy localhost:3000
}
```

## License

See `LICENSE` file in repository root.

## Contributing

See `CONTRIBUTING.md` for development guidelines.

## Support

- **Issues**: https://github.com/your-org/agent-node/issues
- **Docs**: https://docs.yourproject.com
- **A2A Protocol**: https://a2a.co

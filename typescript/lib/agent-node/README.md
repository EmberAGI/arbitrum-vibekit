# Agent Node

**A modern agent framework for the agentic economy**

Agent Node enables building autonomous AI agents that can communicate with other agents, execute complex workflows, and perform transactions. It's a complete implementation of the [A2A (Agent-to-Agent) protocol](https://a2a.co) with integrated AI capabilities, workflow orchestration, and blockchain wallet support.

## Features

Agent Node provides a complete framework for building autonomous AI agents with these core capabilities:

- **A2A Protocol Compliance**: Full implementation of the Agent-to-Agent communication protocol (v0.3.0)
- **Multi-Provider AI**: Flexible AI provider selection (OpenRouter, OpenAI, xAI, Hyperbolic)
- **Workflow Orchestration**: Generator-based workflow system with pause/resume capabilities
- **MCP Integration**: Model Context Protocol support for dynamic tool/resource access
- **Blockchain Support**: Embedded EOA wallet with multi-chain transaction signing
- **Skills Framework**: Modular skill composition with isolated tool/resource scoping
- **Type-Safe**: Full TypeScript support with Zod schema validation

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

#### Multi-Stage Dockerfile

The project includes a production-ready multi-stage Dockerfile:

```dockerfile
# Build and deploy stage
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.17.0 --activate

WORKDIR /workspace

# Copy entire workspace
COPY . .

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Build (clean is handled by build script)
RUN pnpm --filter=agent-node build

# Deploy to isolated directory with production dependencies only
RUN pnpm --filter=agent-node --prod deploy /deploy

# Production stage - minimal runtime image
FROM node:22-alpine

WORKDIR /app

# Copy deployed package from builder stage
COPY --from=builder /deploy .

# Expose port
EXPOSE 3000

# Run the application
CMD ["node", "dist/server.js"]
```

**Key features:**

- Multi-stage build for smaller final image
- Uses pnpm workspaces with `--filter=agent-node`
- Production dependencies only in final image
- Node.js 22 Alpine for minimal size

#### Docker Compose

Two compose files are provided for different use cases:

**Development (`docker-compose.yaml`):**

- Direct port exposure on localhost:3000
- Single app service
- Ideal for local development and testing

**Production (`docker-compose.prod.yaml`):**

- Caddy reverse proxy with automatic HTTPS
- Exposes ports 80/443
- Automatic SSL certificate management via Let's Encrypt
- Security headers and gzip compression

**Prerequisites:**

Before running with Docker, you must initialize the configuration workspace:

```bash
# Initialize config directory
pnpm cli init

# Customize your agent
# Edit config/agent.md, add skills to config/skills/, etc.

# Validate configuration
pnpm cli doctor
```

**Running with Docker Compose:**

```bash
# Development mode
docker compose -f docker-compose.yaml up

# Production mode (requires domain configured in Caddyfile)
docker compose -f docker-compose.prod.yaml up -d

# View logs
docker compose -f docker-compose.yaml logs -f

# Stop services
docker compose -f docker-compose.yaml down
```

**Configuration Volume Mounting:**

Both compose files mount the `config/` directory as a read-only volume:

```yaml
volumes:
  - ./config:/app/config:ro
```

**Benefits of this approach:**

- Config changes don't require image rebuilds
- Edit workflows and skills without restarting containers
- Matches how agent-node runs natively (`npx agent-node --config-dir=./config`)
- Standard Docker volume mount pattern for configuration

**Important:** The `config/` directory must exist before starting containers. If you see "Config workspace not found" errors, run `pnpm cli init` first.

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

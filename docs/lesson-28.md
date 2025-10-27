---
title: "Complete Guide to Agent Node Framework"
category: "advanced"
difficulty: "intermediate"
duration: "23 minutes"
prerequisites: ["Basic understanding of AI agents"]
next_lesson: null
framework_version: "3.0+ (Agent Node)"
---

# Lesson 28: Agent Node Framework

## Learning Objectives

After this lesson, you will understand:

- What Agent Node is and how it differs from the legacy framework
- The config-driven architecture and workspace structure
- How to create and configure skills with tool scoping
- The generator-based workflow system with pause/resume
- A2A protocol integration and agent communication
- CLI tools and development workflow
- MCP tool canonicalization and namespacing
- Docker deployment with volume mounting
- Enhanced workflow runtime integration

## Overview

Agent Node is a **modern agent framework for the agentic economy** that enables building autonomous AI agents with full A2A (Agent-to-Agent) protocol compliance. It represents a complete architectural evolution from the previous `arbitrum-vibekit-core` framework.

### Key Differences from Legacy Framework

| Aspect            | Legacy (`arbitrum-vibekit-core`)        | Agent Node                        |
| ----------------- | --------------------------------------- | --------------------------------- |
| **Architecture**  | Programmatic setup                      | Config-driven workspace           |
| **Skills**        | TypeScript objects with `defineSkill()` | Markdown files with frontmatter   |
| **Tools**         | Direct tool references                  | MCP server + tool selection       |
| **Workflows**     | Simple tool orchestration               | Generator-based with pause/resume |
| **Protocol**      | MCP-focused                             | Full A2A compliance (v0.3.0)      |
| **Configuration** | Code-based                              | File-based workspace              |
| **Discovery**     | Custom endpoints                        | Standards-compliant agent cards   |
| **Wallet**        | External integration                    | Embedded EOA wallet               |
| **CLI**           | Basic scripts                           | Full CLI with `agent` command     |

## Core Architecture

Agent Node is built around four main pillars:

### 1. **A2A Protocol Server**

- **JSON-RPC Endpoints**: `message/send`, `message/stream`, `tasks/get`, `tasks/cancel`
- **Server-Sent Events**: Real-time streaming updates
- **Agent Cards**: Standards-compliant discovery via `.well-known/agent-card.json`
- **Session Management**: Context-based isolation and persistence

### 2. **Skills Framework**

Skills are now **markdown files** with frontmatter metadata:

```markdown
---
skill:
  id: lending-operations
  name: Lending Operations
  description: "Manage lending positions on Aave protocol"
  tags: [defi, lending, aave]
  examples:
    - "Supply 100 USDC to Aave"
    - "Borrow 50 DAI against my collateral"
  inputModes: ["text/plain"]
  outputModes: ["application/json"]
  mcp:
    servers:
      - name: ember_mcp
        allowedTools:
          - ember_mcp.createLendingSupply
          - ember_mcp.createLendingBorrow
          - ember_mcp.createLendingRepay
  workflows:
    include: ["multi-step-lending"]
---

You are the Lending Operations skill. You help users manage their lending positions...
```

### 3. **Workflow System**

Generator-based workflows with pause/resume capabilities:

```typescript
async *execute(context: WorkflowContext): AsyncGenerator<WorkflowState> {
  // Pause for user input
  yield { type: 'input-required', input: { amount: 'number' } };

  // Pause for authorization
  yield { type: 'auth-required', auth: { transaction: txData } };

  // Emit artifacts
  yield { type: 'artifact', artifact: resultData };

  // Complete
  yield { type: 'completed', result: finalResult };
}
```

### 4. **Configuration Framework**

File-based workspace configuration:

```
/config/
  agent.manifest.json        # Entry point
  agent.md                   # Base agent prompt + card
  mcp.json                   # MCP server registry
  workflow.json              # Workflow registry
  /skills/                   # Skill definitions
    lending.md
    swapping.md
  /workflows/                # Workflow implementations
    token-swap.ts
    multi-step-lending.ts
```

## 📝 Configuration System

### Agent Manifest (`agent.manifest.json`)

The **entry point** that defines what gets loaded:

```json
{
  "version": 1,
  "skills": ["./skills/lending.md", "./skills/swapping.md"],
  "registries": {
    "mcp": "./mcp.json",
    "workflows": "./workflow.json"
  },
  "merge": {
    "card": {
      "capabilities": "union", // Combine all capabilities
      "toolPolicies": "intersect", // Only common tool policies
      "guardrails": "tightest" // Use most restrictive guardrails
    }
  }
}
```

### Agent Definition (`agent.md`)

The **base agent** with prompt and metadata:

```markdown
---
version: 1
card:
  protocolVersion: "0.3.0"
  name: "DeFi Trading Agent"
  description: "An AI agent for DeFi trading and portfolio management"
  url: "http://localhost:3000/a2a"
  version: "1.0.0"
  capabilities:
    streaming: true
    pushNotifications: false
  provider:
    name: "Your Company"
    url: "https://yourcompany.com"
  defaultInputModes: ["text/plain", "application/json"]
  defaultOutputModes: ["application/json", "text/plain"]

# Agent-level model configuration (default for all skills)
model:
  provider: anthropic
  name: claude-sonnet-4.5
  params:
    temperature: 0.7
    maxTokens: 4096
    topP: 1.0
    reasoning: medium
---

You are a DeFi trading agent specialized in portfolio management and automated trading strategies.

Your core capabilities include:

- Analyzing market conditions
- Managing lending positions
- Executing token swaps
- Optimizing portfolio allocations

Always prioritize user safety and provide clear explanations of your actions.
```

### MCP Registry (`mcp.json`)

Claude-compatible MCP server registry:

```json
{
  "mcpServers": {
    "ember_mcp": {
      "command": "npx",
      "args": ["@emberai/ember-mcp"],
      "env": {
        "EMBER_ENDPOINT": "$env:EMBER_ENDPOINT",
        "RPC_URL": "$env:RPC_URL"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  }
}
```

### Workflow Registry (`workflow.json`)

Workflow plugin registry:

```json
{
  "workflows": {
    "token-swap": "./workflows/token-swap.ts",
    "multi-step-lending": "./workflows/multi-step-lending.ts",
    "portfolio-analysis": "./workflows/portfolio-analysis.ts"
  }
}
```

## 🎨 Skills Framework

### Skill Frontmatter Structure

#### Required Fields

```yaml
skill:
  id: unique-skill-identifier # Required: Unique ID
  name: Human Readable Name # Required: Display name
  description: What this skill does # Required: Description
```

#### Optional Fields

```yaml
skill:
  # Categorization and examples
  tags: [defi, trading, portfolio] # Optional: Categorization tags
  examples: # Optional: Usage examples for AI
    - "Buy 100 USDC worth of ETH"
    - "Check my portfolio balance"

  # Input/Output modes
  inputModes: ["text/plain", "application/json"] # Optional: Accepted input formats
  outputModes: ["application/json", "text/plain"] # Optional: Output formats

  # Model configuration override
  model: # Optional: Override agent default
    provider: anthropic
    name: claude-sonnet-4.5
    params:
      temperature: 0.3
      reasoning: high

  # MCP tool scoping
  mcp: # Optional: MCP server and tool selection
    servers:
      - name: ember_mcp
        allowedTools:
          - ember_mcp.createSwap
          - ember_mcp.getWalletBalance
        blockedTools: # Optional: Explicitly block tools
          - ember_mcp.adminFunctions

  # Workflow access
  workflows: # Optional: Workflow access
    include: ["token-swap", "portfolio-analysis"]
    exclude: ["admin-workflow"] # Optional: Block specific workflows
    overrides: # Optional: Override workflow config
      token-swap:
        config:
          maxSlippage: 0.01
```

### MCP Tool Scoping

Skills control which MCP tools they can access through explicit selection:

#### 1. **Explicit Allowlist** (Recommended)

```yaml
mcp:
  servers:
    - name: ember_mcp
      allowedTools:
        - ember_mcp.createSwap
        - ember_mcp.getWalletBalance
        - ember_mcp.createLendingSupply
```

**Benefits:**

- **Security**: Only access necessary tools
- **Clarity**: Explicit about what the skill can do
- **Maintainability**: Easy to audit permissions

#### 2. **Multiple MCP Servers**

Skills can access multiple MCP servers:

```yaml
mcp:
  servers:
    - name: ember_mcp
      allowedTools:
        - ember_mcp.createSwap
        - ember_mcp.getWalletBalance
    - name: filesystem
      allowedTools:
        - filesystem.read_file
        - filesystem.write_file
    - name: database
      allowedTools:
        - database.query
        - database.insert
```

### Model Configuration

Skills can override the agent's default model configuration:

```yaml
# Agent-level default
model:
  provider: anthropic
  name: claude-sonnet-4.5
  params:
    temperature: 0.7
    maxTokens: 4096
    reasoning: medium

# Skill-level override
skill:
  model:
    provider: anthropic
    name: claude-sonnet-4.5
    params:
      temperature: 0.3 # Lower temperature for precise operations
      reasoning: high # More reasoning for complex tasks
      maxTokens: 8192 # More tokens for detailed responses
```

## 🔄 Workflow System

### Workflow vs Simple Tool Call

| Aspect           | Simple Tool Call     | Workflow                     |
| ---------------- | -------------------- | ---------------------------- |
| **Execution**    | Single function call | Multi-step generator         |
| **State**        | Stateless            | Stateful with persistence    |
| **Pause/Resume** | No                   | Yes, for input/auth          |
| **Artifacts**    | Return value         | Emit multiple artifacts      |
| **Duration**     | Seconds              | Minutes to hours             |
| **Complexity**   | Simple operations    | Complex multi-step processes |

### Workflow Plugin Structure

```typescript
import type { Artifact, Message } from "@a2a-js/sdk";
import type {
  WorkflowPlugin,
  WorkflowContext,
  WorkflowState,
} from "../../src/workflows/types.js";
import { z } from "zod";

const plugin: WorkflowPlugin = {
  id: "my-workflow",
  name: "My Workflow",
  description: "A sample workflow demonstrating key concepts",
  version: "1.0.0",

  // Input validation schema
  inputSchema: z.object({
    amount: z.number().positive(),
    token: z.string(),
    recipient: z.string().optional(),
  }),

  // Main workflow execution
  async *execute(
    context: WorkflowContext
  ): AsyncGenerator<WorkflowState, unknown, unknown> {
    const { amount, token, recipient } = context.parameters ?? {};

    // Step 1: Initial validation
    yield {
      type: "status",
      status: {
        state: "working",
        message: {
          kind: "message",
          messageId: "validation-start",
          contextId: context.contextId,
          role: "agent",
          parts: [
            { kind: "text", text: "Validating transaction parameters..." },
          ],
        },
      },
    };

    // Step 2: Emit configuration artifact
    const configArtifact: Artifact = {
      artifactId: "transaction-config",
      name: "transaction-config.json",
      description: "Transaction configuration and parameters",
      parts: [
        {
          kind: "text",
          text: JSON.stringify({
            amount,
            token,
            recipient,
            timestamp: new Date().toISOString(),
          }),
        },
      ],
    };
    yield { type: "artifact", artifact: configArtifact };

    // Step 3: Pause for user confirmation
    yield {
      type: "input-required",
      input: {
        prompt: "Please confirm the transaction details above",
        schema: z.object({
          confirmed: z.boolean(),
          notes: z.string().optional(),
        }),
      },
    };

    // Step 4: Execute transaction (simulated)
    yield {
      type: "status",
      status: {
        state: "working",
        message: {
          kind: "message",
          messageId: "execution-start",
          contextId: context.contextId,
          role: "agent",
          parts: [{ kind: "text", text: "Executing transaction..." }],
        },
      },
    };

    // Step 5: Emit result artifact
    const resultArtifact: Artifact = {
      artifactId: "transaction-result",
      name: "transaction-result.json",
      description: "Transaction execution result",
      parts: [
        {
          kind: "text",
          text: JSON.stringify({
            status: "completed",
            transactionHash: "0x123...abc",
            gasUsed: 21000,
            timestamp: new Date().toISOString(),
          }),
        },
      ],
    };
    yield { type: "artifact", artifact: resultArtifact };

    // Step 6: Complete workflow
    yield {
      type: "completed",
      result: {
        success: true,
        transactionHash: "0x123...abc",
      },
    };
  },
};

export default plugin;
```

### Workflow State Machine

Workflows progress through these states:

```
[Initial] → working → input-required → working → auth-required → working → completed
     ↓           ↓           ↓              ↓           ↓
   failed    failed    failed         failed    failed
     ↓           ↓           ↓              ↓           ↓
  canceled   canceled  canceled      canceled  canceled
```

#### State Types

1. **working**: Workflow is actively processing
2. **input-required**: Pause for user input
3. **auth-required**: Pause for user authorization (e.g., transaction signing)
4. **completed**: Workflow finished successfully
5. **failed**: Workflow encountered an error
6. **canceled**: Workflow was canceled by user

### Artifact Emission

Workflows can emit structured data artifacts:

```typescript
interface Artifact {
  artifactId: string; // Unique identifier
  name: string; // Display name
  description: string; // Human-readable description
  parts: ArtifactPart[]; // Content parts
}

interface ArtifactPart {
  kind: "text" | "image" | "file";
  text?: string;
  data?: string; // Base64 encoded data
  mimeType?: string;
}
```

## 🎯 A2A Protocol Integration

### Agent Cards

Agent cards are metadata files that describe your agent's capabilities:

```json
{
  "protocolVersion": "0.3.0",
  "name": "DeFi Trading Agent",
  "description": "An AI agent for DeFi trading and portfolio management",
  "url": "http://localhost:3000/a2a",
  "version": "1.0.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false,
    "multiModal": false
  },
  "provider": {
    "name": "Your Company",
    "url": "https://yourcompany.com"
  },
  "defaultInputModes": ["text/plain", "application/json"],
  "defaultOutputModes": ["application/json", "text/plain"],
  "toolPolicies": {
    "allowToolCalls": true,
    "requireConfirmation": true
  },
  "guardrails": {
    "maxTokens": 4096,
    "timeout": 300
  }
}
```

### JSON-RPC Endpoints

Agent Node exposes these A2A-compliant endpoints:

#### `message/send`

Send a message to the agent:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "message/send",
  "params": {
    "contextId": "session-123",
    "message": {
      "role": "user",
      "parts": [
        {
          "kind": "text",
          "text": "Swap 100 USDC for ETH"
        }
      ]
    }
  }
}
```

#### `message/stream`

Get real-time streaming responses:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "message/stream",
  "params": {
    "contextId": "session-123"
  }
}
```

#### `tasks/get`

Retrieve task information:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tasks/get",
  "params": {
    "taskId": "task-456"
  }
}
```

#### `tasks/cancel`

Cancel a running task:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tasks/cancel",
  "params": {
    "taskId": "task-456"
  }
}
```

### Server-Sent Events (SSE)

Real-time streaming responses via SSE:

```
GET /a2a/sse?contextId=session-123

data: {"type": "message", "messageId": "msg-1", "role": "agent", "parts": [{"kind": "text", "text": "Processing your request..."}]}

data: {"type": "task", "taskId": "task-456", "status": "working", "progress": {"current": 1, "total": 3}}

data: {"type": "artifact", "artifactId": "swap-quote", "name": "swap-quote.json", "parts": [{"kind": "text", "text": "{\"inputAmount\": 100, \"outputAmount\": 0.05}"}]}

data: {"type": "task", "taskId": "task-456", "status": "completed", "result": {"success": true}}
```

### Session Management

#### Context Isolation

Each conversation gets a unique context ID:

```typescript
interface SessionContext {
  contextId: string; // Unique session identifier
  messages: Message[]; // Conversation history
  tasks: Task[]; // Active tasks
  artifacts: Artifact[]; // Generated artifacts
  metadata: Record<string, any>; // Custom session data
}
```

#### Session Persistence

Agent Node persists session data:

```typescript
// Save session state
await sessionManager.saveSession({
  contextId: "session-123",
  messages: [...],
  tasks: [...],
  artifacts: [...],
  lastActivity: new Date()
});

// Restore session on reconnect
const session = await sessionManager.loadSession("session-123");
```

## 🔧 CLI Commands

Agent Node provides CLI commands for workspace management:

```bash
# Initialize new agent workspace
agent init my-agent

# Validate configuration
agent doctor

# Print composed configuration
agent print-config

# Run agent with hot reload
agent run --watch

# Bundle for production
agent bundle
```

### `agent init`

Creates a new agent workspace with sample files:

```bash
agent init my-defi-agent
# Creates:
# - config/agent.manifest.json
# - config/agent.md
# - config/mcp.json
# - config/workflow.json
# - config/skills/example-skill.md
# - config/workflows/example-workflow.ts
# - .env.example
```

### `agent doctor`

Validates configuration and detects issues:

```bash
agent run
# Checks:
# - File syntax and structure
# - Skill composition conflicts
# - MCP server connectivity
# - Workflow implementations
# - Environment variables
```

## 🚀 Quick Start Example

Let's create a simple DeFi agent:

```bash
# 1. Initialize workspace
agent init my-defi-agent
cd my-defi-agent

# 2. Configure base agent
cat > config/agent.md << 'EOF'
---
version: 1
card:
  protocolVersion: "0.3.0"
  name: "Simple DeFi Agent"
  description: "A basic DeFi agent for portfolio management"
  url: "http://localhost:3000/a2a"
  version: "1.0.0"
  capabilities:
    streaming: true
    pushNotifications: false
  provider:
    name: "DeFi Corp"
    url: "https://defi-corp.com"
  defaultInputModes: ["text/plain"]
  defaultOutputModes: ["application/json"]

model:
  provider: anthropic
  name: claude-sonnet-4.5
  params:
    temperature: 0.7
    maxTokens: 4096
---
You are a helpful DeFi agent that manages portfolios and executes trades.
EOF

# 3. Configure MCP servers
cat > config/mcp.json << 'EOF'
{
  "mcpServers": {
    "ember_mcp": {
      "command": "npx",
      "args": ["@emberai/ember-mcp"],
      "env": {
        "EMBER_ENDPOINT": "$env:EMBER_ENDPOINT",
        "RPC_URL": "$env:RPC_URL"
      }
    }
  }
}
EOF

# 4. Add environment variables
cat > .env << 'EOF'
EMBER_ENDPOINT=https://api.emberai.xyz
RPC_URL=https://arb1.arbitrum.io/rpc
ANTHROPIC_API_KEY=your_key_here
EOF

# 5. Add a skill
cat > config/skills/lending.md << 'EOF'
---
skill:
  id: lending
  name: Lending Operations
  description: "Manage lending positions"
  mcp:
    servers:
      - name: ember_mcp
        allowedTools:
          - ember_mcp.createLendingSupply
          - ember_mcp.createLendingBorrow
---
You handle lending operations...
EOF

# 6. Validate and run
agent doctor
agent run
```

## 🎯 Best Practices

### 1. **Skills Design**

Each skill should have a clear, focused purpose:

```markdown
# ✅ Good: Focused skill

---

skill:
id: lending-operations
name: Lending Operations
description: "Manage lending positions on Aave protocol"

---

# ❌ Bad: Too broad

---

skill:
id: defi-operations
name: DeFi Operations
description: "Handle all DeFi operations including lending, swapping, and analytics"

---
```

### 2. **Clear Examples**

Provide specific, actionable examples:

```yaml
examples:
  - "Supply 100 USDC to Aave at current market rate"
  - "Borrow 50 DAI against my WETH collateral"
  - "Check my current lending health factor"
  - "Repay 25 DAI from my lending position"
```

### 3. **Appropriate Tool Scoping**

Only request tools you actually need:

```yaml
# ✅ Good: Minimal tool access
mcp:
  servers:
    - name: ember_mcp
      allowedTools:
        - ember_mcp.createLendingSupply
        - ember_mcp.createLendingBorrow

# ❌ Bad: Overly broad access
mcp:
  servers:
    - name: ember_mcp
      # No restrictions - access to all tools
```

### 4. **Workflow Design**

Always provide meaningful status messages:

```typescript
yield {
  type: "status",
  status: {
    state: "working",
    message: {
      kind: "message",
      messageId: "specific-step",
      contextId: context.contextId,
      role: "agent",
      parts: [{
        kind: "text",
        text: "Checking token balance for 100 USDC..." // Specific and actionable
      }],
    },
  },
};
```

### 5. **Meaningful Artifacts**

Create artifacts that provide value to users:

```typescript
// ✅ Good: Detailed configuration
const configArtifact = {
  artifactId: "swap-config",
  name: "swap-configuration.json",
  description: "Complete swap configuration with routing details",
  parts: [
    {
      kind: "text",
      text: JSON.stringify({
        input: { token: "USDC", amount: 1000 },
        output: { token: "ETH", expected: 0.5 },
        slippage: 0.01,
        deadline: 1800,
        route: [
          { protocol: "Uniswap V3", percentage: 60 },
          { protocol: "SushiSwap", percentage: 40 },
        ],
        gasEstimate: 150000,
        timestamp: new Date().toISOString(),
      }),
    },
  ],
};

// ❌ Bad: Minimal information
const badArtifact = {
  artifactId: "result",
  name: "result.json",
  description: "Result",
  parts: [{ kind: "text", text: '{"done": true}' }],
};
```

## 🔗 Key Benefits

### **For Developers**

- **Simplified Setup**: Configuration-driven, no complex code
- **Hot Reload**: Development mode with live config updates
- **Type Safety**: Full TypeScript support with Zod validation
- **CLI Tools**: `agent init`, `agent run`, `agent doctor`

### **For Users**

- **Standards Compliance**: Works with any A2A-compatible client
- **Real-time Updates**: Streaming responses and progress
- **Transaction Security**: Built-in wallet with approval flows
- **Rich Artifacts**: Structured data outputs from workflows

### **For the Ecosystem**

- **Interoperability**: Full A2A protocol compliance
- **Agent Discovery**: Standards-compliant agent cards
- **Workflow Portability**: Reusable workflow components
- **Tool Ecosystem**: MCP server integration

## 🎯 Migration from Legacy Framework

### Key Changes Summary

| Aspect            | Legacy (`arbitrum-vibekit-core`)        | Agent Node (v3.0+)                |
| ----------------- | --------------------------------------- | --------------------------------- |
| **Architecture**  | Programmatic setup                      | Config-driven workspace           |
| **Skills**        | TypeScript objects with `defineSkill()` | Markdown files with frontmatter   |
| **Tools**         | Direct tool references                  | MCP server + tool selection       |
| **Workflows**     | Simple tool orchestration               | Generator-based with pause/resume |
| **Protocol**      | MCP-focused                             | Full A2A compliance (v0.3.0)      |
| **Configuration** | Code-based                              | File-based workspace              |
| **Discovery**     | Custom endpoints                        | Standards-compliant agent cards   |
| **Wallet**        | External integration                    | Embedded EOA wallet               |
| **CLI**           | Basic scripts                           | Full CLI with `agent` command     |

### Migration Steps

1. **Initialize Agent Node Workspace**: `agent init my-agent`
2. **Convert Skills**: Transform TypeScript skills to markdown files
3. **Configure MCP**: Set up MCP servers in `mcp.json`
4. **Migrate Workflows**: Convert simple functions to generator-based workflows
5. **Update Configuration**: Create agent configuration files
6. **Test Migration**: Validate with `agent doctor`

## 📚 Additional Resources

- [Agent Node README](../../typescript/lib/agent-node/README.md)
- [A2A Protocol Specification](https://a2a.co)
- [MCP Documentation](https://modelcontextprotocol.io)
- [Architecture Canvas](../../typescript/lib/agent-node/docs/architecture-v2/agent-configs.md)
- [Migration Guide](./MIGRATION-GUIDE.md)

## 🎉 Conclusion

Agent Node represents a significant evolution in agent framework design, providing:

- **Config-driven architecture** for easier maintenance and collaboration
- **Full A2A protocol compliance** for ecosystem interoperability
- **Generator-based workflows** for complex multi-step operations
- **Comprehensive CLI tools** for streamlined development
- **Enhanced security** through tool scoping and validation

The framework enables developers to build sophisticated AI agents that can seamlessly integrate with the broader agentic economy while maintaining simplicity and developer experience.

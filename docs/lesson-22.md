---
title: "Custom MCP Servers"
category: "advanced"
difficulty: "hard"
duration: "23 minutes"
prerequisites: ["lesson-21"]
next_lesson: "lesson-23"
framework_version: "3.0+ (Agent Node)"
last_updated: "2025-10-15"
tags: ["mcp","servers","custom"]
---

# **Lesson 22: Provider Selection and Agent Configuration**

---

### 🔍 Overview

Setting up an agent in v2 involves two key components: **provider selection** for LLM integration and **agent configuration** for defining your agent's identity and capabilities. These work together to create a fully functional agent that can intelligently process requests and interact with external services.

**Provider selection** handles LLM model access across different providers (OpenRouter, Anthropic, OpenAI). **Agent configuration** defines your agent's metadata, skills, and runtime behavior.

Understanding both is essential for creating production-ready agents that are properly configured and can access the LLM capabilities they need.

---

### 🤖 Provider Selection

The v2 framework uses `createProviderSelector()` to handle LLM provider integration. This abstracts away provider-specific details while giving you access to multiple AI models:

```ts
// src/index.ts
import { createProviderSelector } from 'arbitrum-vibekit-core';

const providers = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY, // Optional
  openAiApiKey: process.env.OPENAI_API_KEY, // Optional
});

// Check provider availability
if (!providers.openrouter) {
  throw new Error('OpenRouter provider not available. Check OPENROUTER_API_KEY.');
}
```

#### **Available Providers**

```ts
// OpenRouter (recommended - access to many models)
const model = providers.openrouter('google/gemini-2.5-flash-preview');
const model2 = providers.openrouter('openai/gpt-4o');
const model3 = providers.openrouter('anthropic/claude-3.5-sonnet');

// Direct provider access (if API keys provided)
const model4 = providers.anthropic('claude-3.5-sonnet-20241022');
const model5 = providers.openai('gpt-4o');
```

#### **Provider Selection Patterns**

**Single Provider (Most Common):**

```ts
const providers = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
});

const agent = Agent.create(agentConfig, {
  llm: {
    model: providers.openrouter('google/gemini-2.5-flash-preview'),
  },
});
```

**Multi-Provider with Fallback:**

```ts
const providers = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
});

// Use preferred provider with fallback
const model = providers.anthropic
  ? providers.anthropic('claude-3.5-sonnet-20241022')
  : providers.openrouter('anthropic/claude-3.5-sonnet');
```

**Environment-Based Selection:**

```ts
const providers = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
});

const modelName = process.env.LLM_MODEL || 'google/gemini-2.5-flash-preview';
const model = providers.openrouter(modelName);
```

---

### ⚙️ Agent Configuration

The `AgentConfig` object defines your agent's identity, capabilities, and behavior:

```ts
// src/agent.ts or src/index.ts
import type { AgentConfig } from 'arbitrum-vibekit-core';

export const agentConfig: AgentConfig = {
  // Identity
  name: 'My Lending Agent',
  version: '1.0.0',
  description: 'A DeFi lending agent for Aave protocol',
  url: 'https://github.com/myorg/lending-agent', // Optional

  // Capabilities
  skills: [lendingSkill, portfolioSkill],

  // Technical capabilities
  capabilities: {
    streaming: false, // Server-sent events support
    pushNotifications: false, // Proactive notifications
    stateTransitionHistory: false, // Track state changes
  },

  // I/O formats
  defaultInputModes: ['application/json'],
  defaultOutputModes: ['application/json'],
};
```

#### **Required Configuration Fields**

```ts
export const minimalConfig: AgentConfig = {
  name: 'Agent Name', // Required: Human-readable name
  version: '1.0.0', // Required: Semantic version
  description: 'What agent does', // Required: Clear description
  skills: [mySkill], // Required: At least one skill
  capabilities: {
    // Required: Capability flags
    streaming: false,
    pushNotifications: false,
    stateTransitionHistory: false,
  },
  defaultInputModes: ['application/json'], // Required
  defaultOutputModes: ['application/json'], // Required
};
```

#### **Environment-Driven Configuration**

```ts
export const agentConfig: AgentConfig = {
  name: process.env.AGENT_NAME || 'Default Agent Name',
  version: process.env.AGENT_VERSION || '1.0.0',
  description: process.env.AGENT_DESCRIPTION || 'A helpful AI agent',
  skills: [
    /* your skills */
  ],
  url: process.env.AGENT_URL || 'localhost',
  capabilities: {
    streaming: process.env.ENABLE_STREAMING === 'true',
    pushNotifications: process.env.ENABLE_NOTIFICATIONS === 'true',
    stateTransitionHistory: process.env.ENABLE_HISTORY === 'true',
  },
  defaultInputModes: ['application/json'],
  defaultOutputModes: ['application/json'],
};
```

---

### 🏗️ Agent Creation and Runtime Options

Combine configuration and providers to create your agent:

```ts
import { Agent } from 'arbitrum-vibekit-core';

// Create the agent
const agent = Agent.create(agentConfig, {
  // Runtime options
  cors: process.env.ENABLE_CORS !== 'false',
  basePath: process.env.BASE_PATH || undefined,
  llm: {
    model: providers.openrouter(process.env.LLM_MODEL || 'google/gemini-2.5-flash-preview'),
  },
});
```

#### **Runtime Options**

```ts
interface AgentRuntimeOptions {
  cors?: boolean; // Enable CORS headers
  basePath?: string; // API base path (e.g., '/api/v1')
  llm: {
    model: LanguageModel; // LLM model instance
  };
}
```

#### **Starting the Agent**

```ts
// Simple startup
await agent.start(3000);

// With context provider
await agent.start(3000, contextProvider);

// With custom startup logic
const PORT = parseInt(process.env.PORT || '3000', 10);

agent
  .start(PORT, contextProvider)
  .then(() => {
    console.log(`🚀 Agent running on port ${PORT}`);
    console.log(`📍 Base URL: http://localhost:${PORT}`);
    console.log(`🤖 Agent Card: http://localhost:${PORT}/.well-known/agent.json`);
    console.log(`🔌 MCP SSE: http://localhost:${PORT}/sse`);
  })
  .catch(error => {
    console.error('Failed to start agent:', error);
    process.exit(1);
  });
```

---

### 🔌 External MCP Server Configuration

When your agent needs to connect to external MCP servers (like Ember AI), the framework handles client initialization automatically. You just need to:

1. **Set Environment Variables:**

```bash
# Remote MCP servers
EMBER_ENDPOINT=@https://api.emberai.xyz/mcp
ALLORA_ENDPOINT=@http://allora.example.com/mcp
```

2. **Reference in Skills:**

```ts
// The framework detects MCP server references in your skills
// and automatically creates clients for them
const emberClient = deps.mcpClients['ember']; // Available if EMBER_ENDPOINT is set
```

3. **Framework Auto-Discovery:**
   The v2 framework automatically:

- Detects MCP server references in your skills
- Creates appropriate transport connections (`StreamableHTTPClientTransport` for HTTP endpoints)
- Initializes clients before calling your context provider
- Makes them available via `deps.mcpClients['server-name']`

**Transport Configuration (Handled Automatically):**

```ts
// This is done internally by the framework:
// const transport = new StreamableHTTPClientTransport(new URL(process.env.EMBER_ENDPOINT));
// const emberClient = new Client({ name: 'ember', version: '1.0.0' }, { capabilities: {} });
```

### 🔧 Complete Setup Example

Here's a complete agent setup following best practices:

```ts
#!/usr/bin/env node
import 'dotenv/config';
import { Agent, type AgentConfig, createProviderSelector } from 'arbitrum-vibekit-core';
import { mySkill } from './skills/mySkill.js';
import { contextProvider } from './context/provider.js';

// 1. Provider Selection
const providers = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
});

if (!providers.openrouter) {
  console.error('OpenRouter API key required. Set OPENROUTER_API_KEY environment variable.');
  process.exit(1);
}

// 2. Agent Configuration
export const agentConfig: AgentConfig = {
  name: process.env.AGENT_NAME || 'My Agent',
  version: process.env.AGENT_VERSION || '1.0.0',
  description: process.env.AGENT_DESCRIPTION || 'A helpful AI agent',
  skills: [mySkill],
  url: process.env.AGENT_URL || 'localhost',
  capabilities: {
    streaming: false,
    pushNotifications: false,
    stateTransitionHistory: false,
  },
  defaultInputModes: ['application/json'],
  defaultOutputModes: ['application/json'],
};

// 3. Agent Creation
const agent = Agent.create(agentConfig, {
  cors: process.env.ENABLE_CORS !== 'false',
  basePath: process.env.BASE_PATH || undefined,
  llm: {
    model: providers.openrouter(process.env.LLM_MODEL || 'google/gemini-2.5-flash-preview'),
  },
});

// 4. Startup
const PORT = parseInt(process.env.PORT || '3000', 10);

agent
  .start(PORT, contextProvider)
  .then(() => {
    console.log(`🚀 ${agentConfig.name} running on port ${PORT}`);
    console.log(`📊 Skills: ${agentConfig.skills.map(s => s.name).join(', ')}`);
    console.log(`🤖 Agent Card: http://localhost:${PORT}/.well-known/agent.json`);
  })
  .catch(error => {
    console.error('Failed to start agent:', error);
    process.exit(1);
  });
```

---

### 🌍 Environment Variables

Standard environment variables for agent configuration:

```bash
# .env
# LLM Provider
OPENROUTER_API_KEY=your_key_here
LLM_MODEL=google/gemini-2.5-flash-preview

# Agent Identity
AGENT_NAME=My Custom Agent
AGENT_VERSION=1.2.0
AGENT_DESCRIPTION=A specialized agent for specific tasks
AGENT_URL=https://my-agent.example.com

# Runtime Options
PORT=3000
ENABLE_CORS=true
BASE_PATH=/api/v1

# Feature Flags
ENABLE_STREAMING=false
ENABLE_NOTIFICATIONS=false
ENABLE_HISTORY=false

# Service Dependencies
EMBER_ENDPOINT=@https://api.emberai.xyz/mcp
QUICKNODE_API_KEY=your_quicknode_key
```

---

### 🎯 Best Practices

#### **Provider Selection:**

1. **Use OpenRouter for flexibility** - Access to multiple models
2. **Environment-driven model selection** - Easy to change models
3. **Provider availability checks** - Fail fast on missing keys
4. **Fallback providers** - Redundancy for production

#### **Agent Configuration:**

1. **Environment-driven config** - Flexible deployment
2. **Semantic versioning** - Clear version tracking
3. **Descriptive metadata** - Help users understand capabilities
4. **Conservative capabilities** - Start with minimal features

#### **Error Handling:**

```ts
// Good: Comprehensive startup validation
if (!process.env.OPENROUTER_API_KEY) {
  console.error('Missing required environment variable: OPENROUTER_API_KEY');
  process.exit(1);
}

const providers = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
});

if (!providers.openrouter) {
  console.error('Failed to initialize OpenRouter provider');
  process.exit(1);
}
```

---

### ✅ Summary

Proper agent setup requires both provider selection and configuration:

- **Provider selection** abstracts LLM access across multiple providers
- **Agent configuration** defines identity, capabilities, and behavior
- **Runtime options** control CORS, paths, and LLM model selection
- **Environment variables** enable flexible, deployment-specific configuration
- **Error handling** ensures agents fail fast with clear messages

Start with OpenRouter for maximum model flexibility, use environment variables for configuration, and implement comprehensive startup validation.

> "Configuration is communication with your future self."

| Decision                              | Rationale                                                         |
| ------------------------------------- | ----------------------------------------------------------------- |
| **OpenRouter as primary provider**    | Access to multiple LLM providers through single API               |
| **Environment-driven configuration**  | Enables different settings per deployment environment             |
| **Required metadata fields**          | Ensures all agents are discoverable and self-documenting          |
| **Conservative default capabilities** | Prevents unexpected behavior; features opt-in rather than opt-out |
| **Startup validation**                | Fail-fast approach prevents runtime errors in production          |

# Arbitrum Vibekit Core (DEPRECATED)

> ⚠️ **DEPRECATED**: This package is deprecated and no longer maintained. Please use [agent-node](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/agent-node) instead.

The `arbitrum-vibekit-core` package is the foundational library for building AI agents on the Arbitrum network using the Arbitrum Vibekit framework. It provides the core abstractions and utilities for creating agents, defining skills, and interacting with language models.

## Key Features

- **Agent Class**: A robust and extensible base class for creating AI agents.
- **Skill & Tool Definitions**: Standardized interfaces for defining agent capabilities.
- **MCP Integration**: Seamless communication with MCP (Model Context Protocol) servers for accessing external tools and services.
- **Flexible Provider Selector**: A powerful utility for managing and selecting different language model providers.

## Testing

This package uses Vitest for testing. To run tests that require environment variables:

1. Copy `.env.test.example` to `.env.test`:

   ```bash
   cp .env.test.example .env.test
   ```

2. Fill in your actual API keys in `.env.test`

3. Run tests:
   ```bash
   pnpm test
   ```

The test setup automatically loads environment variables from `.env.test`.

## Provider Selector

The `createProviderSelector` function is a key feature of this package. It allows agents to easily switch between and utilize multiple Vercel AI SDK compatible providers, such as OpenRouter, OpenAI, Groq, Xai, and more.

### Purpose

In a dynamic environment, you may want to use different models for different tasks based on cost, performance, or capability. The provider selector abstracts away the complexity of managing multiple provider instances and API keys.

### Usage

You can use `createProviderSelector` to get a specific provider's `LanguageModelV1` instance. The selector will automatically use the correct API key from your environment variables.

```typescript
import { createProviderSelector } from '@arbitrum/vibekit-core';
import 'dotenv/config';

// Your .env file should contain the API keys:
// OPENROUTER_API_KEY=...
// HYPERBOLIC_API_KEY=...
// OPENAI_API_KEY=...
// XAI_API_KEY=...

// Create a provider selector with your API keys
const providers = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  hyperbolicApiKey: process.env.HYPERBOLIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  xaiApiKey: process.env.XAI_API_KEY,
});

// To get a model, you access the provider directly
// and pass in the model name.

// Get the OpenRouter model for Gemini Flash
if (providers.openrouter) {
  const model = providers.openrouter('google/gemini-2.5-flash');
  // now you can use the model...
}

// Get a Hyperbolic model (e.g., Mistral 7B Instruct)
if (providers.hyperbolic) {
  const hyperModel = providers.hyperbolic('deepseek-ai/DeepSeek-R1-0528');
  // now you can use the model...
}

// Get the OpenAI model for GPT-4o (as an example)
if (providers.openai) {
  const openAiModel = providers.openai('gpt-4o');
  // now you can use the model...
}

// Get the Groq model for Llama 3
if (providers.grok) {
  const grokModel = providers.grok('grok-3');
  // now you can use the model...
}

// You can now use these model instances with the Vibekit Framework
// For example, using them in a Vibekit agent:

import { Agent } from '@arbitrum/vibekit-core';

// Minimal agent manifest (must include at least one skill in real usage)
const myAgentConfig = {
  name: 'My Vibekit Agent',
  version: '0.1.0',
  description: 'Demo agent showing provider selector usage',
  skills: [], // add your skills here
};

// Create the agent with runtime options
const agent = Agent.create(myAgentConfig, {
  llm: {
    model: providers.openrouter('google/gemini-2.5-pro'),
  },
});
```

> **Note**: All API keys are optional. You only need to provide a key for the provider you intend to use. The `createProviderSelector` will only enable providers for which an API key has been supplied.

The selector uses the following environment variables for API keys:

- **OpenRouter**: `OPENROUTER_API_KEY`
- **Hyperbolic**: `HYPERBOLIC_API_KEY`
- **OpenAI**: `OPENAI_API_KEY`
- **xAI/Grok**: `XAI_API_KEY`

This utility simplifies multi-provider setups and makes your agent's model configuration more flexible and maintainable.

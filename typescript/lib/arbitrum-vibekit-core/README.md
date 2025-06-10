# Arbitrum Vibekit Core

The `arbitrum-vibekit-core` package is the foundational library for building AI agents on the Arbitrum network using the Arbitrum Vibekit framework. It provides the core abstractions and utilities for creating agents, defining skills, and interacting with language models.

## Key Features

- **Agent Class**: A robust and extensible base class for creating AI agents.
- **Skill & Tool Definitions**: Standardized interfaces for defining agent capabilities.
- **MCP Integration**: Seamless communication with MCP (Model Context Protocol) servers for accessing external tools and services.
- **Flexible Provider Selector**: A powerful utility for managing and selecting different language model providers.

## Provider Selector

The `createProviderSelector` function is a key feature of this package. It allows agents to easily switch between and utilize multiple Vercel AI SDK compatible providers, such as OpenRouter, Groq, Xai, and more.

### Purpose

In a dynamic environment, you may want to use different models for different tasks based on cost, performance, or capability. The provider selector abstracts away the complexity of managing multiple provider instances and API keys.

### Usage

First, ensure you have the necessary provider packages installed:

```bash
pnpm add @openrouter/ai-sdk-provider @ai-sdk/openai @ai-sdk/groq @ai-sdk/xai
```

Then, you can use `createProviderSelector` to get a specific provider's `LanguageModelV1` instance. The selector will automatically use the correct API key from your environment variables.

```typescript
import { createProviderSelector } from '@arbitrum/vibekit-core';
import 'dotenv/config';

// Your .env file should contain the API keys:
// OPENROUTER_API_KEY=...
// GROQ_API_KEY=...
// XAI_API_KEY=...

// Get the OpenRouter provider
const openrouter = createProviderSelector().select('openrouter');

// Get the Groq provider
const groq = createProviderSelector().select('groq');

// Get the Xai provider
const xai = createProviderSelector().select('xai');

// You can now use these model instances with the Vercel AI SDK
// For example, using it in an agent:
const agent = new Agent({
  // ... other agent config
  model: openrouter, // or groq, or xai
});
```

The selector uses the following environment variables for API keys:

- **OpenRouter**: `OPENROUTER_API_KEY`
- **Groq**: `GROQ_API_KEY`
- **XAI**: `XAI_API_KEY`
- **OpenAI**: `OPENAI_API_KEY`

This utility simplifies multi-provider setups and makes your agent's model configuration more flexible and maintainable.

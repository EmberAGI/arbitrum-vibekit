## Introduction

This directory provides a reference implementation of a Pendle agent using Arbitrum Vibekit and Ember AI's MCP server. It demonstrates how to set up a server, define agent functionalities, and process swapping operations via MCP tools. You can expand or modify this template by adding new tools or incorporating additional MCP-compatible functionalities to suit your project's requirements.

## Configuration

### AI Provider Setup

This agent supports multiple AI providers. Configure at least one by setting the appropriate environment variable:

```bash
# Option 1: OpenRouter (supports many models)
OPENROUTER_API_KEY=your-openrouter-api-key

# Option 2: OpenAI
OPENAI_API_KEY=your-openai-api-key

# Option 3: Grok (xAI)
XAI_API_KEY=your-xai-api-key

# Option 4: Hyperbolic
HYPERBOLIC_API_KEY=your-hyperbolic-api-key
```

When multiple providers are configured, you can specify which one to use:

```bash
# Optional: Choose provider (defaults to first available)
AI_PROVIDER=openrouter  # Options: openrouter, openai, grok, hyperbolic

# Optional: Specify model (defaults to provider-specific model)
AI_MODEL=google/gemini-2.5-flash  # Any model supported by your provider
```

Default models by provider:

- OpenRouter: `google/gemini-2.5-flash`
- OpenAI: `gpt-4o`
- Grok: `grok-3`
- Hyperbolic: `meta-llama/Llama-3.3-70B-Instruct`

### Ember MCP Tool Server

Configure access to the Ember MCP tool server:

```bash
QUICKNODE_SUBDOMAIN=your-quicknode-subdomain
QUICKNODE_API_KEY=your-quicknode-api-key
```

## Example Capabilities

Below are some example user inputs that showcase the swapping agent's capabilities:

- `Swap 0.00001 wstETH to wstETH_YT via wstETH market on arbitrum one`

- `Swap 0.1 wstETH_YT to wstETH on arbitrum one`

## Run Agent

To run and interact with the agent, follow the instructions in the [`community/README.md`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/community/README.md) file.

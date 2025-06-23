# Lending Agent Template

A production-ready template for building DeFi lending agents on Arbitrum with the Arbitrum Vibekit framework. The agent exposes common lending actions such as `supply`, `borrow`, `repay`, and `withdraw`, orchestrated by an LLM.

## Quick Start

```bash
pnpm install
cp env.example .env
pnpm dev
```

## AI Provider Setup

This agent supports multiple AI providers. Configure at least one of the following environment variables:

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

Optional overrides:

```bash
# Preferred provider (defaults to first available)
AI_PROVIDER=openrouter  # openrouter | openai | grok | hyperbolic

# Custom model (defaults to provider-specific default)
AI_MODEL=google/gemini-2.5-flash
```

## Other Environment Variables

| Variable            | Description                             | Required |
| ------------------- | --------------------------------------- | -------- |
| `QUICKNODE_API_KEY` | QuickNode API key for blockchain access | Yes      |
| `PORT`              | Server port (default: 3010)             | No       |
| `ENABLE_CORS`       | Enable CORS headers (`true` by default) | No       |

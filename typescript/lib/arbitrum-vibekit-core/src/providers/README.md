# Provider Selector

The provider selector module provides a unified interface for creating AI language models from multiple providers (OpenRouter, xAI/Grok, and Hyperbolic) that are compatible with the Vercel AI SDK.

## Usage

```typescript
import { createProviderSelector } from 'arbitrum-vibekit-core';

// Create a provider selector with your API keys
const providers = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  xaiApiKey: process.env.XAI_API_KEY,
  hyperbolicApiKey: process.env.HYPERBOLIC_API_KEY,
});

// Use with an Agent
import { Agent } from 'arbitrum-vibekit-core';

if (providers.openrouter) {
  const agent = Agent.create(config, {
    llm: {
      model: providers.openrouter('google/gemini-2.0-flash'),
    },
  });
}
```

## Available Providers

- **OpenRouter** (`openrouter`): Access to 100+ models through OpenRouter
- **xAI/Grok** (`grok`): Access to Grok models from xAI
- **Hyperbolic** (`hyperbolic`): Access to open-source models via Hyperbolic

## Testing

To run tests:

```bash
pnpm test
```

This will run:

- **Unit tests** - Always run, use mocked providers
- **Integration tests** - Only run if API keys are present in `.env` file

### Setting up Integration Tests

1. Copy your API keys to a `.env` file:

   ```bash
   OPENROUTER_API_KEY="your-key"
   XAI_API_KEY="your-key"
   HYPERBOLIC_API_KEY="your-key"
   ```

2. Run tests:
   ```bash
   pnpm test
   ```

Integration tests will:

- Automatically skip if no API keys are found
- Test only the providers that have API keys
- Make real API calls to verify everything works end-to-end
- Use minimal tokens (5 per test) to keep costs low

## API Keys

Get your API keys from:

- **OpenRouter**: https://openrouter.ai/keys
- **xAI**: https://x.ai/api
- **Hyperbolic**: https://docs.hyperbolic.xyz/docs/create-account

# Vibekit Frontend

A Next.js-based web frontend for interacting with Vibekit's on-chain AI agents via the Model Context Protocol (MCP). It leverages the Vercel AI SDK for smooth LLM integration, defaulting to OpenRouter but easily switchable to other providers.

## Model Providers

This frontend uses [OpenRouter](https://openrouter.ai/) as the default LLM provider. However, with the [Vercel AI SDK](https://sdk.vercel.ai/docs), you can easily switch to other providers such as [OpenAI](https://openai.com), [Anthropic](https://anthropic.com), [Cohere](https://cohere.com/), and [many more](https://sdk.vercel.ai/providers/ai-sdk-providers) with just a few lines of code.

## Architecture

This frontend is part of the [Arbitrum Vibekit](https://github.com/OffchainLabs/vibekit) monorepo. It serves as the user interface for interacting with on-chain AI agents, which are implemented as MCP servers. The frontend communicates with the agent backend using the MCP protocol, enabling secure and extensible agent interactions.

- **Monorepo Structure:**

  - `typescript/clients/web/` – This frontend
  - `typescript/examples/` – Example agents
  - `typescript/lib/` – Supporting libraries and MCP tools

- **How it works:**
  1. The frontend sends user input to the MCP agent backend.
  2. The agent processes the request, possibly interacting with on-chain contracts or external services.
  3. The response is streamed back and rendered in the UI.

## Running Locally with Docker Compose

### Set Up Your Environment

1. Make sure you have [Docker](https://docs.docker.com/engine/install/) and [Docker Compose](https://docs.docker.com/compose/install/) installed on your system.

2. In the `typescript` folder (the monorepo root), make a copy of `.env.example` and name it `.env`. Fill in your API keys, generate an auth secret, and change the Postgres password in the `.env` file.

### Spin Up the Frontend:

Run the following docker compose command to run the frontend:

```bash
docker compose up -d
```

To access your applications:

- Web app: [http://localhost:3000](http://localhost:3000)
- MCP server: [http://localhost:3001](http://localhost:3001)

## Customization

**Model Providers:**  
 The frontend supports multiple LLM providers via the Vercel AI SDK. You can configure your preferred provider in the environment variables or code.

**Connecting to a different agent:**  
 Coming soon!

## Contributing

We welcome contributions from the community! If you'd like to help improve Vibekit, please check out our [Contribution Guidelines](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/CONTRIBUTIONS.md).

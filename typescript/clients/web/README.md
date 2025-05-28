# Vibekit Frontend

A Next.js-based web frontend for interacting with Vibekit's on-chain AI agents via the Model Context Protocol (MCP). The frontned offers smooth LLM integration through [OpenRouter](https://openrouter.ai/), and is easily switchable to other LLM providers.

## Architecture

This frontend is part of the Arbitrum Vibekit monorepo. It serves as the user interface for communicating with the on-chain AI agents, which are implemented as MCP servers.

- **Monorepo Structure:**

  - `typescript/clients/web/` – This frontend
  - `typescript/examples/` – Example agents
  - `typescript/lib/` – Supporting libraries and MCP tools

- **How it works:**
  1. The frontend sends user input to the MCP agent backend.
  2. The agent processes the request, possibly interacting with on-chain contracts or external services.
  3. The response is streamed back and rendered in the frontend.

## Model Providers

This frontend uses [OpenRouter](https://openrouter.ai/) as the default LLM provider. However you can easily switch to other providers such as [OpenAI](https://openai.com), [Anthropic](https://anthropic.com), [Cohere](https://cohere.com/), and many more with just a few lines of code. Refer to [this guide](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/docs/02-update-models.md) to get started. 


## Agent Configuration

The frontend's connection to different AI agents is managed by the [agents-config.ts](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/agents-config.ts) file which is pivotal for how the web application identifies and interacts with the available AI agents. The `agents-config.ts` file primarily defines:

**1. Agent Metadata (`chatAgents`):** 

This is an array where each entry represents an agent. It includes details like the agent's `id`, `name` (for display in the UI), `description`, and any `suggestedActions` (quick prompts for users).

**2. Agent Server URLs:** 

This is a map that links each agent's unique `id` to its specific backend server URL. The web application uses these URLs (typically SSE endpoints) to establish communication with the respective agent servers:

```typescript
export const DEFAULT_SERVER_URLS = new Map<ChatAgentId, string>([
  ["ember-aave", "http://173.230.139.151:3010/sse"], // lending-agent-no-wallet
  ["ember-camelot", "http://173.230.139.151:3011/sse"], // swapping-agent or swapping-agent-no-wallet
  ["ember-lp", "http://173.230.139.151:3012/sse"], // liquidity-agent-no-wallet
  ["ember-pendle", "http://173.230.139.151:3013/sse"], // pendle-agent
]);

```

**Note:** The web application does not initiate or run the agent server processes. Agents like `ember-aave` or `ember-pendle` must be independently started and run as separate server processes. The frontend then connects to these active servers using the specified URLs. To run these example agents, refer to the dedicated [README](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/examples/README.md) in the `examples` directory. 


**3. Agent ID Type (`ChatAgentId`):** 

A TypeScript type definition for agent IDs, ensuring type consistency. This type is automatically derived from the `id` properties in the `chatAgents` list.

This configuration allows the frontend to dynamically discover, list, and connect to the various agents you set up.

### Adding a Custom Agent

To add a new agent or modify an existing one for the frontend:

**1.** Ensure your agent server is running and accessible via a URL.

**2.** Add a new entry to the `chatAgents` array in `agents-config.ts` with the new agent's `id`, `name`, `description`, and any `suggestedActions`.

**3.** Add a corresponding entry to the `DEFAULT_SERVER_URLS` map in `agents-config.ts`, mapping the new agent's `id` to its running server URL.

**Note:** If you have already started the web app, make sure to rebuild it to reflect the changes you made:

```bash
  docker compose up -d --build
```

## Running the Frontend via Docker Compose

### Prerequisites

Ensure that [Docker](https://docs.docker.com/engine/install/) and [Docker Compose](https://docs.docker.com/compose/install/) are installed on your system.

### Running the Frontend

**1.** Clone the [Arbitrum Vibekit repository](https://github.com/EmberAGI/arbitrum-vibekit) if you haven't already:

```bash
git clone https://github.com/EmberAGI/arbitrum-vibekit.git && \
cd arbitrum-vibekit
```

**2.** Configure Environment Variables:

Navigate to the [typescript](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript) directory and create a `.env` file by copying the example template:

    ```bash
    cd typescript && \
    cp .env.example .env
    ```

Open the `.env` file and fill in the required values. This typically includes:

- Your preferred LLM provider API key (e.g., `OPENROUTER_API_KEY`).
- Generate a secure `AUTH_SECRET` (you can use `openssl rand -hex 32` or a similar tool).
- Set a `POSTGRES_PASSWORD`.

**3.** Start Services with Docker Compose:

From the [typescript](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript) directory, run the following command to build and start the frontend and its associated services (including an example agent like the lending agent, and the database):

  ```bash
  # Ensure you are in the typescript/ directory
  docker compose up -d
  ```

  This command runs the services in detached mode (in the background).

  **Note**: If you get a `permission denied error`, try running the above command with `sudo`:

  ```
  sudo  docker compose up -d
  ```

**4.** Access the Vibekit Web Frontend:

  Open your web browser and navigate to http://localhost:3000.
  
  You can now interact with your on-chain AI agents through the web interface.


## Contributing

We welcome contributions from the community! If you'd like to help improve Vibekit, please check out our [Contribution Guidelines](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/CONTRIBUTIONS.md).

To show our appreciation, we have launched an incentive program that rewards [valuable contributions](https://github.com/orgs/EmberAGI/projects/13) to the Vibekit. Checkout our blog post to learn more!

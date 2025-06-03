# Vibekit Frontend

A dockerized web frontend for interacting with Vibekit's AI agents via the Model Context Protocol (MCP). The frontend offers smooth LLM integration through [OpenRouter](https://openrouter.ai/), and is easily switchable to other LLM providers.

## Architecture

This frontend is part of the Arbitrum Vibekit monorepo. It serves as the user interface for communicating with the AI agents, which are implemented as MCP servers.

- **Monorepo Structure:**

  - `typescript/clients/web/` – This frontend
  - `typescript/examples/` – Example agents
  - `typescript/lib/` – Supporting libraries and MCP tools

- **How it works:**

  1. The frontend sends user input to the MCP agent backend.
  2. The agent processes the request, possibly interacting with on-chain contracts or external services.
  3. The response is streamed back and rendered in the frontend.

## Model Providers

This frontend uses [OpenRouter](https://openrouter.ai/) as the default LLM provider. However you can easily switch to other providers such as [OpenAI](https://openai.com), [Anthropic](https://anthropic.com), [Cohere](https://cohere.com/), and many more with just a few lines of code. Refer to [this guide](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/docs/02-update-models.md) to update your model provider.

## Quickstart

### Prerequisites

Ensure that [Docker](https://docs.docker.com/engine/install/) and [Docker Compose](https://docs.docker.com/compose/install/) are installed on your system.

**Note:** If your are on an M-series Mac, you need to install Docker using the [dmg package](https://docs.docker.com/desktop/setup/install/mac-install/) supplied officially by Docker rather than through Homebrew or other means.

### Running the Frontend

**1.** Clone the [Arbitrum Vibekit repository](https://github.com/EmberAGI/arbitrum-vibekit) if you haven't already:

```bash
git clone https://github.com/EmberAGI/arbitrum-vibekit.git &&
cd arbitrum-vibekit
```

**2.** Configure Environment Variables:

Navigate to the [typescript](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript) directory and create a `.env` file by copying the example template:

```bash
cd typescript &&
cp .env.example .env
```

Open the `.env` file and fill in the required values. This typically includes:

- Your preferred LLM provider API key (e.g., `OPENROUTER_API_KEY`).
- Generate a secure `AUTH_SECRET` (you can use `openssl rand -hex 32` or a similar tool).
- Set a `POSTGRES_PASSWORD`.

**3.** Start Services with Docker Compose:

From the [typescript](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript) directory, run the following command to build and start the frontend and its associated services (including the lending agent, and the database):

```bash
# Ensure you are in the typescript/ directory
docker compose up
```

**Note**: If you get a `permission denied error`, try running the above command with `sudo`:

```
sudo  docker compose up
```

**4.** Access Vibekit's Web Interface:

Open your web browser and navigate to http://localhost:3000. To be able to use the web interface, you need to connect your wallet first. Click on "Connect Wallet" to get started:

<p align="left">
  <img src="../../../img/wallet.png" width="700px" alt="wallet"/>
</p>

After setting up your wallet, you can interact with Lending agent through the chat interface:

<p align="left">
  <img src="../../../img/frontend.png" width="700px" alt="frontend"/>
</p>

## Agent Configuration

The frontend's connection to different AI agents is managed by the [agents-config.ts](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/agents-config.ts) file and the [docker compose](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/compose.yml) file. These files are pivotal for how the web application identifies and interacts with the available AI agents.

The `agents-config.ts` file primarily defines:

**1. Agent Metadata (`chatAgents`):**

This is an array where each entry represents an agent. It includes details like the agent's `id`, `name` (for display in the UI), `description`, and any `suggestedActions` (quick prompts for users).

**2. Agent ID Type (`ChatAgentId`):**

A TypeScript type definition for agent IDs, ensuring type consistency. This type is automatically derived from the `id` properties in the `chatAgents` list.

**3. Agent Server URLs:**

This is a map that links each agent's unique `id` to its specific backend server URL. The web application uses these URLs (typically SSE endpoints) to establish communication with the respective agent servers:

```typescript
export const DEFAULT_SERVER_URLS = new Map<ChatAgentId, string>([
  ['ember-aave', 'http://lending-agent-no-wallet:3001/sse'],
]);
```

**Note:** The web application only starts the lending agent. Other agents like `ember-camelot` or `ember-pendle` must be independently started and run as separate server processes via the [docker compose](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/compose.yml) file. The frontend then connects to these active servers using the specified URLs. To run these example agents, or any other custom agents refer to the next section.

### Integrating a Custom Agent

To integrate another example agent or a custom agent into the frontend:

**1.** Add the agent sever to the services defined in the [docker compose](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/compose.yml) file.

For instance, to add the `swapping-agent-no-wallet`, define its server right after the `lending-agent-no-wallet`:

```
services:
  lending-agent-no-wallet:
    build:
      context: ./
      dockerfile: examples/lending-agent-no-wallet/Dockerfile
    container_name: vibekit-lending-agent-no-wallet
    env_file:
      - .env
    ports:
      - '${PORT:-3001}:${PORT:-3001}'
    restart: unless-stopped

  swapping-agent-no-wallet:
    build:
      context: ./
      dockerfile: examples/swapping-agent-no-wallet/Dockerfile
    container_name: vibekit-swapping-agent-no-wallet
    env_file:
      - .env
    ports:
      - '${PORT:-3002}:${PORT:-3002}'
    restart: unless-stopped
```

If you're integrating a custom agent, ensure your agent's server runs and is accessible via a URL first.

**Note:** Each agent server must use a unique port number. If two agents are assigned the same port in your Docker Compose or server configuration, they will fail to start due to a port conflict (`port already in use` error).
To avoid this, assign a different port to each agent and update both your Docker Compose file and the corresponding URLs in `agents-config.ts` so the frontend can connect to each agent correctly.

**2.** Add a new entry to the `chatAgents` array in [agents-config.ts](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/agents-config.ts) file with the new agent's `id`, `name`, `description`, and any `suggestedActions`.

For example, to integrate the `swapping-agent-no-wallet`, add its configuration right after the entry for `lending-agent-no-wallet`:

```
export const chatAgents = [
  {
    id: 'ember-aave' as const,
    name: 'Lending',
    description: 'AAVE lending agent',
    suggestedActions: [
      {
        title: 'Deposit WETH',
        label: 'to my balance',
        action: 'Deposit WETH to my balance',
      },
      { title: 'Check', label: 'balance', action: 'Check balance' },
    ],
  },
  {
    id: "ember-camelot" as const,
    name: "Trading",
    description: "Camelot Swapping agent",
    suggestedActions: [
      {
        title: "Swap USDC for ETH",
        label: "on Arbitrum Network.",
        action: "Swap USDC for ETH tokens from Arbitrum to Arbitrum Network.",
      },
      {
        title: "Buy ARB",
        label: "on Arbitrum Network.",
        action: "Buy ARB token.",
      },
    ],
  },

```

**3.** Add a corresponding entry to the `DEFAULT_SERVER_URLS` map in [`agents-config.ts`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/agents-config.ts), mapping the new agent's `id` to its running server URL.

For example, to integrate the `swapping-agent-no-wallet`, add its URL entry right after the one for `lending-agent-no-wallet`:

```typescript
export const DEFAULT_SERVER_URLS = new Map<ChatAgentId, string>([
  ['ember-aave', 'http://lending-agent-no-wallet:3001/sse'],
  ['ember-camelot', 'http://swapping-agent-no-wallet:3002/sse'],
]);
```

**Note:** If you have already started the web app, make sure to stop it and rebuild it to reflect the changes you made:

```bash
  docker compose down &&
  docker compose up --build
```

This configuration allows the frontend to dynamically discover, list, and connect to the various agents you set up.

## Contributing

We welcome contributions from the community! If you'd like to help improve Vibekit, please check out our [Contribution Guidelines](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/CONTRIBUTIONS.md).

To show our appreciation, we have launched an incentive program that rewards [valuable contributions](https://github.com/orgs/EmberAGI/projects/13) to the Vibekit. Checkout our blog post to learn more!

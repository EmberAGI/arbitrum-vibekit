# Vibekit Frontend

A dockerized web frontend for interacting with Vibekit's AI agents via the Model Context Protocol (MCP). The frontend offers smooth LLM integration through [OpenRouter](https://openrouter.ai/), and is easily switchable to other LLM providers.

## Architecture

This frontend is part of the Arbitrum Vibekit monorepo. It serves as the user interface for communicating with the AI agents, which are implemented as MCP servers.

**Monorepo Structure:**

- `typescript/clients/web/` : This frontend
- `typescript/templates/` : Framework agents to use as a starting template, and example agents.
- `typescript/lib/` : Supporting libraries and MCP tools

**How it works:**

1. The user interacts with the web frontend.

2. User input is processed using an LLM (e.g., via OpenRouter) that discovers available "tools" from backend MCP agent servers (e.g., Lending Agent, Swapping Agent). These tools represent agent capabilities.

3. The LLM uses the user's message and available tools to either respond directly or utilize agent tools, orchestrating the agents in this way.

4. The MCP agent executes the action and returns the result.

5. The result is sent back to the LLM, which formulates a final response to the frontend UI.

## Model Providers

This frontend uses [OpenRouter](https://openrouter.ai/) as the default LLM provider. However you can easily switch to other providers such as [OpenAI](https://openai.com), [Anthropic](https://anthropic.com), [Cohere](https://cohere.com/), and many more with just a few lines of code. Refer to [this guide](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/docs/update-models.md) to update your model provider.

## Quickstart

**Prerequisites:**

Make sure you have [Docker Desktop](https://www.docker.com/products/docker-desktop/) with Docker Compose v2.24 or greater installed on your system.

> [!NOTE]  
> If your are on an M-series Mac, you need to install Docker using the [dmg package](https://docs.docker.com/desktop/setup/install/mac-install/) supplied officially by Docker rather than through Homebrew or other means to avoid build issues.

**1. Get the Code:**

How you get the code depends on whether you want to simply run the project or contribute to its development. If you just want to run Vibekit locally or explore the codebase, you can clone the repository through command line or your preferred IDE:

```
git clone https://github.com/EmberAGI/arbitrum-vibekit.git &&
cd arbitrum-vibekit
```

If you plan to contribute changes to Vibekit, fork the repository on [Vibekit's Github page](https://github.com/EmberAGI/arbitrum-vibekit) and clone your fork locally. Replace `YOUR_USERNAME` with your GitHub username:

```
git clone https://github.com/YOUR_USERNAME/arbitrum-vibekit.git &&
cd arbitrum-vibekit
```

For more detailed contribution steps, please see our [Contribution Guidelines](CONTRIBUTIONS.md).

**2. Configure Environment Variables:**

Navigate to the [typescript](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript) directory and create a `.env` file by copying the example template:

```bash
cd typescript &&
cp .env.example .env
```

Open the `.env` file and fill in the required values. This typically includes:

- Your preferred LLM provider API key (e.g., `OPENROUTER_API_KEY`).
- Generate a secure `AUTH_SECRET` (you can use https://generate-secret.vercel.app/32 or `openssl rand -base64 32`).
- Set a `POSTGRES_PASSWORD`.

**3. Start Services with Docker Compose:**

From the [typescript](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript) directory, run the following command to build and start the frontend and its associated services (including the lending agent, the swapping agent and the database):

```bash
# Ensure you are in the typescript/ directory
docker compose up
```

> [!WARNING]
> If you previously ran `docker compose up` with an older version of this repository and encounter frontend errors or database-related errors in the `docker service logs`, follow these steps:
>
> 1. Clear your browser cache.
> 2. Run the following command in your terminal:
>    ```bash
>    docker compose down && docker volume rm typescript_db_data && docker compose build web --no-cache && docker compose up
>    ```

**4. Access Vibekit's Web Interface:**

Open your web browser and navigate to http://localhost:3000. To be able to chat with the agents, you need to connect your wallet first. Click on "Connect Wallet" to get started:

<p align="left">
  <img src="../../../img/wallet.png" width="700px" alt="wallet"/>
</p>

After setting up your wallet, you can interact with the lending and swapping agents through the chat interface:

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
  ['ember-camelot', 'http://swapping-agent-no-wallet:3005/sse'],
  // ["ember-lp", "http://liquidity-agent-no-wallet:3002/sse"],
  // ["ember-pendle", "http://pendle-agent:3003/sse"],
]);
```

> [!NOTE]  
> The web application only starts the lending agent (`ember-aave`) and the swapping agent (`ember-camelot`). Other agents like `ember-pendle` or `ember-lp` must be started and run as separate server processes via the [docker compose](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/compose.yml) file. The frontend then connects to these active servers using the specified URLs. To run these example agents, or any other custom agents refer to the next section.

### Integrating a Custom Agent

To integrate another example agent or a custom agent into the frontend:

**1. Add the agent sever to the services defined in the [docker compose](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/compose.yml) file.**

For instance, to add the `pendle-agent` or the `liquidity-agent-no-wallet`, uncomment their server definitions in the `compose.yml` file:

```
services:
  lending-agent-no-wallet:
    ...

  swapping-agent-no-wallet:
    ...

  # liquidity-agent-no-wallet:
  #   build:
  #     context: ./
  #     dockerfile: community/liquidity-agent-no-wallet/Dockerfile
  #   container_name: vibekit-liquidity-agent-no-wallet
  #   env_file:
  #     - .env
  #   ports:
  #     - 3002:3002
  #   restart: unless-stopped

  # pendle-agent:
  #   build:
  #     context: ./
  #     dockerfile: community/pendle-agent/Dockerfile
  #   container_name: vibekit-pendle-agent
  #   env_file:
  #     - .env
  #   ports:
  #     - 3003:3003
  #   restart: unless-stopped
```

If you're integrating a custom agent, ensure your agent's server runs and is accessible via a URL first, and then add its server configurations to this file. We recommend using our [Quickstart Agent template](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates/quickstart-agent) to create custom agents, it provides all the necessary boilerplate code so you can start building right away.

> [!NOTE]  
> Each agent server must use a unique port number. If two agents are assigned the same port in your Docker Compose or server configurations, they will fail to start due to a port conflict (`port already in use` error).
> To avoid this, assign a different port to each agent and update both your Docker Compose file and the corresponding URLs in `agents-config.ts` so the frontend can connect to each agent correctly.

**2. Add a new entry to the `chatAgents` array in [agents-config.ts](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/agents-config.ts) file with the new agent's `id`, `name`, `description`, and any `suggestedActions`.**

For instance, to add the `pendle-agent` or the `liquidity-agent-no-wallet`, uncomment their definitions in the `agents-config.ts` file:

```
export const chatAgents = [
  {
    id: 'ember-aave' as const,
    name: 'Lending',
    description: 'AAVE lending agent',
    suggestedActions: [
        ...
    ],
  },
  {
    id: "ember-camelot" as const,
    name: "Trading",
    description: "Camelot Swapping agent",
    suggestedActions: [
        ...
    ],
  },
    // {
  //   id: "ember-lp" as const,
  //   name: "LPing",
  //   description: "Camelot Liquidity Provisioning agent",
  //   suggestedActions: [
  //     {
  //       title: "Provide Liquidity",
  //       label: "on Arbitrum Network.",
  //       action: "Provide Liquidity on Arbitrum Network.",
  //     },
  //     {
  //       title: "Check",
  //       label: "Liquidity positions",
  //       action: "Check Positions",
  //     },
  //   ],
  // },
  // {
  //   id: "ember-pendle" as const,
  //   name: "Pendle",
  //   description: "Test agent for Pendle",
  //   suggestedActions: [
  //     {
  //       title: "Deposit WETH",
  //       label: "to my balance",
  //       action: "Deposit WETH to my balance",
  //     },
  //     {
  //       title: "Check",
  //       label: "balance",
  //       action: "Check balance",
  //     },
  //   ],
  // },
]
```

**3. Add a corresponding entry to the `DEFAULT_SERVER_URLS` map in [`agents-config.ts`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/agents-config.ts), mapping the new agent's `id` to its running server URL.**

For instance, to add the `pendle-agent` or the `liquidity-agent-no-wallet`, uncomment their URL entries in the `agents-config.ts` file:

```typescript
export const DEFAULT_SERVER_URLS = new Map<ChatAgentId, string>([
  ['ember-aave', 'http://lending-agent-no-wallet:3001/sse'],
  ['ember-camelot', 'http://swapping-agent-no-wallet:3005/sse'],
  // ["ember-lp", "http://liquidity-agent-no-wallet:3002/sse"],
  // ["ember-pendle", "http://pendle-agent:3003/sse"],
]);
```

> [!NOTE]  
>  If you have already started the web app, make sure to stop it and rebuild it to reflect the changes you made:
>
> ```bash
> docker compose down && docker compose up --build
> ```

This configuration allows the frontend to dynamically discover, list, and connect to the various agents you set up.

## Contributing

We welcome contributions from the community! If you'd like to help improve Vibekit, please check out our [Contribution Guidelines](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/CONTRIBUTIONS.md).

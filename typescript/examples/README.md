## 🎛️ Agent Playground

The `examples` directory contains ready-to-roll DeFi agents built with the Vibekit. These agents showcase how to deploy smart, autonomous on-chain agents in a few steps. Each agent also doubles as an MCP tool, which enables powerful agent-to-agent integrations.

Many of the tools and operations these agents use are defined in [`mcp-tools`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/mcp-tools). If you're building a new agent or want to extend functionality, the `mcp-tools` directory is the place to define your tool logic and add new capabilities for your agents to use.

if you want to vibe code your own custom agent, jump to [Building Your Own Agent](#️-building-your-own-agent) to get started.

## 🚀 Running an Existing Agent

### 1. Setup You Environment

Navigate to the desired agent's directory and create an `.env` file. Copy the contents of `.env.example` into the `.env` file and fill in any required secrets or configuration variables.

### 2. Start the Agent

There are three main ways to start an agent:

**1. Cursor's AI Assistant (Vibe Coding)**:

Ask Cursor's integrated AI assistant to run your desired agent.

**2. Docker Compose**:

Navigate to the `typescript` directory and install the necessary packages.

```
cd typescript &&
pnpm install
```

Next, run the MCP-enabled Docker container to start your agent. Replace the `"agent-name"` with the name of your desired agent, for example: `"swapping-agent-no-wallet"`.

```
pnpm --filter "agent-name" docker:compose:up
```

**Note**: If you get a `permission denied error`, try running the above command with `sudo`:

```
sudo pnpm --filter "agent-name" docker:compose:up
```

**Running on background**: To run the agent in the background so you can keep using your terminal, use the `-d` flag:

```
pnpm --filter "agent-name" docker:compose:up -d
```

To stop the agent afterwards, use the following command:

```
pnpm --filter "agent-name" docker:compose:down
```

**3. Local Development**:

Navigate to the `typescript` directory and run the following `pnpm` commands to build
your agent. Replace the `"agent-name"` with the name of your desired agent, for example: `"swapping-agent-no-wallet"`.

```
cd typescript &&
pnpm install &&
pnpm build &&
pnpm --filter "agent-name" dev
```

### 3. Interact with the Agent

Once the agent is up and running, you have three ways of interacting with it:

**1. Launch the Inspector interface:**

Open a new terminal window and run the following to start the inspector:

```bash
npx -y @modelcontextprotocol/inspector
```

Navigate to http://127.0.0.1:6274 in your browser to access the interface and click on "Connect" to establish a connection with your local server:

<p align="left">
  <img src="../../img/inspector_1.png" width="700px" alt="Inspector1"/>
</p>

Next, click on "List Tools" to view and run the tools your agent offers:

<p align="left">
  <img src="../../img/inspector_2.png" width="700px" alt="Inspector2"/>
</p>

The Inspector interface provides a straightforward way to interact with your agent. For a more integrated development experience, you can use the Cursor IDE.

**3. Integrate with Cursor IDE**

**Note:** This configuration approach is also compatible with other graphical MCP clients like [Claude Desktop](https://modelcontextprotocol.io/quickstart/user) and [Windsurf](https://docs.windsurf.com/windsurf/mcp). Simply adjust the settings accordingly in their respective configuration files.

To interact with the agent though Cursor, [create or update](https://docs.cursor.com/context/model-context-protocol) your `mcp.json` file through Cursor's MCP settings with the following content. If your agent is running on a different port than 3001, make sure to adjust it:

```
{
 "mcpServers": {
   "local-sse-agent": {
     "url": "http://localhost:3001/sse"
   }
 }
}

```

You might need to restart Cursor to apply the new configuration. Upon successful integration, Cursor will automatically detect the Agent MCP tool and you can interact with it directly through prompts.

**3. Web Interface**

Coming Soon!

## 🛠️ Building Your Own Agent

Coming soon!

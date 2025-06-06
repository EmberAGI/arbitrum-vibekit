## 🎛️ Agent Playground

The `examples` directory contains ready-to-roll DeFi agents built with the Vibekit. These agents showcase how to deploy smart, autonomous on-chain agents in a few steps. Each agent also doubles as an MCP tool, which enables powerful agent-to-agent integrations.

Many of the tools and operations these agents use are defined in [`mcp-tools`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/mcp-tools). If you're building a new agent or want to extend functionality, the `mcp-tools` directory is the place to define your tool logic and add new capabilities for your agents to use.

if you want to vibe code your own custom agent, jump to [Building Your Own Agent](#️-building-your-own-agent) to get started.

## 🚀 Running an Existing Agent

### 1. Set Up Your IDE

To get started, we recommend using the [Cursor IDE](https://www.cursor.com/), an AI-powered development environment designed for smooth collaboration between you and your AI assistant. With Cursor, you can:

- Define your project's context using simple rule files located in the [.cursor/rules](https://docs.cursor.com/context/rules) folder.

- Run AI agents locally or remotely within your development environment.

- Integrate with [MCP-powered](https://docs.cursor.com/context/model-context-protocol) tools and workflows for advanced functionality.

To clone Vibekit in Cursor:

1. Open Cursor and click "Clone Repository" in the welcome screen.
2. Paste the repository URL: `https://github.com/EmberAGI/arbitrum-vibekit.git`.
3. Choose your local directory and click "Clone".

<p align="left">
  <img src="../../img/cursor.png" width="900px" alt="cursor"/>
</p>

Once cloned, Cursor will automatically detect the `.cursor/rules` folder and set up the AI context.

### 2. Set Up Your Environment

Ensure that Node.js 22+ and pnpm are installed.

```
node -v # Should be 22+
pnpm -v # Check that pnpm is installed
```

Next, navigate to the desired agent's directory and create an `.env` file. Copy the contents of `.env.example` into the `.env` file and fill in any required secrets or configuration variables.

Next, navigate to the `typescript` directory and install the necessary packages.

```
cd typescript &&
pnpm install
```

### 3. Start the Agent

You can start an agent in four different ways. Simply choose the approach that best fits your preferences and project setup:

**1. Cursor's AI Assistant (Vibe Coding)**:

Ask Cursor's integrated AI assistant to run your desired agent.

**2. Agent as Task**:

If you are using VSCODE or Cursor, you can run agents as [tasks](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/.vscode/tasks.json). To start an agent:

- Open the Vibekit repo in your preferred IDE.
- Press on `Cntrl + shift + P` ( `Cmnd + shift + P` on Mac) to open up the Command Palette.
- Search for "Run Task".

<p align="left">
  <img src="../../img/run_tasks1.png" width="600px" alt="Inspector2"/>
</p>

- Choose you're desired agent to run.

<p align="left">
  <img src="../../img/run_tasks2.png" width="600px" alt="Inspector2"/>
</p>

The agent will be available locally on the port specified in the Dockerfile within the agent's folder.

**Note:** If you are running multiple agents simultaneously, make sure their ports do not conflict. You can verify and adjust the port settings by referring to the Dockerfile in each agent's directory.

**3. Docker Compose**:

Run the MCP-enabled Docker container in the `typescript` directory to start your agent. Replace the `"agent-name"` with the name of your desired agent, for example: `"swapping-agent-no-wallet"`.

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

**4. Local Development**:

Run the following `pnpm` commands in the `typescript` directory to build and run
your agent. Replace the `"agent-name"` with the name of your desired agent, for example: `"swapping-agent-no-wallet"`.

```
pnpm build &&
pnpm --filter "agent-name" dev
```

### 4. Interact with the Agent

Once the agent is up and running, you have three ways of interacting with it:

**1. Vibekit's Web Interface**

To interact with the agent through the web interface, refer to [this quickstart](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/docs/quickstart.md) guide.

**2. Integrate with Cursor IDE**

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

**3. Launch the Inspector Interface:**

Open a new terminal window and run the following to start the inspector:

```bash
npx -y @modelcontextprotocol/inspector
```

Navigate to http://127.0.0.1:6274 in your browser to access the interface and click on "Connect" to establish a connection with your local server:

<p align="left">
  <img src="../../img/inspector_1.png" width="700px" alt="Inspector1"/>
</p>

Next, click on "List Tools" to view the tools your Lending Agent offers:

<p align="left">
  <img src="../../img/inspector_2.png" width="700px" alt="Inspector2"/>
</p>

Next, select "askLendingAgent", input your wallet address and query, and execute the tool to interact with your agent:

<p align="left">
  <img src="../../img/inspector_3.png" width="700px" alt="Inspector3"/>
</p>

The Inspector interface provides a straightforward way to interact with your agent.

## 🛠️ Building Your Own Agent

Coming soon!

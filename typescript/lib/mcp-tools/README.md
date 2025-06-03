## 🧩 MCP Tools

Welcome to Vibekit's MCP tools directory! Model Context Protocol (MCP) tools are standardized interfaces that allow agents to easily interact with on-chain data, execute DeFi operations, and integrate with external services. This directory contains the MCP building blocks that give DeFi agents their superpowers.

## 🛠️ Building Your MCP Tool

By contributing new MCP tools, you're expanding the possibilities for all Vibekit agents. Your tools can enable new DeFi strategies, integrate additional protocols, or enhance existing capabilities. This guide will walk you through the process of creating and contributing your own MCP tools to the ecosystem. Before submitting a pull request for your work, please review the guidelines in [`CONTRIBUTIONS.md`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/CONTRIBUTIONS.md) to ensure best practices are followed.

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
  <img src="../../../img/cursor.png" width="900px" alt="cursor"/>
</p>

Once cloned, Cursor will automatically detect the `.cursor/rules` folder and set up the AI context.

### 2. Set Up Your Project:

If you'd like to speed up the setup process, consider using [FastMCP](https://github.com/punkpeye/fastmcp/) or [AI Tool Maker](https://github.com/nihaocami/ai-tool-maker). These tools can automatically generate the boilerplate code and folder structure for your MCP tool, allowing you to focus on your tool's unique logic. If you prefer a more hands-on approach or need a custom setup, follow the manual steps outlined below to build your MCP tool from scratch.

1. Inside the `mcp-tools` directory, create a new directory for your project.

2. Within this directory, add a `src` folder and create an `index.ts` file inside for your tool definitions. For reference, [`emberai-mcp/src/index.ts`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/mcp-tools/emberai-mcp/src/index.ts) is a template file that demonstrates the folder structure.

3. Create a `.env.example` file containing the configuration variables needed for your project.

4. Create a `package.json` file for your project to define your project's specifications and dependencies.

5. Optional: Create a `tsconfig.json` file to configure the TypeScript compiler for your project.

6. Install the necessary packages. This command depends on the package manager defined in your `package.json` file. Use the appropriate command from the options below:

   **pnpm** (recommended)

   ```bash
   pnpm install
   ```

   **npm**

   ```bash
   npm install
   ```

   **yarn**

   ```bash
   yarn install
   ```

### 3. Define Your Tools:

In the `src/index.ts` file, you can use Zod schemas to define your MCP tools. The schemas define the types, descriptions, and required properties of the parameters.

```typescript
// Define schema objects
const myOperationSchema = {
  paramOne: z.string().describe('Description of first parameter'),
  paramTwo: z.number().describe('Description of second parameter'),
};

// Create Zod objects and types
const myOperationParams = z.object(myOperationSchema);
type MyOperationParams = z.infer<typeof myOperationParams>;
```

### 4. Initialize the MCP Server:

Now that you've defined your tool's schemas, it's time to set up the MCP server that will host your tool and handle incoming requests.

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: 'my-mcp-tool-server',
  version: '1.0.0',
});

// Initialize your SDK client if needed
const myClient = new MySdkClient(process.env.MY_ENDPOINT || 'default-endpoint');
```

### 5. Register Your Tools:

Tools are registered with the `McpServer` using the `server.tool()` method. Each tool is registered with:

- A name, description, and parameter schema.
- A callback function that defines the logic for handling the tool's operation.

```typescript
server.tool(
  'myOperation',
  'Description of the operation',
  myOperationSchema,
  async (params: MyOperationParams, extra: any) => {
    try {
      const response = await myClient.performOperation({
        param1: params.paramOne,
        param2: params.paramTwo,
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);
```

### 6. Wire Up Transport and Entrypoint:

With your tool logic and server defined, the final step is to connect your server to a transport (such as STDIO) and provide an entrypoint for execution. This allows your MCP tool to receive and respond to requests when invoked.

```typescript
async function main() {
  const transport = new StdioServerTransport();
  try {
    await server.connect(transport);
    console.error('MCP server started and connected.');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
```

### 7. Run and Inspect Your Tool:

You can quickly test your MCP tool using the Inspector, which provides an interactive interface for sending requests and viewing responses. Build your project and launch the Inspector with the following command:

```bash
pnpm run build && npx -y @modelcontextprotocol/inspector node ./dist/index.js
```

### 8. Showcase Your Tool with a Demo Agent:

Consider showcasing your new MCP tool by building a demo agent in the [examples](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/examples) directory. Creating a simple agent that uses your tool is a great way to demonstrate its functionality and help others understand how to integrate it into their own projects.

## 🛠️ Vibe Coding Your MCP Tool

Coming Soon!

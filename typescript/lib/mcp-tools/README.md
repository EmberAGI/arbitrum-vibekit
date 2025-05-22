## 🧩 Contributing New Tools to Vibekit

Welcome to Vibekit's MCP tools directory! Model Context Protocol (MCP) tools are standardized interfaces that allow agents to easily interact with on-chain data, execute DeFi operations, and integrate with external services. This directory contains the MCP building blocks that give DeFi agents their superpowers.

By contributing new MCP tools, you're expanding the possibilities for all Vibekit agents. Your tools can enable new DeFi strategies, integrate additional protocols, or enhance existing capabilities. This guide will walk you through the process of creating and contributing your own MCP tools to the ecosystem. Before submitting a pull request for your work, please review the guidelines in [`CONTRIBUTIONS.md`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/CONTRIBUTIONS.md) to ensure best practices are followed.

## 🛠️ Building Your MCP Tool

If you'd like to speed up the setup process, consider using [FastMCP](https://github.com/punkpeye/fastmcp/) or [AI Tool Maker](https://github.com/nihaocami/ai-tool-maker). These tools can automatically generate the boilerplate code and folder structure for your MCP tool, allowing you to focus on your tool's unique logic. If you prefer a more hands-on approach or need a custom setup, follow the manual steps outlined below to build your MCP tool from scratch.

### 1. Set Up Your Project:

1. Inside the `mcp-tools` directory, create a new directory for your project.

2. Within this directory, add a `src` folder and create an `index.ts` file inside for your tool definitions. For reference, [`emberai-mcp/src/index.ts`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/mcp-tools/emberai-mcp/src/index.ts) is a template file that demonstrates the folder structure.

3. Create a `.env` file containing the configuration variables needed for your SDK or API.

4. Create a `package.json` file for your project. You can use the provided [`emberai-mcp/package.json`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/mcp-tools/emberai-mcp/package.json) file and change it to your project's specifications and dependencies.

5. Optional: Create a `tsconfig.json` file to configure the TypeScript compiler for your project. You can use the provided [`emberai-mcp/tsconfig.json`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/mcp-tools/emberai-mcp/tsconfig.json) file and change it to your project's specifications.

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

Now you can start creating your tool in the `src/index.ts` file.

### 2. Define Zod Schemas:

In the `src/index.ts` file, you can use Zod schemas to validate the input parameters for each tool. The schemas define the types, descriptions, and required properties of the parameters.

```typescript
// Define schema objects
const myOperationSchema = {
  paramOne: z.string().describe("Description of first parameter"),
  paramTwo: z.number().describe("Description of second parameter"),
};

// Create Zod objects and types
const myOperationParams = z.object(myOperationSchema);
type MyOperationParams = z.infer<typeof myOperationParams>;
```

### 3. Initialize the MCP Server:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "my-mcp-tool-server",
  version: "1.0.0",
});

// Initialize your SDK client if needed
const myClient = new MySdkClient(process.env.MY_ENDPOINT || "default-endpoint");
```

### 4. Register Your Tools:

Tools are registered with the `McpServer` using the `server.tool()` method. Each tool is registered with:

- A name, description, and parameter schema.
- A callback function that defines the logic for handling the tool's operation.

```typescript
server.tool(
  "myOperation",
  "Description of the operation",
  myOperationSchema,
  async (params: MyOperationParams, extra: any) => {
    try {
      const response = await myClient.performOperation({
        param1: params.paramOne,
        param2: params.paramTwo,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);
```

### 5. Connect Transport and Start Server:

The tool implementation process is now complete, and you can start your MCP server.

```typescript
async function main() {
  const transport = new StdioServerTransport();
  try {
    await server.connect(transport);
    console.error("MCP server started and connected.");
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

main();
```

### 6. Test Your New Tool:

To test your MCP server, you can launch the Inspector directly with the following command:

```bash
pnpm run build && npx -y @modelcontextprotocol/inspector node ./dist/index.js
```

This will start your tool and open the Inspector interface, allowing you to interact with and debug your MCP tool implementation.

### 7. Showcase Your Tool with a Demo Agent:

Consider showcasing your new MCP tool by building a demo agent in the [examples](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/examples) directory. Creating a simple agent that uses your tool is a great way to demonstrate its functionality and help others understand how to integrate it into their own projects.

## 🛠️ Vibe Coding Your MCP Tool

Coming Soon!

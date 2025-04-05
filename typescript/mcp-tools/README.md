# Contributing New Tools to Agentkit

Before submitting a pull request for your work, please review the guidelines in CONTRIBUTIONS.md to ensure best practices are followed.

## Creating an MCP Server for Your Functionality

If you prefer an automated approach, consider using [FastMCP](https://github.com/punkpeye/fastmcp/) or [AI Tool Maker](https://github.com/nihaocami/ai-tool-maker). Otherwise, the steps below outline how to create custom MCP tools manually, adapting the process to your specific requirements.

### 1. Set Up Your Project

1. Inside the `mcp-tools` directory, create a new folder for your tool.

2. Within this folder, add a `src` directory and create an `index.ts` file for your tool definitions. For reference, `emberai-mcp/src/index.ts` is a template file that demonstrates the folder structure.

3. Copy the `.env.example` file to `.env` in your agent's directory and fill in any required secrets or configuration variables.

4. Install the necessarry packages:

```bash
pnpm install
# Install your specific SDK
```

### 2. Define Zod Schemas

Zod schemas are used to validate the input parameters for each tool. The schemas define the types, descriptions, and required properties of the parameters.

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

### 3. Initialize the MCP Server

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "my-mcp-tool-server",
  version: "1.0.0",
});

// Initialize your SDK client
const myClient = new MySdkClient(process.env.MY_ENDPOINT || "default-endpoint");
```

### 4. Register Your Tools

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

### 5. Connect Transport and Start Server

The tool implementation process is now complete and you can start your MCP server.

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

## Testing

If you want to test the server functionality, you can run the following command to launch the Inspector via npx:

```bash
pnpm run inspect:npx
```

## Conclusion

You have now created a custom MCP server tailored to your project’s requirements. Your new tools can now perform on-chain operations, integrate external SDKs, or perform specialized functions within AgentKit.

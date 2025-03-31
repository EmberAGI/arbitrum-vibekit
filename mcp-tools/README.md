# Contributing new tools to the Agentkit

In order to submit a new contribution, you must first create an MCP server for the functionality you want to add.
If you have already done so, please ensure it matches the example structure, and submit a PR.

If you have not, read on.


## Creating an MCP server for your functionality

You may want to leverage tools that automatically do this, such as [FastMCP](https://github.com/punkpeye/fastmcp/).

Alternatively, you may want to follow along this process, adapted to your specific needs.

### Step 1: Set Up Your Project
```bash
npm init -y
npm install @modelcontextprotocol/sdk zod
# Install your specific SDK
```

### Step 2: Define Your Schemas
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

### Step 3: Initialize the MCP Server
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

### Step 4: Register Your Tools
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
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }]
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
```

### Step 5: Connect Transport and Start Server
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

### Step 6: Submit a PR
1. Fork the Agentkit repository
2. Add your MCP server implementation
3. Update necessary documentation
4. Submit a pull request describing your new tool's functionality

## Best Practices
- Use descriptive names for tools and parameters
- Provide thorough error handling
- Use console.error for logging
- Document required environment variables
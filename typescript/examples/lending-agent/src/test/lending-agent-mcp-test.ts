import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { z } from 'zod';

/**
 * Test to verify MCP client works with the lending agent MCP server (index.ts) via SSE.
 * 
 * This test uses the official MCP SDK to connect to our lending agent's MCP server over SSE,
 * discover the available tools, and invoke the 'chat' tool with a sample query.
 * 
 * Prerequisites:
 * 1. The lending agent server (index.ts) must be running on http://localhost:3001
 * 2. MCP SDK must be installed as a dependency
 * 
 * To run:
 * ```
 * npm run test:mcp-lending-agent
 * ```
 */
async function testLendingAgentMcp() {
  console.log("Starting Lending Agent MCP client test...");

  const serverUrl = process.env.MCP_SERVER_URL || 'http://localhost:3010'; 
  let mcpClient = null;

  try {
    console.log(`Initializing MCP client via SSE to ${serverUrl}...`);
    
    // Create MCP Client
    mcpClient = new Client(
      { name: 'TestClient', version: '1.0.0' },
      { capabilities: { tools: {}, resources: {}, prompts: {} } }
    );
    
    // Create SSE transport
    const transport = new SSEClientTransport(new URL(serverUrl));
    
    // Connect to the server
    await mcpClient.connect(transport);
    console.log("MCP client initialized successfully!");

    // Try to discover tools
    console.log("Attempting to discover tools via MCP client...");
    const toolsResponse = await mcpClient.listTools();
    const toolNames = toolsResponse.tools.map(tool => tool.name);

    if (toolNames.length > 0) {
      console.log(`Success! Discovered ${toolNames.length} tool(s) via MCP:`);
      console.log(toolNames);

      // Check if 'chat' tool exists
      if (toolNames.includes('chat')) {
        console.log("\nFound 'chat' tool. Attempting to call it...");

        // Define the input schema based on the server's definition in index.ts
        const ChatInputSchema = z.object({ userInput: z.string() });
        const testInput = { userInput: "What is my current lending balance?" }; // Example query

        // Validate input (optional but good practice)
        ChatInputSchema.parse(testInput);

        console.log(`Calling 'chat' with input: ${JSON.stringify(testInput)}`);
        
        // Call the tool
        try {
          const result = await mcpClient.callTool({
            name: 'chat',
            arguments: testInput
          });
          console.log("\nResponse from 'chat' tool:");
          console.log(JSON.stringify(result, null, 2));
        } catch (error) {
          console.error("Error calling chat tool:", error);
        }
      } else {
         console.error("Error: 'chat' tool not found among discovered tools.");
      }
    } else {
      console.log("MCP connection successful, but no tools were discovered.");
    }
  } catch (error) {
     // Provide helpful error messages for common failure scenarios
     if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
        console.error(`Error: Connection refused. Is the lending agent server running at ${serverUrl}?`);
        console.error("Please start the server using 'npm run start' or 'node typescript/examples/lending-agent/dist/index.js' before running this test.");
     } else if (error instanceof Error && error.message.includes('fetch failed')) {
        console.error(`Error: Fetch failed. Could not connect to the server at ${serverUrl}. Please ensure it's running and accessible.`);
     } else {
        console.error("Error during MCP test:", error);
     }
  } finally {
    // Clean up resources
    if (mcpClient) {
      console.log("\nClosing MCP client...");
      try {
        await mcpClient.close();
        console.log("MCP client closed successfully.");
      } catch (closeError) {
        console.error("Error closing MCP client:", closeError);
      }
    }
  }
}

// Run the test
testLendingAgentMcp().then(() => {
  console.log("\nLending Agent MCP test complete.");
  process.exit(0);
}).catch(err => {
  console.error("\nUnhandled error in test script:", err);
  process.exit(1);
}); 
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * Simple test to verify MCP client works with the emberai-mcp server
 */
async function testMcpClient() {
  console.log("Starting MCP client test...");
  
  let mcpClient = null;
  
  try {
    console.log("Initializing MCP client via stdio...");
    // Create MCP Client
    mcpClient = new Client(
      { name: 'TestClient', version: '1.0.0' },
      { capabilities: { tools: {}, resources: {}, prompts: {} } }
    );
    
    // Create StdioClientTransport
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['/Users/tomdaniel/Documents/Ember_Cognition_Inc/Software/arbitrum-agentkit/typescript/mcp-tools/emberai-mcp/dist/index.js'],
    });
    
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
      
      // Print details of first tool
      if (toolNames.length > 0) {
        const firstToolName = toolNames[0];
        console.log(`\nDetails of first tool (${firstToolName}):`);
        const firstTool = toolsResponse.tools.find(tool => tool.name === firstToolName);
        console.log(JSON.stringify(firstTool, null, 2));
      }
      
      // Test calling getCapabilities with only type parameter
      if (toolNames.includes('getCapabilities')) {
        console.log("\nTesting getCapabilities with only 'type' parameter...");
        try {
          const result = await mcpClient.callTool({
            name: 'getCapabilities',
            arguments: { type: "LENDING" }
          });
          console.log("getCapabilities result:", JSON.stringify(result, null, 2));
        } catch (error) {
          console.error("Error calling getCapabilities:", error);
          console.error("Error details:", JSON.stringify(error, null, 2));
        }
        
        // Now try with the name parameter added
        console.log("\nTesting getCapabilities with both 'type' and 'name' parameters...");
        try {
          const result = await mcpClient.callTool({
            name: 'getCapabilities',
            arguments: { 
              type: "LENDING",
              name: "getCapabilities"
            }
          });
          console.log("getCapabilities result with name parameter:", JSON.stringify(result, null, 2));
        } catch (error) {
          console.error("Error calling getCapabilities with name parameter:", error);
          console.error("Error details:", JSON.stringify(error, null, 2));
        }
      } else {
        console.log("\ngetCapabilities tool not found. Available tools:", toolNames);
      }
    } else {
      console.log("MCP connection successful, but no tools were discovered.");
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    // Clean up
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
testMcpClient().then(() => {
  console.log("Test complete.");
  process.exit(0);
}).catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
}); 
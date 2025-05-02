/**
 * Simple MCP Client to interact with the Pendle Agent
 * 
 * Run with: pnpm run client [server-url]
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import * as readline from 'readline';

// Create a readline interface for interactive input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function runClient() {
  console.log('\n===== Pendle MCP Client =====');
  console.log('Starting MCP client...');
  
  try {
    const client = new Client(
      { name: 'MCP-CLI-Client', version: '1.0.0' },
      { capabilities: { tools: {}, resources: {}, prompts: {} } }
    );
    
    const serverBaseUrl = process.argv[2] || 'http://localhost:3001';
    console.log(`Connecting to MCP server at ${serverBaseUrl}...`);
    
    try {
      // Create a URL object from the base URL
      const baseUrl = new URL(serverBaseUrl);
      
      // The server expects SSE connections at /sse endpoint and
      // handles POST requests at /messages endpoint
      const transport = new StreamableHTTPClientTransport(baseUrl);
      
      await client.connect(transport);
      console.log('Connected to MCP server successfully');
      
      console.log('\n=== Available Commands ===');
      console.log('1. get-markets - Get list of Pendle markets');
      console.log('2. chat       - Send a chat message to the agent');
      console.log('3. exit       - Exit the client\n');
      
      let running = true;
      while (running) {
        const command = await prompt('Enter command: ');
        
        switch (command.toLowerCase()) {
          case 'get-markets':
          case '1':
            await getMarkets(client);
            break;
          
          case 'chat':
          case '2':
            const message = await prompt('Enter message: ');
            await chatWithAgent(client, message);
            break;
          
          case 'exit':
          case '3':
            running = false;
            break;
            
          case 'help':
            console.log('\n=== Available Commands ===');
            console.log('1. get-markets - Get list of Pendle markets');
            console.log('2. chat       - Send a chat message to the agent');
            console.log('3. exit       - Exit the client');
            console.log('   help       - Show this help menu\n');
            break;
            
          default:
            console.log('Unknown command. Type "help" for available commands.');
        }
      }
      
    } catch (error) {
      console.error('MCP connection error:', error);
    } finally {
      console.log('Closing MCP client connection...');
      await client.close();
      rl.close();
      console.log('Disconnected from MCP server');
    }
  } catch (error) {
    console.error('Failed to initialize MCP client:', error);
    rl.close();
  }
}

async function getMarkets(client: Client) {
  console.log('Calling getPendleMarkets...');
  try {
    console.log('Sending MCP request for getPendleMarkets');
    const result = await client.callTool({
      name: 'getPendleMarkets',
      arguments: {
        chainIds: [] // Empty array to get all chains
      }
    });
    
    console.log('Received raw response from MCP server');
    // Log brief summary of raw result
    const contentSummary = result.content && Array.isArray(result.content) ? 
      `content array with ${result.content.length} items` : 
      'no content array or not an array';
    console.log(`Response structure: ${contentSummary}`);
    
    // Parse the result
    if (!result.content || !Array.isArray(result.content) || result.content.length === 0) {
      console.log('Error: Response missing content array or array is empty');
      console.log('Full raw response:', JSON.stringify(result, null, 2));
      return;
    }
    
    const contentItem = result.content[0];
    console.log(`First content item type: ${contentItem.type}`);
    
    if (contentItem.type !== 'text' || typeof contentItem.text !== 'string') {
      console.log('Error: First content item is not of type text or missing text field');
      console.log('Content item:', contentItem);
      return;
    }
    
    console.log('Parsing JSON from text field...');
    try {
      const marketsData = JSON.parse(contentItem.text);
      console.log('\n=== Pendle Markets ===');
      if (marketsData.markets && Array.isArray(marketsData.markets)) {
        // Group markets by chain for better readability
        const marketsByChain: Record<string, any[]> = {};
        
        marketsData.markets.forEach((market: any) => {
          if (!marketsByChain[market.chainId]) {
            marketsByChain[market.chainId] = [];
          }
          marketsByChain[market.chainId].push(market);
        });
        
        // Display markets organized by chain
        for (const [chainId, markets] of Object.entries(marketsByChain)) {
          console.log(`\n== Chain ${chainId} (${markets.length} markets) ==`);
          
          markets.forEach((market: any, i: number) => {
            console.log(`\n${i+1}. ${market.name}`);
            console.log(`   Expiry: ${market.expiry}`);
            console.log(`   Underlying Asset: ${market.underlyingAsset?.symbol || 'Unknown'}`);
            console.log(`   PT Address: ${market.pt}`);
            console.log(`   YT Address: ${market.yt}`);
          });
        }
        
        console.log(`\nTotal markets found: ${marketsData.markets.length}`);
      } else {
        console.log('No markets found or invalid format');
        console.log('Raw response structure:', JSON.stringify(Object.keys(marketsData), null, 2));
      }
    } catch (e) {
      console.error('Error parsing markets data:', e);
      console.log('Raw response text:', contentItem.text.substring(0, 500) + '...');
    }
  } catch (error) {
    console.error('Error calling getPendleMarkets:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
  }
}

async function chatWithAgent(client: Client, message: string) {
  if (!message.trim()) {
    console.log('Message cannot be empty.');
    return;
  }
  
  console.log(`Sending message to agent: "${message}"`);
  console.log('Waiting for response...');
  
  try {
    const result = await client.callTool({
      name: 'chat',
      arguments: {
        userInput: message
      }
    });
    
    // Parse the result
    const content = result.content;
    if (Array.isArray(content) && content.length > 0 && content[0].type === 'text') {
      console.log('\n=== Agent Response ===');
      console.log(content[0].text);
      console.log(); // Add a newline for better readability
    } else {
      console.log('Unexpected response format from agent.');
      console.log('Raw response:', JSON.stringify(content, null, 2));
    }
  } catch (error) {
    console.error('Error communicating with agent:', error);
  }
}

// Run the client
runClient().catch(console.error); 
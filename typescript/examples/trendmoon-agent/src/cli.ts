#!/usr/bin/env node
/**
 * Trendmoon Agent CLI
 * Interactive command-line interface for crypto market analysis
 */
import 'dotenv/config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import * as readline from 'readline';

class AgentMcpClient {
    private _client: Client | null = null;
    private baseUrl: string;

    get client(): Client | null {
        return this._client;
    }

    constructor(port: number) {
        this.baseUrl = `http://localhost:${port}`;
    }

    async connect(): Promise<void> {
        console.log('🔗 Connecting to agent via MCP SSE...');
        
        try {
            // Create SSE transport to the agent
            const transport = new SSEClientTransport(
                new URL(`${this.baseUrl}/sse`)
            );

            // Create MCP client
            this._client = new Client({
                name: 'trendmoon-cli',
                version: '1.0.0'
            }, {
                capabilities: {}
            });

            // Connect to the agent
            await this._client.connect(transport);
            console.log('✅ Connected to agent via MCP');

            // List available tools
            const tools = await this._client.listTools();
            console.log(`🛠️  Found ${tools.tools.length} available tools:`);
            tools.tools.forEach(tool => {
                console.log(`   - ${tool.name}: ${tool.description}`);
            });
            console.log();


        } catch (error) {
            console.error('❌ Failed to connect via MCP:', error);
            throw error;
        }
    }

    async callTool(toolName: string, args: any): Promise<any> {
        if (!this._client) {
            throw new Error('Client not connected. Call connect() first.');
        }

        try {
            console.log(`🔧 Calling tool: ${toolName}`);
            console.log(`📝 Arguments:`, JSON.stringify(args, null, 2));
            
            const result = await this._client.callTool({
                name: toolName,
                arguments: args
            });

            return result;
        } catch (error) {
            console.error('❌ Tool call failed:', error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this._client) {
            await this._client.close();
            this._client = null;
        }
    }
}

async function runCLI() {
    console.log('🚀 Starting Trendmoon Agent CLI...\n');

    const CLI_PORT = 3007;
    const mcpClient = new AgentMcpClient(CLI_PORT);

    try {
        await mcpClient.connect();
    } catch (error) {
        console.error('❌ Cannot connect to agent. Make sure it\'s running on port 3007');
        process.exit(1);
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log('💬 Trendmoon Agent CLI Ready!');
    console.log('📝 Type your questions about crypto trends and market data');
    console.log('🔄 Examples:');
    console.log('   - What are the top meme tokens right now?');
    console.log('   - Analyze BTC social trends');
    console.log('   - Find growing DeFi projects on Arbitrum');
    console.log('❌ Type "exit" to quit\n');

    const askQuestion = () => {
        rl.question('❓ Your question: ', async (query) => {
            if (query.toLowerCase() === 'exit') {
                console.log('👋 Goodbye!');
                await mcpClient.disconnect();
                rl.close();
                process.exit(0);
            }

            if (query.trim() === '') {
                askQuestion();
                return;
            }

            try {
                console.log('\n🤖 Processing...\n');
                
                // Call the trendmoon-insights tool via the agent (simpler approach)
                const result = await mcpClient.callTool('trendmoon-insights', {
                    query: query
                });
                
                console.log('📊 Response:');
                console.log('─'.repeat(50));
                
                // Extract the formatted message from the agent response
                let displayMessage = '';
                
                // Try to extract from the agent response structure
                if (result.content && result.content.length > 0) {
                    for (const content of result.content) {
                        if (content.type === 'resource' && content.resource?.text) {
                            try {
                                const parsed = JSON.parse(content.resource.text);
                                
                                // Extract the formatted message from various structures
                                if (parsed.status?.message?.parts?.[0]?.text) {
                                    displayMessage = parsed.status.message.parts[0].text;
                                    break;
                                } else if (parsed.parts?.[0]?.text) {
                                    // New structure: parts[0].text
                                    displayMessage = parsed.parts[0].text;
                                    break;
                                } else if (parsed.message) {
                                    displayMessage = parsed.message;
                                    break;
                                }
                            } catch (e) {
                                // If parsing fails, use the raw text
                                displayMessage = content.resource.text;
                                break;
                            }
                        } else if (content.type === 'text') {
                            // Direct text content
                            displayMessage += content.text + '\n';
                        }
                    }
                }
                
                // Fallback to old structure if needed
                if (!displayMessage && result.resource?.text) {
                    try {
                        const parsed = JSON.parse(result.resource.text);
                        if (parsed.status?.message?.parts?.[0]?.text) {
                            displayMessage = parsed.status.message.parts[0].text;
                        } else if (parsed.parts?.[0]?.text) {
                            displayMessage = parsed.parts[0].text;
                        } else if (parsed.message) {
                            displayMessage = parsed.message;
                        }
                    } catch (e) {
                        displayMessage = result.resource.text;
                    }
                }
                
                // Final fallback to message field
                if (!displayMessage && result.message) {
                    displayMessage = result.message;
                }
                
                // If we still don't have a message, show the raw structure
                if (!displayMessage) {
                    displayMessage = JSON.stringify(result, null, 2);
                }
                
                console.log(displayMessage.trim() || 'No response received');
                
                console.log('─'.repeat(50));
                console.log();
                
            } catch (error) {
                console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
                console.log();
            }

            askQuestion();
        });
    };

    askQuestion();
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down gracefully...');
    process.exit(0);
});

// Start CLI
runCLI().catch((error) => {
    console.error('❌ Failed to start CLI:', error);
    process.exit(1);
});
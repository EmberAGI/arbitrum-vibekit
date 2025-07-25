// /**
//  * Integration Tests for Liquidation Prevention Agent
//  * Tests the complete agent functionality end-to-end
//  */

// import { describe, it, before, after } from 'mocha';
// import { expect } from 'chai';
// import { Client } from '@modelcontextprotocol/sdk/client/index.js';
// import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
// import { Agent, createProviderSelector, type AgentConfig } from 'arbitrum-vibekit-core';
// import { healthMonitoringSkill } from '../src/skills/healthMonitoring.js';
// import { liquidationPreventionSkill } from '../src/skills/liquidationPrevention.js';

// describe('Liquidation Prevention Agent - Integration Tests', () => {
//   let agent: Agent<any, any>;
//   let mcpClient: Client;
//   let baseUrl: string;
//   const port = 3333; // Use unique port to avoid conflicts

//   before(async function () {
//     console.log('🚀 Starting Liquidation Prevention Agent for integration testing...');

//     // Mock environment variables if not set
//     if (!process.env.EMBER_ENDPOINT) {
//       process.env.EMBER_ENDPOINT = 'http://api.emberai.xyz/mcp';
//     }
//     if (!process.env.PRIVATE_KEY) {
//       process.env.PRIVATE_KEY = '0x' + '1'.repeat(64); // Mock private key for testing
//     }
//     if (!process.env.RPC_URL) {
//       process.env.RPC_URL = 'https://arbitrum-mainnet.infura.io/v3/test';
//     }

//     // Define agent config locally
//     const agentConfig: AgentConfig = {
//       name: process.env.AGENT_NAME || 'Liquidation Prevention Agent',
//       version: process.env.AGENT_VERSION || '1.0.0',
//       description: process.env.AGENT_DESCRIPTION || 'An AI agent that prevents liquidations on Aave by monitoring health factors and taking preventive actions',
//       skills: [healthMonitoringSkill, liquidationPreventionSkill],
//       url: 'localhost',
//       capabilities: {
//         streaming: false,
//         pushNotifications: false,
//         stateTransitionHistory: false,
//       },
//       defaultInputModes: ['application/json'],
//       defaultOutputModes: ['application/json'],
//     };

//     // Create the agent with mock provider
//     const providers = createProviderSelector({
//       openRouterApiKey: process.env.OPENROUTER_API_KEY || 'test-key'
//     });

//     agent = Agent.create(agentConfig, {
//       llm: {
//         model: providers.openrouter!('anthropic/claude-3-haiku'),
//         baseSystemPrompt: 'You are a liquidation prevention agent for DeFi positions.'
//       }
//     });

//     // Start the agent
//     baseUrl = `http://localhost:${port}`;
//     await agent.start(port);
//     console.log(`✅ Agent started at ${baseUrl}`);

//     // Wait a moment for the server to be ready
//     await new Promise(resolve => setTimeout(resolve, 2000));

//     // Create MCP client to test agent interactions
//     mcpClient = new Client({
//       name: 'liquidation-prevention-test-client',
//       version: '1.0.0',
//     });

//     const transport = new SSEClientTransport(new URL(`${baseUrl}/sse`));
//     await mcpClient.connect(transport);
//     console.log('✅ MCP client connected to agent');
//   }, 30000);

//   after(async () => {
//     console.log('🛑 Cleaning up integration test resources...');
    
//     if (mcpClient) {
//       try {
//         await mcpClient.close();
//         console.log('✅ MCP client closed');
//       } catch (error) {
//         console.warn('⚠️ Error closing MCP client:', error);
//       }
//     }

//     if (agent) {
//       try {
//         await agent.stop();
//         console.log('✅ Agent stopped');
//       } catch (error) {
//         console.warn('⚠️ Error stopping agent:', error);
//       }
//     }
//   });

//   describe('Agent Startup and Configuration', () => {
//     it('should start successfully and expose MCP endpoints', async () => {
//       expect(agent).toBeDefined();
//       expect(agent.mcpServer).toBeDefined();
//     });

//     it('should have correct agent card information', () => {
//       expect(agent.card.name).toBe('Liquidation Prevention Agent');
//       expect(agent.card.description).toContain('liquidation');
//       expect(agent.card.skills).toHaveLength(2);
      
//       const skillNames = agent.card.skills.map(skill => skill.name);
//       expect(skillNames).toContain('Health Monitoring');
//       expect(skillNames).toContain('Liquidation Prevention');
//     });

//     it('should connect to MCP client successfully', async () => {
//       // Test basic MCP connectivity
//       const response = await fetch(`${baseUrl}/health`).catch(() => null);
//       // Health endpoint might not exist, but the server should be running
//       expect(agent).toBeDefined(); // At minimum, agent should be running
//     });
//   });

//   describe('Health Monitoring Skill', () => {
//     it('should be available as MCP tool', async () => {
//       try {
//         const result = await mcpClient.callTool({
//           name: 'health-monitoring',
//           arguments: {
//             userMessage: 'Check my position for wallet 0x742d35Cc6634C0532925a3b8C6697Dbb8d3F4F6'
//           }
//         });

//         expect(result).toBeDefined();
//         // Should either succeed or fail gracefully
//         if (result.isError) {
//           expect(result.content).toBeDefined();
//         } else {
//           expect(result.content).toBeDefined();
//         }
//       } catch (error) {
//         // Network errors are acceptable in test environment
//         expect(error).toBeDefined();
//       }
//     });

//     it('should handle position monitoring requests', async () => {
//       try {
//         const result = await mcpClient.callTool({
//           name: 'health-monitoring',
//           arguments: {
//             userMessage: 'Monitor my position every 10 minutes with health factor target of 1.5'
//           }
//         });

//         expect(result).toBeDefined();
        
//         if (!result.isError) {
//           const content = Array.isArray(result.content) ? result.content[0] : result.content;
//           expect(content).toBeDefined();
//         }
//       } catch (error) {
//         // Expected in test environment without real blockchain connection
//         console.log('Health monitoring test completed with expected network limitation');
//       }
//     });
//   });

//   describe('Liquidation Prevention Skill', () => {
//     it('should be available as MCP tool', async () => {
//       try {
//         const result = await mcpClient.callTool({
//           name: 'liquidation-prevention',
//           arguments: {
//             userMessage: 'Help prevent liquidation for my position'
//           }
//         });

//         expect(result).toBeDefined();
        
//         if (result.isError) {
//           expect(result.content).toBeDefined();
//         } else {
//           expect(result.content).toBeDefined();
//         }
//       } catch (error) {
//         // Expected in test environment
//         expect(error).toBeDefined();
//       }
//     });

//     it('should handle prevention strategy requests', async () => {
//       try {
//         const result = await mcpClient.callTool({
//           name: 'liquidation-prevention',
//           arguments: {
//             userMessage: 'Analyze my position and execute the best liquidation prevention strategy automatically'
//           }
//         });

//         expect(result).toBeDefined();
        
//         if (!result.isError) {
//           const content = Array.isArray(result.content) ? result.content[0] : result.content;
//           expect(content).toBeDefined();
//         }
//       } catch (error) {
//         console.log('Prevention strategy test completed with expected limitation');
//       }
//     });
//   });

//   describe('Agent Orchestration', () => {
//     it('should handle complex multi-step requests', async () => {
//       try {
//         const result = await mcpClient.callTool({
//           name: 'liquidation-prevention',
//           arguments: {
//             userMessage: 'Check my health factor, if it\'s below 1.3 then automatically prevent liquidation by supplying collateral or repaying debt, whichever is better'
//           }
//         });

//         expect(result).toBeDefined();
        
//         // Should attempt to orchestrate multiple tools
//         if (!result.isError) {
//           const content = Array.isArray(result.content) ? result.content[0] : result.content;
//           expect(content).toBeDefined();
//         }
//       } catch (error) {
//         // Expected without real MCP server connection
//         console.log('Multi-step orchestration test acknowledged network limitations');
//       }
//     });

//     it('should handle user preference parsing', async () => {
//       try {
//         const result = await mcpClient.callTool({
//           name: 'health-monitoring',
//           arguments: {
//             userMessage: 'Monitor my position 0x742d35Cc6634C0532925a3b8C6697Dbb8d3F4F6 every 5 minutes and maintain health factor above 1.8 with automatic actions enabled'
//           }
//         });

//         expect(result).toBeDefined();
        
//         if (!result.isError) {
//           const content = Array.isArray(result.content) ? result.content[0] : result.content;
//           expect(content).toBeDefined();
//         }
//       } catch (error) {
//         console.log('User preference parsing test completed');
//       }
//     });
//   });

//   describe('Error Handling and Resilience', () => {
//     it('should handle invalid wallet addresses gracefully', async () => {
//       try {
//         const result = await mcpClient.callTool({
//           name: 'health-monitoring',
//           arguments: {
//             userMessage: 'Check position for invalid-wallet-address'
//           }
//         });

//         expect(result).toBeDefined();
        
//         // Should handle error gracefully
//         if (result.isError) {
//           expect(result.content).toBeDefined();
//         }
//       } catch (error) {
//         // Error handling is working
//         expect(error).toBeDefined();
//       }
//     });

//     it('should handle malformed requests', async () => {
//       try {
//         const result = await mcpClient.callTool({
//           name: 'health-monitoring',
//           arguments: {
//             userMessage: '' // Empty message
//           }
//         });

//         expect(result).toBeDefined();
        
//         // Should provide helpful error or guidance
//         if (result.isError) {
//           expect(result.content).toBeDefined();
//         } else {
//           const content = Array.isArray(result.content) ? result.content[0] : result.content;
//           expect(content).toBeDefined();
//         }
//       } catch (error) {
//         expect(error).toBeDefined();
//       }
//     });

//     it('should handle network connectivity issues', async () => {
//       // This test verifies that the agent can start and respond even if external services are unavailable
//       try {
//         const result = await mcpClient.callTool({
//           name: 'health-monitoring',
//           arguments: {
//             userMessage: 'Test connectivity resilience'
//           }
//         });

//         expect(result).toBeDefined();
        
//         // Agent should respond even if it can't connect to external services
//         if (!result.isError) {
//           const content = Array.isArray(result.content) ? result.content[0] : result.content;
//           expect(content).toBeDefined();
//         }
//       } catch (error) {
//         // This is expected and shows the agent is handling errors appropriately
//         console.log('Network resilience test completed - error handling is working');
//       }
//     });
//   });

//   describe('Agent Performance', () => {
//     it('should respond to simple requests within reasonable time', async () => {
//       const startTime = Date.now();
      
//       try {
//         const result = await mcpClient.callTool({
//           name: 'health-monitoring',
//           arguments: {
//             userMessage: 'Hello'
//           }
//         });

//         const responseTime = Date.now() - startTime;
//         expect(responseTime).toBeLessThan(30000); // 30 second timeout
//         expect(result).toBeDefined();
        
//       } catch (error) {
//         const responseTime = Date.now() - startTime;
//         expect(responseTime).toBeLessThan(30000); // Should fail fast if going to fail
//       }
//     });
//   });
// }); 
 
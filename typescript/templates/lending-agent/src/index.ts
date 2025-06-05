import { Agent } from 'arbitrum-vibekit-core';
import type { AgentRuntimeOptions } from 'arbitrum-vibekit-core';
import { agentConfig } from './agent.js';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { loadTokenMapFromMcp } from './tokenMap.js';

const openRouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const runtimeOptions: AgentRuntimeOptions = {
  cors: true,
  basePath: '/',
  llm: {
    model: openRouter('google/gemini-2.0-flash-001'),
  },
};

async function main() {
  const agent = Agent.create(agentConfig, runtimeOptions);

  // Start the agent with custom context
  await agent.start(3006, async deps => {
    // Check if ember-mcp-tool-server is available
    const emberMcpClient = deps.mcpClients['ember-mcp-tool-server'];
    if (!emberMcpClient) {
      console.warn('ember-mcp-tool-server MCP client not available, token map will be empty');
      return {
        tokenMap: {},
        quicknodeSubdomain: process.env.QUICKNODE_SUBDOMAIN || '',
        quicknodeApiKey: process.env.QUICKNODE_API_KEY || '',
      };
    }

    console.log('Loading token map from MCP capabilities...');
    const tokenMap = await loadTokenMapFromMcp(emberMcpClient);

    return {
      tokenMap,
      quicknodeSubdomain: process.env.QUICKNODE_SUBDOMAIN || '',
      quicknodeApiKey: process.env.QUICKNODE_API_KEY || '',
    };
  });

  console.log('Lending agent framework started on port 3006');
}

main().catch(console.error);

import { Agent } from 'arbitrum-vibekit-core';
import type { AgentRuntimeOptions } from 'arbitrum-vibekit-core';
import { agentConfig } from './agent.js';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

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

async function loadTokenMap() {
  // TODO: Implement token map loading from MCP capabilities
  // For now, return empty map - will be populated from MCP server
  return {};
}

async function main() {
  const agent = Agent.create(agentConfig, runtimeOptions);

  // Start the agent with custom context
  const tokenMap = await loadTokenMap();
  await agent.start(3006, async () => ({
    tokenMap,
    quicknodeSubdomain: process.env.QUICKNODE_SUBDOMAIN || '',
    quicknodeApiKey: process.env.QUICKNODE_API_KEY || '',
  }));

  console.log('Lending agent framework started on port 3006');
}

main().catch(console.error);

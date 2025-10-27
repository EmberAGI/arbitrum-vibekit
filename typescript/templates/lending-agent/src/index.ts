import { Agent, getAvailableProviders, createProviderSelector } from '@emberai/arbitrum-vibekit-core';
import type { AgentRuntimeOptions } from '@emberai/arbitrum-vibekit-core';
import { agentConfig } from './agent.js';
import { loadTokenMapFromMcp } from './tokenMap.js';

// Provider selector setup
const providers = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  xaiApiKey: process.env.XAI_API_KEY,
  hyperbolicApiKey: process.env.HYPERBOLIC_API_KEY,
});

const available = getAvailableProviders(providers);
if (available.length === 0) {
  throw new Error('No AI providers configured. Please set a provider API key.');
}

const preferred = process.env.AI_PROVIDER || available[0]!;
const selectedProvider = providers[preferred as keyof typeof providers];
if (!selectedProvider) {
  throw new Error(`Preferred provider '${preferred}' not available.`);
}

const modelOverride = process.env.AI_MODEL;

const runtimeOptions: AgentRuntimeOptions = {
  cors: true,
  basePath: '/',
  llm: {
    model: modelOverride ? selectedProvider!(modelOverride) : selectedProvider!(),
  },
};

// Create agent instance at module level for shutdown access
const agent = Agent.create(agentConfig, runtimeOptions);

async function main() {
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

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  await agent.stop();
  process.exit(0);
};

['SIGINT', 'SIGTERM'].forEach(sig => {
  process.on(sig, () => shutdown(sig));
});

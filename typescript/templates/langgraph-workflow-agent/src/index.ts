import { Agent, createProviderSelector, getAvailableProviders } from '@emberai/arbitrum-vibekit-core';
import { greetingOptimizerSkill } from './skills/greeting-optimizer.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize provider selector with all supported API keys
const providers = createProviderSelector({
  openRouterApiKey: process.env['OPENROUTER_API_KEY'],
  openaiApiKey: process.env['OPENAI_API_KEY'],
  xaiApiKey: process.env['XAI_API_KEY'],
  hyperbolicApiKey: process.env['HYPERBOLIC_API_KEY'],
});

// Determine available providers
const availableProviders = getAvailableProviders(providers);

if (availableProviders.length === 0) {
  console.error('No AI providers configured. Set at least one provider API key.');
  process.exit(1);
}

// Choose provider based on env or fallback
const preferredProvider = process.env['AI_PROVIDER'] || availableProviders[0]!;
const selectedProvider = providers[preferredProvider as keyof typeof providers];

if (!selectedProvider) {
  console.error(
    `Preferred provider '${preferredProvider}' not available. Available providers: ${availableProviders.join(', ')}`
  );
  process.exit(1);
}

const modelOverride = process.env['AI_MODEL'];

// Agent configuration
const agentConfig = {
  name: 'LangGraph Workflow Agent',
  version: '1.0.0',
  description:
    'A hello-world agent demonstrating the evaluator-optimizer workflow pattern using LangGraph',
  url: 'https://github.com/arbitrum-vibekit/langgraph-workflow-agent',
  skills: [greetingOptimizerSkill],
  capabilities: {
    streaming: false,
    pushNotifications: false,
    stateTransitionHistory: false,
  },
  defaultInputModes: ['application/json' as const],
  defaultOutputModes: ['application/json' as const],
};

// Create the agent with LLM configuration
const agent = Agent.create(agentConfig, {
  llm: {
    model: modelOverride ? selectedProvider!(modelOverride) : selectedProvider!(),
  },
});

// Start the agent with context provider for the model
async function main() {
  const portStr = process.env['PORT'] || '41241';
  const port = parseInt(portStr, 10);

  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(
      `Invalid PORT value: "${process.env['PORT']}". Must be a number between 1 and 65535.`
    );
    process.exit(1);
  }

  console.log('Starting LangGraph Workflow Agent...');

  try {
    // Start agent with model in context
    await agent.start(port, async () => {
      // Return context with the model
      return {
        model: modelOverride ? selectedProvider!(modelOverride) : selectedProvider!(),
      };
    });

    console.log(`✅ LangGraph Workflow Agent is running on port ${port}`);
    console.log(`🔧 Agent capabilities:`);
    console.log(`   - Greeting optimization with evaluator-optimizer workflow`);
    console.log(`   - Maximum 3 iterations per optimization`);
    console.log(`   - Satisfaction-based termination criteria`);
    console.log(`\n📝 Example usage:`);
    console.log(`   Send: { "message": "hello" }`);
    console.log(`   To get an optimized, friendly greeting!`);
  } catch (error) {
    console.error('Failed to start agent:', error);
    process.exit(1);
  }
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Shutting down agent...`);
  await agent.stop();
  process.exit(0);
};

['SIGINT', 'SIGTERM'].forEach(sig => {
  process.on(sig, () => shutdown(sig));
});

// Run the main function
main();

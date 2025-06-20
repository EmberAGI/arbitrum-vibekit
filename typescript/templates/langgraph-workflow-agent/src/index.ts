import { Agent, createProviderSelector } from 'arbitrum-vibekit-core';
import { greetingOptimizerSkill } from './skills/greeting-optimizer.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create provider selector for model access
const providers = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
});

if (!providers.openrouter) {
  console.error('OpenRouter API key is required. Set OPENROUTER_API_KEY environment variable.');
  process.exit(1);
}

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
    model: providers.openrouter!('openai/gpt-4o'),
  },
});

// Start the agent with context provider for the model
async function main() {
  const port = process.env.PORT ? parseInt(process.env.PORT) : 41241;

  console.log('Starting LangGraph Workflow Agent...');

  try {
    // Start agent with model in context
    await agent.start(port, async () => {
      // Return context with the model
      return {
        model: providers.openrouter!('openai/gpt-4o'),
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

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down agent...');
  await agent.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down agent...');
  await agent.stop();
  process.exit(0);
});

// Run the main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

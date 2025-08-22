#!/usr/bin/env node
/**
 * RWA Investment Agent
 * First AI agent framework for Real World Asset tokenization and investment
 */

import 'dotenv/config';
import { Agent, type AgentConfig, createProviderSelector, getAvailableProviders } from 'arbitrum-vibekit-core';
import { assetDiscoverySkill } from './skills/assetDiscovery.js';
import { complianceCheckSkill } from './skills/complianceCheck.js';
import { testSkill } from './skills/testSkill.js';
import { contextProvider } from './context/provider.js';
import type { RWAContext } from './context/types.js';

// Provider selector initialization
const providers = createProviderSelector({
    openRouterApiKey: process.env.OPENROUTER_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    xaiApiKey: process.env.XAI_API_KEY,
    hyperbolicApiKey: process.env.HYPERBOLIC_API_KEY,
});

const available = getAvailableProviders(providers);
if (available.length === 0) {
    console.error('No AI providers configured. Please set at least one provider API key.');
    process.exit(1);
}

const preferred = process.env.AI_PROVIDER || available[0]!;
const selectedProvider = providers[preferred as keyof typeof providers];
if (!selectedProvider) {
    console.error(`Preferred provider '${preferred}' not available. Available: ${available.join(', ')}`);
    process.exit(1);
}

const modelOverride = process.env.AI_MODEL;

// Export agent configuration for testing
export const agentConfig: AgentConfig = {
    name: process.env.AGENT_NAME || 'RWA Investment Agent',
    version: process.env.AGENT_VERSION || '1.0.0',
    description: process.env.AGENT_DESCRIPTION || 'AI agent for Real World Asset investment and portfolio management',
    skills: [testSkill, assetDiscoverySkill, complianceCheckSkill],
    url: 'localhost',
    capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: false,
    },
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
};

// Configure the agent with LLM
const agent = Agent.create(agentConfig, {
    llm: {
        model: modelOverride
            ? selectedProvider(modelOverride)
            : selectedProvider('google/gemini-2.5-flash'),
    },
});

// Start the agent server
const PORT = parseInt(process.env.PORT || '3008', 10);

async function main() {
    try {
        console.log('🏛️ Starting RWA Investment Agent...');
        console.log(`📊 Using AI provider: ${preferred}`);
        console.log('🔧 Initializing agent...');

        // Test the context provider first
        console.log('🧪 Testing context provider...');
        try {
            const testContext = await contextProvider({ mcpClients: {} });
            console.log('✅ Context provider working, asset types:', testContext.assetTypes.length);
        } catch (contextError) {
            console.error('❌ Context provider failed:', contextError);
            throw contextError;
        }

        console.log('🚀 Starting agent WITH context provider...');
        await agent.start(PORT, contextProvider);

        console.log(`🚀 RWA Investment Agent running on port ${PORT}`);
        console.log(`🌐 Agent card available at: http://localhost:${PORT}/.well-known/agent.json`);
        console.log(`🔗 MCP endpoint: http://localhost:${PORT}/sse`);
        console.log('💼 Ready to discover and invest in Real World Assets!');
        console.log('📋 Available skills:');
        console.log('   - RWA Asset Discovery: Find real-world asset investment opportunities');
        console.log('   - RWA Compliance Verification: Check regulatory compliance');
    } catch (error) {
        console.error('❌ Failed to start RWA Investment Agent:', error);
        console.error('Error details:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down RWA Investment Agent...');
    try {
        await agent.stop();
        console.log('✅ Agent stopped gracefully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');
    try {
        await agent.stop();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
});

// Check if this is the main module being run directly
const isMainModule = process.argv[1] && process.argv[1].endsWith('index.js');
if (isMainModule) {
    main().catch(console.error);
}

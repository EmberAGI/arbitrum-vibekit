#!/usr/bin/env node
/**
 * RWA Investment Agent - Vibekit Framework Integration
 * AI-powered Real World Asset investment analysis with live blockchain data
 */

import 'dotenv/config';
import { Agent, type AgentConfig, createProviderSelector, getAvailableProviders } from 'arbitrum-vibekit-core';
import { rwaAnalysisSkill, contractVerificationSkill, portfolioManagementSkill } from './skills/index.js';
import { contextProvider } from './context/provider.js';
import type { RWAAgentContext } from './context/types.js';

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
    description: process.env.AGENT_DESCRIPTION || 'Comprehensive RWA investment platform with real-time blockchain data, contract verification, portfolio management, and risk analysis',
    skills: [rwaAnalysisSkill, contractVerificationSkill, portfolioManagementSkill],
    url: 'localhost',
    capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: false,
    },
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
};

// Create and start the agent
const agent = Agent.create(agentConfig, {
    llm: {
        model: modelOverride ? selectedProvider(modelOverride) : selectedProvider(),
        baseSystemPrompt: `You are an expert RWA (Real World Asset) investment advisor specializing in tokenized assets on Arbitrum. 
           
           You have access to comprehensive real-time blockchain data and advanced analysis tools.
           
           Key capabilities:
           - Analyze RWA investment opportunities with real-time blockchain data from Arbitrum protocols
           - Verify smart contracts and provide detailed security analysis
           - Track and manage investment portfolios with live performance metrics
           - Conduct comprehensive risk assessments across multiple risk categories
           - Provide detailed yield analysis with historical performance data
           - Monitor real-time market conditions and protocol health
           
           Available protocols and data sources:
           - Ondo Finance (Tokenized U.S. Treasuries)
           - Centrifuge (Real Estate, Trade Finance) - **REAL-TIME DATA VIA MCP SERVER**
           - Maple Finance (Institutional Lending)
           - TrueFi (Uncollateralized Lending)
           - Real-time Arbitrum blockchain data
           
           **IMPORTANT**: When users ask about Centrifuge specifically, use the centrifuge-real-data tool to get real-time data from the Centrifuge MCP server and SDK. This provides live blockchain data, not mock data.
           
           Always provide verifiable data with contract addresses, current block numbers, and real-time metrics.`,
    },
});

// Start the agent server
const PORT = parseInt(process.env.PORT || '3008', 10);

agent
    .start(PORT, contextProvider)
    .then(() => {
        console.log(`🚀 RWA Investment Agent started on port ${PORT}`);
        console.log(`📊 Agent Card: http://localhost:${PORT}/.well-known/agent.json`);
        console.log(`🔗 MCP Endpoint: http://localhost:${PORT}/mcp`);
    })
    .catch((error) => {
        console.error('Failed to start RWA Investment Agent:', error);
        process.exit(1);
    });

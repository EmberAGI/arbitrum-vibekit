import 'dotenv/config';
import { Agent, type AgentConfig, defineSkill } from 'arbitrum-vibekit-core';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';
import { contextProvider } from './context/provider.js';
import type { TrendmoonContext } from './context/types.js';
import { getSocialAndMarketInsightsTool } from './tools/socialAndMarketInsights.js';
import { getAvailableOptionsTool } from './tools/getAvailableOptions.js';
import { getTopCategoryCoins } from './tools/getTopCategoryCoins.js';
import { getTopNarrativesTool } from './tools/getTopNarratives.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

// --- MCP Server Path Resolution ---
// To ensure robust behavior in production, we manually construct the absolute
// path to the MCP server's entrypoint. This avoids Node's complex module
// resolution (`require.resolve`), which can be unreliable in a pnpm monorepo.
// This method relies on the monorepo's fixed directory structure, which is
// consistent across local and remote environments.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const trendmoonMcpPath = path.resolve(
  __dirname,
  '../../../lib/mcp-tools/trendmoon-mcp-server/dist/index.js'
);

// --- The System Prompt for the Trendmoon Agent ---
const TRENDMOON_SYSTEM_PROMPT = `You are a Trendmoon Agent that provides insights on social trends and market data for crypto tokens. 

CRITICAL LANGUAGE INSTRUCTION: 
- If the user asks their question in English, you MUST respond entirely in English
- If the user asks their question in French, you MUST respond entirely in French  
- If the user asks their question in Spanish, you MUST respond entirely in Spanish
- If the user asks their question in Portuguese, you MUST respond entirely in Portuguese
- Match the exact language of the user's question, regardless of your system locale
- Do NOT default to French - always match the user's language

You have access to comprehensive market data tools that can:
- Analyze token performance with social metrics and market data
- Find trending narratives and top performing categories
- Provide investment insights and catalyst analysis
- Search and discover tokens by various criteria
- Track social sentiment and trending keywords
- Get all available categories/narratives and blockchain platforms for filtering
- Get top coins from specific categories ranked by any metric (mindshare, sentiment, interactions, scores)

When users ask for "top [metric] [category] coins" or "highest [metric] tokens in [category]", use the get_top_category_coins tool which provides:
- Real-time social dominance metrics (lc_social_dominance) for mindshare
- Comprehensive scoring from technical and social analysis
- Social metrics: mentions, sentiment, interactions, volume
- Market data: market cap, price changes, volume ratios
- Optimized batch processing for up to 250 coins per category

Available sorting metrics:
- lc_social_dominance: Social dominance/mindshare percentage
- lc_sentiment: Sentiment score (0-1, higher is more positive)
- lc_interactions: Total social interactions
- score: Overall platform score
- social_mentions: Raw mention count
- market_cap: Market capitalization

When responding to queries:
1. Use the available MCP tools to gather relevant data
2. Provide clear, actionable insights in the user's language
3. Focus on social trends, market sentiment, and token performance
4. Format responses in a user-friendly way in the user's language
5. Always base your analysis on the actual data returned from the tools
6. When users ask about available categories or narratives, use the get_available_options tool to show them the complete list

Other analysis types:
- 'list' for general token filtering with getSocialAndMarketInsights
- 'detailed_summary' for deep dive analysis on one token  
- 'catalyst_check' for upcoming events and catalysts

IMPORTANT: The system has access to over 625 categories and 86 blockchain platforms. When users ask what narratives or categories are available, use the get_available_options tool.`;

// --- Simple input schema - just query ---
const inputSchema = z.object({
  query: z.string().describe("The user's natural language question about crypto trends and market data."),
});

// Create OpenRouter LLM provider instance
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Agent Configuration
export const agentConfig: AgentConfig = {
  name: process.env.AGENT_NAME || 'Trendmoon Agent',
  version: process.env.AGENT_VERSION || '1.0.0',
  description:
    process.env.AGENT_DESCRIPTION ||
    'Provides insights on social trends and market data for crypto tokens. Use this for questions about mindshare, sentiment, catalysts, and token performance.',

  // Single skill that handles all trendmoon queries
  skills: [
    defineSkill({
      id: 'trendmoon-insights',
      name: 'Trendmoon Insights',
      description:
        'Provides insights on social trends and market data for crypto tokens. Can return sorted lists or detailed analysis for one token, and suggests specialized prompts.',
      inputSchema,

      // Required properties
      tags: ['crypto', 'social-trends', 'market-data', 'sentiment-analysis'],
      examples: [
        'What are the top meme tokens right now?',
        'Analyze BTC social trends',
        'Find growing DeFi projects on Arbitrum',
        'What narrative is trending this week?',
      ],
      tools: [getSocialAndMarketInsightsTool, getAvailableOptionsTool, getTopCategoryCoins, getTopNarrativesTool], // Real tools for crypto insights

      // Connect to our MCP server to access all Trendmoon tools
      mcpServers: {
        'trendmoon-mcp-server': {
          // Use the actual trendmoon-mcp-server module
          command: 'node',
          args: [trendmoonMcpPath], // Use the manually constructed, absolute path
          env: {
            TRENDMOON_API_KEY: process.env.TRENDMOON_API_KEY || '',
            TRENDMOON_API_URL: process.env.TRENDMOON_API_URL || 'https://api.qa.trendmoon.ai',
            LLM_API_KEY: process.env.OPENROUTER_API_KEY || '',
            LLM_BASE_URL: process.env.LLM_BASE_URL || 'https://openrouter.ai/api/v1',
            LLM_MODEL_NAME: process.env.LLM_MODEL || 'google/gemini-2.5-flash-preview',
          },
        },
      },

      // NO HANDLER: Let the LLM orchestrate using the MCP tools directly
      // The LLM will automatically discover and use available tools from the MCP server
    }),
  ],
  url: 'localhost',
  capabilities: { streaming: false, pushNotifications: false },
  defaultInputModes: ['application/json'],
  defaultOutputModes: ['application/json'],
};

// Configure and start the agent
const agent = Agent.create(agentConfig, {
  cors: true,
  llm: {
    model: openrouter(process.env.LLM_MODEL || 'google/gemini-2.5-flash-preview'),
    baseSystemPrompt: TRENDMOON_SYSTEM_PROMPT,
  },
});

const PORT = parseInt(process.env.PORT || '3007', 10);
agent
  .start(PORT, contextProvider)
  .then(() => {
    console.log(`🚀 Trendmoon Agent running on port ${PORT}`);
    console.log(`📍 Base URL: http://localhost:${PORT}`);
    console.log(`🤖 Send a POST request to interact. Examples:`);
    console.log(
      `   curl -X POST -H "Content-Type: application/json" -d '{"query": "What are the top meme tokens right now?"}' http://localhost:${PORT}`,
    );
    console.log(
      `   curl -X POST -H "Content-Type: application/json" -d '{"query": "Analyze BTC social trends"}' http://localhost:${PORT}`,
    );
  })
  .catch((error) => console.error('Failed to start agent:', error));

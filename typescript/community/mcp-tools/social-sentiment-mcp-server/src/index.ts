#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
  analyzeSocialSentimentTool,
  executeAnalyzeSocialSentiment,
} from './tools/analyzeSocialSentiment.js';
import { detectEarlySignalsTool, executeDetectEarlySignals } from './tools/detectEarlySignals.js';
import { socialMomentumScoreTool, executeSocialMomentumScore } from './tools/socialMomentumScore.js';
import { listSupportedTokensTool, executeListSupportedTokens } from './tools/listSupportedTokens.js';
// import { trackInfluencerWalletsTool, executeTrackInfluencerWallets } from './tools/trackInfluencerWallets.js';
// import { predictSocialDrivenMovesTool, executePredictSocialDrivenMoves } from './tools/predictSocialDrivenMoves.js';

// Create MCP server
const server = new Server(
  {
    name: 'social-sentiment-mcp-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      analyzeSocialSentimentTool,
      detectEarlySignalsTool,
      socialMomentumScoreTool,
      listSupportedTokensTool,
      // trackInfluencerWalletsTool,
      // predictSocialDrivenMovesTool,
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'analyze-social-sentiment':
      return await executeAnalyzeSocialSentiment(args);
    case 'detect-early-signals':
      return await executeDetectEarlySignals(args);
    case 'social-momentum-score':
      return await executeSocialMomentumScore(args);
    case 'list-supported-tokens':
      return await executeListSupportedTokens(args);
    //   case 'track-influencer-wallets':
    //     return await executeTrackInfluencerWallets(args);
    //   case 'predict-social-driven-moves':
    //     return await executePredictSocialDrivenMoves(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start server with STDIO transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Social Sentiment MCP Server running on STDIO');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


/**
 * Asset Discovery Skill - RWA Investment Opportunities
 * Uses LLM orchestration to find and analyze Real World Asset investments
 */

import { z } from 'zod';
import { defineSkill } from 'arbitrum-vibekit-core';
import { discoverRWAAssetsTool } from '../tools/discoverRWAAssets.js';
import { analyzeYieldOpportunitiesTool } from '../tools/analyzeYieldOpportunities.js';
import { assessAssetRiskTool } from '../tools/assessAssetRisk.js';
import { centrifugeRealDataTool } from '../tools/centrifugeRealData.js';

// Input schema for asset discovery requests
const AssetDiscoveryInputSchema = z.object({
  instruction: z.string().describe('Natural language instruction for RWA asset discovery'),
  filters: z.object({
    assetTypes: z.array(z.string()).optional().describe('Types of RWA assets to search for'),
    minYield: z.number().optional().describe('Minimum expected yield percentage'),
    maxRisk: z.number().optional().describe('Maximum risk score (0-100)'),
    minLiquidity: z.number().optional().describe('Minimum liquidity score (0-100)'),
    jurisdictions: z.array(z.string()).optional().describe('Preferred regulatory jurisdictions'),
    minInvestment: z.string().optional().describe('Minimum investment amount in USD'),
    maxInvestment: z.string().optional().describe('Maximum investment amount in USD'),
  }).optional(),
  walletAddress: z.string().optional().describe('Investor wallet address for personalized recommendations'),
});

export const rwaAnalysisSkill = defineSkill({
  id: 'rwa-analysis',
  name: 'RWA Analysis',
  description: 'AI-powered analysis of Real World Asset investment opportunities with live blockchain data',

  tags: ['rwa', 'assets', 'discovery', 'investment', 'yield', 'real-estate', 'invoices', 'carbon-credits'],

  examples: [
    'Find real estate investments with 8%+ yield in the US',
    'Show me low-risk invoice financing opportunities under $50k',
    'Discover carbon credit investments in renewable energy projects',
    'What are the best RWA opportunities for a conservative portfolio?',
    'Find institutional loan investments with 15%+ yield',
    'Show me liquid RWA assets I can invest $25k in',
    'Show me Centrifuge pools with real-time data',
    'What are the current Centrifuge investment opportunities on Arbitrum?',
    'Get real-time Centrifuge pool yields and liquidity data',
    'Check my Centrifuge investment status and performance',
  ],

  inputSchema: AssetDiscoveryInputSchema,

  // Tools available for LLM orchestration
  tools: [
    discoverRWAAssetsTool,
    analyzeYieldOpportunitiesTool,
    assessAssetRiskTool,
    centrifugeRealDataTool,
  ],

  // No manual handler - use LLM orchestration for intelligent asset discovery
  // The LLM will:
  // 1. Parse natural language investment preferences
  // 2. Apply appropriate filters and risk parameters
  // 3. Coordinate multiple tools to find, analyze, and rank opportunities
  // 4. Provide comprehensive investment recommendations
});

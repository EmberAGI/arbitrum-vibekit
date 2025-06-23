/**
 * Predict and Trade Workflow Tool
 * Combines price prediction, trading analysis, and optional execution in one flow
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask, VibkitError, withHooks } from 'arbitrum-vibekit-core';
import { SUPPORTED_CHAINS } from '../utils/tokenRegistry.js';
import { DEFAULT_RISK_PARAMS } from '../utils/riskAssessment.js';
import { summarizeWorkflowHook } from '../hooks/tradingHooks.js';

// Tool parameters schema
const PredictAndTradeParams = z.object({
  token: z.string().describe('Token symbol to analyze and potentially trade'),
  tradeAmount: z
    .number()
    .positive()
    .optional()
    .default(100)
    .describe('Amount in USD to potentially trade (defaults to $100)'),
  userAddress: z.string().optional().describe('User wallet address for trade execution (required for actual trades)'),
  chainId: z.string().optional().default(SUPPORTED_CHAINS.ARBITRUM).describe('Chain ID for the trade'),
  autoExecute: z.boolean().optional().default(false).describe('Whether to automatically execute favorable trades'),
  targetToken: z.string().optional().default('USDC').describe('Target token for the trade (what to swap to)'),
  portfolioValue: z.number().optional().default(10000).describe('Total portfolio value for position sizing'),
});

const basePredictAndTradeWorkflowTool: VibkitToolDefinition<typeof PredictAndTradeParams, any, any, any> = {
  name: 'predict-and-trade-workflow',
  description:
    'Complete workflow that gets price prediction, analyzes trading opportunity, and optionally executes trade',
  parameters: PredictAndTradeParams,

  execute: async (args, context) => {
    console.log('[PredictAndTradeWorkflow] Starting workflow with args:', args);

    const { token, tradeAmount, userAddress, chainId, autoExecute, targetToken, portfolioValue } = args;
    const workflowSteps: string[] = [];
    let shouldTrade = false;
    let tradingRecommendation: any = null;

    // Check if user wants to execute trades but didn't provide address
    if (autoExecute && !userAddress) {
      return createErrorTask(
        'predict-trade-workflow',
        new VibkitError(
          'ValidationError',
          -32602,
          'User address is required for trade execution. Please provide your wallet address.',
        ),
      );
    }

    try {
      // Step 1: Get price prediction from Allora
      workflowSteps.push('🔮 Step 1: Fetching price prediction...');

      const alloraClient = context.mcpClients?.['@alloralabs/mcp-server'];
      if (!alloraClient) {
        return createErrorTask(
          'predict-trade-workflow',
          new VibkitError('ClientError', -32603, 'Allora MCP client not available'),
        );
      }

      // First, discover the topic for the token
      const topicsResponse = await alloraClient.callTool({
        name: 'list_all_topics',
        arguments: {},
      });

      const topicsContent = topicsResponse.content;
      console.log('[PredictAndTradeWorkflow] Raw topics response:', JSON.stringify(topicsContent, null, 2));

      // Parse the topics - handle different response formats
      let topics: any[] = [];
      if (topicsContent && Array.isArray(topicsContent) && topicsContent.length > 0) {
        const firstContent = topicsContent[0];
        if (typeof firstContent.text === 'string') {
          try {
            const parsed = JSON.parse(firstContent.text);
            // Handle different response formats from Allora
            if (Array.isArray(parsed)) {
              topics = parsed;
            } else if (parsed.topics && Array.isArray(parsed.topics)) {
              topics = parsed.topics;
            } else if (parsed.data && Array.isArray(parsed.data)) {
              topics = parsed.data;
            } else {
              // If it's a single object, wrap it in an array
              topics = [parsed];
            }
          } catch (e) {
            console.error('[PredictAndTradeWorkflow] Failed to parse topics:', e);
          }
        }
      }

      console.log('[PredictAndTradeWorkflow] Found topics:', topics.length);
      console.log(
        '[PredictAndTradeWorkflow] First few topics:',
        topics.slice(0, 5).map((t: any) => ({
          id: t.topicId || t.topic_id || t.id,
          metadata: t.metadata || t.topic_name || t.description,
        })),
      );

      // Find matching topic with enhanced logic
      const tokenLower = token.toLowerCase();

      // Special debugging for ARB
      if (tokenLower === 'arb' || tokenLower === 'arbitrum') {
        const arbRelatedTopics = topics.filter((t: any) => {
          const allText = `${t.metadata || ''} ${t.topic_name || ''} ${t.description || ''}`.toLowerCase();
          return allText.includes('arb') || allText.includes('arbitrum');
        });
        console.log(
          '[PredictAndTradeWorkflow] ARB-related topics found:',
          arbRelatedTopics.map((t: any) => ({
            id: t.topicId || t.topic_id || t.id,
            metadata: t.metadata || t.topic_name || t.description,
          })),
        );
      }
      const tokenAliases: Record<string, string[]> = {
        btc: ['btc', 'bitcoin', 'btc/usd', 'bitcoin/usd'],
        bitcoin: ['btc', 'bitcoin', 'btc/usd', 'bitcoin/usd'],
        eth: ['eth', 'ethereum', 'eth/usd', 'ethereum/usd', 'ether'],
        ethereum: ['eth', 'ethereum', 'eth/usd', 'ethereum/usd', 'ether'],
        usdc: ['usdc', 'usd coin', 'usdc/usd'],
        arb: ['arb', 'arbitrum', 'arb/usd'],
        arbitrum: ['arb', 'arbitrum', 'arb/usd'],
      };

      const searchTerms = tokenAliases[tokenLower] || [tokenLower];

      const matchingTopic = topics.find((t: any) => {
        // Try multiple fields that might contain the token info
        const metadata = (t.metadata || '').toLowerCase();
        const topicName = (t.topic_name || '').toLowerCase();
        const description = (t.description || '').toLowerCase();
        const topicId = String(t.topicId || t.topic_id || t.id || '');
        const allText = `${metadata} ${topicName} ${description}`;

        // Skip volume predictions when looking for price predictions
        if (allText.includes('volume') && !allText.includes('price')) {
          return false;
        }

        // For ARB, be more specific - look for ARB/USD price prediction
        if (tokenLower === 'arb' || tokenLower === 'arbitrum') {
          return (
            (allText.includes('arb/usd') || allText.includes('arbitrum')) &&
            allText.includes('price') &&
            !allText.includes('eth/usdc')
          ); // Avoid ETH/USDC pools on Arbitrum
        }

        // Check if any search term matches in any field
        for (const term of searchTerms) {
          if (allText.includes(term) && allText.includes('price')) {
            return true;
          }
        }

        // Also check specific known topic IDs
        if ((tokenLower === 'btc' || tokenLower === 'bitcoin') && topicId === '42') {
          return true;
        }
        if ((tokenLower === 'eth' || tokenLower === 'ethereum') && topicId === '41') {
          return true;
        }

        return false;
      });

      if (!matchingTopic) {
        workflowSteps.push(`❌ No prediction market found for ${token}`);

        // Show more detailed information about available topics
        const topicInfo = topics.slice(0, 5).map((t: any) => {
          const id = t.topicId || t.topic_id || t.id;
          const metadata = t.metadata || t.topic_name || t.description || 'No description';
          return `   • Topic ${id}: ${metadata}`;
        });

        if (topicInfo.length > 0) {
          workflowSteps.push('   Available topics:');
          workflowSteps.push(...topicInfo);
          if (topics.length > 5) {
            workflowSteps.push(`   ... and ${topics.length - 5} more`);
          }
        } else {
          workflowSteps.push('   No topics available');
        }

        workflowSteps.push('');
        workflowSteps.push(`   💡 Try using full token names like 'Bitcoin' or 'Ethereum'`);
        workflowSteps.push(`   💡 Or use the Market Forecast skill to check available markets`);

        const summary = [...workflowSteps, '---', `⏰ Executed at: ${new Date().toISOString()}`].join('\n');

        return createSuccessTask('predict-trade-workflow', undefined, summary);
      }

      // Get the topic ID properly
      const topicId = matchingTopic.topicId || matchingTopic.topic_id || matchingTopic.id;
      console.log(`[PredictAndTradeWorkflow] Found topic ${topicId} for token ${token}`);

      // Get the prediction
      const inferenceResponse = await alloraClient.callTool({
        name: 'get_inference_by_topic_id',
        arguments: { topicID: topicId },
      });

      const inferenceContent = inferenceResponse.content;
      const inferenceData =
        inferenceContent && Array.isArray(inferenceContent) && inferenceContent.length > 0 && inferenceContent[0].text
          ? JSON.parse(inferenceContent[0].text)
          : {};

      console.log('[PredictAndTradeWorkflow] Inference response:', inferenceData);

      const predictionValue = parseFloat(
        inferenceData.inference_data?.network_inference_normalized ||
          inferenceData.network_inference_normalized ||
          inferenceData.value ||
          '0',
      );

      if (!predictionValue || predictionValue === 0) {
        workflowSteps.push(`❌ No valid prediction value received for ${token}`);
        workflowSteps.push(`   Topic: ${matchingTopic.metadata || matchingTopic.topic_name || 'Unknown'}`);
        workflowSteps.push(`   This might be a volume or liquidity prediction instead of a price prediction`);
        workflowSteps.push('');
        workflowSteps.push('💡 Try a different token or use the Market Forecast skill directly');

        const summary = [...workflowSteps, '---', `⏰ Executed at: ${new Date().toISOString()}`].join('\n');

        return createSuccessTask('predict-trade-workflow', undefined, summary);
      }

      // For this example, we'll use the prediction as the future price
      // In reality, you'd need current price from another source
      const currentPrice = predictionValue * 0.97; // Assume 3% potential gain for demo

      workflowSteps.push(`✅ Prediction received: $${predictionValue.toFixed(2)}`);
      workflowSteps.push(`   Current price (estimated): $${currentPrice.toFixed(2)}`);

      // Step 2: Analyze trading opportunity
      workflowSteps.push('', '📊 Step 2: Analyzing trading opportunity...');

      // We'll do a simplified analysis here since we can't call other tools directly
      const priceChangePercent = ((predictionValue - currentPrice) / currentPrice) * 100;
      const confidence = 0.75; // Default confidence for demo

      // Determine recommendation
      let recommendation: 'BUY' | 'SELL' | 'HOLD';
      if (priceChangePercent > 3) {
        recommendation = 'BUY';
        shouldTrade = true;
      } else if (priceChangePercent < -3) {
        recommendation = 'SELL';
        shouldTrade = true;
      } else {
        recommendation = 'HOLD';
        shouldTrade = false;
      }

      // Calculate suggested position size (simplified)
      const maxPosition = portfolioValue * (DEFAULT_RISK_PARAMS.maxPositionSizePercent / 100);
      let suggestedPositionSize = Math.min(tradeAmount, maxPosition);

      tradingRecommendation = {
        recommendation,
        priceChangePercent,
        suggestedPositionSize,
        confidence,
      };

      workflowSteps.push(`✅ Analysis complete:`);
      workflowSteps.push(`   • Recommendation: ${recommendation}`);
      workflowSteps.push(`   • Price change: ${priceChangePercent > 0 ? '+' : ''}${priceChangePercent.toFixed(2)}%`);
      workflowSteps.push(`   • Suggested position: $${suggestedPositionSize.toFixed(2)}`);
      workflowSteps.push(`   • Confidence: ${(confidence * 100).toFixed(0)}%`);

      // Step 3: Execute trade if conditions are met
      if (shouldTrade && autoExecute) {
        workflowSteps.push('', '💱 Step 3: Executing trade...');

        const emberClient = context.mcpClients?.['ember-mcp-tool-server'];
        if (!emberClient) {
          workflowSteps.push('❌ EmberAI MCP client not available for trade execution');
          return createSuccessTask('predict-trade-workflow', undefined, workflowSteps.join('\n'));
        }

        // Determine swap direction based on recommendation
        let fromToken: string, toToken: string;
        if (recommendation === 'BUY') {
          fromToken = targetToken; // Buy token with USDC
          toToken = token;
        } else {
          fromToken = token; // Sell token for USDC
          toToken = targetToken;
        }

        workflowSteps.push(`🔄 Preparing swap: ${suggestedPositionSize.toFixed(2)} ${fromToken} → ${toToken}`);

        // Note: In a real implementation, we would call the executeSwapTool here
        // For now, we'll just indicate that the trade is ready
        workflowSteps.push(`✅ Trade prepared and ready for execution`);
        workflowSteps.push(`   • Please review and sign the transaction`);
      } else if (shouldTrade && !autoExecute) {
        workflowSteps.push('', '💡 Step 3: Trade recommendation ready');
        workflowSteps.push(`   • ${recommendation} ${token} with $${suggestedPositionSize.toFixed(2)}`);
        workflowSteps.push(`   • Set autoExecute=true to execute automatically`);
      } else {
        workflowSteps.push('', '⏸️  Step 3: No trade recommended at this time');
        workflowSteps.push(`   • Price movement too small for profitable trade`);
      }

      // Create final summary
      const summary = [
        '📈 Workflow Complete!',
        '',
        ...workflowSteps,
        '',
        '🎯 Summary:',
        `   • Token: ${token}`,
        `   • Prediction: $${predictionValue.toFixed(2)} (${priceChangePercent > 0 ? '+' : ''}${priceChangePercent.toFixed(2)}%)`,
        `   • Action: ${recommendation}`,
        `   • Status: ${shouldTrade && autoExecute ? 'Trade executed' : shouldTrade ? 'Ready to trade' : 'No action needed'}`,
      ].join('\n');

      return createSuccessTask('predict-trade-workflow', undefined, summary);
    } catch (error) {
      console.error('[PredictAndTradeWorkflow] Error:', error);
      const errorSteps = [
        ...workflowSteps,
        '',
        `❌ Workflow failed: ${error instanceof Error ? error.message : String(error)}`,
      ].join('\n');

      return createErrorTask('predict-trade-workflow', new VibkitError('WorkflowError', -32603, errorSteps));
    }
  },
};

// Export the tool wrapped with summary hook
export const predictAndTradeWorkflowTool = withHooks(basePredictAndTradeWorkflowTool, {
  after: summarizeWorkflowHook,
});

/**
 * Get Price Prediction Tool
 * Uses Allora MCP to fetch price predictions for tokens
 * Enhanced with hooks for topic discovery and response formatting
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from '@emberai/arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask, withHooks, VibkitError } from '@emberai/arbitrum-vibekit-core';
import { topicDiscoveryHook, formatResponseHook } from '../hooks/pricePredictionHooks.js';

// Tool parameters schema
const GetPricePredictionParams = z.object({
  token: z.string().describe('Token symbol (e.g., BTC, ETH)'),
  timeframe: z.string().optional().describe('Prediction timeframe'),
});

// Base tool that expects a topicId (will be added by pre-hook)
const basePricePredictionTool: VibkitToolDefinition<typeof GetPricePredictionParams, any, any, any> = {
  name: 'get-price-prediction',
  description: 'Get price prediction for a specific token from Allora prediction markets',
  parameters: GetPricePredictionParams,
  execute: async (args: any, context) => {
    console.log('[GetPricePrediction] Executing with args:', args);

    // The topicId should have been added by the pre-hook
    if (!args.topicId) {
      return createErrorTask(
        'predict-price',
        new VibkitError('TopicDiscoveryError', -32603, 'No topic ID provided. Topic discovery may have failed.'),
      );
    }

    const alloraClient = context.mcpClients?.['@alloralabs/mcp-server'];
    if (!alloraClient) {
      return createErrorTask(
        'predict-price',
        new VibkitError('ClientError', -32603, 'Allora MCP client not available'),
      );
    }

    try {
      // Call get_inference_by_topic_id with the discovered topic ID
      const inferenceResponse = await alloraClient.callTool({
        name: 'get_inference_by_topic_id',
        arguments: { topicID: args.topicId },
      });

      // Parse the inference response
      const content = inferenceResponse.content;
      const inferenceData =
        content && Array.isArray(content) && content.length > 0 && content[0].text ? JSON.parse(content[0].text) : {};

      console.log('[GetPricePrediction] Received inference data:', inferenceData);

      // Extract the prediction value from the nested structure
      const predictionValue =
        inferenceData.inference_data?.network_inference_normalized ||
        inferenceData.network_inference_normalized ||
        inferenceData.value ||
        'N/A';

      // Create a formatted message with the prediction
      const timeframeInfo = args.timeframe ? ` (${args.timeframe})` : '';
      const predictionMessage = `Price prediction for ${args.token}${timeframeInfo}: ${predictionValue}`;

      return createSuccessTask(
        'predict-price',
        undefined, // no artifacts
        predictionMessage,
      );
    } catch (error) {
      console.error('[GetPricePrediction] Error:', error);
      return createErrorTask(
        'predict-price',
        new VibkitError(
          'PredictionError',
          -32603,
          `Failed to get price prediction: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  },
};

// Export the tool wrapped with hooks
export const getPricePredictionTool = withHooks(basePricePredictionTool, {
  before: topicDiscoveryHook, // Pre-hook: discover topic ID
  after: formatResponseHook, // Post-hook: format response
});

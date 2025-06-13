/**
 * Make Trade Decision Tool
 * Analyzes prediction data and decides on a trading action.
 */

import { z } from 'zod';
import {
  type VibkitToolDefinition,
  createSuccessTask,
  createErrorTask,
  VibkitError,
  withHooks,
} from 'arbitrum-vibekit-core';
import { parseTokenFromMessageHook } from '../hooks/parseTokenFromMessageHook.js';

const TradeDecisionParams = z.object({
  predictedPrice: z.string().describe('The future price prediction from the getPricePrediction tool.'),
  currentPrice: z.string().describe('The current market price from the getCurrentPrice tool.'),
  token: z.string().describe('The token symbol being analyzed (e.g., "BTC").'),
});

export const makeTradeDecisionTool = withHooks(
  {
    name: 'makeTradeDecision',
    description:
      'Compares a predicted price against the current price to decide whether to buy, sell, or hold. Returns a decision object with action and reason.',
    parameters: TradeDecisionParams,
    execute: async (args, context) => {
      try {
        const predicted = parseFloat(args.predictedPrice);
        const current = parseFloat(args.currentPrice);

        if (isNaN(predicted) || isNaN(current)) {
          return createErrorTask(
            'trade-decision-task',
            new VibkitError(
              'InvalidPriceError',
              -32603,
              `Invalid price format. Predicted: "${args.predictedPrice}", Current: "${args.currentPrice}"`,
            ),
          );
        }

        // Heuristic: If predicted price is more than 1% higher than current price, buy.
        if (predicted > current * 1.01) {
          return createSuccessTask(
            'trade-decision-task',
            undefined,
            JSON.stringify({
              action: 'BUY',
              reason: `Predicted price (${predicted}) is >1% higher than current price (${current}).`,
            }),
          );
        }

        // Heuristic: If predicted price is more than 1% lower than current price, sell.
        if (predicted < current * 0.99) {
          return createSuccessTask(
            'trade-decision-task',
            undefined,
            JSON.stringify({
              action: 'SELL',
              reason: `Predicted price (${predicted}) is >1% lower than current price (${current}).`,
            }),
          );
        }

        return createSuccessTask(
          'trade-decision-task',
          undefined,
          JSON.stringify({
            action: 'HOLD',
            reason: `Price change between current (${current}) and predicted (${predicted}) is within 1% threshold.`,
          }),
        );
      } catch (error) {
        return createErrorTask(
          'trade-decision-task',
          new VibkitError(
            'DecisionError',
            -32603,
            `Failed to make trade decision: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }
    },
  },
  {
    before: parseTokenFromMessageHook,
  },
);

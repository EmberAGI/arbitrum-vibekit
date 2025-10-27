import { z } from 'zod';
import type { VibkitToolDefinition, AgentContext } from '@emberai/arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from '@emberai/arbitrum-vibekit-core';
import { runGreetingWorkflow } from '../workflow/index.js';

// Input schema for the tool
const inputSchema = z.object({
  message: z.string().describe('The greeting to optimize'),
});

// Define the optimize greeting tool
export const optimizeGreetingTool: VibkitToolDefinition<typeof inputSchema, any, any> = {
  name: 'optimize-greeting',
  description: 'Runs the evaluator-optimizer workflow on a greeting message',
  parameters: inputSchema,
  execute: async (args, context: AgentContext<{ model: any }>) => {
    try {
      // Get the model from custom context
      const model = context.custom?.model;
      if (!model) {
        throw new Error(
          'No model provider available in context. Make sure to provide model in contextProvider when starting the agent.'
        );
      }

      // Run the LangGraph workflow
      const result = await runGreetingWorkflow(args.message, model);

      // Create artifact with workflow results
      const artifact = {
        artifactId: `greeting-optimization-${Date.now()}`,
        name: 'Greeting Optimization Results',
        description: 'Results from the greeting optimization workflow',
        parts: [
          {
            kind: 'text' as const,
            text: JSON.stringify(
              {
                originalGreeting: args.message,
                optimizedGreeting: result.currentGreeting,
                iterations: result.iteration,
                finalSatisfaction: result.overallSatisfaction,
                evaluationHistory: result.evaluationHistory,
                feedbackHistory: result.feedbackHistory,
                evaluationCriteria: result.evaluationCriteria,
              },
              null,
              2
            ),
          },
        ],
        metadata: {
          iterations: result.iteration,
          finalSatisfaction: result.overallSatisfaction,
        },
      };

      // Return success task with artifact
      return createSuccessTask(
        'greeting-optimized',
        [artifact],
        `Greeting optimized successfully after ${result.iteration} iterations. Final satisfaction: ${result.overallSatisfaction}`
      );
    } catch (error) {
      console.error('Optimize greeting tool error:', error);
      return createErrorTask(
        'greeting-optimization-failed',
        error instanceof Error ? error : new Error('Unknown error')
      );
    }
  },
};

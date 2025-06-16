import {
  createSuccessTask,
  createErrorTask,
  type VibkitToolDefinition,
  type AgentContext,
} from 'arbitrum-vibekit-core';
import { z } from 'zod';

const inputSchema = z.object({
  topicId: z
    .string()
    .describe(
      "The ID of the Allora topic to get a prediction for (e.g., a specific asset pair like 'ETH'). The LLM should infer this from user input.",
    ),
});

export const getPredictionTool: VibkitToolDefinition<typeof inputSchema> = {
  name: 'getPrediction',
  description: 'Fetches a price prediction for a given asset from the Allora network.',
  parameters: inputSchema,
  execute: async (args, context: AgentContext) => {
    console.log(`Getting prediction for topic: ${args.topicId}`);

    const alloraMcpClient = context.mcpClients?.['@alloralabs/mcp-server'];

    if (!alloraMcpClient) {
      return createErrorTask(
        'mcp-client-missing',
        new Error("The Allora MCP client is not available in the tool's context."),
      );
    }

    const predictionResult = await alloraMcpClient.callTool({
      name: 'get-price-prediction',
      arguments: { topicId: args.topicId },
    });

    console.log('Received prediction:', predictionResult);

    // Return the result in a structured way for the LLM to understand and use.
    return createSuccessTask('prediction-received', [
      {
        type: 'application/json',
        content: JSON.stringify(predictionResult, null, 2),
        name: `prediction_for_${args.topicId}.json`,
      },
    ]);
  },
};

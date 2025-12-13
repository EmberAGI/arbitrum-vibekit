import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  GetSwapQuoteRequestSchema,
  GetBestRouteRequestSchema,
  GenerateSwapTransactionRequestSchema,
  ValidateSwapFeasibilityRequestSchema,
  ProcessSwapIntentRequestSchema,
} from './schemas/index.js';
import { getSwapQuote } from './tools/getSwapQuote.js';
import { getBestRoute } from './tools/getBestRoute.js';
import { generateSwapTransaction } from './tools/generateSwapTransaction.js';
import { validateSwapFeasibility } from './tools/validateSwapFeasibility.js';
import { processSwapIntent } from './tools/processSwapIntent.js';
import { UniswapMCPError } from './errors/index.js';

/**
 * Create and configure the Uniswap MCP server
 */
export async function createServer(): Promise<McpServer> {
  const server = new McpServer({
    name: 'uniswap-mcp-server',
    version: '1.0.0',
  });

  //
  // Tool: getSwapQuote
  //
  server.tool(
    'getSwapQuote',
    'Get a swap quote for a token pair, including expected output amount, price impact, and route summary.',
    GetSwapQuoteRequestSchema.shape,
    async (params) => {
      try {
        const request = GetSwapQuoteRequestSchema.parse(params);
        const result = await getSwapQuote(request);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );

  //
  // Tool: getBestRoute
  //
  server.tool(
    'getBestRoute',
    'Discover the optimal swap route for a token pair, including all hops, pools, and fee tiers.',
    GetBestRouteRequestSchema.shape,
    async (params) => {
      try {
        const request = GetBestRouteRequestSchema.parse(params);
        const result = await getBestRoute(request);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );

  //
  // Tool: generateSwapTransaction
  //
  server.tool(
    'generateSwapTransaction',
    'Generate executable transaction calldata for a swap, including to address, data, value, and gas estimate.',
    GenerateSwapTransactionRequestSchema.shape,
    async (params) => {
      try {
        const request = GenerateSwapTransactionRequestSchema.parse(params);
        const result = await generateSwapTransaction(request);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );

  //
  // Tool: validateSwapFeasibility
  //
  server.tool(
    'validateSwapFeasibility',
    'Validate swap feasibility by checking token validity, liquidity availability, user balance, approval requirements, and slippage bounds.',
    ValidateSwapFeasibilityRequestSchema.shape,
    async (params) => {
      try {
        const request = ValidateSwapFeasibilityRequestSchema.parse(params);
        const result = await validateSwapFeasibility(request);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );

  //
  // Tool: processSwapIntent
  //
  server.tool(
    'processSwapIntent',
    'Convert natural-language swap intents (e.g., "Swap 1 ETH to USDC with minimal slippage") into structured swap plans with quotes, routes, transactions, and validation.',
    ProcessSwapIntentRequestSchema.shape,
    async (params) => {
      try {
        const request = ProcessSwapIntentRequestSchema.parse(params);
        const result = await processSwapIntent(request);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );

  return server;
}

/**
 * Handle errors and return appropriate MCP response
 */
function handleError(error: unknown): {
  isError: boolean;
  content: Array<{ type: 'text'; text: string }>;
} {
  if (error instanceof UniswapMCPError) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: error.message,
              code: error.code,
              details: error.details,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (error instanceof z.ZodError) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: 'Validation error',
              code: 'VALIDATION_ERROR',
              details: error.issues,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            error: (error as Error).message || 'Unknown error',
            code: 'INTERNAL_ERROR',
          },
          null,
          2
        ),
      },
    ],
  };
}


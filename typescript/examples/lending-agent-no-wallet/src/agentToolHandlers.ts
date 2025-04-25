import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Task } from 'a2a-samples-js/schema';

// --- Zod Schemas for GetUserPositions Response ---

const ZodTokenUidSchema = z.object({
  chainId: z.string(),
  address: z.string(),
});

const ZodTokenSchema = z
  .object({
    tokenUid: ZodTokenUidSchema,
    name: z.string(),
    symbol: z.string(),
    isNative: z.boolean(),
    decimals: z.number(),
    isVetted: z.boolean(),
  })
  .passthrough(); // Allow other potential fields like priceUsd, etc.

const ZodUserReserveSchema = z
  .object({
    token: ZodTokenSchema,
    underlyingBalance: z.string(), // numeric string
    underlyingBalanceUsd: z.string(), // numeric string
    variableBorrows: z.string(), // numeric string
    variableBorrowsUsd: z.string(), // numeric string
    totalBorrows: z.string(), // numeric string
    totalBorrowsUsd: z.string(), // numeric string
    // Add other fields if necessary, e.g., isCollateral, supplyRate etc.
  })
  .passthrough();

const ZodLendingPositionSchema = z
  .object({
    userReserves: z.array(ZodUserReserveSchema),
    totalLiquidityUsd: z.string(), // numeric string
    totalCollateralUsd: z.string(), // numeric string
    totalBorrowsUsd: z.string(), // numeric string
    netWorthUsd: z.string(), // numeric string
    availableBorrowsUsd: z.string(), // numeric string
    currentLoanToValue: z.string(), // numeric string
    currentLiquidationThreshold: z.string(), // numeric string
    healthFactor: z.string(), // numeric string
  })
  .passthrough();

const ZodPositionSchema = z
  .object({
    // Assuming positionType exists, though not in the example JSON root
    // positionType: z.string().optional(), // e.g., 'LENDING'
    lendingPosition: ZodLendingPositionSchema,
  })
  .passthrough();

export const ZodGetWalletPositionsResponseSchema = z
  .object({
    positions: z.array(ZodPositionSchema),
  })
  .passthrough();

type McpGetWalletPositionsResponse = z.infer<typeof ZodGetWalletPositionsResponseSchema>;

// --- End Zod Schemas for GetUserPositions Response ---

export interface TokenInfo {
  chainId: string;
  address: string;
  decimals: number;
}

export const LendingPreviewSchema = z
  .object({
    tokenName: z.string(),
    amount: z.string(),
    action: z.enum(['borrow', 'repay', 'supply', 'withdraw']),
    chainId: z.string(),
  })
  .passthrough();

export type LendingPreview = z.infer<typeof LendingPreviewSchema>;

export const TransactionRequestSchema = z
  .object({
    chainId: z.string().optional(),
    to: z.string().optional(),
    data: z.string().optional(),
    value: z.string().optional(),
  })
  .passthrough();

export type TransactionRequest = z.infer<typeof TransactionRequestSchema>;

export const TransactionArtifactSchema = z.object({
  txPreview: LendingPreviewSchema,
  txPlan: z.array(TransactionRequestSchema),
});

export type TransactionArtifact = z.infer<typeof TransactionArtifactSchema>;

export const agentTools = [
  {
    name: 'borrow',
    description:
      'Borrow a token. Provide the token name (e.g., USDC, WETH) and a human-readable amount.',
    parameters: {
      type: 'object',
      properties: {
        tokenName: {
          type: 'string',
          description: 'The name of the token to borrow (e.g., USDC, WETH).',
        },
        amount: {
          type: 'string',
          description: "The amount to borrow (human readable, e.g., '100', '0.5').",
        },
      },
      required: ['tokenName', 'amount'],
    },
  },
  {
    name: 'repay',
    description: 'Repay a borrowed token. Provide the token name and a human-readable amount.',
    parameters: {
      type: 'object',
      properties: {
        tokenName: {
          type: 'string',
          description: 'The name of the token to repay.',
        },
        amount: {
          type: 'string',
          description: 'The amount to repay.',
        },
      },
      required: ['tokenName', 'amount'],
    },
  },
  {
    name: 'supply',
    description: 'Supply (deposit) a token. Provide the token name and a human-readable amount.',
    parameters: {
      type: 'object',
      properties: {
        tokenName: {
          type: 'string',
          description: 'The name of the token to supply.',
        },
        amount: {
          type: 'string',
          description: 'The amount to supply.',
        },
      },
      required: ['tokenName', 'amount'],
    },
  },
  {
    name: 'withdraw',
    description:
      'Withdraw a previously supplied token. Provide the token name and a human-readable amount.',
    parameters: {
      type: 'object',
      properties: {
        tokenName: {
          type: 'string',
          description: 'The name of the token to withdraw.',
        },
        amount: {
          type: 'string',
          description: 'The amount to withdraw.',
        },
      },
      required: ['tokenName', 'amount'],
    },
  },
  {
    name: 'getUserPositions',
    description: 'Get a summary of your current lending and borrowing positions.',
    parameters: { type: 'object', properties: {} },
  },
];

export interface HandlerContext {
  mcpClient: Client;
  tokenMap: Record<string, Array<TokenInfo>>;
  userAddress: string | undefined;
  log: (...args: unknown[]) => void;
  quicknodeSubdomain: string;
  quicknodeApiKey: string;
  executeAction: (
    actionName: string,
    transactions: TransactionRequest[]
  ) => Promise<TransactionRequest[]>;
}

type FindTokenResult =
  | { type: 'found'; token: TokenInfo }
  | { type: 'notFound' }
  | { type: 'clarificationNeeded'; options: TokenInfo[] };

function findTokenInfo(
  tokenMap: Record<string, Array<TokenInfo>>,
  tokenName: string
  // Add context for logging if needed
  // context: HandlerContext
): FindTokenResult {
  const upperTokenName = tokenName.toUpperCase();
  const possibleTokens = tokenMap[upperTokenName];

  if (!possibleTokens || possibleTokens.length === 0) {
    // context?.log(`Token symbol '${tokenName}' not found in tokenMap.`);
    return { type: 'notFound' };
  }

  if (possibleTokens.length === 1) {
    // context?.log(`Found unique token for symbol '${tokenName}'.`);
    return { type: 'found', token: possibleTokens[0] };
  }

  // Multiple options found
  // context?.log(`Multiple definitions found for symbol '${tokenName}'. Clarification needed.`);
  return { type: 'clarificationNeeded', options: possibleTokens };
}

function parseToolResponse(
  rawResponse: unknown,
  context: HandlerContext,
  toolName: string
): unknown {
  let dataToValidate: unknown;

  if (
    rawResponse &&
    typeof rawResponse === 'object' &&
    'content' in rawResponse &&
    Array.isArray((rawResponse as any).content) &&
    (rawResponse as any).content.length > 0 &&
    (rawResponse as any).content[0]?.type === 'text' &&
    typeof (rawResponse as any).content[0]?.text === 'string'
  ) {
    context.log(`Raw ${toolName} result appears nested, parsing inner text...`);
    try {
      const textToParse = (rawResponse as any).content[0].text;
      // Check if the text content itself indicates an error from the tool
      if (textToParse.startsWith('Error:')) {
        context.log(`MCP tool '${toolName}' returned an error: ${textToParse}`);
        throw new Error(`MCP tool '${toolName}' failed: ${textToParse}`);
      }
      const parsedData = JSON.parse(textToParse);
      context.log('Parsed inner text content for validation:', parsedData);
      dataToValidate = parsedData;
    } catch (e) {
      context.log(`Error parsing inner text content from ${toolName} result:`, e);
      throw new Error(
        `Failed to parse nested JSON response from ${toolName}: ${(e as Error).message}`
      );
    }
  } else {
    context.log(
      `Raw ${toolName} result does not have expected nested structure, validating as is.`
    );
    dataToValidate = rawResponse;
  }

  return dataToValidate;
}

function validateTransactions(
  actionName: string,
  rawTransactions: unknown,
  context: HandlerContext
): TransactionRequest[] {
  const validationResult = z.array(TransactionRequestSchema).safeParse(rawTransactions);
  if (!validationResult.success) {
    const errorMsg = `MCP tool '${actionName}' returned invalid transaction data after parsing.`;
    context.log(errorMsg, validationResult.error);
    context.log('Raw data that failed validation:', JSON.stringify(rawTransactions));
    throw new Error(errorMsg);
  }
  context.log(`Validated ${validationResult.data.length} transactions for ${actionName}.`);
  return validationResult.data;
}

async function validateAndExecuteAction(
  actionName: string,
  rawToolResult: unknown,
  context: HandlerContext
): Promise<TransactionRequest[]> {
  const parsedResult = parseToolResponse(rawToolResult, context, actionName);
  const validatedTransactions = validateTransactions(actionName, parsedResult, context);

  if (context.executeAction) {
    return await context.executeAction(actionName, validatedTransactions);
  }
  return validatedTransactions;
}

export async function handleBorrow(
  params: { tokenName: string; amount: string },
  context: HandlerContext
): Promise<Task> {
  if (!context.userAddress) {
    throw new Error('User address not set!');
  }

  const { tokenName, amount } = params;
  const findResult = findTokenInfo(context.tokenMap, tokenName);

  switch (findResult.type) {
    case 'notFound':
      context.log(`Borrow failed: Token ${tokenName} not found/supported.`);
      return {
        id: context.userAddress,
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: `Token ${tokenName} not supported for borrowing.` }],
          },
        },
      };

    case 'clarificationNeeded':
      context.log(`Borrow requires clarification for token ${tokenName}.`);
      // Construct message listing options (e.g., by chainId)
      const optionsText = findResult.options
        .map(opt => `- ${tokenName} on chain ${opt.chainId}`)
        .join('\n');
      return {
        id: context.userAddress,
        status: {
          state: 'input-required',
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: `Which ${tokenName} do you want to borrow? Please specify the chain:\n${optionsText}`,
              },
            ],
          },
        },
      };

    case 'found':
      const tokenDetail = findResult.token;
      context.log(
        `Preparing borrow transaction: ${tokenName} (Chain: ${tokenDetail.chainId}, Addr: ${tokenDetail.address}), amount: ${amount}`
      );

      try {
        const rawResult = await context.mcpClient.callTool({
          name: 'borrow',
          arguments: {
            tokenAddress: tokenDetail.address,
            tokenChainId: tokenDetail.chainId,
            amount,
            userAddress: context.userAddress,
          },
        });

        const parsedResponse = parseToolResponse(rawResult, context, 'borrow');
        const transactions = await validateAndExecuteAction('borrow', parsedResponse, context);

        const txArtifact: TransactionArtifact = {
          txPreview: {
            tokenName,
            amount,
            action: 'borrow',
            chainId: tokenDetail.chainId,
          },
          txPlan: transactions,
        };

        return {
          id: context.userAddress,
          status: {
            state: 'completed',
            message: {
              role: 'agent',
              parts: [
                { type: 'text', text: 'Transaction plan successfully created. Ready to sign.' },
              ],
            },
          },
          artifacts: [
            {
              name: 'transaction-plan',
              parts: [{ type: 'data', data: txArtifact }],
            },
          ],
        };
      } catch (error) {
        context.log(`Error during borrow execution for ${tokenName}:`, error);
        return {
          id: context.userAddress,
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [{ type: 'text', text: `Borrow Error: ${(error as Error).message}` }],
            },
          },
        };
      }
  }
}

export async function handleRepay(
  params: { tokenName: string; amount: string },
  context: HandlerContext
): Promise<Task> {
  if (!context.userAddress) {
    throw new Error('User address not set!');
  }

  const { tokenName, amount } = params;
  const findResult = findTokenInfo(context.tokenMap, tokenName);

  switch (findResult.type) {
    case 'notFound':
      context.log(`Repay failed: Token ${tokenName} not found/supported.`);
      return {
        id: context.userAddress,
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: `Token ${tokenName} not supported for repaying.` }],
          },
        },
      };

    case 'clarificationNeeded':
      context.log(`Repay requires clarification for token ${tokenName}.`);
      const optionsText = findResult.options
        .map(opt => `- ${tokenName} on chain ${opt.chainId}`)
        .join('\n');
      return {
        id: context.userAddress,
        status: {
          state: 'input-required',
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: `Which ${tokenName} do you want to repay? Please specify the chain:\n${optionsText}`,
              },
            ],
          },
        },
      };

    case 'found':
      const tokenDetail = findResult.token;
      context.log(
        `Preparing repay transaction: ${tokenName} (Chain: ${tokenDetail.chainId}, Addr: ${tokenDetail.address}), amount: ${amount}`
      );

      try {
        const rawResult = await context.mcpClient.callTool({
          name: 'repay',
          arguments: {
            tokenAddress: tokenDetail.address,
            tokenChainId: tokenDetail.chainId,
            amount,
            userAddress: context.userAddress,
          },
        });

        const parsedResponse = parseToolResponse(rawResult, context, 'repay');
        const transactions = await validateAndExecuteAction('repay', parsedResponse, context);

        const txArtifact: TransactionArtifact = {
          txPreview: {
            tokenName,
            amount,
            action: 'repay',
            chainId: tokenDetail.chainId,
          },
          txPlan: transactions,
        };

        return {
          id: context.userAddress,
          status: {
            state: 'completed',
            message: {
              role: 'agent',
              parts: [
                { type: 'text', text: 'Transaction plan successfully created. Ready to sign.' },
              ],
            },
          },
          artifacts: [
            {
              name: 'transaction-plan',
              parts: [{ type: 'data', data: txArtifact }],
            },
          ],
        };
      } catch (error) {
        context.log(`Error during repay execution for ${tokenName}:`, error);
        return {
          id: context.userAddress,
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [{ type: 'text', text: `Repay Error: ${(error as Error).message}` }],
            },
          },
        };
      }
  }
}

export async function handleSupply(
  params: { tokenName: string; amount: string },
  context: HandlerContext
): Promise<Task> {
  if (!context.userAddress) {
    throw new Error('User address not set!');
  }

  const { tokenName, amount } = params;
  const findResult = findTokenInfo(context.tokenMap, tokenName);

  switch (findResult.type) {
    case 'notFound':
      context.log(`Supply failed: Token ${tokenName} not found/supported.`);
      return {
        id: context.userAddress,
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: `Token ${tokenName} not supported for supplying.` }],
          },
        },
      };

    case 'clarificationNeeded':
      context.log(`Supply requires clarification for token ${tokenName}.`);
      const optionsText = findResult.options
        .map(opt => `- ${tokenName} on chain ${opt.chainId}`)
        .join('\n');
      return {
        id: context.userAddress,
        status: {
          state: 'input-required',
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: `Which ${tokenName} do you want to supply? Please specify the chain:\n${optionsText}`,
              },
            ],
          },
        },
      };

    case 'found':
      const tokenDetail = findResult.token;
      context.log(
        `Preparing supply transaction: ${tokenName} (Chain: ${tokenDetail.chainId}, Addr: ${tokenDetail.address}), amount: ${amount}`
      );

      try {
        const rawResult = await context.mcpClient.callTool({
          name: 'supply',
          arguments: {
            tokenAddress: tokenDetail.address,
            tokenChainId: tokenDetail.chainId,
            amount,
            userAddress: context.userAddress,
          },
        });

        const parsedResponse = parseToolResponse(rawResult, context, 'supply');
        const transactions = await validateAndExecuteAction('supply', parsedResponse, context);

        const txArtifact: TransactionArtifact = {
          txPreview: {
            tokenName,
            amount,
            action: 'supply',
            chainId: tokenDetail.chainId,
          },
          txPlan: transactions,
        };

        return {
          id: context.userAddress,
          status: {
            state: 'completed',
            message: {
              role: 'agent',
              parts: [
                { type: 'text', text: 'Transaction plan successfully created. Ready to sign.' },
              ],
            },
          },
          artifacts: [
            {
              name: 'transaction-plan',
              parts: [{ type: 'data', data: txArtifact }],
            },
          ],
        };
      } catch (error) {
        context.log(`Error during supply execution for ${tokenName}:`, error);
        return {
          id: context.userAddress,
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [{ type: 'text', text: `Supply Error: ${(error as Error).message}` }],
            },
          },
        };
      }
  }
}

export async function handleWithdraw(
  params: { tokenName: string; amount: string },
  context: HandlerContext
): Promise<Task> {
  if (!context.userAddress) {
    throw new Error('User address not set!');
  }

  const { tokenName, amount } = params;
  const findResult = findTokenInfo(context.tokenMap, tokenName);

  switch (findResult.type) {
    case 'notFound':
      context.log(`Withdraw failed: Token ${tokenName} not found/supported.`);
      return {
        id: context.userAddress,
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: `Token ${tokenName} not supported for withdrawing.` }],
          },
        },
      };

    case 'clarificationNeeded':
      context.log(`Withdraw requires clarification for token ${tokenName}.`);
      const optionsText = findResult.options
        .map(opt => `- ${tokenName} on chain ${opt.chainId}`)
        .join('\n');
      return {
        id: context.userAddress,
        status: {
          state: 'input-required',
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: `Which ${tokenName} do you want to withdraw? Please specify the chain:\n${optionsText}`,
              },
            ],
          },
        },
      };

    case 'found':
      const tokenDetail = findResult.token;
      context.log(
        `Preparing withdraw transaction: ${tokenName} (Chain: ${tokenDetail.chainId}, Addr: ${tokenDetail.address}), amount: ${amount}`
      );

      try {
        const rawResult = await context.mcpClient.callTool({
          name: 'withdraw',
          arguments: {
            tokenAddress: tokenDetail.address,
            tokenChainId: tokenDetail.chainId,
            amount,
            userAddress: context.userAddress,
          },
        });

        const parsedResponse = parseToolResponse(rawResult, context, 'withdraw');
        const transactions = await validateAndExecuteAction('withdraw', parsedResponse, context);

        const txArtifact: TransactionArtifact = {
          txPreview: {
            tokenName,
            amount,
            action: 'withdraw',
            chainId: tokenDetail.chainId,
          },
          txPlan: transactions,
        };

        return {
          id: context.userAddress,
          status: {
            state: 'completed',
            message: {
              role: 'agent',
              parts: [
                { type: 'text', text: 'Transaction plan successfully created. Ready to sign.' },
              ],
            },
          },
          artifacts: [
            {
              name: 'transaction-plan',
              parts: [{ type: 'data', data: txArtifact }],
            },
          ],
        };
      } catch (error) {
        context.log(`Error during withdraw execution for ${tokenName}:`, error);
        return {
          id: context.userAddress,
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [{ type: 'text', text: `Withdraw Error: ${(error as Error).message}` }],
            },
          },
        };
      }
  }
}

export async function handleGetUserPositions(
  _params: Record<string, never>,
  context: HandlerContext
): Promise<Task> {
  if (!context.userAddress) {
    throw new Error('User address not set!');
  }

  try {
    const rawResult = await context.mcpClient.callTool({
      name: 'getUserPositions',
      arguments: {
        userAddress: context.userAddress,
      },
    });

    console.log('rawResult', rawResult);

    const parsedData = parseToolResponse(rawResult, context, 'getUserPositions');

    console.log('parsedData', parsedData);

    let positionsText: string;

    // Validate the parsed data using the new Zod schema
    const validationResult = ZodGetWalletPositionsResponseSchema.safeParse(parsedData);

    if (!validationResult.success) {
      context.log('Get User Positions validation failed:', validationResult.error);
      throw Error(`Validation failed: ${JSON.stringify(parsedData)}`);
    }

    const validatedPositions = validationResult.data;
    // Remove the conversion to JSON string for the message
    // positionsText = JSON.stringify(validatedPositions);

    return {
      id: context.userAddress, // Removed non-null assertion as it's checked earlier
      status: {
        state: 'completed',
      },
      // Add the artifact containing the validated positions data
      artifacts: [
        {
          name: 'wallet-positions',
          parts: [{ type: 'data', data: validatedPositions }],
        },
      ],
    };
  } catch (error) {
    return {
      id: context.userAddress,
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: `Error fetching positions: ${(error as Error).message}` }],
        },
      },
    };
  }
}

import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Task } from 'a2a-samples-js/schema';

export type TokenInfo = {
  chainId: string;
  address: string;
  decimals: number;
};

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
    to: z.string(),
    data: z.string(),
    value: z.string().optional(),
    chainId: z.string(),
  })
  .passthrough();

export type TransactionRequest = z.infer<typeof TransactionRequestSchema>;

export const TransactionArtifactSchema = z.object({
  txPreview: LendingPreviewSchema,
  txPlan: z.array(TransactionRequestSchema),
});

export type TransactionArtifact = z.infer<typeof TransactionArtifactSchema>;

export interface HandlerContext {
  mcpClient: Client;
  tokenMap: Record<string, TokenInfo>;
  userAddress: string | undefined;
  log: (...args: unknown[]) => void;
  quicknodeSubdomain: string;
  quicknodeApiKey: string;
}

function findTokensCaseInsensitive(
  tokenMap: Record<string, TokenInfo>,
  tokenName: string
): TokenInfo | undefined {
  const lowerCaseTokenName = tokenName.toLowerCase();
  for (const key in tokenMap) {
    if (key.toLowerCase() === lowerCaseTokenName) {
      return tokenMap[key];
    }
  }
  return undefined;
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
      const parsedData = JSON.parse((rawResponse as any).content[0].text);
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
): Array<TransactionRequest> {
  const validationResult = z.array(TransactionRequestSchema).safeParse(rawTransactions);
  if (!validationResult.success) {
    const errorMsg = `MCP tool '${actionName}' returned invalid transaction data.`;
    context.log('Validation Error:', errorMsg, validationResult.error);
    throw new Error(errorMsg);
  }
  return validationResult.data;
}

export async function handleBorrow(
  params: { tokenName: string; amount: string },
  context: HandlerContext
): Promise<Task> {
  if (!context.userAddress) {
    throw new Error('User address not set!');
  }
  
  const { tokenName, amount } = params;
  const tokenDetail = findTokensCaseInsensitive(context.tokenMap, tokenName);
  
  if (!tokenDetail) {
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
  }

  context.log(
    `Preparing borrow transaction: ${tokenName} (${tokenDetail.address}), amount: ${amount}`
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
    const transactions = validateTransactions('borrow', parsedResponse, context);

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
        state: 'submitted',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: `Ready to borrow ${amount} ${tokenName}. Please confirm the transaction.`,
            },
            {
              type: 'data',
              data: {
                transactions: txArtifact
              },
            },
          ],
        },
      },
    };
  } catch (error) {
    return {
      id: context.userAddress,
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        },
      },
    };
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
  const tokenDetail = findTokensCaseInsensitive(context.tokenMap, tokenName);
  
  if (!tokenDetail) {
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
  }

  context.log(
    `Preparing repay transaction: ${tokenName} (${tokenDetail.address}), amount: ${amount}`
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
    const transactions = validateTransactions('repay', parsedResponse, context);

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
        state: 'submitted',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: `Ready to repay ${amount} ${tokenName}. Please confirm the transaction.`,
            },
            {
              type: 'data',
              data: {
                transactions: txArtifact
              },
            },
          ],
        },
      },
    };
  } catch (error) {
    return {
      id: context.userAddress,
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        },
      },
    };
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
  const tokenDetail = findTokensCaseInsensitive(context.tokenMap, tokenName);
  
  if (!tokenDetail) {
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
  }

  context.log(
    `Preparing supply transaction: ${tokenName} (${tokenDetail.address}), amount: ${amount}`
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
    const transactions = validateTransactions('supply', parsedResponse, context);

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
        state: 'submitted',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: `Ready to supply ${amount} ${tokenName}. Please confirm the transaction.`,
            },
            {
              type: 'data',
              data: {
                transactions: txArtifact
              },
            },
          ],
        },
      },
    };
  } catch (error) {
    return {
      id: context.userAddress,
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        },
      },
    };
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
  const tokenDetail = findTokensCaseInsensitive(context.tokenMap, tokenName);
  
  if (!tokenDetail) {
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
  }

  context.log(
    `Preparing withdraw transaction: ${tokenName} (${tokenDetail.address}), amount: ${amount}`
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
    const transactions = validateTransactions('withdraw', parsedResponse, context);

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
        state: 'submitted',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: `Ready to withdraw ${amount} ${tokenName}. Please confirm the transaction.`,
            },
            {
              type: 'data',
              data: {
                transactions: txArtifact
              },
            },
          ],
        },
      },
    };
  } catch (error) {
    return {
      id: context.userAddress,
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        },
      },
    };
  }
}

export async function handleGetUserPositions(
  _params: Record<string, unknown>,
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

    // For position data, we just return it formatted as text, not as transaction data
    const parsedData = parseToolResponse(rawResult, context, 'getUserPositions');
    
    // Format the positions data into a readable string
    const positionsText = formatPositionsData(parsedData);

    return {
      id: context.userAddress,
      status: {
        state: 'completed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: positionsText }],
        },
      },
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

// Helper function to format positions data into a readable string
function formatPositionsData(data: unknown): string {
  if (!data || typeof data !== 'object') {
    return 'No position data available.';
  }

  try {
    // Convert nested JSON string if needed
    let positionsData = data;
    if ('content' in data && Array.isArray((data as any).content)) {
      const content = (data as any).content;
      if (content[0]?.type === 'text' && typeof content[0].text === 'string') {
        try {
          positionsData = JSON.parse(content[0].text);
        } catch (e) {
          // If not valid JSON, use the text directly
          return content[0].text as string;
        }
      }
    }

    // Format into readable text - implementation depends on actual data structure
    // This is a placeholder - adjust based on actual data format
    if (
      positionsData && 
      typeof positionsData === 'object' &&
      ('suppliedTokens' in positionsData || 'borrowedTokens' in positionsData)
    ) {
      const pd = positionsData as any;
      
      let result = '#### Your Current Positions\n\n';
      
      if (pd.suppliedTokens && pd.suppliedTokens.length > 0) {
        result += '**Supplied Assets:**\n';
        pd.suppliedTokens.forEach((token: any) => {
          result += `- ${token.amount} ${token.symbol} (${token.valueUSD} USD)\n`;
        });
        result += '\n';
      } else {
        result += '**Supplied Assets:** None\n\n';
      }
      
      if (pd.borrowedTokens && pd.borrowedTokens.length > 0) {
        result += '**Borrowed Assets:**\n';
        pd.borrowedTokens.forEach((token: any) => {
          result += `- ${token.amount} ${token.symbol} (${token.valueUSD} USD)\n`;
        });
        result += '\n';
      } else {
        result += '**Borrowed Assets:** None\n\n';
      }
      
      if (pd.healthFactor) {
        result += `**Health Factor:** ${pd.healthFactor}\n`;
      }

      return result;
    }
    
    // Fallback for unknown structure
    return JSON.stringify(positionsData, null, 2);
    
  } catch (e) {
    return `Error formatting positions data: ${(e as Error).message}`;
  }
} 
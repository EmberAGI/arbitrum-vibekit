import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Task } from 'a2a-samples-js/schema';
import {
  createPublicClient,
  http,
  encodeFunctionData,
  parseUnits,
  formatUnits,
  type Address,
  type PublicClient,
} from 'viem';
import Erc20Abi from '@openzeppelin/contracts/build/contracts/ERC20.json' with { type: 'json' };
import { getChainConfigById } from './agent.js';

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
  .passthrough();

const ZodUserReserveSchema = z
  .object({
    token: ZodTokenSchema,
    underlyingBalance: z.string(),
    underlyingBalanceUsd: z.string(),
    variableBorrows: z.string(),
    variableBorrowsUsd: z.string(),
    totalBorrows: z.string(),
    totalBorrowsUsd: z.string(),
  })
  .passthrough();

const ZodLendingPositionSchema = z
  .object({
    userReserves: z.array(ZodUserReserveSchema),
    totalLiquidityUsd: z.string(),
    totalCollateralUsd: z.string(),
    totalBorrowsUsd: z.string(),
    netWorthUsd: z.string(),
    availableBorrowsUsd: z.string(),
    currentLoanToValue: z.string(),
    currentLiquidationThreshold: z.string(),
    healthFactor: z.string(),
  })
  .passthrough();

const ZodPositionSchema = z
  .object({
    lendingPosition: ZodLendingPositionSchema,
  })
  .passthrough();

export const ZodGetWalletPositionsResponseSchema = z
  .object({
    positions: z.array(ZodPositionSchema),
  })
  .passthrough();

type McpGetWalletPositionsResponse = z.infer<typeof ZodGetWalletPositionsResponseSchema>;

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
): FindTokenResult {
  const upperTokenName = tokenName.toUpperCase();
  const possibleTokens = tokenMap[upperTokenName];

  if (!possibleTokens || possibleTokens.length === 0) {
    return { type: 'notFound' };
  }

  if (possibleTokens.length === 1) {
    return { type: 'found', token: possibleTokens[0] };
  }

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
  const { tokenName: rawTokenName, amount } = params;
  const tokenName = rawTokenName.toUpperCase();

  if (!context.userAddress) {
    throw new Error('User address not set!');
  }

  const findResult = findTokenInfo(context.tokenMap, rawTokenName);

  switch (findResult.type) {
    case 'notFound':
      context.log(`Borrow failed: Token ${rawTokenName} not found/supported.`);
      return {
        id: context.userAddress,
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: `Token ${rawTokenName} not supported for borrowing.` }],
          },
        },
      };

    case 'clarificationNeeded':
      context.log(`Borrow requires clarification for token ${rawTokenName}.`);
      const optionsText = findResult.options
        .map(opt => `- ${rawTokenName} on chain ${opt.chainId}`)
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
                text: `Which ${rawTokenName} do you want to borrow? Please specify the chain:\n${optionsText}`,
              },
            ],
          },
        },
      };

    case 'found':
      const tokenDetail = findResult.token;
      context.log(
        `Preparing borrow transaction: ${rawTokenName} (Chain: ${tokenDetail.chainId}, Addr: ${tokenDetail.address}), amount: ${amount}`
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
        context.log(`Error during borrow execution for ${rawTokenName}:`, error);
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
  const { tokenName: rawTokenName, amount } = params;
  const tokenName = rawTokenName.toUpperCase();

  if (!context.userAddress) {
    throw new Error('User address not set!');
  }

  const findResult = findTokenInfo(context.tokenMap, rawTokenName);

  switch (findResult.type) {
    case 'notFound':
      return {
        id: context.userAddress,
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: `Token '${rawTokenName}' not supported.` }],
          },
        },
      };

    case 'clarificationNeeded':
      const chainList = findResult.options
        .map((t: TokenInfo, idx: number) => `${idx + 1}. Chain ID: ${t.chainId}`)
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
                text: `Multiple chains found for ${rawTokenName}:\n${chainList}\nPlease specify the chain.`,
              },
            ],
          },
        },
      };

    case 'found': {
      const tokenInfo = findResult.token;
      const userAddress = context.userAddress as Address;
      const tokenAddress = tokenInfo.address as Address;
      const txChainId = tokenInfo.chainId;
      let atomicAmount: bigint;
      try {
        atomicAmount = parseUnits(amount, tokenInfo.decimals);
      } catch (e) {
        return {
          id: userAddress,
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [{ type: 'text', text: `Invalid amount format: ${amount}` }],
            },
          },
        };
      }

      context.log(
        `Preparing repay: ${amount} ${tokenName} (${tokenAddress} on chain ${txChainId}), User: ${userAddress}`
      );

      let publicClient: PublicClient;
      try {
        const chainConfig = getChainConfigById(txChainId);
        const networkSegment = chainConfig.quicknodeSegment;
        const targetChain = chainConfig.viemChain;
        let dynamicRpcUrl: string;
        if (networkSegment === '') {
          dynamicRpcUrl = `https://${context.quicknodeSubdomain}.quiknode.pro/${context.quicknodeApiKey}`;
        } else {
          dynamicRpcUrl = `https://${context.quicknodeSubdomain}.${networkSegment}.quiknode.pro/${context.quicknodeApiKey}`;
        }
        publicClient = createPublicClient({
          chain: targetChain,
          transport: http(dynamicRpcUrl),
        });
        context.log(`Public client created for chain ${txChainId}`);
      } catch (chainError) {
        context.log(`Failed to create public client for chain ${txChainId}:`, chainError);
        return {
          id: userAddress,
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [
                { type: 'text', text: `Network configuration error for chain ${txChainId}.` },
              ],
            },
          },
        };
      }

      try {
        const currentBalance = (await publicClient.readContract({
          address: tokenAddress,
          abi: Erc20Abi.abi,
          functionName: 'balanceOf',
          args: [userAddress],
        })) as bigint;
        context.log(
          `User balance check: Has ${currentBalance}, needs ${atomicAmount} of ${tokenName}`
        );

        if (currentBalance < atomicAmount) {
          const formattedBalance = formatUnits(currentBalance, tokenInfo.decimals);
          context.log(`Insufficient balance for repay. Needs ${amount}, has ${formattedBalance}`);
          return {
            id: userAddress,
            status: {
              state: 'failed',
              message: {
                role: 'agent',
                parts: [
                  {
                    type: 'text',
                    text: `Insufficient ${tokenName} balance. You need ${amount} but only have ${formattedBalance}.`,
                  },
                ],
              },
            },
          };
        }
        context.log(`Sufficient balance confirmed.`);
      } catch (readError) {
        context.log(
          `Warning: Failed to read token balance. Error: ${(readError as Error).message}`
        );
        return {
          id: userAddress,
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [
                {
                  type: 'text',
                  text: `Could not verify your ${tokenName} balance due to a network error.`,
                },
              ],
            },
          },
        };
      }

      context.log(`Executing repay via MCP for ${amount} ${tokenName}`);
      const toolResult = await context.mcpClient.callTool({
        name: 'repay',
        arguments: {
          tokenAddress: tokenInfo.address,
          tokenChainId: tokenInfo.chainId,
          amount: atomicAmount.toString(),
          userAddress: context.userAddress,
        },
      });

      context.log('MCP repay tool response:', toolResult);

      let validatedTxPlan: TransactionRequest[] = [];
      try {
        const parsedData = parseToolResponse(toolResult, context, 'repay');
        validatedTxPlan = validateTransactions('repay', parsedData, context);

        validatedTxPlan = validatedTxPlan.map(tx => ({ ...tx, chainId: tx.chainId ?? txChainId }));
        context.log(`Processed ${validatedTxPlan.length} transactions from MCP for repay.`);

        if (validatedTxPlan.length === 0) {
          throw new Error('MCP tool returned an empty transaction plan.');
        }
      } catch (error) {
        context.log(`Error processing MCP repay response:`, error);
        return {
          id: userAddress,
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [
                {
                  type: 'text',
                  text: `Failed to get valid repay plan: ${(error as Error).message}`,
                },
              ],
            },
          },
        };
      }

      const finalTxPlan = validatedTxPlan;

      const txPreview: LendingPreview = {
        tokenName: tokenName,
        amount: amount,
        action: 'repay',
        chainId: txChainId,
      };

      try {
        const executedPlan = await context.executeAction('repay', finalTxPlan);
        context.log('Repay transaction plan executed (or prepared for signing):', executedPlan);

        return {
          id: userAddress,
          status: {
            state: 'completed',
            message: {
              role: 'agent',
              parts: [
                {
                  type: 'text',
                  text: `Repay transaction plan created for ${amount} ${tokenName}. Ready to sign.`,
                },
              ],
            },
          },
          artifacts: [
            {
              name: 'transaction-plan',
              parts: [
                {
                  type: 'data',
                  data: {
                    txPreview: txPreview,
                    txPlan: executedPlan,
                  } as TransactionArtifact,
                },
              ],
            },
          ],
        };
      } catch (error) {
        context.log(`Error during repay action execution:`, error);
        return {
          id: userAddress,
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [
                {
                  type: 'text',
                  text: `Failed to execute repay transaction plan: ${(error as Error).message}`,
                },
              ],
            },
          },
        };
      }
    }
  }
}

export async function handleSupply(
  params: { tokenName: string; amount: string },
  context: HandlerContext
): Promise<Task> {
  const { tokenName: rawTokenName, amount } = params;
  const tokenName = rawTokenName.toUpperCase();

  if (!context.userAddress) {
    throw new Error('User address not set!');
  }

  const findResult = findTokenInfo(context.tokenMap, rawTokenName);

  switch (findResult.type) {
    case 'notFound':
      return {
        id: context.userAddress,
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: `Token '${rawTokenName}' not supported.` }],
          },
        },
      };

    case 'clarificationNeeded':
      const chainList = findResult.options
        .map((t: TokenInfo, idx: number) => `${idx + 1}. Chain ID: ${t.chainId}`)
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
                text: `Multiple chains found for ${rawTokenName}:\n${chainList}\nPlease specify the chain.`,
              },
            ],
          },
        },
      };

    case 'found': {
      const tokenInfo = findResult.token;
      const userAddress = context.userAddress as Address;
      const tokenAddress = tokenInfo.address as Address;
      const txChainId = tokenInfo.chainId;
      let atomicAmount: bigint;
      try {
        atomicAmount = parseUnits(amount, tokenInfo.decimals);
      } catch (e) {
        return {
          id: userAddress,
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [{ type: 'text', text: `Invalid amount format: ${amount}` }],
            },
          },
        };
      }

      context.log(
        `Preparing supply: ${amount} ${tokenName} (${tokenAddress} on chain ${txChainId}), User: ${userAddress}`
      );

      let publicClient: PublicClient;
      try {
        const chainConfig = getChainConfigById(txChainId);
        const networkSegment = chainConfig.quicknodeSegment;
        const targetChain = chainConfig.viemChain;
        let dynamicRpcUrl: string;
        if (networkSegment === '') {
          dynamicRpcUrl = `https://${context.quicknodeSubdomain}.quiknode.pro/${context.quicknodeApiKey}`;
        } else {
          dynamicRpcUrl = `https://${context.quicknodeSubdomain}.${networkSegment}.quiknode.pro/${context.quicknodeApiKey}`;
        }
        publicClient = createPublicClient({
          chain: targetChain,
          transport: http(dynamicRpcUrl),
        });
        context.log(`Public client created for chain ${txChainId}`);
      } catch (chainError) {
        context.log(`Failed to create public client for chain ${txChainId}:`, chainError);
        return {
          id: userAddress,
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [
                { type: 'text', text: `Network configuration error for chain ${txChainId}.` },
              ],
            },
          },
        };
      }

      try {
        const currentBalance = (await publicClient.readContract({
          address: tokenAddress,
          abi: Erc20Abi.abi,
          functionName: 'balanceOf',
          args: [userAddress],
        })) as bigint;
        context.log(
          `User balance check: Has ${currentBalance}, needs ${atomicAmount} of ${tokenName}`
        );
        if (currentBalance < atomicAmount) {
          const formattedBalance = formatUnits(currentBalance, tokenInfo.decimals);
          context.log(`Insufficient balance for supply. Needs ${amount}, has ${formattedBalance}`);
          return {
            id: userAddress,
            status: {
              state: 'failed',
              message: {
                role: 'agent',
                parts: [
                  {
                    type: 'text',
                    text: `Insufficient ${tokenName} balance. You need ${amount} but only have ${formattedBalance}.`,
                  },
                ],
              },
            },
          };
        }
        context.log(`Sufficient balance confirmed.`);
      } catch (readError) {
        context.log(
          `Warning: Failed to read token balance. Error: ${(readError as Error).message}`
        );
        return {
          id: userAddress,
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [
                {
                  type: 'text',
                  text: `Could not verify your ${tokenName} balance due to a network error.`,
                },
              ],
            },
          },
        };
      }

      context.log(`Executing supply via MCP for ${amount} ${tokenName}`);
      const toolResult = await context.mcpClient.callTool({
        name: 'supply',
        arguments: {
          tokenAddress: tokenInfo.address,
          tokenChainId: tokenInfo.chainId,
          amount: atomicAmount.toString(),
          userAddress: context.userAddress,
        },
      });

      context.log('MCP supply tool response:', toolResult);

      let validatedTxPlan: TransactionRequest[] = [];
      try {
        const parsedData = parseToolResponse(toolResult, context, 'supply');
        validatedTxPlan = validateTransactions('supply', parsedData, context);

        validatedTxPlan = validatedTxPlan.map(tx => ({ ...tx, chainId: tx.chainId ?? txChainId }));
        context.log(`Processed ${validatedTxPlan.length} transactions from MCP for supply.`);

        if (validatedTxPlan.length === 0) {
          throw new Error('MCP tool returned an empty transaction plan.');
        }
      } catch (error) {
        context.log(`Error processing MCP supply response:`, error);
        return {
          id: userAddress,
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [
                {
                  type: 'text',
                  text: `Failed to get valid supply plan: ${(error as Error).message}`,
                },
              ],
            },
          },
        };
      }

      const finalTxPlan = validatedTxPlan;
      const txPreview: LendingPreview = {
        tokenName: tokenName,
        amount: amount,
        action: 'supply',
        chainId: txChainId,
      };

      try {
        const executedPlan = await context.executeAction('supply', finalTxPlan);
        context.log('Supply transaction plan executed (or prepared for signing):', executedPlan);

        return {
          id: userAddress,
          status: {
            state: 'completed',
            message: {
              role: 'agent',
              parts: [
                {
                  type: 'text',
                  text: `Supply transaction plan created for ${amount} ${tokenName}. Ready to sign.`,
                },
              ],
            },
          },
          artifacts: [
            {
              name: 'transaction-plan',
              parts: [
                {
                  type: 'data',
                  data: { txPreview: txPreview, txPlan: executedPlan } as TransactionArtifact,
                },
              ],
            },
          ],
        };
      } catch (error) {
        context.log(`Error during supply action execution:`, error);
        return {
          id: userAddress,
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [
                {
                  type: 'text',
                  text: `Failed to execute supply transaction plan: ${(error as Error).message}`,
                },
              ],
            },
          },
        };
      }
    }
  }
}

export async function handleWithdraw(
  params: { tokenName: string; amount: string },
  context: HandlerContext
): Promise<Task> {
  const { tokenName: rawTokenName, amount } = params;
  const tokenName = rawTokenName.toUpperCase();

  if (!context.userAddress) {
    throw new Error('User address not set!');
  }

  const findResult = findTokenInfo(context.tokenMap, rawTokenName);

  switch (findResult.type) {
    case 'notFound':
      return {
        id: context.userAddress,
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [
              { type: 'text', text: `Token '${rawTokenName}' not supported for withdrawing.` },
            ],
          },
        },
      };

    case 'clarificationNeeded':
      const chainList = findResult.options
        .map((t: TokenInfo, idx: number) => `${idx + 1}. Chain ID: ${t.chainId}`)
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
                text: `Multiple chains found for ${rawTokenName}:\n${chainList}\nPlease specify the chain.`,
              },
            ],
          },
        },
      };

    case 'found': {
      const tokenDetail = findResult.token;
      context.log(
        `Preparing withdraw transaction: ${amount} ${tokenName} (${tokenDetail.address} on chain ${tokenDetail.chainId})`
      );

      const toolResult = await context.mcpClient.callTool({
        name: 'withdraw',
        arguments: {
          tokenAddress: tokenDetail.address,
          tokenChainId: tokenDetail.chainId,
          amount: amount,
          userAddress: context.userAddress,
        },
      });

      context.log('MCP withdraw tool response:', toolResult);

      try {
        const validatedTxPlan = await validateAndExecuteAction('withdraw', toolResult, context);
        context.log('Withdraw transaction plan validated and executed:', validatedTxPlan);

        const txPreview: LendingPreview = {
          tokenName: tokenName,
          amount: amount,
          action: 'withdraw',
          chainId: tokenDetail.chainId,
        };

        return {
          id: context.userAddress,
          status: {
            state: 'completed',
            message: {
              role: 'agent',
              parts: [
                {
                  type: 'text',
                  text: `Withdraw transaction plan created for ${amount} ${tokenName}. Ready to sign.`,
                },
              ],
            },
          },
          artifacts: [
            {
              name: 'transaction-plan',
              parts: [
                {
                  type: 'data',
                  data: {
                    txPreview: txPreview,
                    txPlan: validatedTxPlan,
                  } as TransactionArtifact,
                },
              ],
            },
          ],
        };
      } catch (error) {
        context.log(`Error during withdraw action validation/execution:`, error);
        return {
          id: context.userAddress,
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [
                {
                  type: 'text',
                  text: `Failed to create withdraw transaction plan: ${(error as Error).message}`,
                },
              ],
            },
          },
        };
      }
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

    const validationResult = ZodGetWalletPositionsResponseSchema.safeParse(parsedData);

    if (!validationResult.success) {
      context.log('Get User Positions validation failed:', validationResult.error);
      throw Error(`Validation failed: ${JSON.stringify(parsedData)}`);
    }

    const validatedPositions = validationResult.data;

    return {
      id: context.userAddress,
      status: {
        state: 'completed',
      },
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

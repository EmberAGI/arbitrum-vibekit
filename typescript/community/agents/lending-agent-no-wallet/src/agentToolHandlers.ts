import {
  BorrowResponseSchema,
  RepayResponseSchema,
  SupplyResponseSchema,
  WithdrawResponseSchema,
  GetWalletLendingPositionsResponseSchema,
  type TokenInfo,
  type LendingTransactionArtifact,
} from '@emberai/arbitrum-vibekit-core/ember-schemas';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { LanguageModelV1 } from 'ai';
import type { Task } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import { TaskState } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import { streamText } from 'ai';
import { parseMcpToolResponsePayload } from '@emberai/arbitrum-vibekit-core';
import { parseUnits } from 'viem';

export interface HandlerContext {
  mcpClient: Client;
  tokenMap: Record<string, Array<TokenInfo>>;
  userAddress: string | undefined;
  log: (...args: unknown[]) => void;
  quicknodeSubdomain: string;
  quicknodeApiKey: string;
  openRouterApiKey: string;
  aaveContextContent: string;
  provider: (model?: string) => LanguageModelV1;
}

export type FindTokenResult =
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

  // Deduplicate by chainId + address to avoid redundant duplicates
  const uniqueTokens: TokenInfo[] = [];
  const seen = new Set<string>();
  for (const t of possibleTokens) {
    const key = `${t.chainId.toString().toLowerCase()}-${t.address.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueTokens.push(t);
    }
  }

  if (uniqueTokens.length === 1) {
    return { type: 'found', token: uniqueTokens[0]! };
  }

  // If all unique tokens share the same chainId, automatically select first
  const firstChainId = uniqueTokens[0]!.chainId;
  const allSameChain = uniqueTokens.every(t => t.chainId === firstChainId);
  if (allSameChain) {
    return { type: 'found', token: uniqueTokens[0]! };
  }

  return { type: 'clarificationNeeded', options: uniqueTokens };
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
        contextId: `borrow-failed-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Failed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [{ kind: 'text', text: `Token ${rawTokenName} not supported for borrowing.` }],
          },
        },
      };

    case 'clarificationNeeded': {
      context.log(`Borrow requires clarification for token ${rawTokenName}.`);
      const optionsText = findResult.options
        .map(opt => `- ${rawTokenName} on chain ${opt.chainId}`)
        .join('\n');
      return {
        id: context.userAddress,
        contextId: `borrow-clarification-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.InputRequired,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [
              {
                kind: 'text',
                text: `Which ${rawTokenName} do you want to borrow? Please specify the chain:\n${optionsText}`,
              },
            ],
          },
        },
      };
    }

    case 'found': {
      const tokenDetail = findResult.token;
      context.log(
        `Preparing borrow transaction: ${rawTokenName} (Chain: ${tokenDetail.chainId}, Addr: ${tokenDetail.address}), amount: ${amount}`
      );

      try {
        // Convert human-readable amount to atomic units
        const atomicAmount = parseUnits(amount, tokenDetail.decimals);

        const rawResult = await context.mcpClient.callTool({
          name: 'lendingBorrow',
          arguments: {
            tokenUid: {
              chainId: tokenDetail.chainId,
              address: tokenDetail.address,
            },
            amount: atomicAmount.toString(),
            walletAddress: context.userAddress,
          },
        });

        const borrowResp = parseMcpToolResponsePayload(rawResult, BorrowResponseSchema);
        const { transactions, currentBorrowApy, liquidationThreshold } = borrowResp;

        // Build artifact using shared generic schema
        const txArtifact: LendingTransactionArtifact = {
          txPreview: {
            tokenName,
            amount,
            action: 'borrow',
            chainId: tokenDetail.chainId,
            currentBorrowApy,
            liquidationThreshold,
          },
          txPlan: transactions,
        };

        return {
          id: context.userAddress,
          contextId: `borrow-success-${Date.now()}`,
          kind: 'task',
          status: {
            state: TaskState.Completed,
            message: {
              role: 'agent',
              messageId: `msg-${Date.now()}`,
              kind: 'message',
              parts: [
                { kind: 'text', text: 'Transaction plan successfully created. Ready to sign.' },
              ],
            },
          },
          artifacts: [
            {
              artifactId: `borrow-transaction-${Date.now()}`,
              name: 'transaction-plan',
              parts: [{ kind: 'data', data: txArtifact }],
            },
          ],
        };
      } catch (error) {
        context.log(`Error during borrow execution for ${rawTokenName}:`, error);
        return {
          id: context.userAddress,
          contextId: `borrow-error-${Date.now()}`,
          kind: 'task',
          status: {
            state: TaskState.Failed,
            message: {
              role: 'agent',
              messageId: `msg-${Date.now()}`,
              kind: 'message',
              parts: [{ kind: 'text', text: `Borrow Error: ${(error as Error).message}` }],
            },
          },
        };
      }
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
        contextId: `repay-failed-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Failed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [{ kind: 'text', text: `Token ${rawTokenName} not supported for repay.` }],
          },
        },
      };

    case 'clarificationNeeded': {
      const optionsText = findResult.options
        .map(opt => `- ${rawTokenName} on chain ${opt.chainId}`)
        .join('\n');
      return {
        id: context.userAddress,
        contextId: `repay-clarification-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.InputRequired,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [
              {
                kind: 'text',
                text: `Which ${rawTokenName} do you want to repay? Please specify the chain:\n${optionsText}`,
              },
            ],
          },
        },
      };
    }

    case 'found': {
      const tokenDetail = findResult.token;
      context.log(
        `Preparing repay transaction: ${rawTokenName} (Chain: ${tokenDetail.chainId}, Addr: ${tokenDetail.address}), amount: ${amount}`
      );

      try {
        // Convert human-readable amount to atomic units
        const atomicAmount = parseUnits(amount, tokenDetail.decimals);

        const rawResult = await context.mcpClient.callTool({
          name: 'lendingRepay',
          arguments: {
            tokenUid: {
              chainId: tokenDetail.chainId,
              address: tokenDetail.address,
            },
            amount: atomicAmount.toString(),
            walletAddress: context.userAddress,
          },
        });

        const repayResp = parseMcpToolResponsePayload(rawResult, RepayResponseSchema);
        const { transactions } = repayResp;

        // Build artifact using shared generic schema
        const txArtifact: LendingTransactionArtifact = {
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
          contextId: `repay-success-${Date.now()}`,
          kind: 'task',
          status: {
            state: TaskState.Completed,
            message: {
              role: 'agent',
              messageId: `msg-${Date.now()}`,
              kind: 'message',
              parts: [
                { kind: 'text', text: 'Transaction plan successfully created. Ready to sign.' },
              ],
            },
          },
          artifacts: [
            {
              artifactId: `repay-transaction-${Date.now()}`,
              name: 'transaction-plan',
              parts: [{ kind: 'data', data: txArtifact }],
            },
          ],
        };
      } catch (error) {
        context.log(`Error during repay execution for ${rawTokenName}:`, error);
        return {
          id: context.userAddress,
          contextId: `repay-error-${Date.now()}`,
          kind: 'task',
          status: {
            state: TaskState.Failed,
            message: {
              role: 'agent',
              messageId: `msg-${Date.now()}`,
              kind: 'message',
              parts: [{ kind: 'text', text: `Repay Error: ${(error as Error).message}` }],
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
        contextId: `supply-failed-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Failed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [{ kind: 'text', text: `Token ${rawTokenName} not supported for supply.` }],
          },
        },
      };

    case 'clarificationNeeded': {
      const optionsText = findResult.options
        .map(opt => `- ${rawTokenName} on chain ${opt.chainId}`)
        .join('\n');
      return {
        id: context.userAddress,
        contextId: `supply-clarification-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.InputRequired,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [
              {
                kind: 'text',
                text: `Which ${rawTokenName} do you want to supply? Please specify the chain:\n${optionsText}`,
              },
            ],
          },
        },
      };
    }

    case 'found': {
      const tokenDetail = findResult.token;
      context.log(
        `Preparing supply transaction: ${rawTokenName} (Chain: ${tokenDetail.chainId}, Addr: ${tokenDetail.address}), amount: ${amount}`
      );

      try {
        // Convert human-readable amount to atomic units
        const atomicAmount = parseUnits(amount, tokenDetail.decimals);

        const rawResult = await context.mcpClient.callTool({
          name: 'lendingSupply',
          arguments: {
            tokenUid: {
              chainId: tokenDetail.chainId,
              address: tokenDetail.address,
            },
            amount: atomicAmount.toString(),
            walletAddress: context.userAddress,
          },
        });

        const supplyResp = parseMcpToolResponsePayload(rawResult, SupplyResponseSchema);
        const { transactions } = supplyResp;

        // Build artifact using shared generic schema
        const txArtifact: LendingTransactionArtifact = {
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
          contextId: `supply-success-${Date.now()}`,
          kind: 'task',
          status: {
            state: TaskState.Completed,
            message: {
              role: 'agent',
              messageId: `msg-${Date.now()}`,
              kind: 'message',
              parts: [
                { kind: 'text', text: 'Transaction plan successfully created. Ready to sign.' },
              ],
            },
          },
          artifacts: [
            {
              artifactId: `supply-transaction-${Date.now()}`,
              name: 'transaction-plan',
              parts: [{ kind: 'data', data: txArtifact }],
            },
          ],
        };
      } catch (error) {
        context.log(`Error during supply execution for ${rawTokenName}:`, error);
        return {
          id: context.userAddress,
          contextId: `supply-error-${Date.now()}`,
          kind: 'task',
          status: {
            state: TaskState.Failed,
            message: {
              role: 'agent',
              messageId: `msg-${Date.now()}`,
              kind: 'message',
              parts: [{ kind: 'text', text: `Supply Error: ${(error as Error).message}` }],
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
        contextId: `withdraw-failed-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Failed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [{ kind: 'text', text: `Token ${rawTokenName} not supported for withdraw.` }],
          },
        },
      };

    case 'clarificationNeeded': {
      const optionsText = findResult.options
        .map(opt => `- ${rawTokenName} on chain ${opt.chainId}`)
        .join('\n');
      return {
        id: context.userAddress,
        contextId: `withdraw-clarification-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.InputRequired,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [
              {
                kind: 'text',
                text: `Which ${rawTokenName} do you want to withdraw? Please specify the chain:\n${optionsText}`,
              },
            ],
          },
        },
      };
    }

    case 'found': {
      const tokenDetail = findResult.token;
      context.log(
        `Preparing withdraw transaction: ${rawTokenName} (Chain: ${tokenDetail.chainId}, Addr: ${tokenDetail.address}), amount: ${amount}`
      );

      try {
        // Convert human-readable amount to atomic units
        const atomicAmount = parseUnits(amount, tokenDetail.decimals);

        const rawResult = await context.mcpClient.callTool({
          name: 'lendingWithdraw',
          arguments: {
            tokenUid: {
              chainId: tokenDetail.chainId,
              address: tokenDetail.address,
            },
            amount: atomicAmount.toString(),
            walletAddress: context.userAddress,
          },
        });

        const withdrawResp = parseMcpToolResponsePayload(rawResult, WithdrawResponseSchema);
        const { transactions } = withdrawResp;

        // Build artifact using shared generic schema
        const txArtifact: LendingTransactionArtifact = {
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
          contextId: `withdraw-success-${Date.now()}`,
          kind: 'task',
          status: {
            state: TaskState.Completed,
            message: {
              role: 'agent',
              messageId: `msg-${Date.now()}`,
              kind: 'message',
              parts: [
                { kind: 'text', text: 'Transaction plan successfully created. Ready to sign.' },
              ],
            },
          },
          artifacts: [
            {
              artifactId: `withdraw-transaction-${Date.now()}`,
              name: 'transaction-plan',
              parts: [{ kind: 'data', data: txArtifact }],
            },
          ],
        };
      } catch (error) {
        context.log(`Error during withdraw execution for ${rawTokenName}:`, error);
        return {
          id: context.userAddress,
          contextId: `withdraw-error-${Date.now()}`,
          kind: 'task',
          status: {
            state: TaskState.Failed,
            message: {
              role: 'agent',
              messageId: `msg-${Date.now()}`,
              kind: 'message',
              parts: [{ kind: 'text', text: `Withdraw Error: ${(error as Error).message}` }],
            },
          },
        };
      }
    }
  }
}

export async function handleGetWalletLendingPositions(
  _params: Record<string, never>,
  context: HandlerContext
): Promise<Task> {
  if (!context.userAddress) {
    throw new Error('User address not set!');
  }

  try {
    const rawResult = await context.mcpClient.callTool({
      name: 'getWalletLendingPositions',
      arguments: {
        walletAddress: context.userAddress,
      },
    });

    console.log('rawResult', rawResult);

    const validatedPositions = parseMcpToolResponsePayload(
      rawResult,
      GetWalletLendingPositionsResponseSchema
    );

    return {
      id: context.userAddress,
      contextId: `positions-success-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Completed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [{ kind: 'text', text: 'Positions fetched successfully.' }],
        },
      },
      artifacts: [
        {
          artifactId: `positions-${Date.now()}`,
          name: 'wallet-positions',
          parts: [{ kind: 'data', data: validatedPositions }],
        },
      ],
    };
  } catch (error) {
    return {
      id: context.userAddress,
      contextId: `positions-error-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Failed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [{ kind: 'text', text: `Error fetching positions: ${(error as Error).message}` }],
        },
      },
    };
  }
}

export async function handleAskEncyclopedia(
  params: { question: string },
  context: HandlerContext
): Promise<Task> {
  const { question } = params;
  const { userAddress, openRouterApiKey, log, aaveContextContent } = context;

  if (!userAddress) {
    throw new Error('User address not set!');
  }
  if (!openRouterApiKey) {
    log('Error: OpenRouter API key is not configured in HandlerContext.');
    return {
      id: userAddress,
      contextId: `encyclopedia-config-error-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Failed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [
            {
              kind: 'text',
              text: 'The Aave expert tool is not configured correctly (Missing API Key). Please contact support.',
            },
          ],
        },
      },
    };
  }

  log(`Handling askEncyclopedia for user ${userAddress} with question: "${question}"`);

  try {
    if (!aaveContextContent.trim()) {
      log('Error: Aave context documentation provided by the agent is empty.');
      return {
        id: userAddress,
        contextId: `encyclopedia-content-error-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Failed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [
              {
                kind: 'text',
                text: 'Could not load the necessary Aave documentation to answer your question.',
              },
            ],
          },
        },
      };
    }

    const systemPrompt = `You are an Aave protocol expert. The following information is your own knowledge and expertise - do not refer to it as provided, given, or external information. Speak confidently in the first person as the expert you are.

Do not say phrases like "Based on my knowledge" or "According to the information". Instead, simply state the facts directly as an expert would.

If you don't know something, simply say "I don't know" or "I don't have information about that" without apologizing or referring to limited information.

${aaveContextContent}`;

    log('Calling AI model...');
    const { textStream } = await streamText({
      model: context.provider(),
      system: systemPrompt,
      prompt: question,
    });

    let responseText = '';
    for await (const textPart of textStream) {
      responseText += textPart;
    }

    log(`Received response from OpenRouter: ${responseText}`);

    return {
      id: userAddress,
      contextId: `encyclopedia-success-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Completed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [{ kind: 'text', text: responseText }],
        },
      },
    };
  } catch (error: unknown) {
    log(`Error during askEncyclopedia execution:`, error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return {
      id: userAddress,
      contextId: `encyclopedia-error-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Failed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [{ kind: 'text', text: `Error asking Aave expert: ${errorMessage}` }],
        },
      },
    };
  }
}

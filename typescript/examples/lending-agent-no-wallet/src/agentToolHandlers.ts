import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Task, DataPart } from 'a2a-samples-js';
import {
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
  type Address,
  type PublicClient,
} from 'viem';
import Erc20Abi from '@openzeppelin/contracts/build/contracts/ERC20.json' with { type: 'json' };
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText } from 'ai';
import { parseMcpToolResponsePayload } from 'arbitrum-vibekit-core';
import {
  SupplyTokensResponseSchema,
  type SupplyTokensResponse,
  WithdrawTokensResponseSchema,
  type WithdrawTokensResponse,
  BorrowTokensResponseSchema,
  type BorrowTokensResponse,
  RepayTokensResponseSchema,
  type RepayTokensResponse,
  GetWalletPositionsResponseSchema,
  type GetWalletPositionsResponse,
  TokenSchema as EmberTokenSchema,
  type TransactionPlan,
} from 'ember-schemas';
import { getChainConfigById } from './agent.js';
import { z } from 'zod';

export interface HandlerContext {
  mcpClient: Client;
  tokenMap: Record<string, Array<TokenInfo>>;
  userAddress: string | undefined;
  log: (...args: unknown[]) => void;
  quicknodeSubdomain: string;
  quicknodeApiKey: string;
  openRouterApiKey: string;
  aaveContextContent: string;
}

export type TokenInfo = z.infer<typeof EmberTokenSchema>;

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

  if (possibleTokens.length === 1) {
    return { type: 'found', token: possibleTokens[0]! };
  }

  return { type: 'clarificationNeeded', options: possibleTokens };
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

    case 'clarificationNeeded': {
      context.log(`Borrow requires clarification for token ${rawTokenName}.`);
      const optionsText = findResult.options
        .map(opt => `- ${rawTokenName} on chain ${opt.tokenUid.chainId}`)
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
    }

    case 'found': {
      const tokenDetail = findResult.token;
      context.log(
        `Preparing borrow transaction: ${amount} ${tokenDetail.name} on chain ${tokenDetail.tokenUid.chainId}`
      );

      try {
        const rawResult = await context.mcpClient.callTool({
          name: 'borrow',
          arguments: {
            tokenUid: {
              address: tokenDetail.tokenUid.address,
              chainId: tokenDetail.tokenUid.chainId,
            },
            amount,
            borrowerWalletAddress: context.userAddress,
          },
        });

        const borrowResp = parseMcpToolResponsePayload(
          rawResult,
          BorrowTokensResponseSchema
        ) as BorrowTokensResponse;
        const { transactions, currentBorrowApy, liquidationThreshold } = borrowResp;

        // Build artifact using shared generic schema
        const txArtifact = {
          txPreview: {
            tokenName,
            amount,
            action: 'borrow',
            chainId: tokenDetail.tokenUid.chainId,
            currentBorrowApy,
            liquidationThreshold,
          },
          txPlan: transactions,
        };
        const dataPart: DataPart = { type: 'data', data: txArtifact };

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
              parts: [dataPart],
            },
          ],
        };
      } catch (error) {
        context.log(`Error during borrow execution for ${rawTokenName}:`, JSON.stringify(error, null, 2));
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

    case 'clarificationNeeded': {
      const chainList = findResult.options
        .map((t: TokenInfo, idx: number) => `${idx + 1}. Chain ID: ${t.tokenUid.chainId}`)
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
    }

    case 'found': {
      const tokenInfo = findResult.token;
      const userAddress = context.userAddress as Address;
      const tokenAddress = tokenInfo.tokenUid.address as Address;
      const txChainId = tokenInfo.tokenUid.chainId;
      let atomicAmount: bigint;
      try {
        atomicAmount = parseUnits(amount, tokenInfo.decimals);
      } catch (_e) {
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
        context.log(`Failed to create public client for chain ${txChainId}:`, JSON.stringify(chainError, null, 2));
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
          `Warning: Failed to read token balance. Error:`, JSON.stringify(readError, null, 2)
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
          tokenUid: {
            address: tokenInfo.tokenUid.address,
            chainId: tokenInfo.tokenUid.chainId,
          },
          amount,
          borrowerWalletAddress: context.userAddress!,
        },
      });

      context.log('MCP repay tool response:', JSON.stringify(toolResult, null, 2));

      // Parse and validate the MCP repay tool response using the new ZodRepayResponseSchema
      const repayResp = parseMcpToolResponsePayload(
        toolResult,
        RepayTokensResponseSchema
      ) as RepayTokensResponse;
      const { transactions } = repayResp;
      context.log(`Processed and validated ${transactions.length} transactions for repay.`);

      // Build preview and artifact
      const txPreview = {
        tokenName,
        amount,
        action: 'repay',
        chainId: tokenInfo.tokenUid.chainId,
      };
      const artifactContent = { txPreview, txPlan: transactions };
      const dataPart: DataPart = { type: 'data', data: artifactContent };

      // Return Task with standard artifact
      return {
        id: userAddress,
        status: {
          state: 'completed',
          message: {
            role: 'agent',
            parts: [
              { type: 'text', text: `Repay transaction plan ready (${transactions.length} txs).` },
            ],
          },
        },
        artifacts: [{ name: 'transaction-plan', parts: [dataPart] }],
      };
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

    case 'clarificationNeeded': {
      const chainList = findResult.options
        .map((t: TokenInfo, idx: number) => `${idx + 1}. Chain ID: ${t.tokenUid.chainId}`)
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
    }

    case 'found': {
      const tokenInfo = findResult.token;
      const userAddress = context.userAddress as Address;
      const tokenAddress = tokenInfo.tokenUid.address as Address;
      const txChainId = tokenInfo.tokenUid.chainId;
      let atomicAmount: bigint;
      try {
        atomicAmount = parseUnits(amount, tokenInfo.decimals);
      } catch (_e) {
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
        context.log(`Failed to create public client for chain ${txChainId}:`, JSON.stringify(chainError, null, 2));
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
          `Warning: Failed to read token balance. Error:`, JSON.stringify(readError, null, 2)
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
          tokenUid: {
            address: tokenInfo.tokenUid.address,
            chainId: tokenInfo.tokenUid.chainId,
          },
          amount: amount,
          supplierWalletAddress: context.userAddress,
        },
      });

      context.log('MCP supply tool response:', JSON.stringify(toolResult, null, 2));

      let finalTxPlan: TransactionPlan[] = [];
      try {
        const supplyResp = parseMcpToolResponsePayload(
          toolResult,
          SupplyTokensResponseSchema
        ) as SupplyTokensResponse;
        finalTxPlan = supplyResp.transactions;
        context.log(
          `Processed and validated ${finalTxPlan.length} transactions from MCP for supply.`
        );
        if (finalTxPlan.length === 0) {
          throw new Error('MCP tool returned an empty transaction plan.');
        }
      } catch (error) {
        context.log(`Error processing MCP supply response:`, JSON.stringify(error, null, 2));
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

      const txPreview = {
        tokenName: tokenName,
        amount: amount,
        action: 'supply',
        chainId: txChainId,
      };

      try {
        context.log('Supply transaction plan prepared:', JSON.stringify(finalTxPlan, null, 2));

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
                  data: { txPreview, txPlan: finalTxPlan },
                },
              ],
            },
          ],
        };
      } catch (error) {
        context.log(`Error during supply action execution:`, JSON.stringify(error, null, 2));
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

    case 'clarificationNeeded': {
      const chainList = findResult.options
        .map((t: TokenInfo, idx: number) => `${idx + 1}. Chain ID: ${t.tokenUid.chainId}`)
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
    }

    case 'found': {
      const tokenDetail = findResult.token;
      context.log(
        `Preparing withdraw transaction: ${amount} ${tokenName} (${tokenDetail.tokenUid.address} on chain ${tokenDetail.tokenUid.chainId})`
      );

      const toolResult = await context.mcpClient.callTool({
        name: 'withdraw',
        arguments: {
          tokenUid: {
            address: tokenDetail.tokenUid.address,
            chainId: tokenDetail.tokenUid.chainId,
          },
          amount: amount,
          lenderWalletAddress: context.userAddress,
        },
      });

      context.log('MCP withdraw tool response:', JSON.stringify(toolResult, null, 2));

      try {
        const withdrawResp = parseMcpToolResponsePayload(
          toolResult,
          WithdrawTokensResponseSchema
        ) as WithdrawTokensResponse;
        const validatedTxPlan: TransactionPlan[] = withdrawResp.transactions;
        context.log('Withdraw transaction plan validated:', JSON.stringify(validatedTxPlan, null, 2));

        const txPreview = {
          tokenName: tokenName,
          amount: amount,
          action: 'withdraw',
          chainId: tokenDetail.tokenUid.chainId,
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
                  data: { txPreview, txPlan: validatedTxPlan },
                },
              ],
            },
          ],
        };
      } catch (error) {
        context.log(`Error during withdraw action validation/execution:`, JSON.stringify(error, null, 2));
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
        walletAddress: context.userAddress,
      },
    });

    console.log('rawResult', JSON.stringify(rawResult, null, 2));

    const validatedPositions = parseMcpToolResponsePayload(
      rawResult,
      GetWalletPositionsResponseSchema
    ) as GetWalletPositionsResponse;

    return {
      id: context.userAddress,
      status: {
        state: 'completed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: 'Positions fetched successfully.' }],
        },
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
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
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
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: 'Could not load the necessary Aave documentation to answer your question.',
              },
            ],
          },
        },
      };
    }

    const openrouter = createOpenRouter({
      apiKey: openRouterApiKey,
    });

    const systemPrompt = `You are an Aave protocol expert. The following information is your own knowledge and expertise - do not refer to it as provided, given, or external information. Speak confidently in the first person as the expert you are.

Do not say phrases like "Based on my knowledge" or "According to the information". Instead, simply state the facts directly as an expert would.

If you don't know something, simply say "I don't know" or "I don't have information about that" without apologizing or referring to limited information.

${aaveContextContent}`;

    log(`Calling OpenRouter model...`);
    const { textStream } = await streamText({
      model: openrouter('google/gemini-2.5-flash-preview'),
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
      status: {
        state: 'completed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: responseText }],
        },
      },
    };
  } catch (error: unknown) {
    log(`Error during askEncyclopedia execution:`, JSON.stringify(error, null, 2));
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return {
      id: userAddress,
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: `Error asking Aave expert: ${errorMessage}` }],
        },
      },
    };
  }
} 
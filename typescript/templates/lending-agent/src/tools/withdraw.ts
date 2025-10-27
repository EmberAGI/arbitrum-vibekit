import type { VibkitToolDefinition } from '@emberai/arbitrum-vibekit-core';
import { parseMcpToolResponsePayload } from '@emberai/arbitrum-vibekit-core';
import type { Task } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import { TaskState } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import type { LendingAgentContext } from '../agent.js';
import { BorrowRepaySupplyWithdrawSchema, WithdrawResponseSchema } from '@emberai/arbitrum-vibekit-core/ember-schemas';
import type { LendingPreview, TokenInfo } from './types.js';
import { createTaskId, findTokenInfo } from './utils.js';
import type { TransactionPlan } from '@emberai/arbitrum-vibekit-core/ember-schemas';

export const withdrawBase: VibkitToolDefinition<
  typeof BorrowRepaySupplyWithdrawSchema,
  any, // TResult is the raw MCP response
  LendingAgentContext
> = {
  name: 'withdraw-base',
  description: '(Base) Withdraws a supplied token after validation. Expects resolvedToken in args.',
  parameters: BorrowRepaySupplyWithdrawSchema,
  execute: async (args, context) => {
    if (!context.mcpClients?.['ember-mcp-tool-server']) {
      throw new Error('MCP client not available');
    }

    const { tokenName: rawTokenName, amount } = args;
    const tokenName = rawTokenName.toUpperCase();

    // Find token info
    const findResult = findTokenInfo(context.custom.tokenMap, rawTokenName);

    switch (findResult.type) {
      case 'notFound':
        return {
          id: createTaskId(),
          contextId: `${rawTokenName}-not-found-${Date.now()}`,
          kind: 'task' as const,
          status: {
            state: TaskState.Failed,
            message: {
              role: 'agent',
              parts: [{ type: 'text', text: `Token '${rawTokenName}' not supported.` }],
            },
          },
        } as unknown as Task;

      case 'clarificationNeeded':
        const chainList = findResult.options
          .map((t: TokenInfo, idx: number) => `${idx + 1}. Chain ID: ${t.chainId}`)
          .join('\n');
        return {
          id: createTaskId(),
          contextId: `${rawTokenName}-clarification-${Date.now()}`,
          kind: 'task' as const,
          status: {
            state: TaskState.InputRequired,
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
        } as unknown as Task;

      case 'found':
        const tokenDetail = findResult.token;

        try {
          const toolResult = await context.mcpClients['ember-mcp-tool-server'].callTool({
            name: 'withdraw',
            arguments: {
              tokenAddress: tokenDetail.address,
              tokenChainId: tokenDetail.chainId,
              amount: amount,
              userAddress: 'placeholder', // TODO: Get from context
            },
          });

          // Parse and validate the MCP response
          const withdrawResp = parseMcpToolResponsePayload(toolResult, WithdrawResponseSchema) as any;
          const validatedTxPlan: TransactionPlan[] = withdrawResp.transactions;

          const txPreview: LendingPreview = {
            tokenName: tokenName,
            amount: amount,
            action: 'withdraw',
            chainId: tokenDetail.chainId,
          };

          return {
            id: createTaskId(),
            contextId: `withdraw-${tokenName}-${Date.now()}`,
            kind: 'task' as const,
            status: {
              state: TaskState.Completed,
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
                    kind: 'data' as const,
                    data: { txPreview, txPlan: validatedTxPlan } as Record<string, unknown>,
                  },
                ],
              },
            ],
          } as unknown as Task;
        } catch (error) {
          return {
            id: createTaskId(),
            contextId: `withdraw-error-${Date.now()}`,
            kind: 'task' as const,
            status: {
              state: TaskState.Failed,
              message: {
                role: 'agent',
                parts: [
                  {
                    type: 'text',
                    text: `Failed to get valid withdraw plan: ${(error as Error).message}`,
                  },
                ],
              },
            },
          } as unknown as Task;
        }
    }
  },
};

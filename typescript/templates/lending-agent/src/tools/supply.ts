import type { VibkitToolDefinition } from '@emberai/arbitrum-vibekit-core';
import { parseMcpToolResponsePayload } from '@emberai/arbitrum-vibekit-core';
import type { Task } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import { TaskState } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import type { LendingAgentContext } from '../agent.js';
import { BorrowRepaySupplyWithdrawSchema, SupplyResponseSchema } from '@emberai/arbitrum-vibekit-core/ember-schemas';
import type { LendingPreview, TokenInfo } from './types.js';
import { createTaskId, findTokenInfo } from './utils.js';

export const supplyBase: VibkitToolDefinition<
  typeof BorrowRepaySupplyWithdrawSchema,
  any, // TResult is the raw MCP response
  LendingAgentContext
> = {
  name: 'supply-base',
  description: '(Base) Supplies a token after validation. Expects resolvedToken in args.',
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
        const tokenInfo = findResult.token;

        try {
          // TODO: Balance checking could be added here if needed

          const toolResult = await context.mcpClients['ember-mcp-tool-server'].callTool({
            name: 'supply',
            arguments: {
              tokenAddress: tokenInfo.address,
              tokenChainId: tokenInfo.chainId,
              amount: amount,
              userAddress: 'placeholder', // TODO: Get from context
            },
          });

          // Parse and validate the MCP response
          const supplyResp = parseMcpToolResponsePayload(toolResult, SupplyResponseSchema) as any;
          const finalTxPlan = supplyResp.transactions;

          if (finalTxPlan.length === 0) {
            throw new Error('MCP tool returned an empty transaction plan.');
          }

          const txPreview: LendingPreview = {
            tokenName: tokenName,
            amount: amount,
            action: 'supply',
            chainId: tokenInfo.chainId,
          };

          return {
            id: createTaskId(),
            contextId: `supply-${tokenName}-${Date.now()}`,
            kind: 'task' as const,
            status: {
              state: TaskState.Completed,
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
                    kind: 'data' as const,
                    data: { txPreview, txPlan: finalTxPlan } as Record<string, unknown>,
                  },
                ],
              },
            ],
          } as unknown as Task;
        } catch (error) {
          return {
            id: createTaskId(),
            contextId: `supply-error-${Date.now()}`,
            kind: 'task' as const,
            status: {
              state: TaskState.Failed,
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
          } as unknown as Task;
        }
    }
  },
};

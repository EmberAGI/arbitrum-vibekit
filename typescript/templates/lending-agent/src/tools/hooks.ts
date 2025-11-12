import type { AgentContext } from '@emberai/arbitrum-vibekit-core';
import type { Task, Message, DataPart } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import { TaskState } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import {
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
  type Address,
  type PublicClient,
} from 'viem';
import type { LendingAgentContext } from '../agent.js';
import type { TokenInfo } from './types.js';
import { createTaskId, findTokenInfo, getChainConfigById } from './utils.js';
import { parseMcpToolResponsePayload } from '@emberai/arbitrum-vibekit-core';
import type { z } from 'zod';
import type { LendingTransactionArtifact, LendingPreview } from './types.js';
import type { TransactionPlan } from '@emberai/arbitrum-vibekit-core/ember-schemas';

// Minimal ERC20 ABI for balance check
const MinimalErc20Abi = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
] as const;

/**
 * Arguments for a hook that requires token name resolution.
 */
export interface TokenResolutionHookArgs {
  tokenName: string;
  // Allows for other properties in the args object
  [key: string]: any;
}

/**
 * A 'before' hook to resolve a token name to its on-chain details.
 * If the token is found, it adds `resolvedToken` to the arguments.
 * If not found or needs clarification, it returns a Task to short-circuit execution.
 *
 * @param args The original arguments to the tool, must include `tokenName`.
 * @param context The agent context containing the `tokenMap`.
 * @returns Either modified arguments with `resolvedToken` or a `Task`/`Message` object.
 */
export async function tokenResolutionHook<Args extends TokenResolutionHookArgs, TSkillInput = any>(
  args: Args,
  context: AgentContext<LendingAgentContext, TSkillInput>
): Promise<(Args & { resolvedToken: TokenInfo }) | Task | Message> {
  const { tokenName } = args;
  const findResult = findTokenInfo(context.custom.tokenMap, tokenName);

  switch (findResult.type) {
    case 'notFound':
      return {
        id: createTaskId(),
        contextId: `${tokenName}-not-found-${Date.now()}`,
        kind: 'task' as const,
        status: {
          state: TaskState.Failed,
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: `Token '${tokenName}' not supported.` }],
          },
        },
      } as unknown as Task;

    case 'clarificationNeeded':
      const optionsText = findResult.options
        .map(opt => `- ${tokenName} on chain ${opt.chainId}`)
        .join('\n');
      return {
        id: createTaskId(),
        contextId: `${tokenName}-clarification-${Date.now()}`,
        kind: 'task' as const,
        status: {
          state: TaskState.InputRequired,
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: `Which ${tokenName} do you want to use? Please specify the chain:\n${optionsText}`,
              },
            ],
          },
        },
      } as unknown as Task;

    case 'found':
      return {
        ...args,
        resolvedToken: findResult.token,
      };
  }
}

/**
 * Arguments for a hook that requires balance checking.
 */
export interface BalanceCheckHookArgs {
  resolvedToken: TokenInfo;
  amount: string;
  // Allows for other properties in the args object
  [key: string]: any;
}

/**
 * A 'before' hook to check if the user has sufficient token balance.
 * It expects `resolvedToken` (from tokenResolutionHook) and `amount` in args.
 * It expects `walletAddress` from skillInput, and `quicknodeSubdomain` and `quicknodeApiKey` in custom context.
 *
 * @param args The arguments to the tool, must include `resolvedToken` and `amount`.
 * @param context The agent context containing wallet and QuickNode details.
 * @returns Original arguments if balance is sufficient, or a `Task` object if not or on error.
 */
export async function balanceCheckHook<
  Args extends BalanceCheckHookArgs,
  TSkillInput extends { walletAddress?: string } = any,
>(
  args: Args,
  context: AgentContext<LendingAgentContext, TSkillInput>
): Promise<Args | Task | Message> {
  const { resolvedToken, amount } = args;
  const walletAddress = context.skillInput?.walletAddress;
  const { quicknodeSubdomain, quicknodeApiKey } = context.custom;

  if (!walletAddress) {
    console.error('Balance check hook: Wallet address not found in skill input.');
    return {
      id: createTaskId(),
      contextId: `balance-check-error-wallet-${Date.now()}`,
      kind: 'task' as const,
      status: {
        state: TaskState.Failed,
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: 'Cannot check balance: User wallet address is missing.' }],
        },
      },
    } as unknown as Task;
  }

  if (!quicknodeSubdomain || !quicknodeApiKey) {
    console.error('Balance check hook: QuickNode configuration missing in context.');
    return {
      id: createTaskId(),
      contextId: `balance-check-error-qn-${Date.now()}`,
      kind: 'task' as const,
      status: {
        state: TaskState.Failed,
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: 'Cannot check balance: Blockchain RPC configuration is missing.',
            },
          ],
        },
      },
    } as unknown as Task;
  }

  let atomicAmount: bigint;
  try {
    atomicAmount = parseUnits(amount, resolvedToken.decimals);
  } catch (e) {
    return {
      id: createTaskId(),
      contextId: `balance-check-error-amount-${Date.now()}`,
      kind: 'task' as const,
      status: {
        state: TaskState.Failed,
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: `Invalid amount format for balance check: ${amount}` }],
        },
      },
    } as unknown as Task;
  }

  try {
    const chainConfig = getChainConfigById(resolvedToken.chainId);
    const rpcUrl = chainConfig.quicknodeSegment
      ? `https://${quicknodeSubdomain}.${chainConfig.quicknodeSegment}.quiknode.pro/${quicknodeApiKey}`
      : `https://${quicknodeSubdomain}.quiknode.pro/${quicknodeApiKey}`;

    const publicClient: PublicClient = createPublicClient({
      chain: chainConfig.viemChain,
      transport: http(rpcUrl),
    });

    const currentBalance = (await publicClient.readContract({
      address: resolvedToken.address as Address,
      abi: MinimalErc20Abi,
      functionName: 'balanceOf',
      args: [walletAddress as Address],
    })) as bigint;

    if (currentBalance < atomicAmount) {
      const formattedBalance = formatUnits(currentBalance, resolvedToken.decimals);
      return {
        id: createTaskId(),
        contextId: `balance-insufficient-${Date.now()}`,
        kind: 'task' as const,
        status: {
          state: TaskState.Failed,
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: `Insufficient ${resolvedToken.symbol || 'token'} balance. You need ${amount} but only have ${formattedBalance}.`,
              },
            ],
          },
        },
      } as unknown as Task;
    }

    // Balance is sufficient, pass arguments through
    return args;
  } catch (error) {
    console.error(
      `Balance check hook: Error reading balance for ${resolvedToken.symbol || resolvedToken.address}:`,
      error
    );
    return {
      id: createTaskId(),
      contextId: `balance-check-error-rpc-${Date.now()}`,
      kind: 'task' as const,
      status: {
        state: TaskState.Failed,
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: `Could not verify your ${resolvedToken.symbol || 'token'} balance due to a network error: ${(error as Error).message}`,
            },
          ],
        },
      },
    } as unknown as Task;
  }
}

/**
 * Type for the data returned by an MCP tool that includes transaction plans.
 */
interface McpToolTxResponseData {
  transactions: TransactionPlan[];
  // Allows for other properties like currentBorrowApy, liquidationThreshold, etc.
  [key: string]: any;
}

/**
 * An 'after' hook to parse an MCP tool's response, validate it, and construct an A2A Task.
 *
 * @param mcpResult The raw result from the MCP tool call. For now, type as 'any' due to McpToolResponse import issue.
 * @param context The agent context.
 * @param toolArgs The original arguments passed to the tool (potentially enhanced by before hooks).
 * @param zodSchema The Zod schema to validate the MCP tool's response payload.
 * @param action The lending action type (e.g., 'borrow', 'supply') for the txPreview.
 * @returns A `Task` object representing the outcome.
 */
export async function responseParserHook<
  ParsedResponse extends McpToolTxResponseData,
  TSkillInput = any,
>(
  mcpResult: any,
  _context: AgentContext<LendingAgentContext, TSkillInput>,
  toolArgs: { resolvedToken: TokenInfo; amount: string; tokenName: string; [key: string]: any }, // Args expected after tokenResolutionHook
  zodSchema: z.ZodType<ParsedResponse>,
  action: LendingPreview['action']
): Promise<Task | Message> {
  const { resolvedToken, amount, tokenName } = toolArgs;

  try {
    const parsedPayload = parseMcpToolResponsePayload(mcpResult, zodSchema);
    const { transactions, ...otherPreviewData } = parsedPayload;

    if (!transactions || transactions.length === 0) {
      console.error(
        `Response Parser Hook: MCP tool for action '${action}' returned no transactions.`
      );
      throw new Error('Transaction plan is empty.');
    }

    const txPreview: LendingPreview = {
      tokenName: tokenName.toUpperCase(), // Ensure consistent casing
      amount,
      action,
      chainId: resolvedToken.chainId,
      ...otherPreviewData, // Include any additional fields like APY, LTV from parsedPayload
    };

    const artifact: LendingTransactionArtifact = {
      txPreview,
      txPlan: transactions,
    };

    const dataPart: DataPart = { kind: 'data' as const, data: artifact as any };

    return {
      id: createTaskId(),
      contextId: `${action}-${resolvedToken.address}-${Date.now()}`,
      kind: 'task' as const,
      status: {
        state: TaskState.Completed,
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: `${action.charAt(0).toUpperCase() + action.slice(1)} transaction plan created successfully. Ready to sign.`,
            },
          ],
        },
      },
      artifacts: [
        {
          name: 'transaction-plan',
          parts: [dataPart],
        },
      ],
    } as unknown as Task;
  } catch (error) {
    console.error(
      `Response Parser Hook: Error parsing MCP response for action '${action}':`,
      error
    );
    return {
      id: createTaskId(),
      contextId: `${action}-parse-error-${Date.now()}`,
      kind: 'task' as const,
      status: {
        state: TaskState.Failed,
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: `Failed to process the transaction plan for ${action}: ${(error as Error).message}`,
            },
          ],
        },
      },
    } as unknown as Task;
  }
}

/**
 * Composes multiple 'before' hooks into a single 'before' hook.
 * Execution stops if any hook returns a Task or Message (short-circuits).
 *
 * @param hooks An array of 'before' hook functions.
 * @returns A single 'before' hook function that runs the provided hooks in sequence.
 */
export function composeBeforeHooks<Args extends object, Ctx extends AgentContext<any, any>>(
  ...hooks: Array<(args: Args, context: Ctx) => Promise<Args | Task | Message>>
): (args: Args, context: Ctx) => Promise<Args | Task | Message> {
  return async (args, context) => {
    let currentArgs = args;
    for (const hook of hooks) {
      const result = await hook(currentArgs, context);
      // Check if the hook short-circuited
      if (
        typeof result === 'object' &&
        result !== null &&
        'kind' in result &&
        (result.kind === 'task' || result.kind === 'message')
      ) {
        return result; // Short-circuit
      }
      currentArgs = result as Args; // Otherwise, it's the modified args
    }
    return currentArgs;
  };
}

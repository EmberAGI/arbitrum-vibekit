import type { VibkitToolDefinition } from '@emberai/arbitrum-vibekit-core';
import type { LendingAgentContext } from '../agent.js';
import { BorrowRepaySupplyWithdrawSchema } from '@emberai/arbitrum-vibekit-core/ember-schemas';
import type { TokenInfo } from './types.js';

// This is the "base" tool. It expects token to be resolved already.
// It performs the core MCP call and returns the RAW MCP response.
// The TResult here is `any` because the raw MCP response structure can vary slightly
// or might not be strictly typed before the responseParserHook.
export const borrowBase: VibkitToolDefinition<
  typeof BorrowRepaySupplyWithdrawSchema,
  any, // TResult is the raw MCP response
  LendingAgentContext
> = {
  name: 'borrow-base',
  description: '(Base) Borrows a token after validation. Expects resolvedToken in args.',
  parameters: BorrowRepaySupplyWithdrawSchema,
  execute: async (args, context) => {
    if (!context.mcpClients?.['ember-mcp-tool-server']) {
      // This should ideally be caught by a generic MCP client availability check or hook
      throw new Error('MCP client for ember-mcp-tool-server not available in borrowBase');
    }

    // Before hooks (tokenResolution, balanceCheck) are expected to have run.
    // Thus, args should include resolvedToken and context.custom should have walletAddress.
    // The walletAddress argument for the MCP call itself might come from context or args directly
    // depending on how we structure the final context population vs. LLM args.
    // For now, let's assume walletAddress is also passed in args by a (hypothetical) preceding hook or by the LLM.

    const { amount } = args;
    const resolvedToken = (args as any).resolvedToken as TokenInfo | undefined;
    const walletAddress = context.skillInput?.walletAddress;

    if (!resolvedToken) {
      // This state should ideally be prevented by the tokenResolutionHook short-circuiting.
      // If we reach here, it's an unexpected state.
      throw new Error(
        'borrowBase: resolvedToken is missing. Token resolution hook did not run or failed unexpectedly.'
      );
    }
    if (!walletAddress) {
      // Similar to resolvedToken, this should be ensured by context population or a hook.
      throw new Error('borrowBase: walletAddress is missing from skill input.');
    }

    // Direct call to MCP tool
    const rawResult = await context.mcpClients['ember-mcp-tool-server'].callTool({
      name: 'borrow',
      arguments: {
        tokenAddress: resolvedToken.address,
        tokenChainId: resolvedToken.chainId,
        amount,
        userAddress: walletAddress,
      },
    });

    return rawResult; // Return the raw MCP response
  },
};

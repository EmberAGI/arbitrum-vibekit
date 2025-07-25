import type { SwapResponse, TokenIdentifier } from 'ember-schemas';

/**
 * The request object for the swap action.
 */
export interface SwapActionRequest {
  /**
   * The token identifier for the token being swapped from.
   */
  fromToken: TokenIdentifier;
  /**
   * The token identifier for the token being swapped to.
   */
  toToken: TokenIdentifier;
  /**
   * The amount of the token being swapped from, in human-readable format.
   */
  amount: string;
  /**
   * The wallet address to use for the swap.
   */
  walletAddress?: string;
}

/**
 * Callback function type for the swap action.
 */
export type SwapActionCallback = (request: SwapActionRequest) => Promise<SwapResponse>;

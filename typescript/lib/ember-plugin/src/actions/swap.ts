import type { SwapTokensRequest, SwapTokensResponse } from 'ember-schemas';

/**
 * Callback function type for the swap action.
 */
export type SwapActionCallback = (request: SwapTokensRequest) => Promise<SwapTokensResponse>;

/**
 * The possible actions related to swapping tokens.
 */
export type SwapActions = 'swap';

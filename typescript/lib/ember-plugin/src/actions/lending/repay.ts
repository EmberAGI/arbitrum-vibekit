import type { RepayResponse, TokenIdentifier } from 'ember-schemas';

/**
 * The request object for the repay tokens action.
 */
export interface RepayTokensRequest {
  /**
   * The token identifier for the token being repaid.
   */
  tokenUid: TokenIdentifier | undefined;
  /**
   * The amount of the token being repaid, in human-readable format.
   */
  amount: string;
  /**
   * The wallet address that owns the loan.
   */
  walletAddress: string;
}

/**
 * Callback function type for the repay tokens action.
 */
export type RepayTokensCallback = (request: RepayTokensRequest) => Promise<RepayResponse>;

import type { BorrowResponse, TokenIdentifier } from 'ember-schemas';

export interface BorrowTokenRequest {
  /**
   * The token identifier for the token being borrowed.
   */
  tokenUid: TokenIdentifier;
  /**
   * The amount of the token being borrowed, in human-readable format.
   */
  amount: string;
  /**
   * The wallet address for the borrower.
   */
  walletAddress?: string;
}

/**
 * Callback function type for the borrow action.
 */
export type BorrowCallback = (request: BorrowTokenRequest) => Promise<BorrowResponse>;

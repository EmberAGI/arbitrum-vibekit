import type {
  BorrowResponse,
  TokenIdentifier,
  RepayResponse,
  SupplyResponse,
  WithdrawResponse,
} from 'ember-schemas';

/**
 * Abstract interaction with the lending protocol.
 */
export interface LendingInteractionRequest {
  /**
   * The token identifier for the token being borrowed.
   */
  token: TokenIdentifier;
  /**
   * The amount of the token being borrowed, in human-readable format.
   */
  amount: string;
  /**
   * The wallet address for the borrower.
   */
  walletAddress: string;
}

/**
 * Callback function type for the borrow action.
 */
export type BorrowCallback = (request: LendingInteractionRequest) => Promise<BorrowResponse>;

/**
 * Callback function type for the repay tokens action.
 */
export type RepayTokensCallback = (request: LendingInteractionRequest) => Promise<RepayResponse>;

/**
 * Callback function type for the supply action.
 */
export type SupplyCallback = (request: LendingInteractionRequest) => Promise<SupplyResponse>;

/**
 * Callback function type for the withdraw action.
 */
export type WithdrawCallback = (request: LendingInteractionRequest) => Promise<WithdrawResponse>;

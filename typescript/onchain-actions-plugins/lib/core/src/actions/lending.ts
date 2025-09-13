import type {
  BorrowTokensRequest,
  BorrowTokensResponse,
  RepayTokensRequest,
  RepayTokensResponse,
  SupplyTokensRequest,
  SupplyTokensResponse,
  WithdrawTokensRequest,
  WithdrawTokensResponse,
} from '../schemas/lending.js';

/**
 * Callback function type for the borrow action.
 */
export type LendingBorrowCallback = (request: BorrowTokensRequest) => Promise<BorrowTokensResponse>;

/**
 * Callback function type for the repay tokens action.
 */
export type LendingRepayTokensCallback = (
  request: RepayTokensRequest
) => Promise<RepayTokensResponse>;

/**
 * Callback function type for the supply action.
 */
export type LendingSupplyCallback = (request: SupplyTokensRequest) => Promise<SupplyTokensResponse>;

/**
 * Callback function type for the withdraw action.
 */
export type LendingWithdrawCallback = (
  request: WithdrawTokensRequest
) => Promise<WithdrawTokensResponse>;

/**
 * The possible actions related to lending.
 */
export type LendingActions =
  | 'lending-borrow'
  | 'lending-repay'
  | 'lending-supply'
  | 'lending-withdraw';

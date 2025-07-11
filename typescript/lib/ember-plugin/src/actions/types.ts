import type { Token } from 'ember-schemas';
import type { SwapActionCallback } from './swap.js';
import type {
  BorrowCallback,
  RepayTokensCallback,
  SupplyCallback as LendingSupplyCallback,
  WithdrawCallback as LendingWithdrawCallback,
} from './lending.js';
import type { SupplyLiquidityCallback, WithdrawLiquidityCallback } from './liquidity.js';
import type { Chain } from 'src/common.js';

/**
 * The possible actions an ember plugin can perform.
 */
export type Action =
  | 'swap'
  | 'lending-borrow'
  | 'lending-repay'
  | 'lending-supply'
  | 'lending-withdraw'
  | 'liquidity-supply'
  | 'liquidity-withdraw';

/**
 * Type mapping for action callbacks.
 */
type CallbacksRecord = {
  swap: SwapActionCallback;
  'lending-borrow': BorrowCallback;
  'lending-repay': RepayTokensCallback;
  'lending-supply': LendingSupplyCallback;
  'lending-withdraw': LendingWithdrawCallback;
  'liquidity-supply': SupplyLiquidityCallback;
  'liquidity-withdraw': WithdrawLiquidityCallback;
};
/**
 * Type mapping for action callbacks.
 */
export type ActionCallback<T extends keyof CallbacksRecord> = CallbacksRecord[T];
/**
 * Represents a grouping of tokens associated with a specific chain.
 */
export interface TokenSet {
  /**
   * An optional unique identifier for the token set.
   * This can be used to indicate equality between input and output token sets or between input/output token sets of different actions.
   */
  id?: string;
  /**
   * The chain to which the tokens belong.
   */
  chain: Chain;
  /**
   * The set of tokens associated with the chain.
   */
  tokens: Set<Token>;
}

/**
 * Definition of an action that can be performed by the Ember plugin.
 */
export interface ActionDefinition<T extends Action> {
  /**
   * The action type
   */
  type: T;
  /**
   * The callback function to execute when the action is triggered.
   */
  callback: ActionCallback<T>;
  /**
   * THis function returns the possible input tokens for the action in all chains.
   * @returns The list of token sets that can be used as input for the action.
   */
  inputTokens: () => Promise<TokenSet[]>;
  /**
   * This function returns the possible output tokens for the action in all chains.
   * If not provided, all input input token sets will be considered possible output sets.
   * @returns The list of tokens that can be used as output for the action.
   */
  outputTokens?: () => Promise<TokenSet[]>;
}

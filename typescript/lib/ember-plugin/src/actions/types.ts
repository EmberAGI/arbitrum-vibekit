import type { Token } from 'ember-schemas';
import type { SwapActionCallback } from './swap.js';
import type {
  BorrowCallback,
  RepayTokensCallback,
  SupplyCallback,
  WithdrawCallback,
} from './lending.js';

/**
 * The possible actions an ember plugin can perform.
 */
export type Action = 'swap' | 'borrow' | 'repay' | 'supply' | 'withdraw';

/**
 * Type mapping for action callbacks.
 */
export type ActionCallback<T extends Action> = T extends 'swap'
  ? SwapActionCallback
  : T extends 'borrow'
    ? BorrowCallback
    : T extends 'repay'
      ? RepayTokensCallback
      : T extends 'supply'
        ? SupplyCallback
        : T extends 'withdraw'
          ? WithdrawCallback
          : never;

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
   * @returns A promise that resolves to a list of tokens that can be used as input for the action.
   */
  inputTokens: () => Promise<Token[]>;
  /**
   * The function that returns the possible output tokens after the action is executed for a single input token.
   * If this is not provided, all input tokens are assumed to produce the same output tokens.
   * @param token One input token of the action.
   * @returns The possible output tokens after the action is executed for that token.
   */
  outputTokens?: (token: Token) => Promise<Token[]>;
}

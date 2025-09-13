import type { SwapActionCallback, SwapActions } from './swap.js';
import type {
  LendingActions,
  LendingBorrowCallback,
  LendingRepayTokensCallback,
  LendingSupplyCallback,
  LendingWithdrawCallback,
} from './lending.js';
import type {
  LiquidityActions,
  LiquiditySupplyCallback,
  LiquidityWithdrawCallback,
} from './liquidity.js';
import type {
  PerpetualsActions,
  PerpetualsCloseOrdersCallback,
  PerpetualsCreateLongPositionCallback,
  PerpetualsCreateShortPositionCallback,
} from './perpetuals.js';

/**
 * The possible actions an ember plugin can perform.
 */
export type Action = LendingActions | LiquidityActions | SwapActions | PerpetualsActions;

/**
 * Type mapping for action callbacks.
 */
type CallbacksRecord = {
  swap: SwapActionCallback;
  'lending-borrow': LendingBorrowCallback;
  'lending-repay': LendingRepayTokensCallback;
  'lending-supply': LendingSupplyCallback;
  'lending-withdraw': LendingWithdrawCallback;
  'liquidity-supply': LiquiditySupplyCallback;
  'liquidity-withdraw': LiquidityWithdrawCallback;
  'perpetuals-short': PerpetualsCreateShortPositionCallback;
  'perpetuals-long': PerpetualsCreateLongPositionCallback;
  'perpetuals-close': PerpetualsCloseOrdersCallback;
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
   * The chain id to which the tokens belong.
   */
  chainId: string;
  /**
   * The set of tokens addresses associated with the chain.
   */
  tokens: string[];
}

/**
 * Definition of an action that can be performed by the Ember plugin.
 */
export interface ActionDefinition<T extends Action> {
  /**
   * The name for the action, should be unique across all actions in the plugin.
   */
  name: string;
  /**
   * The action type
   */
  type: T;
  /**
   * The callback function to execute when the action is triggered.
   */
  callback: ActionCallback<T>;
  /**
   * This function returns the possible input tokens for the action in all chains.
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

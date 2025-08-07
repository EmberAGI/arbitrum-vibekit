import type { LendingQueries, LiquidityQueries } from './queries/index.js';

/**
 * The type of actions and queries the plugin supports.
 */
export type PluginType = 'lending' | 'liquidity' | 'swap';

/**
 * The possible actions an ember plugin can perform.
 */
export type AvailableActions = {
  lending: 'lending-borrow' | 'lending-repay' | 'lending-supply' | 'lending-withdraw';
  liquidity: 'liquidity-supply' | 'liquidity-withdraw';
  swap: 'swap';
};

/**
 * The possible queries an ember plugin can perform.
 */
export type AvailableQueries = {
  lending: LendingQueries;
  liquidity: LiquidityQueries;
  swap: Record<string, never> | undefined;
};

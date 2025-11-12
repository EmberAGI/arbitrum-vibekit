import type {
  LendingActions,
  LiquidityActions,
  PerpetualsActions,
  SwapActions,
  TokenizedYieldActions,
} from './actions/index.js';
import type {
  LendingQueries,
  LiquidityQueries,
  PerpetualsQueries,
  TokenizedYieldQueries,
} from './queries/index.js';

/**
 * The type of actions and queries the plugin supports.
 */
export type PluginType = 'lending' | 'liquidity' | 'swap' | 'perpetuals' | 'tokenizedYield';

/**
 * The possible actions an ember plugin can perform.
 */
export type AvailableActions = {
  lending: LendingActions;
  liquidity: LiquidityActions;
  swap: SwapActions;
  perpetuals: PerpetualsActions;
  tokenizedYield: TokenizedYieldActions;
};

/**
 * The possible queries an ember plugin can perform.
 */
export type AvailableQueries = {
  lending: LendingQueries;
  liquidity: LiquidityQueries;
  swap: Record<string, never> | undefined;
  perpetuals: PerpetualsQueries;
  tokenizedYield: TokenizedYieldQueries;
};

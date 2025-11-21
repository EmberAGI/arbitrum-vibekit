import { fetchMarkets } from './markets.js';
import { getUserPosition } from './positions.js';
import { supply, withdraw, borrow, repay } from './actions.js';

export const radiantPlugin = {
  id: 'radiant',
  chains: [42161],
  actions: {
    fetchMarkets,
    getUserPosition,
    supply,
    withdraw,
    borrow,
    repay
  }
};

export { fetchMarkets, getUserPosition, supply, withdraw, borrow, repay };
export type { MarketInfo } from './markets.js';
export type { UserPosition } from './positions.js';
export type { TxBuildResult } from './actions.js';

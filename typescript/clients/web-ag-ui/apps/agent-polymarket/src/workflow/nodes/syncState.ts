/**
 * Sync State Node
 *
 * Refreshes and returns the current agent state.
 * Also fetches current markets to show in the UI.
 */

import type { PolymarketState, PolymarketUpdate, Market, UserPosition } from '../context.js';
import { logInfo, buildTaskStatus } from '../context.js';
import { fetchMarketsFromGamma, fetchMarketPrices, createAdapterFromEnv, type TradingHistoryItem } from '../../clients/polymarketClient.js';

/**
 * Fetch markets and convert to our Market type.
 */
async function fetchMarkets(): Promise<Market[]> {
  try {
    const perpetualMarkets = await fetchMarketsFromGamma(10);

    const markets: Market[] = [];
    for (const m of perpetualMarkets) {
      const prices = await fetchMarketPrices(m.longToken.address, m.shortToken.address);

      markets.push({
        id: m.marketToken.address,
        title: m.name,
        description: m.name,
        yesTokenId: m.longToken.address,
        noTokenId: m.shortToken.address,
        yesPrice: prices.yesBuyPrice,
        noPrice: prices.noBuyPrice,
        volume: 0,
        liquidity: 0,
        endDate: '',
        resolved: false,
        active: true,
      });
    }

    return markets;
  } catch (error) {
    logInfo('Error fetching markets in syncState', { error: String(error) });
    return [];
  }
}

/**
 * Fetch user positions from Polymarket Data API.
 */
async function fetchUserPositions(userWalletAddress?: string): Promise<UserPosition[]> {
  console.log('[SYNC STATE] fetchUserPositions called with wallet:', userWalletAddress);

  if (!userWalletAddress) {
    console.log('[SYNC STATE] No user wallet address - skipping positions fetch');
    logInfo('No user wallet address available for fetching positions');
    return [];
  }

  try {
    const adapter = await createAdapterFromEnv();
    if (!adapter) {
      console.log('[SYNC STATE] No adapter available');
      logInfo('No adapter available for fetching positions');
      return [];
    }

    console.log('[SYNC STATE] Fetching positions from adapter...');
    const result = await adapter.getPositions(userWalletAddress);
    console.log('[SYNC STATE] Positions fetched:', result.positions.length, 'positions');
    console.log('[SYNC STATE] Positions data:', JSON.stringify(result.positions.slice(0, 2), null, 2));
    logInfo(`Fetched ${result.positions.length} user positions`);
    return result.positions as UserPosition[];
  } catch (error) {
    console.log('[SYNC STATE] Error fetching positions:', error);
    logInfo('Error fetching user positions', { error: String(error) });
    return [];
  }
}

/**
 * Fetch trading history from Polymarket Data API.
 */
async function fetchTradingHistory(userWalletAddress?: string): Promise<TradingHistoryItem[]> {
  console.log('[SYNC STATE] fetchTradingHistory called with wallet:', userWalletAddress);

  if (!userWalletAddress) {
    console.log('[SYNC STATE] No user wallet address - skipping trading history fetch');
    logInfo('No user wallet address available for fetching trading history');
    return [];
  }

  try {
    const adapter = await createAdapterFromEnv();
    if (!adapter) {
      console.log('[SYNC STATE] No adapter available for trading history');
      logInfo('No adapter available for fetching trading history');
      return [];
    }

    console.log('[SYNC STATE] Fetching trading history from adapter...');
    const trades = await adapter.getTradingHistoryWithDetails(userWalletAddress, { limit: 50 });
    console.log('[SYNC STATE] Trading history fetched:', trades.length, 'trades');
    console.log('[SYNC STATE] Trades data:', JSON.stringify(trades.slice(0, 2), null, 2));
    logInfo(`Fetched ${trades.length} trading history items`);
    return trades;
  } catch (error) {
    console.log('[SYNC STATE] Error fetching trading history:', error);
    logInfo('Error fetching trading history', { error: String(error) });
    return [];
  }
}

/**
 * Sync the current state.
 *
 * This node is called when:
 * - User requests a state refresh
 * - After bootstrap for initial state return
 * - Periodic sync checks
 */
export async function syncStateNode(state: PolymarketState): Promise<PolymarketUpdate> {
  logInfo('=== POLYMARKET AGENT syncing state ===', {
    lifecycle: state.view.lifecycleState,
    iteration: state.view.metrics.iteration,
    positions: state.view.positions.length,
  });

  // Get user wallet address for fetching positions and trading history
  // Fallback to POLY_FUNDER_ADDRESS from env if userWalletAddress not set yet
  const userWalletAddress = state.private.userWalletAddress || process.env.POLY_FUNDER_ADDRESS;

  console.log('[SYNC STATE] === Starting sync ===');
  console.log('[SYNC STATE] userWalletAddress from state:', state.private.userWalletAddress);
  console.log('[SYNC STATE] POLY_FUNDER_ADDRESS from env:', process.env.POLY_FUNDER_ADDRESS);
  console.log('[SYNC STATE] Using wallet address:', userWalletAddress);

  // Fetch current markets, positions, and trading history in parallel
  const [markets, userPositions, tradingHistory] = await Promise.all([
    fetchMarkets(),
    fetchUserPositions(userWalletAddress),
    fetchTradingHistory(userWalletAddress),
  ]);

  logInfo(`Fetched ${markets.length} markets for sync`, {
    marketNames: markets.slice(0, 3).map((m) => m.title.substring(0, 40) + '...'),
  });
  logInfo(`Fetched ${userPositions.length} positions and ${tradingHistory.length} trades`);

  console.log('[SYNC STATE] === Data fetched ===');
  console.log('[SYNC STATE] Markets:', markets.length);
  console.log('[SYNC STATE] User Positions:', userPositions.length);
  console.log('[SYNC STATE] Trading History:', tradingHistory.length);
  if (userPositions.length > 0) {
    console.log('[SYNC STATE] First position:', JSON.stringify(userPositions[0], null, 2));
  }
  if (tradingHistory.length > 0) {
    console.log('[SYNC STATE] First trade:', JSON.stringify(tradingHistory[0], null, 2));
  }

  // Find arbitrage opportunities
  const opportunities = markets
    .filter((m) => {
      const spread = 1 - (m.yesPrice + m.noPrice);
      return spread >= 0.02; // 2% minimum spread
    })
    .map((m) => ({
      marketId: m.id,
      marketTitle: m.title,
      yesTokenId: m.yesTokenId,
      noTokenId: m.noTokenId,
      yesPrice: m.yesPrice,
      noPrice: m.noPrice,
      spread: 1 - (m.yesPrice + m.noPrice),
      profitPotential: (1 - (m.yesPrice + m.noPrice)) * 100,
      timestamp: new Date().toISOString(),
      minOrderSize: m.minOrderSize ?? 5, // Use market's minOrderSize or default to 5
    }));

  logInfo(`Found ${opportunities.length} arbitrage opportunities`);

  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'completed',
    `State synced. ${markets.length} markets, ${opportunities.length} opportunities, ${userPositions.length} positions.`,
  );

  return {
    view: {
      task,
      markets,
      opportunities,
      userPositions,
      tradingHistory,
      events: [statusEvent],
    },
  };
}

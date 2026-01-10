/**
 * Sync State Node
 *
 * Refreshes and returns the current agent state.
 * Also fetches current markets to show in the UI.
 */

import type { PolymarketState, PolymarketUpdate, Market } from '../context.js';
import { logInfo, buildTaskStatus } from '../context.js';
import { fetchMarketsFromGamma, fetchMarketPrices } from '../../clients/polymarketClient.js';

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
        yesPrice: prices.yesPrice,
        noPrice: prices.noPrice,
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

  // Fetch current markets
  const markets = await fetchMarkets();

  logInfo(`Fetched ${markets.length} markets for sync`, {
    marketNames: markets.slice(0, 3).map((m) => m.title.substring(0, 40) + '...'),
  });

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
    }));

  logInfo(`Found ${opportunities.length} arbitrage opportunities`);

  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'completed',
    `State synced. ${markets.length} markets, ${opportunities.length} opportunities.`,
  );

  return {
    view: {
      task,
      markets,
      opportunities,
      events: [statusEvent],
    },
  };
}

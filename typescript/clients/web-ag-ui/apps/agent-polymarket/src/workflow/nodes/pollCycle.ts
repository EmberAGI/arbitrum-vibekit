/**
 * Poll Cycle Node
 *
 * Main arbitrage detection and execution loop.
 * Uses the PolymarketAdapter from the plugin via dynamic import.
 */

import type {
  PolymarketState,
  PolymarketUpdate,
  Market,
  Transaction,
} from '../context.js';
import { logInfo, buildTaskStatus } from '../context.js';
import { scanForOpportunities, filterOpportunities } from '../../strategy/scanner.js';
import { calculatePositionSize, isPositionViable } from '../../strategy/evaluator.js';
import { executeArbitrage } from '../../strategy/executor.js';
import {
  createAdapterFromEnv,
  createMockAdapter,
  type IPolymarketAdapter,
  type PerpetualMarket,
} from '../../clients/polymarketClient.js';

// Singleton adapter instance
let adapterInstance: IPolymarketAdapter | null = null;

/**
 * Get or create the adapter instance.
 */
async function getAdapter(): Promise<IPolymarketAdapter> {
  if (!adapterInstance) {
    const realAdapter = await createAdapterFromEnv();
    if (realAdapter) {
      logInfo('Using real PolymarketAdapter from plugin');
      adapterInstance = realAdapter;
    } else {
      logInfo('Using mock adapter (no credentials or plugin not available)');
      adapterInstance = createMockAdapter();
    }
  }
  return adapterInstance;
}

/**
 * Fetch markets using adapter.getMarkets() and convert to our Market type.
 */
async function fetchMarketsFromPlugin(adapter: IPolymarketAdapter): Promise<Market[]> {
  logInfo('Calling adapter.getMarkets()...');

  try {
    const response = await adapter.getMarkets({ chainIds: ['137'] });

    if (!response.markets || response.markets.length === 0) {
      logInfo('No markets returned from adapter');
      return [];
    }

    logInfo(`adapter.getMarkets() returned ${response.markets.length} markets`);

    // Convert plugin format to our Market type
    const markets: Market[] = [];

    for (const m of response.markets as PerpetualMarket[]) {
      const yesTokenId = m.longToken.address;
      const noTokenId = m.shortToken.address;

      // Fetch prices from CLOB API
      const prices = await fetchPricesFromClob(yesTokenId, noTokenId);

      markets.push({
        id: m.marketToken.address,
        title: m.name,
        description: m.name,
        yesTokenId,
        noTokenId,
        yesPrice: prices.yes,
        noPrice: prices.no,
        volume: 0,
        liquidity: 0,
        endDate: '',
        resolved: false,
        active: true,
      });
    }

    return markets;
  } catch (error) {
    logInfo('Error calling adapter.getMarkets()', { error: String(error) });
    return [];
  }
}

/**
 * Fetch YES and NO prices from CLOB API.
 */
async function fetchPricesFromClob(
  yesTokenId: string,
  noTokenId: string,
): Promise<{ yes: number; no: number }> {
  try {
    const [yesRes, noRes] = await Promise.all([
      fetch(`https://clob.polymarket.com/price?token_id=${yesTokenId}&side=buy`),
      fetch(`https://clob.polymarket.com/price?token_id=${noTokenId}&side=buy`),
    ]);

    let yesPrice = 0.5;
    let noPrice = 0.5;

    if (yesRes.ok) {
      const data = (await yesRes.json()) as { price?: string };
      yesPrice = parseFloat(data.price ?? '0.5');
    }
    if (noRes.ok) {
      const data = (await noRes.json()) as { price?: string };
      noPrice = parseFloat(data.price ?? '0.5');
    }

    return { yes: yesPrice, no: noPrice };
  } catch {
    return { yes: 0.5, no: 0.5 };
  }
}

/**
 * Main poll cycle execution - following Team's Option A:
 *
 * 1. Fetch all active markets from adapter.getMarkets()
 * 2. For each market: get prices and scan for arbitrage
 * 3. Calculate position size based on risk limits (e.g. 3% of portfolio)
 * 4. Execute adapter.createLongPosition() for YES
 * 5. Execute adapter.createShortPosition() for NO
 * 6. Track positions and PnL, report to frontend
 */
export async function pollCycleNode(state: PolymarketState): Promise<PolymarketUpdate> {
  const iteration = (state.view.metrics.iteration ?? 0) + 1;
  const now = new Date().toISOString();

  logInfo('Poll cycle starting', { iteration });

  // Check if agent is in running state
  if (state.view.lifecycleState !== 'running') {
    logInfo('Agent not in running state, skipping cycle');
    return {
      view: {
        metrics: { ...state.view.metrics, iteration, lastPoll: now },
      },
    };
  }

  // Get the adapter (plugin or mock)
  const adapter = await getAdapter();

  // Step 1: Fetch markets using adapter.getMarkets()
  const markets = await fetchMarketsFromPlugin(adapter);

  if (markets.length === 0) {
    const { task, statusEvent } = buildTaskStatus(
      state.view.task,
      'working',
      `Cycle ${iteration}: No markets available.`,
    );
    return {
      view: {
        task,
        markets: [],
        metrics: { ...state.view.metrics, iteration, lastPoll: now },
        events: [statusEvent],
      },
    };
  }

  // Step 2: Scan for arbitrage opportunities
  const rawOpportunities = scanForOpportunities(markets, state.view.config);

  // Filter based on current exposure
  const currentExposure = state.view.positions.reduce((sum, p) => sum + p.costBasis, 0);
  const opportunities = filterOpportunities(rawOpportunities, state.view.config, currentExposure);

  logInfo('Opportunities found', { raw: rawOpportunities.length, filtered: opportunities.length });

  // Steps 3-5: Execute trades
  const newTransactions: Transaction[] = [];
  let tradesExecuted = 0;
  let tradesFailed = 0;
  let opportunitiesExecuted = 0;

  for (const opportunity of opportunities) {
    // Step 3: Calculate position size (e.g., 3% of portfolio)
    const position = calculatePositionSize(
      opportunity,
      state.view.portfolioValueUsd || 1000,
      state.view.config,
    );

    if (!position || !isPositionViable(position)) {
      logInfo('Position not viable', { market: opportunity.marketTitle.substring(0, 30) });
      continue;
    }

    // Steps 4-5: Execute via adapter.createLongPosition() and adapter.createShortPosition()
    const result = await executeArbitrage(opportunity, position, adapter, iteration);

    newTransactions.push(...result.transactions);

    if (result.success) {
      tradesExecuted += 2;
      opportunitiesExecuted++;
    } else {
      tradesFailed += result.transactions.filter((t) => t.status === 'failed').length;
    }

    // Limit opportunities per cycle
    if (opportunitiesExecuted >= 3) {
      logInfo('Max opportunities per cycle reached');
      break;
    }
  }

  // Step 6: Report to frontend
  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'working',
    `Cycle ${iteration}: Found ${opportunities.length} opportunities, executed ${opportunitiesExecuted}.`,
  );

  const opportunityEvents = opportunities.slice(0, 5).map((opp) => ({
    type: 'opportunity' as const,
    opportunity: opp,
  }));

  logInfo('Poll cycle complete', {
    iteration,
    marketsScanned: markets.length,
    opportunitiesFound: opportunities.length,
    opportunitiesExecuted,
  });

  return {
    view: {
      task,
      markets,
      opportunities,
      transactionHistory: [...state.view.transactionHistory, ...newTransactions],
      metrics: {
        iteration,
        lastPoll: now,
        totalPnl: state.view.metrics.totalPnl,
        realizedPnl: state.view.metrics.realizedPnl,
        unrealizedPnl: state.view.metrics.unrealizedPnl,
        activePositions: state.view.positions.length,
        opportunitiesFound: state.view.metrics.opportunitiesFound + opportunities.length,
        opportunitiesExecuted: state.view.metrics.opportunitiesExecuted + opportunitiesExecuted,
        tradesExecuted: state.view.metrics.tradesExecuted + tradesExecuted,
        tradesFailed: state.view.metrics.tradesFailed + tradesFailed,
      },
      events: [statusEvent, ...opportunityEvents],
    },
  };
}

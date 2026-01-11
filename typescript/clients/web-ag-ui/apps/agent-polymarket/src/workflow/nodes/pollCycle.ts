/**
 * Poll Cycle Node
 *
 * Main arbitrage detection and execution loop for both:
 * 1. Intra-market arbitrage (YES + NO < $1.00 on same market)
 * 2. Cross-market arbitrage (logical relationship violations between markets)
 *
 * Uses the PolymarketAdapter from the plugin via dynamic import.
 */

import type {
  PolymarketState,
  PolymarketUpdate,
  Market,
  Transaction,
  CrossMarketOpportunity as CrossMarketOpp,
  MarketRelationship,
} from '../context.js';
import { logInfo, buildTaskStatus } from '../context.js';
import {
  scanForOpportunities,
  filterOpportunities,
  scanForCrossMarketOpportunities,
  filterCrossMarketOpportunities,
} from '../../strategy/scanner.js';
import {
  calculatePositionSize,
  isPositionViable,
  calculateCrossMarketPositionSize,
  isCrossMarketPositionViable,
} from '../../strategy/evaluator.js';
import { executeArbitrage, executeCrossMarketArbitrage } from '../../strategy/executor.js';
import {
  createAdapterFromEnv,
  fetchMarketPrices,
  type IPolymarketAdapter,
  type PerpetualMarket,
} from '../../clients/polymarketClient.js';

// Singleton adapter instance
let adapterInstance: IPolymarketAdapter | null = null;

/**
 * Get or create the adapter instance.
 */
async function getAdapter(): Promise<IPolymarketAdapter | null> {
  if (!adapterInstance) {
    adapterInstance = await createAdapterFromEnv();
    if (adapterInstance) {
      logInfo('PolymarketAdapter initialized');
    } else {
      logInfo('No adapter available - missing credentials');
    }
  }
  return adapterInstance;
}

/**
 * Generate mock markets for frontend testing.
 * Set POLYMARKET_USE_MOCK_DATA=true to use this instead of real API.
 */
function getMockMarkets(): Market[] {
  return [
    // Example 1: IMPLIES relationship violation - Trump → Republican
    {
      id: 'market-1',
      title: 'Trump wins Florida',
      description: 'Will Donald Trump win the state of Florida?',
      yesTokenId: '0xtrump-fl-yes',
      noTokenId: '0xtrump-fl-no',
      yesPrice: 0.75, // Overpriced
      noPrice: 0.20,
      volume: 100000,
      liquidity: 50000,
      endDate: '2024-11-05T23:59:59Z',
      resolved: false,
      active: true,
    },
    {
      id: 'market-2',
      title: 'Republican wins Florida',
      description: 'Will the Republican candidate win Florida?',
      yesTokenId: '0xrep-fl-yes',
      noTokenId: '0xrep-fl-no',
      yesPrice: 0.72, // Underpriced (should be >= Trump price)
      noPrice: 0.25,
      volume: 150000,
      liquidity: 75000,
      endDate: '2024-11-05T23:59:59Z',
      resolved: false,
      active: true,
    },
    // Example 2: Time-based IMPLIES - Q1 → 2025
    {
      id: 'market-3',
      title: 'Bitcoin hits $100k in Q1 2025',
      description: 'Will Bitcoin reach $100,000 in Q1 2025?',
      yesTokenId: '0xbtc-q1-yes',
      noTokenId: '0xbtc-q1-no',
      yesPrice: 0.40,
      noPrice: 0.58,
      volume: 200000,
      liquidity: 100000,
      endDate: '2025-03-31T23:59:59Z',
      resolved: false,
      active: true,
    },
    {
      id: 'market-4',
      title: 'Bitcoin hits $100k in 2025',
      description: 'Will Bitcoin reach $100,000 anytime in 2025?',
      yesTokenId: '0xbtc-2025-yes',
      noTokenId: '0xbtc-2025-no',
      yesPrice: 0.35, // Should be >= Q1 price (violation!)
      noPrice: 0.63,
      volume: 250000,
      liquidity: 125000,
      endDate: '2025-12-31T23:59:59Z',
      resolved: false,
      active: true,
    },
    // Example 3: Intra-market opportunity
    {
      id: 'market-5',
      title: 'Ethereum price above $5000 in 2025',
      description: 'Will ETH exceed $5,000?',
      yesTokenId: '0xeth-yes',
      noTokenId: '0xeth-no',
      yesPrice: 0.48, // YES + NO = 0.96 < 1.00 (intra-market arb)
      noPrice: 0.48,
      volume: 180000,
      liquidity: 90000,
      endDate: '2025-12-31T23:59:59Z',
      resolved: false,
      active: true,
    },
  ];
}

/**
 * Fetch markets using adapter.getMarkets() and convert to our Market type.
 * Returns at least 3 markets for frontend display.
 */
async function fetchMarketsFromPlugin(adapter: IPolymarketAdapter): Promise<Market[]> {
  logInfo('Calling adapter.getMarkets()...');

  try {
    // Explicitly fetch only active markets (not closed/resolved)
    const response = await adapter.getMarkets({ chainIds: ['137'], status: 'active' });

    if (!response.markets || response.markets.length === 0) {
      logInfo('No markets returned from adapter');
      return [];
    }

    logInfo(`adapter.getMarkets() returned ${response.markets.length} markets`);

    // Convert plugin format to our Market type
    const markets: Market[] = [];

    // Process first 50 markets to increase cross-market relationship detection
    const marketsToProcess = response.markets.slice(0, 50) as PerpetualMarket[];

    for (const m of marketsToProcess) {
      const yesTokenId = m.longToken.address;
      const noTokenId = m.shortToken.address;

      // Fetch prices from CLOB API using the client's function
      // yesBuyPrice/noBuyPrice are ASK prices (what you PAY to buy)
      const prices = await fetchMarketPrices(yesTokenId, noTokenId);

      // Log prices for verification
      logInfo('Market prices fetched', {
        market: m.name.substring(0, 40) + '...',
        yesBuyPrice: prices.yesBuyPrice.toFixed(3),
        noBuyPrice: prices.noBuyPrice.toFixed(3),
        combined: (prices.yesBuyPrice + prices.noBuyPrice).toFixed(3),
      });

      // Try to get cached market data for liquidity/volume
      // The adapter caches GammaMarket data when fetching markets
      const cachedMarket = (adapter as any).marketCache?.get(yesTokenId);
      const liquidity = cachedMarket?.liquidity ? parseFloat(cachedMarket.liquidity) : 0;
      const volume = cachedMarket?.volume ? parseFloat(cachedMarket.volume) : 0;
      const endDate = cachedMarket?.endDateIso || '';

      markets.push({
        id: m.marketToken.address,
        title: m.name,
        description: m.name,
        yesTokenId,
        noTokenId,
        yesPrice: prices.yesBuyPrice,
        noPrice: prices.noBuyPrice,
        volume,
        liquidity,
        endDate,
        resolved: false,
        active: true,
      });
    }

    logInfo(`Returning ${markets.length} markets for display`);
    return markets;
  } catch (error) {
    logInfo('Error calling adapter.getMarkets()', { error: String(error) });
    return [];
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

  // Check if we should use mock data for testing
  const useMockData = process.env.POLYMARKET_USE_MOCK_DATA === 'true';
//   const useMockData = true;

  let markets: Market[] = [];

  if (useMockData) {
    // Use mock data for frontend testing
    logInfo('Using mock market data (POLYMARKET_USE_MOCK_DATA=true)');
    markets = getMockMarkets();
  } else {
    // Get the adapter for real data
    const adapter = await getAdapter();

    if (!adapter) {
      const { task, statusEvent } = buildTaskStatus(
        state.view.task,
        'failed',
        `Cycle ${iteration}: No adapter available - check credentials.`,
      );
      return {
        view: {
          task,
          metrics: { ...state.view.metrics, iteration, lastPoll: now },
          events: [statusEvent],
          executionError: 'Missing Polymarket credentials',
        },
      };
    }

    // Step 1: Fetch markets using adapter.getMarkets()
    markets = await fetchMarketsFromPlugin(adapter);
  }

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

  // Step 2A: Scan for intra-market arbitrage opportunities
  const rawOpportunities = scanForOpportunities(markets, state.view.config);

  // Filter based on current exposure
  const currentExposure = state.view.positions.reduce((sum, p) => sum + p.costBasis, 0);
  const opportunities = filterOpportunities(rawOpportunities, state.view.config, currentExposure);

  logInfo('Intra-market opportunities', { raw: rawOpportunities.length, filtered: opportunities.length });

  // Step 2B: Scan for cross-market arbitrage opportunities
  const { opportunities: rawCrossOpps, relationships } = await scanForCrossMarketOpportunities(
    markets,
    state.view.config,
    false, // useLLM=false for MVP (use pattern matching)
  );

  const crossOpportunities = filterCrossMarketOpportunities(
    rawCrossOpps,
    state.view.config,
    currentExposure,
  );

  logInfo('Cross-market opportunities', {
    relationships: relationships.length,
    raw: rawCrossOpps.length,
    filtered: crossOpportunities.length,
  });

  // Steps 3-5: Execute trades (prioritize by expected profit)
  const newTransactions: Transaction[] = [];
  let tradesExecuted = 0;
  let tradesFailed = 0;
  let opportunitiesExecuted = 0;

  // Combine and sort all opportunities by profit potential
  type CombinedOpportunity =
    | { type: 'intra'; opp: typeof opportunities[0]; profit: number }
    | { type: 'cross'; opp: CrossMarketOpp; profit: number };

  const allOpportunities: CombinedOpportunity[] = [
    ...opportunities.map((opp) => ({
      type: 'intra' as const,
      opp,
      profit: opp.profitPotential,
    })),
    ...crossOpportunities.map((opp) => ({
      type: 'cross' as const,
      opp,
      profit: opp.expectedProfitPerShare,
    })),
  ].sort((a, b) => b.profit - a.profit);

  logInfo('Total opportunities to execute', {
    total: allOpportunities.length,
    intra: opportunities.length,
    cross: crossOpportunities.length,
  });

  // Execute top opportunities (up to 3 per cycle) - only if not in mock mode
  if (!useMockData) {
    // Need adapter for execution
    const adapter = await getAdapter();
    if (!adapter) {
      logInfo('No adapter available for execution');
    } else {
      for (const opportunity of allOpportunities) {
        if (opportunity.type === 'intra') {
          // Execute intra-market arbitrage
          const position = calculatePositionSize(
            opportunity.opp,
            state.view.portfolioValueUsd || 1000,
            state.view.config,
          );

          if (!position || !isPositionViable(position)) {
            logInfo('Intra-market position not viable', {
              market: opportunity.opp.marketTitle.substring(0, 30),
            });
            continue;
          }

          const result = await executeArbitrage(opportunity.opp, position, adapter, iteration);
          newTransactions.push(...result.transactions);

          if (result.success) {
            tradesExecuted += 2; // YES + NO
            opportunitiesExecuted++;
          } else {
            tradesFailed += result.transactions.filter((t) => t.status === 'failed').length;
          }
        } else {
          // Execute cross-market arbitrage
          const position = calculateCrossMarketPositionSize(
            opportunity.opp,
            state.view.portfolioValueUsd || 1000,
            state.view.config,
          );

          if (!position || !isCrossMarketPositionViable(position, 0.5)) {
            logInfo('Cross-market position not viable', {
              parent: opportunity.opp.relationship.parentMarket.title.substring(0, 30),
              child: opportunity.opp.relationship.childMarket.title.substring(0, 30),
            });
            continue;
          }

          const result = await executeCrossMarketArbitrage(opportunity.opp, position, adapter, iteration);
          newTransactions.push(...result.transactions);

          if (result.success) {
            tradesExecuted += 2; // SELL + BUY
            opportunitiesExecuted++;
          } else {
            tradesFailed += result.transactions.filter((t) => t.status === 'failed').length;
          }
        }

        // Limit opportunities per cycle
        if (opportunitiesExecuted >= 3) {
          logInfo('Max opportunities per cycle reached');
          break;
        }
      }
    }
  } else {
    logInfo('Mock mode: Skipping trade execution');
  }

  // Step 6: Report to frontend
  const totalOpportunitiesFound = opportunities.length + crossOpportunities.length;
  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'working',
    `Cycle ${iteration}: Scanned ${markets.length} markets, found ${totalOpportunitiesFound} opportunities (${opportunities.length} intra, ${crossOpportunities.length} cross).`,
  );

  const opportunityEvents = opportunities.slice(0, 3).map((opp) => ({
    type: 'opportunity' as const,
    opportunity: opp,
  }));

  const crossOpportunityEvents = crossOpportunities.slice(0, 3).map((opp) => ({
    type: 'cross-market-opportunity' as const,
    opportunity: opp,
  }));

  const relationshipEvents = relationships.slice(0, 5).map((rel) => ({
    type: 'relationship' as const,
    relationship: rel,
  }));

  // Log first 3 markets for frontend verification
  const marketsToLog = markets.slice(0, 3);
  for (const m of marketsToLog) {
    logInfo('Market for display', {
      title: m.title.substring(0, 50),
      yesPrice: m.yesPrice.toFixed(3),
      noPrice: m.noPrice.toFixed(3),
      spread: ((1 - m.yesPrice - m.noPrice) * 100).toFixed(2) + '%',
    });
  }

  logInfo('Poll cycle complete', {
    iteration,
    marketsScanned: markets.length,
    intraOpportunities: opportunities.length,
    crossOpportunities: crossOpportunities.length,
    relationships: relationships.length,
    opportunitiesExecuted,
  });

  return {
    view: {
      task,
      markets,
      opportunities,
      crossMarketOpportunities: crossOpportunities,
      detectedRelationships: relationships,
      transactionHistory: [...state.view.transactionHistory, ...newTransactions],
      metrics: {
        iteration,
        lastPoll: now,
        totalPnl: state.view.metrics.totalPnl,
        realizedPnl: state.view.metrics.realizedPnl,
        unrealizedPnl: state.view.metrics.unrealizedPnl,
        activePositions: state.view.positions.length,
        opportunitiesFound: state.view.metrics.opportunitiesFound + totalOpportunitiesFound,
        opportunitiesExecuted: state.view.metrics.opportunitiesExecuted + opportunitiesExecuted,
        tradesExecuted: state.view.metrics.tradesExecuted + tradesExecuted,
        tradesFailed: state.view.metrics.tradesFailed + tradesFailed,
      },
      events: [statusEvent, ...opportunityEvents, ...crossOpportunityEvents, ...relationshipEvents],
    },
  };
}

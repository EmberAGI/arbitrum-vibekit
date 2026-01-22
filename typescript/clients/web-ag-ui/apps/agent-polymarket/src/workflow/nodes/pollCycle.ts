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
  UserPosition,
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
  fetchOrderBookInfo,
  type IPolymarketAdapter,
  type PerpetualMarket,
  type TradingHistoryItem,
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
 * Fetch user positions from Polymarket Data API.
 */
async function fetchUserPositions(adapter: IPolymarketAdapter, userWalletAddress?: string): Promise<UserPosition[]> {
  console.log('[POLL CYCLE] fetchUserPositions called with wallet:', userWalletAddress);

  if (!userWalletAddress) {
    console.log('[POLL CYCLE] No user wallet address - skipping positions fetch');
    return [];
  }

  try {
    console.log('[POLL CYCLE] Fetching positions from adapter...');
    const result = await adapter.getPositions(userWalletAddress);
    console.log('[POLL CYCLE] Positions fetched:', result.positions.length, 'positions');
    logInfo(`Fetched ${result.positions.length} user positions`);
    return result.positions as UserPosition[];
  } catch (error) {
    console.log('[POLL CYCLE] Error fetching positions:', error);
    logInfo('Error fetching user positions', { error: String(error) });
    return [];
  }
}

/**
 * Fetch trading history from Polymarket Data API.
 */
async function fetchTradingHistory(adapter: IPolymarketAdapter, userWalletAddress?: string): Promise<TradingHistoryItem[]> {
  console.log('[POLL CYCLE] fetchTradingHistory called with wallet:', userWalletAddress);

  if (!userWalletAddress) {
    console.log('[POLL CYCLE] No user wallet address - skipping trading history fetch');
    return [];
  }

  try {
    console.log('[POLL CYCLE] Fetching trading history from adapter...');
    const trades = await adapter.getTradingHistoryWithDetails(userWalletAddress, { limit: 50 });
    console.log('[POLL CYCLE] Trading history fetched:', trades.length, 'trades');
    logInfo(`Fetched ${trades.length} trading history items`);
    return trades;
  } catch (error) {
    console.log('[POLL CYCLE] Error fetching trading history:', error);
    logInfo('Error fetching trading history', { error: String(error) });
    return [];
  }
}

/**
 * Calculate portfolio value from user positions.
 * Portfolio value = sum of (size * currentPrice) for all positions.
 */
function calculatePortfolioValue(positions: UserPosition[]): number {
  if (!positions || positions.length === 0) {
    return 0;
  }

  let totalValue = 0;
  for (const pos of positions) {
    const size = parseFloat(pos.size);
    const price = pos.currentPrice ? parseFloat(pos.currentPrice) : 0;
    if (!isNaN(size) && !isNaN(price)) {
      totalValue += size * price;
    }
  }

  logInfo('Calculated portfolio value', {
    positionCount: positions.length,
    portfolioValue: totalValue.toFixed(2),
  });

  return totalValue;
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

// Track offset for rotating through markets each poll cycle
let currentMarketOffset = parseInt(process.env.POLY_MARKET_OFFSET || '0', 10);
const OFFSET_INCREMENT = 50; // Rotate through markets in chunks of 50

/**
 * Fetch markets using adapter.getMarkets() and convert to our Market type.
 * Rotates through different market offsets each poll cycle to get fresh data.
 */
async function fetchMarketsFromPlugin(adapter: IPolymarketAdapter, iteration: number): Promise<Market[]> {
  // Rotate offset every poll cycle to get different markets
  const offset = (currentMarketOffset + (iteration * OFFSET_INCREMENT)) % 500; // Cycle through first 500 markets

  logInfo('Calling adapter.getMarkets()', { offset, iteration });

  try {
    // Explicitly fetch only active markets with offset for pagination
    const response = await adapter.getMarkets({ chainIds: ['137'], status: 'active', offset });

    if (!response.markets || response.markets.length === 0) {
      logInfo('No markets returned from adapter');
      return [];
    }

    logInfo(`adapter.getMarkets() returned ${response.markets.length} markets`);

    // Convert plugin format to our Market type
    const markets: Market[] = [];

    // Configurable market limit for testing/production
    const maxMarkets = parseInt(process.env.POLY_MAX_MARKETS || '50', 10);
    const marketsToProcess = response.markets.slice(0, maxMarkets) as PerpetualMarket[];

    for (const m of marketsToProcess) {
      const yesTokenId = m.longToken.address;
      const noTokenId = m.shortToken.address;

      // Fetch prices and order book info from CLOB API in parallel
      // yesBuyPrice/noBuyPrice are ASK prices (what you PAY to buy)
      const [prices, orderBookInfo] = await Promise.all([
        fetchMarketPrices(yesTokenId, noTokenId),
        fetchOrderBookInfo(yesTokenId),
      ]);

      // Log prices for verification
      logInfo('Market prices fetched', {
        market: m.name.substring(0, 40) + '...',
        yesBuyPrice: prices.yesBuyPrice.toFixed(3),
        noBuyPrice: prices.noBuyPrice.toFixed(3),
        combined: (prices.yesBuyPrice + prices.noBuyPrice).toFixed(3),
        minOrderSize: orderBookInfo.minOrderSize,
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
        minOrderSize: orderBookInfo.minOrderSize,
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

  // Check for kill switch
  if (process.env.POLY_KILL_SWITCH === 'true') {
    logInfo('🚨 Kill switch activated - stopping agent');
    return {
      view: {
        lifecycleState: 'stopped',
        haltReason: 'Kill switch activated (POLY_KILL_SWITCH=true)',
        metrics: { ...state.view.metrics, iteration, lastPoll: now },
      },
    };
  }

  // Check if we should use mock data for testing
  const useMockData = process.env.POLYMARKET_USE_MOCK_DATA === 'true';

  // Check if paper trading mode is enabled
  const paperTradingMode = process.env.POLY_PAPER_TRADING === 'true';

  // Check if manual approval mode is enabled
  const manualApprovalMode = process.env.POLY_MANUAL_APPROVAL === 'true';
//   const useMockData = true;

  // Get user wallet address for fetching positions and trading history
  // Fallback to POLY_FUNDER_ADDRESS from env if userWalletAddress not set yet
  const userWalletAddress = state.private.userWalletAddress || process.env.POLY_FUNDER_ADDRESS;
  console.log('[POLL CYCLE] Using wallet address for positions/history:', userWalletAddress);

  let markets: Market[] = [];
  let userPositions: UserPosition[] = [];
  let tradingHistory: TradingHistoryItem[] = [];

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

    // Fetch markets, positions, and trading history in parallel
    const [fetchedMarkets, fetchedPositions, fetchedHistory] = await Promise.all([
      fetchMarketsFromPlugin(adapter, iteration),
      fetchUserPositions(adapter, userWalletAddress),
      fetchTradingHistory(adapter, userWalletAddress),
    ]);

    markets = fetchedMarkets;
    userPositions = fetchedPositions;
    tradingHistory = fetchedHistory;

    console.log('[POLL CYCLE] Fetched data:', {
      markets: markets.length,
      userPositions: userPositions.length,
      tradingHistory: tradingHistory.length,
    });
  }

  // Calculate portfolio value from user positions (do this early so it's available in all return paths)
  const portfolioValueUsd = calculatePortfolioValue(userPositions);

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
        userPositions,
        tradingHistory,
        portfolioValueUsd,
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
  const useLLM = process.env.POLY_USE_LLM_DETECTION === 'true';

  logInfo('🤖 [LLM FLOW] Starting cross-market scan', {
    useLLM,
    marketCount: markets.length,
    llmModel: process.env.POLY_LLM_MODEL || 'gpt-4o-mini',
    envVar: 'POLY_USE_LLM_DETECTION=' + process.env.POLY_USE_LLM_DETECTION,
  });

  const { opportunities: rawCrossOpps, relationships } = await scanForCrossMarketOpportunities(
    markets,
    state.view.config,
    useLLM, // Enable LLM batch detection if configured
  );

  logInfo('🤖 [LLM FLOW] Cross-market scan complete', {
    relationshipsDetected: relationships.length,
    opportunitiesFound: rawCrossOpps.length,
  });

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

  // Get execution control settings from environment
  const minProfitThreshold = parseFloat(process.env.POLY_MIN_PROFIT_USD || '0.01');
  const maxOpportunitiesPerCycle = parseInt(process.env.POLY_MAX_OPPORTUNITIES_PER_CYCLE || '3', 10);
  const executeAllOpportunities = process.env.POLY_EXECUTE_ALL_OPPORTUNITIES === 'true';

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
    minProfitThreshold,
    maxOpportunitiesPerCycle,
    executeAllOpportunities,
  });

  // Calculate metrics and events for frontend reporting
  const totalOpportunitiesFound = opportunities.length + crossOpportunities.length;

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

  // Manual approval mode - create pending trades and interrupt for user review
  if (manualApprovalMode && !useMockData && allOpportunities.length > 0) {
    logInfo('📋 Manual approval mode - creating pending trades', {
      opportunityCount: allOpportunities.length,
    });

    const pendingTrades: import('../context.js').PendingTrade[] = [];
    const expiryTime = new Date(Date.now() + 30000).toISOString(); // 30 second expiry

    // Create pending trades for top opportunities (up to 3)
    for (const opportunity of allOpportunities.slice(0, 3)) {
      if (opportunity.type === 'intra') {
        const position = calculatePositionSize(
          opportunity.opp,
          state.view.approvalStatus,
          state.view.config,
        );

        if (!position || !isPositionViable(position)) {
          continue;
        }

        pendingTrades.push({
          id: `${iteration}-${Date.now()}-intra`,
          type: 'intra-market',
          createdAt: now,
          expiresAt: expiryTime,
          status: 'pending',
          intraOpportunity: opportunity.opp,
          intraPosition: {
            yesShares: position.yesShares,
            noShares: position.noShares,
            yesCostUsd: position.yesCostUsd,
            noCostUsd: position.noCostUsd,
            totalCostUsd: position.totalCostUsd,
            expectedProfitUsd: position.expectedProfitUsd,
            roi: position.roi,
          },
        });
      } else {
        const position = calculateCrossMarketPositionSize(
          opportunity.opp,
          state.view.approvalStatus,
          state.view.config,
        );

        if (!position || !isCrossMarketPositionViable(position, minProfitThreshold)) {
          continue;
        }

        pendingTrades.push({
          id: `${iteration}-${Date.now()}-cross`,
          type: 'cross-market',
          createdAt: now,
          expiresAt: expiryTime,
          status: 'pending',
          crossOpportunity: opportunity.opp,
          crossPosition: {
            shares: position.shares,
            sellRevenueUsd: position.sellRevenueUsd,
            buyCostUsd: position.buyCostUsd,
            netCostUsd: position.netCostUsd,
            expectedProfitUsd: position.expectedProfitUsd,
            roi: position.roi,
          },
        });
      }
    }

    if (pendingTrades.length > 0) {
      logInfo('Created pending trades for approval', {
        count: pendingTrades.length,
        expiresAt: expiryTime,
      });

      const { task, statusEvent } = buildTaskStatus(
        state.view.task,
        'working',
        `Cycle ${iteration}: Found ${pendingTrades.length} opportunities awaiting approval.`,
      );

      return {
        view: {
          task,
          markets,
          opportunities,
          crossMarketOpportunities: crossOpportunities,
          detectedRelationships: relationships,
          pendingTrades,
          userPositions,
          tradingHistory,
          portfolioValueUsd,
          metrics: {
            iteration,
            lastPoll: now,
            totalPnl: state.view.metrics.totalPnl,
            realizedPnl: state.view.metrics.realizedPnl,
            unrealizedPnl: state.view.metrics.unrealizedPnl,
            activePositions: userPositions.length,
            opportunitiesFound: state.view.metrics.opportunitiesFound + totalOpportunitiesFound,
            opportunitiesExecuted: state.view.metrics.opportunitiesExecuted,
            tradesExecuted: state.view.metrics.tradesExecuted,
            tradesFailed: state.view.metrics.tradesFailed,
          },
          events: [statusEvent, ...opportunityEvents, ...crossOpportunityEvents, ...relationshipEvents],
        },
      };
    }
  }

  // Execute top opportunities (up to 3 per cycle) - only if not in mock mode
  if (!useMockData) {
    // Need adapter for execution
    const adapter = await getAdapter();
    if (!adapter) {
      logInfo('No adapter available for execution');
    } else {
      // Get wallet address for balance checks
      const walletAddress = state.private.walletAddress;

      for (const opportunity of allOpportunities) {
        if (opportunity.type === 'intra') {
          // Execute intra-market arbitrage
          const position = calculatePositionSize(
            opportunity.opp,
            state.view.approvalStatus,
            state.view.config,
          );

          if (!position || !isPositionViable(position)) {
            logInfo('Intra-market position not viable', {
              market: opportunity.opp.marketTitle.substring(0, 30),
            });
            continue;
          }

          // Balance verification before trade
          if (walletAddress) {
            try {
              const usdcBalance = await adapter.getUSDCBalance(walletAddress);
              const requiredBalance = position.totalCostUsd * 1.05; // 5% buffer for fees

              if (usdcBalance < requiredBalance) {
                logInfo('⚠️ Insufficient USDC balance for trade', {
                  market: opportunity.opp.marketTitle.substring(0, 30),
                  required: requiredBalance.toFixed(2),
                  available: usdcBalance.toFixed(2),
                });
                continue;
              }

              logInfo('Balance check passed', {
                available: usdcBalance.toFixed(2),
                required: requiredBalance.toFixed(2),
              });
            } catch (error) {
              logInfo('Balance check failed', { error: String(error) });
              continue;
            }
          }

          // Execute or simulate trade
          if (paperTradingMode) {
            // Paper trading mode - simulate without placing real orders
            logInfo('📝 PAPER TRADE (intra-market)', {
              market: opportunity.opp.marketTitle.substring(0, 50),
              yesShares: position.yesShares,
              noShares: position.noShares,
              yesCost: position.yesCostUsd.toFixed(2),
              noCost: position.noCostUsd.toFixed(2),
              totalCost: position.totalCostUsd.toFixed(2),
              expectedProfit: position.expectedProfitUsd.toFixed(2),
            });

            // Create simulated transactions
            newTransactions.push(
              {
                id: `sim-${iteration}-${Date.now()}-yes`,
                timestamp: now,
                cycle: iteration,
                action: 'buy-yes',
                marketId: opportunity.opp.marketId,
                marketTitle: opportunity.opp.marketTitle,
                shares: position.yesShares,
                price: opportunity.opp.yesPrice,
                totalCost: position.yesCostUsd,
                status: 'simulated',
              },
              {
                id: `sim-${iteration}-${Date.now()}-no`,
                timestamp: now,
                cycle: iteration,
                action: 'buy-no',
                marketId: opportunity.opp.marketId,
                marketTitle: opportunity.opp.marketTitle,
                shares: position.noShares,
                price: opportunity.opp.noPrice,
                totalCost: position.noCostUsd,
                status: 'simulated',
              },
            );

            tradesExecuted += 2;
            opportunitiesExecuted++;
          } else {
            // Real execution
            const result = await executeArbitrage(opportunity.opp, position, adapter, iteration);
            newTransactions.push(...result.transactions);

            if (result.success) {
              tradesExecuted += 2; // YES + NO
              opportunitiesExecuted++;
            } else {
              tradesFailed += result.transactions.filter((t) => t.status === 'failed').length;
            }
          }
        } else {
          // Execute cross-market arbitrage
          const position = calculateCrossMarketPositionSize(
            opportunity.opp,
            state.view.approvalStatus,
            state.view.config,
          );

          if (!position || !isCrossMarketPositionViable(position, minProfitThreshold)) {
            logInfo('Cross-market position not viable', {
              parent: opportunity.opp.relationship.parentMarket.title.substring(0, 30),
              child: opportunity.opp.relationship.childMarket.title.substring(0, 30),
            });
            continue;
          }

          // Balance verification before trade
          if (walletAddress) {
            try {
              const usdcBalance = await adapter.getUSDCBalance(walletAddress);
              const requiredBalance = position.netCostUsd * 1.05; // 5% buffer

              if (usdcBalance < requiredBalance) {
                logInfo('⚠️ Insufficient USDC balance for cross-market trade', {
                  parent: opportunity.opp.relationship.parentMarket.title.substring(0, 30),
                  child: opportunity.opp.relationship.childMarket.title.substring(0, 30),
                  required: requiredBalance.toFixed(2),
                  available: usdcBalance.toFixed(2),
                });
                continue;
              }

              logInfo('Balance check passed', {
                available: usdcBalance.toFixed(2),
                required: requiredBalance.toFixed(2),
              });
            } catch (error) {
              logInfo('Balance check failed', { error: String(error) });
              continue;
            }
          }

          // Execute or simulate trade
          if (paperTradingMode) {
            // Paper trading mode - simulate without placing real orders
            logInfo('📝 PAPER TRADE (cross-market)', {
              relationship: opportunity.opp.relationship.type,
              parent: opportunity.opp.relationship.parentMarket.title.substring(0, 40),
              child: opportunity.opp.relationship.childMarket.title.substring(0, 40),
              shares: position.shares,
              sellPrice: opportunity.opp.trades.sellMarket.price,
              buyPrice: opportunity.opp.trades.buyMarket.price,
              sellRevenue: position.sellRevenueUsd.toFixed(2),
              buyCost: position.buyCostUsd.toFixed(2),
              netCost: position.netCostUsd.toFixed(2),
              expectedProfit: position.expectedProfitUsd.toFixed(2),
            });

            // Create simulated transactions
            newTransactions.push(
              {
                id: `sim-${iteration}-${Date.now()}-sell`,
                timestamp: now,
                cycle: iteration,
                action: 'cross-market-sell',
                marketId: opportunity.opp.trades.sellMarket.marketId,
                marketTitle: opportunity.opp.relationship.parentMarket.title,
                shares: position.shares,
                price: opportunity.opp.trades.sellMarket.price,
                totalCost: -position.sellRevenueUsd, // Negative because we collect revenue
                status: 'simulated',
              },
              {
                id: `sim-${iteration}-${Date.now()}-buy`,
                timestamp: now,
                cycle: iteration,
                action: 'cross-market-buy',
                marketId: opportunity.opp.trades.buyMarket.marketId,
                marketTitle: opportunity.opp.relationship.childMarket.title,
                shares: position.shares,
                price: opportunity.opp.trades.buyMarket.price,
                totalCost: position.buyCostUsd,
                status: 'simulated',
              },
            );

            tradesExecuted += 2;
            opportunitiesExecuted++;
          } else {
            // Real execution
            const result = await executeCrossMarketArbitrage(opportunity.opp, position, adapter, iteration);
            newTransactions.push(...result.transactions);

            if (result.success) {
              tradesExecuted += 2; // SELL + BUY
              opportunitiesExecuted++;
            } else {
              tradesFailed += result.transactions.filter((t) => t.status === 'failed').length;
            }
          }
        }

        // Limit opportunities per cycle (unless EXECUTE_ALL is true)
        if (!executeAllOpportunities && opportunitiesExecuted >= maxOpportunitiesPerCycle) {
          logInfo('Max opportunities per cycle reached', {
            executed: opportunitiesExecuted,
            maxAllowed: maxOpportunitiesPerCycle,
          });
          break;
        }
      }
    }
  } else {
    logInfo('Mock mode: Skipping trade execution');
  }

  // Step 6: Report to frontend
  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'working',
    `Cycle ${iteration}: Scanned ${markets.length} markets, found ${totalOpportunitiesFound} opportunities (${opportunities.length} intra, ${crossOpportunities.length} cross).`,
  );

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

  console.log('[POLL CYCLE] Final return with positions/history:', {
    userPositions: userPositions.length,
    tradingHistory: tradingHistory.length,
    portfolioValueUsd,
  });

  return {
    view: {
      task,
      markets,
      opportunities,
      crossMarketOpportunities: crossOpportunities,
      detectedRelationships: relationships,
      userPositions,
      tradingHistory,
      portfolioValueUsd,
      transactionHistory: [...state.view.transactionHistory, ...newTransactions],
      metrics: {
        iteration,
        lastPoll: now,
        totalPnl: state.view.metrics.totalPnl,
        realizedPnl: state.view.metrics.realizedPnl,
        unrealizedPnl: state.view.metrics.unrealizedPnl,
        activePositions: userPositions.length,
        opportunitiesFound: state.view.metrics.opportunitiesFound + totalOpportunitiesFound,
        opportunitiesExecuted: state.view.metrics.opportunitiesExecuted + opportunitiesExecuted,
        tradesExecuted: state.view.metrics.tradesExecuted + tradesExecuted,
        tradesFailed: state.view.metrics.tradesFailed + tradesFailed,
      },
      events: [statusEvent, ...opportunityEvents, ...crossOpportunityEvents, ...relationshipEvents],
    },
  };
}

/**
 * Polymarket Strategy - Trade Executor
 *
 * Executes both intra-market and cross-market arbitrage trades.
 * Uses the PolymarketAdapter plugin for all order execution.
 */

import type {
  ArbitrageOpportunity,
  CrossMarketOpportunity,
  Transaction,
} from '../workflow/context.js';
import type { PositionSize, CrossMarketPositionSize } from './evaluator.js';
import { logInfo } from '../workflow/context.js';
import type { IPolymarketAdapter } from '../clients/polymarketClient.js';
import { v7 as uuidv7 } from 'uuid';

/**
 * Result of executing an arbitrage trade.
 */
export interface ExecutionResult {
  success: boolean;
  transactions: Transaction[];
  error?: string;
  totalCostUsd?: number;
  expectedProfitUsd?: number;
}

/**
 * Order status monitoring result.
 */
export interface OrderMonitoringResult {
  orderId: string;
  status: 'open' | 'filled' | 'partially_filled' | 'cancelled';
  sizeFilled: string;
  sizeRemaining: string;
  lastChecked: string;
}

/**
 * Monitor order status for a list of transactions with order IDs.
 * Returns updated status for each order.
 *
 * @param transactions - List of transactions to monitor (must have orderId)
 * @param adapter - Polymarket adapter for querying order status
 * @returns Array of monitoring results
 */
export async function monitorOrderStatus(
  transactions: Transaction[],
  adapter: IPolymarketAdapter,
): Promise<OrderMonitoringResult[]> {
  const results: OrderMonitoringResult[] = [];

  logInfo('Monitoring order status', {
    transactionCount: transactions.length,
    orderIds: transactions.map((t) => t.orderId).filter(Boolean),
  });

  for (const tx of transactions) {
    if (!tx.orderId) {
      // Skip transactions without order IDs
      continue;
    }

    try {
      const status = await adapter.getOrderStatus(tx.orderId);

      results.push({
        orderId: tx.orderId,
        status: status.status,
        sizeFilled: status.sizeFilled,
        sizeRemaining: status.sizeRemaining,
        lastChecked: new Date().toISOString(),
      });

      logInfo('Order status checked', {
        orderId: tx.orderId.substring(0, 16) + '...',
        status: status.status,
        filled: status.sizeFilled,
        remaining: status.sizeRemaining,
      });
    } catch (error) {
      logInfo('Failed to check order status', {
        orderId: tx.orderId,
        error: String(error),
      });
    }
  }

  return results;
}

/**
 * Wait for orders to be filled with timeout.
 * Polls order status until all orders are filled or timeout is reached.
 *
 * @param transactions - List of transactions to monitor
 * @param adapter - Polymarket adapter for querying order status
 * @param timeoutMs - Maximum time to wait in milliseconds (default: 30 seconds)
 * @param pollIntervalMs - How often to check status in milliseconds (default: 5 seconds)
 * @returns True if all orders filled, false if timeout or partial fill
 */
export async function waitForOrderFill(
  transactions: Transaction[],
  adapter: IPolymarketAdapter,
  timeoutMs: number = 30000,
  pollIntervalMs: number = 5000,
): Promise<boolean> {
  const orderIds = transactions.map((t) => t.orderId).filter((id): id is string => !!id);

  if (orderIds.length === 0) {
    logInfo('No order IDs to monitor');
    return false;
  }

  logInfo('Waiting for order fills', {
    orderCount: orderIds.length,
    timeoutMs,
    pollIntervalMs,
  });

  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const results = await monitorOrderStatus(transactions, adapter);

    // Check if all orders are filled
    const allFilled = results.every((r) => r.status === 'filled');

    if (allFilled) {
      logInfo('✅ All orders filled', {
        elapsed: Date.now() - startTime,
        orderCount: results.length,
      });
      return true;
    }

    // Check for cancelled orders
    const cancelled = results.filter((r) => r.status === 'cancelled');
    if (cancelled.length > 0) {
      logInfo('⚠️ Some orders were cancelled', {
        cancelledCount: cancelled.length,
        orderIds: cancelled.map((r) => r.orderId.substring(0, 16)),
      });
      return false;
    }

    // Log partial fills
    const partialFills = results.filter((r) => r.status === 'partially_filled');
    if (partialFills.length > 0) {
      logInfo('⏳ Partial fills detected', {
        partialCount: partialFills.length,
        elapsed: Date.now() - startTime,
      });
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  // Timeout reached
  const finalResults = await monitorOrderStatus(transactions, adapter);
  const filled = finalResults.filter((r) => r.status === 'filled').length;

  logInfo('⏱️ Order monitoring timeout', {
    timeoutMs,
    filledCount: filled,
    totalCount: finalResults.length,
  });

  return false;
}

/**
 * Execute an intra-market arbitrage trade using the plugin.
 *
 * Uses:
 * - adapter.createLongPosition() for YES tokens
 * - adapter.createShortPosition() for NO tokens
 */
export async function executeArbitrage(
  opportunity: ArbitrageOpportunity,
  position: PositionSize,
  adapter: IPolymarketAdapter,
  cycle: number,
): Promise<ExecutionResult> {
  const transactions: Transaction[] = [];
  const timestamp = new Date().toISOString();

  logInfo('Executing arbitrage via plugin', {
    market: opportunity.marketTitle.substring(0, 50),
    yesShares: position.yesShares,
    noShares: position.noShares,
  });

  try {
    // Step 1: BUY YES tokens via adapter.createLongPosition()
    const yesTransaction: Transaction = {
      id: uuidv7(),
      cycle,
      action: 'buy-yes',
      marketId: opportunity.marketId,
      marketTitle: opportunity.marketTitle,
      shares: position.yesShares,
      price: opportunity.yesPrice,
      totalCost: position.yesCostUsd,
      status: 'pending',
      timestamp,
    };

    logInfo('Calling adapter.createLongPosition()', {
      yesTokenId: opportunity.yesTokenId.substring(0, 20) + '...',
      shares: position.yesShares,
    });

    const yesResult = await adapter.createLongPosition({
      marketAddress: opportunity.yesTokenId,
      amount: position.yesShares.toString(),
      limitPrice: opportunity.yesPrice.toString(),
      chainId: '137',
    });

    const yesOrderId = yesResult.orderId;
    if (!yesOrderId) {
      yesTransaction.status = 'failed';
      yesTransaction.error = 'No order ID returned';
      transactions.push(yesTransaction);
      return { success: false, transactions, error: 'Failed to place YES order' };
    }

    yesTransaction.status = 'success';
    yesTransaction.orderId = yesOrderId;
    transactions.push(yesTransaction);
    logInfo('YES order placed', { orderId: yesOrderId });

    // Step 2: BUY NO tokens via adapter.createShortPosition()
    const noTransaction: Transaction = {
      id: uuidv7(),
      cycle,
      action: 'buy-no',
      marketId: opportunity.marketId,
      marketTitle: opportunity.marketTitle,
      shares: position.noShares,
      price: opportunity.noPrice,
      totalCost: position.noCostUsd,
      status: 'pending',
      timestamp: new Date().toISOString(),
    };

    logInfo('Calling adapter.createShortPosition()', {
      yesTokenId: opportunity.yesTokenId.substring(0, 20) + '...',
      shares: position.noShares,
    });

    const noResult = await adapter.createShortPosition({
      marketAddress: opportunity.yesTokenId,
      amount: position.noShares.toString(),
      limitPrice: opportunity.noPrice.toString(),
      chainId: '137',
    });

    const noOrderId = noResult.orderId;
    if (!noOrderId) {
      noTransaction.status = 'failed';
      noTransaction.error = 'No order ID returned';
      transactions.push(noTransaction);
      return { success: false, transactions, error: 'Failed to place NO order' };
    }

    noTransaction.status = 'success';
    noTransaction.orderId = noOrderId;
    transactions.push(noTransaction);
    logInfo('NO order placed', { orderId: noOrderId });

    return {
      success: true,
      transactions,
      totalCostUsd: position.totalCostUsd,
      expectedProfitUsd: position.expectedProfitUsd,
    };
  } catch (error) {
    logInfo('Execution failed', { error: String(error) });
    return { success: false, transactions, error: String(error) };
  }
}

// ============================================================================
// Cross-Market Arbitrage Execution
// ============================================================================

/**
 * Execute a cross-market arbitrage trade.
 *
 * For IMPLIES relationship violation (A → B where P(A) > P(B)):
 * 1. SELL Market A YES tokens (collect premium)
 * 2. BUY Market B YES tokens (pay cost)
 *
 * The strategy is sequential to handle failures gracefully:
 * - If sell fails, we stop (no capital risked)
 * - If sell succeeds but buy fails, we're exposed on the sell side
 *   (this is a risk, but we still collected the sell premium)
 *
 * @param opportunity - The cross-market arbitrage opportunity
 * @param position - The calculated position size
 * @param adapter - Polymarket adapter for trade execution
 * @param cycle - Current execution cycle number
 * @returns Execution result with transaction details
 */
export async function executeCrossMarketArbitrage(
  opportunity: CrossMarketOpportunity,
  position: CrossMarketPositionSize,
  adapter: IPolymarketAdapter,
  cycle: number,
): Promise<ExecutionResult> {
  const transactions: Transaction[] = [];
  const timestamp = new Date().toISOString();

  logInfo('Executing cross-market arbitrage', {
    type: opportunity.relationship.type,
    parent: opportunity.relationship.parentMarket.title.substring(0, 40),
    child: opportunity.relationship.childMarket.title.substring(0, 40),
    shares: position.shares,
    sellPrice: opportunity.trades.sellMarket.price.toFixed(4),
    buyPrice: opportunity.trades.buyMarket.price.toFixed(4),
    expectedProfit: position.expectedProfitUsd.toFixed(3),
  });

  try {
    // Step 1: SELL the overpriced market (collect premium)
    const sellMarketId = opportunity.trades.sellMarket.marketId;
    const sellOutcome = opportunity.trades.sellMarket.outcome;
    const sellPrice = opportunity.trades.sellMarket.price;

    // Find the token ID for the market we're selling
    const sellMarket = opportunity.relationship.parentMarket;
    const sellTokenId = sellOutcome === 'yes' ? sellMarket.yesTokenId : sellMarket.noTokenId;

    const sellTransaction: Transaction = {
      id: uuidv7(),
      cycle,
      action: 'cross-market-sell',
      marketId: sellMarketId,
      marketTitle: sellMarket.title,
      shares: position.shares,
      price: sellPrice,
      totalCost: -position.sellRevenueUsd, // Negative because we collect revenue
      status: 'pending',
      timestamp,
    };

    logInfo('Selling overpriced market', {
      market: sellMarket.title.substring(0, 40),
      outcome: sellOutcome,
      shares: position.shares,
      price: sellPrice.toFixed(4),
    });

    // Execute "sell" by BUYING the OPPOSITE outcome
    // Note: Polymarket doesn't support selling tokens you don't own (no naked shorting)
    // Instead, we buy the opposite outcome which is economically equivalent
    // Example: To bet AGAINST "YES at $0.75", we BUY "NO at $0.25"
    const oppositeOutcome = sellOutcome === 'yes' ? 'no' : 'yes';
    const oppositePrice = 1.0 - sellPrice;

    const sellResult = await adapter.placeOrder({
      marketId: sellMarketId,
      outcomeId: oppositeOutcome,  // Buy the OPPOSITE outcome
      side: 'buy',                  // BUY, not sell!
      size: position.shares.toString(),
      price: oppositePrice.toString(), // Complement price
      chainId: '137',
    });

    if (!sellResult.success || !sellResult.orderId) {
      sellTransaction.status = 'failed';
      sellTransaction.error = sellResult.error || 'No order ID returned';
      transactions.push(sellTransaction);
      return {
        success: false,
        transactions,
        error: `Failed to sell ${sellMarket.title}: ${sellResult.error}`,
      };
    }

    sellTransaction.status = 'success';
    sellTransaction.orderId = sellResult.orderId;
    transactions.push(sellTransaction);
    logInfo('Sell order placed successfully', { orderId: sellResult.orderId });

    // Step 2: BUY the underpriced market
    const buyMarketId = opportunity.trades.buyMarket.marketId;
    const buyOutcome = opportunity.trades.buyMarket.outcome;
    const buyPrice = opportunity.trades.buyMarket.price;

    const buyMarket = opportunity.relationship.childMarket;
    const buyTokenId = buyOutcome === 'yes' ? buyMarket.yesTokenId : buyMarket.noTokenId;

    const buyTransaction: Transaction = {
      id: uuidv7(),
      cycle,
      action: 'cross-market-buy',
      marketId: buyMarketId,
      marketTitle: buyMarket.title,
      shares: position.shares,
      price: buyPrice,
      totalCost: position.buyCostUsd,
      status: 'pending',
      timestamp: new Date().toISOString(),
    };

    logInfo('Buying underpriced market', {
      market: buyMarket.title.substring(0, 40),
      outcome: buyOutcome,
      shares: position.shares,
      price: buyPrice.toFixed(4),
    });

    // Execute buy order
    const buyResult = await adapter.placeOrder({
      marketId: buyMarketId,
      outcomeId: buyOutcome,
      side: 'buy',
      size: position.shares.toString(),
      price: buyPrice.toString(),
      chainId: '137',
    });

    if (!buyResult.success || !buyResult.orderId) {
      buyTransaction.status = 'failed';
      buyTransaction.error = buyResult.error || 'No order ID returned';
      transactions.push(buyTransaction);

      logInfo('⚠️ Cross-market trade partially failed', {
        sellSuccess: true,
        buySuccess: false,
        risk: 'Exposed on sell side',
      });

      return {
        success: false,
        transactions,
        error: `Sell succeeded but buy failed: ${buyResult.error}`,
      };
    }

    buyTransaction.status = 'success';
    buyTransaction.orderId = buyResult.orderId;
    transactions.push(buyTransaction);
    logInfo('Buy order placed successfully', { orderId: buyResult.orderId });

    // Success! Both legs executed
    logInfo('✓ Cross-market arbitrage executed successfully', {
      sellRevenue: position.sellRevenueUsd.toFixed(2),
      buyCost: position.buyCostUsd.toFixed(2),
      netCost: position.netCostUsd.toFixed(2),
      expectedProfit: position.expectedProfitUsd.toFixed(3),
      transactionCount: transactions.length,
    });

    return {
      success: true,
      transactions,
      totalCostUsd: Math.abs(position.netCostUsd),
      expectedProfitUsd: position.expectedProfitUsd,
    };
  } catch (error) {
    logInfo('Cross-market execution failed', { error: String(error) });
    return {
      success: false,
      transactions,
      error: `Cross-market execution error: ${String(error)}`,
    };
  }
}

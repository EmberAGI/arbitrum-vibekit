/**
 * Polymarket Strategy - Trade Executor
 *
 * Executes arbitrage trades using the PolymarketAdapter from the plugin.
 * This module directly calls:
 * - adapter.createLongPosition() for YES tokens
 * - adapter.createShortPosition() for NO tokens
 */

import type {
  ArbitrageOpportunity,
  Transaction,
} from '../workflow/context.js';
import type { PositionSize } from './evaluator.js';
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

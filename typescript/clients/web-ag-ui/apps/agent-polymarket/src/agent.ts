/**
 * Polymarket Arbitrage Agent
 *
 * LangGraph-based workflow for automated arbitrage trading on Polymarket.
 *
 * This agent:
 * 1. Monitors prediction markets for intra-market arbitrage opportunities
 * 2. Executes trades when YES + NO prices sum to less than $1.00
 * 3. Tracks positions and PnL over time
 * 4. Provides lifecycle management (hire/fire/sync)
 */

import { pathToFileURL } from 'node:url';

import { END, START, StateGraph } from '@langchain/langgraph';
import { v7 as uuidv7 } from 'uuid';

import {
  PolymarketStateAnnotation,
  memory,
  logInfo,
  type PolymarketState,
} from './workflow/context.js';

// Import workflow nodes
import { bootstrapNode } from './workflow/nodes/bootstrap.js';
import { runCommandNode, resolveCommandTarget } from './workflow/nodes/runCommand.js';
import { hireCommandNode } from './workflow/nodes/hireCommand.js';
import { fireCommandNode } from './workflow/nodes/fireCommand.js';
import { syncStateNode } from './workflow/nodes/syncState.js';
import { runCycleCommandNode } from './workflow/nodes/runCycleCommand.js';
import { pollCycleNode } from './workflow/nodes/pollCycle.js';
import { summarizeNode } from './workflow/nodes/summarize.js';
import { checkApprovalsNode } from './workflow/nodes/checkApprovals.js';
import { collectApprovalAmountNode } from './workflow/nodes/collectApprovalAmount.js';
import { collectTradeApprovalNode } from './workflow/nodes/collectTradeApproval.js';
import { syncPositionsNode } from './workflow/nodes/syncPositions.js';
import { redeemPositionsNode } from './workflow/nodes/redeemPositions.js';

// ============================================================================
// Graph Definition
// ============================================================================

/**
 * Routes after bootstrap - always check approvals first.
 */
function resolvePostBootstrap(state: PolymarketState): 'checkApprovals' | 'syncState' {
  // If lifecycle is running, check approvals before trading
  if (state.view.lifecycleState === 'running') {
    return 'checkApprovals';
  }
  // Otherwise just sync state (agent not active)
  return 'syncState';
}

/**
 * Routes after pollCycle - check if there are pending trades awaiting approval.
 */
function resolvePostPollCycle(state: PolymarketState): 'collectTradeApproval' | 'summarize' {
  // If there are pending trades, go to approval flow
  if (state.view.pendingTrades && state.view.pendingTrades.length > 0) {
    return 'collectTradeApproval';
  }
  // Otherwise summarize and end cycle
  return 'summarize';
}

/**
 * Routes after summarize - check if we should sync positions/redeem.
 */
function resolvePostSummarize(
  state: PolymarketState,
): 'syncPositions' | 'redeemPositions' | typeof END {
  // Check if position syncing is enabled (default: true)
  const syncEnabled = process.env.POLY_SYNC_POSITIONS !== 'false';

  // Check if auto-redemption is enabled (default: false for safety)
  const redeemEnabled = process.env.POLY_AUTO_REDEEM === 'true';

  // Sync positions on every 5th cycle to keep data fresh
  if (syncEnabled && state.view.metrics.iteration % 5 === 0) {
    return 'syncPositions';
  }

  // Check for redemptions on every 10th cycle (less frequent)
  if (redeemEnabled && state.view.metrics.iteration % 10 === 0) {
    return 'redeemPositions';
  }

  // Otherwise end
  return END;
}

const workflow = new StateGraph(PolymarketStateAnnotation)
  // Command nodes
  .addNode('runCommand', runCommandNode)
  .addNode('hireCommand', hireCommandNode)
  .addNode('fireCommand', fireCommandNode)
  .addNode('runCycleCommand', runCycleCommandNode)
  .addNode('syncState', syncStateNode)

  // Setup nodes
  .addNode('bootstrap', bootstrapNode)
  .addNode('checkApprovals', checkApprovalsNode)
  .addNode('collectApprovalAmount', collectApprovalAmountNode)

  // Strategy nodes
  .addNode('pollCycle', pollCycleNode)
  .addNode('collectTradeApproval', collectTradeApprovalNode)
  .addNode('summarize', summarizeNode)

  // Position management nodes
  .addNode('syncPositions', syncPositionsNode)
  .addNode('redeemPositions', redeemPositionsNode)

  // Edges from START
  .addEdge(START, 'runCommand')

  // Command routing
  .addConditionalEdges('runCommand', resolveCommandTarget)

  // Hire flow (with automatic approval handling)
  .addEdge('hireCommand', 'bootstrap')
  .addConditionalEdges('bootstrap', resolvePostBootstrap)

  // Note: Approvals are handled automatically in checkApprovals node
  // No interrupt needed - agent signs with its own private key

  // Fire flow
  .addEdge('fireCommand', END)

  // Sync flow
  .addEdge('syncState', END)

  // Cycle flow (with trade approval check)
  .addEdge('runCycleCommand', 'checkApprovals')
  .addConditionalEdges('pollCycle', resolvePostPollCycle) // Route based on pending trades
  .addConditionalEdges('summarize', resolvePostSummarize) // Route to position management or end

  // Position management flow
  .addEdge('syncPositions', END)
  .addEdge('redeemPositions', END);

export const polymarketGraph = workflow.compile({
  checkpointer: memory,
});

// ============================================================================
// Cron Scheduler (for periodic execution)
// ============================================================================

const runningThreads = new Set<string>();
let cronInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Run a single graph execution for the given thread.
 */
export async function runGraphOnce(threadId: string): Promise<void> {
  if (runningThreads.has(threadId)) {
    logInfo('Skipping tick - run already in progress', { threadId });
    return;
  }

  runningThreads.add(threadId);
  const startedAt = Date.now();
  logInfo('Starting graph run', { threadId });

  const runMessage = {
    id: uuidv7(),
    role: 'user' as const,
    content: JSON.stringify({ command: 'cycle' }),
  };

  try {
    // Rewind to runCommand to restart the cycle
    await polymarketGraph.updateState(
      { configurable: { thread_id: threadId } },
      { messages: [runMessage], view: { command: 'cycle' } },
      'runCommand',
    );

    // Run the graph
    await polymarketGraph.invoke(null, {
      configurable: { thread_id: threadId },
      callbacks: [],
    });

    logInfo(`Graph run complete in ${Date.now() - startedAt}ms`);
  } catch (error) {
    logInfo('Graph run failed', { error: String(error) });
  } finally {
    runningThreads.delete(threadId);
  }
}

/**
 * Start the cron scheduler for periodic arbitrage checks.
 */
export function startCron(threadId: string, intervalMs: number = 30000): void {
  if (cronInterval) {
    logInfo('Cron already running');
    return;
  }

  logInfo('Starting cron scheduler', { threadId, intervalMs });

  cronInterval = setInterval(() => {
    void runGraphOnce(threadId);
  }, intervalMs);
}

/**
 * Stop the cron scheduler.
 */
export function stopCron(): void {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
    logInfo('Cron scheduler stopped');
  }
}

// ============================================================================
// Entry Point
// ============================================================================

/**
 * Start the Polymarket agent with initial hire command.
 */
export async function startPolymarketAgent(threadId: string): Promise<void> {
  const initialMessage = {
    id: uuidv7(),
    role: 'user' as const,
    content: JSON.stringify({ command: 'hire' }),
  };

  logInfo('Starting Polymarket agent', { threadId });

  // Run initial hire flow
  const stream = await polymarketGraph.stream(
    { messages: [initialMessage] },
    { configurable: { thread_id: threadId } },
  );

  // Consume stream to completion
  for await (const event of stream) {
    void event;
  }

  logInfo('Initial hire complete, starting cron');

  // Start periodic polling
  const pollInterval = parseInt(process.env['POLY_POLL_INTERVAL_MS'] ?? '30000', 10);
  startCron(threadId, pollInterval);
}

// ============================================================================
// CLI Entry Point
// ============================================================================

const invokedAsEntryPoint =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedAsEntryPoint) {
  const threadId = process.env['POLY_THREAD_ID'] ?? uuidv7();

  if (!process.env['POLY_THREAD_ID']) {
    logInfo('POLY_THREAD_ID not provided; generated thread id', { threadId });
  }

  await startPolymarketAgent(threadId);
}

// ============================================================================
// Exports
// ============================================================================

export type {
  PolymarketState,
  PolymarketUpdate,
  Market,
  Position,
  ArbitrageOpportunity,
  Transaction,
  StrategyConfig,
  PolymarketMetrics,
  LifecycleState,
  TaskState,
  PolymarketEvent,
} from './workflow/context.js';

export { DEFAULT_STRATEGY_CONFIG } from './workflow/context.js';

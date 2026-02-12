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
import cron, { type ScheduledTask } from 'node-cron';
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
import { updateApprovalCommandNode } from './workflow/nodes/updateApprovalCommand.js';
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
 * Routes after summarize - check if we should sync positions/redeem, otherwise end.
 */
function resolvePostSummarize(state: PolymarketState): 'syncPositions' | 'redeemPositions' | typeof END {
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
    console.log(`[Cycle ${state.view.metrics.iteration}] 🔄 Triggering redemption check`);
    return 'redeemPositions';
  }

  // Otherwise end - external cron will trigger next cycle
  return END;
}

const workflow = new StateGraph(PolymarketStateAnnotation)
  // Command nodes
  .addNode('runCommand', runCommandNode)
  .addNode('hireCommand', hireCommandNode)
  .addNode('fireCommand', fireCommandNode)
  .addNode('runCycleCommand', runCycleCommandNode)
  .addNode('updateApprovalCommand', updateApprovalCommandNode)
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

  // Update approval flow (from Settings tab)
  .addEdge('updateApprovalCommand', 'checkApprovals')

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
const cronJobs = new Map<string, ScheduledTask>();

/**
 * Convert interval in milliseconds to cron expression.
 */
function toCronExpression(intervalMs: number): string {
  const intervalSeconds = Math.max(1, Math.round(intervalMs / 1000));

  // For intervals less than 60 seconds, use seconds syntax
  if (intervalSeconds < 60) {
    return `*/${intervalSeconds} * * * * *`;
  }

  // For clean minute multiples, use minutes syntax
  if (intervalSeconds % 60 === 0) {
    const minutes = Math.max(1, Math.floor(intervalSeconds / 60));
    return `0 */${minutes} * * * *`;
  }

  // For non-clean intervals, clamp to max 59 seconds
  const clampedSeconds = Math.min(59, intervalSeconds);
  console.warn(
    `[cron] Requested interval ${intervalMs}ms is not a clean minute multiple; clamping to ${clampedSeconds}s cron schedule.`,
  );
  return `*/${clampedSeconds} * * * * *`;
}

/**
 * Run a single graph execution for the given thread.
 */
export async function runGraphOnce(threadId: string): Promise<void> {
  if (runningThreads.has(threadId)) {
    console.log('⏭️ [CRON] Skipping tick - run already in progress');
    logInfo('Skipping tick - run already in progress', { threadId });
    return;
  }

  console.log('🔄 [CRON] Starting new poll cycle');
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

    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`✅ [CRON] Poll cycle complete (${elapsedSec}s)`);
    logInfo(`Graph run complete in ${Date.now() - startedAt}ms`);
  } catch (error) {
    console.log('❌ [CRON] Graph run failed:', String(error));
    logInfo('Graph run failed', { error: String(error) });
  } finally {
    runningThreads.delete(threadId);
  }
}

/**
 * Start the cron scheduler for periodic arbitrage checks.
 */
export function startCron(threadId: string, intervalMs: number = 300000): void {
  if (cronJobs.has(threadId)) {
    console.log('⚠️ [CRON] Cron already scheduled for this thread');
    logInfo('Cron already scheduled', { threadId });
    return;
  }

  const cronExpression = toCronExpression(intervalMs);
  const intervalSec = (intervalMs / 1000).toFixed(0);
  console.log(`⏰ [CRON] Starting cron scheduler (every ${intervalSec}s)`);
  console.log(`Thread ID: ${threadId}`);
  console.log(`Cron expression: ${cronExpression}`);
  logInfo('Starting cron scheduler', { threadId, intervalMs, cronExpression });

  let tickCount = 0;
  const job = cron.schedule(cronExpression, () => {
    tickCount++;
    console.log(`\n⏰ [CRON] Tick #${tickCount} - ${new Date().toISOString()}`);
    void runGraphOnce(threadId);
  });

  cronJobs.set(threadId, job);
}

/**
 * Stop the cron scheduler for a specific thread.
 */
export function stopCron(threadId: string): void {
  const job = cronJobs.get(threadId);
  if (job) {
    job.stop();
    cronJobs.delete(threadId);
    console.log(`⏹️ [CRON] Stopped cron for thread ${threadId}`);
    logInfo('Cron scheduler stopped', { threadId });
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

  // Start periodic polling (default: 5 minutes)
  const pollInterval = parseInt(process.env['POLY_POLL_INTERVAL_MS'] ?? '300000', 10);
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

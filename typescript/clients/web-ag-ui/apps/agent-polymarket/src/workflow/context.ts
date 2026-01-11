/**
 * Polymarket Agent - Workflow Context and State Types
 *
 * This module defines the state annotations and types for the Polymarket
 * arbitrage agent, following the agent-clmm pattern.
 */

import type { CopilotKitState } from '@copilotkit/sdk-js/langgraph';
import type { AIMessage as CopilotKitAIMessage } from '@copilotkit/shared';
import { Annotation, MemorySaver, messagesStateReducer } from '@langchain/langgraph';
import type { Messages } from '@langchain/langgraph';
import { v7 as uuidv7 } from 'uuid';

// Re-export agent message type
export type AgentMessage = CopilotKitAIMessage;
type CopilotState = CopilotKitState;

// ============================================================================
// Task States (A2A Compatible)
// ============================================================================

export type TaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'canceled'
  | 'failed'
  | 'rejected'
  | 'unknown';

export type TaskStatus = {
  state: TaskState;
  message?: AgentMessage;
  timestamp?: string; // ISO 8601
};

export type Task = {
  id: string;
  taskStatus: TaskStatus;
};

// ============================================================================
// Lifecycle States
// ============================================================================

export type LifecycleState =
  | 'disabled'       // Not hired
  | 'waiting-funds'  // Hired, awaiting deposit
  | 'running'        // Actively trading
  | 'stopping'       // Closing positions
  | 'stopped';       // Ready for withdrawal

// ============================================================================
// Market Data Types
// ============================================================================

export type Market = {
  id: string;
  title: string;
  description?: string;
  yesTokenId: string;
  noTokenId: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  liquidity: number;
  endDate: string;
  resolved: boolean;
  active: boolean;
};

export type ArbitrageOpportunity = {
  marketId: string;
  marketTitle: string;
  yesTokenId: string;
  noTokenId: string;
  yesPrice: number;
  noPrice: number;
  spread: number;           // 1.0 - (yesPrice + noPrice)
  profitPotential: number;  // Expected profit per $1 invested
  timestamp: string;
};

export type Position = {
  marketId: string;
  marketTitle: string;
  tokenId: string;
  side: 'yes' | 'no';
  shares: number;
  costBasis: number;
  currentValue: number;
  unrealizedPnl: number;
};

export type TransactionAction =
  | 'buy-yes'
  | 'buy-no'
  | 'sell-yes'
  | 'sell-no'
  | 'cancel'
  | 'cancel-all'
  | 'redeem';

export type Transaction = {
  id: string;
  cycle: number;
  action: TransactionAction;
  marketId: string;
  marketTitle?: string;
  shares: number;
  price: number;
  totalCost: number;
  status: 'pending' | 'success' | 'failed';
  timestamp: string;
  orderId?: string;
  error?: string;
};

// ============================================================================
// Strategy Configuration
// ============================================================================

export type StrategyConfig = {
  /** Minimum spread (YES + NO < 1 - threshold) to consider opportunity (default: 0.02 = 2%) */
  minSpreadThreshold: number;
  /** Maximum USD value per position (default: 100) */
  maxPositionSizeUsd: number;
  /** Percentage of portfolio to risk per trade (default: 3%) */
  portfolioRiskPct: number;
  /** Polling interval in milliseconds (default: 30000 = 30s) */
  pollIntervalMs: number;
  /** Maximum total exposure across all positions (default: 500) */
  maxTotalExposureUsd: number;
};

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  minSpreadThreshold: 0.02,
  maxPositionSizeUsd: 100,
  portfolioRiskPct: 3,
  pollIntervalMs: 30000,
  maxTotalExposureUsd: 500,
};

// ============================================================================
// Metrics
// ============================================================================

export type PolymarketMetrics = {
  iteration: number;
  lastPoll?: string;
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  activePositions: number;
  opportunitiesFound: number;
  opportunitiesExecuted: number;
  tradesExecuted: number;
  tradesFailed: number;
};

const defaultMetrics = (): PolymarketMetrics => ({
  iteration: 0,
  lastPoll: undefined,
  totalPnl: 0,
  realizedPnl: 0,
  unrealizedPnl: 0,
  activePositions: 0,
  opportunitiesFound: 0,
  opportunitiesExecuted: 0,
  tradesExecuted: 0,
  tradesFailed: 0,
});

// ============================================================================
// Onboarding State
// ============================================================================

export type OnboardingState = {
  step: number;
  totalSteps: number;
  key?: string;
};

// ============================================================================
// Events for UI Updates
// ============================================================================

export type PolymarketEvent =
  | { type: 'status'; message: string; task: Task }
  | { type: 'opportunity'; opportunity: ArbitrageOpportunity }
  | { type: 'trade'; transaction: Transaction }
  | { type: 'error'; error: string };

// ============================================================================
// View State (Exposed to Frontend)
// ============================================================================

export type PolymarketViewState = {
  command?: string;
  task?: Task;
  lifecycleState: LifecycleState;
  onboarding?: OnboardingState;
  portfolioValueUsd: number;
  markets: Market[];
  positions: Position[];
  opportunities: ArbitrageOpportunity[];
  transactionHistory: Transaction[];
  metrics: PolymarketMetrics;
  config: StrategyConfig;
  events: PolymarketEvent[];
  haltReason?: string;
  executionError?: string;
};

const defaultViewState = (): PolymarketViewState => ({
  command: undefined,
  task: undefined,
  lifecycleState: 'disabled',
  onboarding: undefined,
  portfolioValueUsd: 0,
  markets: [],
  positions: [],
  opportunities: [],
  transactionHistory: [],
  metrics: defaultMetrics(),
  config: DEFAULT_STRATEGY_CONFIG,
  events: [],
  haltReason: undefined,
  executionError: undefined,
});

// ============================================================================
// Private State (Internal to Agent)
// ============================================================================

export type PolymarketPrivateState = {
  mode?: 'debug' | 'production';
  pollIntervalMs: number;
  cronScheduled: boolean;
  bootstrapped: boolean;
  walletAddress?: string;
  privateKey?: string;
};

const defaultPrivateState = (): PolymarketPrivateState => ({
  mode: undefined,
  pollIntervalMs: 30000,
  cronScheduled: false,
  bootstrapped: false,
  walletAddress: undefined,
  privateKey: undefined,
});

// ============================================================================
// State Merge Functions
// ============================================================================

const mergeAppendOrReplace = <T>(left: T[], right?: T[]): T[] => {
  if (!right) return left;
  if (right.length === 0) return left;
  if (right === left) return left;
  // Check if right is an extension of left
  if (right.length >= left.length) {
    let isPrefix = true;
    for (let i = 0; i < left.length; i++) {
      if (right[i] !== left[i]) {
        isPrefix = false;
        break;
      }
    }
    if (isPrefix) return right;
  }
  return [...left, ...right];
};

const mergeViewState = (
  left: PolymarketViewState,
  right?: Partial<PolymarketViewState>,
): PolymarketViewState => {
  if (!right) return left;

  const nextTransactions = mergeAppendOrReplace(left.transactionHistory, right.transactionHistory);
  const nextEvents = mergeAppendOrReplace(left.events, right.events);

  const nextMetrics: PolymarketMetrics = {
    iteration: right.metrics?.iteration ?? left.metrics.iteration,
    lastPoll: right.metrics?.lastPoll ?? left.metrics.lastPoll,
    totalPnl: right.metrics?.totalPnl ?? left.metrics.totalPnl,
    realizedPnl: right.metrics?.realizedPnl ?? left.metrics.realizedPnl,
    unrealizedPnl: right.metrics?.unrealizedPnl ?? left.metrics.unrealizedPnl,
    activePositions: right.metrics?.activePositions ?? left.metrics.activePositions,
    opportunitiesFound: right.metrics?.opportunitiesFound ?? left.metrics.opportunitiesFound,
    opportunitiesExecuted: right.metrics?.opportunitiesExecuted ?? left.metrics.opportunitiesExecuted,
    tradesExecuted: right.metrics?.tradesExecuted ?? left.metrics.tradesExecuted,
    tradesFailed: right.metrics?.tradesFailed ?? left.metrics.tradesFailed,
  };

  return {
    ...left,
    ...right,
    command: right.command ?? left.command,
    task: right.task ?? left.task,
    lifecycleState: right.lifecycleState ?? left.lifecycleState,
    onboarding: right.onboarding ?? left.onboarding,
    portfolioValueUsd: right.portfolioValueUsd ?? left.portfolioValueUsd,
    markets: right.markets ?? left.markets,
    positions: right.positions ?? left.positions,
    opportunities: right.opportunities ?? left.opportunities,
    config: right.config ?? left.config,
    haltReason: right.haltReason ?? left.haltReason,
    executionError: right.executionError ?? left.executionError,
    transactionHistory: nextTransactions,
    events: nextEvents,
    metrics: nextMetrics,
  };
};

const mergePrivateState = (
  left: PolymarketPrivateState,
  right?: Partial<PolymarketPrivateState>,
): PolymarketPrivateState => ({
  mode: right?.mode ?? left.mode,
  pollIntervalMs: right?.pollIntervalMs ?? left.pollIntervalMs,
  cronScheduled: right?.cronScheduled ?? left.cronScheduled,
  bootstrapped: right?.bootstrapped ?? left.bootstrapped,
  walletAddress: right?.walletAddress ?? left.walletAddress,
  privateKey: right?.privateKey ?? left.privateKey,
});

const mergeCopilotkit = (
  left: CopilotState['copilotkit'],
  right?: Partial<CopilotState['copilotkit']>,
): CopilotState['copilotkit'] => ({
  actions: right?.actions ?? left.actions ?? [],
  context: right?.context ?? left.context ?? [],
});

// ============================================================================
// State Annotation (LangGraph)
// ============================================================================

export const PolymarketStateAnnotation = Annotation.Root({
  messages: Annotation<Messages>({
    default: () => [],
    reducer: messagesStateReducer,
  }),
  copilotkit: Annotation<CopilotState['copilotkit'], Partial<CopilotState['copilotkit']>>({
    default: () => ({ actions: [], context: [] }),
    reducer: (left, right) => mergeCopilotkit(left ?? { actions: [], context: [] }, right),
  }),
  view: Annotation<PolymarketViewState, Partial<PolymarketViewState>>({
    default: defaultViewState,
    reducer: (left, right) => mergeViewState(left ?? defaultViewState(), right),
  }),
  private: Annotation<PolymarketPrivateState, Partial<PolymarketPrivateState>>({
    default: defaultPrivateState,
    reducer: (left, right) => mergePrivateState(left ?? defaultPrivateState(), right),
  }),
});

export type PolymarketState = typeof PolymarketStateAnnotation.State;
export type PolymarketUpdate = typeof PolymarketStateAnnotation.Update;

// ============================================================================
// Memory Checkpoint
// ============================================================================

export const memory = new MemorySaver();

// ============================================================================
// Helper Functions
// ============================================================================

function buildAgentMessage(message: string): AgentMessage {
  return {
    id: uuidv7(),
    role: 'assistant',
    content: message,
  };
}

export function buildTaskStatus(
  task: Task | undefined,
  state: TaskState,
  message: string,
): { task: Task; statusEvent: PolymarketEvent } {
  const timestamp = new Date().toISOString();
  const nextTask: Task = {
    id: task?.id ?? uuidv7(),
    taskStatus: {
      state,
      message: buildAgentMessage(message),
      timestamp,
    },
  };

  const statusEvent: PolymarketEvent = {
    type: 'status',
    message,
    task: nextTask,
  };

  return { task: nextTask, statusEvent };
}

export function logInfo(message: string, metadata?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const prefix = `[Polymarket][${timestamp}]`;
  if (metadata && Object.keys(metadata).length > 0) {
    console.info(`${prefix} ${message}`, metadata);
    return;
  }
  console.info(`${prefix} ${message}`);
}

export function normalizeHexAddress(value: string, label: string): `0x${string}` {
  if (!value.startsWith('0x')) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value as `0x${string}`;
}

export const isTaskTerminal = (state: TaskState) =>
  state === 'completed' ||
  state === 'failed' ||
  state === 'canceled' ||
  state === 'rejected' ||
  state === 'unknown';

export const isTaskActive = (state: TaskState) =>
  state === 'submitted' ||
  state === 'working' ||
  state === 'input-required';

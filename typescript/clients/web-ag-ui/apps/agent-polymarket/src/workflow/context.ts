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
import type {
  ApprovalStatus,
  ApprovalTransaction,
  EIP712TypedData,
  PermitSignature,
} from '../clients/approvals.js';
import type {
  TradingHistoryItem as ImportedTradingHistoryItem,
  UserPosition as ImportedUserPosition,
} from '../clients/polymarketClient.js';

// Re-export types for convenience
export type TradingHistoryItem = ImportedTradingHistoryItem;
export type UserPosition = ImportedUserPosition;

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
  /** Minimum order size in shares (fetched from CLOB API, default: 5) */
  minOrderSize?: number;
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
  /** Minimum order size in shares (from CLOB API, default: 5) */
  minOrderSize: number;
};

// ============================================================================
// Cross-Market Arbitrage Types
// ============================================================================

export type RelationshipType =
  | 'IMPLIES'           // A → B: If A happens, B must happen (P(A) ≤ P(B))
  | 'REQUIRES'          // B ← A: A requires B to happen first
  | 'MUTUAL_EXCLUSION'  // A ⊕ B: Both can't happen (P(A) + P(B) ≤ 1.00)
  | 'EQUIVALENCE';      // A ↔ B: Same event, different phrasing

export type MarketRelationship = {
  id: string;                    // Unique ID: "parentMarketId->childMarketId"
  type: RelationshipType;
  parentMarket: Market;          // For IMPLIES: the more specific/conditional market
  childMarket: Market;           // For IMPLIES: the more general/required market
  detectedAt: string;            // ISO timestamp
  confidence?: 'high' | 'medium' | 'low'; // Detection confidence
  reasoning?: string;            // LLM reasoning for why relationship exists
};

export type CrossMarketOpportunity = {
  relationship: MarketRelationship;
  violation: {
    type: 'PRICE_INVERSION' | 'SUM_EXCEEDS_ONE';
    description: string;
    severity: number;            // How much it violates (in dollars per share)
  };
  trades: {
    sellMarket: {
      marketId: string;
      outcome: 'yes' | 'no';
      price: number;
    };
    buyMarket: {
      marketId: string;
      outcome: 'yes' | 'no';
      price: number;
    };
  };
  expectedProfitPerShare: number;  // Expected profit per share
  timestamp: string;
  /** Minimum order size (max of both markets' minOrderSize) */
  minOrderSize?: number;
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
  | 'redeem'
  | 'cross-market-buy'   // Cross-market arbitrage buy leg
  | 'cross-market-sell'; // Cross-market arbitrage sell leg

export type Transaction = {
  id: string;
  cycle: number;
  action: TransactionAction;
  marketId: string;
  marketTitle?: string;
  shares: number;
  price: number;
  totalCost: number;
  status: 'pending' | 'success' | 'failed' | 'simulated';
  timestamp: string;
  orderId?: string;
  error?: string;
};


/**
 * Pending trade awaiting user approval.
 * Captures opportunity details so trades can be reviewed before execution.
 */
export type PendingTrade = {
  id: string;
  type: 'intra-market' | 'cross-market';
  createdAt: string;
  expiresAt: string; // Opportunities expire quickly, show countdown
  status: 'pending' | 'approved' | 'rejected' | 'expired';

  // Intra-market opportunity (only set if type === 'intra-market')
  intraOpportunity?: ArbitrageOpportunity;
  intraPosition?: {
    yesShares: number;
    noShares: number;
    yesCostUsd: number;
    noCostUsd: number;
    totalCostUsd: number;
    expectedProfitUsd: number;
    roi: number;
  };

  // Cross-market opportunity (only set if type === 'cross-market')
  crossOpportunity?: CrossMarketOpportunity;
  crossPosition?: {
    shares: number;
    sellRevenueUsd: number;
    buyCostUsd: number;
    netCostUsd: number;
    expectedProfitUsd: number;
    roi: number;
  };

  // User decision tracking
  rejectionReason?: string;
  approvedAt?: string;
  rejectedAt?: string;
};

// ============================================================================
// Strategy Configuration
// ============================================================================

export type StrategyConfig = {
  /** Minimum spread (YES + NO < 1 - threshold) to consider opportunity (default: 0.02 = 2%) */
  minSpreadThreshold: number;
  /** Minimum USD value per order (default: 1, cannot be lower) */
  minPositionSizeUsd: number;
  /** Maximum USD value per position (default: 100) */
  maxPositionSizeUsd: number;
  /** Percentage of portfolio to risk per trade (default: 3%) */
  portfolioRiskPct: number;
  /** Polling interval in milliseconds (default: 30000 = 30s) */
  pollIntervalMs: number;
  /** Maximum total exposure across all positions (default: 500) */
  maxTotalExposureUsd: number;
  /** Minimum share size required by Polymarket (default: 5) */
  minShareSize: number;
};

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  minSpreadThreshold: 0.02,
  minPositionSizeUsd: 1,
  maxPositionSizeUsd: 100,
  portfolioRiskPct: 3,
  pollIntervalMs: 30000,
  maxTotalExposureUsd: 500,
  minShareSize: 5,
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
  | { type: 'cross-market-opportunity'; opportunity: CrossMarketOpportunity }
  | { type: 'relationship'; relationship: MarketRelationship }
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
  userPositions: UserPosition[]; // User positions from Polymarket Data API
  opportunities: ArbitrageOpportunity[];
  crossMarketOpportunities: CrossMarketOpportunity[];
  detectedRelationships: MarketRelationship[];
  transactionHistory: Transaction[];
  tradingHistory: TradingHistoryItem[]; // Real trading history from Polymarket Data API
  pendingTrades?: PendingTrade[]; // Trades awaiting manual approval
  metrics: PolymarketMetrics;
  config: StrategyConfig;
  events: PolymarketEvent[];
  approvalStatus?: ApprovalStatus;

  // Approval flow state
  needsApprovalAmountInput?: boolean; // Signal frontend to show USDC approval amount input
  requestedApprovalAmount?: string; // USDC amount user wants to approve (e.g., "1000")
  forceApprovalUpdate?: boolean; // Flag to regenerate permit even if already approved (for Settings updates)

  // USDC Permit (gasless) state
  needsUsdcPermitSignature?: boolean; // Signal frontend to request permit signature
  usdcPermitTypedData?: EIP712TypedData; // Typed data for user to sign
  usdcPermitSignature?: PermitSignature; // Signature from user (v, r, s, deadline)

  // CTF Approval (gas required) state
  needsCtfApprovalTransaction?: boolean; // Signal frontend to request CTF approval tx
  ctfApprovalTransaction?: ApprovalTransaction; // Transaction for user to sign
  ctfApprovalTxHash?: string; // Transaction hash after user submits

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
  userPositions: [],
  opportunities: [],
  crossMarketOpportunities: [],
  detectedRelationships: [],
  transactionHistory: [],
  tradingHistory: [],
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
  walletAddress?: string; // Backend wallet address (for execution)
  userWalletAddress?: string; // User wallet address (for signing/approvals)
  privateKey?: string;
};

const defaultPrivateState = (): PolymarketPrivateState => ({
  mode: undefined,
  pollIntervalMs: 30000,
  cronScheduled: false,
  bootstrapped: false,
  walletAddress: undefined,
  userWalletAddress: undefined,
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
  console.log('[STATE MERGE] mergeViewState called');
  console.log('[STATE MERGE] Left requestedApprovalAmount:', left.requestedApprovalAmount);
  console.log('[STATE MERGE] Right requestedApprovalAmount:', right?.requestedApprovalAmount);
  console.log('[STATE MERGE] Right keys:', right ? Object.keys(right) : 'none');

  if (!right) return left;

  const nextTransactions = mergeAppendOrReplace(left.transactionHistory, right.transactionHistory);
  const nextTradingHistory = mergeAppendOrReplace(left.tradingHistory, right.tradingHistory);
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

  const merged = {
    ...left,
    ...right,
    command: right.command ?? left.command,
    task: right.task ?? left.task,
    lifecycleState: right.lifecycleState ?? left.lifecycleState,
    onboarding: right.onboarding ?? left.onboarding,
    portfolioValueUsd: right.portfolioValueUsd ?? left.portfolioValueUsd,
    markets: right.markets ?? left.markets,
    positions: right.positions ?? left.positions,
    userPositions: right.userPositions ?? left.userPositions,
    opportunities: right.opportunities ?? left.opportunities,
    crossMarketOpportunities: right.crossMarketOpportunities ?? left.crossMarketOpportunities,
    detectedRelationships: right.detectedRelationships ?? left.detectedRelationships,
    config: right.config ?? left.config,
    haltReason: right.haltReason ?? left.haltReason,
    executionError: right.executionError ?? left.executionError,
    transactionHistory: nextTransactions,
    tradingHistory: nextTradingHistory,
    events: nextEvents,
    metrics: nextMetrics,
  };

  console.log('[STATE MERGE] Merged requestedApprovalAmount:', merged.requestedApprovalAmount);

  return merged;
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
  userWalletAddress: right?.userWalletAddress ?? left.userWalletAddress,
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

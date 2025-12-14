/**
 * Shared Agent Type Definitions
 *
 * This file contains all type definitions related to agent state and interactions.
 * These types match the CopilotKit agent state shape expected from LangGraph agents.
 */

// ============================================================================
// Operator Configuration Types
// ============================================================================

/**
 * Represents a LangGraph interrupt requesting operator configuration.
 */
export interface OperatorInterrupt {
  type: string;
  message: string;
}

/**
 * Input provided by the operator to configure an agent.
 */
export interface OperatorConfigInput {
  poolAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  baseContributionUsd?: number;
}

// ============================================================================
// Pool Types
// ============================================================================

/**
 * Represents a liquidity pool that an agent can operate on.
 */
export interface Pool {
  address: string;
  token0: { symbol: string };
  token1: { symbol: string };
  feeTierBps?: number;
}

// ============================================================================
// Transaction & Telemetry Types
// ============================================================================

/**
 * A transaction executed by the agent.
 */
export interface Transaction {
  cycle: number;
  action: string;
  txHash?: string;
  status: 'success' | 'failed' | 'pending';
  reason?: string;
  timestamp?: string;
}

/**
 * A telemetry event from the agent's activity.
 */
export interface TelemetryItem {
  cycle: number;
  action: string;
  reason?: string;
  midPrice?: number;
  timestamp?: string;
}

// ============================================================================
// Agent State Types (from CopilotKit/LangGraph)
// ============================================================================

/**
 * The view portion of agent state - contains all displayable data.
 */
export interface AgentView {
  command: string;
  task?: {
    id: string;
    taskStatus?: {
      state: string;
      timestamp?: string;
    };
  };
  poolArtifact?: unknown;
  operatorInput?: unknown;
  selectedPool?: unknown;
  operatorConfig?: unknown;
  haltReason?: string;
  executionError?: string;
  profile?: AgentViewProfile;
  activity?: AgentViewActivity;
  metrics?: AgentViewMetrics;
  transactionHistory: Transaction[];
}

/**
 * Agent profile data within the view.
 */
export interface AgentViewProfile {
  agentIncome?: number;
  aum?: number;
  totalUsers?: number;
  apy?: number;
  chains: string[];
  protocols: string[];
  tokens: string[];
  pools: Pool[];
  allowedPools: Pool[];
}

/**
 * Agent activity data within the view.
 */
export interface AgentViewActivity {
  telemetry: TelemetryItem[];
  events: unknown[];
}

/**
 * Agent metrics data within the view.
 */
export interface AgentViewMetrics {
  lastSnapshot?: unknown;
  previousPrice?: number;
  cyclesSinceRebalance: number;
  staleCycles: number;
  iteration: number;
  latestCycle?: unknown;
}

/**
 * Complete agent state from CopilotKit.
 */
export interface AgentState {
  messages?: unknown[];
  settings?: {
    amount: number;
  };
  view?: AgentView;
  private?: unknown;
  copilotkit?: unknown;
}

// ============================================================================
// UI Display Types
// ============================================================================

/**
 * Simplified profile for UI display.
 */
export interface AgentProfile {
  agentIncome?: number;
  aum?: number;
  totalUsers?: number;
  apy?: number;
  chains: string[];
  protocols: string[];
  tokens: string[];
}

/**
 * Simplified metrics for UI display.
 */
export interface AgentMetrics {
  iteration?: number;
  cyclesSinceRebalance?: number;
  staleCycles?: number;
}

// ============================================================================
// Default Values
// ============================================================================

export const defaultProfile: AgentViewProfile = {
  agentIncome: undefined,
  aum: undefined,
  totalUsers: undefined,
  apy: undefined,
  chains: [],
  protocols: [],
  tokens: [],
  pools: [],
  allowedPools: [],
};

export const defaultMetrics: AgentViewMetrics = {
  lastSnapshot: undefined,
  previousPrice: undefined,
  cyclesSinceRebalance: 0,
  staleCycles: 0,
  iteration: 0,
  latestCycle: undefined,
};

export const defaultActivity: AgentViewActivity = {
  telemetry: [],
  events: [],
};

export const defaultView: AgentView = {
  command: 'idle',
  task: undefined,
  poolArtifact: undefined,
  operatorInput: undefined,
  selectedPool: undefined,
  operatorConfig: undefined,
  haltReason: undefined,
  executionError: undefined,
  profile: defaultProfile,
  activity: defaultActivity,
  metrics: defaultMetrics,
  transactionHistory: [],
};

export const initialAgentState: AgentState = {
  messages: [],
  settings: { amount: 0 },
  view: defaultView,
};


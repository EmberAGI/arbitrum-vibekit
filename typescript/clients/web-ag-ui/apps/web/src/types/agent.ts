// Agent state types matching CopilotKit/LangGraph ClmmState schema

// Task states from A2A protocol
export type TaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'canceled'
  | 'failed'
  | 'rejected'
  | 'auth-required'
  | 'unknown';

export interface TaskStatus {
  state: TaskState;
  message?: unknown;
  timestamp?: string;
}

export interface Task {
  id: string;
  taskStatus: TaskStatus;
}

// Pool types
export interface Pool {
  address: string;
  token0: { symbol: string };
  token1: { symbol: string };
  feeTierBps?: number;
}

// Transaction types
export interface Transaction {
  cycle: number;
  action: string;
  txHash?: string;
  status: 'success' | 'failed';
  reason?: string;
  timestamp: string;
}

// Telemetry types
export interface TelemetryItem {
  cycle: number;
  action: string;
  reason?: string;
  midPrice?: number;
  timestamp?: string;
}

// Event types for activity streaming
export interface Artifact {
  id: string;
  type: string;
  data: unknown;
}

export type ClmmEvent =
  | { type: 'status'; message: string; task: Task }
  | { type: 'artifact'; artifact: Artifact; append?: boolean }
  | { type: 'dispatch-response'; parts: Array<{ kind: string; data: unknown }> };

// Interrupt types
export type FundingTokenOption = {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  balance: string;
  valueUsd?: number;
};

export type OperatorConfigRequestInterrupt = {
  type: 'operator-config-request';
  message: string;
  payloadSchema?: Record<string, unknown>;
  artifactId?: string;
};

export type PendleSetupRequestInterrupt = {
  type: 'pendle-setup-request';
  message: string;
  payloadSchema?: Record<string, unknown>;
};

export type GmxSetupRequestInterrupt = {
  type: 'gmx-setup-request';
  message: string;
  payloadSchema?: Record<string, unknown>;
};

export type FundingTokenRequestInterrupt = {
  type: 'clmm-funding-token-request' | 'pendle-funding-token-request' | 'gmx-funding-token-request';
  message: string;
  payloadSchema?: unknown;
  options: FundingTokenOption[];
};

export type DelegationCaveat = {
  enforcer: `0x${string}`;
  terms: `0x${string}`;
  args: `0x${string}`;
};

export type UnsignedDelegation = {
  delegate: `0x${string}`;
  delegator: `0x${string}`;
  authority: `0x${string}`;
  caveats: DelegationCaveat[];
  salt: `0x${string}`;
};

export type SignedDelegation = UnsignedDelegation & {
  signature: `0x${string}`;
};

export type DelegationSigningRequestInterrupt = {
  type:
    | 'clmm-delegation-signing-request'
    | 'pendle-delegation-signing-request'
    | 'gmx-delegation-signing-request';
  message: string;
  payloadSchema?: unknown;
  chainId: number;
  delegationManager: `0x${string}`;
  delegatorAddress: `0x${string}`;
  delegateeAddress: `0x${string}`;
  delegationsToSign: UnsignedDelegation[];
  descriptions: string[];
  warnings: string[];
};

export type AgentInterrupt =
  | OperatorConfigRequestInterrupt
  | PendleSetupRequestInterrupt
  | GmxSetupRequestInterrupt
  | FundingTokenRequestInterrupt
  | DelegationSigningRequestInterrupt;

// Input types for interrupt resolution
export interface OperatorConfigInput {
  poolAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  baseContributionUsd: number;
}

export interface PendleSetupInput {
  walletAddress: `0x${string}`;
  baseContributionUsd: number;
}

export interface GmxSetupInput {
  walletAddress: `0x${string}`;
  baseContributionUsd: number;
  targetMarket: 'BTC' | 'ETH';
}

export interface FundingTokenInput {
  fundingTokenAddress: `0x${string}`;
}

export interface DelegationSigningResponseSigned {
  outcome: 'signed';
  signedDelegations: SignedDelegation[];
}

export interface DelegationSigningResponseRejected {
  outcome: 'rejected';
}

export type DelegationSigningResponse =
  | DelegationSigningResponseSigned
  | DelegationSigningResponseRejected;

// Onboarding state
export type OnboardingState = {
  step: number;
  totalSteps?: number;
  key?: string;
};

// Profile types (ClmmProfile)
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

// Activity types (ClmmActivity)
export interface AgentViewActivity {
  telemetry: TelemetryItem[];
  events: ClmmEvent[];
}

// Metrics types (ClmmMetrics)
export interface AgentViewMetrics {
  lastSnapshot?: Pool;
  previousPrice?: number;
  cyclesSinceRebalance: number;
  staleCycles: number;
  rebalanceCycles?: number;
  iteration: number;
  latestCycle?: TelemetryItem;
  aumUsd?: number;
  apy?: number;
  lifetimePnlUsd?: number;
  latestSnapshot?: {
    poolAddress?: `0x${string}`;
    totalUsd?: number;
    feesUsd?: number;
    feesApy?: number;
    timestamp?: string;
    positionOpenedAt?: string;
    positionTokens: Array<{
      address: `0x${string}`;
      symbol: string;
      decimals: number;
      amount?: number;
      amountBaseUnits?: string;
      valueUsd?: number;
    }>;
  };
}

// Settings types (ClmmSettings)
export interface AgentSettings {
  amount?: number;
}

// Private state (ClmmPrivateState) - not exposed to UI but defined for completeness
export interface AgentPrivateState {
  mode?: 'debug' | 'production';
  pollIntervalMs: number;
  streamLimit: number;
  cronScheduled: boolean;
  bootstrapped: boolean;
}

// View state (ClmmViewState)
export interface AgentView {
  command?: string;
  task?: Task;
  onboarding?: OnboardingState;
  poolArtifact?: Artifact;
  operatorInput?: OperatorConfigInput | PendleSetupInput | GmxSetupInput;
  fundingTokenInput?: FundingTokenInput;
  selectedPool?: Pool;
  operatorConfig?: unknown;
  delegationBundle?: unknown;
  haltReason?: string;
  executionError?: string;
  delegationsBypassActive?: boolean;
  profile: AgentViewProfile;
  activity: AgentViewActivity;
  metrics: AgentViewMetrics;
  transactionHistory: Transaction[];
}

// Full agent state (ClmmState)
export interface AgentState {
  messages?: unknown[];
  copilotkit?: {
    actions?: unknown[];
    context?: unknown[];
  };
  settings: AgentSettings;
  private?: AgentPrivateState;
  view: AgentView;
}

// Simplified types for UI components
export interface AgentProfile {
  agentIncome?: number;
  aum?: number;
  totalUsers?: number;
  apy?: number;
  chains: string[];
  protocols: string[];
  tokens: string[];
}

export interface AgentMetrics {
  iteration?: number;
  cyclesSinceRebalance?: number;
  staleCycles?: number;
  rebalanceCycles?: number;
  aumUsd?: number;
  apy?: number;
  lifetimePnlUsd?: number;
}

// Default values for state initialization
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
  rebalanceCycles: 0,
  iteration: 0,
  latestCycle: undefined,
  aumUsd: undefined,
  apy: undefined,
  lifetimePnlUsd: undefined,
  latestSnapshot: undefined,
};

export const defaultActivity: AgentViewActivity = {
  telemetry: [],
  events: [],
};

export const defaultView: AgentView = {
  command: undefined,
  task: undefined,
  poolArtifact: undefined,
  operatorInput: undefined,
  selectedPool: undefined,
  operatorConfig: undefined,
  haltReason: undefined,
  executionError: undefined,
  delegationsBypassActive: undefined,
  profile: defaultProfile,
  activity: defaultActivity,
  metrics: defaultMetrics,
  transactionHistory: [],
};

export const defaultSettings: AgentSettings = {
  amount: undefined,
};

export const initialAgentState: AgentState = {
  messages: [],
  copilotkit: { actions: [], context: [] },
  settings: defaultSettings,
  view: defaultView,
};

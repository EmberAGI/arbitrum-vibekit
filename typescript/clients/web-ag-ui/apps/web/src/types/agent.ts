// Agent state types matching CopilotKit/LangGraph schema

export type FundingTokenOption = {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  balance: string;
};

export type OperatorConfigRequestInterrupt = {
  type: 'operator-config-request';
  message: string;
  payloadSchema?: unknown;
  artifactId?: string;
};

export type FundingTokenRequestInterrupt = {
  type: 'clmm-funding-token-request';
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
  type: 'clmm-delegation-signing-request';
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
  | FundingTokenRequestInterrupt
  | DelegationSigningRequestInterrupt;

export interface OperatorConfigInput {
  poolAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  baseContributionUsd?: number;
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

export type DelegationSigningResponse = DelegationSigningResponseSigned | DelegationSigningResponseRejected;

export interface Pool {
  address: string;
  token0: { symbol: string };
  token1: { symbol: string };
  feeTierBps?: number;
}

export interface Transaction {
  cycle: number;
  action: string;
  txHash?: string;
  status: 'success' | 'failed' | 'pending';
  reason?: string;
  timestamp?: string;
}

export interface TelemetryItem {
  cycle: number;
  action: string;
  reason?: string;
  midPrice?: number;
  timestamp?: string;
}

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
  fundingTokenInput?: unknown;
  selectedPool?: unknown;
  operatorConfig?: unknown;
  delegationBundle?: unknown;
  haltReason?: string;
  executionError?: string;
  delegationsBypassActive?: boolean;
  profile?: AgentViewProfile;
  activity?: AgentViewActivity;
  metrics?: AgentViewMetrics;
  transactionHistory: Transaction[];
}

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

export interface AgentViewActivity {
  telemetry: TelemetryItem[];
  events: unknown[];
}

export interface AgentViewMetrics {
  lastSnapshot?: unknown;
  previousPrice?: number;
  cyclesSinceRebalance: number;
  staleCycles: number;
  iteration: number;
  latestCycle?: unknown;
}

export interface AgentState {
  messages?: unknown[];
  settings?: {
    amount: number;
  };
  view?: AgentView;
  private?: unknown;
  copilotkit?: unknown;
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

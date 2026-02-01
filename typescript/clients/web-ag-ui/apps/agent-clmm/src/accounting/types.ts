export type NavSnapshotTrigger = 'cycle' | 'transaction' | 'sync';

export type PriceSource = 'ember' | 'coingecko';
export type PriceSourceSummary = 'ember' | 'coingecko' | 'mixed' | 'unknown';

export type TokenDescriptor = {
  chainId: number;
  address: `0x${string}`;
  symbol: string;
  decimals: number;
};

export type TokenPriceQuote = {
  tokenAddress: `0x${string}`;
  usdPrice: number;
  source: PriceSource;
};

export type TokenAmountBreakdown = {
  tokenAddress: `0x${string}`;
  symbol: string;
  decimals: number;
  amountBaseUnits?: string;
  amount?: number;
  usdPrice?: number;
  valueUsd?: number;
  source?: PriceSource;
  category: 'supplied' | 'fees' | 'rewards';
};

export type PositionValue = {
  positionId: string;
  poolAddress?: `0x${string}`;
  protocolId: string;
  tokens: TokenAmountBreakdown[];
  positionValueUsd: number;
  feesUsd?: number;
  rewardsUsd?: number;
};

export type NavSnapshot = {
  contextId: string;
  trigger: NavSnapshotTrigger;
  timestamp: string;
  protocolId: string;
  walletAddress: `0x${string}`;
  chainId: number;
  totalUsd: number;
  positions: PositionValue[];
  feesUsd?: number;
  feesApy?: number;
  rewardsUsd?: number;
  priceSource: PriceSourceSummary;
  transactionHash?: `0x${string}`;
  threadId?: string;
  cycle?: number;
};

export type FlowEventType = 'hire' | 'fire' | 'swap' | 'supply' | 'withdraw' | 'fee' | 'reward';

export type FlowLogEventBase = {
  id: string;
  timestamp: string;
  contextId: string;
  chainId: number;
  protocolId?: string;
  transactionHash?: `0x${string}`;
  poolAddress?: `0x${string}`;
  positionId?: string;
  usdValue?: number;
  usdPrice?: number;
};

export type HireFireFlowLogEvent = FlowLogEventBase & {
  type: 'hire' | 'fire';
};

export type SwapFlowLogEvent = FlowLogEventBase & {
  type: 'swap';
  fromTokenAddress?: `0x${string}`;
  fromAmountBaseUnits?: string;
  toTokenAddress?: `0x${string}`;
  toAmountBaseUnits?: string;
};

export type TokenFlowLogEvent = FlowLogEventBase & {
  type: 'supply' | 'withdraw' | 'fee' | 'reward';
  tokenAddress?: `0x${string}`;
  amountBaseUnits?: string;
};

export type FlowLogEvent = HireFireFlowLogEvent | SwapFlowLogEvent | TokenFlowLogEvent;

type FlowLogEventInputBase = {
  id?: string;
  timestamp?: string;
  contextId?: string;
};

export type FlowLogEventInput =
  | (Omit<HireFireFlowLogEvent, 'id' | 'timestamp' | 'contextId'> & FlowLogEventInputBase)
  | (Omit<SwapFlowLogEvent, 'id' | 'timestamp' | 'contextId'> & FlowLogEventInputBase)
  | (Omit<TokenFlowLogEvent, 'id' | 'timestamp' | 'contextId'> & FlowLogEventInputBase);

export type AccountingState = {
  navSnapshots: NavSnapshot[];
  flowLog: FlowLogEvent[];
  latestNavSnapshot?: NavSnapshot;
  lastUpdated?: string;
  lifecycleStart?: string;
  lifecycleEnd?: string;
  initialAllocationUsd?: number;
  cashUsd?: number;
  positionsUsd?: number;
  aumUsd?: number;
  lifetimePnlUsd?: number;
  lifetimeReturnPct?: number;
  highWaterMarkUsd?: number;
  apy?: number;
};

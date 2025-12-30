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
  rewardsUsd?: number;
  priceSource: PriceSourceSummary;
  transactionHash?: `0x${string}`;
  threadId?: string;
  cycle?: number;
};

export type AccountingState = {
  navSnapshots: NavSnapshot[];
  latestNavSnapshot?: NavSnapshot;
  lastUpdated?: string;
};

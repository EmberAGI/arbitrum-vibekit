import type { TransactionArtifact } from '@emberai/arbitrum-vibekit-core';

// Token information type
export type TokenInfo = {
  chainId: string;
  address: string;
  decimals: number;
  symbol?: string;
};

// Token resolution result types
export type FindTokenResult =
  | { type: 'found'; token: TokenInfo }
  | { type: 'notFound' }
  | { type: 'clarificationNeeded'; options: TokenInfo[] };

// Lending preview schema type
export interface LendingPreview {
  tokenName: string;
  amount: string;
  action: 'borrow' | 'repay' | 'supply' | 'withdraw';
  chainId: string;
  currentBorrowApy?: string;
  liquidationThreshold?: string;
}

// Transaction artifact type for lending operations
export type LendingTransactionArtifact = TransactionArtifact<LendingPreview>;

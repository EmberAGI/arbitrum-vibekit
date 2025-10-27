// Export composed tools (with hooks applied)
export {
  borrow,
  repay,
  supply,
  withdraw,
  getUserPositions,
  askEncyclopedia,
} from './composedTools.js';

// Export the array of all tools for easy use
export { composedLendingTools as lendingTools } from './composedTools.js';

// Re-export types and schemas that might be useful
export type {
  TokenInfo,
  FindTokenResult,
  LendingPreview,
  LendingTransactionArtifact,
} from './types.js';
export {
  BorrowRepaySupplyWithdrawSchema,
  GetWalletLendingPositionsSchema,
  AskEncyclopediaSchema,
} from '@emberai/arbitrum-vibekit-core/ember-schemas';

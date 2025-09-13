import type {
  GetWalletLendingPositionsRequest,
  GetWalletLendingPositionsResponse,
} from '../schemas/lending.js';

/**
 * Get lending positions for a wallet.
 */
export type LendingGetPositions = (
  request: GetWalletLendingPositionsRequest
) => Promise<GetWalletLendingPositionsResponse>;

/**
 * All the queries related to lending.
 */
export type LendingQueries = {
  getPositions: LendingGetPositions;
};

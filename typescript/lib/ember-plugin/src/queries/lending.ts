import type { LendingPosition, GetWalletLendingPositionsRequest } from 'ember-schemas';

/**
 * Get lending positions for a wallet.
 */
export type LendingGetPositions = (
  request: GetWalletLendingPositionsRequest
) => Promise<LendingPosition>;

/**
 * All the queries related to lending.
 */
export type LendingQueries = {
  getPositions: LendingGetPositions;
};

import type { SupplyResponse } from 'ember-schemas';

export interface SupplyRequest {
  /**
   * The token identifier for the token being supplied.
   */
  tokenUid: string;
  /**
   * The amount of the token being supplied, in human-readable format.
   */
  amount: string;
  /**
   * The wallet address for the supplier.
   */
  walletAddress: string;
}

/**
 * Callback function type for the supply action.
 */
export type SupplyCallback = (request: SupplyRequest) => Promise<SupplyResponse>;

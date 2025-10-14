import type {
  BridgeDepositRequest,
  BridgeDepositResponse,
  BridgeWithdrawRequest,
  BridgeWithdrawResponse,
} from '../schemas/bridge.js';

/**
 * Callback function type for the bridge deposit action (parent → child).
 */
export type BridgeDepositCallback = (
  request: BridgeDepositRequest
) => Promise<BridgeDepositResponse>;

/**
 * Callback function type for the bridge withdraw action (child → parent).
 */
export type BridgeWithdrawCallback = (
  request: BridgeWithdrawRequest
) => Promise<BridgeWithdrawResponse>;

/**
 * The possible actions related to bridging.
 */
export type BridgeActions = 'bridge-deposit' | 'bridge-withdraw';



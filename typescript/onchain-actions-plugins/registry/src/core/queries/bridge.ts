import type {
  BridgeGetMessageStatusRequest,
  BridgeGetMessageStatusResponse,
} from '../schemas/bridge.js';

/**
 * Get cross-chain message status for a bridge operation.
 */
export type BridgeGetMessageStatus = (
  request: BridgeGetMessageStatusRequest
) => Promise<BridgeGetMessageStatusResponse>;

/**
 * All the queries related to bridging.
 */
export type BridgeQueries = {
  getMessageStatus: BridgeGetMessageStatus;
};



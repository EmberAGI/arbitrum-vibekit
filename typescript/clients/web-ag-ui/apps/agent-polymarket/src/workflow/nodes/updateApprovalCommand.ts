/**
 * Update Approval Command Node
 *
 * Handles the 'updateApproval' command triggered from Settings tab.
 * Sets up state for approval update flow and routes to checkApprovals.
 */

import type { PolymarketState, PolymarketUpdate } from '../context.js';
import { logInfo } from '../context.js';

/**
 * Process the update approval command.
 *
 * This is called from the Settings tab when user wants to update their USDC allowance.
 * The data (approvalAmount, userWalletAddress) is already set in state by runCommandNode.
 * This node just logs and ensures the flow continues to checkApprovals with forceApprovalUpdate flag.
 */
export function updateApprovalCommandNode(state: PolymarketState): PolymarketUpdate {
  const approvalAmount = state.view.requestedApprovalAmount;
  const userWalletAddress = state.private.userWalletAddress;

  console.log('[updateApprovalCommand] amount:', approvalAmount, 'wallet:', userWalletAddress?.slice(0, 10));

  logInfo('Processing updateApproval command', {
    approvalAmount,
    hasUserWallet: !!userWalletAddress,
    currentAllowance: state.view.approvalStatus?.usdcAllowance,
  });

  if (!approvalAmount) {
    logInfo('⚠️ No approval amount provided');
    return {
      view: {
        haltReason: 'No approval amount provided for update',
      },
    };
  }

  if (!userWalletAddress) {
    logInfo('⚠️ No user wallet address provided');
    return {
      view: {
        haltReason: 'No wallet address provided. Please connect your wallet.',
      },
    };
  }

  // State is already set by runCommandNode with:
  // - view.requestedApprovalAmount
  // - view.forceApprovalUpdate = true
  // - private.userWalletAddress
  //
  // Just return minimal update and let the edge route to checkApprovals
  return {
    view: {
      command: 'updateApproval',
    },
  };
}

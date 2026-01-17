/**
 * Collect Approval Confirmation Workflow Node
 *
 * Checks if approvals are confirmed on-chain. If not, interrupts to wait for user signatures.
 *
 * Flow:
 * 1. Check approval status on-chain
 * 2. If approved → continue to checkApprovals (to verify and proceed)
 * 3. If not approved → interrupt and wait
 * 4. When resumed (by cron or manual trigger) → check again (loop back to step 1)
 *
 * This prevents infinite loops because we only check when explicitly called/resumed.
 */

import { Command } from '@langchain/langgraph';
import type { PolymarketState, PolymarketUpdate } from '../context.js';
import { checkApprovalStatus } from '../../clients/approvals.js';
import { logInfo } from '../context.js';

/**
 * Check if approvals are confirmed. If not, interrupt.
 * If confirmed, proceed to checkApprovals for final verification.
 */
export async function collectApprovalConfirmationNode(
  state: PolymarketState,
): Promise<Command<PolymarketUpdate>> {
  const walletAddress = state.private.walletAddress;
  const rpcUrl = process.env.POLYGON_RPC_URL || 'https://polygon.llamarpc.com';

  if (!walletAddress) {
    logInfo('⚠️ No wallet address - cannot check approvals');
    return new Command({
      update: {
        view: {
          haltReason: 'No wallet address configured',
        },
      },
      goto: 'summarize',
    });
  }

  logInfo('🔍 Checking if approval transactions have been confirmed on-chain...');

  // Check current approval status
  const status = await checkApprovalStatus(walletAddress, rpcUrl);

  // If all approvals are confirmed, proceed to checkApprovals for final verification
  if (!status.needsApproval) {
    logInfo('✅ Approvals confirmed! Proceeding to checkApprovals for final verification');

    return new Command({
      update: {
        view: {
          approvalStatus: status,
          pendingApprovalTransactions: undefined,
          onboarding: undefined,
        },
      },
      goto: 'checkApprovals',
    });
  }

  // Still waiting for approvals - interrupt and wait
  logInfo('💤 Approvals still pending - interrupting workflow', {
    ctfApproved: status.ctfApproved,
    usdcApproved: status.usdcApproved,
  });
  logInfo('   User should sign transactions in MetaMask');
  logInfo('   Workflow will resume on next cycle or manual trigger');

  return new Command({
    update: {
      view: {
        approvalStatus: status,
        onboarding: {
          step: 1,
          totalSteps: 2,
          key: 'approval-pending',
        },
      },
    },
    // Interrupt - workflow will stay paused until resumed
    goto: '__interrupt__',
  });
}

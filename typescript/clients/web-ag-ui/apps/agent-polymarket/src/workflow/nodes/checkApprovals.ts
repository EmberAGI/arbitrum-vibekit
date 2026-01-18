/**
 * Check Approvals Workflow Node
 *
 * Verifies that the agent's wallet has approved the required contracts
 * for trading on Polymarket. If approvals are missing, generates approval
 * transactions and interrupts for user signature.
 *
 * Flow:
 * 1. Check wallet balances (POL for gas, USDC for trading)
 * 2. Check contract approvals (CTF Contract, USDC.e)
 * 3. If approvals needed → generate transactions → interrupt
 * 4. If approved → continue to poll cycle
 */

import { Command } from '@langchain/langgraph';
import type { PolymarketState, PolymarketUpdate } from '../context.js';
import {
  checkApprovalStatus,
  buildApprovalTransactions,
  buildUsdcPermitTypedData,
} from '../../clients/approvals.js';
import { logInfo } from '../context.js';

/**
 * Minimum POL balance required for gas fees (in POL/MATIC)
 */
const MIN_POL_BALANCE = 0.01; // ~$0.02 at current prices

/**
 * Minimum USDC balance required to start trading
 */
const MIN_USDC_BALANCE = 1; // $1

/**
 * Check contract approvals and wallet balances.
 * Interrupt if approvals or funding needed.
 */
export async function checkApprovalsNode(state: PolymarketState): Promise<Command<PolymarketUpdate>> {
  console.log('[checkApprovals] Node entered', {
    forceApprovalUpdate: state.view.forceApprovalUpdate,
    requestedApprovalAmount: state.view.requestedApprovalAmount,
  });

  logInfo('🔍 checkApprovals node reached', {
    lifecycleState: state.view.lifecycleState,
    hasWalletAddress: !!state.private.walletAddress,
  });

  const walletAddress = state.private.walletAddress;

  // Use a reliable public RPC endpoint for Polygon mainnet
  // Users can override with POLYGON_RPC_URL environment variable
  const rpcUrl = process.env.POLYGON_RPC_URL || 'https://polygon.llamarpc.com';

  if (!walletAddress) {
    logInfo('⚠️ No wallet address configured - halting');
    return new Command({
      update: {
        view: {
          haltReason: 'No wallet address configured. Please set A2A_TEST_AGENT_NODE_PRIVATE_KEY.',
        },
      },
      goto: 'summarize',
    });
  }

  // Use user's wallet address if available (from interrupt), otherwise backend wallet address
  // For initial checks, we might only have backend wallet, but for permits we need user wallet
  const targetAddress = state.private.userWalletAddress || walletAddress;

  logInfo('Checking contract approvals and balances', {
    wallet: targetAddress.substring(0, 10) + '...',
    isUserWallet: !!state.private.userWalletAddress,
    rpcUrl,
  });

  // Check approval status and balances
  const status = await checkApprovalStatus(targetAddress, rpcUrl);

  // Check if user is requesting approval update from Settings
  const isApprovalUpdateRequest = state.view.forceApprovalUpdate && state.view.requestedApprovalAmount;

  // FIRST: Check USDC approval - only needed for buy orders
  // CTF approval is only needed for selling positions (can be added later)
  // Also handle approval updates from Settings even if already approved
  if (!status.usdcApproved || isApprovalUpdateRequest) {
    console.log('[checkApprovals] USDC approval needed', { usdcApproved: status.usdcApproved, isApprovalUpdateRequest });
    logInfo('🔐 USDC approval required for trading', {
      usdcApproved: status.usdcApproved,
      address: targetAddress,
    });

    // Check if user already provided the approval amount
    const approvalAmount = state.view.requestedApprovalAmount;

    if (!approvalAmount && !isApprovalUpdateRequest) {
      // Need user input - interrupt and ask for amount (only for initial approval, not updates)
      logInfo('💬 Asking user for USDC approval amount');

      return new Command({
        update: {
          view: {
            approvalStatus: status,
            needsApprovalAmountInput: true, // Signal frontend to show input field
            onboarding: {
              step: 1,
              totalSteps: 2,
              key: 'approval-amount-input',
            },
          },
        },
        goto: 'collectApprovalAmount', // Go to node that waits for user input
      });
    }

    // User provided amount - generate USDC permit typed data (gasless signature)
    if (!approvalAmount) {
      logInfo('❌ Approval amount is missing');
      return new Command({
        update: {
          view: {
            haltReason: 'Approval amount is required',
          },
        },
        goto: 'summarize',
      });
    }

    logInfo('✅ User provided approval amount', { amount: approvalAmount });

    let usdcPermitTypedData;
    try {
      // Must use the same address that will sign the permit (user's wallet)
      usdcPermitTypedData = await buildUsdcPermitTypedData(targetAddress, approvalAmount, rpcUrl);
      console.log('[checkApprovals] Permit typed data generated for:', targetAddress);
    } catch (error) {
      console.error('[checkApprovals] Failed to generate permit:', error);
      logInfo('❌ Failed to generate USDC permit typed data', {
        error: error instanceof Error ? error.message : String(error),
      });
      return new Command({
        update: {
          view: {
            haltReason: `Failed to generate USDC permit: ${error instanceof Error ? error.message : String(error)}`,
          },
        },
        goto: 'summarize',
      });
    }

    // Route to collectApprovalAmount with the permit data (no CTF needed for buy orders)
    console.log('[checkApprovals] Routing to collectApprovalAmount for permit signature');
    return new Command({
      update: {
        view: {
          approvalStatus: status,
          needsApprovalAmountInput: false,
          needsUsdcPermitSignature: true, // Request USDC signature
          usdcPermitTypedData, // Data for user to sign
          forceApprovalUpdate: undefined, // Clear the flag after generating permit
          onboarding: isApprovalUpdateRequest ? undefined : {
            step: 2,
            totalSteps: 2,
            key: 'usdc-permit-signature',
          },
        },
      },
      goto: 'collectApprovalAmount',
    });
  }

  // SECOND: Check POL balance for gas (after approvals are confirmed)
  if (status.polBalance < MIN_POL_BALANCE) {
    logInfo('⚠️ Low POL balance for gas fees', {
      balance: status.polBalance.toFixed(4),
      required: MIN_POL_BALANCE,
    });

    return new Command({
      update: {
        view: {
          haltReason: `Insufficient POL/MATIC for gas: ${status.polBalance.toFixed(4)} POL. Please fund wallet with at least ${MIN_POL_BALANCE} POL.`,
          approvalStatus: status,
        },
      },
      goto: 'summarize',
    });
  }

  // THIRD: Check USDC balance for trading
  if (status.usdcBalance < MIN_USDC_BALANCE) {
    logInfo('⚠️ Insufficient USDC balance for trading', {
      balance: status.usdcBalance.toFixed(2),
      required: MIN_USDC_BALANCE,
    });

    return new Command({
      update: {
        view: {
          haltReason: `Insufficient USDC balance: $${status.usdcBalance.toFixed(2)}. Please fund wallet with at least $${MIN_USDC_BALANCE} USDC.`,
          approvalStatus: status,
        },
      },
      goto: 'summarize',
    });
  }

  // All checks passed - ready to trade
  logInfo('✅ All approvals verified, ready to trade', {
    polBalance: status.polBalance.toFixed(4),
    usdcBalance: status.usdcBalance.toFixed(2),
    ctfApproved: status.ctfApproved,
    usdcApproved: status.usdcApproved,
  });

  // If this was an approval update from Settings (not initial onboarding or regular cycle),
  // end here instead of going to pollCycle
  if (state.view.command === 'updateApproval') {
    console.log('[checkApprovals] This was an approval update, ending instead of going to pollCycle');
    console.log('[checkApprovals] Setting command: idle to maintain isHired=true');
    logInfo('✅ Approval update complete - not triggering poll cycle');
    return new Command({
      update: {
        view: {
          approvalStatus: status,
          pendingApprovalTransactions: undefined,
          haltReason: undefined,
          command: 'idle', // Use 'idle' to keep isHired=true but indicate no active command
          forceApprovalUpdate: undefined,
          requestedApprovalAmount: undefined,
        },
      },
      goto: 'summarize', // Go to summarize which will end (not loop back)
    });
  }

  return new Command({
    update: {
      view: {
        approvalStatus: status,
        pendingApprovalTransactions: undefined,
        haltReason: undefined, // Clear any previous halt reason
      },
    },
    goto: 'pollCycle',
  });
}

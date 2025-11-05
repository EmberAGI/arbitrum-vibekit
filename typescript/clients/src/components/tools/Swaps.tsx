"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTransactionExecutor } from "@/lib/hooks/useTransactionExecutor"; // Import the hook
import type { TxPlan } from "@/lib/transactionUtils";
import { ArrowRightLeft, CheckCircle, AlertCircle, Loader2, Wallet } from "lucide-react";

// Removed: useState, useEffect, useCallback, useMemo, viem imports, useSendTransaction
// Removed: getChainById, withSafeDefaults, toBigInt, signTx, ensureReady, approveTransaction, signMainTransaction
// Removed: All local state related to approvals and transaction execution

export function Swaps({
  txPreview,
  txPlan,
}: {
  txPreview: any; // TODO: Define a proper TxPreview type
  txPlan: TxPlan | null; // Use imported type
}) {
  console.log("[Transaction Component] Rendering with txPlan:", txPlan);
  console.log("[Transaction Component] Received txPreview:", txPreview);

  // --- Use wagmi hooks directly needed by the component or passed to the hook ---
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain(); // Still needed if hook needs it

  // --- Use the central transaction executor hook ---
  const {
    // Actions
    approveNext,
    executeMain,
    // State
    approvalIndex,
    totalApprovals,
    isApprovalPending,
    approvalError,
    isTxPending, // Represents main transaction pending state
    isTxSuccess, // Represents main transaction success state
    txError, // Represents main transaction error state
    // Derived Booleans
    canApprove,
    canExecute,
    isApprovalPhaseComplete,
  } = useTransactionExecutor({
    txPlan,
    isConnected: !!isConnected,
    address,
    currentChainId: chainId,
    switchChainAsync, // Pass the function needed by the hook
  });

  const needsApproval = totalApprovals > 0; // Still useful for conditional rendering

  // Effect to log state changes for debugging
  // useEffect(() => {
  //   console.log('[Transaction Component] Executor State Update:', {
  //     approvalIndex, totalApprovals, isApprovalPending, approvalError,
  //     isTxPending, isTxSuccess, txError, canApprove, canExecute, isApprovalPhaseComplete
  //   });
  // }, [approvalIndex, totalApprovals, isApprovalPending, approvalError, isTxPending, isTxSuccess, txError, canApprove, canExecute, isApprovalPhaseComplete]);

  // Removed local useEffect for auto-approving (handled by hook)
  // Removed local useEffect for resetting state (handled by hook)
  // Removed signMainTransaction callback (replaced by executeMain from hook)
  // Removed approveTransaction callback (replaced by approveNext from hook)

  return (
    <>
      {txPlan && txPreview && (
        <div className="rounded-lg bg-black/20 p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-orange-400" />
            <h2 className="text-sm font-semibold text-orange-400">Swap Preview</h2>
          </div>

          {/* Swap Details */}
          <div className="space-y-3">
            {/* From Token */}
            <div className="bg-black/30 rounded p-3">
              <div className="text-xs text-gray-500 mb-1">From</div>
              <div className="flex items-center justify-between">
                <span className="text-xl font-bold text-white">
                  {txPreview?.fromTokenAmount}
                </span>
                <span className="text-sm font-semibold text-orange-400">
                  {txPreview?.fromTokenSymbol?.toUpperCase()}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-1">on {txPreview?.fromChain}</div>
              <div className="text-xs text-gray-600 font-mono mt-2 truncate">
                {txPreview?.fromTokenAddress}
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <ArrowRightLeft className="h-3 w-3 text-orange-400/50 rotate-90" />
            </div>

            {/* To Token */}
            <div className="bg-black/30 rounded p-3">
              <div className="text-xs text-gray-500 mb-1">To</div>
              <div className="flex items-center justify-between">
                <span className="text-xl font-bold text-white">
                  {txPreview?.toTokenAmount}
                </span>
                <span className="text-sm font-semibold text-orange-400">
                  {txPreview?.toTokenSymbol?.toUpperCase()}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-1">on {txPreview?.toChain}</div>
              <div className="text-xs text-gray-600 font-mono mt-2 truncate">
                {txPreview?.toTokenAddress}
              </div>
            </div>
          </div>

          {/* Status & Actions */}
          <div className="space-y-2">
            {/* Status Messages - compact */}
            {isTxSuccess && (
              <div className="flex items-center gap-2 text-xs text-green-400">
                <CheckCircle className="h-3.5 w-3.5" />
                <span>Transaction Successful!</span>
              </div>
            )}
            {isTxPending && (
              <div className="flex items-center gap-2 text-xs text-orange-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Executing...</span>
              </div>
            )}
            {txError && (
              <div className="text-xs text-red-400 break-words">
                Error: {(txError as any).shortMessage || txError.message}
              </div>
            )}
            {needsApproval && isApprovalPending && (
              <div className="flex items-center gap-2 text-xs text-blue-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Approving {approvalIndex + 1}/{totalApprovals}...</span>
              </div>
            )}
            {needsApproval && approvalError && (
              <div className="text-xs text-red-400 break-words">
                Approval Error: {(approvalError as any).shortMessage || approvalError.message}
              </div>
            )}

            {/* Action Buttons - compact */}
            {isConnected ? (
              <div className="flex gap-2">
                {needsApproval && (
                  <button
                    className="flex-1 h-9 px-4 rounded text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    type="button"
                    onClick={approveNext}
                    disabled={!canApprove}
                  >
                    {isApprovalPending ? (
                      `Approving ${approvalIndex + 1}/${totalApprovals}`
                    ) : isApprovalPhaseComplete ? (
                      "Approved"
                    ) : (
                      `Approve ${approvalIndex + 1}/${totalApprovals}`
                    )}
                  </button>
                )}
                <button
                  className="flex-1 h-9 px-4 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#FD6731' }}
                  type="button"
                  onClick={executeMain}
                  disabled={!canExecute}
                >
                  {isTxPending ? "Executing..." : needsApproval ? "Execute" : "Sign"}
                </button>
              </div>
            ) : (
              <div className="text-xs text-red-400 text-center py-2">
                <ConnectButton />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Removed toBigInt function (now in lib/transactionUtils)

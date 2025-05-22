"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTransactionExecutor } from "../hooks/useTransactionExecutor"; // Import the hook
import type { TxPlan } from "../lib/transactionUtils"; // Import shared types -> Use 'import type'

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
        <div className="flex flex-col gap-2 p-8 bg-transparent shadow-md rounded-2xl text-white border-red-200 border-2">
          <h2 className="text-lg font-semibold mb-4">Transaction Preview:</h2>
          <div className="rounded-xl bg-zinc-700 p-4 flex flex-col gap-2">
            <span className="font-normal flex gap-3 w-full items-center text-sm">
              From:{" "}
            </span>

            <p className="font-normal w-full ">
              <span className="font-normal">
                <span className="font-semibold">
                  {txPreview?.fromTokenAmount}{" "}
                  {txPreview?.fromTokenAmount &&
                    txPreview?.fromTokenSymbol?.toUpperCase()}
                </span>
                {" (on "}
                {txPreview?.fromChain}
                {")"}
              </span>
            </p>
            <p className="font-normal w-full bg-zinc-600 rounded-full p-2">
              <span className="font-normal  text-sm">
                {txPreview?.fromTokenAddress}{" "}
              </span>
            </p>

            <div className="border-t border-gray-500 my-2" />
            <span className="font-normal flex gap-3 w-full items-center text-sm">
              To:{" "}
            </span>

            <p className="font-normal w-full ">
              <span className="font-normal">
                <span className="font-semibold">
                  {txPreview?.toTokenAmount}{" "}
                  {txPreview?.toTokenAmount &&
                    txPreview?.toTokenSymbol?.toUpperCase()}
                </span>
                {" (on "}
                {txPreview?.toChain}
                {")"}
              </span>
            </p>
            <p className="font-normal w-full bg-zinc-600 rounded-full p-2">
              <span className="font-normal  text-sm">
                {txPreview?.toTokenAddress}{" "}
              </span>
            </p>
          </div>

          {isConnected ? (
            <>
              {/* Main Transaction Status */}
              {isTxSuccess && ( // Main transaction success
                <p className=" p-2 rounded-2xl border-green-800 bg-green-200 w-full border-2 text-green-800">
                  Transaction Successful!
                </p>
              )}
              {isTxPending && ( // Main transaction pending
                <p className=" p-2 rounded-2xl border-gray-400 bg-gray-200 w-full border-2 text-slate-800">
                  Executing Transaction...
                </p>
              )}
              {txError && ( // Main transaction error
                <p className=" p-2 rounded-2xl border-red-800 bg-red-400 w-full border-2 text-white break-words">
                  Execution Error!{" "}
                  {(txError as any).shortMessage || // Use hook's txError
                    txError.message ||
                    JSON.stringify(txError, null, 2)}
                </p>
              )}

              {/* Approval Status */}
              {needsApproval &&
                isApprovalPending && ( // Approval pending
                  <p className=" p-2 rounded-2xl border-gray-400 bg-gray-200 w-full border-2 text-slate-800">
                    {`Processing Approval ${
                      approvalIndex + 1
                    }/${totalApprovals}...`}
                  </p>
                )}
              {needsApproval &&
                approvalError && ( // Approval error
                  <p className=" p-2 rounded-2xl border-red-800 bg-red-400 w-full border-2 text-white break-words">
                    Approval Error!{" "}
                    {(approvalError as any).shortMessage || // Use hook's approvalError
                      approvalError.message ||
                      JSON.stringify(approvalError, null, 2)}
                  </p>
                )}
              {needsApproval &&
                isApprovalPhaseComplete && // All approvals done
                !isTxPending && // Main tx not yet pending/running
                !isTxSuccess && // Main tx not yet successful
                !txError && ( // No main tx error
                  <p className=" p-2 rounded-2xl border-green-800 bg-green-200 w-full border-2 text-green-800">
                    All Approvals Sent! Ready to execute.
                  </p>
                )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                {needsApproval && (
                  <button
                    className="mt-4 bg-orange-500 text-white py-2 px-4 rounded-full disabled:bg-zinc-600 disabled:border-2 disabled:border-zinc-500 disabled:text-gray-400" // Adjusted disabled style
                    type="button"
                    onClick={approveNext} // Use approveNext from hook
                    disabled={!canApprove} // Use canApprove from hook
                  >
                    {isApprovalPending // Use hook state
                      ? `Approving ${approvalIndex + 1}/${totalApprovals}...`
                      : isApprovalPhaseComplete // Use hook state
                      ? "All Approved"
                      : `Approve ${approvalIndex + 1}/${totalApprovals}`}
                  </button>
                )}
                <button
                  className="mt-4 bg-orange-500 text-white py-2 px-4 rounded-full disabled:opacity-50"
                  type="button"
                  onClick={executeMain} // Use executeMain from hook
                  disabled={!canExecute} // Use canExecute from hook
                >
                  {isTxPending // Use hook state
                    ? "Executing..."
                    : needsApproval // Still relevant for button text
                    ? "Execute Transaction"
                    : "Sign Transaction"}
                </button>
              </div>
            </>
          ) : (
            // Wallet not connected section remains the same
            <p className="text-red-500 p-2 flex rounded-2xl border-gray-400 bg-gray-200 w-full border-2 flex-col ">
              <div className="mb-2">Please connect your Wallet to proceed</div>
              <ConnectButton />
            </p>
          )}
        </div>
      )}
    </>
  );
}

// Removed toBigInt function (now in lib/transactionUtils)

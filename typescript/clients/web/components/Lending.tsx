"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTransactionExecutor } from "../hooks/useTransactionExecutor";
import type { TxPlan } from "../lib/transactionUtils";

// Removed: useState, viem imports, useSendTransaction
// Removed: getChainById, withSafeDefaults, toBigInt, signTx
// Removed: All local state related to approvals and transaction execution

export function Lending({
  txPreview,
  txPlan,
}: {
  txPreview: any; // TODO: Define LendingTxPreview type
  txPlan: TxPlan | null;
}) {
  console.log("[Lending Component] Received txPreview:", txPreview);
  console.log("[Lending Component] Received txPlan:", txPlan);

  // --- Wagmi hooks ---
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  // --- Central executor hook ---
  const {
    approveNext,
    executeMain,
    approvalIndex,
    totalApprovals,
    isApprovalPending,
    approvalError,
    isTxPending,
    isTxSuccess,
    txError,
    canApprove,
    canExecute,
    isApprovalPhaseComplete,
  } = useTransactionExecutor({
    txPlan,
    isConnected: !!isConnected,
    address,
    currentChainId: chainId,
    switchChainAsync,
  });

  const needsApproval = totalApprovals > 0;

  // Removed signMainTransaction and approveTransaction callbacks

  return (
    <>
      {txPlan && txPreview && (
        <div className="flex flex-col gap-2 p-8 bg-transparent shadow-md rounded-2xl text-white border-red-200 border-2">
          <h2 className="text-lg font-semibold mb-4">Transaction Preview:</h2>
          {/* Preview Rendering */}
          <div className="rounded-xl bg-zinc-700 p-4 flex flex-col gap-2">
            <span className="font-normal flex gap-3 w-full items-center text-sm">
              Action: {txPreview.action?.toUpperCase()}
            </span>
            <p className="font-normal w-full ">
              <span className="font-normal">
                <span className="font-semibold">
                  {txPreview?.amount}{" "}
                  {txPreview?.amount && txPreview?.tokenName?.toUpperCase()}
                </span>
                {" (on "}
                {/* Assuming txPreview includes chainId, adjust if needed */}
                {txPreview?.chainId}
                {")"}
              </span>
            </p>
            {/* Add token address or other details if available in txPreview */}
          </div>

          {isConnected ? (
            <>
              {/* Main Transaction Status */}
              {isTxSuccess && (
                <p className=" p-2 rounded-2xl border-green-800 bg-green-200 w-full border-2 text-green-800">
                  Transaction Successful!
                </p>
              )}
              {isTxPending && (
                <p className=" p-2 rounded-2xl border-gray-400 bg-gray-200 w-full border-2 text-slate-800">
                  Executing Transaction...
                </p>
              )}
              {txError && (
                <p className=" p-2 rounded-2xl border-red-800 bg-red-400 w-full border-2 text-white break-words">
                  Execution Error!{" "}
                  {(txError as any).shortMessage ||
                    txError.message ||
                    JSON.stringify(txError, null, 2)}
                </p>
              )}

              {/* Approval Status */}
              {needsApproval && isApprovalPending && (
                <p className=" p-2 rounded-2xl border-gray-400 bg-gray-200 w-full border-2 text-slate-800">
                  {`Processing Approval ${
                    approvalIndex + 1
                  }/${totalApprovals}...`}
                </p>
              )}
              {needsApproval && approvalError && (
                <p className=" p-2 rounded-2xl border-red-800 bg-red-400 w-full border-2 text-white break-words">
                  Approval Error!{" "}
                  {(approvalError as any).shortMessage ||
                    approvalError.message ||
                    JSON.stringify(approvalError, null, 2)}
                </p>
              )}
              {needsApproval &&
                isApprovalPhaseComplete &&
                !isTxPending &&
                !isTxSuccess &&
                !txError && (
                  <p className=" p-2 rounded-2xl border-green-800 bg-green-200 w-full border-2 text-green-800">
                    All Approvals Sent! Ready to execute.
                  </p>
                )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                {needsApproval && (
                  <button
                    className="mt-4 bg-orange-500 text-white py-2 px-4 rounded-full disabled:bg-zinc-600 disabled:border-2 disabled:border-zinc-500 disabled:text-gray-400"
                    type="button"
                    onClick={approveNext} // Use hook action
                    disabled={!canApprove} // Use hook state
                  >
                    {isApprovalPending
                      ? `Approving ${approvalIndex + 1}/${totalApprovals}...`
                      : isApprovalPhaseComplete
                      ? "All Approved"
                      : `Approve ${approvalIndex + 1}/${totalApprovals}`}
                  </button>
                )}
                <button
                  className="mt-4 bg-orange-500 text-white py-2 px-4 rounded-full disabled:opacity-50"
                  type="button"
                  onClick={executeMain} // Use hook action
                  disabled={!canExecute} // Use hook state
                >
                  {isTxPending
                    ? "Executing..."
                    : needsApproval
                    ? "Execute Transaction"
                    : "Sign Transaction"}
                </button>
              </div>
            </>
          ) : (
            // Wallet not connected section
            <p className="text-red-500 p-2 flex rounded-2xl border-gray-400 bg-gray-200 w-full border-2 flex-col">
              <div className="mb-2">Please connect your Wallet to proceed</div>
              <ConnectButton />
            </p>
          )}
        </div>
      )}
    </>
  );
}

// Removed toBigInt function

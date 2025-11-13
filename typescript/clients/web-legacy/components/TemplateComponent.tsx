'use client';

import { useAccount, useSwitchChain } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useTransactionExecutor } from '../hooks/useTransactionExecutor';
import type { TxPlan } from '../lib/transactionUtils';
import { JsonViewer } from './JsonViewer';

// Removed: useState, viem imports, useSendTransaction
// Removed: getChainById, withSafeDefaults, toBigInt, signTx
// Removed: All local state related to approvals and transaction execution

export function TemplateComponent({
  txPreview,
  txPlan,
  jsonObject,
}: {
  txPlan: TxPlan | null;
  txPreview: any; // TODO: Define LiquidityTxPreview type
  jsonObject?: any;
}) {
  console.log('[Liquidity Component] Received txPreview:', txPreview);
  console.log('[Liquidity Component] Received txPlan:', txPlan);

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
      {
        <div className="p-0 m-0">
          {/* Transaction Preview & Execution Logic */}
          {txPreview ? (
            <div className="flex flex-col gap-2 p-8 bg-transparent shadow-md rounded-2xl text-white border-red-200 border-2">
              <JsonViewer data={txPreview} title="Transaction Preview" />

              {/* Transaction Execution UI (uses hook state) */}
              {txPlan && txPreview && isConnected ? (
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
                      Execution Error!{' '}
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
                      Approval Error!{' '}
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
                        className="mt-4 bg-cyan-700 text-white py-2 px-4 rounded-full disabled:bg-zinc-600 disabled:border-2 disabled:border-zinc-500 disabled:text-gray-400"
                        type="button"
                        onClick={approveNext} // Use hook action
                        disabled={!canApprove} // Use hook state
                      >
                        {isApprovalPending
                          ? `Approving ${
                              approvalIndex + 1
                            }/${totalApprovals}...`
                          : isApprovalPhaseComplete
                            ? 'All Approved'
                            : `Approve ${approvalIndex + 1}/${totalApprovals}`}
                      </button>
                    )}
                    <button
                      className="mt-4 bg-cyan-700 text-white py-2 px-4 rounded-full disabled:opacity-50"
                      type="button"
                      onClick={executeMain} // Use hook action
                      disabled={!canExecute || false} // Use hook state (extra || false is harmless but redundant)
                    >
                      {isTxPending
                        ? 'Executing...'
                        : needsApproval
                          ? 'Execute Transaction'
                          : 'Sign Transaction'}
                    </button>
                  </div>
                </>
              ) : (
                /* Wallet Not Connected Section */
                txPlan &&
                txPreview && (
                  <p className="text-red-500 p-2 flex rounded-2xl border-gray-400 bg-gray-200 w-full border-2 flex-col ">
                    <div className="mb-2">
                      Please connect your Wallet to proceed
                    </div>
                    <ConnectButton />
                  </p>
                )
              )}
            </div>
          ) : (
            <JsonViewer data={jsonObject} title="Preview Data" />
          )}
        </div>
      }
    </>
  );
}

// Removed toBigInt function

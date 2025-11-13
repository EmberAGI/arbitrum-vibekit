'use client';

import { useAccount, useSwitchChain } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useTransactionExecutor } from '@/lib/hooks/useTransactionExecutor';
import type { TxPlan } from '@/lib/transactionUtils';
import { TrendingUp, CheckCircle, Loader2 } from 'lucide-react';

export function Lending({ txPreview, txPlan }: { txPreview: any; txPlan: TxPlan | null }) {
  console.log('[Lending Component] Received txPreview:', txPreview);
  console.log('[Lending Component] Received txPlan:', txPlan);

  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

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

  return (
    <>
      {txPlan && txPreview && (
        <div className="rounded-lg bg-black/20 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-orange-400" />
            <h2 className="text-sm font-semibold text-orange-400">
              {txPreview.action?.toUpperCase()} Preview
            </h2>
          </div>

          <div className="bg-black/30 rounded p-3">
            <div className="text-xs text-gray-500 mb-1">Amount</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{txPreview?.amount}</span>
              <span className="text-sm font-semibold text-orange-400">
                {txPreview?.tokenName?.toUpperCase()}
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-1">on {txPreview?.chainId}</div>
          </div>

          <div className="space-y-2">
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
                <span>
                  Approving {approvalIndex + 1}/{totalApprovals}...
                </span>
              </div>
            )}
            {needsApproval && approvalError && (
              <div className="text-xs text-red-400 break-words">
                Approval Error: {(approvalError as any).shortMessage || approvalError.message}
              </div>
            )}

            {isConnected ? (
              <div className="flex gap-2">
                {needsApproval && (
                  <button
                    className="flex-1 h-9 px-4 rounded text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    type="button"
                    onClick={approveNext}
                    disabled={!canApprove}
                  >
                    {isApprovalPending
                      ? `Approving ${approvalIndex + 1}/${totalApprovals}`
                      : isApprovalPhaseComplete
                        ? 'Approved'
                        : `Approve ${approvalIndex + 1}/${totalApprovals}`}
                  </button>
                )}
                <button
                  className="flex-1 h-9 px-4 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#FD6731' }}
                  type="button"
                  onClick={executeMain}
                  disabled={!canExecute}
                >
                  {isTxPending ? 'Executing...' : needsApproval ? 'Execute' : 'Sign'}
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

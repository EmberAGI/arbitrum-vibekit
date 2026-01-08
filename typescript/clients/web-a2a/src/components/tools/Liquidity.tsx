'use client';

import { useAccount, useSwitchChain } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useTransactionExecutor } from '@/lib/hooks/useTransactionExecutor';
import type { TxPlan } from '@/lib/transactionUtils';
import { strToDecimal } from '@/lib/utils';
import { Droplets, CheckCircle, Loader2 } from 'lucide-react';

interface IPool {
  handle: string;
  symbol0: string;
  symbol1: string;
  token0: { chainId: string; address: string };
  token1: { chainId: string; address: string };
  price: string;
}

interface IPosition {
  tokenId: string;
  poolAddress: string;
  operator: string;
  token0: { chainId: string; address: string };
  token1: { chainId: string; address: string };
  tokens0wed1: string;
  tokens0wed0: string;
  symbol0: string;
  symbol1: string;
  amount0: string;
  amount1: string;
  price: string;
  providerId: string;
  positionRange: { fromPrice: string; toPrice: string };
}

export function Liquidity({
  positions,
  txPreview,
  txPlan,
  pools,
}: {
  positions: IPosition[] | null;
  txPlan: TxPlan | null;
  txPreview: any;
  pools: IPool[] | null;
}) {
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
      {positions ? (
        // Positions view
        <div className="rounded-lg bg-black/20 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Droplets className="h-4 w-4 text-orange-400" />
            <h2 className="text-sm font-semibold text-orange-400">
              Liquidity Positions ({positions.length})
            </h2>
          </div>
          {positions.map((x) => (
            <div key={x.tokenId + x.poolAddress} className="bg-black/30 rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">
                  {x.symbol0} / {x.symbol1}
                </span>
                <span className="text-xs text-gray-500">#{x.tokenId}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-gray-500">Amount 0</div>
                  <div className="text-sm font-semibold text-white">
                    {x.amount0} {x.symbol0}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Amount 1</div>
                  <div className="text-sm font-semibold text-white">
                    {x.amount1} {x.symbol1}
                  </div>
                </div>
              </div>
              <div className="text-xs text-gray-600">
                Range: {strToDecimal(x.positionRange.fromPrice)} →{' '}
                {strToDecimal(x.positionRange.toPrice)}
              </div>
              <div className="text-xs text-gray-600 truncate">Pool: {x.poolAddress}</div>
            </div>
          ))}
        </div>
      ) : pools ? (
        // Pools view
        <div className="rounded-lg bg-black/20 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Droplets className="h-4 w-4 text-orange-400" />
            <h2 className="text-sm font-semibold text-orange-400">
              Available Pools ({pools.length})
            </h2>
          </div>
          {pools.map((x) => (
            <div key={x.handle + x.price} className="bg-black/30 rounded p-3 space-y-2">
              <div className="text-sm font-semibold text-white">
                {x.symbol0} / {x.symbol1}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-gray-500">{x.symbol0}</div>
                  <div className="text-gray-600 truncate">{x.token0.address}</div>
                </div>
                <div>
                  <div className="text-gray-500">{x.symbol1}</div>
                  <div className="text-gray-600 truncate">{x.token1.address}</div>
                </div>
              </div>
              <div className="text-xs text-gray-500">Price: {strToDecimal(x.price)}</div>
            </div>
          ))}
        </div>
      ) : (
        // Transaction preview
        txPreview?.action && (
          <div className="rounded-lg bg-black/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Droplets className="h-4 w-4 text-orange-400" />
              <h2 className="text-sm font-semibold text-orange-400">
                {txPreview?.action?.toUpperCase()}
              </h2>
            </div>

            <div className="bg-black/30 rounded p-3 space-y-2">
              <div className="text-xs text-gray-500 mb-2">{txPreview?.pairHandle}</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-gray-500">Token 0</div>
                  <div className="text-lg font-bold text-white">{txPreview?.token0Amount}</div>
                  <div className="text-sm text-orange-400">
                    {txPreview?.token0Symbol?.toUpperCase()}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Token 1</div>
                  <div className="text-lg font-bold text-white">{txPreview?.token1Amount}</div>
                  <div className="text-sm text-orange-400">
                    {txPreview?.token1Symbol?.toUpperCase()}
                  </div>
                </div>
              </div>
              {(txPreview?.priceFrom || txPreview?.priceTo) && (
                <div className="text-xs text-gray-600">
                  Range: {txPreview?.priceFrom} → {txPreview?.priceTo}
                </div>
              )}
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

              {!positions && txPlan && txPreview && isConnected ? (
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
                !positions &&
                txPlan &&
                txPreview && (
                  <div className="text-xs text-red-400 text-center py-2">
                    <ConnectButton />
                  </div>
                )
              )}
            </div>
          </div>
        )
      )}
    </>
  );
}

"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTransactionExecutor } from "../hooks/useTransactionExecutor";
import type { TxPlan } from "../lib/transactionUtils";
import { strToDecimal } from "@/lib/utils";

// Removed: useState, viem imports, useSendTransaction
// Removed: getChainById, withSafeDefaults, toBigInt, signTx
// Removed: All local state related to approvals and transaction execution

// Keep existing interface if specific to Liquidity preview/positions
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
  txPreview: any; // TODO: Define LiquidityTxPreview type
  pools: IPool[] | null;
}) {
  console.log("[Liquidity Component] Received txPreview:", txPreview);
  console.log("[Liquidity Component] Received txPlan:", txPlan);
  console.log("[Liquidity Component] Received positions:", positions);

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
          {/* Position Display Logic (remains unchanged) */}
          {positions ? (
            <div className="flex flex-col gap-2 p-8 bg-transparent shadow-md rounded-2xl text-white border-red-200 border-2">
              <h2 className="text-lg font-semibold mb-4">
                Liquidity Positions
              </h2>
              {positions?.map((x) => (
                <div
                  key={x.tokenId + x.poolAddress}
                  className="rounded-xl bg-zinc-700 p-4 flex flex-col gap-2"
                >
                  <span className="font-normal flex gap-3 w-full items-center text-sm">
                    {x.tokenId}{" "}
                    <span className="text-xs text-gray-400">
                      {x.symbol0?.toUpperCase()} / {x.symbol1?.toUpperCase()}
                    </span>
                  </span>

                  <p className="font-normal w-full bg-zinc-600 rounded-full p-5 px-8 ">
                    <span className="font-normal text-sm flex flex-col">
                      <span className="font-semibold w-full text-xl">
                        {x.amount0} {x.amount0 && x.symbol0?.toUpperCase()}
                      </span>
                      <span>
                        {" (on "}
                        {x.providerId?.toUpperCase()}
                        {")"}
                      </span>
                    </span>
                  </p>
                  <p className="font-normal w-full bg-zinc-600 rounded-full p-5 px-8 ">
                    <span className="font-normal text-sm flex flex-col">
                      <span className="font-semibold w-full text-xl">
                        {x.amount1} {x.amount1 && x.symbol1?.toUpperCase()}
                      </span>
                      <span>
                        {" (on "}
                        {x.providerId?.toUpperCase()}
                        {")"}
                      </span>
                    </span>
                  </p>
                  <span className="font-normal flex flex-col gap-3 w-full items-center text-sm">
                    <span className="text-md text-gray-400">
                      Price: {x.price}
                    </span>
                    <span className="font-normal  text-sm">
                      Pool: {x.poolAddress}{" "}
                    </span>
                  </span>
                  <p className="font-normal w-full bg-zinc-600 rounded-full p-2 px-4 my-0">
                    <span className="font-normal  text-sm">
                      {`Position Range from ${strToDecimal(
                        x.positionRange.fromPrice
                      )} to ${strToDecimal(x.positionRange.toPrice)}`}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          ) : pools ? (
            <div className="flex flex-col gap-2 p-8 bg-transparent shadow-md rounded-2xl text-white border-red-200 border-2">
              <h2 className="text-lg font-semibold mb-4">Liquidity Pools</h2>
              {pools?.map((x) => (
                <div
                  key={x.handle + x.price}
                  className="rounded-xl bg-zinc-700 p-4 flex flex-col gap-2"
                >
                  <span className="font-normal flex gap-3 w-full items-center text-sm">
                    <span className="text-xs text-gray-400">{x.handle}</span>
                  </span>

                  <p className="font-normal w-full bg-zinc-600 rounded-full p-2 px-4 my-0 flex flex-col">
                    <span className="font-semibold text-sm w-full ">
                      {x.symbol0}
                      {" on "}
                      {x.token0.chainId}{" "}
                    </span>
                    <span className="font-normal text-sm w-full">
                      {x.token0.address}{" "}
                    </span>
                  </p>

                  <p className="font-normal w-full bg-zinc-600 rounded-full p-2 px-4 my-0 flex flex-col">
                    <span className="font-semibold text-sm w-full">
                      {x.symbol1}
                      {" on "}
                      {x.token1.chainId}{" "}
                    </span>
                    <span className="font-normal text-sm w-full">
                      {x.token1.address}{" "}
                    </span>
                  </p>
                  <span className="font-normal flex gap-3 w-full items-center text-sm">
                    <span className="text-md text-gray-400">
                      Price: {strToDecimal(x.price)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            /* Transaction Preview & Execution Logic */
            txPreview?.action && (
              <div className="flex flex-col gap-2 p-8 bg-transparent shadow-md rounded-2xl text-white border-red-200 border-2">
                <h2 className="text-lg font-semibold mb-4">
                  Liquidity Provision
                </h2>
                <div className="rounded-xl bg-zinc-700 p-4 flex flex-col gap-2">
                  <span className="font-normal flex gap-3 w-full items-center text-sm">
                    {txPreview?.action?.toUpperCase()}{" "}
                    <span className="text-xs text-gray-400">
                      {txPreview?.pairHandle}
                    </span>
                  </span>

                  <p className="font-normal w-full bg-zinc-600 rounded-full p-5 px-8 ">
                    <span className="font-normal text-sm flex flex-col">
                      <span className="font-semibold w-full text-xl">
                        {txPreview?.token0Amount}{" "}
                        {txPreview?.token0Amount &&
                          txPreview?.token0Symbol?.toUpperCase()}
                      </span>
                    </span>
                  </p>
                  <p className="font-normal w-full bg-zinc-600 rounded-full p-5 px-8 ">
                    <span className="font-normal text-sm flex flex-col">
                      <span className="font-semibold w-full text-xl">
                        {txPreview?.token1Amount}{" "}
                        {txPreview?.token1Amount &&
                          txPreview?.token1Symbol?.toUpperCase()}
                      </span>
                    </span>
                  </p>
                  <span className="font-normal flex gap-3 w-full items-center text-sm">
                    <span className="text-md text-gray-400">
                      Price: {txPreview?.priceFrom} {" - "} {txPreview?.priceTo}
                    </span>
                  </span>
                </div>

                {/* Transaction Execution UI (uses hook state) */}
                {!positions && txPlan && txPreview && isConnected ? (
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
                            ? `Approving ${
                                approvalIndex + 1
                              }/${totalApprovals}...`
                            : isApprovalPhaseComplete
                            ? "All Approved"
                            : `Approve ${approvalIndex + 1}/${totalApprovals}`}
                        </button>
                      )}
                      <button
                        className="mt-4 bg-orange-500 text-white py-2 px-4 rounded-full disabled:opacity-50"
                        type="button"
                        onClick={executeMain} // Use hook action
                        disabled={!canExecute || false} // Use hook state (extra || false is harmless but redundant)
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
                  /* Wallet Not Connected Section */
                  !positions &&
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
            )
          )}
        </div>
      }
    </>
  );
}

// Removed toBigInt function

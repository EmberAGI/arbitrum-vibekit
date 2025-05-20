"use client";

import { useState } from "react";
import {
  createPublicClient,
  http,
  parseUnits,
  type Hex,
  type Chain,
  BaseError,
  ExecutionRevertedError,
} from "viem";
import { useAccount, useSendTransaction, useSwitchChain } from "wagmi";
// Import all chains from viem/chains - BEWARE of bundle size impact!
import * as allViemChains from "viem/chains";
import { FromIcon, ToIcon } from "./icons";
import { ConnectButton } from "@rainbow-me/rainbowkit";

// === global tuning parameters ===
const GAS_LIMIT_BUFFER_PCT = 120n; // 120% → +20%
const LEGACY_GAS_PRICE_BUFFER_PCT = 120n; // 120% → +20%
const DEFAULT_PRIORITY_FEE_GWEI = "1.5"; // 1.5 gwei

// --- Helper to get viem chain object from ID ---
// Note: This imports all chains from viem, potentially increasing bundle size.
// Consider manually importing only supported chains if bundle size is critical.
function getChainById(chainId: number): Chain | undefined {
  // Convert the imported chains object into an array of Chain objects
  const chainsArray = Object.values(allViemChains);
  // Find the chain where the id matches the requested chainId
  return chainsArray.find((chain) => chain.id === chainId);
}

/**
 * Given a bare tx and chainId, returns gas overrides with safe defaults
 */
async function withSafeDefaults(
  chainId: number,
  tx: { to: Hex; data: Hex; value?: bigint },
  fromAddress?: Hex
) {
  console.log("[withSafeDefaults] Received chainId:", chainId);
  console.log("[withSafeDefaults] Received tx:", tx);
  console.log("[withSafeDefaults] Received fromAddress:", fromAddress);

  const chain = getChainById(chainId);
  if (!chain) {
    console.error(`[withSafeDefaults] Chain with ID ${chainId} not found.`);
    throw new Error(`Unsupported or unknown chainId: ${chainId}`);
  }
  console.log("[withSafeDefaults] Found chain:", chain.name);

  const client = createPublicClient({
    chain: chain,
    transport: http(),
  });

  // Prepare arguments for estimateGas, including 'account' if available
  const estimateArgs = {
    ...tx,
    ...(fromAddress ? { account: fromAddress } : {}),
  };
  console.log(
    "[withSafeDefaults] Preparing to estimate gas with args:",
    estimateArgs
  );

  let estimatedGas: bigint;
  try {
    estimatedGas = await client.estimateGas(estimateArgs);
    console.log("[withSafeDefaults] Estimated gas:", estimatedGas.toString());
  } catch (error: unknown) {
    console.error("[withSafeDefaults] Error during client.estimateGas:", error);
    // Log more details if it's a viem error
    if (error instanceof BaseError) {
      console.error(
        "[withSafeDefaults] Viem BaseError Details:",
        error.details
      );
      console.error(
        "[withSafeDefaults] Viem BaseError Short Message:",
        error.shortMessage
      );
      // Specifically check for ExecutionRevertedError
      const cause = error.walk((e) => e instanceof ExecutionRevertedError);
      if (cause instanceof ExecutionRevertedError) {
        console.error(
          "[withSafeDefaults] ExecutionRevertedError Details:",
          cause.details
        );
      }
    } else if (error instanceof Error) {
      console.error(
        "[withSafeDefaults] Standard Error message:",
        error.message
      );
      console.error("[withSafeDefaults] Standard Error stack:", error.stack);
    } else {
      console.error("[withSafeDefaults] Unknown error type during estimateGas");
    }
    // Re-throw the error to be caught by the calling function (signTx)
    throw error;
  }

  const gasLimit = (estimatedGas * GAS_LIMIT_BUFFER_PCT) / 100n;
  console.log(
    "[withSafeDefaults] Calculated gasLimit (with buffer):",
    gasLimit.toString()
  );

  const block = await client.getBlock({ blockTag: "latest" });
  console.log(
    "[withSafeDefaults] Fetched latest block number:",
    block.number?.toString()
  );
  console.log(
    "[withSafeDefaults] Fetched latest block baseFeePerGas:",
    block.baseFeePerGas?.toString()
  );

  // Check for EIP-1559 support correctly based on block base fee
  if (block.baseFeePerGas !== null && block.baseFeePerGas !== undefined) {
    // EIP-1559 chain
    const baseFee = block.baseFeePerGas;
    const priority = parseUnits(DEFAULT_PRIORITY_FEE_GWEI, 9);
    // Ensure baseFee isn't extremely low, add buffer logic if necessary
    const maxFee = baseFee * 2n + priority; // Common strategy: 2 * base + priority
    const overrides = {
      gas: gasLimit,
      maxPriorityFeePerGas: priority,
      maxFeePerGas: maxFee,
    };
    console.log("[withSafeDefaults] EIP-1559 Overrides:", overrides);
    return overrides;
  } else {
    // Legacy chain (or chain where baseFeePerGas is null)
    const gasPrice = await client.getGasPrice();
    console.log(
      "[withSafeDefaults] Fetched legacy gasPrice:",
      gasPrice.toString()
    );
    const bufferedGasPrice = (gasPrice * LEGACY_GAS_PRICE_BUFFER_PCT) / 100n;
    const overrides = {
      gas: gasLimit,
      gasPrice: bufferedGasPrice,
    };
    console.log("[withSafeDefaults] Legacy Overrides:", overrides);
    return overrides;
  }
}

interface IPosition {
  tokenId: string;
  providerId: string;
  symbol0: string;
  symbol1: string;
  amount0: string;
  amount1: string;
  price: string;
}

export function Liquidity({
  positions,
  txPreview,
  txPlan,
}: {
  positions: IPosition[] | null;
  txPlan: any[] | null;
  txPreview: any;
}) {
  console.log("[Transaction Component] Received txPreview:", txPreview);
  console.log("[Transaction Component] Received txPlan:", txPlan);
  const {
    data: txResultData,
    error: txError,
    isPending: isTxPending,
    isSuccess: isTxSuccess,
    sendTransactionAsync,
  } = useSendTransaction();
  // Get current chainId AND address from useAccount
  const { address, isConnected, chainId: currentChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  // State for tracking approval transaction
  const [isApprovalPending, setIsApprovalPending] = useState(false);
  const [isApprovalSuccess, setIsApprovalSuccess] = useState(false);
  const [approvalError, setApprovalError] = useState<Error | null>(null);

  // Determine if an approval step is needed
  const needsApproval = txPlan && txPlan.length > 1;

  async function signTx(
    transaction: any,
    requiredChainId: number,
    isApprovalTx: boolean = false
  ) {
    console.log(
      `[signTx] Initiated. Is approval: ${isApprovalTx}, Required ChainId: ${requiredChainId}`,
      transaction
    );
    if (
      !transaction.to ||
      !isConnected ||
      !currentChainId ||
      !switchChainAsync ||
      !address
    ) {
      console.error("[signTx] Prerequisites not met:", {
        isConnected,
        currentChainId,
        switchChainAvailable: !!switchChainAsync,
        addressAvailable: !!address,
        transactionTo: transaction.to,
      });
      if (isApprovalTx)
        setApprovalError(
          new Error("Wallet not connected or chain/address invalid.")
        );
      if (isApprovalTx) setIsApprovalPending(false);
      return;
    }

    console.log(
      `[signTx] User Address: ${address}, Current ChainID: ${currentChainId}, Required ChainID (from arg): ${requiredChainId}`
    );

    if (isApprovalTx) {
      console.log("[signTx] Setting approval state to pending.");
      setIsApprovalPending(true);
      setApprovalError(null);
      setIsApprovalSuccess(false);
    } else {
      console.log(
        "[signTx] Main transaction process starting (pending state handled by hook)."
      );
    }

    try {
      if (currentChainId !== requiredChainId) {
        console.log(
          `[signTx] Switching network from ${currentChainId} to ${requiredChainId}`
        );
        await switchChainAsync({ chainId: requiredChainId });
        console.log(
          `[signTx] Network switch to ${requiredChainId} request successful. Waiting for wallet confirmation and state update...`
        );
      } else {
        console.log(
          `[signTx] Already connected to the required chain: ${requiredChainId}`
        );
      }

      const txBase = {
        to: transaction.to as Hex,
        data: transaction.data as Hex,
        value: toBigInt(transaction.value),
      };
      console.log("[signTx] Prepared base transaction:", txBase);

      console.log(
        `[signTx] Calling withSafeDefaults for ${
          isApprovalTx ? "approval" : "main"
        } tx on chain ${requiredChainId}...`
      );
      const overrides = await withSafeDefaults(
        requiredChainId,
        txBase,
        address
      );
      console.log(
        `[signTx] Received gas overrides from withSafeDefaults for chain ${requiredChainId}:`,
        overrides
      );

      const finalTx = {
        ...txBase,
        ...overrides,
      };
      console.log(
        `[signTx] Prepared final transaction object for ${
          isApprovalTx ? "approval" : "main"
        } tx:`,
        finalTx
      );

      console.log(
        `[signTx] Calling sendTransactionAsync for ${
          isApprovalTx ? "approval" : "main"
        } tx...`
      );
      await sendTransactionAsync(finalTx);
      console.log(
        `[signTx] sendTransactionAsync call completed successfully for ${
          isApprovalTx ? "approval" : "main"
        } tx.`
      );

      if (isApprovalTx) {
        console.log("[signTx] Setting approval state to success.");
        setIsApprovalSuccess(true);
      } else {
        console.log(
          "[signTx] Main transaction sent (success state handled by hook)."
        );
      }
    } catch (err: any) {
      console.error(
        `[signTx] Error during ${
          isApprovalTx ? "approval" : "main"
        } transaction processing:`,
        err
      );
      if (err.code === 4001) {
        console.log(
          "[signTx] User rejected the network switch or transaction signature."
        );
      } else if (err instanceof BaseError) {
        console.error("[signTx] Viem BaseError Details:", err.details);
        console.error(
          "[signTx] Viem BaseError Short Message:",
          err.shortMessage
        );
        const cause = err.walk((e) => e instanceof ExecutionRevertedError);
        if (cause instanceof ExecutionRevertedError) {
          console.error(
            "[signTx] ExecutionRevertedError detected in signTx catch block. Details:",
            cause.details
          );
        }
      } else if (err instanceof Error) {
        console.error("[signTx] Standard Error message:", err.message);
        console.error("[signTx] Standard Error stack:", err.stack);
      } else {
        console.error("[signTx] Unknown error type caught in signTx.");
      }

      if (isApprovalTx) {
        console.log("[signTx] Setting approval error state.");
        setApprovalError(err);
        setIsApprovalSuccess(false);
      }
    } finally {
      if (isApprovalTx) {
        console.log(
          "[signTx] Resetting approval pending state in finally block."
        );
        setIsApprovalPending(false);
      }
    }
  }

  const signMainTransaction = () => {
    const transaction = txPlan?.[txPlan.length - 1];
    // Check if the transaction and its chainId exist
    if (!transaction?.chainId) {
      console.error(
        "[signMainTransaction] Final transaction or its chainId missing in txPlan."
      );
      // Potentially set an error state here if needed
      return;
    }
    if (needsApproval && !isApprovalSuccess) {
      console.warn(
        "[signMainTransaction] Approval step not completed successfully. Preventing execution."
      );
      return;
    }
    console.log("[signMainTransaction] Proceeding to sign main transaction.");
    // Use chainId from the transaction object
    const parsedChainId = Number.parseInt(transaction.chainId);
    if (Number.isNaN(parsedChainId)) {
      console.error(
        "[signMainTransaction] Invalid chainId in transaction:",
        transaction.chainId
      );
      setApprovalError(
        // Use setApprovalError or a more general error state if appropriate
        new Error(`Invalid chainId in transaction plan: ${transaction.chainId}`)
      );
      return;
    }
    signTx(transaction, parsedChainId, false);
  };

  const approveTransaction = () => {
    const approvalTransaction = txPlan?.[0];
    // Check if approval is needed and the approval transaction and its chainId exist
    if (!needsApproval || !approvalTransaction?.chainId) {
      console.log(
        "[approveTransaction] No approval step needed or approval transaction/chainId invalid."
      );
      return;
    }
    console.log(
      "[approveTransaction] Proceeding to sign approval transaction."
    );
    // Use chainId from the approval transaction object
    const parsedChainId = Number.parseInt(approvalTransaction.chainId);
    if (Number.isNaN(parsedChainId)) {
      console.error(
        "[approveTransaction] Invalid chainId in approval transaction:",
        approvalTransaction.chainId
      );
      setApprovalError(
        new Error(
          `Invalid chainId in approval transaction plan: ${approvalTransaction.chainId}`
        )
      );
      setIsApprovalPending(false); // Ensure pending state is reset
      return;
    }
    signTx(approvalTransaction, parsedChainId, true);
  };

  const isAnyTxPending = isApprovalPending || isTxPending;

  return (
    <>
      {
        <div className="p-0 m-0">
          <>
            {positions ? (
              <div className="flex flex-col gap-2 p-8 bg-transparent shadow-md rounded-2xl text-white border-red-200 border-2">
                <h2 className="text-lg font-semibold mb-4">
                  Liquidity Positions
                </h2>
                {positions?.map((x) => (
                  <div
                    key={x.tokenId + x.price}
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
                    <span className="font-normal flex gap-3 w-full items-center text-sm">
                      <span className="text-md text-gray-400">
                        Price: {x.price}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
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
                        Price: {txPreview?.priceFrom} {" - "}{" "}
                        {txPreview?.priceTo}
                      </span>
                    </span>
                  </div>
                  {!positions && txPlan && txPreview && isConnected ? (
                    <>
                      {isTxSuccess && (
                        <p className=" p-2 rounded-2xl border-green-800 bg-green-200 w-full border-2 text-green-800">
                          Transaction Successful!
                        </p>
                      )}
                      {isTxPending && (!needsApproval || isApprovalSuccess) && (
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

                      {needsApproval && isApprovalPending && (
                        <p className=" p-2 rounded-2xl border-gray-400 bg-gray-200 w-full border-2 text-slate-800">
                          Processing Approval...
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
                        isApprovalSuccess &&
                        !isTxSuccess &&
                        !isTxPending && (
                          <p className=" p-2 rounded-2xl border-green-800 bg-green-200 w-full border-2 text-green-800">
                            Approval Sent! Ready to execute.
                          </p>
                        )}

                      <div className="flex gap-3">
                        {needsApproval && (
                          <button
                            className="mt-4 bg-orange-500 text-white py-2 px-4 rounded-full disabled:bg-zinc-600 disabled:border-2 disabled:border-red-200 "
                            type="button"
                            onClick={approveTransaction}
                            disabled={isAnyTxPending || isApprovalSuccess}
                          >
                            {isApprovalPending
                              ? "Approving..."
                              : isApprovalSuccess
                              ? "Approved"
                              : "Approve Transaction"}
                          </button>
                        )}
                        <button
                          className="mt-4 bg-orange-500 text-white py-2 px-4 rounded-full disabled:opacity-50"
                          type="button"
                          onClick={signMainTransaction}
                          disabled={
                            isAnyTxPending ||
                            (needsApproval && !isApprovalSuccess) ||
                            false
                          }
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
          </>
        </div>
      }
    </>
  );
}

function toBigInt(
  value: string | number | boolean | bigint | undefined
): bigint | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    if (typeof value === "string" && value.toLowerCase().includes("e")) {
      const parts = value.toLowerCase().split("e");
      if (parts.length === 2) {
        const base = Number.parseFloat(parts[0]);
        const exponent = Number.parseInt(parts[1], 10);
        if (!Number.isNaN(base) && !Number.isNaN(exponent)) {
          return BigInt(Math.round(base * Math.pow(10, exponent)));
        }
      }
    }
    return BigInt(value);
  } catch (e) {
    console.error("[toBigInt] Failed to convert value to BigInt:", value, e);
    return undefined;
  }
}

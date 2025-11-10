"use client";

import React, { useState, useEffect } from "react";
import { baseSepolia } from "wagmi/chains";
import {
  useClient as useParaClient,
  useAccount as useParaAccount,
  useModal,
  useWallet,
} from "@getpara/react-sdk";
import {
  encodeFunctionData,
  parseUnits,
  createPublicClient,
  http as viemHttp,
  serializeTransaction,
} from "viem";
import type { Abi } from "viem";

/**
 * Para-specific USDC Transfer Component for Base Sepolia
 *
 * This component handles USDC transfers using the Para SDK directly.
 */

const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
] as const;

export function UsdcTransfer() {
  const paraAccount = useParaAccount();
  const paraClient = useParaClient();
  const { data: activeWallet } = useWallet();
  const { openModal } = useModal();

  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [usdcBalance, setUsdcBalance] = useState<bigint | undefined>(undefined);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const isConnected = Boolean(paraAccount?.isConnected);
  const address = activeWallet?.address as `0x${string}` | undefined;

  const fetchBalance = async () => {
    if (!address || !paraClient) return;

    try {
      setLoadingBalance(true);
      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: viemHttp(
          process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ||
            "https://sepolia.base.org",
        ),
      });

      const balance = await publicClient.readContract({
        address: USDC_BASE_SEPOLIA as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
      });

      setUsdcBalance(balance as bigint);
    } catch (err) {
      console.error("Balance fetch error:", err);
    } finally {
      setLoadingBalance(false);
    }
  };

  useEffect(() => {
    if (address && paraClient) {
      fetchBalance();
    }
  }, [address, activeWallet, paraClient]);

  const handleSend = async (recipient: string, amount: string) => {
    if (!paraClient || !activeWallet) throw new Error("Para client not ready");

    setIsPending(true);
    setIsSuccess(false);
    setError(null);

    try {
      const value = parseUnits(amount, 6);
      const data = encodeFunctionData({
        abi: [
          {
            name: "transfer",
            type: "function",
            stateMutability: "nonpayable",
            inputs: [
              { name: "_to", type: "address" },
              { name: "_value", type: "uint256" },
            ],
            outputs: [{ name: "", type: "bool" }],
          },
        ] as unknown as Abi,
        functionName: "transfer",
        args: [recipient as `0x${string}`, value],
      });

      // Para wallets support EVM by default - use the active wallet directly
      if (!activeWallet || !address) {
        throw new Error(
          "No wallet connected. Please connect your Para wallet.",
        );
      }

      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: viemHttp(
          process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ||
            "https://sepolia.base.org",
        ),
      });

      const nonce = await publicClient.getTransactionCount({ address });
      const gasPrice = await publicClient.getGasPrice();
      const gasLimit = await publicClient.estimateGas({
        account: address,
        to: USDC_BASE_SEPOLIA as `0x${string}`,
        data,
        value: BigInt(0),
      });

      const serialized = serializeTransaction({
        to: USDC_BASE_SEPOLIA as `0x${string}`,
        data,
        value: BigInt(0),
        nonce,
        gasPrice,
        gas: gasLimit,
        chainId: baseSepolia.id,
      });

      const rlpEncodedTxBase64 = Buffer.from(
        serialized.slice(2),
        "hex",
      ).toString("base64");

      const result = await paraClient.signTransaction({
        walletId: (activeWallet as unknown as Record<string, unknown>)
          .id as string,
        rlpEncodedTxBase64,
        chainId: baseSepolia.id.toString(),
      });

      const signedTx = (result as unknown as Record<string, unknown>)
        .signedTransaction as `0x${string}`;
      const hash = await publicClient.sendRawTransaction({
        serializedTransaction: signedTx,
      });

      setTxHash(hash);
      setIsSuccess(true);
      setTimeout(() => fetchBalance(), 2000);
    } catch (err) {
      console.error("Transfer error:", err);
      setError(err as Error);
      throw err;
    } finally {
      setIsPending(false);
    }
  };

  const [recipient, setRecipient] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [localError, setLocalError] = React.useState<string | null>(null);

  const formatUsdc = (bal: bigint | undefined) => {
    if (!bal) return "0.00";
    return (Number(bal) / 1e6).toFixed(2);
  };

  const handleSendClick = async () => {
    setLocalError(null);

    if (!isConnected) {
      setLocalError("Please connect your wallet");
      return;
    }

    if (!recipient || !/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
      setLocalError("Enter a valid recipient address");
      return;
    }

    const numAmount = parseFloat(amount || "0");
    if (isNaN(numAmount) || numAmount <= 0) {
      setLocalError("Enter a valid amount greater than 0");
      return;
    }

    try {
      await handleSend(recipient, amount);
      setAmount("");
      setRecipient("");
    } catch (e) {
      console.error("USDC transfer error:", e);
      setLocalError((e as Error).message || "Failed to send");
    }
  };

  return (
    <div className="mt-8 p-4 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
      <div className="flex items-center justify-between mb-2">
        <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          USDC Transfer (Base Sepolia)
        </div>
        <div className="text-xs text-gray-600 dark:text-gray-300">
          {loadingBalance ? (
            <span>Loading balance…</span>
          ) : (
            <span>Balance: {formatUsdc(usdcBalance)} USDC</span>
          )}
          <button
            type="button"
            onClick={fetchBalance}
            className="ml-2 text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-gray-600 dark:text-gray-300">
            Recipient Address
          </label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="0x…"
            className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-600 dark:text-gray-300">
            Amount (USDC)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || /^\d*\.?\d*$/.test(v)) setAmount(v);
            }}
            placeholder="0.00"
            className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
      </div>

      {localError && (
        <div className="mt-3 p-2 rounded border border-red-700 bg-red-100 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
          {localError}
        </div>
      )}
      {error && (
        <div className="mt-3 p-2 rounded border border-red-700 bg-red-100 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 break-words">
          Error: {(error as Error)?.message || JSON.stringify(error)}
        </div>
      )}
      {isSuccess && txHash && (
        <div className="mt-3 p-2 rounded border border-green-800 bg-green-100 dark:bg-green-900/20 text-sm text-green-800 dark:text-green-300 break-words">
          Sent! Tx: {String(txHash ?? "")}
        </div>
      )}

      <button
        type="button"
        onClick={isConnected ? handleSendClick : () => openModal()}
        disabled={isPending}
        className="w-full mt-4 px-4 py-2 rounded bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {!isConnected
          ? "Connect Para Wallet"
          : isPending
            ? "Sending…"
            : isSuccess
              ? "Sent"
              : "Send USDC"}
      </button>
    </div>
  );
}

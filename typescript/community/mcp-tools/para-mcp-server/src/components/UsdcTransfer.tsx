"use client";

import { useClient, useAccount as useParaAccount } from "@getpara/react-sdk";
import {
  createParaAccount,
  createParaViemClient,
} from "@getpara/viem-v2-integration";
import axios from "axios";
import React, { useEffect, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  isAddress,
  http as viemHttp,
} from "viem";
import { useWalletClient } from "wagmi";
import { baseSepolia } from "wagmi/chains";
// @ts-expect-error - x402-axios has dual package exports which may cause TS resolution issues
import { withPaymentInterceptor } from "x402-axios";

/**
 * USDC Transfer Component for Base Sepolia
 *
 * This component handles GASLESS USDC transfers using Para SDK with x402 payment interceptor.
 * Para's viem client signs payment authorizations, and x402 handles gasless execution via API.
 * Note: Payment authorization signing has a 30-second timeout (Para SDK default for message signing).
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

interface UsdcTransferProps {
  address?: string;
  isConnected: boolean;
}

export function UsdcTransfer({ address, isConnected }: UsdcTransferProps) {
  const paraClient = useClient();
  const paraAccount = useParaAccount();
  const { data: walletClient } = useWalletClient(); // For external wallets (Rainbow, MetaMask, etc.)

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [usdcBal, setUsdcBal] = useState<bigint | undefined>(undefined);
  const [loadingBal, setLoadingBal] = useState(false);

  // Fetch USDC balance on Base Sepolia for connected user
  const fetchBalance = async () => {
    if (!address) return;

    try {
      setLoadingBal(true);
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
        args: [address as `0x${string}`],
      });

      setUsdcBal(balance as bigint);
    } catch (err) {
      console.error("Balance fetch error:", err);
    } finally {
      setLoadingBal(false);
    }
  };

  // Fetch balance when address changes or user connects
  useEffect(() => {
    if (address && isConnected) {
      fetchBalance();
    }
  }, [address, isConnected]);

  const formatUsdc = (bal: bigint | undefined) => {
    if (!bal) return "0.00";
    return (Number(bal) / 1e6).toFixed(2);
  };

  const handleSend = async () => {
    setLocalError(null);
    setIsSuccess(false);
    setTxHash(null);

    if (!isConnected || !address) {
      setLocalError("Please connect your wallet");
      return;
    }

    if (!paraClient) {
      setLocalError("Para client not ready");
      return;
    }

    if (!recipient || !isAddress(recipient)) {
      setLocalError("Enter a valid recipient address");
      return;
    }

    const amountFloat = parseFloat(amount || "0");
    if (isNaN(amountFloat) || amountFloat <= 0) {
      setLocalError("Enter a valid amount");
      return;
    }

    setIsPending(true);

    try {
      let signingClient: any;

      // Check if external EVM wallet is connected via Para
      const isExternalWallet = paraAccount?.external?.evm?.isConnected;

      if (
        isExternalWallet &&
        typeof window !== "undefined" &&
        (window as any).ethereum
      ) {
        console.log(
          "[UsdcTransfer] Using external wallet (via window.ethereum) with x402-axios",
        );
        console.log(
          "[UsdcTransfer] External wallet address:",
          paraAccount?.external?.evm?.address,
        );

        // Check current chain and switch to Base Sepolia if needed
        const ethereum = (window as any).ethereum;
        const currentChainId = await ethereum.request({
          method: "eth_chainId",
        });
        const targetChainId = `0x${baseSepolia.id.toString(16)}`; // Base Sepolia chain ID in hex

        if (currentChainId !== targetChainId) {
          console.log(
            `[UsdcTransfer] Chain mismatch. Current: ${currentChainId}, Expected: ${targetChainId}`,
          );
          try {
            // Try to switch to Base Sepolia
            await ethereum.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: targetChainId }],
            });
            console.log("[UsdcTransfer] Switched to Base Sepolia");
          } catch (switchError: any) {
            // Chain not added to wallet, try to add it
            if (switchError.code === 4902) {
              await ethereum.request({
                method: "wallet_addEthereumChain",
                params: [
                  {
                    chainId: targetChainId,
                    chainName: "Base Sepolia",
                    nativeCurrency: {
                      name: "Ether",
                      symbol: "ETH",
                      decimals: 18,
                    },
                    rpcUrls: ["https://sepolia.base.org"],
                    blockExplorerUrls: ["https://sepolia.basescan.org"],
                  },
                ],
              });
              console.log("[UsdcTransfer] Added and switched to Base Sepolia");
            } else {
              throw switchError;
            }
          }
        }

        // Create viem wallet client from window.ethereum provider
        signingClient = createWalletClient({
          account: address as `0x${string}`,
          chain: baseSepolia,
          transport: custom(ethereum),
        });
      } else if (walletClient) {
        // Fallback to wagmi wallet client if available
        console.log("[UsdcTransfer] Using wagmi wallet client with x402-axios");
        console.log(
          "[UsdcTransfer] Chain:",
          walletClient.chain?.id,
          walletClient.chain?.name,
        );
        console.log("[UsdcTransfer] Account:", walletClient.account?.address);
        signingClient = walletClient;
      } else if (paraClient) {
        console.log(
          "[UsdcTransfer] Using Para embedded wallet client with x402-axios",
        );
        // Create Para's viem wallet client for signing (embedded wallets only)
        const viemAccount = createParaAccount(paraClient);
        signingClient = createParaViemClient(paraClient, {
          account: viemAccount,
          chain: baseSepolia,
          transport: viemHttp(
            process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ||
              "https://sepolia.base.org",
          ),
        });
        console.log("[UsdcTransfer] Account:", address);
      } else {
        throw new Error("No wallet client available");
      }

      // Create axios instance with x402 payment interceptor
      // This automatically handles: 402 response -> sign payment -> retry with X-Payment header
      const axiosInstance = withPaymentInterceptor(
        axios.create(),
        signingClient as any,
      );

      // Make request - x402 interceptor handles payment flow automatically
      const response = await axiosInstance.post("/api/usdc-pay", {
        to: recipient,
        amount: amount,
      });

      // Payment successful
      setIsSuccess(true);
      if (response.data?.transaction) {
        setTxHash(response.data.transaction);
      }

      // Reset form
      setAmount("");
      setRecipient("");

      // Refresh balance after gasless transaction
      setTimeout(() => fetchBalance(), 2000);
    } catch (err) {
      console.error("USDC transfer error:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { error?: string } } })?.response
              ?.data?.error ||
            (err as { message?: string })?.message ||
            "Failed to process gasless transfer";

      // Check if it's a timeout error
      if (
        errorMessage.toLowerCase().includes("timeout") ||
        errorMessage.toLowerCase().includes("timed out")
      ) {
        setLocalError(
          "Payment authorization timed out. Please try again and approve the payment promptly in the Para wallet popup (within 30 seconds).",
        );
      } else {
        setLocalError(errorMessage);
      }
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="mt-8 p-4 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
      <div className="flex items-center justify-between mb-2">
        <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          USDC Transfer (Base Sepolia)
        </div>
        <div className="text-xs text-gray-600 dark:text-gray-300">
          {loadingBal ? (
            <span>Loading balance…</span>
          ) : (
            <span>
              Balance: {formatUsdc(usdcBal as bigint | undefined)} USDC
            </span>
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
            className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
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
            className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      {localError && (
        <div className="mt-3 p-2 rounded border border-red-700 bg-red-100 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 break-words">
          {localError}
        </div>
      )}
      {isSuccess && txHash && (
        <div className="mt-3 p-2 rounded border border-green-800 bg-green-100 dark:bg-green-900/20 text-sm text-green-800 dark:text-green-300 break-words">
          Sent! Tx: {String(txHash ?? "")}
        </div>
      )}

      <button
        type="button"
        onClick={handleSend}
        disabled={isPending || !isConnected}
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
